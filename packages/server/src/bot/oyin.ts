// 🎮 BirJoy O'yinlar Mavsumi — TAKLIF QILINGAN ODAM ko'radigan kartochka (ega talabi 2026-08-02:
// "do'st uchun ko'rinadigan oynalar ham yasaldimi").
//
// Muammo: havola ulashilganda do'st botga kiradi va oddiy /start salomlashuvini ko'radi — o'yin
// haqida BIR OG'IZ ham gap yo'q edi (tekshirilgan: bot.ts da "oyin" so'zi 0 marta uchrardi).
// Taklif qiluvchiga "X qo'shildi" xabari borardi, kelgan odamga esa hech narsa. Viral halqaning
// eng zaif bo'g'ini shu edi.
//
// Yechim: kelgan odam DARHOL sovrin rasmi + kim chaqirgani + nima qilish kerakligini ko'radi.
// Naqsh `ravella.ts:sendRavellaCard` bilan bir xil (rasm + sarlavha + tugma), lekin tugma —
// `web_app` (miniappni to'g'ridan-to'g'ri o'yin tabida ochadi), chunki bu ichki ekran.
import type { Bot } from "grammy";
import { appBtn } from "./webAppUrl";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Taklif havolasi orqali kelgan odamga o'yin-kartochkasi. Mavsum yopiq bo'lsa HECH NARSA
 *  yubormaydi (`joinCardData` null qaytaradi) — bo'lmagan o'yinni va'da qilmaymiz. */
export async function sendOyinJoinCard(bot: Bot, chatId: string | number, inviterName: string | null): Promise<void> {
  const { featureOn } = await import("../services/featureFlags");
  if (!(await featureOn("oyin"))) return;
  const { joinCardData } = await import("../services/oyinService");
  const data = await joinCardData();
  if (!data) return;

  const who = inviterName ? `<b>${esc(inviterName)}</b> sizni taklif qildi` : "Sizni do'stingiz taklif qildi";
  const season = data.seasonLabel ? ` · ${esc(data.seasonLabel)}` : "";
  const caption =
    `🎮 <b>BirJoy O'yinlar Mavsumi</b>${season}\n` +
    `${who} 🤝\n\n` +
    `Bu yerda <b>hech narsa to'lamaysiz</b>. Shunchaki taksida yuring — har safar <b>ball</b> beradi. ` +
    `Ball chiptaga aylanadi, chipta esa mavsum oxiridagi <b>jonli tirajga</b> tushadi.\n\n` +
    `🏆 Bosh sovrin: <b>${esc(data.prizeName)}</b>\n` +
    `🎟 Jami <b>${data.slots} ta</b> chipta-o'rin\n\n` +
    `Boshlash uchun raqamingizni ulang va birinchi safaringizni qiling 👇`;

  const btn = appBtn("🎮 O'yinni ochish", "oyin");
  try {
    if (data.photoUrl) {
      await bot.api.sendPhoto(chatId, data.photoUrl, { caption, parse_mode: "HTML", ...(btn ?? {}) });
      return;
    }
  } catch {
    // rasm-URL yaroqsiz bo'lsa (admin xato havola qo'ygan) — matnli variantga tushamiz,
    // kartochka UMUMAN yuborilmay qolmasin.
  }
  await bot.api
    .sendMessage(chatId, `${data.icon} ${caption}`, { parse_mode: "HTML", ...(btn ?? {}) })
    .catch(() => undefined);
}
