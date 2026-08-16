// Portable logical restore — counterpart to backup.ts. Loads a JSON snapshot (from
// backup.ts) into DATABASE_URL, one createMany per table inside a single interactive
// transaction with FK checks OFF (session_replication_role=replica) so insertion order
// doesn't need topological sorting. BigInt columns (tgId/ownerTgId) were serialized as
// strings by backup.ts — reversed here via the Prisma DMMF (auto-discovers which columns
// are BigInt, no hardcoded list to keep in sync).
//
// Usage: tsx restore.ts <snapshot.json>
//   ⚠️ Run with a SUPERUSER DATABASE_URL — the `SET session_replication_role = replica` below
//   needs superuser. The app role 'birjoy' is NOT one; on the VPS run as postgres, e.g.
//   `sudo -u postgres env DATABASE_URL=postgres://postgres@localhost:5432/birjoy npx tsx restore.ts …`
// SAFETY: run this ONLY against an empty/target DB — it does not wipe existing rows first
// (skipDuplicates:true means it silently skips rows whose PK already exists).
// After inserting, it re-syncs Postgres sequences (see SEQUENCE FIX) so the restored DB accepts
// new writes; without that step the first insert into each table collides on the PK.
import "../env";
import { readFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";

function bigIntFieldsByModel(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = model.fields.filter((f) => f.type === "BigInt").map((f) => f.name);
    if (fields.length) out[model.name.charAt(0).toLowerCase() + model.name.slice(1)] = fields;
  }
  return out;
}

function coerceRow(row: Record<string, unknown>, bigIntFields: string[]): Record<string, unknown> {
  if (!bigIntFields.length) return row;
  const copy = { ...row };
  for (const f of bigIntFields) {
    if (copy[f] !== null && copy[f] !== undefined) copy[f] = BigInt(copy[f] as string);
  }
  return copy;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx restore.ts <snapshot.json>");
    process.exit(1);
  }
  const snapshot = JSON.parse(readFileSync(file, "utf8")) as { tables: Record<string, Record<string, unknown>[]> };
  const bigIntMap = bigIntFieldsByModel();
  const tableNames = Object.keys(snapshot.tables);
  console.log(`Snapshot: ${tableNames.length} tables, restoring into ${process.env.DATABASE_URL?.split("@")[1]}`);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET session_replication_role = replica");
      let totalInserted = 0;
      for (const name of tableNames) {
        const rows = snapshot.tables[name]!;
        if (!rows.length) continue;
        const model = (tx as unknown as Record<string, { createMany: (args: unknown) => Promise<{ count: number }> }>)[name];
        if (!model?.createMany) {
          console.warn(`  ⚠️  skip unknown model in client: ${name}`);
          continue;
        }
        const coerced = rows.map((r) => coerceRow(r, bigIntMap[name] ?? []));
        const res = await model.createMany({ data: coerced, skipDuplicates: true });
        totalInserted += res.count;
        console.log(`  ${name}: ${res.count}/${rows.length}`);
      }
      await tx.$executeRawUnsafe("SET session_replication_role = DEFAULT");
      console.log(`\n✅ ${totalInserted} rows inserted`);
    },
    { timeout: 10 * 60_000, maxWait: 60_000 },
  );

  // ── SEQUENCE FIX (2026-08-16 audit) — CRITICAL, MUST run after every restore ────────────
  // createMany above inserts rows with their ORIGINAL autoincrement ids, but Postgres identity
  // sequences stay at 1. Without this, the FIRST insert into every restored table collides on
  // the PK (unique_violation) and the recovered DB silently rejects all new writes — i.e. the
  // disaster-recovery path produces a broken DB exactly when it matters. Re-sync each serial
  // sequence to MAX(id). Runs OUTSIDE the transaction (data already committed) so one edge case
  // can't roll back the restore; each setval is guarded so a missing sequence just logs.
  let seqFixed = 0;
  for (const model of Prisma.dmmf.datamodel.models) {
    const idField = model.fields.find(
      (f) =>
        f.isId &&
        f.type === "Int" &&
        !!f.default &&
        typeof f.default === "object" &&
        "name" in f.default &&
        (f.default as { name?: string }).name === "autoincrement",
    );
    if (!idField) continue;
    const table = model.dbName ?? model.name;
    const col = idField.dbName ?? idField.name;
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', '${col}'), GREATEST((SELECT COALESCE(MAX("${col}"), 0) FROM "${table}"), 1))`,
      );
      seqFixed += 1;
    } catch (e) {
      console.warn(`  ⚠️  setval skipped for ${table}.${col}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`✅ sequences re-synced: ${seqFixed}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  await new PrismaClient().$disconnect().catch(() => undefined);
  process.exit(1);
});
