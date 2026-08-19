// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 💳 KARTALAR & TIRAJ — reyestr + mukofot kuni
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Eski panelda karta olingan SANA ustuni yo'q edi — server eksporti `ts` maydonini tashlab
// ketardi (ma'lumot bazada BOR edi). «Kim qachon karta oldi» savoliga javob bermas edi.
// Endi sana qaytdi (S4).
//
// ⚠️ DASTUR G'OLIBNI TANLAMAYDI — buni bloger jismonan qiladi. Dastur ro'yxat BUTUNLIGINI
// kafolatlaydi: muzlatilgan ro'yxat + hash ommaga chiqadi, kiritilgan raqam tekshiriladi.
import { useMemo, useState } from "react";
import type { OyinAdminPrizeRow, OyinDrawTicketRow, OyinExcludedTicketRow, OyinWinner } from "@t1067/shared";
import { OYIN_EXCLUDE_REASON_LABEL } from "@t1067/shared";
import { adminApi } from "../api";
import { csvName, downloadCsv } from "../lib/csv";
import { ago, dt, num } from "../lib/fmt";
import { Badge, Btn, Card, Chip, ErrBox, Note, Skeleton, Stat, Table, useLoad, useToast, type Col } from "./ui";

export function Kartalar({ onChanged }: { onChanged: () => void }) {
  const d = useLoad(async () => {
    const [exp, catalog, winners, freeze] = await Promise.all([
      adminApi.oyinDraw(),
      adminApi.oyinCatalog().then((r) => r.prizes),
      adminApi.oyinWinners().then((r) => r.winners),
      adminApi.oyinFreeze(),
    ]);
    return { exp, catalog, winners, freeze };
  }, []);
  const toast = useToast();
  const [q, setQ] = useState("");
  const [prizeKey, setPrizeKey] = useState("");
  const [busy, setBusy] = useState(false);

  if (d.err) return <ErrBox err={d.err} onRetry={d.reload} />;
  if (!d.data) return <Card title="💳 Kartalar"><Skeleton rows={8} /></Card>;
  const { exp, catalog, winners, freeze } = d.data;

  const prizeOf = (k: string): OyinAdminPrizeRow | undefined => catalog.find((p) => p.key === k);
  const winnerByPrize = new Map(winners.map((w) => [w.prizeKey, w]));
  // 🔴 O13 (2026-08-11 audit, tuzatildi 2026-08-13): avval bu yerda `sold >= p.limit` (100%
  // to'lish) o'z holicha hisoblanardi — server esa `sold >= minSell` (`oyinMinSellPct` knobi,
  // odatda < 100%) bo'yicha chiqaradi. `oyinMinSellPct` 100dan past qilib sozlansa, server
  // allaqachon tirajga tayyor deb bilgan sovrin bu ro'yxatda UMUMAN ko'rinmasdi. `p.willDraw`
  // — server AYNAN shu hisobdan yuborgan tayyor maydon, qayta hisoblash shart emas edi.
  const ready = catalog.filter((p) => p.active && p.queued !== true && p.willDraw && !winnerByPrize.has(p.key));

  const rows = exp.tickets.filter((t) => {
    if (prizeKey && t.prizeKey !== prizeKey) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return t.name.toLowerCase().includes(s) || String(t.ticketNo) === s || String(t.memberId) === s;
  });

  const statusOf = (t: OyinDrawTicketRow): { label: string; tone: "ok" | "warn" | "mute" } => {
    const w = winnerByPrize.get(t.prizeKey);
    if (w && w.gno === t.ticketNo) return { label: `🏆 G'OLIB${w.handedAt ? " · topshirildi" : " · topshirilmagan"}`, tone: "ok" };
    if (w) return { label: "tiraj o'tdi", tone: "mute" };
    const p = prizeOf(t.prizeKey);
    if (p && p.willDraw) return { label: "📦 to'lgan — tiraj kutmoqda", tone: "warn" };
    return { label: "🎟 tirajda", tone: "mute" };
  };

  const cols: Col<OyinDrawTicketRow>[] = [
    { key: "no", label: "Karta №", sort: (t) => t.ticketNo, render: (t) => <span className="oy-mono oy-main">№{t.ticketNo}</span> },
    { key: "prize", label: "Mukofot", sort: (t) => prizeOf(t.prizeKey)?.name ?? t.prizeKey, render: (t) => <>{prizeOf(t.prizeKey)?.icon ?? "🎁"} {prizeOf(t.prizeKey)?.name ?? t.prizeKey}</> },
    { key: "owner", label: "Egasi", sort: (t) => t.name, render: (t) => <>{t.name} <span className="oy-sub oy-mono">#{t.memberId}</span></> },
    // 📅 S4 — eski panelda bu ustun YO'Q edi.
    { key: "at", label: "Olingan", sort: (t) => t.at ?? "", render: (t) => (t.at ? <span className="oy-sub" title={dt(t.at)}>{ago(t.at)}</span> : <span className="oy-dim3">—</span>) },
    { key: "st", label: "Holat", render: (t) => { const s = statusOf(t); return <Badge tone={s.tone}>{s.label}</Badge>; } },
  ];

  const usedPrizes = [...new Set(exp.tickets.map((t) => t.prizeKey))];
  // Eski server (deploy hali chiqmagan) bu maydonni yubormaydi — panel yiqilmasin.
  const excluded = exp.excludedTickets ?? [];

  return (
    <>
      <div className="oy-grid oy-g4">
        <Stat k="Chiqarilgan karta" v={num(exp.tickets.length)} s="joriy mavsumda" />
        <Stat k="Tirajga tayyor" v={num(ready.length)} s="to'lgan mukofot" tone={ready.length > 0 ? "warn" : undefined} />
        <Stat k="Tiraj ro'yxati" v={freeze.frozen ? "🔒 muzlatilgan" : "🔓 ochiq"} s={freeze.frozen ? dt(freeze.at) : "yangi karta qo'shilishi mumkin"} tone={freeze.frozen ? "warn" : undefined} />
        <Stat k="G'oliblar" v={num(winners.length)} s={`${winners.filter((w) => !w.handedAt).length} tasi topshirilmagan`} tone={winners.some((w) => !w.handedAt) ? "warn" : undefined} />
      </div>

      <Card
        title="🎬 Mukofot kuni"
        sub={ready.length > 0 ? `${ready.length} ta mukofot tayyor` : "hozircha tayyor mukofot yo'q"}
        head={
          <div className="oy-spacer oy-row">
            <Btn disabled={busy} onClick={() => {
              const next = !freeze.frozen;
              if (!window.confirm(next
                ? `Tiraj ro'yxati MUZLATILSINMI?\n\nShu lahzadan HECH KIM (siz ham) karta qo'sha olmaydi.\nRo'yxatda ${num(exp.tickets.length)} ta karta.`
                : "Tiraj ochilsinmi? Karta xaridi qayta ishlaydi.")) return;
              setBusy(true);
              void adminApi.setOyinFreeze(next).then(() => {
                toast(next ? "🔒 Ro'yxat muzlatildi" : "🔓 Tiraj ochildi", "warn");
                d.reload(); onChanged();
              }).finally(() => setBusy(false));
            }}>{freeze.frozen ? "🔓 Muzlatishni bekor qilish" : "🔒 Ro'yxatni muzlatish"}</Btn>
          </div>
        }
        flush
      >
        {ready.length === 0
          ? <div className="oy-card-b oy-dim">Mukofot HAMMA kartasi sotilganda tirajga tayyor bo'ladi. Hozircha to'lgani yo'q.</div>
          : ready.map((p) => <DrawRow key={p.key} prize={p} onDone={() => { d.reload(); onChanged(); }} />)}
      </Card>

      {winners.length > 0 && (
        <Card title="🏆 G'oliblar" sub="bayonnoma: hash · guvoh · topshirish" flush>
          <Table
            rows={winners} rowKey={(w) => w.prizeKey}
            cols={[
              { key: "prize", label: "Mukofot", render: (w) => <><span className="oy-main">{w.prizeName}</span><div className="oy-sub">{w.prizeValueLabel}</div></> },
              { key: "who", label: "G'olib", render: (w) => <>№{w.gno} · {w.name} <span className="oy-sub oy-mono">#{w.memberId}</span></> },
              { key: "pool", label: "Nechtadan", align: "r", render: (w) => num(w.poolSize) },
              { key: "at", label: "Tortilgan", render: (w) => <span className="oy-sub">{dt(w.drawnAt)}</span> },
              { key: "hash", label: "Hash", render: (w) => <span className="oy-mono oy-sub">{w.listHash.slice(0, 12)}…</span> },
              {
                key: "hand", label: "Topshirish",
                render: (w) => (w.handedAt
                  ? <Badge tone="ok">✓ {dt(w.handedAt)}</Badge>
                  : <Btn sm variant="pri" onClick={() => {
                    const url = window.prompt("Topshirish fotosining havolasi (ixtiyoriy — bo'sh qoldirsangiz ham belgilanadi):", "");
                    if (url == null) return;
                    void adminApi.oyinMarkHandover(w.prizeKey, url.trim() || null).then(() => { toast("✓ Topshirildi deb belgilandi", "ok"); d.reload(); });
                  }}>Topshirildi</Btn>),
              },
            ]}
          />
        </Card>
      )}

      <Card
        title="💳 Karta reyestri"
        sub={`${num(rows.length)} qator · jonli efirda o'qiladigan ro'yxat`}
        head={
          <div className="oy-spacer oy-row">
            <input className="oy-inp oy-srch" placeholder="🔍 Egasi, karta № yoki ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Btn sm disabled={rows.length === 0} onClick={() => downloadCsv(csvName("oyin-kartalar"), ["Karta", "Mukofot", "Egasi", "MemberID", "Olingan", "Holat"], rows.map((t) => [t.ticketNo, prizeOf(t.prizeKey)?.name ?? t.prizeKey, t.name, t.memberId, t.at ?? "", statusOf(t).label]))}>⬇ CSV</Btn>
          </div>
        }
        flush
      >
        <div className="oy-card-b-tight">
          <div className="oy-chips">
            <Chip on={prizeKey === ""} onClick={() => setPrizeKey("")}>Hammasi <b>{exp.tickets.length}</b></Chip>
            {usedPrizes.map((k) => (
              <Chip key={k} on={prizeKey === k} onClick={() => setPrizeKey(k)}>
                {prizeOf(k)?.icon ?? "🎁"} {prizeOf(k)?.name ?? k} <b>{exp.tickets.filter((t) => t.prizeKey === k).length}</b>
              </Chip>
            ))}
          </div>
        </div>
        <Table
          rows={rows}
          cols={cols}
          rowKey={(t) => `${t.prizeKey}-${t.ticketNo}`}
          empty={
            exp.tickets.length === 0
              ? (excluded.length > 0
                  ? `Tirajga kiruvchi karta yo'q — lekin ${excluded.length} ta karta CHIQARILGAN. Ular pastdagi jadvalda, sababi bilan.`
                  : "Hali birorta karta chiqarilmagan.")
              : "Bu filtr bo'yicha karta yo'q."
          }
        />
      </Card>

      {/* 🔴 2026-08-19 (ega: «kartalar admin panelga menga ko'rinmayopti, o'zimni kartam ham»):
          bu ekran TIRAJ hujjati — undan xodim/sinov/chetlatilgan kartalar va chegaraga yetmagan
          mukofotlar ATAYLAB chiqariladi (qoida to'g'ri, hash butunligi shunga bog'liq). Lekin
          natijada ega o'z kartasini HECH QAYERDA ko'rmasdi va ekran «hali birorta karta
          chiqarilmagan» deb YOLG'ON aytardi. Endi chiqarilganlar alohida jadvalda — kim · qaysi
          mukofot · karta № · NEGA chiqarilgan. Tiraj ro'yxati va hash O'ZGARMAYDI. */}
      {excluded.length > 0 && (
        <Card
          title="🚫 Tirajga kirmagan kartalar"
          sub={`${num(excluded.length)} ta — sotilgan, lekin qur'aga tushmaydi`}
          flush
        >
          <Table
            rows={excluded}
            rowKey={(t) => `${t.prizeKey}-${t.ticketNo}`}
            empty="—"
            cols={[
              { key: "no", label: "Karta №", sort: (t) => t.ticketNo, render: (t) => <span className="oy-mono oy-main">№{t.ticketNo}</span> },
              { key: "prize", label: "Mukofot", sort: (t) => prizeOf(t.prizeKey)?.name ?? t.prizeKey, render: (t) => <>{prizeOf(t.prizeKey)?.icon ?? "🎁"} {prizeOf(t.prizeKey)?.name ?? t.prizeKey}</> },
              { key: "owner", label: "Egasi", sort: (t) => t.name, render: (t) => <>{t.name} <span className="oy-sub oy-mono">#{t.memberId}</span></> },
              { key: "why", label: "Nega chiqarilgan", sort: (t) => t.reason, render: (t) => <Badge tone="mute">{OYIN_EXCLUDE_REASON_LABEL[t.reason] ?? t.reason}</Badge> },
            ] satisfies Col<OyinExcludedTicketRow>[]}
          />
        </Card>
      )}

      <Note>
        <b>Ro'yxatga kirmaganlar ochiq sanaladi</b> — jimgina yo'qolmaydi: {exp.excludedTest} ta sinov
        kartasi · {exp.excludedBanned} ta chetlatilgan a'zo kartasi · {exp.excludedStaff} ta xodim kartasi.
        {exp.skippedPrizes.length > 0 && <> Chegaraga yetmagani uchun tushmagan mukofotlar: {exp.skippedPrizes.map((s) => `${s.name} (${s.sold}/${s.minSell})`).join(", ")}.</>}
        <br />Xodim/ega kartasi tirajga KIRMAYDI — bu ataylab. Ularni bekor qilish uchun:
        ⚙️ Sozlama &amp; Audit → 🧪 Men → «🧹 Kartalarimni tozalash», yoki ◍ Odamlar → a'zoni oching → «Kartalari».
      </Note>
    </>
  );
}

/* ── TIRAJ QATORI ──────────────────────────────────────────────────────────────────────────── */
function DrawRow({ prize, onDone }: { prize: OyinAdminPrizeRow; onDone: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<Awaited<ReturnType<typeof adminApi.oyinDrawList>> | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (): Promise<void> => {
    setBusy(true);
    try { setList(await adminApi.oyinDrawList(prize.key)); }
    catch (e) { toast(e instanceof Error ? e.message : "Ro'yxat ochilmadi", "bad"); }
    finally { setBusy(false); }
  };

  const record = (): void => {
    if (!list) return;
    const raw = window.prompt(`«${prize.name}» — bloger tortgan karta RAQAMI:\n\nRo'yxatda ${list.cards.length} ta karta bor. Raqam ro'yxatda borligi tekshiriladi.`, "");
    if (raw == null) return;
    const gno = Math.round(Number(raw));
    if (!Number.isFinite(gno)) { toast("Raqam noto'g'ri", "bad"); return; }
    const note = window.prompt("Bayonnoma: bloger ismi, guvohlar, video havolasi:", "") ?? "";
    setBusy(true);
    void adminApi.oyinRecordWinner(prize.key, gno, note).then((r) => {
      if (r.ok) { toast(`🏆 G'olib qayd etildi: №${gno} — ${r.winner?.name ?? ""}`, "ok"); onDone(); }
      else toast(r.reason === "not_in_list" ? "⛔ Bu raqam ro'yxatda YO'Q — qayta tekshiring" : `⛔ ${r.reason ?? "bajarilmadi"}`, "bad");
    }).finally(() => setBusy(false));
  };

  return (
    <div className="oy-task oy-task-ok">
      <span className="oy-thumb">{prize.icon || "🎁"}</span>
      <span className="oy-task-x">
        <b>{prize.name}</b> — {prize.sold}/{prize.limit} karta sotildi · {prize.valueLabel}
        {list && (
          <div className="oy-dim3">
            Ro'yxat: {list.cards.length} ta karta · {list.excluded} tasi chiqarilgan ·
            hash <span className="oy-mono">{list.hash.slice(0, 16)}…</span>
            {list.frozenAt ? " · 🔒 muzlatilgan" : " · 🔓 hali muzlatilmagan"}
          </div>
        )}
      </span>
      {!list && <Btn sm disabled={busy} onClick={() => void open()}>Ro'yxatni ochish</Btn>}
      {list && <Btn sm variant="pri" disabled={busy} onClick={record}>🏆 G'olibni qayd etish</Btn>}
    </div>
  );
}
