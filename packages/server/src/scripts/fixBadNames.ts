// One-shot: repair display names that were accidentally set to a menu-button tap
// (e.g. "🚕 Taxi chaqirish", "💰 Hamyon", "Bonuslar") during the old auto-ask-name flow.
// For each bad name we re-derive: Telegram first+last → @username → "Mijoz ••<last4 phone>".
// DRY-RUN by default; pass --apply to write. Clients only, never touches driver names.
import "../env"; // loads repo-root .env (DATABASE_URL, BOT_TOKEN, …) before prisma connects
import { prisma } from "../db";

// Reserved menu phrases (emoji-stripped, lowercased) that must NEVER be a display name.
const RESERVED = [
  "taxi chaqirish", "buyurtmam", "lokatsiyali chaqirish", "hamyon", "bonuslar", "vazifalar",
  "reyting", "hisobim", "sozlamalar", "haydovchiga to'lash", "haydovchi paneli", "kunlik",
  "g'ildirak", "nishonlar", "menyu", "narx & cashback", "do'st", "do'st taklif", "do'st chaqirish",
  "ilova", "dastafka", "dostavka", "yetkazib berish",
].map((s) => s.toLowerCase());

const stripEmoji = (s: string): string =>
  s.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]/gu, "").trim();

function isBadName(name: string | null): boolean {
  if (!name) return false;
  const t = name.trim();
  if (!t) return false;
  // (1) NO letters at all → pure emoji / punctuation / digits ("🖤🖤", "👀", "-", ".", "1415")
  const lettersOnly = t.replace(/[^\p{L}]/gu, "");
  if (lettersOnly.length === 0) return true;
  // (2) matches a reserved MENU-BUTTON label (emoji-stripped) → accidental tap, not a name.
  //     NOTE: names WITH real letters + decorative emoji ("😘Guli😘", "💎Lobar💎") are the user's
  //     own choice and are intentionally kept.
  const bare = stripEmoji(t).toLowerCase().replace(/\s+/g, " ").trim();
  if (RESERVED.includes(bare)) return true;
  if (RESERVED.some((r) => bare === r || bare.startsWith(r + " ") || bare.endsWith(" " + r))) return true;
  return false;
}

function derive(tg: { firstName?: string | null; lastName?: string | null; username?: string | null } | null, phone: string | null): string | null {
  const full = [tg?.firstName, tg?.lastName].filter(Boolean).join(" ").trim();
  if (full.length >= 2 && !isBadName(full)) return full.slice(0, 40);
  if (tg?.username && tg.username.length >= 2) return tg.username.slice(0, 40);
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return `Mijoz ••${digits.slice(-4)}`;
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const members = await prisma.member.findMany({
    where: { type: "client" },
    select: { id: true, displayName: true, fullName: true, phone: true },
  });

  const fixes: { id: number; from: string; to: string }[] = [];
  for (const m of members) {
    // the EFFECTIVE name a user/admin sees = displayName || fullName. Fix if that is bad.
    const effective = (m.displayName && m.displayName.trim()) || m.fullName || "";
    if (!isBadName(effective)) continue;
    const tu = await prisma.telegramUser.findFirst({
      where: { memberId: m.id },
      select: { firstName: true, lastName: true, username: true },
    });
    const to = derive(tu, m.phone);
    if (!to || to === effective) continue;
    fixes.push({ id: m.id, from: effective, to });
  }

  console.log(`\nScanned ${members.length} clients. Bad names to fix: ${fixes.length}\n`);
  for (const f of fixes) console.log(`  #${f.id}: "${f.from}"  →  "${f.to}"`);

  if (!apply) {
    console.log(`\n[DRY-RUN] Nothing written. Re-run with --apply to persist.\n`);
    return;
  }

  let ok = 0;
  const { setDisplayName } = await import("../services/memberService");
  for (const f of fixes) {
    // setDisplayName also pushes to kas (client name) — best-effort, non-fatal.
    await setDisplayName(f.id, f.to).then(() => ok++).catch((e) => console.error(`  #${f.id} failed:`, e));
  }
  console.log(`\n✅ Applied ${ok}/${fixes.length} name fixes.\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
