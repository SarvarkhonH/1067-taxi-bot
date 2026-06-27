import { PrismaClient } from "@prisma/client";

// Raise the client-side connection pool. `new PrismaClient()` with no config defaults the pool to
// (physical_cpus * 2 + 1) — on a 1-CPU Render instance that's ~3 connections, which exhausts under
// concurrent HTTP + bot + periodic-sweep load and surfaces as "Timed out fetching a new connection
// from the connection pool" (e.g. on syncRun.findFirst). DATABASE_URL points at the Neon POOLER
// (pgBouncer), which multiplexes, so a larger client pool is safe. Idempotent: only adds params the
// URL doesn't already carry. Tunable via PRISMA_POOL / PRISMA_POOL_TIMEOUT.
function pooledUrl(): string | undefined {
  const u = process.env.DATABASE_URL;
  if (!u || u.startsWith("file:")) return undefined; // dev/sqlite or unset → let Prisma read env as-is
  const add: string[] = [];
  if (!/[?&]connection_limit=/.test(u)) add.push(`connection_limit=${process.env.PRISMA_POOL ?? "20"}`);
  if (!/[?&]pool_timeout=/.test(u)) add.push(`pool_timeout=${process.env.PRISMA_POOL_TIMEOUT ?? "20"}`);
  return add.length ? u + (u.includes("?") ? "&" : "?") + add.join("&") : u;
}

const url = pooledUrl();
export const prisma = url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
