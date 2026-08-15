// ◉ JONLI — hozir nima ketayotgani. Bitta ekranda taksi · bozor · reys.
//
// Manba: mavjud `getOpsDashboard()` (taksi/bozor/reys allaqachon
// birlashtirilgan, "uzoq kutmoqda" belgisi bilan) + kas'ning jonli
// buyurtmalari. Yangi backend ishi YO'Q.
// 🍽 Ovqat 2026-08-15 da chiqdi — restoran hamkorning tashqi mini-appi, jonli buyurtmalar u yerda.
import { useEffect, useState } from "react";
import type { AdminLiveBooking } from "@t1067/shared";
import { adminApi, type OprOpsRow } from "../../api";
import { DataTable, type Column } from "../../design/DataTable";
import { Badge, Button, ConfirmDialog, Dot, Panel, useToast } from "../../design/kit";
import { mins, num } from "../../lib/fmt";

const MODULE_LABEL: Record<OprOpsRow["module"], string> = {
  taxi: "🚕 Taksi",
  bazar: "🛒 Bozor",
  reys: "🚐 Reys",
};

type ModFilt = "all" | OprOpsRow["module"] | "stuck";

export function Jonli() {
  const toast = useToast();
  const [rows, setRows] = useState<OprOpsRow[] | null | undefined>(undefined);
  const [live, setLive] = useState<AdminLiveBooking[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filt, setFilt] = useState<ModFilt>("all");
  const [cancel, setCancel] = useState<OprOpsRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (): void => {
    setErr(null);
    adminApi
      .oprDashboard()
      .then((r) => setRows(r.rows))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    adminApi.bookings().then(setLive).catch(() => setLive(null));
  };
  useEffect(() => {
    load();
    const t = window.setInterval(load, 20_000);
    return () => window.clearInterval(t);
  }, []);

  const shown = (rows ?? null) && rows!.filter((r) => (filt === "all" ? true : filt === "stuck" ? r.stuck : r.module === filt));

  const doCancel = async (r: OprOpsRow): Promise<void> => {
    setBusy(true);
    // Har modul o'z bekor-amaliga ega (hammasi mavjud funksiyalarni qayta
    // ishlatadi: rejectMarketOrder / adminForceCancelTrip).
    const action = r.module === "bazar" ? "cancel_bazar" : r.module === "reys" ? "cancel_intercity" : "cancel_taxi";
    const params = r.module === "reys" ? { tripId: Number(r.id) } : { orderId: Number(r.id) };
    try {
      const res = await adminApi.oprAct(r.memberId ?? null, null, action, params);
      toast(res.message, res.ok ? "ok" : "bad");
      if (res.ok) load();
    } catch {
      toast("Bekor qilinmadi", "bad");
    } finally {
      setBusy(false);
      setCancel(null);
    }
  };

  const columns: Column<OprOpsRow>[] = [
    {
      key: "module",
      label: "Tur",
      sort: (r) => r.module,
      csv: (r) => r.module,
      render: (r) => <span className="a2-truncate">{MODULE_LABEL[r.module]}</span>,
    },
    {
      key: "title",
      label: "Buyurtma",
      sort: (r) => r.title,
      render: (r) => (
        <span className="a2-row">
          <Dot tone={r.stuck ? "bad" : "ok"} live={!r.stuck} />
          <span className="tb-main a2-truncate">{r.title}</span>
        </span>
      ),
    },
    { key: "status", label: "Holat", sort: (r) => r.status, render: (r) => <Badge tone={r.stuck ? "bad" : "info"}>{r.status}</Badge> },
    {
      key: "ageMin",
      label: "Yoshi",
      align: "num",
      sort: (r) => r.ageMin,
      csv: (r) => r.ageMin,
      render: (r) => (
        <span className={r.stuck ? "a2-delta-down" : undefined}>
          {mins(r.ageMin)}
          {r.stuck && " ⚠"}
        </span>
      ),
    },
    {
      key: "act",
      label: "",
      align: "mid",
      render: (r) => (
        <Button size="sm" variant="danger" onClick={() => setCancel(r)}>
          Bekor
        </Button>
      ),
    },
  ];

  const stuckN = (rows ?? []).filter((r) => r.stuck).length;

  return (
    <>
      <div className="a2-row-wrap">
        <Badge tone={stuckN > 0 ? "bad" : "ok"}>
          {stuckN > 0 ? `⚠ ${stuckN} ta uzoq kutmoqda` : "✓ Tiqilib qolgani yo'q"}
        </Badge>
        {live && <Badge tone="info">🚕 kas'da {num(live.length)} faol taksi</Badge>}
        <span className="a2-dim-2">har 20 soniyada yangilanadi</span>
      </div>

      <Panel flush>
        <DataTable
          rows={shown}
          error={err}
          onRetry={load}
          columns={columns}
          rowKey={(r) => `${r.module}-${r.id}`}
          rowTone={(r) => (r.stuck ? "bad" : undefined)}
          searchText={(r) => `${r.title} ${r.status} ${r.module}`}
          searchPlaceholder="Buyurtma, holat…"
          chips={[
            { label: "Hammasi", active: filt === "all", onClick: () => setFilt("all") },
            { label: "⚠ Tiqilgan", active: filt === "stuck", onClick: () => setFilt("stuck") },
            { label: "🛒 Bozor", active: filt === "bazar", onClick: () => setFilt("bazar") },
            { label: "🚕 Taksi", active: filt === "taxi", onClick: () => setFilt("taxi") },
            { label: "🚐 Reys", active: filt === "reys", onClick: () => setFilt("reys") },
          ]}
          exportName="jonli"
          emptyTitle="Hozir faol buyurtma yo'q"
          emptySub="Yangi buyurtma kelganda shu yerda darhol ko'rinadi."
          initialSort={{ key: "ageMin", dir: "desc" }}
          pageSize={100}
        />
      </Panel>

      <ConfirmDialog
        open={!!cancel}
        onClose={() => setCancel(null)}
        onConfirm={() => cancel && void doCancel(cancel)}
        busy={busy}
        title="Buyurtmani bekor qilamizmi?"
        body={
          <div className="a2-col">
            <span>{cancel?.title}</span>
            <span className="a2-dim">
              {cancel?.module === "bazar"
                ? "Tanga to'langan bo'lsa — avtomatik qaytariladi, mahsulot omborga qaytadi."
                : cancel?.module === "reys"
                  ? "Reysdagi barcha yo'lovchilar bekor qilinadi, chegirma tangasi qaytariladi."
                  : "Faol taksi buyurtmasi bekor qilinadi."}
            </span>
          </div>
        }
        confirmLabel="Bekor qilish"
        danger
      />
    </>
  );
}
