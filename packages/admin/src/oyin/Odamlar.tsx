// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ◍ ODAMLAR — «kengroq kirib boradigan nazorat» (ega talabi 2026-08-10)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Eski panelda ball bo'yicha ro'yxat UMUMAN yo'q edi va panelning o'zi buni tan olardi:
// «serverda ball bo'yicha saralangan ro'yxat qaytaradigan route yo'q» (App.tsx:6020).
// Ega kim eng ko'p ball to'plaganini KO'RA OLMASDI.
//
// Ikkita ekran:
//   🏆 Reyting — 8 ustun, har biri saralanadi, 6 ta tayyor shubha-kesimi, CSV
//   📜 Faoliyat jurnali — MIJOZ ball voqealari (audit jurnalidan FARQ qiladi, Sozlamada)
import { useMemo, useState } from "react";
import type { OyinActivityAction, OyinAdminMemberDetail, OyinLeaderRow } from "@t1067/shared";
import { adminApi } from "../api";
import { csvName, downloadCsv } from "../lib/csv";
import { ago, num, phone as fmtPhone } from "../lib/fmt";
import { Badge, Btn, Card, Chip, Drawer, ErrBox, Mini, Note, Skeleton, Stat, Table, useLoad, useToast, type Col } from "./ui";

type Sub = "reyting" | "jurnal";
type Filt = "all" | "risk" | "norides" | "cards" | "ban" | "adjust";

const FILTERS: { id: Filt; label: string; risk?: boolean; test: (r: OyinLeaderRow) => boolean }[] = [
  { id: "all", label: "Hammasi", test: () => true },
  { id: "risk", label: "⚠ Shubhali", risk: true, test: (r) => r.risk.score > 0 },
  { id: "norides", label: "Safarsiz ball", test: (r) => r.risk.flags.includes("ballWithoutRides") },
  { id: "cards", label: "Karta yig'gan", test: (r) => r.risk.flags.includes("cardHoarding") },
  { id: "adjust", label: "Qo'lda berilgan", test: (r) => r.adjust !== 0 },
  { id: "ban", label: "Chetlanganlar", test: (r) => r.banned },
];

export function Odamlar() {
  const [sub, setSub] = useState<Sub>("reyting");
  return (
    <>
      <div className="oy-chips">
        <Chip on={sub === "reyting"} onClick={() => setSub("reyting")}>🏆 Reyting</Chip>
        <Chip on={sub === "jurnal"} onClick={() => setSub("jurnal")}>📜 Faoliyat jurnali</Chip>
      </div>
      {sub === "reyting" ? <Reyting /> : <Jurnal />}
    </>
  );
}

/* ── 🏆 REYTING ────────────────────────────────────────────────────────────────────────────── */
function Reyting() {
  const lb = useLoad(() => adminApi.oyinLeaderboard().then((r) => r.rows), []);
  const [filt, setFilt] = useState<Filt>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo(() => {
    const all = lb.data ?? [];
    const f = FILTERS.find((x) => x.id === filt) ?? FILTERS[0]!;
    const s = q.trim().toLowerCase();
    return all.filter((r) => {
      if (!f.test(r)) return false;
      if (!s) return true;
      return r.name.toLowerCase().includes(s) || (r.phone ?? "").includes(s) || String(r.memberId) === s;
    });
  }, [lb.data, filt, q]);

  if (lb.err) return <ErrBox err={lb.err} onRetry={lb.reload} />;
  if (!lb.data) return <Card title="🏆 Ball bo'yicha reyting"><Skeleton rows={8} /></Card>;

  const all = lb.data;
  const totalBall = all.reduce((s, r) => s + r.ball, 0);
  const cols: Col<OyinLeaderRow>[] = [
    {
      key: "name", label: "A'zo", sort: (r) => r.name,
      render: (r) => (
        <>
          <span className="oy-main">{r.name}</span> <span className="oy-sub oy-mono">#{r.memberId}</span>
          {r.banned && <> <Badge tone="bad">chetlangan</Badge></>}
          <div className="oy-sub">{r.phone ? fmtPhone(r.phone) : "telefon yo'q"}</div>
        </>
      ),
    },
    { key: "ball", label: "Ball", align: "r", sort: (r) => r.ball, render: (r) => <span className="oy-coin">{num(r.ball)}</span> },
    { key: "earned", label: "Yig'ilgan", align: "r", sort: (r) => r.earned, render: (r) => num(r.earned) },
    { key: "spent", label: "Sarflangan", align: "r", sort: (r) => r.spent, render: (r) => num(r.spent) },
    {
      key: "adjust", label: "Qo'lda", align: "r", sort: (r) => r.adjust,
      render: (r) => (r.adjust === 0 ? <span className="oy-dim3">—</span> : <span className={r.adjust > 0 ? "oy-chg" : "oy-sub"}>{r.adjust > 0 ? "+" : ""}{num(r.adjust)}</span>),
    },
    { key: "rides", label: "Safar", align: "r", sort: (r) => r.seasonRides, render: (r) => <span className={r.seasonRides < 5 ? "oy-err" : undefined}>{r.seasonRides}</span> },
    { key: "cards", label: "Karta", align: "r", sort: (r) => r.cards, render: (r) => r.cards },
    { key: "last", label: "Oxirgi safar", sort: (r) => r.lastRideAt ?? "", render: (r) => <span className="oy-sub">{r.lastRideAt ? ago(r.lastRideAt) : "hech qachon"}</span> },
    {
      key: "risk", label: "Xavf", sort: (r) => r.risk.score,
      render: (r) => (r.risk.score === 0
        ? <span className="oy-dim3">—</span>
        : <><Mini pct={r.risk.score} tone={r.risk.score >= 70 ? "bad" : r.risk.score >= 35 ? "warn" : "ok"} /> <span className="oy-sub oy-num">{r.risk.score}</span></>),
    },
  ];

  const exportCsv = (): void => {
    downloadCsv(csvName("oyin-odamlar"),
      ["A'zo", "ID", "Telefon", "Ball", "Yig'ilgan", "Sarflangan", "Qo'lda", "Safar", "Karta", "Oxirgi safar", "Xavf", "Sabablar"],
      rows.map((r) => [r.name, r.memberId, r.phone ?? "", r.ball, r.earned, r.spent, r.adjust, r.seasonRides, r.cards, r.lastRideAt ?? "", r.risk.score, r.risk.reasons.join(" · ")]));
  };

  return (
    <>
      <div className="oy-grid oy-g4">
        <Stat k="Ball egasi" v={num(all.length)} s="mavsumda ro'yxatda" />
        <Stat k="Jami ball" v={num(totalBall)} s="xalq qo'lida" tone="coin" />
        <Stat k="Shubhali" v={num(all.filter((r) => r.risk.score > 0).length)} s={`${all.filter((r) => r.risk.score >= 70).length} tasi og'ir`} tone={all.some((r) => r.risk.score > 0) ? "bad" : "ok"} />
        <Stat k="Chetlangan" v={num(all.filter((r) => r.banned).length)} s="karta ola olmaydi" />
      </div>

      <Card
        title="🏆 Ball bo'yicha reyting"
        sub={`${num(rows.length)} qator · ustunni bosib saralang`}
        head={
          <div className="oy-spacer oy-row">
            <input className="oy-inp oy-srch" placeholder="🔍 Ism, telefon yoki ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Btn sm onClick={exportCsv} disabled={rows.length === 0}>⬇ CSV</Btn>
          </div>
        }
        flush
      >
        <div className="oy-card-b-tight">
          <div className="oy-chips">
            {FILTERS.map((f) => (
              <Chip key={f.id} on={filt === f.id} risk={f.risk} onClick={() => setFilt(f.id)}>
                {f.label} <b>{all.filter(f.test).length}</b>
              </Chip>
            ))}
          </div>
        </div>
        <Table
          rows={rows} cols={cols} rowKey={(r) => r.memberId} onRow={(r) => setOpenId(r.memberId)}
          empty={all.length === 0 ? "Hali hech kim ball to'plamagan — mavsum boshlanmagan bo'lishi mumkin." : "Bu kesim bo'yicha odam yo'q."}
        />
      </Card>

      <Note>
        <b>Xavf balli — ayblov emas, tekshiruv navbati.</b> To'rt REAL signaldan hisoblanadi:
        safarsiz ball (45) · bitta mukofotga karta yig'ish (25) · bir kunda ko'p do'st (20) ·
        ballning yarmidan ko'pi qo'lda berilgani (10). <b>Avtomatik jazo yo'q</b> — chetlatish
        har doim sizning qaroringiz. «Kunlik ball shifti» signali ATAYLAB yo'q: kodda bunday
        shift mavjud emas, uni chizsak raqam o'ylab topilgan bo'lardi.
      </Note>

      {openId != null && <OdamDrawer memberId={openId} onClose={() => setOpenId(null)} onChanged={lb.reload} />}
    </>
  );
}

/* ── 👤 ODAM 360 ───────────────────────────────────────────────────────────────────────────── */
const BK_ROWS: { key: keyof OyinAdminMemberDetail["breakdown"]; label: string; color: string }[] = [
  { key: "rides", label: "Safarlar", color: "var(--c1)" },
  { key: "referJoin", label: "Do'st ulandi", color: "var(--c2)" },
  { key: "referFirstRide", label: "Do'st 1-safari", color: "var(--c2)" },
  { key: "referRides", label: "Do'st safarlari", color: "var(--c2)" },
  { key: "login", label: "Kunlik kirish", color: "var(--c4)" },
  { key: "quest", label: "Kunlik topshiriq", color: "var(--c4)" },
  { key: "story", label: "Hikoya-isbot", color: "var(--c5)" },
  { key: "streak", label: "Ketma-ketlik", color: "var(--c5)" },
  { key: "share", label: "Ulashish", color: "var(--c5)" },
  { key: "home", label: "Ekranga o'rnatish", color: "var(--c5)" },
  { key: "phone", label: "Telefon tasdiqlash", color: "var(--c5)" },
  { key: "sprintBonus", label: "Sprint bonusi", color: "var(--c6)" },
  { key: "jamoa", label: "Gashtak navbati", color: "var(--c6)" },
  { key: "adjust", label: "🛠 Qo'lda tuzatilgan", color: "var(--c3)" },
];

function OdamDrawer({ memberId, onClose, onChanged }: { memberId: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const d = useLoad(() => adminApi.oyinMember(memberId), [memberId]);
  const [busy, setBusy] = useState(false);

  // 🛡 R1 (2026-08-16): `reason` ixtiyoriy — mavjud chaqiruvchilar buzilmaydi, lekin
  // `oyinAdjustBall`ning yangi "too_large"/"season_cap" kabi sabablari endi ko'rinadi
  // ("Bajarilmadi — qayta urinib ko'ring" chalg'itardi — qayta urinish yordam BERMAYDI).
  const ADJUST_REASON_TEXT: Record<string, string> = {
    too_large: "Bitta tuzatish chegaradan katta — Sozlama → Ball jadvali'da chegarani ko'ring/oshiring",
    season_cap: "Bu a'zoga shu mavsumda tuzatishlar jami chegaraga yetdi",
    bad_input: "Raqam yoki sabab noto'g'ri",
    frozen: "Tiraj muzlatilgan — tuzatish yopiq",
    not_found: "Topilmadi",
  };
  const act = async (fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string): Promise<void> => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) { toast(okMsg, "ok"); d.reload(); onChanged(); }
      else toast(ADJUST_REASON_TEXT[r.reason ?? ""] ?? "Bajarilmadi — qayta urinib ko'ring", "bad");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Xato", "bad");
    } finally { setBusy(false); }
  };

  const m = d.data;
  const head = (
    <>
      <div className="oy-ava">{(m?.name ?? "?").slice(0, 2).toUpperCase()}</div>
      <div>
        <div className="oy-card-t">{m?.name ?? "Yuklanmoqda…"}</div>
        <div className="oy-dim">
          <span className="oy-mono">#{memberId}</span>
          {m?.banned && <> · <Badge tone="bad">chetlangan{m.banReason ? `: ${m.banReason}` : ""}</Badge></>}
        </div>
      </div>
      <div className="oy-spacer"><Btn sm variant="ghost" onClick={onClose}>✕</Btn></div>
    </>
  );

  const foot = m ? (
    <>
      <Btn variant="pri" disabled={busy} onClick={() => {
        const raw = window.prompt(`«${m.name}» ballini o'zgartirish.\n\nQancha? (manfiy ham bo'ladi, masalan -500)`, "500");
        if (raw == null) return;
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n) || n === 0) { toast("Raqam noto'g'ri", "bad"); return; }
        const reason = window.prompt("Sabab (MAJBURIY — mijozning jurnalida ko'rinadi):", "ega qarori");
        if (!reason?.trim()) { toast("Sabab yozilmadi — bekor qilindi", "warn"); return; }
        void act(() => adminApi.oyinAdjustBall(m.memberId, n, reason.trim()), `${n > 0 ? "+" : ""}${num(n)} ball yozildi · audit jurnaliga tushdi`);
      }}>🛠 Ball tuzatish</Btn>
      <Btn variant="dgr" disabled={busy} onClick={() => {
        if (m.banned) {
          if (!window.confirm(`«${m.name}» o'yinga QAYTARILSINMI?\n\nU yana karta ola oladi.`)) return;
          void act(() => adminApi.oyinSetBan(m.memberId, false, ""), "O'yinga qaytarildi");
          return;
        }
        const reason = window.prompt(`«${m.name}» o'yindan CHETLATILSINMI?\n\nChiptalari tirajdan chiqariladi, ball tarixi saqlanadi.\n\nSabab:`, "");
        if (reason == null) return;
        void act(() => adminApi.oyinSetBan(m.memberId, true, reason), "Chetlatildi — chiptalari tirajdan chiqdi");
      }}>{m.banned ? "✅ Qaytarish" : "⛔ Chetlatish"}</Btn>
    </>
  ) : undefined;

  return (
    <Drawer open onClose={onClose} head={head} foot={foot}>
      {d.err && <ErrBox err={d.err} onRetry={d.reload} />}
      {!d.data && !d.err && <Skeleton rows={6} />}
      {m && (
        <>
          <div className="oy-grid oy-g4">
            <Stat sm k="Ball" v={num(m.ball)} tone="coin" />
            <Stat sm k="Yig'ilgan" v={num(m.earned)} />
            <Stat sm k="Sarflangan" v={num(m.spent)} />
            <Stat sm k="Mavsum safari" v={num(m.seasonRides)} tone={m.seasonRides < 5 ? "bad" : undefined} />
          </div>

          <div>
            <div className="oy-sec">Ball qayerdan keldi</div>
            <Breakdown b={m.breakdown} />
            <div className="oy-dim3">
              Yig'indi <b>{num(m.earned)}</b> — yuqoridagi manbalar shunga TENG bo'lishi shart
              (aks holda mijoz uchun «yo'qolgan ball» bo'lardi).
            </div>
          </div>

          <div>
            <div className="oy-sec">Kartalari ({m.tickets.length})</div>
            {m.tickets.length === 0
              ? <div className="oy-dim">Hali karta olmagan.</div>
              : (
                <Table
                  rows={m.tickets} rowKey={(t) => t.gno}
                  cols={[
                    { key: "no", label: "№", render: (t) => <span className="oy-mono">№{t.gno}{t.test ? " 🧪" : ""}</span> },
                    { key: "prize", label: "Mukofot", render: (t) => <>{t.prizeIcon} {t.prizeName}</> },
                    { key: "price", label: "Baho", align: "r", render: (t) => <span className="oy-coin">{num(t.price)}</span> },
                    { key: "at", label: "Olingan", render: (t) => <span className="oy-sub">{ago(t.at)}</span> },
                    {
                      key: "act", label: "",
                      render: (t) => (
                        <Btn sm variant="dgr" disabled={busy} onClick={() => {
                          if (!window.confirm(`№${t.gno} («${t.prizeName}») kartasi BEKOR qilinsinmi?\n\nO'rin mukofotga qaytadi, ${num(t.price)} ball egasiga qaytariladi.\nBu amal qaytarilmaydi.`)) return;
                          void act(() => adminApi.oyinCancelTicket(m.memberId, t.gno), `№${t.gno} bekor qilindi — ball qaytdi`);
                        }}>♻️</Btn>
                      ),
                    },
                  ]}
                />
              )}
          </div>

          {m.adjustLog.length > 0 && (
            <div>
              <div className="oy-sec">🛠 Qo'lda tuzatishlar tarixi</div>
              <Table
                rows={m.adjustLog} rowKey={(a) => `${a.at}-${a.ball}`}
                cols={[
                  { key: "at", label: "Qachon", render: (a) => <span className="oy-sub">{ago(a.at)}</span> },
                  { key: "ball", label: "Ball", align: "r", render: (a) => <span className={a.ball > 0 ? "oy-add" : "oy-err"}>{a.ball > 0 ? "+" : ""}{num(a.ball)}</span> },
                  { key: "reason", label: "Sabab", render: (a) => a.reason || <span className="oy-dim3">—</span> },
                ]}
              />
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

function Breakdown({ b }: { b: OyinAdminMemberDetail["breakdown"] }) {
  const rows = BK_ROWS.map((r) => ({ ...r, v: Number(b[r.key] ?? 0) })).filter((r) => r.v !== 0);
  if (rows.length === 0) return <div className="oy-dim">Hali ball yig'ilmagan.</div>;
  const max = Math.max(...rows.map((r) => Math.abs(r.v)));
  return (
    <div className="oy-bk">
      {rows.map((r) => (
        <div className="oy-bk-r" key={String(r.key)}>
          <span className="oy-dim">{r.label}</span>
          <span className="oy-bk-t"><i style={{ width: `${(Math.abs(r.v) / max) * 100}%`, background: r.v < 0 ? "var(--bad)" : r.color }} /></span>
          <span className="oy-bk-v">{r.v > 0 ? "" : "−"}{num(Math.abs(r.v))}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 📜 FAOLIYAT JURNALI ───────────────────────────────────────────────────────────────────── */
const ACT_LABEL: Record<string, string> = {
  ride: "🚕 Safar", first_ride: "🚕 Birinchi safar", phone: "📱 Telefon",
  refer_join: "🤝 Do'st ulandi", refer_first_ride: "🤝 Do'st 1-safari", refer_ride: "🤝 Do'st safari",
  login: "📲 Kirish", share: "📣 Ulashish", quest: "🎯 Topshiriq", home: "🏠 Ekranga o'rnatish",
  story: "📸 Hikoya", streak: "🔥 Ketma-ketlik", sprint_bonus: "🏁 Sprint", ticket_buy: "🎟 Karta xaridi",
  adjust: "🛠 Qo'lda tuzatish", jamoa: "👑 Gashtak",
};

function Jurnal() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<OyinActivityAction | "">("");
  const r = useLoad(() => adminApi.oyinActivity({ page, ...(action ? { action } : {}) }), [page, action]);

  if (r.err) return <ErrBox err={r.err} onRetry={r.reload} />;

  const data = r.data;
  const kinds = Object.keys(ACT_LABEL) as OyinActivityAction[];

  return (
    <>
      <Card
        title="📜 Faoliyat jurnali"
        sub="MIJOZ ball voqealari — «ballim qayerdan keldi» savoliga javob"
        head={data ? <span className="oy-spacer oy-dim3">{num(data.total)} yozuv</span> : undefined}
        flush
      >
        <div className="oy-card-b-tight">
          <div className="oy-chips">
            <Chip on={action === ""} onClick={() => { setAction(""); setPage(1); }}>Hammasi</Chip>
            {kinds.map((k) => <Chip key={k} on={action === k} onClick={() => { setAction(k); setPage(1); }}>{ACT_LABEL[k]}</Chip>)}
          </div>
        </div>
        {!data ? <div className="oy-card-b"><Skeleton rows={8} /></div> : (
          <>
            <Table
              rows={data.rows} rowKey={(a) => `${a.at}-${a.memberId}-${a.action}-${a.ball}`}
              cols={[
                { key: "at", label: "Vaqt", render: (a) => <span className="oy-sub oy-mono">{ago(a.at)}</span> },
                { key: "who", label: "Kim", render: (a) => <><span className="oy-main">{a.name}</span> <span className="oy-sub oy-mono">#{a.memberId}</span></> },
                { key: "act", label: "Nima", render: (a) => ACT_LABEL[a.action] ?? a.action },
                { key: "ball", label: "Ball", align: "r", render: (a) => <span className={a.ball >= 0 ? "oy-add" : "oy-err"}>{a.ball > 0 ? "+" : ""}{num(a.ball)}</span> },
                { key: "chain", label: "Yordam zanjiri", render: (a) => a.helpedName ? <span className="oy-sub">{a.helpedName}</span> : <span className="oy-dim3">—</span> },
                { key: "note", label: "Izoh", render: (a) => a.note ? <span className="oy-sub">{a.note}</span> : <span className="oy-dim3">—</span> },
              ]}
              empty="Bu filtr bo'yicha yozuv yo'q."
            />
            <div className="oy-card-b-tight oy-row">
              <span className="oy-dim3">{num((data.page - 1) * data.pageSize + 1)}–{num(Math.min(data.page * data.pageSize, data.total))} / {num(data.total)}</span>
              <div className="oy-spacer oy-row">
                <Btn sm disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Oldingi</Btn>
                <Btn sm disabled={data.page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>Keyingi →</Btn>
              </div>
            </div>
          </>
        )}
      </Card>
      <Note>
        Bu jurnal <b>mijoz</b> ball voqealari haqida. <b>Sizning</b> amallaringiz (narx o'zgardi,
        mavsum surildi, muzlatildi) alohida — «⚙ Sozlama → 🧾 Audit jurnali» da.
      </Note>
    </>
  );
}
