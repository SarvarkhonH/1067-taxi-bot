// 📈 Adoption-funnel: unaware→aware→installed→linked kunlik o'tishlari — Fogg B=MAP darvozasi
// (motivatsiya×qobiliyat>chegara faqat prompt bo'lsa) + ijtimoiy yuqumlilik (do'st/mahalla social-proof).
// DB'GA TEGMAYDI: faqat stage o'zgartiradi va ro'yxat qaytaradi — real yaratish actions-qatlamda.
import type { AgentState, Mahalla, WorldState } from "../types";
import type { Rng } from "../rng";
import { rngBool } from "../rng";

/** Har kun run-qatlami beradigan kontekst (types.ts o'zgarmasin — lokal kontrakt shu yerda).
 *  Berilmasa defaultlar: adDay=true (kunlik reklama/organik mavjudlik), taklif-prompt esa
 *  agent.invitedByAgentId dan o'qiladi (inviteFlow shu maydonga yozadi). */
export interface AdvanceFunnelCtx {
  /** Bugun reklama-kuni — har aware-agent uchun Fogg-prompt hisoblanadi. */
  adDay?: boolean;
  /** Bugun do'st-taklifi kelgan agentlar (actions-qatlam to'ldirsa) — qo'shimcha Fogg-prompt. */
  invitedAgentIds?: ReadonlySet<number>;
}

export interface AdvanceFunnelResult {
  /** Bugun "installed" bo'lganlar — actions-qatlam ular uchun REAL bot-user yaratadi. */
  newInstalled: AgentState[];
  /** Bugun "linked" bo'lganlar — actions-qatlam raqam-ulashni REAL bajaradi. */
  newLinked: AgentState[];
}

/** Fogg-darvoza: motivatsiya×qobiliyat shu chegaradan oshsa VA prompt bo'lsa install mumkin. */
const FOGG_THRESHOLD = 0.12;

/**
 * HAR KUN bir marta chaqiriladi. Determinizm: agentlar id-tartibida, bitta rng-oqim.
 * todayCounters.newAware shu yerda ortadi (aware-o'tishni boshqa qatlam ko'rmaydi);
 * newInstalled/newLinked hisoblagichlarini actions-qatlam REAL yaratishdan keyin oshiradi.
 */
export function advanceFunnel(
  world: WorldState,
  rng: Rng,
  ctx: AdvanceFunnelCtx = {},
): AdvanceFunnelResult {
  const { agents, mahallas, cfg } = world;
  const b = cfg.behavior;
  const adDay = ctx.adDay ?? true;
  const newInstalled: AgentState[] = [];
  const newLinked: AgentState[] = [];

  // 1-o'tish: bugungi unaware-soni — kunlik inflow'ni per-agent ehtimolga aylantirish uchun
  let unawareCount = 0;
  for (const a of agents) if (a.stage === "unaware") unawareCount++;
  const pInflow = unawareCount > 0 ? Math.min(1, cfg.dailyAwarenessInflow / unawareCount) : 0;

  // 2-o'tish: o'tishlar — switch bitta branch'ni bajaradi, shu kunda ikki pog'ona sakralmaydi
  for (const a of agents) {
    switch (a.stage) {
      case "unaware": {
        const pSocial = socialAwarenessBoost(a, agents, mahallas, b.socialContagion);
        if (rngBool(rng, Math.min(1, pInflow + pSocial))) {
          a.stage = "aware";
          a.awareDay = world.day;
          world.todayCounters.newAware++;
        }
        break;
      }
      case "aware": {
        const invited = a.invitedByAgentId != null || (ctx.invitedAgentIds?.has(a.id) ?? false);
        if (!adDay && !invited) break; // Fogg: prompt'siz xulq-o'zgarish yo'q
        if (foggMotivation(a, agents) * foggAbility(a) <= FOGG_THRESHOLD) break;
        const p = b.pInstallBase * a.traits.trust * a.traits.techAffinity;
        if (rngBool(rng, Math.min(1, p))) {
          a.stage = "installed";
          newInstalled.push(a);
        }
        break;
      }
      case "installed": {
        // "Hech qachon ulamaydiganlar" qatlami (N3: real link-rate 72.5%, qolgani abadiy installed)
        if (0.5 * a.traits.trust + 0.5 * a.traits.techAffinity < b.linkGate) break;
        if (rngBool(rng, Math.min(1, b.pLinkBase))) {
          a.stage = "linked";
          newLinked.push(a);
        }
        break;
      }
      default:
        break; // linked+ bosqichlarni boshqa modullar (rides/churn) yuritadi
    }
  }

  return { newInstalled, newLinked };
}

/** Ijtimoiy yuqumlilik: faol (rode/habitual) va yutgan do'stlar + mahalla so'nggi-yutuqlari. */
function socialAwarenessBoost(
  a: AgentState,
  agents: readonly AgentState[],
  mahallas: readonly Mahalla[],
  socialContagion: number,
): number {
  let active = 0;
  let won = 0;
  for (const fid of a.friends) {
    const f = agents[fid];
    if (!f) continue;
    if (f.stage === "rode" || f.stage === "habitual") active++;
    if (f.wonEver) won++;
  }
  const n = Math.max(1, a.friends.length);
  const winProof = Math.min(1, (mahallas[a.mahallaId]?.recentWins.length ?? 0) / 5);
  const raw = (0.6 * active + 1.0 * won) / n + 0.3 * winProof;
  return socialContagion * raw * (0.5 + a.traits.socialInfluence);
}

/** Fogg-motivatsiya: safar-ehtiyoj + mukofot-qiziqish + do'stlar-bosimi + BirJoy'ga moyil odat. */
function foggMotivation(a: AgentState, agents: readonly AgentState[]): number {
  let adopted = 0;
  for (const fid of a.friends) {
    const f = agents[fid];
    if (!f) continue;
    if (f.stage === "installed" || f.stage === "linked" || f.stage === "rode" || f.stage === "habitual") {
      adopted++;
    }
  }
  const peer = adopted / Math.max(1, a.friends.length);
  return clamp01(
    0.4 * a.traits.rideNeed +
      0.25 * a.traits.rewardSensitivity +
      0.25 * peer +
      0.1 * a.dispatcherHabit,
  );
}

/** Fogg-qobiliyat: ilova-ko'nikma + sabr (confusion'ga chidam). */
function foggAbility(a: AgentState): number {
  return clamp01(0.6 * a.traits.techAffinity + 0.4 * a.traits.patience);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
