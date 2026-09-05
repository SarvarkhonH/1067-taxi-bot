// 🖼📢 RASMLI REKLAMA — ega materiallarni (rasm + matn + havola) agentga beradi, agent brief
// yozadi, VPS'da shu skript avval FAQAT EGAGA preview yuboradi, ega «ok» desa hammaga ketadi.
// /elonrasm (broadcast.ts) bilan bir xil natija, faqat Telegram'da qo'lda bosish shart emas.
//
// Brief (JSON):
//   {
//     "photo":   "/opt/app/broadcasts/2026-09-05/rasm.jpg",   // VPS'dagi fayl YOKI https:// havola
//     "caption": "<b>Sarlavha</b>\n\nMatn…",                    // Telegram-HTML, ≤ 1024 belgi
//     "button":  { "label": "🔗 Ochish", "url": "https://…" }   // yoki { "label": "…", "go": "oyin" } (mini-app)
//     "segment": "all"                                          // "all" (default) | "linked" (telefon bog'laganlar)
//   }
//
// Yugurtirish (VPS, /opt/app/packages/server):
//   npx dotenv -e ../../.env -- npx tsx src/scripts/sendBroadcast.ts --brief /opt/app/broadcasts/…/brief.json
//       → FAQAT EGAGA preview (aynan mijoz ko'radigan ko'rinish) + nechta kishiga ketishi
//   … --brief … --send
//       → hammaga. Ega «ok» deMAGUNCHA --send ISHLATILMAYDI (mijozga sinov xabar TAQIQ).
//
// Xavfsizlik: rasm bir marta yuklanadi (egaga), keyin Telegram file_id qayta ishlatiladi —
// yuzlab marta fayl yuklash yo'q. Har yuborish pushSend orqali: 403 → blockedAt, 429 → kutib
// bir marta qayta, bloklaganlarga urinilmaydi. Natija Broadcast jadvaliga yoziladi (admin
// «Xabarlar tarixi» ko'radi, yetmaganlar ro'yxati bilan). ~22 xabar/s (broadcast.ts qoidasi).
import { readFileSync } from "node:fs";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import { prisma } from "../db";
import { env } from "../env";
import { pushResult } from "../services/pushSend";
import { canWebApp, refreshWebAppVer, webAppUrl } from "../bot/webAppUrl";

const OWNER_TG = "6506297119"; // broadcast.ts bilan bir xil manba
const CAPTION_MAX = 1024; // Telegram sendPhoto caption limiti
const KIND = "broadcast_photo";

interface Brief {
  photo: string;
  caption: string;
  button?: { label: string; url?: string; go?: string };
  segment?: "all" | "linked";
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function loadBrief(path: string): Brief {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Brief>;
  if (!raw.photo || typeof raw.photo !== "string") throw new Error("brief.photo yo'q");
  if (!raw.caption || typeof raw.caption !== "string") throw new Error("brief.caption yo'q");
  if (raw.caption.length > CAPTION_MAX) throw new Error(`caption ${raw.caption.length} belgi — limit ${CAPTION_MAX}`);
  if (raw.button) {
    if (!raw.button.label) throw new Error("button.label yo'q");
    if (!raw.button.url && !raw.button.go) throw new Error("button.url yoki button.go kerak");
    if (raw.button.url && !/^(https:\/\/|tg:\/\/)/.test(raw.button.url)) throw new Error("button.url https:// yoki tg:// bilan boshlansin");
  }
  const segment = raw.segment === "linked" ? "linked" : "all";
  return { photo: raw.photo, caption: raw.caption, button: raw.button, segment };
}

function keyboard(b: Brief): InlineKeyboard | undefined {
  if (!b.button) return undefined;
  const kb = new InlineKeyboard();
  if (b.button.url) return kb.url(b.button.label, b.button.url);
  if (!canWebApp) throw new Error("TELEGRAM_WEBAPP_URL https:// emas — mini-app tugma ishlamaydi");
  return kb.webApp(b.button.label, webAppUrl(b.button.go));
}

async function main(): Promise<void> {
  const briefPath = arg("--brief");
  if (!briefPath) { console.error("--brief <file.json> kerak"); process.exit(1); }
  if (!env.BOT_TOKEN) { console.error("BOT_TOKEN yo'q"); process.exit(1); }
  const live = process.argv.includes("--send");

  const brief = loadBrief(briefPath);
  await refreshWebAppVer(); // mini-app tugma bo'lsa versiyali URL kerak (eski kesh emas)
  const kb = keyboard(brief);
  const bot = new Bot(env.BOT_TOKEN); // faqat API — polling YO'Q

  // Kimga ketadi: bloklamaganlar + ban'siz; "linked" = telefon bog'laganlar.
  const users = await prisma.telegramUser.findMany({
    where: {
      blockedAt: null,
      ...(brief.segment === "linked" ? { memberId: { not: null } } : {}),
      OR: [{ memberId: null }, { member: { banned: false } }],
    },
    select: { id: true, memberId: true },
  });
  console.log(`Segment=${brief.segment} → ${users.length} kishi · rejim=${live ? "SEND (hammaga)" : "PREVIEW (faqat egaga)"}`);

  // 1) Egaga — HAR DOIM birinchi. Rasm shu yerda bir marta yuklanadi, file_id keyin qayta ishlatiladi.
  const media = /^https?:\/\//.test(brief.photo) ? brief.photo : new InputFile(brief.photo);
  const first = await bot.api.sendPhoto(OWNER_TG, media, { caption: brief.caption, parse_mode: "HTML", reply_markup: kb });
  const fileId = first.photo[first.photo.length - 1]!.file_id;

  if (!live) {
    await bot.api.sendMessage(
      OWNER_TG,
      `👆 <b>Preview</b> — mijoz aynan shunday ko'radi.\nTasdiqlasangiz <b>${users.length}</b> kishiga ketadi (segment: ${brief.segment}).`,
      { parse_mode: "HTML" },
    );
    console.log("Preview egaga yuborildi. Hammaga yuborish uchun --send qo'shing.");
    await prisma.$disconnect();
    return;
  }

  // 2) Hammaga (ega allaqachon oldi — o'tkazib yuboriladi)
  let sent = 1; // ega
  const failedIds: string[] = [];
  const rest = users.filter((u) => u.id !== OWNER_TG);
  for (let i = 0; i < rest.length; i++) {
    const u = rest[i]!;
    const r = await pushResult(
      u.id,
      KIND,
      () => bot.api.sendPhoto(u.id, fileId, { caption: brief.caption, parse_mode: "HTML", reply_markup: kb }),
      { memberId: u.memberId, prechecked: true },
    );
    if (r) sent++;
    else failedIds.push(u.id);
    if (i % 22 === 21) await new Promise((res) => setTimeout(res, 1000)); // ~22 msg/s
    if (i % 200 === 199) console.log(`  … ${i + 1}/${rest.length}`);
  }

  // 3) Yetmaganlar — ism/telefon bilan (admin qo'ng'iroq qila olsin), Broadcast jadvaliga.
  const failedList = failedIds.length
    ? (await prisma.telegramUser.findMany({
        where: { id: { in: failedIds } },
        select: { id: true, firstName: true, lastName: true, username: true, member: { select: { fullName: true, displayName: true, phone: true } } },
      })).map((t) => ({
        telegramId: t.id,
        name: t.member?.displayName || t.member?.fullName || [t.firstName, t.lastName].filter(Boolean).join(" ") || (t.username ? `@${t.username}` : t.id),
        phone: t.member?.phone ?? null,
        status: "failed",
      }))
    : [];
  await prisma.broadcast
    .create({
      data: {
        text: `🖼 ${brief.caption}`,
        segment: brief.segment ?? "all",
        sentCount: sent,
        failedCount: failedIds.length,
        totalCount: users.length,
        recipients: failedList.length ? { create: failedList } : undefined,
      },
    })
    .catch((e) => console.error("[broadcast] log persist failed", e));

  console.log(`\nYetkazildi: ${sent} · Yetmadi: ${failedIds.length} · Jami: ${users.length}`);
  await bot.api
    .sendMessage(
      OWNER_TG,
      `✅ <b>Rasmli reklama yuborildi</b>\n📬 Yetkazildi: <b>${sent}</b>\n${failedIds.length ? `❌ Yetmadi: <b>${failedIds.length}</b> (bloklagan/o'chirgan)` : ""}`,
      { parse_mode: "HTML" },
    )
    .catch(() => undefined);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
