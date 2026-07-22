// 🧠 Koson AI jamoaviy bilim (feature "aibilim"). Users submit facts about Koson; the
// owner approves; approved facts are retrieved (keyword-match) into the agent's system
// prompt so the AI answers grounded in real, owner-vetted local knowledge (Bible §17.2/§17.3).
// No money, no PII — public city knowledge. Approval is a HUMAN step (owner card / admin panel).
import { prisma } from "../../db";

const MAX_LEN = 500;
const MIN_LEN = 8;
const DAILY_PER_USER = 5;
const PROMPT_SMALL_ALL = 15; // ≤ this many approved facts → include ALL (they fit the prompt)
const PROMPT_RETRIEVE_N = 8; // otherwise keyword-retrieve this many

export interface KnowledgeNotice {
  id: number;
  text: string;
  submitterName: string;
}

export async function submitKnowledge(tgId: string, rawText: string, submitterName: string): Promise<{ ok: boolean; id?: number; reason?: string; notice?: KnowledgeNotice }> {
  const text = rawText.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
  if (text.length < MIN_LEN) return { ok: false, reason: "Ma'lumot juda qisqa — kamida bir jumla yozing." };
  const day = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const { atomicIncrement } = await import("../appStateUtil");
  const n = await atomicIncrement(`bilim_sub:${tgId}:${day}`, 1);
  if (n > DAILY_PER_USER) return { ok: false, reason: "Bugungi limit tugadi (5 ta/kun). Ertaga yana yuborishingiz mumkin — rahmat!" };
  const row = await prisma.aiKnowledge.create({ data: { text, submittedBy: tgId, status: "pending" } });
  return { ok: true, id: row.id, notice: { id: row.id, text, submitterName } };
}

export async function moderate(id: number, approve: boolean, byTgId: string): Promise<{ ok: boolean; text?: string; submittedBy?: string }> {
  const row = await prisma.aiKnowledge.findUnique({ where: { id } });
  if (!row || row.status !== "pending") return { ok: false };
  await prisma.aiKnowledge.update({ where: { id }, data: { status: approve ? "approved" : "rejected", moderatedBy: byTgId, moderatedAt: new Date() } });
  return { ok: true, text: row.text, submittedBy: row.submittedBy };
}

export async function listByStatus(status: "pending" | "approved" | "rejected", take = 50): Promise<{ id: number; text: string; submittedBy: string; createdAt: Date }[]> {
  return prisma.aiKnowledge.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take, select: { id: true, text: true, submittedBy: true, createdAt: true } });
}

export async function deleteKnowledge(id: number): Promise<{ ok: boolean }> {
  await prisma.aiKnowledge.delete({ where: { id } }).catch(() => undefined);
  return { ok: true };
}

/** Approved facts relevant to the query → a compact block for the system prompt. Null when none.
 *  Small KB → all facts; large KB → keyword-retrieved top N (no vector DB, tiny-VPS rule). */
export async function relevantKnowledge(query: string): Promise<string | null> {
  const total = await prisma.aiKnowledge.count({ where: { status: "approved" } });
  if (total === 0) return null;

  let rows: { text: string }[];
  if (total <= PROMPT_SMALL_ALL) {
    rows = await prisma.aiKnowledge.findMany({ where: { status: "approved" }, orderBy: { createdAt: "desc" }, select: { text: true } });
  } else {
    const words = query
      .toLowerCase()
      .split(/[^\p{L}\d]+/u)
      .filter((w) => w.length >= 3 && !["kerak", "uchun", "menga", "qayerda", "qanday", "bormi"].includes(w));
    if (!words.length) return null;
    const hits = await prisma.aiKnowledge.findMany({
      where: { status: "approved", OR: words.map((w) => ({ text: { contains: w, mode: "insensitive" as const } })) },
      orderBy: { createdAt: "desc" },
      take: PROMPT_RETRIEVE_N,
      select: { text: true },
    });
    if (!hits.length) return null;
    rows = hits;
  }
  return rows.map((r) => `• ${r.text}`).join("\n");
}
