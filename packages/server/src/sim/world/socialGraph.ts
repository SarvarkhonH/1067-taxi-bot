// 🕸 Aholi-quruvchi: mahalla + xonadon + ikki-tomonlama do'stlik-graf va boshlang'ich AgentState'lar.
// Sof-mantiq (DB importi YO'Q); determinizm — har tanlov berilgan rng-oqimdan, agent-id tartibida.
import type { AgentState, FraudRole, Mahalla, SimConfig } from "../types";
import type { Rng } from "../rng";
import { rngBool, rngInt, rngPick, rngTrait } from "../rng";
import {
  MAHALLA_NAMES,
  P_FRIEND_SAME_MAHALLA,
  sampleFriendCount,
  sampleHouseholdSize,
} from "../config/city";
import { sampleArchetype, sampleTraits } from "../config/personas";

/** Fraud-rollar ulushi: ~2% fraudster, ~3% opportunist (master-reja). */
const P_FRAUDSTER = 0.02;
const P_OPPORTUNIST = 0.03;

export interface WorldPopulation {
  agents: AgentState[];
  mahallas: Mahalla[];
}

/** cfg.population katta-yosh agent yaratadi: xonadonlar mahallalarga, traitlar arxetip-priorlardan. */
export function buildWorldPopulation(cfg: SimConfig, rng: Rng): WorldPopulation {
  const mahallas: Mahalla[] = MAHALLA_NAMES.map((name, id) => ({
    id,
    name,
    agentIds: [],
    recentWins: [],
  }));

  // 1-bosqich: xonadon-ketma-ket yaratish (xonadon a'zolari bitta mahallada)
  const agents: AgentState[] = [];
  let householdId = 0;
  while (agents.length < cfg.population) {
    const size = Math.min(sampleHouseholdSize(rng), cfg.population - agents.length);
    const mahallaId = rngInt(rng, 0, mahallas.length - 1);
    for (let i = 0; i < size; i++) {
      const agent = createAgent(agents.length, mahallaId, householdId, rng);
      mahallas[mahallaId]!.agentIds.push(agent.id);
      agents.push(agent);
    }
    householdId++;
  }

  // 2-bosqich: do'stlik-graf — 80% qirra o'z mahallasi ichida, qolgani shahar bo'ylab;
  // qirralar ikki tomonlama (oldingi agentlardan kelgan qirralar target-darajaga sanaladi)
  for (const a of agents) {
    const desired = sampleFriendCount(rng);
    let attempts = 0;
    const maxAttempts = desired * 20; // kichik mahalla/deadlock'dan qutulish kafolati
    while (a.friends.length < desired && attempts < maxAttempts) {
      attempts++;
      const sameMahalla = rngBool(rng, P_FRIEND_SAME_MAHALLA);
      const candidateId = sameMahalla
        ? rngPick(rng, mahallas[a.mahallaId]!.agentIds)
        : rngInt(rng, 0, agents.length - 1);
      if (candidateId === a.id) continue;
      if (a.friends.includes(candidateId)) continue;
      const b = agents[candidateId];
      if (!b) continue;
      a.friends.push(candidateId);
      b.friends.push(a.id);
    }
  }

  return { agents, mahallas };
}

/** Bitta agent: arxetip → trait-namuna → boshlang'ich funnel-holat. rng-chaqiruv tartibi QAT'IY. */
function createAgent(id: number, mahallaId: number, householdId: number, rng: Rng): AgentState {
  const archetype = sampleArchetype(rng);
  const traits = sampleTraits(rng, archetype);
  const satisfaction = 55 + rng() * 15; // 55..70 — neytral-ijobiy start
  // 0=1415ga to'liq o'rgangan .. 1=BirJoy odat — familiarity1415 teskarisi + ozgina shovqin
  const dispatcherHabit = rngTrait(rng, 1 - traits.familiarity1415, 0.05);
  const fraudRole = sampleFraudRole(rng);
  return {
    id,
    archetype,
    traits,
    mahallaId,
    householdId,
    friends: [],
    fraudRole,
    stage: "unaware",
    awareDay: null,
    satisfaction,
    dispatcherHabit,
    tgId: null,
    memberId: null,
    referralCode: null,
    invitedByAgentId: null,
    ridesTotal: 0,
    firstRideDay: null,
    lastRideDay: null,
    ticketsBought: 0,
    lossStreak: 0,
    wonEver: false,
    lastGameOpenDay: null,
    confusionEvents: 0,
  };
}

function sampleFraudRole(rng: Rng): FraudRole {
  const r = rng();
  if (r < P_FRAUDSTER) return "fraudster";
  if (r < P_FRAUDSTER + P_OPPORTUNIST) return "opportunist";
  return "none";
}
