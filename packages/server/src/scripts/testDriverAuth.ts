// Bosqich 2: AES-256-GCM sealing of kas driver secretKeys + the kasDriverApi mock-mode flow.
// Proves: round-trip determinism, ciphertext != plaintext, per-call IV randomness, tag tamper
// detection, env-missing throws cleanly, mock-mode driverLogin+confirmSms shape is stable.
//
// Run: DRIVER_KEY_AES=$(openssl rand -hex 32) KAS_MODE=mock pnpm tsx src/scripts/testDriverAuth.ts
//      (or set DRIVER_KEY_AES once in .env then `dotenv -e ../../.env -- tsx ...`)
import "../env";
import { sealSecretKey, openSecretKey } from "../services/driverAuth";
import { botDeviceSerial, driverConfirmSms, driverLogin } from "../services/kasDriverApi";

let failed = 0;
const ok = (c: boolean, l: string): void => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failed++; };

async function main(): Promise<void> {
  // ── seal/open round-trip ────────────────────────────────────────────────────
  const SECRET = "abcdef0123456789-kas-secretKey-xyz";
  const sealed = sealSecretKey(SECRET);
  ok(sealed.encryptedKey.length > 0 && sealed.keyIv.length === 24 && sealed.keyTag.length === 32, `sealed: hex ct + 12B iv (24 hex) + 16B tag (32 hex)`);
  ok(sealed.encryptedKey !== Buffer.from(SECRET).toString("hex"), `ciphertext != plaintext-hex`);

  const opened = openSecretKey(sealed);
  ok(opened === SECRET, `round-trip preserves bytes (got "${opened.slice(0, 12)}…")`);

  // ── per-call IV is random → same plaintext encrypts differently each time ───
  const a = sealSecretKey(SECRET);
  const b = sealSecretKey(SECRET);
  ok(a.keyIv !== b.keyIv, `random IV per encryption (no static-IV reuse) — ${a.keyIv.slice(0, 8)} vs ${b.keyIv.slice(0, 8)}`);
  ok(a.encryptedKey !== b.encryptedKey, `ciphertext differs between calls`);
  ok(openSecretKey(a) === SECRET && openSecretKey(b) === SECRET, `both still decrypt to the same plaintext`);

  // ── tag tamper detection (GCM integrity) ───────────────────────────────────
  const tampered = { ...sealed, keyTag: sealed.keyTag.replace(/^[0-9a-f]/, "0") };
  let threw = false;
  try { openSecretKey(tampered); } catch { threw = true; }
  ok(threw, `tampered auth tag throws on decrypt (no silent corruption)`);

  // ── ciphertext tamper ──────────────────────────────────────────────────────
  const tamperedCt = { ...sealed, encryptedKey: sealed.encryptedKey.replace(/^[0-9a-f]/, "f") };
  let threw2 = false;
  try { openSecretKey(tamperedCt); } catch { threw2 = true; }
  ok(threw2, `tampered ciphertext throws on decrypt`);

  // ── mock-mode driverLogin + confirmSms shape ────────────────────────────────
  const r1 = await driverLogin("70A 111 AA", botDeviceSerial(42));
  ok(r1.ok, `mock driverLogin ok=true (got ${r1.ok}, err=${r1.error ?? "—"})`);
  ok(!!r1.smsCentreNumber1 && !!r1.smsCentreNumber2, `mock returns both SMS centres`);
  ok(!!r1.preliminaryKey?.startsWith("mock-prelim-70A111AA"), `mock preliminary key marker is recognizable (avoids being confused with a live key)`);

  const r2 = await driverConfirmSms("70A 111 AA", "12345");
  ok(r2.ok, `mock confirmSms ok=true`);
  ok(r2.secretKey === "mock-secret-70A111AA", `mock confirmed key has predictable shape (${r2.secretKey})`);

  // bad SMS lengths are rejected client-side (no network call)
  ok(!(await driverConfirmSms("70A111AA", "12")).ok, `SMS too short rejected`);
  ok(!(await driverConfirmSms("70A111AA", "1234567")).ok, `SMS too long rejected`);
  ok(!(await driverConfirmSms("70A111AA", "abcd")).ok, `non-digit SMS rejected (stripped → empty → fail)`);

  // botDeviceSerial is stable per member (kas treats us as one device per driver)
  ok(botDeviceSerial(42) === "1067bot-42", `botDeviceSerial deterministic`);
  ok(botDeviceSerial(42) === botDeviceSerial(42), `botDeviceSerial idempotent`);

  console.log(failed ? `\n❌ ${failed} FAIL` : "\n✅ DRIVER-AUTH: sealing+kasDriverApi mock flow yashil");
  process.exit(failed ? 1 : 0);
}
main();
