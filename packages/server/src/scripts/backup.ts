// Portable logical backup: dumps every table to a timestamped JSON snapshot
// (no pg_dump dependency). Restorable via restore.ts. Run: tsx backup.ts
//
// HARDENING-P0.1 — the disaster-recovery path alongside pg_dump.
//
// The table list USED to be hand-written, one `foo: () => prisma.foo.findMany()`
// line per model, with a guard that refused to run when it drifted from
// schema.prisma. The guard worked exactly as designed and the design was wrong:
// adding a model to the schema broke the nightly backup until someone edited
// this file, and the failure was a line in a log nobody reads. It happened in
// July (`blockEvent`) and again in September (the JAMOA tables `staffNotice`,
// `staffNoticeRead`, `staffGoal`), and between them this layer produced NO
// snapshot for six weeks while pg_dump carried the whole burden alone.
//
// The list is derived now, so a new model is backed up the moment it exists
// and there is nothing left to forget.
import "../env";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { repoRoot } from "../env";

async function main(): Promise<void> {
  const snapshot: Record<string, unknown[]> = {};

  // Two sources on purpose, because each catches what the other cannot.
  //
  // Prisma's own metadata gives the exact delegate name for every model —
  // guessing it by lower-casing the first letter breaks the day someone
  // declares `AIThing`, and a backup is the wrong place to be clever.
  //
  // schema.prisma gives the count that SHOULD exist. If the generated client
  // is behind the schema, dmmf silently knows fewer models and a snapshot
  // taken from it would be short a table without saying so. Comparing the two
  // is what turns that into a refusal.
  const modelNames = Prisma.dmmf.datamodel.models
    .map((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1))
    .sort();

  const schemaPath = resolve(repoRoot, "packages/server/prisma/schema.prisma");
  const declared = new Set(
    [...readFileSync(schemaPath, "utf8").matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!),
  );

  if (declared.size === 0) {
    console.error("❌ no models found in schema.prisma — refusing to write an empty snapshot");
    process.exit(2);
  }
  if (declared.size !== modelNames.length) {
    console.error(
      `❌ schema.prisma declares ${declared.size} models, the generated client knows ${modelNames.length}.`,
    );
    console.error("   Run `prisma generate` — a snapshot now would be missing tables.");
    process.exit(2);
  }
  const schemaModels = modelNames;

  // A delegate has to exist and be callable for every model. If one does not,
  // the client is out of date (`prisma generate` not run) and a snapshot taken
  // now would be silently short a table — the exact failure this file exists
  // to prevent.
  const client = prisma as unknown as Record<string, { findMany?: () => Promise<unknown[]> }>;
  const unusable = schemaModels.filter((m) => typeof client[m]?.findMany !== "function");
  if (unusable.length) {
    console.error("❌ the Prisma client has no delegate for:", unusable);
    console.error("   Run `prisma generate` — the client is behind schema.prisma.");
    process.exit(2);
  }

  let total = 0;
  for (const name of schemaModels) {
    const rows = await client[name]!.findMany!();
    snapshot[name] = rows;
    total += rows.length;
    console.log(`  ${name}: ${rows.length}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(repoRoot, "backups");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `snapshot-${stamp}.json`);
  // BigInt columns (tgId/ownerTgId in xizmatlar-reviews) serialize as strings — a restore must
  // coerce them back per-column from schema.prisma; plain JSON.stringify throws on BigInt.
  const json = JSON.stringify(
    { at: stamp, total, schemaModelCount: schemaModels.length, tables: snapshot },
    (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
    0,
  );
  writeFileSync(file, json);
  console.log(`\n✅ ${total} rows across ${schemaModels.length} tables → ${file}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
