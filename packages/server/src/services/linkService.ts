/**
 * 🔗 Raqam-ulash oqimining YAGONA manbasi — bot'dan mustaqil (grammY yo'q).
 *
 * Ilgari bu mantiq faqat `bot/bot.ts::handleLink` ichida edi, ya'ni raqamni ulashning yagona yo'li
 * Telegram chatidagi `request_contact` tugmasi edi. Mini App'dagi `requestContact()` yo'li ochilishi
 * bilan ayni mantiq IKKI joydan kerak bo'ldi — pul tegadigan qadamlar (join-sovg'a, referal,
 * haydovchi-QR ulushi) NUSXALANMASLIGI shart. Shuning uchun chiqarib olindi: bot ham, API ham
 * shu bitta funksiyani chaqiradi, faqat natijani turlicha KO'RSATADI.
 *
 * Bu yerda hech qanday xabar YUBORILMAYDI — chiqishda `extras` (foydalanuvchiga ko'rsatiladigan
 * qatorlar) va `notices` (uchinchi shaxsga — taklif qilgan do'st / haydovchiga) qaytadi; ularni
 * kim yuborishini chaqiruvchi hal qiladi.
 */
import { formatNumber } from "@t1067/shared";
import type { MemberType } from "@t1067/shared";
import { prisma } from "../db";
import { linkByPhone, type LinkResult } from "./memberService";
import { completeReferral } from "./referralService";
import { renderReferralWin } from "../bot/render";

/** Best-effort friendly name from a Telegram user + phone, in priority order:
 *   1. first (+ last) name  2. @username  3. "Mijoz ••1234" (phone last 4)
 *  Returns null if nothing usable (caller keeps the existing default). */
export function deriveDisplayName(from: { first_name?: string; last_name?: string; username?: string }, phone: string): string | null {
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (full.length >= 2) return full.slice(0, 40);
  if (from.username && from.username.length >= 2) return from.username.slice(0, 40);
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 4) return `Mijoz ••${digits.slice(-4)}`;
  return null;
}

/** Auto-set a derived display name ONLY when the member has none yet — never clobber a name
 *  the user (or a prior link) already chose. Clients only. */
export async function autoSetDisplayName(
  memberId: number,
  from: { first_name?: string; last_name?: string; username?: string },
  phone: string,
): Promise<void> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true } }).catch(() => null);
  if (!m || (m.displayName && m.displayName.trim().length > 0)) return;
  const derived = deriveDisplayName(from, phone);
  if (!derived) return;
  const { setDisplayName } = await import("./memberService");
  await setDisplayName(memberId, derived).catch(() => undefined);
}

/** Uchinchi shaxsga ketadigan xabar (taklif qilgan do'st / QR-haydovchi). */
export interface LinkNotice {
  telegramId: string;
  html: string;
}

export interface CompleteLinkResult {
  status: LinkResult["status"];
  memberId?: number;
  type?: MemberType;
  fullName?: string;
  /** Ulanish tasdig'i kartasiga qo'shiladigan qatorlar (sovg'a, referal). */
  extras: string[];
  /** Boshqa foydalanuvchilarga yuboriladigan xabarlar (chaqiruvchi yuboradi). */
  notices: LinkNotice[];
}

/**
 * Raqamni ulash + undan keyingi HAMMA mukofot qadami. Idempotentlik quyi qatlamlarda:
 * `linkByPhone` (join-sovg'a `welcome_join:<memberId>`), `completeReferral` (Referral.refereeId
 * @unique + referralCreditedAt), `completeDriverRecruitShare`. Ikki marta chaqirilsa ikkinchisi
 * pul bermaydi — Mini App yo'li shu kafolat ustiga qurilgan.
 */
export async function completeLink(
  telegramId: string,
  phone: string,
  profile: { username?: string; firstName?: string; lastName?: string; languageCode?: string },
): Promise<CompleteLinkResult> {
  const res = await linkByPhone(telegramId, phone, profile);
  const extras: string[] = [];
  const notices: LinkNotice[] = [];
  if (res.status !== "linked") return { status: res.status, extras, notices };

  if (res.type === "client" && res.memberId) {
    await autoSetDisplayName(res.memberId, { first_name: profile.firstName, last_name: profile.lastName, username: profile.username }, phone);
  }
  if (res.welcomeBonus) {
    extras.push(`🎁 Sovg'a: <b>+${formatNumber(res.welcomeBonus)} tanga</b> hisobingizga tushdi.`);
  }
  if (res.memberId) {
    // pay out a pending referral (this user joined via someone's invite)
    const credit = await completeReferral(telegramId, res.memberId).catch(() => null);
    if (credit) {
      // friend: only promise an on-ride bonus when there IS one (legacy, or staged w/o join-welcome).
      // In STAGED with the join-welcome ON, the friend already saw their +5000 message above.
      if (credit.refereeReward > 0) {
        extras.push(`✅ Do'st taklifi qabul qilindi — birinchi safaringizdan keyin <b>+${formatNumber(credit.refereeReward)} tanga</b>.`);
      }
      // inviter: STAGED → "raqam ulandi, +refShare now, +refRide on ride"; LEGACY → the win card.
      if (credit.staged && credit.shareReward > 0) {
        const rideMore =
          credit.referrerReward > 0 ? ` Birinchi safarini qilsa — yana <b>+${formatNumber(credit.referrerReward)} tanga</b>! 🚕` : "";
        notices.push({
          telegramId: credit.referrerTelegramId,
          html: `📱 <b>Do'stingiz raqamini uladi!</b>\n\n👥 Sizga <b>+${formatNumber(credit.shareReward)} tanga</b> tushdi.${rideMore}`,
        });
      } else if (!credit.staged && credit.referrerReward > 0) {
        notices.push({ telegramId: credit.referrerTelegramId, html: renderReferralWin(credit.referrerReward) });
      }
    }
    // 🚖 driver-QR staged: if this client arrived via a driver's QR, pay the driver the share-stage reward.
    const { completeDriverRecruitShare } = await import("./recruitService");
    const drv = await completeDriverRecruitShare(telegramId, res.memberId).catch(() => null);
    if (drv?.driverTelegramId && drv.shareReward > 0) {
      notices.push({
        telegramId: drv.driverTelegramId,
        html: `📱 <b>QR-mijozingiz raqamini uladi!</b>\n\n🚖 Sizga <b>+${formatNumber(drv.shareReward)} tanga</b> tushdi. Endi har safaridan ulush olasiz! 💰`,
      });
    }
  }
  return { status: "linked", memberId: res.memberId, type: res.type, fullName: res.fullName, extras, notices };
}
