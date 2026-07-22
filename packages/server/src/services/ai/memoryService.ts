// 💛 Koson AI o'z-xotira (feature "aidost"). The agent saves short conversational
// facts IN THE MEMBER'S OWN WORDS and recalls them only into that member's context.
// Hard walls: 20 notes/member (oldest evicted), ≤200 chars, digit-runs stripped
// (a note can never smuggle a phone/card number into a prompt), «meni unut» wipes all.
import { prisma } from "../../db";

const MAX_NOTES = 20;
const MAX_LEN = 200;

export async function saveNote(memberId: number, note: string): Promise<{ ok: boolean }> {
  const clean = note
    .replace(/\d{6,}/g, "[raqam]") // second wall — same rule as llmRouter.sanitize
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LEN);
  if (clean.length < 3) return { ok: false };
  await prisma.memberMemory.create({ data: { memberId, note: clean } });
  // evict beyond cap (oldest first) — one cheap indexed query
  const extra = await prisma.memberMemory.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    skip: MAX_NOTES,
    select: { id: true },
  });
  if (extra.length) await prisma.memberMemory.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  return { ok: true };
}

/** Notes for the agent's context — newest first, joined compactly. Null when empty. */
export async function recallNotes(memberId: number): Promise<string | null> {
  const rows = await prisma.memberMemory.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: MAX_NOTES,
    select: { note: true },
  });
  if (!rows.length) return null;
  return rows.map((r) => `• ${r.note}`).join("\n");
}

export async function listNotes(memberId: number): Promise<{ id: number; note: string }[]> {
  return prisma.memberMemory.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, select: { id: true, note: true } });
}

/** «meni unut» / unut(raqam) — idx is 1-based into the newest-first list; no idx = wipe all. */
export async function forget(memberId: number, idx?: number): Promise<{ ok: boolean; count: number }> {
  if (idx) {
    const rows = await listNotes(memberId);
    const row = rows[idx - 1];
    if (!row) return { ok: false, count: 0 };
    await prisma.memberMemory.delete({ where: { id: row.id } });
    return { ok: true, count: 1 };
  }
  const r = await prisma.memberMemory.deleteMany({ where: { memberId } });
  return { ok: true, count: r.count };
}
