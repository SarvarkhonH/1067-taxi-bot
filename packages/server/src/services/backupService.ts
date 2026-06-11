// Daily automatic backup: once per Tashkent day the periodic loop dumps every
// table to JSON and sends it to the admin chats as a document. Mitigates the
// #1 infra risk (free Postgres expiry / data loss) with zero extra accounts.
import { InputFile } from "grammy";
import type { Bot } from "grammy";
import { prisma } from "../db";
import { env } from "../env";

function tashkentDay(d = new Date()): string {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function snapshot(): Promise<{ json: string; total: number }> {
  const tables: Record<string, () => Promise<unknown[]>> = {
    member: () => prisma.member.findMany(),
    telegramUser: () => prisma.telegramUser.findMany(),
    coinTxn: () => prisma.coinTxn.findMany(),
    withdrawal: () => prisma.withdrawal.findMany(),
    rewardGrant: () => prisma.rewardGrant.findMany(),
    streak: () => prisma.streak.findMany(),
    wheelSpin: () => prisma.wheelSpin.findMany(),
    missionProgress: () => prisma.missionProgress.findMany(),
    boxOpen: () => prisma.boxOpen.findMany(),
    weeklyScore: () => prisma.weeklyScore.findMany(),
    referral: () => prisma.referral.findMany(),
    memberAchievement: () => prisma.memberAchievement.findMany(),
    transfer: () => prisma.transfer.findMany(),
    rideReward: () => prisma.rideReward.findMany(),
    shop: () => prisma.shop.findMany(),
    listing: () => prisma.listing.findMany(),
    shopOrder: () => prisma.shopOrder.findMany(),
    appState: () => prisma.appState.findMany(),
    syncRun: () => prisma.syncRun.findMany(),
  };
  const out: Record<string, unknown[]> = {};
  let total = 0;
  for (const [name, fn] of Object.entries(tables)) {
    const rows = await fn();
    out[name] = rows;
    total += rows.length;
  }
  return { json: JSON.stringify({ at: new Date().toISOString(), total, tables: out }), total };
}

/** Called from the periodic loop — sends at most one backup per day. */
export async function maybeDailyBackup(bot: Bot): Promise<void> {
  const key = `backup_sent:${tashkentDay()}`;
  const done = await prisma.appState.findUnique({ where: { key } });
  if (done) return;
  // claim the marker FIRST so a crash mid-send doesn't spam admins on retries
  await prisma.appState.upsert({ where: { key }, create: { key, value: "1" }, update: { value: "1" } });

  const { json, total } = await snapshot();
  const file = new InputFile(Buffer.from(json, "utf-8"), `backup-${tashkentDay()}.json`);
  for (const adminId of env.adminIds) {
    await bot.api
      .sendDocument(adminId, file, { caption: `🗄 Kunlik backup — ${total.toLocaleString("ru-RU")} satr. Saqlanmasin desangiz ham saqlang 🙂` })
      .catch((e) => console.error("[backup] send failed:", e));
  }
}
