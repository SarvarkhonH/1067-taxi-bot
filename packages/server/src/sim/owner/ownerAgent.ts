// 🎩 Ega-agent: kunlik rutina — (a) to'lgan sovrinlarni tiraj qilish (muzlat → ro'yxat →
// rng-g'olib → bayonnoma → muzdan chiqar) + g'olib/yutqazganlarga his-ta'sir, (b) vitrina-restock:
// ochiq sovrin < 3 bo'lsa kichik sovrin qo'shish. Servislar faqat funksiya ichida import qilinadi.

import { OYIN_PRIZE_MULTIPLIER, OYIN_SOM_PER_BALL } from "@t1067/shared";
import type { AgentState, SimEvent, WorldState } from "../types";
import { rngInt, rngPick, type Rng } from "../rng";

/** Vitrinada kamida shuncha ochiq sovrin turishi kerak (restock-chegara). */
export const MIN_OPEN_PRIZES = 3;

// Kichik ("small"-katalog uslubi) sovrin-shablonlar — restock shulardan tanlaydi.
const SMALL_PRIZE_POOL: readonly { icon: string; name: string }[] = [
  { icon: "🫖", name: "Choynak to'plami" },
  { icon: "☕", name: "Elektr choydish" },
  { icon: "🎧", name: "Simsiz quloqchin" },
  { icon: "🧴", name: "Termos 1L" },
  { icon: "🔦", name: "LED fonar" },
  { icon: "🧺", name: "Dazmol" },
  { icon: "🥤", name: "Blender" },
  { icon: "🎒", name: "Sport sumka" },
];

/** valueLabel ("1 386 130 so'm") dan so'm-qiymat; buzuq bo'lsa sig'imdan 1/m fallback. */
function prizeValueSom(valueLabel: string, price: number, limit: number): number {
  const parsed = Number((valueLabel || "").replace(/\D/g, ""));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.round((price * limit * OYIN_SOM_PER_BALL) / OYIN_PRIZE_MULTIPLIER);
}

function formatSom(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
}

export async function ownerDailyRoutine(world: WorldState, rng: Rng): Promise<SimEvent[]> {
  const events: SimEvent[] = [];
  const oyin = await import("../../services/oyinService");

  const byMember = new Map<number, AgentState>();
  for (const a of world.agents) if (a.memberId != null) byMember.set(a.memberId, a);

  // ── (a) To'lgan sovrinlar: tiraj ────────────────────────────────────────────
  let catalog = await oyin.adminListCatalog();
  const filled = catalog.filter((p) => p.sold >= p.limit);
  for (const prize of filled) {
    await oyin.adminSetFreeze(true);
    try {
      // Muzlatishdan KEYIN o'qiladi — frozenAt to'lgan bo'ladi (adminRecordWinner talabi)
      const list = await oyin.getDrawList(prize.key);
      if (!list || !list.ready || list.cards.length === 0) {
        events.push({
          day: world.day,
          type: "draw_skipped",
          detail: `${prize.key}: ro'yxat tayyor emas (sold=${prize.sold}/${prize.limit})`,
        });
        continue;
      }
      const winCard = rngPick(rng, list.cards);
      const res = await oyin.adminRecordWinner(prize.key, winCard.gno, "sim-tiraj");
      if (!res.ok) {
        // "already" = avvalgi kunda tiraj bo'lgan — jim o'tamiz, qolgani jurnal uchun
        if (res.reason !== "already") {
          events.push({
            day: world.day,
            type: "draw_failed",
            detail: `${prize.key}: ${res.reason ?? "noma'lum"}`,
            data: { gno: winCard.gno },
          });
        }
        continue;
      }

      const valueSom = prizeValueSom(prize.valueLabel, prize.price, prize.limit);
      world.owner.prizeSpendTotal += valueSom;
      world.owner.cash -= valueSom;
      events.push({
        day: world.day,
        type: "winner",
        detail: `${prize.name} → a'zo #${winCard.memberId} (gno ${winCard.gno}, ${formatSom(valueSom)})`,
        data: { prizeKey: prize.key, gno: winCard.gno, memberId: winCard.memberId, valueSom },
      });

      // G'olib: xursandchilik + mahalla social-proof
      const winner = byMember.get(winCard.memberId);
      if (winner) {
        winner.satisfaction = Math.min(100, winner.satisfaction + 40);
        winner.wonEver = true;
        winner.lossStreak = 0;
        const m = world.mahallas.find((mh) => mh.id === winner.mahallaId);
        if (m) {
          m.recentWins = m.recentWins.filter((d) => world.day - d <= 14);
          m.recentWins.push(world.day);
        }
      }
      // Yutqazganlar: lossStreak + trait-og'irlikli satisfaction-tushish
      const losers = new Set<number>();
      for (const c of list.cards) if (c.memberId !== winCard.memberId) losers.add(c.memberId);
      for (const mid of losers) {
        const a = byMember.get(mid);
        if (!a) continue;
        a.lossStreak += 1;
        a.satisfaction = Math.max(0, a.satisfaction - (4 + 8 * a.traits.quitAfterLoss));
      }
    } finally {
      await oyin.adminSetFreeze(false);
    }
  }

  // ── (b) Restock: ochiq sovrin < 3 bo'lsa kichik sovrin qo'shish ─────────────
  catalog = await oyin.adminListCatalog();
  let openCount = catalog.filter((p) => p.active && p.stage === "open").length;
  let guard = 0;
  while (openCount < MIN_OPEN_PRIZES && guard < 5) {
    guard++;
    const tmpl = rngPick(rng, SMALL_PRIZE_POOL);
    const price = rngInt(rng, 6, 12) * 100; // 600..1200 ball — "kichik" daraja atrofi
    const limit = rngInt(rng, 10, 20);
    const valueSom = Math.round((price * limit * OYIN_SOM_PER_BALL) / OYIN_PRIZE_MULTIPLIER);
    // queued:false — yangi sovrin default navbatga tushadi, sim'da esa darhol ochiq kerak
    catalog = await oyin.adminUpsertPrize({
      icon: tmpl.icon,
      name: `${tmpl.name} (${world.day}-kun №${guard})`,
      valueLabel: formatSom(valueSom),
      price,
      limit,
      photoUrl: null,
      queued: false,
    });
    openCount = catalog.filter((p) => p.active && p.stage === "open").length;
    events.push({
      day: world.day,
      type: "restock",
      detail: `${tmpl.name}: ${price} ball × ${limit} o'rin (~${formatSom(valueSom)})`,
      data: { price, limit, valueSom },
    });
  }

  return events;
}
