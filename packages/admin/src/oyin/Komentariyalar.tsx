// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 💬 KOMENTARIYALAR — K8 moderatsiya navbati (OYIN_KARTA_PLAN.md §13)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `Hikoyalar.tsx` bilan BIR XIL naqsh (moderatsiya navbati sahifasi), lekin moderatsiya YO'NALISHI
// teskari: komentariya DARHOL active (oldindan tekshiruv YO'Q — ega tasdig'i 2026-08-16), bu yerga
// faqat 3-shikoyat olganlar ("hidden") tushadi. Standart ko'rinish shu navbat; "Hammasini ko'rsat"
// bilan tarix (active/removed) ham ko'rinadi.
import { useState } from "react";
import type { OyinAdminCommentRow } from "@t1067/shared";
import { adminApi } from "../api";
import { ago } from "../lib/fmt";
import { Badge, Btn, Card, Chip, ErrBox, Note, Skeleton, Stat, useLoad, useToast } from "./ui";

export function Komentariyalar({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [all, setAll] = useState(false);
  const r = useLoad(() => adminApi.oyinComments(all ? "" : "hidden").then((x) => x.rows), [all]);
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (row: OyinAdminCommentRow, fn: () => Promise<{ ok: boolean }>, okMsg: string): Promise<void> => {
    setBusy(row.id);
    try {
      const res = await fn();
      toast(res.ok ? okMsg : "Bajarilmadi", res.ok ? "ok" : "bad");
      if (res.ok) { r.reload(); onChanged(); }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Bajarilmadi", "bad");
    } finally {
      setBusy(null);
    }
  };

  const rows = r.data ?? [];
  if (r.err) return <ErrBox err={r.err} onRetry={r.reload} />;

  return (
    <>
      <div className="oy-grid oy-g4">
        <Stat k="Navbatda" v={r.data ? rows.filter((x) => x.status === "hidden").length : "…"} s="shikoyat qilingan" tone={rows.some((x) => x.status === "hidden") ? "warn" : "ok"} />
        <Stat k="Ko'rinish" v={all ? "hammasi" : "faqat navbat"} s="tarixni ham ko'rish mumkin" />
        <Stat k="Moderatsiya" v="KEYIN" s="darhol active, 3-shikoyat yashiradi" />
        <Stat k="Bloklash" v="komentariyaga xos" s="o'yindan chetlatmaydi" />
      </div>

      <Card
        title="🛡 Shikoyat navbati"
        sub="matnni o'qing — kerak bo'lsa qaytaring, olib tashlang yoki yozuvchini bloklang"
        head={<span className="oy-spacer"><Chip on={all} onClick={() => setAll((v) => !v)}>Tarixni ham ko'rsat</Chip></span>}
        flush
      >
        {!r.data ? <div className="oy-card-b"><Skeleton rows={5} h={64} /></div>
          : rows.length === 0 ? <div className="oy-card-b oy-dim">✅ Shikoyat qilingan komentariya yo'q.</div>
            : rows.map((c) => (
              <div key={c.id} className={c.status === "hidden" ? "oy-task oy-task-warn" : "oy-task"}>
                <div className="oy-ava">{c.authorName.slice(0, 2).toUpperCase()}</div>
                <span className="oy-task-x">
                  <b>{c.authorName}</b> <span className="oy-sub oy-mono">#{c.memberId}</span>
                  {c.banned && <Badge tone="bad">bloklangan</Badge>}
                  <div className="oy-dim3">
                    «{c.prizeName}» ostida · {ago(c.createdAt)} · {c.reports > 0 ? <span className="oy-err">{c.reports} shikoyat</span> : "shikoyatsiz"} · holat: {c.status}
                  </div>
                  <div className="oy-dim" style={{ marginTop: 4 }}>{c.text}</div>
                </span>
                {c.status === "hidden" && (
                  <Btn sm variant="pri" disabled={busy === c.id} onClick={() => void act(c, () => adminApi.oyinCommentApprove(c.id), "✅ Qaytarildi — yana ko'rinadi")}>✅ Qaytarish</Btn>
                )}
                {c.status !== "removed" && (
                  <Btn sm variant="dgr" disabled={busy === c.id} onClick={() => void act(c, () => adminApi.oyinCommentRemove(c.id), "🗑 Olib tashlandi")}>🗑 O'chirish</Btn>
                )}
                <Btn sm variant={c.banned ? undefined : "dgr"} disabled={busy === c.id} onClick={() => void act(c, () => adminApi.oyinSetCommentBan(c.memberId, !c.banned), c.banned ? "Blokdan chiqarildi" : "🚫 Bloklandi")}>
                  {c.banned ? "Blokdan chiqarish" : "🚫 Bloklash"}
                </Btn>
              </div>
            ))}
      </Card>

      <Note>
        Bloklash faqat <b>komentariya yozishdan</b> mahrum qiladi — botdan, safardan, o'yindan
        chetlatmaydi (bu boshqa tugma, "Odamlar"da). Eski komentariyalari bloklashdan keyin ham
        ko'rinishda qoladi. "🗑 O'chirish" <b>abadiy</b> — qayta yozib ham qaytmaydi.
      </Note>
    </>
  );
}
