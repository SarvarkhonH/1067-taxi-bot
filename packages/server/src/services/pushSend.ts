// 📵 BLK-1 — bitta yuborish chokepoint'i. MUAMMO: proaktiv push'lar 403 ni jimgina yutar edi
// (`.catch(() => undefined)`), shuning uchun `blockedAt` ni butun kodbazada faqat `sendTg`
// (admin-broadcast yo'li) yozardi → "kunlik bonus xabari odamni haydayaptimi?" degan savol
// TEXNIK jihatdan o'lchanmas edi. Bu modul har yuborishni bitta joydan o'tkazadi:
//   • bloklagan foydalanuvchiga (force emas) Telegram'ga UMUMAN chiqmaydi — bekor urinish yo'q;
//   • 403 → `blockedAt` + `BlockEvent(kind, "block")` → qaysi xabardan keyin bloklangani ko'rinadi;
//   • boshqa xato (429, tarmoq) hozirgidek jimgina yutiladi va blok DEB YOZILMAYDI.
// Bu modul HECH QANDAY xabar matnini, chastotasini yoki cheklovini o'zgartirmaydi — faqat o'lchov.
import type { Bot } from "grammy";
import { prisma } from "../db";

export type PushOutcome = "sent" | "skipped" | "blocked" | "failed";

type SendExtra = NonNullable<Parameters<Bot["api"]["sendMessage"]>[2]>;

export interface PushOpts {
  /** Ma'lum bo'lsa — BlockEvent'ga yoziladi (kim bloklagani a'zo bo'yicha ham ko'rinsin). */
  memberId?: number | null;
  /** Tranzaksion xabarlar (safar oqimi): eski/noto'g'ri blok bayrog'i tufayli "haydovchi yetib
   *  keldi" yo'qolmasin — oldindan tekshiruvni chetlab o'tadi, lekin 403 baribir yoziladi. */
  force?: boolean;
}

/** Telegram 403 (bloklagan / o'chirilgan akkaunt) — boshqa xatolardan QAT'IY farqlanadi:
 *  429 (rate-limit) yoki tarmoq uzilishi HECH QACHON blok deb yozilmaydi. */
export function isBlockError(e: unknown): boolean {
  const code = (e as { error_code?: number })?.error_code;
  if (code === 403) return true;
  if (typeof code === "number") return false; // aniq boshqa Telegram xatosi (429/400/…)
  return /blocked|deactivated|forbidden/i.test(String((e as Error)?.message ?? ""));
}

/** Bloklaganmi? (PK bo'yicha bitta o'qish). Push'ni CLAIM qilishdan OLDIN chaqiriladi —
 *  shunda bloklagan odamga NotifyLog markeri ham yozilmaydi (o'lchov toza qoladi). */
export async function isBlocked(telegramId: string): Promise<boolean> {
  const row = await prisma.telegramUser.findUnique({ where: { id: telegramId }, select: { blockedAt: true } }).catch(() => null);
  return !!row?.blockedAt;
}

/** 403 hodisasini yozadi: joriy holat (`blockedAt`) + tarix (`BlockEvent`). Ikkalasi ham
 *  best-effort — o'lchov yozuvi hech qachon xabar oqimini yiqitmaydi. */
export async function recordBlock(telegramId: string, kind: string, memberId?: number | null): Promise<void> {
  const mid = memberId ?? (await prisma.telegramUser.findUnique({ where: { id: telegramId }, select: { memberId: true } }).catch(() => null))?.memberId ?? null;
  await prisma.telegramUser.update({ where: { id: telegramId }, data: { blockedAt: new Date() } }).catch(() => undefined);
  await prisma.blockEvent.create({ data: { telegramId, memberId: mid, kind, event: "block" } }).catch(() => undefined);
  console.log(`[block] ${telegramId} bloklagan (kind=${kind})`);
}

/** Foydalanuvchi qaytdi (istalgan inbound harakat) — `touchTelegramUser` chaqiradi. */
export async function recordReturn(telegramId: string, memberId?: number | null): Promise<void> {
  await prisma.blockEvent.create({ data: { telegramId, memberId: memberId ?? null, kind: "return", event: "return" } }).catch(() => undefined);
}

/** Universal o'rov: istalgan yuborish (sendMessage/sendPhoto/karta…) shu yerdan o'tadi. */
export async function pushSend(chatId: string, kind: string, send: () => Promise<unknown>, opts: PushOpts = {}): Promise<PushOutcome> {
  if (!opts.force && (await isBlocked(chatId))) return "skipped";
  try {
    await send();
    return "sent";
  } catch (e) {
    if (isBlockError(e)) {
      await recordBlock(chatId, kind, opts.memberId);
      return "blocked";
    }
    return "failed"; // 429/tarmoq — avvalgidek jim (chaqiruvchi oqimi o'zgarmaydi)
  }
}

/** Eng keng tarqalgan holat: HTML matnli xabar. */
export async function pushMessage(bot: Bot, chatId: string, kind: string, html: string, opts: PushOpts & { extra?: SendExtra } = {}): Promise<PushOutcome> {
  return pushSend(chatId, kind, () => bot.api.sendMessage(chatId, html, { parse_mode: "HTML", ...opts.extra }), opts);
}
