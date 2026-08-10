// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 📸 HIKOYALAR — hikoya-isbot moderatsiyasi
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Ega 2026-08-10 da so'radi: «story check qani?». Konsolning birinchi maketida bu tushib qolgan
// edi — eski panelda `StoryModerationCard` bo'lib «Amallar» tabida yashiringan edi.
//
// ⚠️ AVTOMATIK TASDIQ YO'Q va bo'lmaydi: havola haqiqiyligini faqat odam ko'ra oladi.
// Tasdiqlansa ball darhol hisoblanadi (kesh bekor qilinadi), rad etilsa SABAB mijozga boradi.
import { useMemo, useState } from "react";
import type { OyinStoryAdminRow } from "@t1067/shared";
import { adminApi } from "../api";
import { ago } from "../lib/fmt";
import { Badge, Btn, Card, Chip, ErrBox, Modal, Note, Skeleton, Stat, Table, useLoad, useToast } from "./ui";

const REASONS = ["Hikoya topilmadi", "Havola ochilmadi", "Poster ko'rinmayapti", "Hikoya o'chirilgan"];

export function Hikoyalar({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [all, setAll] = useState(false);
  const r = useLoad(() => adminApi.oyinStories(all).then((x) => x.rows), [all]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reject, setReject] = useState<OyinStoryAdminRow | null>(null);
  const [reason, setReason] = useState(REASONS[0]!);

  const review = async (row: OyinStoryAdminRow, approve: boolean, why?: string): Promise<void> => {
    setBusy(row.id);
    try {
      await adminApi.reviewOyinStory(row.memberId, row.id, approve, why);
      toast(approve ? "✅ Tasdiqlandi — ball darhol tushdi, mijozga xabar ketdi" : "❌ Rad etildi — sabab yuborildi", approve ? "ok" : "warn");
      r.reload();
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Bajarilmadi", "bad");
    } finally { setBusy(null); setReject(null); }
  };

  const rows = r.data ?? [];
  const overdue = useMemo(() => rows.filter((x) => x.hoursWaiting >= 24).length, [rows]);

  if (r.err) return <ErrBox err={r.err} onRetry={r.reload} />;

  return (
    <>
      <div className="oy-grid oy-g4">
        <Stat k="Navbatda" v={r.data ? rows.length : "…"} s="tekshiruv kutmoqda" tone={rows.length > 0 ? "warn" : "ok"} />
        <Stat k="24 soatdan oshgan" v={r.data ? overdue : "…"} s="mijoz kutib qoldi" tone={overdue > 0 ? "bad" : "ok"} />
        <Stat k="Ko'rinish" v={all ? "hammasi" : "faqat navbat"} s="tarixni ham ko'rish mumkin" />
        <Stat k="Avtomatik tasdiq" v="YO'Q" s="faqat odam ko'radi" />
      </div>

      <Card
        title="📸 Tekshiruv navbati"
        sub="havolani OCHIB ko'ring — hikoya rostdan bormi"
        head={<span className="oy-spacer"><Chip on={all} onClick={() => setAll((v) => !v)}>Tarixni ham ko'rsat</Chip></span>}
        flush
      >
        {!r.data ? <div className="oy-card-b"><Skeleton rows={5} h={56} /></div>
          : rows.length === 0 ? <div className="oy-card-b oy-dim">✅ Kutilayotgan ariza yo'q — hammasi ko'rib chiqilgan.</div>
            : rows.map((s) => (
              <div key={s.id} className={s.hoursWaiting >= 24 ? "oy-task oy-task-bad" : "oy-task oy-task-warn"}>
                <div className="oy-ava">{s.name.slice(0, 2).toUpperCase()}</div>
                <span className="oy-task-x">
                  <b>{s.name}</b> <span className="oy-sub oy-mono">#{s.memberId}</span>
                  <div className="oy-dim3">
                    Mavsumda {s.approvedInSeason} ta tasdiqlangan · {s.hoursWaiting >= 24
                      ? <span className="oy-err">{s.hoursWaiting} soat kutmoqda ⚠</span>
                      : <>{s.hoursWaiting} soat kutmoqda</>}
                  </div>
                </span>
                <a className="oy-btn oy-btn-sm" href={s.url} target="_blank" rel="noreferrer">🔗 Havolani ochish</a>
                <Btn sm variant="pri" disabled={busy === s.id} onClick={() => void review(s, true)}>✅ Tasdiqlash</Btn>
                <Btn sm variant="dgr" disabled={busy === s.id} onClick={() => { setReason(REASONS[0]!); setReject(s); }}>❌ Rad</Btn>
              </div>
            ))}
      </Card>

      <Note>
        Tasdiqlansa ball <b>darhol</b> hisoblanadi va mijozga xabar boradi. Rad etilsa —
        siz yozgan sabab <b>aynan shu matn bilan</b> mijozga yetadi, shuning uchun aniq yozing.
        24 soatdan oshgan ariza qizil: mijoz javob kutib turibdi.
      </Note>

      <Modal open={!!reject} onClose={() => setReject(null)}>
        <div className="oy-card-h">
          <span className="oy-card-t">Hikoyani rad etish</span>
          <span className="oy-spacer"><Btn sm variant="ghost" onClick={() => setReject(null)}>✕</Btn></span>
        </div>
        <div className="oy-card-b oy-col">
          <div className="oy-dim">Sabab <b>aynan shu matn bilan</b> {reject?.name} ga boradi.</div>
          <div className="oy-chips">
            {REASONS.map((x) => <Chip key={x} on={reason === x} onClick={() => setReason(x)}>{x}</Chip>)}
          </div>
          <input className="oy-inp" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="oy-drw-f">
          <Btn variant="ghost" onClick={() => setReject(null)}>Bekor</Btn>
          <span className="oy-spacer">
            <Btn variant="dgr" disabled={!reason.trim() || busy === reject?.id} onClick={() => reject && void review(reject, false, reason.trim())}>Rad etish</Btn>
          </span>
        </div>
      </Modal>
    </>
  );
}
