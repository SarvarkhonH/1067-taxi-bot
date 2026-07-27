/**
 * 🔐 `validateContactResponse` gate — Mini App'dagi requestContact yo'lining XAVFSIZLIK yadrosi.
 *
 * Nega alohida test: bu funksiya "bu raqam rostdan ham Telegram tasdiqlaganmi?" degan yagona
 * savolga javob beradi. U yolg'on "ha" desa — istalgan mijoz begona raqamni yuborib o'zganing
 * hisobiga ulanib olardi. Shuning uchun IJOBIY holat ham, HAR BIR rad holati ham sinaladi.
 *
 * DB'ga TEGMAYDI (faqat crypto) — CLAUDE.md'ning "sweep testlari app DB'da yurmasin" qoidasi
 * bu yerda umuman qo'zg'almaydi; bot tokeni ham soxta.
 * Ishga tushirish: `pnpm -C packages/server exec tsx src/scripts/testContactAuth.ts`
 */
import crypto from "node:crypto";
import { validateContactResponse } from "../api/telegramAuth";

const TOKEN = "123456:TEST-BOT-TOKEN-FOR-SIGNATURE-ONLY";
const USER_ID = 555000111;
const PHONE = "+998901234567";

/** Telegram klienti qanday imzolasa — aynan shunday imzolaymiz (test uchun soxta klient). */
function sign(contact: object, authDate: number, token = TOKEN): { response: string; hash: string } {
  const params = new URLSearchParams({ contact: JSON.stringify(contact), auth_date: String(authDate) });
  const pairs: string[] = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(pairs.sort().join("\n")).digest("hex");
  return { response: params.toString(), hash };
}

const now = Math.floor(Date.now() / 1000);
const contact = { user_id: USER_ID, phone_number: PHONE, first_name: "Boburxon" };

let failed = 0;
const check = (name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? "✅" : "❌"} ${name} — ${detail}`);
  if (!pass) failed++;
};

// 1. HAQIQIY imzo → qabul, raqam va user_id o'qiladi
{
  const s = sign(contact, now);
  const r = validateContactResponse(s.response, s.hash, TOKEN);
  check("valid signature", r.ok && r.contact?.phone_number === PHONE && r.contact?.user_id === USER_ID, JSON.stringify(r));
}

// 2. `hash` query-string ICHIDA kelgan variant (klientlar farqi) → baribir qabul
{
  const s = sign(contact, now);
  const r = validateContactResponse(`${s.response}&hash=${s.hash}`, null, TOKEN);
  check("hash inside response", r.ok && r.contact?.user_id === USER_ID, JSON.stringify(r));
}

// 3. RAQAM ALMASHTIRILGAN (asosiy hujum) → RAD
{
  const s = sign(contact, now);
  const tampered = s.response.replace(encodeURIComponent(PHONE), encodeURIComponent("+998900000000"));
  const r = validateContactResponse(tampered, s.hash, TOKEN);
  check("tampered phone rejected", !r.ok && r.reason?.startsWith("bad signature") === true, JSON.stringify(r));
}

// 4. user_id almashtirilgan → RAD (imzo darajasida; API'da yana bir marta tekshiriladi)
{
  const s = sign(contact, now);
  const tampered = s.response.replace(String(USER_ID), "999999999");
  const r = validateContactResponse(tampered, s.hash, TOKEN);
  check("tampered user_id rejected", !r.ok, JSON.stringify(r));
}

// 5. BOSHQA bot tokeni bilan imzolangan → RAD
{
  const s = sign(contact, now, "999999:OTHER-BOT-TOKEN");
  const r = validateContactResponse(s.response, s.hash, TOKEN);
  check("foreign token rejected", !r.ok, JSON.stringify(r));
}

// 6. Imzosiz (mijoz o'zi to'qigan javob) → RAD
{
  const r = validateContactResponse(`contact=${encodeURIComponent(JSON.stringify(contact))}&auth_date=${now}`, null, TOKEN);
  check("no hash rejected", !r.ok && r.reason === "no hash", JSON.stringify(r));
}

// 7. Eskirgan (2 soat oldingi, maxAge=1s) → RAD
{
  const s = sign(contact, now - 7200);
  const r = validateContactResponse(s.response, s.hash, TOKEN, 3600);
  check("expired rejected", !r.ok && r.reason === "expired", JSON.stringify(r));
}

// 8. Bo'sh javob / tokensiz server → RAD (fail closed)
{
  const a = validateContactResponse("", null, TOKEN);
  const s = sign(contact, now);
  const b = validateContactResponse(s.response, s.hash, "");
  check("fails closed", !a.ok && !b.ok, `${a.reason} / ${b.reason}`);
}

console.log(failed === 0 ? "\n🟢 8/8 o'tdi" : `\n🔴 ${failed} ta yiqildi`);
process.exit(failed === 0 ? 0 : 1);
