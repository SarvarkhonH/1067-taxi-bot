// 🔑 Driver-session secrets at rest. kas's secretKey authenticates every /api/driverApp/* call
// (no Bearer — just (carNumber, secretKey) in the body). Leaking the DB == impersonating every
// driver, so the key NEVER hits Postgres in plaintext. AES-256-GCM with env-only master key
// (DRIVER_KEY_AES, 32 raw bytes / 64 hex chars). Per-row random IV + auth tag → same secretKey
// encrypts to different ciphertext every time; tampering with the ciphertext throws on decrypt.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "../db";
import { env } from "../env";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce size
const KEY_BYTES = 32;

function loadMasterKey(): Buffer {
  const hex = env.DRIVER_KEY_AES;
  if (!hex) {
    throw new Error(
      "DRIVER_KEY_AES env yo'q — driver-login uchun 32-bayt AES kalit kerak. Lokal: openssl rand -hex 32. Render: secret env qo'shing.",
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== KEY_BYTES * 2) {
    throw new Error(`DRIVER_KEY_AES noto'g'ri shaklda: ${KEY_BYTES * 2} hex bayt kerak (got ${hex.length}).`);
  }
  return Buffer.from(hex, "hex");
}

export interface SealedKey {
  encryptedKey: string; // hex
  keyIv: string; // hex
  keyTag: string; // hex
}

/** Seal a kas secretKey for at-rest storage. Pure function — no DB, throws if env missing. */
export function sealSecretKey(secretKey: string): SealedKey {
  if (!secretKey) throw new Error("sealSecretKey: empty secretKey");
  const key = loadMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(secretKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encryptedKey: enc.toString("hex"), keyIv: iv.toString("hex"), keyTag: tag.toString("hex") };
}

/** Open a previously-sealed secretKey. Throws if env missing, ciphertext tampered, or tag mismatch. */
export function openSecretKey(sealed: SealedKey): string {
  const key = loadMasterKey();
  const iv = Buffer.from(sealed.keyIv, "hex");
  const tag = Buffer.from(sealed.keyTag, "hex");
  const ct = Buffer.from(sealed.encryptedKey, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out.toString("utf8");
}

/** Persist a driver session: encrypt the secretKey + upsert. Replaces any prior session for this
 *  member (re-login overwrites). Also rotates the IV/tag every time → no static-IV reuse. */
export async function saveDriverSession(memberId: number, carNumber: string, secretKey: string): Promise<void> {
  const car = carNumber.replace(/\s/g, "").toUpperCase();
  if (!car) throw new Error("saveDriverSession: empty carNumber");
  const sealed = sealSecretKey(secretKey);
  await prisma.driverSession.upsert({
    where: { memberId },
    create: { memberId, carNumber: car, ...sealed, lastLoginAt: new Date(), revokedAt: null },
    update: { carNumber: car, ...sealed, lastLoginAt: new Date(), revokedAt: null },
  });
}

/** Look up + decrypt a driver session. Returns null if missing or revoked. */
export async function getDriverSession(memberId: number): Promise<{ carNumber: string; secretKey: string } | null> {
  const row = await prisma.driverSession.findUnique({ where: { memberId } });
  if (!row || row.revokedAt) return null;
  try {
    const secretKey = openSecretKey({ encryptedKey: row.encryptedKey, keyIv: row.keyIv, keyTag: row.keyTag });
    return { carNumber: row.carNumber, secretKey };
  } catch {
    // Corrupted ciphertext or tag mismatch (key rotated, manual DB edit, etc.) → treat as gone.
    return null;
  }
}

/** Soft-revoke: keeps the row for audit, blocks getDriverSession from returning it. */
export async function revokeDriverSession(memberId: number): Promise<void> {
  await prisma.driverSession.updateMany({ where: { memberId, revokedAt: null }, data: { revokedAt: new Date() } });
}
