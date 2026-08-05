// 📸 HIKOYALAR — Koson O'yini hikoya-isbot moderatsiyasi.
//
// Eski panelda (`App.tsx` — v1) bor edi, v2'ga hali ko'chirilmagan edi (ega jonli sinovda
// topdi: hikoya yuborilgan, lekin v2 panelida umuman ko'rinmasdi — funksiya emas, ekran
// yo'q edi). Backend O'ZGARMAYDI: xuddi shu `adminApi.oyinStories`/`reviewOyinStory`.
//
// Avtomatik tasdiq YO'Q — havola haqiqiyligini faqat odam ko'radi, shuning uchun bu ekran bor.
import { useEffect, useState } from "react";
import type { OyinStoryAdminRow } from "@t1067/shared";
import { adminApi } from "../../api";
import { DataTable, type Column } from "../../design/DataTable";
import { Badge, Button, Field, Input, Modal, Panel, useToast } from "../../design/kit";
import { dt } from "../../lib/fmt";

export function Hikoyalar() {
  const toast = useToast();
  const [rows, setRows] = useState<OyinStoryAdminRow[] | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reject, setReject] = useState<OyinStoryAdminRow | null>(null);
  const [reason, setReason] = useState("Hikoya topilmadi");

  const load = (): void => {
    setErr(null);
    adminApi
      .oyinStories()
      .then((r) => setRows(r.rows))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => { load(); }, []);

  const review = async (r: OyinStoryAdminRow, approve: boolean, rejectReason?: string): Promise<void> => {
    setBusy(r.id);
    try {
      await adminApi.reviewOyinStory(r.memberId, r.id, approve, rejectReason);
      setRows((cur) => (cur ? cur.filter((x) => x.id !== r.id) : cur));
      toast(approve ? "✅ Tasdiqlandi — ball tushdi" : "❌ Rad etildi", "ok");
    } catch {
      toast("Bajarilmadi — qayta urinib ko'ring", "bad");
    } finally {
      setBusy(null);
      setReject(null);
    }
  };

  const columns: Column<OyinStoryAdminRow>[] = [
    { key: "name", label: "Mijoz", sort: (r) => r.name, render: (r) => <span className="tb-main">{r.name}</span> },
    {
      key: "url", label: "Havola",
      render: (r) => (
        <a href={r.url} target="_blank" rel="noreferrer" className="a2-truncate tb-link">
          {r.url}
        </a>
      ),
    },
    {
      key: "hoursWaiting", label: "Kutgan", align: "num", sort: (r) => r.hoursWaiting,
      render: (r) => <span className={r.hoursWaiting >= 24 ? "a2-delta-down" : undefined}>{r.hoursWaiting} soat{r.hoursWaiting >= 24 && " ⚠"}</span>,
    },
    { key: "approvedInSeason", label: "Mavsumda", align: "num", sort: (r) => r.approvedInSeason },
    { key: "at", label: "Yuborilgan", sort: (r) => r.at, render: (r) => <span className="tb-sub">{dt(r.at)}</span> },
    {
      key: "act", label: "", align: "mid",
      render: (r) => (
        <div className="a2-row">
          <Button size="sm" variant="primary" loading={busy === r.id} onClick={() => void review(r, true)}>
            ✅ Tasdiqlash
          </Button>
          <Button size="sm" variant="danger" disabled={busy === r.id} onClick={() => { setReason("Hikoya topilmadi"); setReject(r); }}>
            ❌ Rad
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="a2-row-wrap">
        <Badge tone={(rows?.length ?? 0) > 0 ? "warn" : "ok"}>
          {(rows?.length ?? 0) > 0 ? `⏳ ${rows?.length} ta kutmoqda` : "✓ Kutilayotgan ariza yo'q"}
        </Badge>
        <span className="a2-dim-2">
          Mijoz posterni hikoyasiga qo'yib havolasini yuboradi — havolani ochib ko'ring, hikoya rostdan bormi.
          Tasdiqlansa ball darhol tushadi va mijozga xabar boradi. 24 soatdan oshgani qizil.
        </span>
      </div>

      <Panel flush>
        <DataTable
          rows={rows}
          error={err}
          onRetry={load}
          columns={columns}
          rowKey={(r) => r.id}
          searchText={(r) => `${r.name} ${r.url}`}
          searchPlaceholder="Mijoz, havola…"
          exportName="hikoyalar"
          emptyTitle="Kutilayotgan hikoya-ariza yo'q"
          emptySub="Mijoz story yuborganda shu yerda darhol ko'rinadi."
          initialSort={{ key: "at", dir: "asc" }}
          pageSize={100}
        />
      </Panel>

      <Modal
        open={!!reject}
        onClose={() => setReject(null)}
        title="Hikoyani rad etish"
        width={420}
        footer={
          <div className="a2-row">
            <div className="a2-spacer" />
            <Button size="sm" onClick={() => setReject(null)}>Bekor</Button>
            <Button
              size="sm" variant="danger" loading={busy === reject?.id} disabled={!reason.trim()}
              onClick={() => reject && void review(reject, false, reason.trim())}
            >
              Rad etish
            </Button>
          </div>
        }
      >
        <Field label="Sabab (mijozga aynan shu matn boradi)">
          <Input value={reason} onChange={setReason} placeholder="masalan: Hikoya topilmadi" autoFocus />
        </Field>
      </Modal>
    </>
  );
}
