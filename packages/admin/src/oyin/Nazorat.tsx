// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ◎ NAZORAT — panel VAZIFA aytadi, ega tahlil qilmasin
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Eski `OyinTodayCard` mantig'i SAQLANDI (u yaxshi ishlardi), lekin uch narsa qo'shildi:
//   · «Ball qayerda» voronkasi — har qator bosiladi, orqasidagi ro'yxatga olib boradi
//   · 🎯 Sig'im ekrani — eski panelda faqat TUGMA bor edi, nega kerakligini ko'rsatuvchi ekran yo'q
//   · 📊 Mavsum ko'rsatkichlari (eski `OyinSeasonMetricsCard`)
import type { OyinAdminPrizeRow, OyinCapacityView, OyinVitals, OyinWinner } from "@t1067/shared";
import { OYIN_CAPACITY_RATIO } from "@t1067/shared";
import { adminApi } from "../api";
import { num, short } from "../lib/fmt";
import type { OyinView } from "./Konsol";
import { Badge, Btn, Card, ErrBox, Note, Skeleton, Stat, useLoad, useToast } from "./ui";

interface Task { tone: "bad" | "warn" | "ok"; text: React.ReactNode; go?: OyinView; act?: { label: string; run: () => Promise<string> } }

export function Nazorat({ vitals, onGo }: { vitals: OyinVitals | null; onGo: (v: OyinView) => void }) {
  const toast = useToast();
  const data = useLoad(async () => {
    const [catalog, cap, winners] = await Promise.all([
      adminApi.oyinCatalog().then((r) => r.prizes),
      adminApi.oyinCapacity(),
      adminApi.oyinWinners().then((r) => r.winners),
    ]);
    return { catalog, cap, winners };
  }, []);

  if (data.err) return <ErrBox err={data.err} onRetry={data.reload} />;
  if (!data.data || !vitals) return <Card title="🔔 Bugun nima qilish kerak"><Skeleton rows={5} h={44} /></Card>;

  const { catalog, cap, winners } = data.data;
  const tasks = buildTasks(vitals, catalog, cap, winners, async () => {
    const r = await adminApi.oyinOpenQueued().catch(() => null);
    if (!r) return "⛔ Bajarilmadi — qayta urinib ko'ring";
    data.reload();
    return r.opened.length > 0 ? `✅ ${r.opened.length} ta mukofot navbatdan ochildi` : `Hech narsa ochilmadi — ${r.reason}`;
  });

  return (
    <>
      <Card title="🔔 Bugun nima qilish kerak" sub={`${tasks.filter((t) => t.tone !== "ok").length} ta hal qilinmagan`} flush>
        {tasks.map((t, i) => (
          <div key={i} className={`oy-task oy-task-${t.tone}`}>
            <span className="oy-task-x">{t.text}</span>
            {t.act && (
              <Btn sm variant={t.tone === "bad" ? "pri" : undefined} onClick={() => { void t.act?.run().then((m) => toast(m, m.startsWith("✅") ? "ok" : "warn")); }}>
                {t.act.label}
              </Btn>
            )}
            {t.go && <Btn sm onClick={() => onGo(t.go as OyinView)}>Ochish →</Btn>}
          </div>
        ))}
      </Card>

      <div className="oy-grid oy-g2">
        <Ball vitals={vitals} cap={cap} onGo={onGo} />
        <Sigim cap={cap} onOpen={async () => {
          const r = await adminApi.oyinOpenQueued().catch(() => null);
          data.reload();
          toast(r && r.opened.length > 0 ? `✅ ${r.opened.length} ta mukofot ochildi` : `Ochilmadi — ${r?.reason ?? "xato"}`, r && r.opened.length > 0 ? "ok" : "warn");
        }} onGo={onGo} />
      </div>

      <Metrics vitals={vitals} catalog={catalog} />
    </>
  );
}

function buildTasks(v: OyinVitals, catalog: OyinAdminPrizeRow[], cap: OyinCapacityView, winners: OyinWinner[], openQueued: () => Promise<string>): Task[] {
  const t: Task[] = [];

  if (v.seasonPhase === "unset") t.push({ tone: "bad", text: <><b>Mavsum sozlanmagan</b> — o'yin butunlay yopiq. Sanalarni kiriting.</>, go: "sozlama" });
  else if (v.seasonPhase === "upcoming") t.push({ tone: "warn", text: <><b>Mavsum hali boshlanmagan</b> — belgilangan sanada o'zi ochiladi.</>, go: "sozlama" });
  else if (v.seasonPhase === "ended") t.push({ tone: "warn", text: <><b>Mavsum yakunlandi</b> — mukofot kunini o'tkazing va yangi mavsumni boshlang.</>, go: "kartalar" });
  else if (v.finalLock) t.push({ tone: "warn", text: <><b>FINAL-48</b> — karta xaridi yopiq, ro'yxat tirajga qotdi. Siz ham istisno emassiz.</>, go: "kartalar" });
  else if (v.daysLeft != null && v.daysLeft <= 7) t.push({ tone: "warn", text: <>Mavsum tugashiga <b>{v.daysLeft} kun</b> qoldi — mukofot kunini rejalashtiring.</>, go: "kartalar" });

  const wonKeys = new Set(winners.map((w) => w.prizeKey));
  const filled = catalog.filter((p) => p.active && p.limit > 0 && p.sold >= p.limit && !wonKeys.has(p.key));
  if (filled.length > 0) {
    t.push({ tone: "bad", text: <><b>{filled.length} ta mukofot to'ldi</b> ({filled.slice(0, 3).map((p) => p.name).join(", ")}{filled.length > 3 ? "…" : ""}) — tiraj kutmoqda.</>, go: "kartalar" });
  }
  const atRisk = catalog.filter((p) => p.active && p.minSell > 0 && !p.willDraw && p.sold > 0);
  if (atRisk.length > 0) {
    t.push({ tone: "warn", text: <><b>{atRisk.length} ta mukofot chegaraga yetmayapti</b> — shu holatda tirajga TUSHMAYDI va karta egalariga ball qaytarish kerak bo'ladi.</>, go: "mukofot" });
  }
  const undelivered = winners.filter((w) => !w.handedAt).length;
  if (undelivered > 0) t.push({ tone: "warn", text: <><b>{undelivered} ta g'olibga</b> mukofot hali topshirilmagan.</>, go: "kartalar" });

  if (cap.openCount === 0) {
    t.push({
      tone: "bad",
      text: cap.queuedCount > 0
        ? <><b>Ochiq mukofot yo'q</b> — mijoz ballini sarflay olmaydi. Navbatda {cap.queuedCount} ta turibdi.</>
        : <><b>Ochiq mukofot ham, navbat ham yo'q</b> — mukofot qo'shing.</>,
      ...(cap.queuedCount > 0 ? { act: { label: "📋 Navbatdan ochish", run: openQueued } } : { go: "mukofot" as OyinView }),
    });
  } else if (!cap.healthy) {
    t.push({
      tone: "warn",
      text: <>Sig'im <b>{cap.ratio.toFixed(1)}×</b> (kerak {OYIN_CAPACITY_RATIO}×) — xalqdagi ball sarflanadigan joy topmaydi.</>,
      act: { label: "📋 Navbatdan ochish", run: openQueued },
    });
  }
  if (cap.missingTiers.length > 0 && cap.openCount > 0) {
    t.push({ tone: "warn", text: <>«{cap.missingTiers.join(", ")}» darajasida ochiq mukofot yo'q — o'sha ballga yetgan odam sotib oladigan narsa topmaydi.</>, act: { label: "📋 Navbatdan ochish", run: openQueued } });
  }

  if (v.overBudget) t.push({ tone: "bad", text: <>Katalog byudjetdan <b>{short(v.catalogSom - v.budgetSom)} so'm</b> oshib ketdi.</>, go: "mukofot" });
  if (v.frozen) t.push({ tone: "warn", text: <><b>Tiraj muzlatilgan</b> — hech kim (siz ham) karta ola olmaydi.</>, go: "kartalar" });
  if (v.storiesPending > 0) t.push({ tone: "warn", text: <><b>{v.storiesPending} ta hikoya</b> tekshiruvni kutmoqda.</>, go: "hikoya" });
  if (v.riskCount > 0) t.push({ tone: "warn", text: <><b>{v.riskCount} kishi</b> shubhali ro'yxatda — qo'lda ko'rib chiqing.</>, go: "odamlar" });

  if (t.length === 0) t.push({ tone: "ok", text: <><b>Hammasi joyida</b> — bugun aralashuv kerak emas.</> });
  return t;
}

/* ── BALL VORONKASI ────────────────────────────────────────────────────────────────────────── */
function Ball({ vitals, cap, onGo }: { vitals: OyinVitals; cap: OyinCapacityView; onGo: (v: OyinView) => void }) {
  const rows: { k: string; s: string; v: number; color: string; go?: OyinView }[] = [
    { k: "Xalq qo'lida", s: "hali sarflanmagan", v: cap.circulatingBall, color: "var(--coin)", go: "odamlar" },
    { k: "Ochiq mukofotlarda joy", s: "sarflash mumkin bo'lgan", v: cap.openBall, color: "var(--c1)", go: "mukofot" },
    { k: "Chiqarilgan karta", s: "dona", v: vitals.cardsIssued, color: "var(--c4)", go: "kartalar" },
    { k: "To'lgan mukofot", s: "tirajga tayyor", v: vitals.prizesFilled, color: "var(--c3)", go: "kartalar" },
  ];
  const max = Math.max(...rows.map((r) => r.v), 1);
  const unspentPct = cap.circulatingBall > 0 && cap.openBall > 0 ? Math.round((cap.circulatingBall / cap.openBall) * 100) : 0;

  return (
    <Card title="Ball qayerda" sub="har qatorni bosing → orqasidagi ro'yxat">
      <div className="oy-fn">
        {rows.map((r) => (
          <button key={r.k} type="button" className="oy-fn-r" onClick={() => r.go && onGo(r.go)}>
            <span className="oy-fn-k">{r.k}<br /><span className="oy-dim3">{r.s}</span></span>
            <span className="oy-fn-track"><i className="oy-fn-bar" style={{ width: `${Math.max(4, (r.v / max) * 100)}%`, background: r.color }} /></span>
            <span className="oy-fn-v">{num(r.v)}</span>
          </button>
        ))}
      </div>
      <Note tone={cap.healthy ? "ok" : "warn"}>
        {cap.healthy
          ? <>Sig'im <b>{cap.ratio.toFixed(1)}×</b> — xalqdagi ball sarflanadigan joyga sig'adi.</>
          : <>Xalqdagi ball ochiq mukofotlar sig'imining <b>{unspentPct}%</b> ini egallaydi. Kerak: ball joydan <b>{OYIN_CAPACITY_RATIO}× kam</b> bo'lsin. Aks holda mijoz «yig'dim, lekin olib bo'lmadi» deydi.</>}
      </Note>
    </Card>
  );
}

/* ── 🎯 SIG'IM ─────────────────────────────────────────────────────────────────────────────── */
function Sigim({ cap, onOpen, onGo }: { cap: OyinCapacityView; onOpen: () => void; onGo: (v: OyinView) => void }) {
  const pct = Math.min(100, (cap.ratio / OYIN_CAPACITY_RATIO) * 100);
  return (
    <Card title="🎯 Sig'im" sub="xalqdagi ball ochiq mukofotlarga sig'adimi">
      <div className="oy-col">
        <div className="oy-row">
          <span className={cap.healthy ? "oy-stat-v oy-add" : "oy-stat-v oy-chg"}>{cap.ratio.toFixed(1)}×</span>
          <span className="oy-dim3">hozir · kerak {OYIN_CAPACITY_RATIO}×</span>
          <span className="oy-spacer">{cap.healthy ? <Badge tone="ok">yetarli</Badge> : <Badge tone="warn">yetarli emas</Badge>}</span>
        </div>
        <span className="oy-fn-track"><i className="oy-fn-bar" style={{ width: `${pct}%`, background: cap.healthy ? "var(--ok)" : "var(--warn)" }} /></span>
        <div className="oy-dim3">
          Xalqda <b>{num(cap.circulatingBall)}</b> ball · ochiq mukofotlarda <b>{num(cap.openBall)}</b> ball joy ·
          navbatda <b>{cap.queuedCount}</b> ta, ochiq <b>{cap.openCount}</b> ta, to'lgan <b>{cap.filledCount}</b> ta.
        </div>
        {cap.missingTiers.length > 0 && (
          <Note tone="warn">
            <b>«{cap.missingTiers.join(", ")}»</b> darajasida ochiq mukofot yo'q — aynan o'sha ballga
            yetgan odamlar sotib oladigan narsa topmayapti.
          </Note>
        )}
        <div className="oy-row">
          <Btn variant={cap.healthy ? undefined : "pri"} onClick={onOpen} disabled={cap.queuedCount === 0}>
            📋 Navbatdan ochish {cap.queuedCount > 0 ? `(${cap.queuedCount} ta)` : ""}
          </Btn>
          <Btn onClick={() => onGo("mukofot")}>Katalogni ko'rish</Btn>
        </div>
      </div>
    </Card>
  );
}

/* ── 📊 MAVSUM KO'RSATKICHLARI ─────────────────────────────────────────────────────────────── */
function Metrics({ vitals, catalog }: { vitals: OyinVitals; catalog: OyinAdminPrizeRow[] }) {
  const active = catalog.filter((p) => p.active);
  const totalSlots = active.reduce((s, p) => s + p.limit, 0);
  const sold = active.reduce((s, p) => s + p.sold, 0);
  return (
    <div className="oy-grid oy-g4">
      <Stat k="Mavsum" v={vitals.seasonPhase === "active" && vitals.daysLeft != null ? `${vitals.daysLeft} kun` : "—"} s={vitals.seasonLabel ?? "nomsiz"} />
      <Stat k="Xalqdagi ball" v={short(vitals.circulatingBall)} s="sarflanmagan" tone="coin" />
      <Stat k="Chiqarilgan karta" v={num(vitals.cardsIssued)} s={`${num(totalSlots)} o'rindan`} />
      <Stat k="O'rin band" v={totalSlots > 0 ? `${Math.round((sold / totalSlots) * 100)}%` : "—"} s={`${num(active.length)} ochiq mukofot`} />
      <Stat k="To'lgan mukofot" v={num(vitals.prizesFilled)} s="tiraj kutmoqda" tone={vitals.prizesFilled > 0 ? "warn" : undefined} />
      <Stat k="Byudjet" v={short(vitals.catalogSom)} s={`${short(vitals.budgetSom)} rejadan`} tone={vitals.overBudget ? "bad" : "ok"} />
      <Stat k="Hikoya navbati" v={num(vitals.storiesPending)} s="tekshiruv kutmoqda" tone={vitals.storiesPending > 0 ? "warn" : undefined} />
      <Stat k="Shubhali" v={num(vitals.riskCount)} s="qo'lda ko'rish kerak" tone={vitals.riskCount > 0 ? "bad" : "ok"} />
    </div>
  );
}
