import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  formatNumber,
  CLASSIFIED_CATEGORIES,
  INSP_CATEGORIES,
  INSP_CATEGORY_MAX,
  INSP_PASS_MIN,
  INSP_TIER_EMOJI,
  INSP_TIER_LABEL,
  inspTier,
  inspTotal,
  type AdminAdContactRow,
  type AdminAdReactionRow,
  type AdminAdViewerRow,
  type AdminAuditRow,
  type AdminClassifiedRow,
  type AdminBotUsersResponse,
  type AdminClassifiedListResponse,
  type AdminEconomy,
  type AdminFoodOrderRow,
  type BallDistribution,
  type AdminGrowth,
  type AdminHealth,
  type AdminBroadcastDetail,
  type AdminBroadcastRow,
  type AdminIntegrity,
  type AdminLiveBooking,
  type AdminMemberRow,
  type AdminStats,
  SHOP_CATEGORIES,
  type OyinActivityAction,
  type OyinActivityResponse,
  type OyinAdminPrizeRow,
  type OyinSeasonView,
} from "@t1067/shared";
import { RavellaAdminView } from "./ravella";
import { JamoaAdminView } from "./jamoa";
import { adminApi, clearAdminToken, hasAdminToken, setAdminToken, type AdminBannedRow, type AdminChatConvo, type AdminChatMsg, type AdminDebtRow, type AdminMsgHistoryRow, type AdminRatingRow, type AdminTxnRow, type AdminBlockedRow, type AdminReferralRow, type AdminRideRow, type AdminUserRow, type AdminWithdrawalRow, type AdminWithdrawalTabRow, type CampaignRow, type Driver360, type DriverCallRow, type DriverCallStats, type DriverMissionRow, type IntercityAdminTrip, type IntercityAdminDebt, type Member360, type PeakHourRow, type ShopAdminProductRow, type ShopAdminOrderRow, type ShopAdminReviewRow, type SvcAdminRow, type SvcAdminCat, type SvcAdminReview, type RestoranAdminRow, type RestoranMenuItemRow, type OprOpsRow, type OprJurnalRow } from "./api";

type Tab = "overview" | "pulse" | "analytics" | "finance" | "live" | "x360" | "driver" | "client" | "botusers" | "obzvon" | "boshqaruv" | "topshiriq" | "actions" | "integrity" | "audit" | "safarlar" | "qarzlar" | "referallar" | "banlist" | "yechishlar" | "baholar" | "xabar" | "chat" | "broadcasts" | "intercity" | "pik" | "transactions" | "blocked" | "shop" | "xizmatlar" | "elonlar" | "restoran" | "ravella" | "bilim" | "bosh" | "jamoa" | "oyin";

const NAV_GROUPS: { label: string; items: { id: Tab; icon: string; label: string }[] }[] = [
  {
    label: "ASOSIY",
    items: [
      { id: "overview", icon: "🏠", label: "Dashboard" },
      { id: "pulse", icon: "💓", label: "Puls" },
      { id: "live", icon: "🗺", label: "Jonli xarita" },
    ],
  },
  {
    label: "MOLIYA",
    items: [
      { id: "finance", icon: "💰", label: "Moliya" },
      { id: "transactions", icon: "💸", label: "Tranzaksiyalar" },
      { id: "analytics", icon: "📈", label: "Analitika" },
      { id: "intercity", icon: "🚐", label: "Shaharlararo" },
    ],
  },
  {
    label: "A'ZOLAR",
    items: [
      { id: "driver", icon: "🚗", label: "Haydovchilar" },
      { id: "client", icon: "🏅", label: "Mijozlar" },
      { id: "botusers", icon: "👥", label: "Bot foydalanuvchilar" },
      { id: "obzvon", icon: "📞", label: "Obzvon (Call)" },
      { id: "x360", icon: "🔎", label: "360 qidiruv" },
    ],
  },
  {
    label: "TARIX",
    items: [
      { id: "safarlar", icon: "🚕", label: "Safarlar tarixi" },
      { id: "yechishlar", icon: "💸", label: "Yechishlar" },
      { id: "baholar", icon: "⭐", label: "Baholar" },
      { id: "qarzlar", icon: "💳", label: "Haydovchi qarzlari" },
      { id: "referallar", icon: "👥", label: "Referallar" },
      { id: "banlist", icon: "🚫", label: "Bloklangan" },
    ],
  },
  {
    label: "MULOQOT",
    items: [
      { id: "chat", icon: "💬", label: "Mijozlar chat" },
      { id: "xabar", icon: "📱", label: "Xabar tarixi" },
      { id: "broadcasts", icon: "📢", label: "Xabarlar tarixi" },
      { id: "blocked", icon: "📵", label: "Bloklaganlar" },
    ],
  },
  {
    label: "BOSHQARUV",
    items: [
      { id: "bosh", icon: "🏠", label: "Bosh sahifa" },
      { id: "shop", icon: "🛍", label: "Do'kon" },
      { id: "xizmatlar", icon: "🔎", label: "Xizmatlar" },
      { id: "elonlar", icon: "📋", label: "E'lonlar" },
      { id: "restoran", icon: "🍽", label: "Restoran" },
      { id: "ravella", icon: "🎀", label: "Ravella" },
      { id: "jamoa", icon: "👔", label: "Jamoa" },
      { id: "oyin", icon: "🎮", label: "O'yin mavsumi" },
      { id: "bilim", icon: "🧠", label: "AI Bilim" },
      { id: "pik", icon: "🔥", label: "Pik Vaqtlar" },
      { id: "actions", icon: "⚡", label: "Amallar" },
      { id: "topshiriq", icon: "🎯", label: "Topshiriqlar" },
      { id: "boshqaruv", icon: "👑", label: "Foydalanuvchilar" },
      { id: "integrity", icon: "🔐", label: "Integrity" },
      { id: "audit", icon: "📜", label: "Jurnal" },
    ],
  },
];

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean>(hasAdminToken);
  const [role, setRole] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!authed) return;
    adminApi.whoami().then((r) => { setRole(r.role); setOperatorName(r.operatorName); }).catch(() => setRole(null));
    const load = () =>
      adminApi
        .health()
        .then((h) => { setHealth(h); })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "forbidden") { clearAdminToken(); setAuthed(false); }
        });
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [authed]);

  // 🛍 shopseller: faqat Do'kon paneli — narrower token, narrower UI. Owner tab'ini o'zgartirsa
  // ham (masalan eski localStorage tab) darhol Do'kon'ga qaytariladi (defense-in-depth; server
  // baribir yozuv-route'larni requireShopWrite bilan yopib qo'ygan).
  useEffect(() => {
    if (role === "shopseller" && tab !== "shop") setTab("shop");
  }, [role, tab]);

  if (!authed) return <LoginScreen onAuthed={() => setAuthed(true)} />;

  function logout() { clearAdminToken(); setHealth(null); setAuthed(false); }

  // 🎧 Super Operator: a "chatops" token gets ONLY the 4-tab console (never the owner's full
  // ~20-tab BOSHQARUV dashboard) — same "separate minimal shell by role" pattern as shopseller
  // just below, so a call-center hire never sees financial/moderation screens they don't need.
  if (role === "chatops") {
    return <OperatorConsoleShell operatorName={operatorName} onLogout={logout} />;
  }

  if (role === "shopseller") {
    return (
      <div className="dash">
        <div className="content" style={{ marginLeft: 0 }}>
          <div className="content-header">
            <div className="content-title">🛍 Do'kon — sotuvchi paneli</div>
            <div className="content-header-right">
              <button className="logout-btn" onClick={logout}>🚪 Chiqish</button>
            </div>
          </div>
          <div className="content-body">
            <ShopAdminView />
          </div>
        </div>
      </div>
    );
  }

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const current = allItems.find((i) => i.id === tab);

  const goTab = (id: Tab) => { setTab(id); setSideOpen(false); };

  return (
    <div className="dash">
      {/* ── sidebar ── */}
      <aside className={"sidebar" + (sideOpen ? " sidebar-open" : "")}>
        <div className="sb-brand">
          <span className="sb-logo">🚕</span>
          <div>
            <div className="sb-title">BirJoy</div>
            <div className="sb-sub">Command Center</div>
          </div>
        </div>

        <nav className="sb-nav">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="sb-group">
              <div className="sb-group-label">{g.label}</div>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  className={"sb-item" + (tab === item.id ? " active" : "")}
                  onClick={() => goTab(item.id)}
                >
                  <span className="sb-icon">{item.icon}</span>
                  <span className="sb-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-footer">
          <HealthPill h={health} />
          <button className="logout-btn" onClick={logout}>🚪 Chiqish</button>
        </div>
      </aside>

      {sideOpen && <div className="sidebar-backdrop" onClick={() => setSideOpen(false)} />}

      {/* ── main content ── */}
      <div className="content">
        <div className="content-header">
          <button className="hamburger" onClick={() => setSideOpen((s) => !s)} aria-label="menu">☰</button>
          <div className="content-title">{current?.icon} {current?.label}</div>
          <div className="content-header-right">
            <HealthPill h={health} />
          </div>
        </div>

        <div className="content-body">
          {tab === "overview" && <Overview health={health} />}
          {tab === "pulse" && <PulseView />}
          {tab === "analytics" && <AnalyticsView />}
          {tab === "finance" && <FinanceView />}
          {tab === "live" && <LiveMapView />}
          {tab === "x360" && <X360View />}
          {(tab === "driver" || tab === "client") && <MembersTab type={tab} />}
          {tab === "botusers" && <BotUsersTab />}
          {tab === "obzvon" && <ObzvonView />}
          {tab === "boshqaruv" && <><BoshqaruvView /><RecruitsView /></>}
          {tab === "bosh" && <HomeFeaturedAdminView />}
          {tab === "shop" && <ShopAdminView />}
          {tab === "xizmatlar" && <XizmatlarAdminView />}
          {tab === "elonlar" && <ElonlarAdminView />}
          {tab === "restoran" && (<><RestoranAdminView /><RestoranCatalogAdminView /></>)}
          {tab === "ravella" && <RavellaAdminView />}
          {tab === "jamoa" && <JamoaAdminView />}
          {tab === "oyin" && <OyinActivityView />}
          {tab === "bilim" && <KnowledgeAdminView />}
          {tab === "topshiriq" && <><QuickAnnounceView /><CampaignsView /><DriverMissionsView /></>}
          {tab === "actions" && <><ActionsView onHistory={() => goTab("broadcasts")} /><ControlCards /></>}
          {tab === "integrity" && <IntegrityView />}
          {tab === "audit" && <AuditView />}
          {tab === "safarlar" && <SafarlarView />}
          {tab === "yechishlar" && <YechishlarView />}
          {tab === "baholar" && <BaholarView />}
          {tab === "qarzlar" && <QarzlarView />}
          {tab === "intercity" && <IntercityAdmin />}
          {tab === "referallar" && <ReferallarView />}
          {tab === "banlist" && <BanListView />}
          {tab === "chat" && <ChatView />}
          {tab === "xabar" && <XabarView />}
          {tab === "broadcasts" && <BroadcastHistoryView />}
          {tab === "transactions" && <TransactionsView />}
          {tab === "blocked" && <BlockedView />}
          {tab === "pik" && <PeakHoursView />}
        </div>
      </div>
    </div>
  );
}

// ─── 🚦 health ──────────────────────────────────────────────────────────────
function HealthPill({ h }: { h: AdminHealth | null }) {
  if (!h) return <div className="hp muted">⏳ tekshirilmoqda…</div>;
  const ok = h.kas.ok && h.db.ok;
  return (
    <div className={"hp " + (ok ? "hp-ok" : "hp-bad")}>
      <span className="hp-dot" />
      kas {h.kas.ok ? "🟢" : "🔴"} · db {h.db.ok ? "🟢" : "🔴"} {h.bot ? "· bot 🟢" : ""}
    </div>
  );
}

function Overview({ health }: { health: AdminHealth | null }) {
  const [eco, setEco] = useState<AdminEconomy | null>(null);
  const [ball, setBall] = useState<BallDistribution | null>(null);
  const [growth, setGrowth] = useState<AdminGrowth | null>(null);
  const [bookings, setBookings] = useState<AdminLiveBooking[] | null>(null);
  const [anom, setAnom] = useState<Awaited<ReturnType<typeof adminApi.anomalies>> | null>(null);
  const [inbox, setInbox] = useState<Awaited<ReturnType<typeof adminApi.inbox>> | null>(null);
  // §10.1: birlashtirilgan moderatsiya-navbat — do'kon+e'lon+AI-bilim BITTA son-xulosada
  // (harakat-tugmalari o'z bo'limida qoladi — bu faqat "qayerda nima kutmoqda" ko'rsatkichi)
  const [modSummary, setModSummary] = useState<Awaited<ReturnType<typeof adminApi.moderationSummary>> | null>(null);

  useEffect(() => {
    adminApi.economy().then(setEco).catch(() => undefined);
    adminApi.ballDist().then(setBall).catch(() => undefined);
    adminApi.growth().then(setGrowth).catch(() => undefined);
    adminApi.moderationSummary().then(setModSummary).catch(() => undefined);
    const load = () => {
      adminApi.bookings().then(setBookings).catch(() => undefined);
      adminApi.anomalies().then(setAnom).catch(() => undefined);
      adminApi.inbox().then(setInbox).catch(() => undefined);
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      {anom && anom.level !== "ok" && (
        <section
          className="panel"
          style={{
            borderLeft: `4px solid ${anom.level === "alert" ? "#e5484d" : "#f0b429"}`,
            background: anom.level === "alert" ? "rgba(229,72,77,0.08)" : "rgba(240,180,41,0.08)",
          }}
        >
          <div className="panel-title">{anom.level === "alert" ? "🚨 Diqqat — anomaliya" : "⚠️ Ogohlantirish"}</div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
            {anom.items.map((it, i) => (
              <li key={i} style={{ color: it.level === "alert" ? "#e5484d" : "var(--fg)" }}>{it.text}</li>
            ))}
          </ul>
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Bugun emissiya: {formatNumber(anom.emissionToday)} tanga · naxt-to'lov: {formatNumber(anom.cashoutToday)} tanga
          </div>
        </section>
      )}

      {modSummary && (modSummary.aiKnowledgePending + modSummary.classifiedAdsPending + modSummary.shopsAwaitingActivation > 0) && (
        <section className="panel">
          <div className="panel-title">🗂 Moderatsiya kutmoqda</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {modSummary.aiKnowledgePending > 0 && <span>🧠 <b>{modSummary.aiKnowledgePending}</b> AI-bilim (<i>AI Bilim</i> bo&apos;limi)</span>}
            {modSummary.classifiedAdsPending > 0 && <span>📋 <b>{modSummary.classifiedAdsPending}</b> e&apos;lon (<i>E&apos;lonlar</i> bo&apos;limi)</span>}
            {modSummary.shopsAwaitingActivation > 0 && <span>🏪 <b>{modSummary.shopsAwaitingActivation}</b> do&apos;kon faollashtirilishini kutmoqda (<i>Do&apos;kon</i> bo&apos;limi)</span>}
          </div>
        </section>
      )}
      {inbox && inbox.count > 0 && (
        <section className="panel">
          <div className="panel-title">📥 Tasdiqlash kutmoqda · {inbox.count}</div>
          <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>
            Naxt-pul so'rovlari — tasdiq/rad Telegram'da (egaga [✅/❌] xabar boradi). Bu ro'yxat kutayotgan navbatni ko'rsatadi.
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Kim</th><th>Miqdor</th><th>Usul</th><th>Karta/manzil</th><th>Vaqt</th></tr>
              </thead>
              <tbody>
                {inbox.pending.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}<div className="muted" style={{ fontSize: 12 }}>{p.phone}</div></td>
                    <td>{formatNumber(p.amount)} tanga</td>
                    <td>{p.method === "card" ? "💳 Karta" : "🏠 Uyga"}</td>
                    <td className="muted">{p.mask || "—"}</td>
                    <td className="muted">{new Date(p.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {health && (
        <section className="panel">
          <div className="panel-title">🚦 Tizim salomatligi</div>
          <div className="health-grid">
            <HealthCell label="kas1067" ok={health.kas.ok} detail={`${health.kas.ms}ms · ${health.kas.mode} · ${health.kas.message}`} />
            <HealthCell label="Baza" ok={health.db.ok} detail={`${health.db.ms}ms`} />
            <HealthCell label="Bot" ok={health.bot} detail={health.bot ? "ulangan" : "o'chiq"} />
            <HealthCell label="Booking" ok={true} detail={health.bookingLive ? "JONLI" : "test"} warn={health.bookingLive} />
            <HealthCell label="Oxirgi sync" ok={(health.lastSync?.ageMin ?? 999) < 60} detail={health.lastSync ? `${health.lastSync.status} · ${health.lastSync.ageMin} daq oldin` : "—"} />
          </div>
        </section>
      )}

      {growth && (
        <section className="cards">
          <Card icon="👥" label="Bot a'zolari" value={formatNumber(growth.botUsers)} sub={`${growth.linked} bog'langan`} accent />
          <Card icon="🆕" label="Bugun yangi" value={formatNumber(growth.newToday)} sub={`7 kun: ${growth.new7d}`} />
          <Card icon="🔥" label="24s faol" value={formatNumber(growth.active24h)} />
          <Card icon="🪙" label="Tanga egalari" value={formatNumber(growth.coinHolders)} />
        </section>
      )}

      {ball && (
        <section className="panel">
          <div className="panel-title">🏅 Daraja taqsimoti (mijozlar)</div>
          <div className="cards" style={{ marginBottom: 12 }}>
            <Card icon="👥" label="Mijozlar" value={formatNumber(ball.members)} />
            <Card icon="🎯" label="Ball to'plagan" value={formatNumber(ball.withBall)} sub={`o'rtacha ${formatNumber(ball.avgBall)}`} accent />
            <Card icon="🏅" label="Jami ball" value={formatNumber(ball.totalBall)} />
            <Card icon="🔝" label="Eng ko'p ball" value={formatNumber(ball.maxBall)} />
          </div>
          <div className="chart">
            {ball.tiers.map((t) => {
              const max = Math.max(1, ...ball.tiers.map((x) => x.count));
              return (
                <div key={t.index} className="chart-row">
                  <div className="chart-label">{t.emoji} {t.name} {t.ballSum > 0 && <span className="muted">· {formatNumber(t.ballSum)} ball</span>}</div>
                  <div className="chart-bar"><span style={{ width: `${(t.count / max) * 100}%`, background: t.color }} /></div>
                  <div className="chart-val">{formatNumber(t.count)}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {eco && (
        <section className="panel">
          <div className="panel-title">🛡 Revenue-linked withdraw budget (rides → real-money-out)</div>
          <div className="health-grid" style={{ marginBottom: 12 }}>
            <HealthCell label="Kunlik byudjet" ok={eco.withdrawBudget.remaining > 0} detail={`${formatNumber(eco.withdrawBudget.total)} so'm (${eco.withdrawBudget.rides} safardan)`} />
            <HealthCell label="Ishlatilgan" ok={true} detail={`${formatNumber(eco.withdrawBudget.used)} so'm`} />
            <HealthCell label="Qolgan" ok={eco.withdrawBudget.remaining > 0} detail={`${formatNumber(eco.withdrawBudget.remaining)} so'm`} warn={eco.withdrawBudget.remaining <= 0} />
          </div>
        </section>
      )}

      {eco && (
        <section className="panel">
          <div className="panel-title">💰 Iqtisod (tanga)</div>
          <div className="cards" style={{ marginBottom: 12 }}>
            <Card icon="🪙" label="Muomaladagi" value={formatNumber(eco.coinsOutstanding)} sub="majburiyat" accent />
            <Card icon="📤" label="Berilgan" value={formatNumber(eco.emitted)} />
            <Card icon="🎮" label="Sarflangan" value={formatNumber(eco.sunk)} sub="o'yinlarda" />
            <Card icon="💸" label="So'mga (jami)" value={formatNumber(eco.withdrawnTotal)} sub={`bugun ${formatNumber(eco.withdrawnToday)}`} />
          </div>
          <div className="panel-title" style={{ fontSize: 12 }}>🎰 Jackpot: {formatNumber(eco.jackpot)} · manba/sarf bo'yicha</div>
          <div className="chart">
            {eco.byKind.slice(0, 12).map((k) => {
              const max = Math.max(1, ...eco.byKind.map((x) => Math.abs(x.total)));
              return (
                <div key={k.kind} className="chart-row">
                  <div className="chart-label">{k.kind} <span className="muted">×{k.count}</span></div>
                  <div className="chart-bar"><span style={{ width: `${(Math.abs(k.total) / max) * 100}%`, background: k.total >= 0 ? "var(--green)" : "var(--red)" }} /></div>
                  <div className="chart-val" style={{ color: k.total >= 0 ? "var(--green)" : "var(--red)" }}>{k.total >= 0 ? "+" : ""}{formatNumber(k.total)}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">🚖 Jonli buyurtmalar ({bookings?.length ?? 0})</div>
          <span className="muted" style={{ fontSize: 12 }}>15s da yangilanadi</span>
        </div>
        {!bookings ? (
          <div className="muted" style={{ padding: 12 }}>Yuklanmoqda…</div>
        ) : bookings.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>Hozir faol buyurtma yo'q</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Manzil</th><th>Telefon</th><th>Holat</th><th>Mashina</th><th className="num">Cashback</th></tr></thead>
              <tbody>
                {bookings.map((b, i) => (
                  <tr key={b.id} className={b.hasDriver ? "" : "row-warn"}>
                    <td className="muted">{i + 1}</td>
                    <td className="td-name">{b.addressName}</td>
                    <td className="muted">…{b.phone}</td>
                    <td>{b.hasDriver ? <span className="lvl">🚖 {b.status}</span> : <span className="lvl warn">⏳ haydovchi yo'q</span>}</td>
                    <td>{b.carNumber ?? "—"}</td>
                    <td className="num">{formatNumber(b.cashback)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function HealthCell({ label, ok, detail, warn }: { label: string; ok: boolean; detail: string; warn?: boolean }) {
  return (
    <div className={"hcell " + (warn ? "hcell-warn" : ok ? "hcell-ok" : "hcell-bad")}>
      <div className="hcell-top">{ok ? (warn ? "⚠️" : "🟢") : "🔴"} {label}</div>
      <div className="hcell-detail muted">{detail}</div>
    </div>
  );
}

// ─── ⚡ actions: grant + announce ───────────────────────────────────────────
// M1: a lightweight live ops map (no Leaflet — plain SVG plot over Koson bbox)
function LiveMapView() {
  const [d, setD] = useState<Awaited<ReturnType<typeof adminApi.livemap>> | null>(null);
  useEffect(() => {
    const load = () => adminApi.livemap().then(setD).catch(() => undefined);
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!d) return <p className="muted">Yuklanmoqda…</p>;
  const all = [...d.pins.map((p) => ({ lat: p.lat, lng: p.lng })), ...d.bookings.filter((b) => b.lat && b.lng).map((b) => ({ lat: b.lat!, lng: b.lng! }))];
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const minLat = Math.min(...lats, 39.0), maxLat = Math.max(...lats, 39.09);
  const minLng = Math.min(...lngs, 65.52), maxLng = Math.max(...lngs, 65.64);
  const X = (lng: number) => ((lng - minLng) / Math.max(0.0001, maxLng - minLng)) * 760 + 20;
  const Y = (lat: number) => 480 - ((lat - minLat) / Math.max(0.0001, maxLat - minLat)) * 440;
  return (
    <section className="card">
      <h3>🗺 Jonli operatsiya · 🟢 bo'sh: {d.freeDrivers} · faol buyurtma: {d.bookings.length}</h3>
      <svg viewBox="0 0 800 500" style={{ width: "100%", background: "#0d1322", borderRadius: 12 }}>
        {d.pins.map((p, i) => (
          <circle key={`p${i}`} cx={X(p.lng)} cy={Y(p.lat)} r="7" fill={p.busy ? "#eab308" : "#22c55e"}>
            <title>{p.busy ? "Band" : "Bo'sh"} haydovchi</title>
          </circle>
        ))}
        {d.bookings.filter((b) => b.lat && b.lng).map((b, i) => (
          <text key={`b${i}`} x={X(b.lng!)} y={Y(b.lat!)} fontSize="18" textAnchor="middle">📍<title>#{b.id} {b.status} — {b.address}</title></text>
        ))}
      </svg>
      <p className="muted">🟢 bo'sh haydovchi · 🟡 band (taksometr yoniq) · 📍 faol buyurtma. 30 soniyada yangilanadi.</p>
      <div style={{ maxHeight: 200, overflow: "auto", marginTop: 8 }}>
        {d.bookings.map((b) => (
          <div key={b.id} style={{ display: "flex", gap: 10, padding: "4px 0", borderTop: "1px solid #232b3d" }}>
            <span className="muted">#{b.id}</span><b>{b.status}</b><span>{b.address}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// M3/M4: phone → client 360, car → driver 360
function X360View() {
  const [phone, setPhone] = useState("");
  const [car, setCar] = useState("");
  const [m, setM] = useState<Member360 | null>(null);
  const [dr, setDr] = useState<Driver360 | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 📷 driver portrait: photoKey forces <img> to re-fetch after upload/clear; photoBusy disables UI during upload
  const [photoKey, setPhotoKey] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const uploadPhoto = (file: File, driverId: number): void => {
    if (file.size > 5 * 1024 * 1024) { alert("Rasm 5 MB dan katta — yana kichikroq oling"); return; }
    setPhotoBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = (reader.result as string) || "";
      const b64 = dataUrl.split(",")[1] ?? "";
      const mime = file.type || "image/jpeg";
      const r = await adminApi.uploadDriverPhoto(driverId, mime, b64).catch(() => ({ ok: false, error: "tarmoq" }) as { ok: boolean; error?: string });
      if (r.ok) { setPhotoKey((k) => k + 1); alert("✅ Rasm yuklandi"); }
      else alert(`❌ Xato: ${r.error ?? "noma'lum"}`);
      setPhotoBusy(false);
    };
    reader.onerror = () => { alert("Rasmni o'qib bo'lmadi"); setPhotoBusy(false); };
    reader.readAsDataURL(file);
  };
  // 🎁 grant TANGA to THIS exact account (by id — any type), straight from the 360 view
  const giveBonus = async (memberId: number, name: string) => {
    const a = window.prompt(`🎁 ${name}ga necha tanga? (− = ayirish)`);
    if (a === null || !Number(a)) return;
    const reason = window.prompt("Sabab:") ?? "admin bonus";
    const r = await adminApi.grantMemberCoins(memberId, Number(a), reason).catch(() => ({ ok: false, message: "net" }) as { ok: boolean; message?: string });
    alert(r.ok ? "✅ " + (r.message ?? "berildi") : "❌ " + (r.message ?? ""));
  };
  return (
    <>
      <section className="card">
        <h3>🔎 Mijoz 360</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="inp" placeholder="Telefon: 901234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn" onClick={async () => { setErr(null); try { setM(await adminApi.member360(phone)); } catch { setErr("Topilmadi"); setM(null); } }}>Qidirish</button>
        </div>
        {m && (
          <div style={{ marginTop: 10 }}>
            <p><b>{m.member.name}</b> ({m.member.type}) · 🪙 {m.member.coins.toLocaleString("ru-RU")} · {m.member.trips} safar (30 kunda {m.rides30}) {m.member.banned && "· 🚫 BAN"} {m.member.riskFlag && "· 🚩 RISK"} {m.member.plusUntil && "· 💎Plus"}</p>
            <p className="muted">💎 buyumlar: {m.items} · 👬 gap: {m.gap ?? "—"} · recruit: {m.recruitedByDriver ? `drv#${m.recruitedByDriver}` : "—"} · baholar: {m.ratings}</p>
            <div style={{ maxHeight: 220, overflow: "auto" }}>
              {m.txns.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, padding: "3px 0", borderTop: "1px solid #232b3d" }}>
                  <b style={{ color: t.amount >= 0 ? "#22c55e" : "#ef4444", minWidth: 70 }}>{t.amount >= 0 ? "+" : ""}{t.amount}</b>
                  <span className="muted">{t.kind}</span><span>{t.reason}</span>
                </div>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 8 }} onClick={() => giveBonus(m.member.id, m.member.name)}>🎁 Bonus berish</button>
          </div>
        )}
      </section>
      <section className="card">
        <h3>🚗 Haydovchi 360</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="inp" placeholder="Mashina raqami: 70A123BC" value={car} onChange={(e) => setCar(e.target.value.toUpperCase())} />
          <button className="btn" onClick={async () => { setErr(null); try { setDr(await adminApi.driver360(car)); } catch { setErr("Xato"); setDr(null); } }}>Qidirish</button>
        </div>
        {dr && (
          <div style={{ marginTop: 10 }}>
            <p><b>{dr.driver?.name ?? "Bot'da ro'yxatdan o'tmagan"}</b> {dr.driver && `· ${dr.driver.tier} · 🪙 ${dr.driver.coins.toLocaleString("ru-RU")}`}</p>
            <p>⭐ {dr.rating.avg || "—"} ({dr.rating.count} baho) · recruit: {dr.recruits} · 🏆 mashina chiptalari: {dr.mashinaTickets}</p>
            <p className="muted">{dr.rating.tags.map((t) => `${t.tag} ×${t.n}`).join(" · ") || "Hali teg yo'q"}</p>
            {dr.driver && (
              <>
              <button className="btn" onClick={async () => {
                // P1 (QA fleet): token is stored under "admin_token" (TOKEN_KEY), not "adminToken"
                // → the old key was always null → 403, QR never downloaded. Use the right key + check ok.
                try {
                  const res = await fetch(adminApi.recruitQrUrl(dr.driver!.id), { headers: { "X-Admin-Token": localStorage.getItem("admin_token") ?? "" } });
                  if (!res.ok) { alert(`QR yuklab bo'lmadi (${res.status})`); return; }
                  const blob = await res.blob();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `recruit-qr-${dr.driver!.id}.png`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                } catch {
                  alert("QR yuklab bo'lmadi — tarmoqni tekshiring");
                }
              }}>📥 Recruit QR yuklab olish</button>
              <button className="btn" style={{ marginLeft: 6 }} onClick={() => window.open(adminApi.driverStickerUrl(dr.driver!.id, localStorage.getItem("admin_token") ?? ""), "_blank")}>🖨 QR Stiker</button>
              <button className="btn" style={{ marginLeft: 6 }} onClick={() => giveBonus(dr.driver!.id, dr.driver!.name ?? "Haydovchi")}>🎁 Bonus berish</button>
              {/* 📷 Driver portrait — preview + upload + clear. Telegram CDN saqlaydi, biz file_id'ni saqlaymiz. */}
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: 10, background: "#0d1322", borderRadius: 10 }}>
                <img
                  key={photoKey}
                  src={`${adminApi.driverPhotoUrl(dr.driver.id)}?k=${photoKey}`}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                  alt="Haydovchi rasmi"
                  style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "1px solid #232b3d", background: "#1a2236", flex: "none" }}
                />
                <div style={{ flex: 1, fontSize: 12 }} className="muted">
                  📷 Telegram CDN saqlaydi · server disk 0 · jpg/png ≤5 MB
                </div>
                <label className="btn" style={{ cursor: photoBusy ? "wait" : "pointer", opacity: photoBusy ? 0.6 : 1 }}>
                  {photoBusy ? "⏳ Yuklanmoqda…" : "📷 Rasm yuklash"}
                  <input type="file" accept="image/*" hidden disabled={photoBusy} onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && dr.driver) uploadPhoto(f, dr.driver.id);
                    e.target.value = "";
                  }} />
                </label>
                <button className="btn" disabled={photoBusy} onClick={async () => {
                  if (!window.confirm("Rasmni o'chirasizmi?")) return;
                  await adminApi.clearDriverPhoto(dr.driver!.id).catch(() => null);
                  setPhotoKey((k) => k + 1);
                }}>🗑</button>
              </div>
              </>
            )}
          </div>
        )}
      </section>
      {err && <p className="muted">{err}</p>}
    </>
  );
}

function MashinaCard() {
  const [d, setD] = useState<Awaited<ReturnType<typeof adminApi.mashina>> | null>(null);
  useEffect(() => {
    adminApi.mashina().then(setD).catch(() => undefined);
  }, []);
  if (!d || d.tickets.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <p className="muted">🎟 Yillik o'yin chiptalari (to'liq mashina to'plagan haydovchilar):</p>
      {d.tickets.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 10 }}>
          <b>{t.name}</b><span className="muted">{t.car}</span><span>🎟 ×{t.tickets}</span>
        </div>
      ))}
    </div>
  );
}

// 🚦 Phase-4: blast-radius labels for the kill-switch board. Each flag = what flipping it actually
// affects, so a non-engineer owner sees "pul-riski" vs "kosmetik" BEFORE toggling. risk: money =
// touches real tanga/emission, ux = user-visible flow, cosmetic = safe/reversible-nothing.
type FlagRisk = "money" | "ux" | "cosmetic";
const FLAG_INFO: Record<string, { risk: FlagRisk; desc: string }> = {
  booking3: { risk: "ux", desc: "Xarita-first taxi oqimi (asosiy)" },
  wheel: { risk: "money", desc: "Safar g'ildiragi — tanga yutuq" },
  baraban: { risk: "money", desc: "Safar-oxiri baraban — tanga" },
  cashout: { risk: "money", desc: "Naxt pulga chiqarish eshigi" },
  welcomebonus: { risk: "money", desc: "Birinchi safar 5000 tanga bonus" },
  recruit: { risk: "money", desc: "Taklif mukofoti" },
  refstaged: { risk: "money", desc: "Bosqichli taklif to'lovi" },
  drvstaged: { risk: "money", desc: "Bosqichli haydovchi-QR to'lovi" },
  drvrecruit: { risk: "money", desc: "Haydovchi→haydovchi mukofot" },
  plus: { risk: "money", desc: "Plus obuna (3x roll)" },
  gap: { risk: "money", desc: "Gap-davra pot" },
  promo: { risk: "money", desc: "Promo kampaniyalar" },
  qarz: { risk: "money", desc: "Haydovchi qarz to'lash (kas yozuv!)" },
  komissiya: { risk: "money", desc: "O'tkazma komissiyasi %" },
  tierloyalty: { risk: "money", desc: "Daraja cashback ko'paytirgich" },
  intercity: { risk: "money", desc: "Shaharlararo safar (real pul)" },
  waitcomp: { risk: "money", desc: "Kutish kompensatsiyasi (o'z byudjeti)" },
  clientbooking: { risk: "ux", desc: "GPS «new» aniq-pin buyurtma" },
  instantstatus: { risk: "ux", desc: "Tez holat — kas soket (~1s)" },
  trackcta: { risk: "cosmetic", desc: "Kuzatuv-sahifa taklif CTA" },
  jackpotpost: { risk: "cosmetic", desc: "Jackpot → Koson kanaliga post" },
  drvrank: { risk: "cosmetic", desc: "Haydovchi QR reyting (o'chirilgan)" },
  tolqin: { risk: "cosmetic", desc: "Tolqin o'yin (olib tashlangan)" },
  mahalla: { risk: "cosmetic", desc: "Mahalla reyting (olib tashlangan)" },
  aibrain: { risk: "cosmetic", desc: "AI konsierj (olib tashlangan)" },
  garage: { risk: "cosmetic", desc: "Eski garaj v1 (olib tashlangan)" },
  carupgrade: { risk: "cosmetic", desc: "Model-upgrade (olib tashlangan)" },
};
const RISK_STYLE: Record<FlagRisk, { label: string; color: string; bg: string }> = {
  money: { label: "💰 PUL", color: "#f0b429", bg: "rgba(240,180,41,.14)" },
  ux: { label: "👁 UX", color: "#378ADD", bg: "rgba(55,138,221,.14)" },
  cosmetic: { label: "◽ kosmetik", color: "#8b94a7", bg: "rgba(139,148,167,.12)" },
};

// kill-switch toggles + mashina fund + B2B corp registry
function ControlCards() {
  const [flags, setFlags] = useState<{ name: string; on: boolean }[] | null>(null);
  const [fund, setFund] = useState(0);
  const [bonusEcon, setBonusEcon] = useState<{ knobs: { key: string; label: string; def: number; min: number; max: number; step: number; group: string }[]; values: Record<string, number> } | null>(null);
  const [txEcon, setTxEcon] = useState<{ knobs: { key: string; label: string; def: number; min: number; max: number; step: number }[]; values: Record<string, number>; enabled: boolean; earned: { total: number; today: number } } | null>(null);
  const [sponsor, setSponsorState] = useState<{ name: string; photoUrl: string | null; active: boolean; isDefault: boolean } | null>(null);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorUrl, setSponsorUrl] = useState("");
  const [season, setSeasonState] = useState<OyinSeasonView | null>(null);
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("");
  const [seasonMsg, setSeasonMsg] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<OyinAdminPrizeRow[] | null>(null);
  const [catalogDraft, setCatalogDraft] = useState<Record<string, { icon: string; name: string; valueLabel: string; price: string; limit: string; photoUrl: string }>>({});
  const [newPrize, setNewPrize] = useState({ icon: "🎁", name: "", valueLabel: "", price: "500", limit: "5", photoUrl: "" });
  const [savedPrizeKey, setSavedPrizeKey] = useState<string | null>(null);
  const [corps, setCorps] = useState<{ id: number; name: string; balance: number; employees: number }[]>([]);
  const [cName, setCName] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empCorp, setEmpCorp] = useState<number | null>(null);
  const [balCorp, setBalCorp] = useState<number | null>(null);
  const [balAmt, setBalAmt] = useState("");
  const [optokens, setOptokens] = useState<{ token: string; role: string; shopName?: string; createdAt: string }[]>([]);
  const [marketShops, setMarketShops] = useState<{ id: number; name: string; active: boolean }[]>([]); // V1.6e
  const [sellerShopPick, setSellerShopPick] = useState<number | "">("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msg2, setMsg2] = useState<string | null>(null);

  const load = () => {
    adminApi.features().then((r) => { setFlags(r.features); setFund(r.mashinaFund); }).catch(() => undefined);
    adminApi.bonusEconomy().then(setBonusEcon).catch(() => undefined);
    adminApi.oyinSponsor().then((s) => { setSponsorState(s); setSponsorName(s.isDefault ? "" : s.name); setSponsorUrl(s.photoUrl ?? ""); }).catch(() => undefined);
    adminApi.oyinSeason().then((s) => {
      setSeasonState(s);
      // datetime-local formatiga ("YYYY-MM-DDTHH:mm") o'tkazamiz — server javobida to'liq ISO keladi.
      const toLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : "");
      setSeasonStart(toLocal(s.startIso));
      setSeasonEnd(toLocal(s.endIso));
      setSeasonLabel(s.label ?? "");
    }).catch(() => undefined);
    adminApi.oyinCatalog().then((r) => {
      setCatalog(r.prizes);
      setCatalogDraft(Object.fromEntries(r.prizes.map((p) => [p.key, {
        icon: p.icon, name: p.name, valueLabel: p.valueLabel, price: String(p.price), limit: String(p.limit), photoUrl: p.photoUrl ?? "",
      }])));
    }).catch(() => undefined);
    adminApi.transferEconomy().then(setTxEcon).catch(() => undefined);
    adminApi.corps().then((r) => setCorps(r.corps)).catch(() => undefined);
    adminApi.optokens().then((r) => setOptokens(r.tokens)).catch(() => undefined);
    adminApi.marketShops().then((r) => setMarketShops(r.shops)).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const saveBonusEcon = async (key: string, value: number) => {
    try { const r = await adminApi.setBonusEconomy(key, value); setBonusEcon((e) => (e ? { ...e, values: r.values } : e)); }
    catch { alert(`'${key}' qiymatini saqlab bo'lmadi`); }
  };
  const saveSponsor = async (active: boolean) => {
    try { setSponsorState(await adminApi.setOyinSponsor(sponsorName, sponsorUrl || null, active)); }
    catch { alert("Homiyni saqlab bo'lmadi"); }
  };
  const saveSeason = async () => {
    setSeasonMsg(null);
    try {
      setSeasonState(await adminApi.setOyinSeason(seasonStart, seasonEnd, seasonLabel.trim() || null));
      setSeasonMsg("✓ Mavsum sanalari saqlandi");
    } catch {
      setSeasonMsg("⛔ Saqlab bo'lmadi — sanani tekshiring (tugash sanasi kelajakda bo'lishi kerak)");
    }
  };
  const resetSeason = async () => {
    if (!confirm("Yangi mavsum toza boshlanadimi?\n\nEski chiptalar, sotilgan-hisoblagichlar va kunlik belgilar ARXIVGA ko'chiriladi (o'chirilmaydi). Sovrinlar ro'yxati saqlanib qoladi.")) return;
    setSeasonMsg(null);
    try {
      const r = await adminApi.resetOyinSeason(seasonStart, seasonEnd, seasonLabel.trim() || null);
      if (!r.ok) { setSeasonMsg(`⛔ ${r.error ?? "Bajarilmadi"}`); return; }
      setSeasonState(await adminApi.oyinSeason());
      setSeasonMsg(`✓ ${r.seasonId} mavsumi boshlandi — ${r.archivedRows ?? 0} ta yozuv arxivlandi`);
      adminApi.oyinCatalog().then((rc) => setCatalog(rc.prizes)).catch(() => undefined);
    } catch {
      setSeasonMsg("⛔ Bajarilmadi — qayta urinib ko'ring");
    }
  };
  const flashSaved = (key: string) => {
    setSavedPrizeKey(key);
    setTimeout(() => setSavedPrizeKey((cur) => (cur === key ? null : cur)), 2000);
  };
  const saveCatalogPrize = async (key: string) => {
    const d = catalogDraft[key];
    if (!d) return;
    try {
      const prizes = (await adminApi.upsertOyinPrize({
        key, icon: d.icon, name: d.name, valueLabel: d.valueLabel,
        price: Number(d.price) || 0, limit: Number(d.limit) || 0, photoUrl: d.photoUrl || null,
      })).prizes;
      setCatalog(prizes);
      // server normalizatsiyasini (trim/clamp) shu qatorning draft'ida ham aks ettiramiz
      const saved = prizes.find((p) => p.key === key);
      if (saved) setCatalogDraft((cur) => ({ ...cur, [key]: {
        icon: saved.icon, name: saved.name, valueLabel: saved.valueLabel, price: String(saved.price), limit: String(saved.limit), photoUrl: saved.photoUrl ?? "",
      } }));
      flashSaved(key);
    } catch { alert("Sovrinni saqlab bo'lmadi"); }
  };
  const addNewPrize = async () => {
    if (!newPrize.name.trim()) return;
    try {
      const r = await adminApi.upsertOyinPrize({
        icon: newPrize.icon, name: newPrize.name, valueLabel: newPrize.valueLabel,
        price: Number(newPrize.price) || 0, limit: Number(newPrize.limit) || 0, photoUrl: newPrize.photoUrl || null,
      });
      setCatalog(r.prizes);
      setCatalogDraft(Object.fromEntries(r.prizes.map((p) => [p.key, {
        icon: p.icon, name: p.name, valueLabel: p.valueLabel, price: String(p.price), limit: String(p.limit), photoUrl: p.photoUrl ?? "",
      }])));
      setNewPrize({ icon: "🎁", name: "", valueLabel: "", price: "500", limit: "5", photoUrl: "" });
      flashSaved("__new__");
    } catch { alert("Yangi sovrin qo'shib bo'lmadi"); }
  };
  const toggleCatalogPrize = async (key: string, active: boolean) => {
    try { setCatalog(await adminApi.setOyinPrizeActive(key, active).then((r) => r.prizes)); }
    catch { alert("Holatni o'zgartirib bo'lmadi"); }
  };
  const removeCatalogPrize = async (key: string) => {
    if (!confirm("Bu sovrinni butunlay o'chirasizmi?")) return;
    try {
      const r = await adminApi.deleteOyinPrize(key);
      if (!r.ok) { alert("Bu sovringa allaqachon chipta sotilgan — o'chirib bo'lmaydi, buning o'rniga «yashirish»ni ishlating."); return; }
      setCatalog((c) => (c ? c.filter((p) => p.key !== key) : c));
    } catch { alert("O'chirib bo'lmadi"); }
  };
  const saveTxEcon = async (key: string, value: number) => {
    try { const r = await adminApi.setTransferEconomy(key, value); setTxEcon((e) => (e ? { ...e, values: r.values } : e)); }
    catch { alert(`'${key}' qiymatini saqlab bo'lmadi`); }
  };
  const toggle = async (name: string, on: boolean) => {
    // P1 (QA fleet): no try/catch → a failed kill-switch toggle was an unhandled rejection with
    // no UI feedback (the operator couldn't tell the flag didn't flip). Surface it.
    try {
      const r = await adminApi.setFeature(name, on);
      setFlags(r.features);
    } catch {
      alert(`'${name}' kill-switch'ni o'zgartirib bo'lmadi — qayta urinib ko'ring`);
    }
  };

  return (
    <>
      {bonusEcon && (
        <section className="card">
          <h3>🎁 Bonus narxlari — jonli boshqaruv (deploy'siz)</h3>
          <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Har bonus turi: taklif/recruit, safar mukofoti, haydovchi tier, missionlar (tanga). Har biri clamp'langan — buzib bo'lmaydi. O'zgartirish ~30s ichida kuchga kiradi.</p>
          {(() => {
            // 🔎 Phase-4 effect preview: what a real ride actually pays under the current rideBase.
            const base = bonusEcon.values.rideBase ?? 100;
            const first = bonusEcon.values.firstRide ?? 5000;
            return (
              <div style={{ background: "rgba(52,211,153,.10)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 10, padding: "8px 12px", margin: "0 0 10px", fontSize: 12.5 }}>
                🚕 <b>Hozirgi sozlamada:</b> oddiy safar ≈ <b>{formatNumber(base)}</b>, 2x ≈ <b>{formatNumber(base * 2)}</b>, 3x ≈ <b>{formatNumber(base * 3)}</b> tanga · 🍀 omad kuni ×2 · birinchi safar bonusi <b>{formatNumber(first)}</b> · <span className="muted">har safar jami ≤350 tanga (clamp)</span>
              </div>
            );
          })()}
          <div style={{ display: "grid", gap: 4 }}>
            {[...new Set(bonusEcon.knobs.map((k) => k.group))].map((grp) => (
              <div key={grp}>
                <div className="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, margin: "8px 0 2px" }}>{grp}</div>
                {bonusEcon.knobs.filter((k) => k.group === grp).map((k) => (
                  <div key={k.key} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "2px 0" }}>
                    <span style={{ flex: 1, minWidth: 200 }}>{k.label}</span>
                    <input type="number" step={k.step} min={k.min} max={k.max} defaultValue={bonusEcon.values[k.key]} id={`bonus-${k.key}`} style={{ width: 100 }} />
                    <span className="muted" style={{ fontSize: 11 }}>[{k.min}–{k.max}]</span>
                    <button className="btn sm" onClick={() => { const el = document.getElementById(`bonus-${k.key}`) as HTMLInputElement | null; if (el) void saveBonusEcon(k.key, Number(el.value)); }}>Saqlash</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <h3>📅 BirJoy O'yinlar Mavsumi — mavsum vaqtlari</h3>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
          Ball <b>faqat mavsum ichidagi</b> harakatlar uchun beriladi — mavsumgacha bo'lgan safarlar hisoblanmaydi.
          Sana kiritilmaguncha o'yin butunlay yopiq turadi.
        </p>
        {season && (
          <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 10, background: season.phase === "active" ? "rgba(52,211,153,.12)" : "rgba(255,255,255,.05)" }}>
              {season.phase === "unset" && <><b>Sozlanmagan</b> — o'yin yopiq, hech kimda ball yo'q</>}
              {season.phase === "upcoming" && <>🚀 <b>Boshlanishi kutilmoqda</b> — {season.startIso?.slice(0, 16).replace("T", " ")} dan</>}
              {season.phase === "active" && <>🟢 <b>Mavsum ochiq</b> — {season.endIso?.slice(0, 16).replace("T", " ")} gacha</>}
              {season.phase === "ended" && <>🏁 <b>Mavsum yakunlandi</b></>}
              <span className="muted"> · {season.seasonId}-mavsum</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, minWidth: 84 }}>Boshlanishi</span>
              <input type="datetime-local" value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, minWidth: 84 }}>Tugashi</span>
              <input type="datetime-local" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, minWidth: 84 }}>Nomi</span>
              <input type="text" value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} placeholder="Avgust mavsumi (ixtiyoriy)" maxLength={40} style={{ flex: 1, minWidth: 160 }} />
            </div>
            {seasonMsg && <div style={{ fontSize: 12, color: seasonMsg.startsWith("✓") ? "#34d399" : "#ff9a9e" }}>{seasonMsg}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn sm" disabled={!seasonStart || !seasonEnd} onClick={() => void saveSeason()}>Sanalarni saqlash</button>
              <button className="btn sm danger" disabled={!seasonStart || !seasonEnd} onClick={() => void resetSeason()}>🧹 Yangi mavsumni toza boshlash</button>
            </div>
            <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.5 }}>
              <b>Sanalarni saqlash</b> — faqat vaqtni o'zgartiradi, eski chiptalar joyida qoladi.<br />
              <b>Toza boshlash</b> — eski chiptalar, sotilgan-hisoblagichlar va kunlik belgilar arxivga ko'chadi, sovrinlar zaxirasi 0 dan boshlanadi. Sovrinlar ro'yxati o'chmaydi.
            </p>
          </div>
        )}
      </section>
      <section className="card">
        <h3>🎮 BirJoy O'yinlar Mavsumi — mavsum homiysi</h3>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
          Sozlanmagan yoki o'chirilgan holatda mijozga <b>BirJoy</b> homiy sifatida ko'rinadi — bo'sh joy qolmaydi.
        </p>
        {sponsor && (
          <div style={{ display: "grid", gap: 6, maxWidth: 420 }}>
            <div style={{ fontSize: 12 }} className="muted">
              Joriy: <b style={{ color: "var(--text)" }}>{sponsor.name}</b>{sponsor.isDefault ? " (default — hech kim sozlamagan)" : sponsor.active ? " (faol)" : " (o'chirilgan)"}
            </div>
            <input type="text" placeholder="Homiy nomi (masalan: Koson Market)" value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} maxLength={60} />
            <input type="text" placeholder="Logo rasm URL (ixtiyoriy)" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn sm" disabled={!sponsorName.trim()} onClick={() => void saveSponsor(true)}>Saqlash va yoqish</button>
              <button className="btn sm" onClick={() => void saveSponsor(false)}>O'chirish (BirJoy ko'rinsin)</button>
            </div>
          </div>
        )}
      </section>
      <section className="card">
        <h3>🎁 BirJoy O'yinlar Mavsumi — sovrin-katalog</h3>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
          Yangi sovrin qo'shish, mavjudini narxi/soni/rasmi bilan tahrirlash, vitrinadan yashirish yoki (chiptasi sotilmagan bo'lsa) butunlay o'chirish.
        </p>
        {catalog && (
          <div style={{ display: "grid", gap: 10, maxWidth: 640 }}>
            {catalog.map((p) => {
              const d = catalogDraft[p.key] ?? { icon: p.icon, name: p.name, valueLabel: p.valueLabel, price: String(p.price), limit: String(p.limit), photoUrl: p.photoUrl ?? "" };
              const setD = (patch: Partial<typeof d>) => setCatalogDraft((cur) => ({ ...cur, [p.key]: { ...d, ...patch } }));
              return (
                <div key={p.key} style={{ display: "grid", gap: 6, padding: "8px 10px", borderRadius: 10, background: p.active ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.02)", opacity: p.active ? 1 : 0.55 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {d.photoUrl ? (
                      <img src={d.photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                    ) : (
                      <span style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{d.icon || "🎁"}</span>
                    )}
                    <input type="text" value={d.icon} onChange={(e) => setD({ icon: e.target.value })} placeholder="emoji" style={{ width: 44, textAlign: "center" }} maxLength={8} />
                    <input type="text" value={d.name} onChange={(e) => setD({ name: e.target.value })} placeholder="Nomi" style={{ flex: 1, minWidth: 120 }} />
                    <input type="text" value={d.valueLabel} onChange={(e) => setD({ valueLabel: e.target.value })} placeholder="~narx (masalan 120 000 so'm)" style={{ width: 150 }} />
                    {!p.active && <span style={{ fontSize: 11, color: "#f0b429" }}>yashirilgan</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="muted" style={{ fontSize: 11 }}>Chipta narxi (ball)</span>
                    <input type="number" min={1} value={d.price} onChange={(e) => setD({ price: e.target.value })} style={{ width: 90 }} />
                    <span className="muted" style={{ fontSize: 11 }}>Chipta-o'rin (dona)</span>
                    <input type="number" min={1} value={d.limit} onChange={(e) => setD({ limit: e.target.value })} style={{ width: 70 }} />
                    <span className="muted" style={{ fontSize: 11 }}>sotilgan: {p.sold}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="text" value={d.photoUrl} onChange={(e) => setD({ photoUrl: e.target.value })} placeholder="Rasm URL (ixtiyoriy — bo'sh = emoji)" style={{ flex: 1 }} />
                    <button className="btn sm" style={savedPrizeKey === p.key ? { background: "rgba(52,211,153,.25)", color: "#34d399" } : undefined} onClick={() => void saveCatalogPrize(p.key)}>{savedPrizeKey === p.key ? "✓ Saqlandi" : "Saqlash"}</button>
                    <button className="btn sm" onClick={() => void toggleCatalogPrize(p.key, !p.active)}>{p.active ? "Yashirish" : "Qaytarish"}</button>
                    <button className="btn sm danger" onClick={() => void removeCatalogPrize(p.key)}>O'chirish</button>
                  </div>
                </div>
              );
            })}
            <div style={{ display: "grid", gap: 6, padding: "10px", borderRadius: 10, border: "1px dashed rgba(255,255,255,.2)" }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>+ Yangi sovrin</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="text" value={newPrize.icon} onChange={(e) => setNewPrize((s) => ({ ...s, icon: e.target.value }))} placeholder="emoji" style={{ width: 44, textAlign: "center" }} maxLength={8} />
                <input type="text" value={newPrize.name} onChange={(e) => setNewPrize((s) => ({ ...s, name: e.target.value }))} placeholder="Nomi (masalan: Termos)" style={{ flex: 1, minWidth: 120 }} />
                <input type="text" value={newPrize.valueLabel} onChange={(e) => setNewPrize((s) => ({ ...s, valueLabel: e.target.value }))} placeholder="~narx" style={{ width: 150 }} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 11 }}>Chipta narxi (ball)</span>
                <input type="number" min={1} value={newPrize.price} onChange={(e) => setNewPrize((s) => ({ ...s, price: e.target.value }))} style={{ width: 90 }} />
                <span className="muted" style={{ fontSize: 11 }}>Chipta-o'rin (dona)</span>
                <input type="number" min={1} value={newPrize.limit} onChange={(e) => setNewPrize((s) => ({ ...s, limit: e.target.value }))} style={{ width: 70 }} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="text" value={newPrize.photoUrl} onChange={(e) => setNewPrize((s) => ({ ...s, photoUrl: e.target.value }))} placeholder="Rasm URL (ixtiyoriy)" style={{ flex: 1 }} />
                <button className="btn sm" style={savedPrizeKey === "__new__" ? { background: "rgba(52,211,153,.25)", color: "#34d399" } : undefined} disabled={!newPrize.name.trim() && savedPrizeKey !== "__new__"} onClick={() => void addNewPrize()}>{savedPrizeKey === "__new__" ? "✓ Qo'shildi" : "Qo'shish"}</button>
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="card">
        <h3>🔌 Mexanika kill-switch (deploy'siz o'chirish)</h3>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Har flag yonida <b>ta'sir doirasi</b>: 💰 pul (real tanga/emissiya), 👁 UX (foydalanuvchi oqimi), ◽ kosmetik (xavfsiz). Yoqishdan oldin nimaga tegishini bilib turing.</p>
        {(["money", "ux", "cosmetic"] as FlagRisk[]).map((risk) => {
          const list = (flags ?? []).filter((f) => (FLAG_INFO[f.name]?.risk ?? "cosmetic") === risk);
          if (list.length === 0) return null;
          const rs = RISK_STYLE[risk];
          return (
            <div key={risk} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: rs.color, margin: "6px 0 3px", letterSpacing: 0.4 }}>{rs.label}</div>
              <div style={{ display: "grid", gap: 4 }}>
                {list.map((f) => (
                  <div key={f.name} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 8px", borderRadius: 8, background: rs.bg }}>
                    <span style={{ fontWeight: 700, minWidth: 110 }}>{f.name}</span>
                    <span className="muted" style={{ flex: 1, minWidth: 140, fontSize: 12 }}>{FLAG_INFO[f.name]?.desc ?? ""}</span>
                    <button className={f.on ? "btn sm" : "btn sm danger"} onClick={() => toggle(f.name, !f.on)}>{f.on ? "🟢 YONIQ" : "🔴 o'chiq"}</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <p className="muted" style={{ marginTop: 8 }}>🏆 Mashina fondi: <b>{fund.toLocaleString("ru-RU")}</b> so'm (100 so'm/safar, withdraw-byudjetdan alohida)</p>
        {txEcon && (
          <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
            <h3 style={{ margin: "0 0 6px" }}>💸 O'tkazma komissiyasi {txEcon.enabled ? <span style={{ color: "#34d399" }}>(YONIQ)</span> : <span className="muted">(o'chiq — «komissiya» flag'ni yoqing)</span>}</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {txEcon.knobs.map((k) => (
                <div key={k.key} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 190 }}>{k.label}</span>
                  <input type="number" step={k.step} min={k.min} max={k.max} defaultValue={txEcon.values[k.key]} id={`txecon-${k.key}`} style={{ width: 90 }} />
                  <span className="muted" style={{ fontSize: 11 }}>[{k.min}–{k.max}%]</span>
                  <button className="btn sm" onClick={() => { const el = document.getElementById(`txecon-${k.key}`) as HTMLInputElement | null; if (el) void saveTxEcon(k.key, Number(el.value)); }}>Saqlash</button>
                </div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>💼 Yig'ilgan komissiya: <b>{txEcon.earned.total.toLocaleString("ru-RU")}</b> tanga (bugun {txEcon.earned.today.toLocaleString("ru-RU")}). Yuboruvchidan +% olinadi, qabul qiluvchi to'liq oladi. «komissiya» flag YONIQ bo'lgandagina ishlaydi.</p>
          </div>
        )}
        <MashinaCard />
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={async () => { const r = await adminApi.optoken("operator"); setMsg2(`Operator token (faqat bir marta ko'rsatiladi): ${r.token}`); load(); }}>🔑 Operator-token yaratish</button>{" "}
          {/* V1.6e: >1 do'kon bo'lsa — QAYSI do'konga token yaratilayotgani aniq tanlanadi.
              Odatda kerak emas (V1.6c avtomatik beradi QABUL'da) — bu qo'lda-qayta-berish/zaxira yo'li. */}
          {marketShops.length > 1 && (
            <select value={sellerShopPick} onChange={(e) => setSellerShopPick(e.target.value ? Number(e.target.value) : "")} style={{ marginRight: 6 }}>
              <option value="">— do'kon tanlang —</option>
              {marketShops.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (faol emas)"}</option>)}
            </select>
          )}
          <button
            className="btn"
            title="Faqat Do'kon: mahsulot qo'shish/narx/stock/rasm — boshqa hech narsa ko'rmaydi"
            disabled={marketShops.length > 1 && sellerShopPick === ""}
            onClick={async () => {
              const shopId = marketShops.length > 1 ? (sellerShopPick === "" ? undefined : sellerShopPick) : marketShops[0]?.id;
              const r = await adminApi.optoken("shopseller", shopId);
              if (!r.ok) { setMsg2(`⚠️ Xatolik: ${r.error ?? "noma'lum"}`); return; }
              setMsg2(`🛍 Do'kon-sotuvchi token (faqat bir marta ko'rsatiladi) — link: ${window.location.origin}/?key=${r.token}`);
              load();
            }}
          >🛍 Do'kon-sotuvchi token yaratish</button>
          {msg2 && <p className="muted" style={{ wordBreak: "break-all" }}>{msg2}</p>}
          {optokens.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p className="muted" style={{ marginBottom: 4 }}>Faol operator-tokenlar ({optokens.length}) — bekor qilsangiz egasi darhol kira olmaydi:</p>
              {optokens.map((t) => (
                <div key={t.token} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
                  <code style={{ flex: 1, fontSize: 12, opacity: 0.8 }}>{t.token.slice(0, 8)}…{t.token.slice(-4)} · {t.role}{t.shopName ? ` (${t.shopName})` : ""}</code>
                  <button className="btn sm danger" onClick={async () => { await adminApi.optokenRevoke(t.token); load(); }}>🗑 Bekor</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <h3>🏢 1067 Biznes (B2B prepaid)</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input className="inp" placeholder="Korxona nomi" value={cName} onChange={(e) => setCName(e.target.value)} />
          <button className="btn" onClick={async () => { if (!cName.trim()) return; await adminApi.corpCreate(cName.trim(), 30); setCName(""); load(); }}>+ Qo'shish</button>
        </div>
        {corps.map((c) => (
          <div key={c.id}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--line, #2a3242)" }}>
              <b style={{ flex: 1 }}>{c.name}</b>
              <span className="muted">balans {c.balance.toLocaleString("ru-RU")} · {c.employees} xodim</span>
              <button className="btn sm" onClick={() => { setBalCorp(balCorp === c.id ? null : c.id); setBalAmt(""); }}>💰</button>
              <button className="btn sm" onClick={() => setEmpCorp(empCorp === c.id ? null : c.id)}>👤+</button>
              <button className="btn sm" onClick={async () => { const r = await adminApi.corpReport(c.id); setMsg(`${r.corp.name}: bu oy ${r.totalRides} safar · ` + r.rows.map((x) => `${x.name ?? x.phone}: ${x.rides}`).join(", ")); }}>📊</button>
            </div>
            {balCorp === c.id && (
              <div style={{ display: "flex", gap: 8, padding: "4px 0 8px" }}>
                <input className="inp" inputMode="numeric" placeholder="Summa: + qo'shish / − yechish (so'm)" value={balAmt} onChange={(e) => setBalAmt(e.target.value)} />
                <button className="btn" onClick={async () => {
                  const n = Math.trunc(Number(balAmt));
                  if (!Number.isFinite(n) || n === 0) { setMsg("Noto'g'ri summa — butun, noldan farqli son kiriting"); return; }
                  const r = await adminApi.corpBalance(c.id, n);
                  setMsg(r.ok ? `✅ ${c.name}: yangi balans ${r.balance?.toLocaleString("ru-RU")} so'm` : `Xato: ${r.reason === "insufficient" ? "balans 0 dan past bo'lolmaydi" : r.reason === "bad_amount" ? "noto'g'ri summa" : (r.reason ?? "bajarilmadi")}`);
                  setBalCorp(null); setBalAmt(""); load();
                }}>OK</button>
              </div>
            )}
          </div>
        ))}
        {empCorp !== null && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input className="inp" placeholder="Xodim raqami: 901234567" value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} />
            <button className="btn" onClick={async () => { const r = await adminApi.corpAddEmployee(empCorp, empPhone); setMsg(r.ok ? "Xodim qo'shildi" : `Xato: ${r.reason}`); setEmpPhone(""); load(); }}>OK</button>
          </div>
        )}
        {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
      </section>
    </>
  );
}

// ─── 📢 Xabarlar tarixi — persistent broadcast delivery log ─────────────────
// Every send is stored server-side (Broadcast + failed BroadcastRecipient rows),
// so "kim oldi / kim olmadi" is visible ANYTIME, not just right after sending.
function BroadcastHistoryView() {
  const [rows, setRows] = useState<AdminBroadcastRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminBroadcastDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    adminApi.broadcasts(50).then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "xatolik"));
  }, []);

  const toggle = async (id: number) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    setDetailBusy(true);
    try {
      setDetail(await adminApi.broadcastDetail(id));
    } catch {
      setDetail(null);
    } finally {
      setDetailBusy(false);
    }
  };

  const segBadge = (s: string) =>
    s === "all" ? { ico: "🌐", label: "Hammaga" } : s === "linked" ? { ico: "✅", label: "Bog'langan" } : { ico: "😴", label: "Uxlagan" };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const downloadCsv = (d: AdminBroadcastDetail) => {
    const csv = "Ism,Telefon,TelegramID\n" + d.failed.map((f) => `"${f.name}",${f.phone ?? ""},${f.telegramId}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `xabar-${d.id}-yetib-bormaganlar.csv`;
    a.click();
  };

  return (
    <section className="panel">
      <div className="panel-title">📢 Xabarlar tarixi</div>
      <p className="muted" style={{ fontSize: 13, margin: "2px 0 12px" }}>
        Har yuborilgan ommaviy xabar shu yerda saqlanadi — kim oldi, kim olmadi. Yetib bormaganlar ro'yxati hech qachon yo'qolmaydi.
      </p>
      {err && <div className="action-msg">⚠️ {err}</div>}
      {!rows && !err && <div className="muted">⏳ yuklanmoqda…</div>}
      {rows && rows.length === 0 && (
        <div className="bh-empty">
          <div style={{ fontSize: 32 }}>📭</div>
          <div>Hali xabar yuborilmagan. «Amallar» bo'limidagi 📣 Yangiliklar orqali yuboring — natija shu yerda saqlanadi.</div>
        </div>
      )}
      <div className="bh-list">
        {rows?.map((b) => {
          const sb = segBadge(b.segment);
          const pct = b.totalCount ? (b.sentCount / b.totalCount) * 100 : 0;
          const open = openId === b.id;
          return (
            <div key={b.id} className={`bh-card${open ? " open" : ""}`}>
              <button className="bh-head" onClick={() => toggle(b.id)}>
                <div className="bh-head-top">
                  <span className="bh-date">🗓 {fmtDate(b.createdAt)}</span>
                  <span className="bh-seg">{sb.ico} {sb.label}</span>
                </div>
                <div className="bh-text">{b.text.length > 140 ? b.text.slice(0, 140) + "…" : b.text}</div>
                <div className="bc-result-bar"><div className="bc-result-fill" style={{ width: `${pct}%` }} /></div>
                <div className="bh-counts">
                  <span className="bh-ok">✅ {b.sentCount} yetdi</span>
                  <span className={b.failedCount > 0 ? "bh-bad" : "muted"}>📵 {b.failedCount} bormadi</span>
                  <span className="muted">jami {b.totalCount}</span>
                  <span className="bh-chev">{open ? "▲" : "▼"}</span>
                </div>
              </button>
              {open && (
                <div className="bh-detail">
                  {detailBusy && <div className="muted" style={{ fontSize: 13 }}>⏳ yuklanmoqda…</div>}
                  {!detailBusy && detail && detail.id === b.id && (
                    <>
                      <div className="bh-fulltext">{detail.text}</div>
                      {detail.failed.length === 0 ? (
                        <div className="bh-ok" style={{ fontSize: 13 }}>✅ Hammaga yetib borgan — yetib bormaganlar yo'q.</div>
                      ) : (
                        <>
                          <div className="bh-bad" style={{ fontSize: 13, fontWeight: 700 }}>📵 Yetib bormaganlar ({detail.failed.length}) — botni bloklagan/o'chirgan:</div>
                          <div className="bh-failed-list">
                            {detail.failed.map((f) => (
                              <div key={f.telegramId} className="bh-failed-row">
                                <span>{f.name}</span>
                                <span className="muted">{f.phone ?? "—"}</span>
                              </div>
                            ))}
                          </div>
                          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => downloadCsv(detail)}>📥 CSV yuklab olish</button>
                        </>
                      )}
                    </>
                  )}
                  {!detailBusy && (!detail || detail.id !== b.id) && <div className="action-msg">⚠️ Tafsilot yuklanmadi</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionsView({ onHistory }: { onHistory?: () => void }) {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);
  const [currency, setCurrency] = useState<"tanga" | "cashback">("tanga"); // admin "give money" → spendable TANGA by default

  const [text, setText] = useState("");
  const [segment, setSegment] = useState<"all" | "linked" | "dormant">("all");
  const [days, setDays] = useState("14");
  const [annMsg, setAnnMsg] = useState<string | null>(null);
  const [annFailed, setAnnFailed] = useState<{ telegramId: string; name: string; phone: string | null }[]>([]);
  const [annStats, setAnnStats] = useState<{ sent: number; total: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const insertAtCursor = (before: string, after = "") => {
    const ta = taRef.current;
    if (!ta) { setText((t) => t + before + after); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const val = ta.value;
    const sel = val.slice(s, e);
    const next = val.slice(0, s) + before + sel + after + val.slice(e);
    setText(next);
    requestAnimationFrame(() => { ta.focus(); const pos = s + before.length + sel.length + after.length; ta.setSelectionRange(pos, pos); });
  };
  // minimal Telegram-HTML preview: allow b/i/u/s/a, escape everything else
  const previewHtml = (raw: string): string => {
    const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc
      .replace(/&lt;(\/?)(b|i|u|s|strong|em)&gt;/gi, "<$1$2>")
      .replace(/&lt;a href=&quot;([^&]*)&quot;&gt;/gi, '<a href="$1">')
      .replace(/&lt;a href="([^"]*)"&gt;/gi, '<a href="$1">')
      .replace(/&lt;\/a&gt;/gi, "</a>")
      .replace(/\n/g, "<br>");
  };
  const [annBusy, setAnnBusy] = useState(false);
  // 🎁 segment bonus + 😴 wake-up
  const [segAmount, setSegAmount] = useState("");
  const [segBusy, setSegBusy] = useState(false);
  const [segMsg, setSegMsg] = useState<string | null>(null);
  const [wakeText, setWakeText] = useState("");
  const [wakeBonus, setWakeBonus] = useState("");
  const [wakeBusy, setWakeBusy] = useState(false);
  const [wakeMsg, setWakeMsg] = useState<string | null>(null);

  const doGrant = async () => {
    if (!phone || !amount || grantBusy) return;
    setGrantBusy(true);
    setGrantMsg(null);
    try {
      const r = currency === "tanga"
        ? await adminApi.grantTanga(phone, Number(amount), reason)
        : await adminApi.grant(phone, Number(amount), reason);
      setGrantMsg(r.message);
      if (r.ok) { setAmount(""); setReason(""); }
    } catch (e) {
      setGrantMsg(e instanceof Error ? e.message : "xatolik");
    } finally {
      setGrantBusy(false);
    }
  };

  const segLabel = segment === "all" ? "BARCHA" : segment === "linked" ? "bog'langan" : `uxlagan (${days} kun)`;
  const doAnnounce = async () => {
    if (text.trim().length < 3 || annBusy) return;
    if (!confirm(`${segLabel} foydalanuvchilarga yuborilsinmi?`)) return;
    setAnnBusy(true);
    setAnnMsg(null);
    setAnnFailed([]);
    try {
      const r = await adminApi.announce(text, segment, Number(days));
      setAnnMsg(r.message);
      setAnnFailed(r.failedList ?? []);
      const m = r.message.match(/(\d+)\/(\d+)/);
      setAnnStats(m ? { sent: Number(m[1]), total: Number(m[2]) } : null);
      if (r.ok) setText("");
    } catch (e) {
      setAnnMsg(e instanceof Error ? e.message : "xatolik");
    } finally {
      setAnnBusy(false);
    }
  };
  const doSegGrant = async () => {
    const a = Number(segAmount);
    if (!(a > 0) || segBusy) return;
    if (!confirm(`${segLabel} segmentidagi HAR a'zoga ${a} tanga berilsinmi? (ortga qaytmaydi)`)) return;
    setSegBusy(true);
    setSegMsg(null);
    try {
      const r = await adminApi.grantSegment(segment, a, "🎁 1067 sovg'asi", Number(days));
      setSegMsg(r.message);
      if (r.ok) setSegAmount("");
    } catch (e) {
      setSegMsg(e instanceof Error ? e.message : "xatolik");
    } finally {
      setSegBusy(false);
    }
  };
  const doWake = async () => {
    if (wakeText.trim().length < 3 || wakeBusy) return;
    const bonus = Number(wakeBonus) || 0;
    if (!confirm(`Uxlagan (${days} kun) mijozlarga xabar${bonus > 0 ? ` + ${bonus} tanga bonus` : ""} yuborilsinmi?`)) return;
    setWakeBusy(true);
    setWakeMsg(null);
    try {
      const r = await adminApi.wakeUp(wakeText, bonus, Number(days));
      setWakeMsg(r.message);
      if (r.ok) { setWakeText(""); setWakeBonus(""); }
    } catch (e) {
      setWakeMsg(e instanceof Error ? e.message : "xatolik");
    } finally {
      setWakeBusy(false);
    }
  };

  return (
    <div className="actions">
      <section className="panel">
        <div className="panel-title">💰 Pul berish / tuzatish</div>
        <div style={{ display: "flex", gap: 6, margin: "4px 0 8px" }}>
          <button className="btn" style={{ flex: 1, opacity: currency === "tanga" ? 1 : 0.45 }} onClick={() => setCurrency("tanga")}>🪙 Tanga</button>
          <button className="btn" style={{ flex: 1, opacity: currency === "cashback" ? 1 : 0.45 }} onClick={() => setCurrency("cashback")}>💸 Cashback</button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
          {currency === "tanga"
            ? "🪙 TANGA yoziladi — ilovada ishlatiladigan pul (hamyon · o'yin · o'tkazma · yo'l haqi). Manfiy ham bo'ladi."
            : "💸 kas1067 CASHBACK yoziladi (1303) — faqat safar-bonusini tuzatish uchun. Manfiy ham bo'ladi."}
        </p>
        <div className="form-grid">
          <input className="search" placeholder="📱 Telefon (+998…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="search" placeholder="💰 Summa (+ yoki −)" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
        </div>
        <input className="search" style={{ width: "100%", marginTop: 8 }} placeholder="📝 Sabab (ixtiyoriy)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn" style={{ marginTop: 12 }} onClick={doGrant} disabled={grantBusy}>{grantBusy ? "⏳…" : currency === "tanga" ? "🪙 Tanga berish" : "💸 Cashback berish"}</button>
        {grantMsg && <div className="action-msg">{grantMsg}</div>}
      </section>

      <section className="panel bc-panel">
        <div className="panel-title">📣 Yangiliklar — xabar yuborish</div>
        {/* segment cards */}
        <div className="bc-segs">
          <button className={`bc-seg${segment === "all" ? " active" : ""}`} onClick={() => setSegment("all")}>
            <div className="bc-seg-ico">🌐</div>
            <div className="bc-seg-name">Hammaga</div>
            <div className="bc-seg-desc">Barcha foydalanuvchi</div>
          </button>
          <button className={`bc-seg${segment === "linked" ? " active" : ""}`} onClick={() => setSegment("linked")}>
            <div className="bc-seg-ico">✅</div>
            <div className="bc-seg-name">Bog'langan</div>
            <div className="bc-seg-desc">Raqami ulangan</div>
          </button>
          <button className={`bc-seg${segment === "dormant" ? " active" : ""}`} onClick={() => setSegment("dormant")}>
            <div className="bc-seg-ico">😴</div>
            <div className="bc-seg-name">Uxlagan</div>
            <div className="bc-seg-desc">{days} kun safarsiz</div>
          </button>
        </div>
        {segment === "dormant" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>Necha kundan beri safarsiz:</span>
            <input className="search" style={{ width: 80 }} type="number" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        )}

        <div className="bc-wrap">
          {/* composer */}
          <div>
            <div className="bc-toolbar">
              <button className="bc-tool" title="Qalin" onClick={() => insertAtCursor("<b>", "</b>")}><b>B</b></button>
              <button className="bc-tool" title="Kursiv" onClick={() => insertAtCursor("<i>", "</i>")}><i>I</i></button>
              <button className="bc-tool" title="Havola" onClick={() => insertAtCursor('<a href="https://">', "</a>")}>🔗 Havola</button>
              <button className="bc-tool" onClick={() => insertAtCursor("🎁 ")}>🎁</button>
              <button className="bc-tool" onClick={() => insertAtCursor("🚕 ")}>🚕</button>
              <button className="bc-tool" onClick={() => insertAtCursor("🔥 ")}>🔥</button>
              <button className="bc-tool" onClick={() => insertAtCursor("💰 ")}>💰</button>
              <button className="bc-tool" onClick={() => insertAtCursor("⚡ ")}>⚡</button>
            </div>
            <textarea
              ref={taRef}
              className="bc-textarea"
              placeholder="📢 Yangilik matnini yozing…&#10;&#10;Qalin uchun B, havola uchun 🔗 tugmasini bosing."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className={`bc-count${text.length > 2000 ? " over" : ""}`}>{text.length} / 2000</div>
            <button className="bc-send" onClick={doAnnounce} disabled={annBusy || text.trim().length < 3}>
              {annBusy ? "⏳ Yuborilmoqda…" : `📤 ${segment === "all" ? "Hammaga" : segment === "linked" ? "Bog'langanga" : "Uxlaganga"} yuborish`}
            </button>

            {annStats && (
              <div className="bc-result">
                <div style={{ fontWeight: 700, fontSize: 14 }}>{annMsg}</div>
                <div className="bc-result-bar"><div className="bc-result-fill" style={{ width: `${annStats.total ? (annStats.sent / annStats.total) * 100 : 0}%` }} /></div>
                <div style={{ fontSize: 12 }}>
                  <span className="bh-ok">✅ {annStats.sent} yetdi</span>
                  <span className="muted"> · </span>
                  <span className={annStats.total - annStats.sent > 0 ? "bh-bad" : "muted"}>📵 {annStats.total - annStats.sent} bormadi</span>
                </div>
                {onHistory && (
                  <button className="bh-link" onClick={onHistory}>📢 To'liq tarixni ko'rish — «Xabarlar tarixi»</button>
                )}
              </div>
            )}
            {!annStats && annMsg && <div className="action-msg">{annMsg}</div>}

            {annFailed.length > 0 && (
              <details style={{ marginTop: 10, background: "var(--card-2)", borderRadius: 12, padding: "10px 14px", border: "1px solid var(--line)" }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>
                  📵 Yetib bormaganlar ({annFailed.length}) — botni bloklagan/o'chirgan
                </summary>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                  {annFailed.map((f) => (
                    <div key={f.telegramId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
                      <span>{f.name}</span>
                      <span style={{ color: "var(--muted)" }}>{f.phone ?? "—"}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="btn"
                  style={{ marginTop: 8, fontSize: 12 }}
                  onClick={() => {
                    const csv = "Ism,Telefon,TelegramID\n" + annFailed.map((f) => `"${f.name}",${f.phone ?? ""},${f.telegramId}`).join("\n");
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
                    a.download = "yetib-bormaganlar.csv";
                    a.click();
                  }}
                >
                  📥 CSV yuklab olish
                </button>
              </details>
            )}
          </div>

          {/* live phone preview */}
          <div className="bc-preview-wrap">
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>Ko'rinishi</div>
            <div className="bc-phone">
              <div className="bc-phone-head">
                <div className="bc-phone-av">🚕</div>
                <div>
                  <div className="bc-phone-title">BirJoy</div>
                  <div className="bc-phone-sub">bot</div>
                </div>
              </div>
              <div className="bc-phone-body">
                <div className="bc-bubble">
                  <b>📣 BirJoy</b><br /><br />
                  {text.trim()
                    ? <span dangerouslySetInnerHTML={{ __html: previewHtml(text) }} />
                    : <span className="bc-bubble-empty">Xabar matni shu yerda ko'rinadi…</span>}
                  <div className="bc-bubble-time">✓✓ hozir</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">🎁 Segmentga bonus</div>
        <p className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>Yuqorida tanlangan segment: <b style={{ color: "var(--accent)" }}>{segment === "all" ? "Hammaga" : segment === "linked" ? "Bog'langan" : `Uxlagan (${days} kun)`}</b></p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="search" style={{ flex: "1 1 140px" }} type="number" placeholder="🎁 Bonus (tanga)" value={segAmount} onChange={(e) => setSegAmount(e.target.value)} />
          <button className="btn" onClick={doSegGrant} disabled={segBusy}>{segBusy ? "⏳…" : `🎁 ${segment === "all" ? "Hammaga" : segment === "linked" ? "Bog'langanga" : "Uxlaganga"} bonus`}</button>
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Bonus tanlangan segmentdagi HAR a'zoga beriladi (jami cap 5M tanga). Ortga qaytmaydi.</p>
        {segMsg && <div className="action-msg">{segMsg}</div>}
      </section>

      <section className="panel">
        <div className="panel-title">😴 Uyg'otish — uxlagan mijozlar</div>
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 10px" }}>Yuqoridagi «kun» bo'yicha uxlaganlarga xabar + (ixtiyoriy) qaytish bonusi — bitta tugma.</p>
        <textarea className="search" style={{ width: "100%", minHeight: 70, resize: "vertical" }} placeholder="🔔 Sizni sog'indik! Bugun qaytib keling — sovg'a kutyapti 🎁" value={wakeText} onChange={(e) => setWakeText(e.target.value)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <input className="search" style={{ flex: "1 1 140px" }} type="number" placeholder="🎁 Bonus (0 = faqat xabar)" value={wakeBonus} onChange={(e) => setWakeBonus(e.target.value)} />
          <button className="btn" onClick={doWake} disabled={wakeBusy}>{wakeBusy ? "⏳…" : "😴→🔔 Uyg'otish"}</button>
        </div>
        {wakeMsg && <div className="action-msg">{wakeMsg}</div>}
      </section>
    </div>
  );
}

// ─── 🔐 money integrity (reconciliation) ────────────────────────────────────
function IntegrityView() {
  const [data, setData] = useState<AdminIntegrity | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [unflagId, setUnflagId] = useState("");
  const [unflagMsg, setUnflagMsg] = useState<string | null>(null);
  const [ubusy, setUbusy] = useState(false);
  const load = () => adminApi.integrity().then(setData).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  const heal = async (id: number) => {
    setBusy(id);
    try {
      await adminApi.heal(id);
      await load();
    } finally {
      setBusy(null);
    }
  };
  const doUnflag = async () => {
    const id = Math.trunc(Number(unflagId));
    if (!id) { setUnflagMsg("member id kiriting"); return; }
    setUbusy(true);
    try {
      const r = await adminApi.unflag(id);
      setUnflagMsg(r.message);
      setUnflagId("");
    } catch {
      setUnflagMsg("Xato — owner huquqi kerak yoki tarmoq xatosi");
    } finally {
      setUbusy(false);
    }
  };
  if (!data) return <div className="screen center"><div className="spinner" /></div>;
  const ok = data.driftCount === 0;
  return (
    <>
      <section className="panel">
        <div className="panel-title">🔐 Pul yaxlitligi (balans = ledger)</div>
        <div className="health-grid">
          <HealthCell label="Tekshirildi" ok={true} detail={`${formatNumber(data.checked)} hisob`} />
          <HealthCell label="Nomuvofiqlik" ok={ok} detail={ok ? "✅ hammasi to'g'ri" : `${data.driftCount} drift · ${formatNumber(data.driftTotal)} tanga`} warn={!ok} />
          <HealthCell label="Anomaliya (24s)" ok={data.anomalies.length === 0} detail={data.anomalies.length ? `${data.anomalies.length} shubhali` : "yo'q"} warn={data.anomalies.length > 0} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">🚩 Risk-bayroqni yechish (withdraw'ni qayta ochish)</div>
        <p className="muted" style={{ marginBottom: 8 }}>Anomaliya/fan-in bo'yicha muzlatilgan hisobni ko'rib chiqqach, member id bilan withdraw'ni oching (owner-only).</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="inp" inputMode="numeric" placeholder="member id" value={unflagId} onChange={(e) => setUnflagId(e.target.value)} style={{ maxWidth: 160 }} />
          <button className="btn" disabled={ubusy} onClick={doUnflag}>{ubusy ? "…" : "🚩 Bayroqni yechish"}</button>
          {unflagMsg && <span className="muted">{unflagMsg}</span>}
        </div>
      </section>
      {data.drifts.length > 0 && (
        <section className="panel">
          <div className="panel-title">⚠️ Drift (balans ≠ ledger)</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mijoz</th><th className="num">Balans</th><th className="num">Ledger</th><th className="num">Drift</th><th></th></tr></thead>
              <tbody>
                {data.drifts.map((d) => (
                  <tr key={d.memberId} className="row-warn">
                    <td className="td-name">{d.member}</td>
                    <td className="num">{formatNumber(d.balance)}</td>
                    <td className="num">{formatNumber(d.ledger)}</td>
                    <td className="num strong" style={{ color: "var(--red)" }}>{d.drift > 0 ? "+" : ""}{formatNumber(d.drift)}</td>
                    <td><button className="btn" disabled={busy === d.memberId} onClick={() => heal(d.memberId)}>{busy === d.memberId ? "…" : "🔧 Tuzatish"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data.anomalies.length > 0 && (
        <section className="panel">
          <div className="panel-title">🚨 Anomaliya — 24s eng katta tanga yutuqlari (≥{formatNumber(data.anomalyThreshold)})</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mijoz</th><th className="num">24s yutuq</th></tr></thead>
              <tbody>
                {data.anomalies.map((a) => (
                  <tr key={a.memberId} className="row-warn"><td className="td-name">{a.member}</td><td className="num strong">{formatNumber(a.gain24h)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// ─── 📜 audit ───────────────────────────────────────────────────────────────
function AuditView() {
  const [rows, setRows] = useState<AdminAuditRow[] | null>(null);
  useEffect(() => {
    adminApi.audit().then(setRows).catch(() => undefined);
  }, []);
  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  return (
    <section className="panel">
      <div className="panel-title">📜 Audit jurnali — so'nggi mukofot/withdraw</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vaqt</th><th>Tur</th><th>Kim</th><th className="num">Summa</th><th>Sabab</th><th>kas</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="muted">{fmtTime(r.at)}</td>
                <td><span className="lvl">{r.kind}</span></td>
                <td className="td-name">{r.member}</td>
                <td className="num strong" style={{ color: r.amount >= 0 ? "var(--green)" : "var(--red)" }}>{r.amount >= 0 ? "+" : ""}{formatNumber(r.amount)}</td>
                <td className="muted">{r.reason}</td>
                <td>{r.appliedToKas ? <span className="dot ok" /> : <span className="dot" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 🧠 AI Bilim — jamoaviy bilim moderatsiya (odam yozadi → ega tasdiqlaydi → AI biladi) ──
function KnowledgeAdminView() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [items, setItems] = useState<{ id: number; text: string; submittedBy: string; createdAt: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (s: "pending" | "approved" | "rejected") => {
    setItems(null);
    adminApi.aiKnowledgeList(s).then((r) => setItems(r.items)).catch(() => setItems([]));
  };
  useEffect(() => { load(status); }, [status]);
  const moderate = async (id: number, approve: boolean) => { setBusy(true); await adminApi.aiKnowledgeModerate(id, approve).catch(() => undefined); setBusy(false); load(status); };
  const del = async (id: number) => { if (!confirm("Bu ma'lumot butunlay o'chirilsinmi?")) return; setBusy(true); await adminApi.aiKnowledgeDelete(id).catch(() => undefined); setBusy(false); load(status); };
  return (
    <section className="panel">
      <div className="panel-title">🧠 AI Bilim — jamoaviy bilim moderatsiya</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} className={"btn sm" + (status === s ? " active" : "")} onClick={() => setStatus(s)}>
            {s === "pending" ? "⏳ Kutilmoqda" : s === "approved" ? "✅ Tasdiqlangan" : "❌ Rad etilgan"}
          </button>
        ))}
      </div>
      {!items ? (
        <div className="screen center"><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="muted">Bo'sh.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ma'lumot</th><th>Yubordi</th><th>Sana</th><th>Amal</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.text}</td>
                  <td className="muted">{it.submittedBy}</td>
                  <td className="muted">{fmtTime(it.createdAt)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {status === "pending" && (
                      <>
                        <button className="btn sm" disabled={busy} onClick={() => moderate(it.id, true)}>✅</button>{" "}
                        <button className="btn sm" disabled={busy} onClick={() => moderate(it.id, false)}>❌</button>{" "}
                      </>
                    )}
                    <button className="btn sm" disabled={busy} onClick={() => del(it.id)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>✅ Tasdiqlangan ma'lumotlarni Koson AI biladi va foydalanuvchilarga aytadi.</div>
    </section>
  );
}

// ─── members / bot users (existing, lightly wrapped) ────────────────────────
function MembersTab({ type }: { type: "driver" | "client" }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [members, setMembers] = useState<AdminMemberRow[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    setQuery("");
    Promise.all([adminApi.stats(type), adminApi.members(type)]).then(([s, m]) => { setStats(s); setMembers(m); }).catch(() => undefined);
  }, [type]);
  return <MembersView type={type} stats={stats} members={members} query={query} setQuery={setQuery} />;
}

// 👑 user management ("boshqaruv"): search → accounts → re-link/unlink/code/coin-adjust + withdrawals
// ─── 📢 Tezkor e'lon (topshiriq tabida ham ko'rinadigan sodda forma) ──────────
function QuickAnnounceView() {
  const [text, setText] = useState("");
  const [segment, setSegment] = useState<"all" | "linked" | "dormant">("linked");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const send = async () => {
    if (text.trim().length < 3 || busy) return;
    const segLabel = segment === "all" ? "BARCHA" : segment === "linked" ? "bog'langan" : "uxlagan";
    if (!confirm(`${segLabel} foydalanuvchilarga xabar yuborilsinmi?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await adminApi.announce(text, segment, 30);
      setMsg(r.message);
      if (r.ok) setText("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-title">📢 Tezkor xabar / e'lon</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {(["linked", "all", "dormant"] as const).map((s) => (
          <button key={s} className="btn sm" style={{ opacity: segment === s ? 1 : 0.45 }} onClick={() => setSegment(s)}>
            {s === "all" ? "🌐 Hammaga" : s === "linked" ? "✅ Bog'langan" : "😴 Uxlagan"}
          </button>
        ))}
      </div>
      <textarea
        className="search"
        style={{ width: "100%", minHeight: 90, resize: "vertical", fontSize: 14 }}
        placeholder={"📢 E'lon matni…\n<b>Qalin</b>, <i>kursiv</i>, <a href='...'>havola</a> qo'llanadi"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn" style={{ marginTop: 8 }} onClick={send} disabled={busy}>
        {busy ? "⏳ Yuborilmoqda…" : "📤 Xabar yuborish"}
      </button>
      {msg && <div className="action-msg" style={{ marginTop: 8 }}>{msg}</div>}
    </section>
  );
}

function CampaignsView() {
  const [data, setData] = useState<{ campaigns: CampaignRow[]; conds: { cond: string; label: string; unit: string }[]; enabled: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("🎁");
  const [cond, setCond] = useState("invite_ride");
  const [target, setTarget] = useState("");
  const [windowDays, setWindowDays] = useState("");
  const [reward, setReward] = useState("");
  const [audience, setAudience] = useState("client");
  const [msg, setMsg] = useState("");

  const load = () => adminApi.campaigns().then(setData).catch(() => undefined);
  useEffect(() => { load(); }, []);

  const reset = () => { setEditingId(null); setTitle(""); setEmoji("🎁"); setCond("invite_ride"); setTarget(""); setWindowDays(""); setReward(""); setAudience("client"); };
  const submit = async () => {
    const t = Number(target), w = Number(windowDays), r = Number(reward);
    if (!title.trim() || t <= 0 || w <= 0) { setMsg("⚠️ Nom, target va muddat to'g'ri bo'lsin"); return; }
    const payload = { title: title.trim(), emoji, cond, target: t, windowDays: w, reward: r, audience };
    const res = editingId
      ? await adminApi.editCampaign(editingId, payload).catch(() => ({ ok: false, reason: "net" }))
      : await adminApi.addCampaign(payload).catch(() => ({ ok: false, reason: "net" }));
    setMsg(res.ok ? "✅ Saqlandi" : "❌ " + (res.reason ?? ""));
    if (res.ok) { reset(); load(); }
  };
  const startEdit = (c: CampaignRow) => { setEditingId(c.id); setTitle(c.title); setEmoji(c.emoji); setCond(c.cond); setTarget(String(c.target)); setWindowDays(String(c.windowDays)); setReward(String(c.reward)); setAudience(c.audience); setMsg("✏️ Tahrirlanmoqda…"); };
  const toggle = async (id: string, active: boolean) => { await adminApi.toggleCampaign(id, active).catch(() => undefined); load(); };
  const del = async (c: CampaignRow) => { if (!window.confirm(`"${c.title}" o'chirilsinmi?`)) return; await adminApi.deleteCampaign(c.id).catch(() => undefined); if (editingId === c.id) reset(); load(); };

  const unit = data?.conds.find((x) => x.cond === cond)?.unit ?? "";
  return (
    <>
      <section className="panel">
        <div className="panel-title">{editingId ? "✏️ Promo tahrirlash" : "🎁 Yangi promo-task"}</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Masalan: «5 kunda 5 do&apos;st» → <b>Do&apos;st taklif (safar qilsa)</b> · target 5 · muddat 5 · 10000 tanga.{" "}
          {data && !data.enabled && <b style={{ color: "#f59e0b" }}>«promo» flag o&apos;chiq — actions&apos;dan yoqing.</b>}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ width: 50, padding: 8 }} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🎁" />
          <input style={{ flex: "2 1 160px", padding: "8px 10px" }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom: 5 kunda 5 do'st" />
          <select value={cond} onChange={(e) => setCond(e.target.value)} style={{ flex: "1 1 180px", padding: 8 }}>
            {data?.conds.map((c) => <option key={c.cond} value={c.cond}>{c.label}</option>)}
          </select>
          <input style={{ flex: "1 1 70px", padding: 8 }} type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`Target${unit ? " (" + unit + ")" : ""}`} />
          <input style={{ flex: "1 1 70px", padding: 8 }} type="number" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} placeholder="Muddat (kun)" />
          <input style={{ flex: "1 1 80px", padding: 8 }} type="number" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Bonus (tanga)" />
          <select value={audience} onChange={(e) => setAudience(e.target.value)} style={{ padding: 8 }}>
            <option value="client">Mijozlar</option><option value="driver">Haydovchilar</option><option value="all">Hammasi</option>
          </select>
          <button onClick={submit}>{editingId ? "💾 Saqlash" : "➕ Qo'shish"}</button>
          {editingId && <button onClick={reset}>✖️</button>}
        </div>
        {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
      </section>
      <section className="panel">
        <div className="panel-title">📋 Promolar ({data?.campaigns.length ?? 0})</div>
        {(data?.campaigns ?? []).map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ flex: "2 1 220px" }}>
              {c.emoji} <b>{c.title}</b> <span className="muted">· {data?.conds.find((x) => x.cond === c.cond)?.label ?? c.cond} ≥{c.target} · {c.windowDays} kun · +{c.reward} tanga · {c.audience}</span>
            </span>
            <span className="muted" style={{ fontSize: 12 }}>✅ {c.completions} ta {c.ended ? "· ⏹ tugagan" : ""}</span>
            <button className="btn sm" onClick={() => toggle(c.id, !c.active)}>{c.active ? "🟢 Yoniq" : "🔴 O'chiq"}</button>
            <button className="btn sm" onClick={() => startEdit(c)}>✏️</button>
            <button className="btn sm" onClick={() => del(c)}>🗑</button>
          </div>
        ))}
        {data && data.campaigns.length === 0 && <p className="muted">Hali promo yo'q.</p>}
      </section>
    </>
  );
}

// 🛍 TANGA DO'KONI — mahsulot CRUD + rasm yuklash + buyurtmalar ro'yxati (feature "shop").
// Yetkazish-tasdiqlash Telegram'da (✅/❌ tugmalar egaga boradi) — bu panel katalog+monitoring.
interface ShopDraft {
  name: string; category: string; description: string;
  priceTanga: string; oldPriceTanga: string; stock: string;
  // 🏷 Katalog-pasport (ega, 2026-07-27). Bo'sh satr = maydonni tozalash (server null qiladi).
  brand: string; unit: string; manufacturer: string; expiryDate: string;
  barcode: string; sku: string; supplier: string; // ICHKI — mijozga ko'rinmaydi
}
function shopDraftFromRow(p: ShopAdminProductRow): ShopDraft {
  return {
    name: p.name, category: p.category, description: p.description ?? "",
    priceTanga: String(p.priceTanga), oldPriceTanga: p.oldPriceTanga != null ? String(p.oldPriceTanga) : "", stock: String(p.stock),
    brand: p.brand ?? "", unit: p.unit ?? "", manufacturer: p.manufacturer ?? "", expiryDate: p.expiryDate ?? "",
    barcode: p.barcode ?? "", sku: p.sku ?? "", supplier: p.supplier ?? "",
  };
}

// 🏪 D2: do'kon-profil tahrirlash — story/e'lon/mahalla/muqova-rasm (ShopAdminView'ga kiritiladi).
// R4 (Bug #3): `shopProfile()` shopId'siz FAQAT shopseller-scoped tokenda ishlaydi (server o'zi
// scope'ni topadi). Owner esa scope'ga ega emas — shu tokenda birinchi chaqiruv 400 `no_shop`
// bilan qaytadi; shunda V1.6e'dagi AYNAN shu do'kon-tanlov naqshini (`adminApi.marketShops()`)
// ishlatib, owner qaysi do'konni tahrirlashini tanlaydi.
function ShopProfilePanel() {
  const [shops, setShops] = useState<{ id: number; name: string; active: boolean }[] | null>(null);
  const [pickedShopId, setPickedShopId] = useState<number | null>(null);
  const [profile, setProfile] = useState<{ id: number; name: string; neighborhood: string | null; story: string | null; announcement: string | null; hasPhoto: boolean; avgRating: number; reviewCount: number } | null>(null);
  const [story, setStory] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [needsPicker, setNeedsPicker] = useState(false);
  // §10.1: "muammoni tuzat" — pauza + SLA-buzilish soni (profil bilan bir vaqtda yuklanadi)
  const [ops, setOps] = useState<{ paused: boolean; slaBreaches: number } | null>(null);
  // §10.1: do'kon sog'lik-skori (javob-tezlik+rad%+hikoya-faollik bitta raqamda)
  const [health, setHealth] = useState<{ score: number; totalOrders: number; rejectionRate: number; slaBreachRate: number; activeRecently: boolean } | null>(null);

  const load = (shopId?: number) => {
    adminApi.shopProfile(shopId).then((r) => {
      setProfile(r.profile);
      setStory(r.profile.story ?? "");
      setAnnouncement(r.profile.announcement ?? "");
      setNeighborhood(r.profile.neighborhood ?? "");
      setNeedsPicker(false);
    }).catch(() => {
      // seller-scoped bo'lmasa (owner, shopId ko'rsatilmagan) — do'kon-tanlov kerak
      if (shopId === undefined) {
        setNeedsPicker(true);
        adminApi.marketShops().then((r) => setShops(r.shops)).catch(() => undefined);
      }
    });
    adminApi.shopOpsStatus(shopId).then(setOps).catch(() => setOps(null));
    adminApi.shopHealth(shopId).then(setHealth).catch(() => setHealth(null));
  };
  useEffect(() => { load(); }, []);

  const togglePause = async () => {
    if (!ops) return;
    const next = !ops.paused;
    await adminApi.shopTogglePause(next, pickedShopId ?? undefined).catch(() => undefined);
    setMsg(next ? "⏸ Do'kon to'xtatildi — yangi buyurtma qabul qilinmaydi" : "▶️ Do'kon qayta faollashtirildi");
    load(pickedShopId ?? undefined);
  };

  const save = async () => {
    setSaving(true);
    const r = await adminApi.shopProfileSave({ story, announcement, neighborhood }, pickedShopId ?? undefined).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(r.ok ? "✅ Saqlandi" : "❌ Saqlanmadi");
    setSaving(false);
    load(pickedShopId ?? undefined);
  };

  const uploadCover = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { setMsg("❌ Rasm 5MB dan kichik bo'lsin"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result).split(",")[1] ?? "";
        const r = await adminApi.shopProfilePhotoUpload(f.type || "image/jpeg", base64, pickedShopId ?? undefined).catch((e: Error) => ({ ok: false as const, error: e.message }));
        setMsg(r.ok ? "✅ Muqova-rasm yangilandi" : "❌ Rasm yuklanmadi");
        load(pickedShopId ?? undefined);
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  if (needsPicker && !profile) {
    return (
      <section className="panel">
        <div className="panel-title">🏪 Do&apos;kon-profil</div>
        {!shops ? (
          <p className="muted">Yuklanmoqda…</p>
        ) : (
          <div className="adm-field">
            <span className="adm-field-label">Qaysi do&apos;kon profilini tahrirlaysiz?</span>
            <select value={pickedShopId ?? ""} onChange={(e) => { const id = Number(e.target.value); if (id) { setPickedShopId(id); load(id); } }}>
              <option value="">— tanlang —</option>
              {shops.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (nofaol)"}</option>)}
            </select>
          </div>
        )}
      </section>
    );
  }
  if (!profile) return null;

  return (
    <section className="panel">
      <div className="panel-title">🏪 Do&apos;kon-profil{pickedShopId ? ` — ${profile.name}` : ""}</div>
      <p className="muted" style={{ marginTop: 0 }}>
        Mijozlar «{profile.name}» sahifasida shu ma&apos;lumotlarni ko&apos;radi. ⭐ {profile.avgRating || "—"} ({profile.reviewCount} sharh){profile.hasPhoto ? "" : " · muqova-rasm hali yo'q"}
      </p>
      {ops && (
        <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {ops.paused && <span className="badge badge-bad">⏸ To&apos;xtatilgan — yangi buyurtma qabul qilinmaydi</span>}
          {ops.slaBreaches > 0 && <span className="badge badge-warn">🚨 {ops.slaBreaches} ta buyurtma SLA&apos;dan o&apos;tib ketgan</span>}
          <button className="btn sm" onClick={togglePause}>{ops.paused ? "▶️ Qayta faollashtirish" : "⏸ Do'konni to'xtatish"}</button>
        </p>
      )}
      {health && (
        <p className="muted" style={{ fontSize: 12 }}>
          🩺 Sog&apos;lik-skori: <b style={{ color: health.score >= 70 ? "#22c55e" : health.score >= 40 ? "#f59e0b" : "#ef4444" }}>{health.score}/100</b>
          {health.totalOrders > 0 ? ` · rad ${Math.round(health.rejectionRate * 100)}% · SLA-buzilish ${Math.round(health.slaBreachRate * 100)}% · ${health.totalOrders} buyurtma asosida` : " · hali buyurtma yo'q"}
          {!health.activeRecently && " · so'nggi 7 kunda hikoya yo'q"}
        </p>
      )}
      <div className="adm-form-grid">
        <div className="adm-field"><span className="adm-field-label">&nbsp;</span><button onClick={uploadCover}>🖼 Muqova-rasm yuklash</button></div>
        <div className="adm-field"><span className="adm-field-label">Mahalla</span><input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Testón MFY" maxLength={40} /></div>
        <div className="adm-field" style={{ gridColumn: "1 / -1" }}>
          <span className="adm-field-label">Bugungi e&apos;lon (mijozlarga ko&apos;rinadi)</span>
          <input value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="Bugun yangi partiya keldi" maxLength={120} />
        </div>
        <div className="adm-field" style={{ gridColumn: "1 / -1" }}>
          <span className="adm-field-label">Biz haqimizda</span>
          <textarea value={story} onChange={(e) => setStory(e.target.value)} maxLength={600} rows={3} placeholder="Necha yildan beri, nima bilan shug'ullanasiz..." />
        </div>
        <div className="adm-field">
          <span className="adm-field-label">&nbsp;</span>
          <button onClick={save} disabled={saving}>{saving ? "Saqlanmoqda…" : "💾 Saqlash"}</button>
        </div>
        {pickedShopId && (
          <div className="adm-field">
            <span className="adm-field-label">&nbsp;</span>
            <button onClick={() => { setPickedShopId(null); setProfile(null); setNeedsPicker(true); }}>← Boshqa do&apos;kon</button>
          </div>
        )}
      </div>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}

// 💬 C1.6: sotuvchi-inbox — mavjud owner `ChatView`ning KLONI, lekin BITTA shopId'ga scoped
// (bot-DM'ning zaxira/qo'shimcha yo'li — sotuvchi kompyuterdan ham javob berishi mumkin).
// Shop-picker mantiqi ShopProfilePanel'dagi bilan bir xil, lekin ATAYLAB alohida-mustaqil
// (kichik takrorlanish — ikkalasi ham mustaqil ishlayveradi, ShopProfilePanel'ni qayta yozish
// xavfini oshirmaydi).
function ShopChatInbox() {
  const [needsPicker, setNeedsPicker] = useState(false);
  const [shops, setShops] = useState<{ id: number; name: string; active: boolean }[] | null>(null);
  const [pickedShopId, setPickedShopId] = useState<number | null>(null);
  const [convos, setConvos] = useState<{ telegramId: string; name: string | null; username: string | null; lastMsg: string; lastAt: string; unread: number }[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<{ id: number; direction: string; text: string; at: string }[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const loadConvos = (shopId?: number) => {
    adminApi.shopChatConversations(shopId).then((r) => { setConvos(r.convos); setNeedsPicker(false); }).catch(() => {
      if (shopId === undefined) {
        setNeedsPicker(true);
        adminApi.marketShops().then((r) => setShops(r.shops)).catch(() => undefined);
      }
    });
  };
  useEffect(() => {
    loadConvos();
    const t = setInterval(() => loadConvos(pickedShopId ?? undefined), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedShopId]);

  const openChat = async (tgId: string) => {
    setActive(tgId); setMsgs(null);
    const m = await adminApi.shopChatMessages(tgId, pickedShopId ?? undefined).catch(() => null);
    setMsgs(m ?? []);
    loadConvos(pickedShopId ?? undefined);
  };
  const send = async () => {
    if (!active || !reply.trim() || sending) return;
    setSending(true);
    const r = await adminApi.shopChatReply(active, reply.trim(), pickedShopId ?? undefined).catch(() => ({ ok: false }));
    if (r.ok) {
      setReply("");
      const m = await adminApi.shopChatMessages(active, pickedShopId ?? undefined).catch(() => null);
      setMsgs(m ?? []);
    }
    setSending(false);
  };

  if (needsPicker) {
    return (
      <section className="panel">
        <div className="panel-title">💬 Do&apos;kon-chat</div>
        {!shops ? <p className="muted">Yuklanmoqda…</p> : (
          <div className="adm-field">
            <span className="adm-field-label">Qaysi do&apos;kon uchun?</span>
            <select value={pickedShopId ?? ""} onChange={(e) => { const id = Number(e.target.value); if (id) { setPickedShopId(id); loadConvos(id); } }}>
              <option value="">— tanlang —</option>
              {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </section>
    );
  }

  const activeConvo = convos?.find((c) => c.telegramId === active);
  return (
    <section className="panel">
      <div className="panel-title">💬 Do&apos;kon-chat</div>
      <div style={{ display: "flex", gap: 12, minHeight: 300 }}>
        <div style={{ width: 220, flexShrink: 0, background: "var(--card)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
          {!convos && <div className="muted" style={{ padding: 14 }}>Yuklanmoqda…</div>}
          {convos?.length === 0 && <div className="muted" style={{ padding: 14, fontSize: 12 }}>Hali xabar yo&apos;q.</div>}
          {convos?.map((c) => (
            <button key={c.telegramId} onClick={() => openChat(c.telegramId)} style={{ width: "100%", padding: "10px 14px", border: 0, background: active === c.telegramId ? "rgba(255,209,102,.12)" : "transparent", borderLeft: active === c.telegramId ? "3px solid var(--accent)" : "3px solid transparent", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name ?? c.username ?? c.telegramId}</span>
                {c.unread > 0 && <span style={{ background: "var(--red)", color: "#fff", fontSize: 11, padding: "1px 6px", borderRadius: 99 }}>{c.unread}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMsg}</div>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, background: "var(--card)", borderRadius: 12, display: "flex", flexDirection: "column", border: "1px solid var(--line)", overflow: "hidden" }}>
          {!active ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="muted">Chap tarafdan mijoz tanlang</div>
            </div>
          ) : (
            <>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontWeight: 700 }}>{activeConvo?.name ?? activeConvo?.username ?? active}</div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                {!msgs && <div className="muted">Yuklanmoqda…</div>}
                {msgs?.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.direction === "out" ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "75%", padding: "8px 12px", borderRadius: m.direction === "out" ? "14px 14px 2px 14px" : "14px 14px 14px 2px", background: m.direction === "out" ? "var(--accent)" : "var(--card-2)", color: m.direction === "out" ? "#000" : "var(--text)", fontSize: 13 }}>{m.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
                <input className="inp" style={{ flex: 1 }} placeholder="Javob yozing…" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()} />
                <button className="btn" onClick={send} disabled={sending || !reply.trim()}>{sending ? "…" : "Yuborish"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// 🏠 Bosh sahifa curation (Bosqich 3): owner-set banner + pinned items. EMPTY = auto feed runs.
function HomeFeaturedAdminView() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof adminApi.homeFeaturedList>>["items"] | null>(null);
  const [kind, setKind] = useState("product");
  const [refId, setRefId] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [badge, setBadge] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => adminApi.homeFeaturedList().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!title.trim()) { setMsg("Sarlavha kerak"); return; }
    if ((kind === "product" || kind === "restaurant") && !refId.trim()) { setMsg("Mahsulot/restoran ID kerak"); return; }
    await adminApi.homeFeaturedCreate({ kind, title: title.trim(), refId: refId ? Number(refId) : undefined, subtitle: subtitle || undefined, badge: badge || undefined, target: kind === "restaurant" ? "restoran" : "dokon" }).catch(() => null);
    setTitle(""); setRefId(""); setSubtitle(""); setBadge(""); setMsg("✅ Qo'shildi"); load();
  };
  return (
    <div>
      <h2>🏠 Bosh sahifa — tavsiya boshqaruvi</h2>
      <p className="muted">Bo'sh qoldirsangiz — avtomatik feed (top-sotuvchi/reyting) ishlaydi. Bu yerda banner yoki mahsulot/restoranni majburan yuqoriga pin qilasiz.</p>
      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="product">Mahsulot (pin)</option>
            <option value="restaurant">Restoran (pin)</option>
            <option value="banner">Banner</option>
          </select>
          {(kind === "product" || kind === "restaurant") && <input placeholder="ID" value={refId} onChange={(e) => setRefId(e.target.value)} style={{ width: 80 }} />}
          <input placeholder="Sarlavha" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input placeholder="Izoh (ixtiyoriy)" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          <input placeholder="Badge" value={badge} onChange={(e) => setBadge(e.target.value)} style={{ width: 110 }} />
          <button className="btn" onClick={create}>➕ Qo'shish</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 6 }}>{msg}</div>}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        {items === null ? <div className="muted">Yuklanmoqda…</div> : items.length === 0 ? <div className="muted">Hozircha bo'sh — avtomatik feed ishlayapti.</div> : (
          <table style={{ width: "100%" }}>
            <thead><tr><th>Tur</th><th>Sarlavha</th><th>Ref</th><th>Holat</th><th></th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.kind}</td><td>{it.title}</td><td>{it.refId ?? "—"}</td>
                  <td>{it.active ? "✅ Faol" : "⏸ O'chiq"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn" onClick={async () => { await adminApi.homeFeaturedActive(it.id, !it.active); load(); }}>{it.active ? "O'chir" : "Yoq"}</button>
                    <button className="btn" style={{ marginLeft: 6 }} onClick={async () => { await adminApi.homeFeaturedDelete(it.id); load(); }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ShopAdminView() {
  const [data, setData] = useState<{ products: ShopAdminProductRow[]; enabled: boolean; pendingOrders: number } | null>(null);
  const [orders, setOrders] = useState<ShopAdminOrderRow[] | null>(null);
  const [reviews, setReviews] = useState<ShopAdminReviewRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  // Katalog (2026-07-27): default kategoriya YO'Q — avval "umumiy" edi va shu sabab jonli bazada
  // 37 ta mahsulot "umumiy"da yig'ilib qolgan (sotuvchi tanlashni o'ylab ham ko'rmagan). Endi
  // ongli tanlov talab qilinadi.
  const [category, setCategory] = useState("");
  const [desc, setDesc] = useState("");
  // 🏷 Katalog-pasport: tez-qo'shishda eng ko'p kerak bo'ladigan 3 tasi (qolgani tahrir formasida)
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("");
  const [barcode, setBarcode] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [stFilter, setStFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // §10.1: global qidiruv (mijoz-nom/telefon/buyurtma-ID) + CSV-eksport — buyurtmalar ustida
  const [orderQ, setOrderQ] = useState("");
  const [draft, setDraft] = useState<ShopDraft | null>(null);
  const [saving, setSaving] = useState(false);
  // V1.7: ega ko'p-do'kon boshqaruvi — real seller-token uchun bu ro'yxat 403 qaytaradi (requireOwner),
  // shuning uchun tanlagich JIM ko'rinmaydi (seller o'zgarishsiz, faqat O'Z do'koni ko'radi).
  const [myShops, setMyShops] = useState<{ id: number; name: string; active: boolean }[] | null>(null);
  const [shopId, setShopId] = useState<number | null>(null);
  useEffect(() => { adminApi.marketShops().then((r) => setMyShops(r.shops)).catch(() => setMyShops(null)); }, []);
  // §10.1: "Bugungi holat" — owner-only (seller-token 403 → jim ko'rinmaydi, sellerga foydasiz ma'lumot)
  const [dailyStatus, setDailyStatus] = useState<{ pendingOrders: number; unansweredChats: number; todayStories: number; activeShops: number } | null>(null);
  useEffect(() => { adminApi.shopDailyStatus().then(setDailyStatus).catch(() => setDailyStatus(null)); }, []);
  // §10.1: "Nima o'zgardi" — bugun vs kecha
  const [dailyDiff, setDailyDiff] = useState<{ today: { newOrders: number; rejected: number; newReviews: number }; yesterday: { newOrders: number; rejected: number; newReviews: number } } | null>(null);
  useEffect(() => { adminApi.shopDailyDiff().then(setDailyDiff).catch(() => setDailyDiff(null)); }, []);
  // §10.1: ommaviy e'lon — bitta matn, BARCHA faol do'konga bir yo'la (owner-only)
  const [bulkText, setBulkText] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  const sendBulkAnnouncement = async () => {
    const r = await adminApi.shopBulkAnnouncement(bulkText).catch(() => null);
    setBulkMsg(r ? `✅ ${r.count} ta do'konga yuborildi` : "❌ Yuborilmadi");
    if (r) { setBulkText(""); load(); }
  };

  // §10.2: kuzatilmoqda-lekin-olinmayapti — real seller uchun `shopId` tanlanmagan bo'lsa ham
  // ularning O'Z scope'i bilan ishlaydi (resolveProfileShopId server-tarafda hal qiladi)
  const [watched, setWatched] = useState<{ productId: number; name: string; favCount: number }[] | null>(null);

  const load = (sid = shopId) => {
    adminApi.shopProducts(sid ?? undefined).then(setData).catch(() => undefined);
    adminApi.shopOrders(undefined, sid ?? undefined).then((r) => setOrders(r.orders)).catch(() => setOrders([]));
    adminApi.shopReviews(sid ?? undefined).then((r) => setReviews(r.reviews)).catch(() => setReviews([]));
    adminApi.shopWatchedNotBought(sid ?? undefined).then((r) => setWatched(r.items)).catch(() => setWatched(null));
  };
  useEffect(() => { load(); }, [shopId]); // eslint-disable-line react-hooks/exhaustive-deps

  const quickEdit = async (id: number, patch: Record<string, unknown>, okMsg = "✅ Saqlandi") => {
    await adminApi.shopEdit(id, patch).catch(() => undefined);
    setMsg(okMsg);
    load();
  };

  const create = async () => {
    const p = Number(price), s = Number(stock);
    if (!name.trim() || p <= 0) { setMsg("⚠️ Nom va narx to'g'ri bo'lsin"); return; }
    if (!category.trim()) { setMsg("⚠️ Kategoriyani tanlang — mijoz mahsulotni shu orqali topadi"); return; }
    // ko'p-do'kon: aniq tanlanmagan bo'lsa qaysi do'konga tushishini owner bilmaydi — talab qilamiz
    if (myShops && myShops.length > 1 && !shopId) { setMsg("⚠️ Avval yuqorida do'kon tanlang"); return; }
    // real error surfaced (was a blind "❌ Xatolik" — undiagnosable remotely)
    const r = await adminApi.shopCreate({
      name: name.trim(), priceTanga: p, stock: Math.max(0, s || 0), category: category.trim(), description: desc.trim() || undefined,
      brand: brand.trim() || undefined, unit: unit.trim() || undefined, barcode: barcode.trim() || undefined,
    }, shopId ?? undefined)
      .catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(r.ok ? "✅ Qo'shildi (o'chiq holda — rasm yuklab, keyin yoqing)" : `❌ Qo'shilmadi: ${("error" in r && r.error) || "server javob bermadi — 1 daqiqadan keyin urinib ko'ring"}`);
    if (r.ok) { setName(""); setPrice(""); setStock(""); setDesc(""); setBrand(""); setUnit(""); setBarcode(""); setCategory(""); setShowAdd(false); load(); }
  };

  const toggleExpand = (p: ShopAdminProductRow) => {
    if (expandedId === p.id) { setExpandedId(null); setDraft(null); return; }
    setExpandedId(p.id);
    setDraft(shopDraftFromRow(p));
  };

  // 🌍 Barkoddan to'ldirish (Open Food Facts). Faqat bo'sh maydonlar to'ldiriladi; rasm bo'lsa
  // alohida so'rov bilan serverga import qilinadi (URL mijozdan olinmaydi — server o'zi biladi).
  const [offBusy, setOffBusy] = useState(false);
  const fillFromBarcode = async (id: number) => {
    if (!draft) return;
    const code = draft.barcode.replace(/\D/g, "");
    if (code.length < 8) { setMsg("⚠️ Avval barkodni kiriting (8-14 raqam)"); return; }
    setOffBusy(true);
    const r = await adminApi.shopBarcodeLookup(code).catch(() => null);
    if (!r?.found || !r.product) { setOffBusy(false); setMsg("🌍 Bu barkod Open Food Facts bazasida topilmadi (mahalliy mahsulotlar u yerda kam)"); return; }
    const o = r.product;
    setDraft({
      ...draft,
      name: draft.name.trim() || o.name || draft.name,
      brand: draft.brand.trim() || o.brand || "",
      unit: draft.unit.trim() || o.unit || "",
    });
    let note = `🌍 To'ldirildi: ${[o.name && "nom", o.brand && "brend", o.unit && "hajm"].filter(Boolean).join(", ")}`;
    if (o.imageUrl) {
      const ph = await adminApi.shopPhotoFromBarcode(id).catch(() => ({ ok: false }));
      note += ph.ok ? " + rasm (manba: Open Food Facts)" : " · rasm yuklanmadi";
      if (ph.ok) load();
    }
    setOffBusy(false);
    setMsg(`${note}. Tekshirib, «Saqlash»ni bosing.`);
  };

  const saveDraft = async (id: number) => {
    if (!draft) return;
    const priceTanga = Number(draft.priceTanga);
    const stock = Number(draft.stock);
    if (!draft.name.trim() || !Number.isFinite(priceTanga) || priceTanga <= 0) { setMsg("❌ Nom va narx to'g'ri bo'lsin"); return; }
    setSaving(true);
    const patch: Record<string, unknown> = {
      name: draft.name, category: draft.category || "umumiy", description: draft.description,
      priceTanga, stock: Number.isFinite(stock) ? stock : 0,
      oldPriceTanga: draft.oldPriceTanga.trim() === "" ? 0 : Number(draft.oldPriceTanga),
      // 🏷 pasport — bo'sh satr YUBORILADI (undefined emas): server uni null qiladi, ya'ni
      // sotuvchi maydonni tozalay oladi. Barkod/sana noto'g'ri bo'lsa server o'zi null qiladi.
      brand: draft.brand, unit: draft.unit, manufacturer: draft.manufacturer, expiryDate: draft.expiryDate,
      barcode: draft.barcode, sku: draft.sku, supplier: draft.supplier,
    };
    const r = await adminApi.shopEdit(id, patch).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(r.ok ? "✅ Saqlandi" : "❌ Saqlanmadi");
    setSaving(false);
    load();
  };

  const uploadPhoto = (id: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { setMsg("❌ Rasm 5MB dan kichik bo'lsin"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result).split(",")[1] ?? "";
        const r = await adminApi.shopPhotoUpload(id, f.type || "image/jpeg", base64).catch((e: Error) => ({ ok: false as const, error: e.message }));
        setMsg(r.ok ? `✅ Rasm yuklandi (${("photoCount" in r && r.photoCount) || "?"}/5) — yana qo'shishingiz mumkin` : `❌ Rasm yuklanmadi: ${("error" in r && r.error) === "max_photos" ? "5 ta rasm chegarasi — rasmlarni tozalab qayta yuklang" : ("error" in r && r.error) || "server xatosi"}`);
        load();
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };
  const del = async (p: ShopAdminProductRow) => {
    if (!window.confirm(`"${p.name}" o'chirilsinmi?`)) return;
    await adminApi.shopDelete(p.id).catch(() => undefined);
    load();
  };
  const stLabel: Record<string, string> = { pending: "⏳ Kutilmoqda", delivered: "✅ Yetkazildi", rejected: "❌ Rad", cancelled: "✖ Bekor" };

  const cats = Array.from(new Set((data?.products ?? []).map((p) => p.category))).sort();
  const products = (data?.products ?? [])
    .filter((p) => (stFilter === "all" ? true : stFilter === "active" ? p.active : !p.active))
    .filter((p) => (catFilter === "all" ? true : p.category === catFilter))
    .filter((p) => {
      const t = q.trim().toLowerCase();
      // 🏷 Katalog: sotuvchi barkod/SKU/brend bo'yicha ham topa oladi (skanerdan ko'chirib qo'yish
      // yoki ombor-kodini yozish) — bu maydonlar faqat SHU panelda ko'rinadi, mijozda emas.
      return !t || p.name.toLowerCase().includes(t) || p.category.toLowerCase().includes(t)
        || (p.brand ?? "").toLowerCase().includes(t) || (p.barcode ?? "").includes(t)
        || (p.sku ?? "").toLowerCase().includes(t) || (p.supplier ?? "").toLowerCase().includes(t);
    });

  // §10.1: global qidiruv — mijoz-nom, telefon, yoki buyurtma-ID
  const filteredOrders = (orders ?? []).filter((o) => {
    const t = orderQ.trim().toLowerCase();
    if (!t) return true;
    return String(o.id).includes(t) || o.buyerName.toLowerCase().includes(t) || o.contact.toLowerCase().includes(t) || o.productName.toLowerCase().includes(t);
  });
  const exportOrdersCsv = () => {
    const header = ["ID", "Mahsulot", "Mijoz", "Telefon", "Manzil", "Narx", "To'lov", "Holat", "Do'kon", "Sana"];
    const rows = filteredOrders.map((o) => [
      o.id, o.productName, o.buyerName, o.contact, o.address, o.priceTanga, o.payKind, stLabel[o.status] ?? o.status, o.shopName ?? "", new Date(o.createdAt).toLocaleString("ru-RU"),
    ]);
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buyurtmalar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {dailyStatus && (
        <section className="panel">
          <div className="panel-title">📊 Bugungi holat</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>⏳ <b>{dailyStatus.pendingOrders}</b> buyurtma javob kutmoqda</span>
            <span>💬 <b>{dailyStatus.unansweredChats}</b> javobsiz mijoz-xabari</span>
            <span>📹 <b>{dailyStatus.todayStories}</b> bugungi hikoya</span>
            <span>🏪 <b>{dailyStatus.activeShops}</b> faol do&apos;kon</span>
          </div>
          {dailyDiff && (() => {
            const delta = (t: number, y: number) => (t === y ? "±0" : t > y ? `+${t - y}` : `${t - y}`);
            return (
              <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                📅 Nima o&apos;zgardi (bugun vs kecha): buyurtma {dailyDiff.today.newOrders} ({delta(dailyDiff.today.newOrders, dailyDiff.yesterday.newOrders)}) ·
                {" "}rad {dailyDiff.today.rejected} ({delta(dailyDiff.today.rejected, dailyDiff.yesterday.rejected)}) ·
                {" "}sharh {dailyDiff.today.newReviews} ({delta(dailyDiff.today.newReviews, dailyDiff.yesterday.newReviews)})
              </p>
            );
          })()}
        </section>
      )}
      {myShops && myShops.length > 1 && (
        <section className="panel">
          <div className="panel-title">🏪 Do&apos;konlar ({myShops.length})</div>
          <div className="adm-field">
            <span className="adm-field-label">Mahsulot/buyurtma/sharh — qaysi do&apos;kon?</span>
            <select value={shopId ?? ""} onChange={(e) => setShopId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— Barcha do&apos;konlar (aralash) —</option>
              {myShops.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (nofaol)"}</option>)}
            </select>
          </div>
          <div className="adm-field" style={{ marginTop: 10 }}>
            <span className="adm-field-label">📣 Ommaviy e&apos;lon — BARCHA faol do&apos;konga bir yo&apos;la</span>
            <input value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="Masalan: Ertaga bayram tufayli yetkazish kechikadi" maxLength={120} />
          </div>
          <button className="btn sm" onClick={sendBulkAnnouncement}>📣 Barchasiga yuborish</button>
          {bulkMsg && <p className="muted">{bulkMsg}</p>}
        </section>
      )}
      <ShopProfilePanel />
      <ShopChatInbox />
      <section className="panel">
        <div className="panel-title">🛍 Do&apos;kon</div>
        <p className="muted" style={{ marginTop: 0 }}>
          {data && !data.enabled && <b style={{ color: "#f59e0b" }}>«shop» flag o&apos;chiq — do&apos;kon mijozlarga ko&apos;rinmaydi (Features&apos;dan yoqiladi). </b>}
          Jami {data?.products.length ?? 0} ta mahsulot{data && data.pendingOrders > 0 && <b style={{ color: "#f59e0b" }}> · ⏳ {data.pendingOrders} ta buyurtma Telegram&apos;da javob kutmoqda</b>}.
        </p>
        <button className="btn sm" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "✖ Yopish" : "➕ Yangi mahsulot qo'shish"}</button>
        {showAdd && myShops && myShops.length > 1 && (
          <p className="adm-field-hint" style={{ marginTop: 10 }}>
            {shopId ? <>Yangi mahsulot «<b>{myShops.find((s) => s.id === shopId)?.name}</b>» do&apos;koniga qo&apos;shiladi (yuqoridagi tanlov).</> : <b style={{ color: "#f59e0b" }}>⚠️ Avval yuqorida qaysi do&apos;kon ekanini tanlang.</b>}
          </p>
        )}
        {showAdd && (
          <div className="adm-form-grid" style={{ marginTop: 10 }}>
            <div className="adm-field"><span className="adm-field-label">Nomi</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Elektro choynak Vitek" /></div>
            <div className="adm-field"><span className="adm-field-label">Narx (tanga)</span><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div className="adm-field"><span className="adm-field-label">Soni</span><input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></div>
            <div className="adm-field"><span className="adm-field-label">Kategoriya</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">— tanlang —</option>{SHOP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="adm-field"><span className="adm-field-label">Brend (ixtiyoriy)</span><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Coca-Cola" /></div>
            <div className="adm-field"><span className="adm-field-label">Hajm / og&apos;irlik</span><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="1.5 L / 500 g" /></div>
            <div className="adm-field"><span className="adm-field-label">Barkod (ichki)</span><input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="5449000000999" inputMode="numeric" /></div>
            <div className="adm-field"><span className="adm-field-label">Tavsif (ixtiyoriy)</span><input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="adm-field">
              <span className="adm-field-label">&nbsp;</span>
              <button onClick={create}>➕ Qo&apos;shish</button>
            </div>
          </div>
        )}
        <p className="adm-field-hint" style={{ marginTop: 10 }}>Narx = ulgurji × 1.2 tavsiya. Yangi mahsulot O&apos;CHIQ holda yaratiladi — rasm yuklab, «yoqish»ni bosing.</p>
        {msg && <div className="action-msg" style={{ marginTop: 10 }}>{msg}</div>}
      </section>

      <section className="panel">
        <div className="panel-title">📦 Mahsulotlar ({products.length})</div>
        <div className="adm-toolbar">
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Nom yoki kategoriya…" />
          <select className="inp" value={stFilter} onChange={(e) => setStFilter(e.target.value)}>
            <option value="all">Barcha holat</option><option value="active">🟢 Yoniq</option><option value="inactive">🔴 O&apos;chiq</option>
          </select>
          <select className="inp" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="all">Barcha kategoriya</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {products.map((p) => (
          <div key={p.id} className={"adm-card" + (expandedId === p.id ? " open" : "")}>
            <div className="adm-card-head" role="button" tabIndex={0} onClick={() => toggleExpand(p)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(p); } }}>
              <div className="adm-card-main">
                <div className="adm-card-title">
                  {p.hasPhoto ? "🖼" : "⬜"} {p.name}
                  <span className={"badge " + (p.active ? "badge-ok" : "badge-muted")}>{p.active ? "🟢 Yoniq" : "🔴 O'chiq"}</span>
                  {p.featured && <span className="badge badge-warn">⭐ TOP&apos;da</span>}
                  {p.oldPriceTanga ? <span className="badge badge-bad">💥 −{Math.round((1 - p.priceTanga / p.oldPriceTanga) * 100)}%</span> : null}
                  {/* 🏷 Muddat-nazorati: o'tgan = qizil, 30 kundan kam qolgan = sariq. Supermarket
                      uchun eng muhim signal — javondagi eskirgan mahsulotni darhol ko'rsatadi. */}
                  {p.expiryDate && (() => {
                    const left = Math.ceil((new Date(`${p.expiryDate}T00:00:00Z`).getTime() - Date.now()) / 86400_000);
                    if (left < 0) return <span className="badge badge-bad">⛔ Muddati o&apos;tgan</span>;
                    if (left <= 30) return <span className="badge badge-warn">⏳ {left} kun qoldi</span>;
                    return null;
                  })()}
                </div>
                <div className="adm-card-sub">
                  {!shopId && p.shopName && <span>🏪 {p.shopName}</span>}
                  <span>{p.category}</span>
                  {p.brand && <span>🏷 {p.brand}</span>}
                  {p.unit && <span>⚖️ {p.unit}</span>}
                  <span>🪙 {p.priceTanga.toLocaleString("ru-RU")}</span>
                  <span>📦 {p.stock} dona</span>
                  <span>sotildi: {p.soldCount}</span>
                  <span>📷 {p.photoCount}/5</span>
                </div>
              </div>
              <div className="adm-card-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn sm" onClick={() => void quickEdit(p.id, { featured: !p.featured }, p.featured ? "☆ TOP'dan olindi" : "⭐ TOP'ga qo'shildi")}>{p.featured ? "⭐ TOP'ni o'chirish" : "☆ TOP'ga qo'yish"}</button>
                <button className="btn sm" onClick={async () => { await adminApi.shopToggle(p.id, !p.active).catch(() => undefined); load(); }}>{p.active ? "🔴 O'chirish" : "🟢 Yoqish"}</button>
                <button className="btn sm" onClick={() => del(p)}>🗑 O&apos;chirish</button>
              </div>
              <span className="adm-card-chev">{expandedId === p.id ? "▾" : "▸"}</span>
            </div>

            {expandedId === p.id && draft && (
              <div className="adm-card-body">
                <div className="adm-form-grid wide">
                  <div className="adm-field"><span className="adm-field-label">Nomi</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                  <div className="adm-field"><span className="adm-field-label">Kategoriya</span><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{draft.category && !SHOP_CATEGORIES.includes(draft.category as (typeof SHOP_CATEGORIES)[number]) && <option value={draft.category}>{draft.category}</option>}{SHOP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div className="adm-field"><span className="adm-field-label">Narx (tanga)</span><input type="number" value={draft.priceTanga} onChange={(e) => setDraft({ ...draft, priceTanga: e.target.value })} /></div>
                  <div className="adm-field">
                    <span className="adm-field-label">Eski narx (chegirma uchun)</span>
                    <input type="number" value={draft.oldPriceTanga} onChange={(e) => setDraft({ ...draft, oldPriceTanga: e.target.value })} placeholder="bo'sh = chegirma yo'q" />
                  </div>
                  <div className="adm-field"><span className="adm-field-label">Soni</span><input type="number" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} /></div>
                </div>
                <div className="adm-field" style={{ marginTop: 10 }}>
                  <span className="adm-field-label">Tavsif</span>
                  <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Qisqa tavsif…" />
                </div>
                {/* 🏷 Katalog-pasport. Yuqori blok — MIJOZ ko'radi, pastki blok — faqat shu panel. */}
                <p className="adm-field-hint" style={{ marginTop: 12, marginBottom: 4 }}><b>🏷 Mahsulot ma&apos;lumoti</b> — mijoz mahsulot sahifasida ko&apos;radi</p>
                <div className="adm-form-grid wide">
                  <div className="adm-field"><span className="adm-field-label">Brend</span><input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} placeholder="Coca-Cola" /></div>
                  <div className="adm-field"><span className="adm-field-label">Hajm / og&apos;irlik</span><input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="1.5 L / 500 g" /></div>
                  <div className="adm-field"><span className="adm-field-label">Ishlab chiqaruvchi</span><input value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} placeholder="Coca-Cola Ichimligi UZ" /></div>
                  <div className="adm-field"><span className="adm-field-label">Yaroqlilik muddati</span><input type="date" value={draft.expiryDate} onChange={(e) => setDraft({ ...draft, expiryDate: e.target.value })} /></div>
                </div>
                <p className="adm-field-hint" style={{ marginTop: 12, marginBottom: 4 }}><b>🔒 Ichki ma&apos;lumot</b> — faqat siz ko&apos;rasiz, mijozga ko&apos;rinmaydi</p>
                <div className="adm-form-grid wide">
                  <div className="adm-field">
                    <span className="adm-field-label">Barkod</span>
                    <input value={draft.barcode} onChange={(e) => setDraft({ ...draft, barcode: e.target.value })} placeholder="5449000000999" inputMode="numeric" />
                    {/* 🌍 Open Food Facts: barkoddan nom/brend/hajm/rasm. Faqat BO'SH maydonlar
                        to'ldiriladi — qo'lda yozganingiz ustidan yozilmaydi. Mahalliy mahsulotlar
                        bu bazada deyarli yo'q (xalqaro brendlar bor). */}
                    <button className="btn sm" style={{ marginTop: 6 }} disabled={offBusy} onClick={() => void fillFromBarcode(p.id)}>
                      {offBusy ? "Qidirilmoqda…" : "🌍 Barkoddan to'ldirish"}
                    </button>
                  </div>
                  <div className="adm-field"><span className="adm-field-label">SKU (ichki kod)</span><input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="COLA-1.5" /></div>
                  <div className="adm-field"><span className="adm-field-label">Yetkazib beruvchi</span><input value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} placeholder="Ulgurji baza / firma" /></div>
                </div>
                <div className="adm-card-body-foot">
                  <button className="btn" disabled={saving} onClick={() => void saveDraft(p.id)}>{saving ? "Saqlanmoqda…" : "💾 Saqlash"}</button>
                  <button className="btn sm" onClick={() => uploadPhoto(p.id)}>📷 Rasm yuklash ({p.photoCount}/5)</button>
                  {p.photoCount > 0 && <button className="btn sm" onClick={async () => { if (!window.confirm("Barcha rasmlar o'chirilsinmi?")) return; await adminApi.shopPhotoClear(p.id).catch(() => undefined); load(); }}>🗑🖼 Rasmlarni tozalash</button>}
                </div>
              </div>
            )}
          </div>
        ))}
        {data && products.length === 0 && <p className="muted">Mos mahsulot topilmadi.</p>}
      </section>

      {watched && watched.length > 0 && (
        <section className="panel">
          <div className="panel-title">👀 Kuzatilmoqda, lekin olinmayapti ({watched.length})</div>
          <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>Mijozlar ❤️ belgilagan, lekin hech kim sotib olmagan mahsulotlar — narx/rasm/tavsifni ko&apos;rib chiqish foydali bo&apos;lishi mumkin.</p>
          {watched.map((w) => (
            <div key={w.productId} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <b style={{ flex: "1 1 auto" }}>{w.name}</b>
              <span className="badge badge-warn">❤️ {w.favCount}</span>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <div className="panel-title">🧾 Buyurtmalar ({filteredOrders.length}{orders && orders.length !== filteredOrders.length ? ` / ${orders.length}` : ""})</div>
        <div className="adm-toolbar">
          <input className="search" value={orderQ} onChange={(e) => setOrderQ(e.target.value)} placeholder="🔍 Mijoz, telefon yoki buyurtma-ID…" />
          <button className="btn sm" onClick={exportOrdersCsv} disabled={filteredOrders.length === 0}>⬇️ CSV eksport</button>
        </div>
        {filteredOrders.map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ flex: "2 1 220px" }}>
              #{o.id} <b>{o.productName}</b> <span className="muted">· {o.buyerName} · {o.contact}{!shopId && o.shopName ? ` · 🏪 ${o.shopName}` : ""}</span>
            </span>
            <span className="muted" style={{ flex: "2 1 180px", fontSize: 12 }}>📍 {o.address}</span>
            <span className={"badge " + (o.status === "delivered" ? "badge-ok" : o.status === "pending" ? "badge-warn" : "badge-bad")}>{stLabel[o.status] ?? o.status}</span>
            <span className="muted" style={{ fontSize: 12 }}>{o.payKind === "cash" ? `💵 ${o.priceTanga.toLocaleString("ru-RU")} so'm NAQD` : `🪙 ${o.priceTanga.toLocaleString("ru-RU")}`}</span>
          </div>
        ))}
        {orders && filteredOrders.length === 0 && <p className="muted">{orders.length === 0 ? "Hali buyurtma yo'q." : "Mos buyurtma topilmadi."}</p>}
      </section>
      <section className="panel">
        <div className="panel-title">🗣 Sharhlar (oxirgi {reviews?.length ?? 0})</div>
        {(reviews ?? []).map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ flex: "2 1 220px" }}>
              {r.thumb === "up" ? "👍" : "👎"} <b>{r.productName}</b> <span className="muted">· {r.memberName}{r.photoCount > 0 ? ` · 📷${r.photoCount}` : ""}{!shopId && r.shopName ? ` · 🏪 ${r.shopName}` : ""}</span>
            </span>
            <span className="muted" style={{ flex: "3 1 220px", fontSize: 12 }}>{r.text ?? "—"}</span>
            <span className="muted" style={{ fontSize: 11 }}>{new Date(r.createdAt).toLocaleDateString("ru-RU")}</span>
            <button className="btn sm" title="Sharhni o'chirish (spam/haqorat)" onClick={async () => { if (!window.confirm("Sharh o'chirilsinmi?")) return; await adminApi.shopReviewDelete(r.id).catch(() => undefined); load(); }}>🗑</button>
          </div>
        ))}
        {reviews && reviews.length === 0 && <p className="muted">Hali sharh yo&apos;q.</p>}
      </section>
      <ShopCategoriesPanel onMsg={setMsg} />
      <ShopAttentionPanel />
      <WeeklyTrendPanel />
      <MarketDemandPanel />
      <AuditLogPanel />
    </>
  );
}

// §10.1: shop-darajasidagi anomaliya-detektor — g'ayrioddiy rad-etish/sekin-javob do'konlar
// (kamida 3 buyurtma bilan, owner-only). Bo'sh bo'lsa ko'rinmaydi — hammasi yaxshi ekan.
function ShopAttentionPanel() {
  const [items, setItems] = useState<{ shopId: number; name: string; reason: string; rejectionRate: number; slaBreachRate: number }[] | null>(null);
  useEffect(() => { adminApi.shopAttention().then((r) => setItems(r.items)).catch(() => setItems(null)); }, []);
  if (!items || items.length === 0) return null;
  return (
    <section className="panel">
      <div className="panel-title">🚨 Diqqat talab qiladigan do&apos;konlar ({items.length})</div>
      {items.map((i) => (
        <div key={i.shopId} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <b style={{ flex: "1 1 160px" }}>{i.name}</b>
          <span className="badge badge-bad">{i.reason}</span>
        </div>
      ))}
    </section>
  );
}

// §10.1: "Prognoz-chiziq" — so'nggi 6 haftaning xarid-hajmi, oddiy CSS-ustunlar (yangi kutubxona
// kerak emas — ichki admin-qulaylik uchun bitta raqamlar-qatori yetarli).
function WeeklyTrendPanel() {
  const [points, setPoints] = useState<{ weekStart: string; orders: number }[] | null>(null);
  useEffect(() => { adminApi.shopWeeklyTrend().then((r) => setPoints(r.points)).catch(() => setPoints(null)); }, []);
  if (!points) return null;
  const max = Math.max(1, ...points.map((p) => p.orders));
  return (
    <section className="panel">
      <div className="panel-title">📈 Haftalik xarid-trendi (so&apos;nggi {points.length} hafta)</div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80, marginTop: 8 }}>
        {points.map((p) => (
          <div key={p.weekStart} style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ width: "100%", maxWidth: 32, height: Math.max(4, (p.orders / max) * 60), background: "var(--accent, #22c55e)", borderRadius: 3 }} title={`${p.orders} ta buyurtma`} />
            <span className="muted" style={{ fontSize: 10 }}>{p.orders}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>{points[0]?.weekStart} dan hozirgacha, har ustun 7 kunlik oyna.</p>
    </section>
  );
}

// §10.1: rol-darajali audit-jurnal — do'kon-boshqaruv mutatsiyalari (kim/qachon/nima o'zgartirdi).
// Ko'lam ATAYLAB do'kon-admin sirtiga cheklangan (V1.7/§10.1 davomida qo'shilgan yo'laklar) —
// izoh uchun schema.prisma'dagi AdminAuditLog izohiga qara.
const AUDIT_ACTION_LABEL: Record<string, string> = {
  toggle_pause: "pauza/faollashtirish",
  update_profile: "profil tahrirlash",
  bulk_announcement: "ommaviy e'lon",
  create_product: "mahsulot qo'shish",
  edit_product: "mahsulot tahrirlash",
  delete_product: "mahsulot o'chirish",
};
function AuditLogPanel() {
  const [items, setItems] = useState<{ id: number; actorRole: string; actorTgId: string | null; action: string; targetType: string; targetId: number | null; detail: string | null; createdAt: string }[] | null>(null);
  useEffect(() => { adminApi.shopAuditLog().then((r) => setItems(r.items)).catch(() => setItems(null)); }, []);
  if (!items) return null;
  return (
    <section className="panel">
      <div className="panel-title">📜 Audit-jurnal (so&apos;nggi {items.length})</div>
      <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>Do&apos;kon-boshqaruvidagi o&apos;zgarishlar — kim, qachon, nima. (Faqat shu bo&apos;lim qamrab olingan.)</p>
      {items.map((it) => (
        <div key={it.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 13 }}>
          <span className="muted" style={{ fontSize: 11, flex: "0 0 130px" }}>{new Date(it.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          <b>{it.actorRole || "?"}</b>
          <span>{AUDIT_ACTION_LABEL[it.action] ?? it.action}</span>
          {it.targetId != null && <span className="muted">#{it.targetId}</span>}
          {it.detail && <span className="muted" style={{ fontSize: 12 }}>« {it.detail} »</span>}
        </div>
      ))}
      {items.length === 0 && <p className="muted">Hali yozuv yo&apos;q.</p>}
    </section>
  );
}

// §10.1: mijozlar qidirgan-lekin-topilmagan so'rovlar — egaga "qaysi sotuvchini chaqirish kerak"
// signali (owner-only, `requireOwner`-gated route — seller-token uchun 403, jim ko'rinmaydi).
function MarketDemandPanel() {
  const [demand, setDemand] = useState<{ query: string; count: number; lastAt: string }[] | null>(null);
  useEffect(() => { adminApi.shopDemand().then((r) => setDemand(r.demand)).catch(() => setDemand(null)); }, []);
  if (!demand) return null;
  return (
    <section className="panel">
      <div className="panel-title">🔎 Qidirilgan-lekin-topilmagan ({demand.length})</div>
      <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>Mijozlar Bozorda qidirgan, lekin natija topilmagan so&apos;rovlar — qaysi sotuvchini taklif qilish kerakligini ko&apos;rsatadi.</p>
      {demand.map((d) => (
        <div key={d.query} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <b style={{ flex: "1 1 200px" }}>{d.query}</b>
          <span className="badge badge-warn">×{d.count}</span>
          <span className="muted" style={{ fontSize: 11 }}>oxirgi: {new Date(d.lastAt).toLocaleDateString("ru-RU")}</span>
        </div>
      ))}
      {demand.length === 0 && <p className="muted">Hali yo&apos;q.</p>}
    </section>
  );
}

// 🎠 BirJoy kategoriya-karusel boshqaruvi (D1): nom+emoji qo'shish, ikonka-rasm yuklash (44px
// pill-kartada ko'rinadi), tartib/yoqish, o'chirish. Owner-only route'lar — seller ko'rmaydi.
function ShopCategoriesPanel({ onMsg }: { onMsg: (m: string) => void }) {
  const [cats, setCats] = useState<Awaited<ReturnType<typeof adminApi.shopCats>>["cats"] | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🛍");
  const [iconV, setIconV] = useState(0); // rasm-yuklashdan keyin cache-bust
  const load = () => adminApi.shopCats().then((r) => setCats(r.cats)).catch(() => setCats([]));
  useEffect(() => { load(); }, []);

  const pickIcon = (id: number) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      const b64 = await new Promise<string>((res) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(",")[1] ?? ""); rd.readAsDataURL(f); });
      const r = await adminApi.shopCatIcon(id, f.type || "image/jpeg", b64).catch(() => ({ ok: false }));
      onMsg(r.ok ? "✅ Ikonka yuklandi" : "⚠️ Ikonka yuklanmadi");
      setIconV((v) => v + 1);
      load();
    };
    inp.click();
  };

  return (
    <section className="panel">
      <div className="panel-title">🎠 Karusel-kategoriyalar ({cats?.length ?? 0})</div>
      <p className="muted" style={{ fontSize: 12 }}>Bozor-bosh tepasidagi Uzum-uslub karusel. Rasm yuklang (kvadrat, yorqin ikonka) — bo&apos;lmasa emoji ko&apos;rinadi.</p>
      {(cats ?? []).map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {c.hasIcon ? <img src={`${adminApi.shopCatIconUrl(c.id)}?v=${iconV}`} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} /> : <span style={{ fontSize: 24, width: 34, textAlign: "center" }}>{c.emoji}</span>}
          <b style={{ flex: "1 1 140px" }}>{c.name}</b>
          <span className="muted" style={{ fontSize: 12 }}>{c.productCount} mahsulot</span>
          <button className="btn sm" onClick={() => pickIcon(c.id)}>📷 Ikonka</button>
          <button className="btn sm" onClick={async () => { await adminApi.shopCatEdit(c.id, { active: !c.active }).catch(() => undefined); load(); }}>{c.active ? "🟢 Faol" : "⚪ O'chiq"}</button>
          <button className="btn sm" title="Karuseldan olib tashlash (mahsulotlarga tegmaydi)" onClick={async () => { if (!window.confirm(`«${c.name}» karuseldan o'chirilsinmi?`)) return; await adminApi.shopCatDelete(c.id).catch(() => undefined); load(); }}>🗑</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} style={{ width: 52 }} aria-label="Emoji" />
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Yangi kategoriya nomi" style={{ flex: "1 1 180px" }} />
        <button className="btn sm" onClick={async () => {
          if (newName.trim().length < 2) { onMsg("⚠️ Nom kiriting"); return; }
          const r = await adminApi.shopCatCreate(newName.trim(), newEmoji.trim() || undefined).catch(() => ({ ok: false as const }));
          onMsg(r.ok ? "✅ Kategoriya qo'shildi" : "⚠️ Qo'shilmadi");
          setNewName("");
          load();
        }}>➕ Qo&apos;shish</button>
      </div>
    </section>
  );
}

// 🔎 XIZMATLAR — Koson katalogi boyitish markazi (feature "xizmatlar"). Import qilingan satrlarda
// faqat nom+telefon+teg bor — bu panel desc/soat/manzil/foto/verified to'ldirish uchun. Moderatsiya
// asosan Telegram'da (✅/❌ egaga boradi); bu yerda ham pending'ni hal qilish mumkin.
interface SvcDraft {
  name: string; phone: string; phone2: string; desc: string; tags: string; address: string; workHours: string;
  instagram: string; telegramUrl: string; facebook: string; website: string;
  geoLat: string; geoLng: string; categoryId: number;
  inspClean: string; inspProf: string; inspPrice: string; inspTrust: string; inspQuality: string;
  inspNote: string; priceText: string;
}
function svcDraftFromRow(r: SvcAdminRow): SvcDraft {
  return {
    name: r.name, phone: r.phone, phone2: r.phone2 ?? "", desc: r.desc, tags: r.tags,
    address: r.address ?? "", workHours: r.workHours ?? "",
    instagram: r.instagram ?? "", telegramUrl: r.telegramUrl ?? "", facebook: r.facebook ?? "", website: r.website ?? "",
    geoLat: r.geoLat != null ? String(r.geoLat) : "", geoLng: r.geoLng != null ? String(r.geoLng) : "",
    categoryId: r.categoryId,
    inspClean: r.inspClean != null ? String(r.inspClean) : "", inspProf: r.inspProf != null ? String(r.inspProf) : "",
    inspPrice: r.inspPrice != null ? String(r.inspPrice) : "", inspTrust: r.inspTrust != null ? String(r.inspTrust) : "",
    inspQuality: r.inspQuality != null ? String(r.inspQuality) : "", inspNote: r.inspNote ?? "",
    priceText: "",
  };
}
function svcPriceItemsToText(items: { label: string; priceSom: number }[]): string {
  return items.map((i) => `${i.label}=${i.priceSom}`).join("; ");
}

const INSP_DRAFT_KEY: Record<typeof INSP_CATEGORIES[number]["key"], "inspClean" | "inspProf" | "inspPrice" | "inspTrust" | "inspQuality"> = {
  clean: "inspClean", prof: "inspProf", price: "inspPrice", trust: "inspTrust", quality: "inspQuality",
};

function InspEditBox({ draft, setDraft }: { draft: SvcDraft; setDraft: (d: SvcDraft) => void }) {
  const vals = {
    clean: draft.inspClean.trim() === "" ? undefined : Number(draft.inspClean),
    prof: draft.inspProf.trim() === "" ? undefined : Number(draft.inspProf),
    price: draft.inspPrice.trim() === "" ? undefined : Number(draft.inspPrice),
    trust: draft.inspTrust.trim() === "" ? undefined : Number(draft.inspTrust),
    quality: draft.inspQuality.trim() === "" ? undefined : Number(draft.inspQuality),
  };
  const filledCount = Object.values(vals).filter((v) => v !== undefined).length;
  const total = inspTotal(vals);
  const tier = inspTier(total);

  return (
    <div className="adm-insp-box" style={{ maxWidth: 480 }}>
      <div className="adm-insp-title">🏅 BirJoy tekshiruvi — rasmiy audit (100 ball, 5 mezon)</div>
      <div className="adm-insp-hint">Mijoz bahosi EMAS — jamoangiz jismoniy borib tekshirgan natija. {INSP_PASS_MIN} balldan past bo&apos;lsa rider&apos;larga OMMAVIY belgi umuman chiqmaydi.</div>
      <div className="adm-form-grid" style={{ marginTop: 8 }}>
        {INSP_CATEGORIES.map((c) => {
          const draftKey = INSP_DRAFT_KEY[c.key];
          return (
            <div className="adm-field" key={c.key}>
              <span className="adm-field-label">{c.emoji} {c.label} (0-{INSP_CATEGORY_MAX})</span>
              <input
                type="number" min={0} max={INSP_CATEGORY_MAX}
                value={draft[draftKey]}
                onChange={(e) => setDraft({ ...draft, [draftKey]: e.target.value })}
                placeholder="—"
              />
            </div>
          );
        })}
        <div className="adm-field"><span className="adm-field-label">Tekshiruv xulosasi</span><input value={draft.inspNote} onChange={(e) => setDraft({ ...draft, inspNote: e.target.value })} placeholder="Toza, professional, narxlar mos" /></div>
      </div>
      <div className="adm-insp-total">
        {filledCount === 0 ? (
          <span className="muted">Hali baholanmagan</span>
        ) : total == null ? (
          <span className="muted">{filledCount}/5 mezon to&apos;ldirildi — hammasini kiriting, saqlaganda hisoblanadi</span>
        ) : (
          <>
            <b>{total}/{100} ball</b>
            {tier ? <span className={`badge insp-badge-${tier}`}>{INSP_TIER_EMOJI[tier]} {INSP_TIER_LABEL[tier]}</span> : <span className="badge badge-bad">Ommaviy belgi chiqmaydi ({INSP_PASS_MIN}dan past)</span>}
          </>
        )}
      </div>
    </div>
  );
}
function svcParsePriceText(v: string): { label: string; priceSom: number }[] {
  return v.split(";").map((x) => x.split("=")).filter((a) => a.length === 2)
    .map(([l, p]) => ({ label: (l ?? "").trim(), priceSom: Number(String(p).replace(/\D/g, "")) }))
    .filter((i) => i.label.length >= 2 && i.priceSom > 0);
}

// 🍽 RESTORAN R3 — sessiya-navbati (RESTORAN_PLAN §0/§2/§3/§6). Concierge V1: operator ODAM, bu
// panel operatorning "ish stoli" — Telegram-bot integratsiyasi yo'q (V2). 3+ daq pending → flagged
// (adm-card.flagged, mavjud CSS qayta ishlatildi). 8s poll (DoD: real-vaqt/5-10s).
const RST_STATUS_LABEL: Record<string, { t: string; badge: string }> = {
  pending: { t: "⏳ Kutilmoqda", badge: "badge-warn" },
  accepted: { t: "✅ Qabul qilindi", badge: "badge-ok" },
  preparing: { t: "🍳 Tayyorlanmoqda", badge: "badge-ok" },
  delivering: { t: "🛵 Yo'lda", badge: "badge-ok" },
  delivered: { t: "✅ Yetkazildi", badge: "badge-ok" },
  rejected: { t: "❌ Rad etildi", badge: "badge-bad" },
  cancelled_by_user: { t: "✖ Bekor qilindi", badge: "badge-bad" },
};
const RST_NEXT_LABEL: Record<string, string> = { accepted: "🍳 Tayyorlanmoqda", preparing: "🛵 Yo'lda", delivering: "✅ Yetkazildi" };

function RestoranAdminView() {
  const [orders, setOrders] = useState<AdminFoodOrderRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "done">("pending");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = () => adminApi.restoranOrders().then((r) => setOrders(r.orders)).catch(() => undefined);
  useEffect(() => {
    reload();
    const iv = setInterval(reload, 8000); // DoD: real-vaqt/5-10s poll — operator boshqa qurilmada bosgan holat shu yerda 8s ichida ko'rinadi
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withBusy = async (id: number, fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    setBusyId(id);
    const r = await fn().catch((e: Error) => ({ ok: false as const, reason: e.message }));
    setMsg(r.ok ? "✅ Saqlandi" : `❌ ${r.reason ?? "Xatolik"}`);
    setBusyId(null);
    reload();
  };
  const reject = (id: number) => {
    const reason = window.prompt("Rad etish sababi (restoranga qo'ng'iroqdan keyin):");
    if (reason == null) return;
    void withBusy(id, () => adminApi.restoranReject(id, reason));
  };

  const filtered = (orders ?? []).filter((o) => {
    if (filter === "all") return true;
    if (filter === "pending") return o.status === "pending";
    if (filter === "active") return o.status === "accepted" || o.status === "preparing" || o.status === "delivering";
    return o.status === "delivered" || o.status === "rejected" || o.status === "cancelled_by_user";
  });

  return (
    <section className="panel">
      <div className="panel-title">🍽 Restoran — sessiyalar</div>
      <p className="muted" style={{ marginTop: 0 }}>
        Concierge V1: restoranga TELEFON qiling, keyin holatni shu yerda belgilang. 3+ daqiqa javobsiz buyurtma qizil chiziq bilan ajraladi.
      </p>
      <div className="adm-toolbar">
        <select className="inp" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="pending">⏳ Kutilmoqda</option>
          <option value="active">🍳 Faol (qabul qilingan)</option>
          <option value="done">✔ Tugagan</option>
          <option value="all">Barchasi</option>
        </select>
      </div>
      {msg && <div className="action-msg" style={{ marginTop: 10 }}>{msg}</div>}
      {orders === null && <p className="muted">Yuklanmoqda…</p>}
      {orders && filtered.length === 0 && <p className="muted">Mos buyurtma yo'q.</p>}
      {filtered.map((o) => {
        const s = RST_STATUS_LABEL[o.status] ?? { t: o.status, badge: "badge-warn" };
        const sla = o.status === "pending" && o.ageMinutes >= 3;
        const busy = busyId === o.id;
        return (
          <div key={o.id} className={"adm-card open" + (sla ? " flagged" : "")}>
            <div className="adm-card-head" style={{ cursor: "default" }}>
              <div className="adm-card-main">
                <div className="adm-card-title">
                  #{o.id} <b>{o.restaurantName}</b>
                  <span className={"badge " + s.badge}>{s.t}</span>
                  {sla && <span className="badge badge-bad">⚠ {o.ageMinutes} daq</span>}
                  {!sla && o.status === "pending" && <span className="muted" style={{ fontSize: 11 }}>{o.ageMinutes} daq</span>}
                </div>
                <div className="adm-card-sub">
                  <span>👤 {o.buyerName} · ☎ {o.contact}</span>
                  <span>🏪 {o.restaurantPhone}</span>
                  <span>{o.isPickup ? "🚶 Olib ketish" : `🛵 ${o.address}`}</span>
                </div>
              </div>
            </div>
            <div className="adm-card-body">
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                {o.itemsJson.map((i) => `${i.name} ×${i.qty}`).join(", ")}
              </div>
              {o.note && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>💬 {o.note}</div>}
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Jami: {o.totalSom.toLocaleString("ru-RU")} so'm (naqd)</div>
              {o.rejectReason && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Sabab: {o.rejectReason}</div>}
              {o.status === "pending" && (
                <div className="adm-card-body-foot">
                  {!o.calledAt ? (
                    <button className="btn sm" disabled={busy} onClick={() => void withBusy(o.id, () => adminApi.restoranCall(o.id))}>☎ Qo'ng'iroq qildim</button>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>☎ Qo'ng'iroq qilindi</span>
                  )}
                  <button className="btn sm" disabled={busy} onClick={() => void withBusy(o.id, () => adminApi.restoranAccept(o.id))}>✅ Qabul qildi</button>
                  <button className="btn sm" disabled={busy} onClick={() => reject(o.id)}>❌ Rad</button>
                </div>
              )}
              {(o.status === "accepted" || o.status === "preparing" || o.status === "delivering") && (
                <div className="adm-card-body-foot">
                  <button className="btn sm" disabled={busy} onClick={() => void withBusy(o.id, () => adminApi.restoranAdvance(o.id))}>{RST_NEXT_LABEL[o.status]}</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// 🍽 RESTORAN R4 — restoran+menyu CRUD (§6.1 tezlik: bulk-menyu matn-parse, shablon-nusxalash,
// modal-siz inline tahrirlash). Do'kon admin kartalar+forma qolipidan (commit e6d069d).
interface RestoranDraft {
  name: string; category: string; phone: string; address: string; workHours: string;
  deliveryFeeSom: string; minOrderSom: string; prepMinutes: string; pickupEnabled: boolean;
}
function restoranDraftFromRow(r: RestoranAdminRow): RestoranDraft {
  return {
    name: r.name, category: r.category, phone: r.phone, address: r.address ?? "", workHours: r.workHours ?? "",
    deliveryFeeSom: String(r.deliveryFeeSom), minOrderSom: String(r.minOrderSom), prepMinutes: String(r.prepMinutes),
    pickupEnabled: r.pickupEnabled,
  };
}

function RestoranCatalogAdminView() {
  const [data, setData] = useState<{ restaurants: RestoranAdminRow[]; enabled: boolean } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("milliy");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<RestoranDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<RestoranMenuItemRow[] | null>(null);
  const [bulkSection, setBulkSection] = useState("Taomlar");
  const [bulkText, setBulkText] = useState("");
  const [photoV, setPhotoV] = useState(0); // cache-bust: /api/restoran/photo redirect is cached 1h — bump on upload so admin sees the new image immediately

  const load = () => { adminApi.restoranList().then(setData).catch(() => undefined); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim() || !phone.trim()) { setMsg("⚠️ Nom va telefon to'ldirilsin"); return; }
    const r = await adminApi.restoranCreate({ name: name.trim(), phone: phone.trim(), category: category.trim() || "milliy" })
      .catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(r.ok ? "✅ Qo'shildi (o'chiq holda — menyu kiritib, yoqing)" : `❌ Qo'shilmadi: ${("error" in r && r.error) || "server javob bermadi"}`);
    if (r.ok) { setName(""); setPhone(""); setShowAdd(false); load(); }
  };

  const toggleExpand = (r: RestoranAdminRow) => {
    if (expandedId === r.id) { setExpandedId(null); setDraft(null); setMenu(null); return; }
    setExpandedId(r.id);
    setDraft(restoranDraftFromRow(r));
    setMenu(null);
    adminApi.restoranMenu(r.id).then((res) => setMenu(res.items)).catch(() => setMenu([]));
  };

  const saveDraft = async (id: number) => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.phone.trim()) { setMsg("❌ Nom va telefon to'ldirilsin"); return; }
    setSaving(true);
    const r = await adminApi.restoranEdit(id, {
      name: draft.name, category: draft.category || "milliy", phone: draft.phone,
      address: draft.address || null, workHours: draft.workHours || null,
      deliveryFeeSom: Number(draft.deliveryFeeSom) || 0, minOrderSom: Number(draft.minOrderSom) || 0,
      prepMinutes: Number(draft.prepMinutes) || 30, pickupEnabled: draft.pickupEnabled,
    }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(r.ok ? "✅ Saqlandi" : "❌ Saqlanmadi");
    setSaving(false);
    load();
  };

  const uploadPhoto = (id: number) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { setMsg("❌ Rasm 5MB dan kichik bo'lsin"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result).split(",")[1] ?? "";
        const r = await adminApi.restoranPhotoUpload(id, f.type || "image/jpeg", base64).catch((e: Error) => ({ ok: false as const, error: e.message }));
        setMsg(r.ok ? "✅ Rasm yuklandi" : "❌ Rasm yuklanmadi");
        if (r.ok) setPhotoV((v) => v + 1);
        load();
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const del = async (r: RestoranAdminRow) => {
    if (!window.confirm(`"${r.name}" o'chirilsinmi? (buyurtma tarixi saqlanadi)`)) return;
    await adminApi.restoranDelete(r.id).catch(() => undefined);
    load();
  };

  const addBulkMenu = async (restaurantId: number) => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setMsg("⚠️ Kamida bitta qator kiriting: Nom — Narx"); return; }
    const r = await adminApi.restoranMenuBulk(restaurantId, bulkSection || "Taomlar", lines).catch((e: Error) => ({ ok: false as const, created: 0, error: e.message }));
    setMsg(r.ok ? `✅ ${r.created} ta taom qo'shildi` : "❌ Hech qaysi qator to'g'ri formatda emas (Nom — Narx)");
    if (r.ok) {
      setBulkText("");
      adminApi.restoranMenu(restaurantId).then((res) => setMenu(res.items)).catch(() => undefined);
      load();
    }
  };

  const menuQuickEdit = async (item: RestoranMenuItemRow, patch: Record<string, unknown>) => {
    await adminApi.restoranMenuEdit(item.id, patch).catch(() => undefined);
    if (expandedId != null) adminApi.restoranMenu(expandedId).then((res) => setMenu(res.items)).catch(() => undefined);
    load();
  };
  const menuDelete = async (item: RestoranMenuItemRow) => {
    if (!window.confirm(`"${item.name}" menyudan o'chirilsinmi?`)) return;
    await adminApi.restoranMenuDelete(item.id).catch(() => undefined);
    if (expandedId != null) adminApi.restoranMenu(expandedId).then((res) => setMenu(res.items)).catch(() => undefined);
    load();
  };

  const uploadMenuPhoto = (item: RestoranMenuItemRow) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { setMsg("❌ Rasm 5MB dan kichik bo'lsin"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result).split(",")[1] ?? "";
        const r = await adminApi.restoranMenuPhotoUpload(item.id, f.type || "image/jpeg", base64).catch((e: Error) => ({ ok: false as const, error: e.message }));
        setMsg(r.ok ? `✅ "${item.name}" rasmi yuklandi` : "❌ Rasm yuklanmadi");
        if (r.ok) setPhotoV((v) => v + 1);
        if (expandedId != null) adminApi.restoranMenu(expandedId).then((res) => setMenu(res.items)).catch(() => undefined);
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const restaurants = (data?.restaurants ?? []).filter((r) => {
    const t = q.trim().toLowerCase();
    return !t || r.name.toLowerCase().includes(t) || r.category.toLowerCase().includes(t);
  });

  return (
    <section className="panel">
      <div className="panel-title">🍽 Restoranlar ({restaurants.length})</div>
      <p className="muted" style={{ marginTop: 0 }}>
        {data && !data.enabled && <b style={{ color: "#f59e0b" }}>«restoran» flag o&apos;chiq — mijozlarga ko&apos;rinmaydi (Features&apos;dan yoqiladi). </b>}
        Yangi restoran O&apos;CHIQ holda yaratiladi — menyu kiritib, «yoqish»ni bosing.
      </p>
      <button className="btn sm" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "✖ Yopish" : "➕ Yangi restoran qo'shish"}</button>
      {showAdd && (
        <div className="adm-form-grid" style={{ marginTop: 10 }}>
          <div className="adm-field"><span className="adm-field-label">Nomi</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Koson Milliy Taomlar" /></div>
          <div className="adm-field"><span className="adm-field-label">Telefon</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998901234567" /></div>
          <div className="adm-field"><span className="adm-field-label">Kategoriya</span><input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div className="adm-field">
            <span className="adm-field-label">&nbsp;</span>
            <button onClick={create}>➕ Qo&apos;shish</button>
          </div>
        </div>
      )}
      {msg && <div className="action-msg" style={{ marginTop: 10 }}>{msg}</div>}
      <div className="adm-toolbar" style={{ marginTop: 10 }}>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Nom yoki kategoriya…" />
      </div>
      {restaurants.map((r) => (
        <div key={r.id} className={"adm-card" + (expandedId === r.id ? " open" : "")}>
          <div className="adm-card-head" role="button" tabIndex={0} onClick={() => toggleExpand(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(r); } }}>
            <div className="adm-card-main">
              <div className="adm-card-title">
                {r.name}
                <span className={"badge " + (r.active ? "badge-ok" : "badge-warn")}>{r.active ? "🟢 Yoniq" : "🔴 O'chiq"}</span>
                {r.paused && <span className="badge badge-bad">⏸ To'xtatilgan</span>}
              </div>
              <div className="adm-card-sub">
                <span>☎ {r.phone}</span>
                <span>📋 {r.menuCount} taom</span>
                <span>🧾 {r.orderCount} buyurtma</span>
              </div>
            </div>
            <div className="adm-card-actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn sm" onClick={() => void adminApi.restoranToggle(r.id, !r.active).then(load)}>{r.active ? "O'chirish" : "Yoqish"}</button>
              <button className="btn sm" onClick={() => del(r)}>🗑</button>
            </div>
            <span className="adm-card-chev">{expandedId === r.id ? "▲" : "▼"}</span>
          </div>
          {expandedId === r.id && draft && (
            <div className="adm-card-body">
              <div className="adm-form-grid">
                <div className="adm-field"><span className="adm-field-label">Nomi</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                <div className="adm-field"><span className="adm-field-label">Telefon</span><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
                <div className="adm-field"><span className="adm-field-label">Kategoriya</span><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></div>
                <div className="adm-field"><span className="adm-field-label">Manzil</span><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
                <div className="adm-field"><span className="adm-field-label">Ish vaqti (09:00-22:00)</span><input value={draft.workHours} onChange={(e) => setDraft({ ...draft, workHours: e.target.value })} placeholder="09:00-22:00" /></div>
                <div className="adm-field"><span className="adm-field-label">Yetkazish (so'm)</span><input type="number" value={draft.deliveryFeeSom} onChange={(e) => setDraft({ ...draft, deliveryFeeSom: e.target.value })} /></div>
                <div className="adm-field"><span className="adm-field-label">Min buyurtma (so'm)</span><input type="number" value={draft.minOrderSom} onChange={(e) => setDraft({ ...draft, minOrderSom: e.target.value })} /></div>
                <div className="adm-field"><span className="adm-field-label">Tayyorlash (daq)</span><input type="number" value={draft.prepMinutes} onChange={(e) => setDraft({ ...draft, prepMinutes: e.target.value })} /></div>
                <div className="adm-field">
                  <span className="adm-field-label">Olib ketish</span>
                  <button onClick={() => setDraft({ ...draft, pickupEnabled: !draft.pickupEnabled })}>{draft.pickupEnabled ? "✅ Yoqilgan" : "✖ O'chiq"}</button>
                </div>
              </div>
              <div className="adm-card-body-foot">
                {r.hasPhoto && <img src={`${adminApi.restoranPhotoUrl(r.id)}?v=${photoV}`} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />}
                <button className="btn" disabled={saving} onClick={() => saveDraft(r.id)}>{saving ? "Saqlanmoqda…" : "💾 Saqlash"}</button>
                <button className="btn sm" onClick={() => uploadPhoto(r.id)}>{r.hasPhoto ? "🖼 Rasmni almashtirish" : "🖼 Rasm yuklash"}</button>
              </div>

              <hr style={{ margin: "14px 0", border: 0, borderTop: "1px solid var(--line)" }} />
              <div className="panel-title" style={{ fontSize: 14 }}>📋 Menyu ({menu?.length ?? 0})</div>
              {menu === null && <p className="muted">Yuklanmoqda…</p>}
              {menu && menu.length === 0 && <p className="muted">Hali taom yo'q — pastdan bulk qo'shing.</p>}
              {menu?.map((item) => (
                <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {item.hasPhoto
                    ? <img src={`${adminApi.restoranMenuPhotoUrl(item.id)}?v=${photoV}`} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                    : <span style={{ width: 32, height: 32, borderRadius: 6, background: "var(--card)", flexShrink: 0 }} />}
                  <span className="muted" style={{ fontSize: 11, minWidth: 70 }}>{item.section}</span>
                  <input className="inp" style={{ flex: "2 1 160px" }} defaultValue={item.name} onBlur={(e) => e.target.value !== item.name && menuQuickEdit(item, { name: e.target.value })} />
                  <input className="inp" type="number" style={{ flex: "0 1 100px" }} defaultValue={item.priceSom} onBlur={(e) => Number(e.target.value) !== item.priceSom && menuQuickEdit(item, { priceSom: Number(e.target.value) })} />
                  <button className="btn sm" onClick={() => menuQuickEdit(item, { available: !item.available })}>{item.available ? "🟢 Bor" : "🔴 Tugagan"}</button>
                  <button className="btn sm" onClick={() => uploadMenuPhoto(item)} title={item.hasPhoto ? "Rasmni almashtirish" : "Rasm yuklash"}>{item.hasPhoto ? "🖼✔" : "🖼"}</button>
                  <button className="btn sm" onClick={() => menuDelete(item)}>🗑</button>
                </div>
              ))}
              <div className="adm-field" style={{ marginTop: 10 }}>
                <span className="adm-field-label">Bo'lim nomi</span>
                <input value={bulkSection} onChange={(e) => setBulkSection(e.target.value)} placeholder="Issiq taom" />
              </div>
              <div className="adm-field" style={{ marginTop: 6 }}>
                <span className="adm-field-label">Bulk qo'shish — har qatorda: Nom — Narx</span>
                <textarea className="inp" rows={4} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"Osh — 35000\nLag'mon — 30000\nShurva — 25000"} />
              </div>
              <button className="btn sm" style={{ marginTop: 6 }} onClick={() => addBulkMenu(r.id)}>➕ Bulk qo&apos;shish</button>
            </div>
          )}
        </div>
      ))}
      {data && restaurants.length === 0 && <p className="muted">Mos restoran topilmadi.</p>}
    </section>
  );
}

function XizmatlarAdminView() {
  const [data, setData] = useState<{ rows: SvcAdminRow[]; enabled: boolean; pending: number; hiddenReviews: number; phoneFlagged: number; newRequests: number } | null>(null);
  const [cats, setCats] = useState<SvcAdminCat[]>([]);
  const [reviews, setReviews] = useState<SvcAdminReview[]>([]);
  const [requests, setRequests] = useState<{ id: number; query: string; note: string; status: string; createdAt: string }[]>([]);
  const [stFilter, setStFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<number>(0);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newCat, setNewCat] = useState<number>(0);
  const [msg, setMsg] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SvcDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    adminApi.svcList().then(setData).catch(() => undefined);
    adminApi.svcCats().then((r) => setCats(r.categories)).catch(() => undefined);
    adminApi.svcReviewQueue().then((r) => setReviews(r.reviews)).catch(() => setReviews([]));
    adminApi.svcRequests("new").then((r) => setRequests(r.requests)).catch(() => setRequests([]));
  };
  useEffect(() => { load(); }, []);

  const quickEdit = async (id: number, patch: Record<string, unknown>, okMsg = "✅ Saqlandi") => {
    const r = await adminApi.svcEdit(id, patch).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(r.ok ? okMsg : `❌ ${("error" in r && r.error) || "xatolik"}`);
    load();
  };

  const toggleExpand = async (r: SvcAdminRow) => {
    if (expandedId === r.id) { setExpandedId(null); setDraft(null); return; }
    setExpandedId(r.id);
    setDraft(svcDraftFromRow(r));
    const pr = await adminApi.svcGetPrices(r.id).catch(() => ({ items: [] as { label: string; priceSom: number }[] }));
    setDraft((prev) => (prev ? { ...prev, priceText: svcPriceItemsToText(pr.items) } : prev));
  };

  const saveDraft = async (id: number) => {
    if (!draft) return;
    setSaving(true);
    const la = draft.geoLat.trim() === "" ? null : Number(draft.geoLat);
    const ln = draft.geoLng.trim() === "" ? null : Number(draft.geoLng);
    if ((la != null && !Number.isFinite(la)) || (ln != null && !Number.isFinite(ln))) {
      setMsg("❌ Koordinata noto'g'ri — raqam kiriting"); setSaving(false); return;
    }
    const toInsp = (s: string) => (s.trim() === "" ? null : Number(s));
    const patch: Record<string, unknown> = {
      name: draft.name, phone: draft.phone, phone2: draft.phone2 || null, desc: draft.desc, tags: draft.tags,
      address: draft.address || null, workHours: draft.workHours || null,
      instagram: draft.instagram || null, telegramUrl: draft.telegramUrl || null, facebook: draft.facebook || null, website: draft.website || null,
      geoLat: la, geoLng: ln, categoryId: draft.categoryId,
      inspClean: toInsp(draft.inspClean), inspProf: toInsp(draft.inspProf), inspPrice: toInsp(draft.inspPrice),
      inspTrust: toInsp(draft.inspTrust), inspQuality: toInsp(draft.inspQuality), inspNote: draft.inspNote || null,
    };
    const r = await adminApi.svcEdit(id, patch).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!r.ok) { setMsg(`❌ ${("error" in r && r.error) || "xatolik"}`); setSaving(false); return; }
    const pr = await adminApi.svcSetPrices(id, svcParsePriceText(draft.priceText)).catch(() => ({ ok: false as const, count: 0 }));
    setMsg(pr.ok ? "✅ Saqlandi" : "✅ Ma'lumot saqlandi · ❌ narxlarda xatolik");
    setSaving(false);
    load();
  };

  const create = async () => {
    if (!name.trim() || !phone.trim() || !newCat) { setMsg("⚠️ Nom, telefon va kategoriya shart"); return; }
    const r = await adminApi.svcCreate({ name: name.trim(), phone: phone.trim(), categoryId: newCat }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(r.ok ? "✅ Qo'shildi (darhol aktiv)" : `❌ ${("error" in r && r.error) || "xatolik"}`);
    if (r.ok) { setName(""); setPhone(""); setNewCat(0); setShowAdd(false); load(); }
  };
  const uploadPhoto = (id: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { setMsg("❌ Rasm 5MB dan kichik bo'lsin"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result).split(",")[1] ?? "";
        const r = await adminApi.svcPhotoUpload(id, f.type || "image/jpeg", base64).catch((e: Error) => ({ ok: false as const, error: e.message }));
        setMsg(r.ok ? `✅ Rasm yuklandi (${("photoCount" in r && r.photoCount) || "?"}/6)` : `❌ ${("error" in r && r.error) === "max_photos" ? "6 ta chegara — rasmlarni tozalab qayta urinib ko'ring" : ("error" in r && r.error) || "xatolik"}`);
        load();
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const rows = (data?.rows ?? [])
    .filter((r) => (stFilter === "all" ? true : r.status === stFilter))
    .filter((r) => (catFilter ? r.categoryId === catFilter : true))
    .filter((r) => {
      const t = q.trim().toLowerCase();
      return !t || r.name.toLowerCase().includes(t) || r.phone.includes(t) || r.tags.toLowerCase().includes(t);
    });
  const SVC_STATUS_LABEL: Record<string, string> = { pending: "⏳ Kutilmoqda", active: "🟢 Aktiv", rejected: "❌ Rad", archived: "🗄 Arxiv" };
  const SVC_STATUS_BADGE: Record<string, string> = { pending: "badge-warn", active: "badge-ok", rejected: "badge-bad", archived: "badge-muted" };
  const doneCount = (data?.rows ?? []).filter((r) => r.status === "active" && r.workHours && (r.desc || r.address)).length;

  return (
    <>
      <section className="panel">
        <div className="panel-title">🔎 Xizmatlar katalogi</div>
        <p className="muted" style={{ marginTop: 0 }}>
          {data && !data.enabled && <b style={{ color: "#f59e0b" }}>«xizmatlar» flag O&apos;CHIQ — mijozlar hali ko&apos;rmaydi (GO LIVE&apos;da yoqiladi). </b>}
          {data && <>Jami {data.rows.length} ta · boyitilgan (soat + tavsif/manzil): <b>{doneCount}</b> ta{data.pending > 0 && <b style={{ color: "#f59e0b" }}> · ⏳ {data.pending} moderatsiya</b>}{data.phoneFlagged > 0 && <b style={{ color: "#ef4444" }}> · ⚑ {data.phoneFlagged} raqam shubhali</b>}{data.newRequests > 0 && <b style={{ color: "#38bdf8" }}> · 📬 {data.newRequests} so&apos;rov</b>}.</>}
          {" "}Maslahat: har kuni 10 tasiga 🕒 soat + 📝 tavsif + 📷 foto qo&apos;shsangiz, bir haftada katalog to&apos;liq «2GIS ko&apos;rinish»ga keladi.
        </p>
        <button className="btn sm" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "✖ Yopish" : "➕ Yangi xizmat qo'shish"}</button>
        {showAdd && (
          <div className="adm-form-grid" style={{ marginTop: 10 }}>
            <div className="adm-field"><span className="adm-field-label">Nomi</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Fotima non yopish" /></div>
            <div className="adm-field"><span className="adm-field-label">Telefon</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" /></div>
            <div className="adm-field">
              <span className="adm-field-label">Kategoriya</span>
              <select value={newCat} onChange={(e) => setNewCat(Number(e.target.value))}>
                <option value={0}>Tanlang…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
            <div className="adm-field">
              <span className="adm-field-label">&nbsp;</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={create}>➕ Qo&apos;shish</button>
                <button className="btn sm" title="Yangi kategoriya" onClick={async () => {
                  const n = window.prompt("Yangi kategoriya nomi:"); if (!n?.trim()) return;
                  const e = window.prompt("Emoji:", "📌") ?? "📌";
                  await adminApi.svcCatUpsert({ name: n.trim(), emoji: e }).catch(() => undefined); load();
                }}>📂+</button>
              </div>
            </div>
          </div>
        )}
        {msg && <div className="action-msg" style={{ marginTop: 10 }}>{msg}</div>}
      </section>

      <section className="panel">
        <div className="panel-title">📋 Ro&apos;yxat ({rows.length})</div>
        <div className="adm-toolbar">
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Nom, telefon yoki teg…" />
          <select className="inp" value={stFilter} onChange={(e) => setStFilter(e.target.value)}>
            <option value="all">Barcha holat</option><option value="pending">⏳ Kutilmoqda</option><option value="active">🟢 Aktiv</option><option value="rejected">❌ Rad</option><option value="archived">🗄 Arxiv</option>
          </select>
          <select className="inp" value={catFilter} onChange={(e) => setCatFilter(Number(e.target.value))}>
            <option value={0}>Barcha kategoriya</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        {rows.map((r) => (
          <div key={r.id} className={"adm-card" + (expandedId === r.id ? " open" : "") + (r.phoneReports >= 2 ? " flagged" : "")}>
            <div className="adm-card-head" role="button" tabIndex={0} onClick={() => void toggleExpand(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void toggleExpand(r); } }}>
              <div className="adm-card-main">
                <div className="adm-card-title">
                  {r.name}
                  <span className={"badge " + (SVC_STATUS_BADGE[r.status] ?? "badge-muted")}>{SVC_STATUS_LABEL[r.status] ?? r.status}</span>
                  {r.verified && <span className="badge badge-ok">✔ Verified</span>}
                  {r.isVip && <span className="badge badge-warn">⭐ VIP</span>}
                  {r.phoneReports >= 2 && <span className="badge badge-bad">⚑ {r.phoneReports} raqam shubhali</span>}
                </div>
                <div className="adm-card-sub">
                  <span>{r.categoryName}</span>
                  <span>📞 {r.phone}</span>
                  <span>👁 {r.viewCount} · 📞 {r.callCount}</span>
                  {r.reviewCount > 0 && <span>★{r.avgRating} ({r.reviewCount})</span>}
                  {r.priceCount > 0 && <span>💰 {r.priceCount} narx</span>}
                  {r.photoCount > 0 && <span>📷 {r.photoCount}/6</span>}
                  {!r.workHours && <span>🕒 soat yo&apos;q</span>}
                  {!r.desc && <span>📝 tavsif yo&apos;q</span>}
                </div>
              </div>
              <div className="adm-card-actions" onClick={(e) => e.stopPropagation()}>
                <a className="btn sm" href={telHref(r.phone)}>📞 Qo&apos;ng&apos;iroq</a>
                {r.status === "pending" && (
                  <>
                    <button className="btn sm" onClick={() => void quickEdit(r.id, { status: "active" }, "✅ Tasdiqlandi")}>✅ Tasdiqlash</button>
                    <button className="btn sm" onClick={() => void quickEdit(r.id, { status: "rejected" }, "❌ Rad etildi")}>❌ Rad etish</button>
                  </>
                )}
                {r.status === "active" && <button className="btn sm" onClick={() => void quickEdit(r.id, { status: "archived" }, "🗄 Arxivlandi")}>🗄 Arxivlash</button>}
                {(r.status === "rejected" || r.status === "archived") && <button className="btn sm" onClick={() => void quickEdit(r.id, { status: "active" }, "♻️ Aktivlandi")}>♻️ Qayta faollashtir</button>}
              </div>
              <span className="adm-card-chev">{expandedId === r.id ? "▾" : "▸"}</span>
            </div>

            {expandedId === r.id && draft && (
              <div className="adm-card-body">
                <div className="adm-form-grid wide">
                  <div className="adm-field"><span className="adm-field-label">Nomi</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                  <div className="adm-field"><span className="adm-field-label">Telefon</span><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
                  <div className="adm-field"><span className="adm-field-label">Qo&apos;shimcha telefon</span><input value={draft.phone2} onChange={(e) => setDraft({ ...draft, phone2: e.target.value })} placeholder="ixtiyoriy" /></div>
                  <div className="adm-field">
                    <span className="adm-field-label">Kategoriya</span>
                    <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: Number(e.target.value) })}>
                      {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                    </select>
                  </div>
                  <div className="adm-field"><span className="adm-field-label">Ish vaqti</span><input value={draft.workHours} onChange={(e) => setDraft({ ...draft, workHours: e.target.value })} placeholder="08:00-19:00" /></div>
                  <div className="adm-field"><span className="adm-field-label">Manzil</span><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
                  <div className="adm-field"><span className="adm-field-label">Teglar (vergul bilan)</span><input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></div>
                  <div className="adm-field">
                    <span className="adm-field-label">Koordinata (lat / lng)</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={draft.geoLat} onChange={(e) => setDraft({ ...draft, geoLat: e.target.value })} placeholder="39.037" />
                      <input value={draft.geoLng} onChange={(e) => setDraft({ ...draft, geoLng: e.target.value })} placeholder="65.585" />
                    </div>
                    <span className="adm-field-hint">Yandex/Google xaritadan nusxa — Mini App&apos;da &quot;Borish&quot; tugmasi chiqadi</span>
                  </div>
                </div>

                <div className="adm-field" style={{ marginTop: 10 }}>
                  <span className="adm-field-label">Tavsif</span>
                  <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} placeholder="Nima qiladi, nima sotadi…" />
                </div>

                <div className="adm-form-grid wide" style={{ marginTop: 10 }}>
                  <div className="adm-field"><span className="adm-field-label">Instagram</span><input value={draft.instagram} onChange={(e) => setDraft({ ...draft, instagram: e.target.value })} /></div>
                  <div className="adm-field"><span className="adm-field-label">Telegram</span><input value={draft.telegramUrl} onChange={(e) => setDraft({ ...draft, telegramUrl: e.target.value })} /></div>
                  <div className="adm-field"><span className="adm-field-label">Facebook</span><input value={draft.facebook} onChange={(e) => setDraft({ ...draft, facebook: e.target.value })} /></div>
                  <div className="adm-field"><span className="adm-field-label">Sayt</span><input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} /></div>
                </div>

                <div className="adm-field" style={{ marginTop: 10 }}>
                  <span className="adm-field-label">Preyskurant</span>
                  <textarea value={draft.priceText} onChange={(e) => setDraft({ ...draft, priceText: e.target.value })} placeholder="Soch olish=25000; Soqol=15000" />
                  <span className="adm-field-hint">Format: Nom=narx; Nom=narx</span>
                </div>

                <InspEditBox draft={draft} setDraft={setDraft} />

                <div className="adm-card-body-foot">
                  <button className="btn" disabled={saving} onClick={() => void saveDraft(r.id)}>{saving ? "Saqlanmoqda…" : "💾 Saqlash"}</button>
                  <button className="btn sm" onClick={() => void quickEdit(r.id, { verified: !r.verified })}>{r.verified ? "✔ Verified'ni o'chirish" : "☐ Verified qilish"}</button>
                  <button className="btn sm" onClick={() => void quickEdit(r.id, { isVip: !r.isVip })}>{r.isVip ? "⭐ VIP'ni o'chirish" : "☆ VIP qilish"}</button>
                  <button className="btn sm" onClick={() => uploadPhoto(r.id)}>📷 Rasm yuklash ({r.photoCount}/6)</button>
                  {r.photoCount > 0 && <button className="btn sm" onClick={async () => { if (!window.confirm("Rasmlar o'chirilsinmi?")) return; await adminApi.svcPhotoClear(r.id).catch(() => undefined); load(); }}>🗑🖼 Rasmlarni tozalash</button>}
                </div>
              </div>
            )}
          </div>
        ))}
        {data && rows.length === 0 && <p className="muted">Mos yozuv yo&apos;q.</p>}
      </section>

      <section className="panel">
        <div className="panel-title">📬 Topilmagan xizmat so&apos;rovlari ({requests.length})</div>
        <p className="muted" style={{ marginTop: 0 }}>Odamlar qidirib topa olmagan xizmatlar — REAL talab. Shu biznesni topib qo&apos;shsangiz, mijozi tayyor.</p>
        {requests.map((rq) => (
          <div key={rq.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ flex: "2 1 240px" }}>
              🔍 <b>{rq.query}</b>
              {rq.note && <span className="muted"> · {rq.note}</span>}
              <span className="muted" style={{ fontSize: 12 }}> · {new Date(rq.createdAt).toLocaleDateString("uz-UZ")}</span>
            </span>
            <button className="btn sm" title="Xizmat topildi va katalogga qo'shildi" onClick={async () => { await adminApi.svcRequestSet(rq.id, "done").catch(() => undefined); load(); }}>✅ Qo&apos;shildi</button>
            <button className="btn sm" onClick={async () => { await adminApi.svcRequestSet(rq.id, "dismissed").catch(() => undefined); load(); }}>✖</button>
          </div>
        ))}
        {requests.length === 0 && <p className="muted">Yangi so&apos;rov yo&apos;q.</p>}
      </section>

      <section className="panel">
        <div className="panel-title">⚑ Shikoyat qilingan sharhlar ({reviews.length})</div>
        {reviews.map((rv) => (
          <div key={rv.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ flex: "2 1 240px" }}>
              <b>{rv.listingName}</b> <span className="muted">· {rv.authorName} · {"★".repeat(rv.stars)} · ⚑{rv.reports}</span>
              <div className="muted" style={{ fontSize: 12 }}>{rv.text || "(matn yo'q)"}</div>
            </span>
            <button className="btn sm" onClick={async () => { await adminApi.svcReviewModerate(rv.id, "restore").catch(() => undefined); load(); }}>♻️ Qaytarish</button>
            <button className="btn sm" onClick={async () => { if (!window.confirm("Sharh butunlay o'chirilsinmi?")) return; await adminApi.svcReviewModerate(rv.id, "delete").catch(() => undefined); load(); }}>🗑 O&apos;chirish</button>
          </div>
        ))}
        {reviews.length === 0 && <p className="muted">Navbat bo&apos;sh — shikoyat qilingan sharh yo&apos;q.</p>}
      </section>
    </>
  );
}

// 📋 E'LONLAR (E3) — moderatsiya navbati + kartalar (egasi/AdView/AdContact) + amallar (arxivla/uzayt/TOP).
// Approve/reject FAQAT Telegram'da (owner [✅/❌]) — bu yer faqat ko'rish + owner-discretion amallar.
const ELON_STATUS_LABEL: Record<string, string> = { pending: "⏳ Moderatsiyada", active: "🟢 Faol", sold: "🤝 Sotildi", rejected: "❌ Rad", archived: "🗄 Arxiv", expired: "⌛ Muddati o'tgan" };
const ELON_STATUS_BADGE: Record<string, string> = { pending: "badge-warn", active: "badge-ok", sold: "badge-ok", rejected: "badge-bad", archived: "badge-muted", expired: "badge-muted" };
function elonCatLabel(id: string): string {
  const c = CLASSIFIED_CATEGORIES.find((x) => x.id === id);
  return c ? `${c.emoji} ${c.label}` : id;
}

interface ElonDraft { title: string; desc: string; phone: string; category: string; subtype: string; priceSom: string }

function elonDraftFromRow(r: AdminClassifiedRow): ElonDraft {
  return { title: r.title, desc: r.desc, phone: r.phone, category: r.category, subtype: r.subtype, priceSom: r.priceSom != null ? String(r.priceSom) : "" };
}

function ElonlarAdminView() {
  const [data, setData] = useState<AdminClassifiedListResponse | null>(null);
  const [stFilter, setStFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [drill, setDrill] = useState<{ viewers: AdminAdViewerRow[]; contacts: AdminAdContactRow[]; reactions: AdminAdReactionRow[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState<ElonDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newAd, setNewAd] = useState<{ title: string; desc: string; phone: string; category: string; subtype: string; priceSom: string }>(
    { title: "", desc: "", phone: "", category: CLASSIFIED_CATEGORIES[0]!.id, subtype: CLASSIFIED_CATEGORIES[0]!.subtypes[0], priceSom: "" },
  );

  const load = () => { adminApi.elonList().then(setData).catch(() => undefined); };
  useEffect(() => { load(); }, []);

  const toggle = async (r: AdminClassifiedRow) => {
    if (openId === r.id) { setOpenId(null); setDrill(null); setDraft(null); return; }
    setOpenId(r.id); setDrill(null); setDraft(elonDraftFromRow(r));
    const [v, c, rx] = await Promise.all([
      adminApi.elonViewers(r.id).catch(() => ({ viewers: [] as AdminAdViewerRow[] })),
      adminApi.elonContacts(r.id).catch(() => ({ contacts: [] as AdminAdContactRow[] })),
      adminApi.elonReactions(r.id).catch(() => ({ reactions: [] as AdminAdReactionRow[] })),
    ]);
    setDrill({ viewers: v.viewers, contacts: c.contacts, reactions: rx.reactions });
  };

  const createAd = async () => {
    if (newAd.title.trim().length < 3 || !newAd.phone.trim()) { setMsg("⚠️ Sarlavha va telefon shart"); return; }
    const patch: Record<string, unknown> = {
      title: newAd.title, desc: newAd.desc, phone: newAd.phone, category: newAd.category, subtype: newAd.subtype,
      priceSom: newAd.priceSom.trim() === "" ? null : Number(newAd.priceSom),
    };
    const r = await adminApi.elonCreate(patch).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(
      !r.ok ? `❌ ${("error" in r && r.error) || "xatolik"}`
      : r.ownerMatched ? `✅ Qo'shildi — botda topildi, ${r.ownerName ?? "mijoz"} nomiga bog'landi (o'zi "Mening e'lonlarim"da ko'radi)`
      : "✅ Qo'shildi (darhol aktiv) — bu raqam botda topilmadi, hozircha admin nomida",
    );
    if (r.ok) {
      setNewAd({ title: "", desc: "", phone: "", category: CLASSIFIED_CATEGORIES[0]!.id, subtype: CLASSIFIED_CATEGORIES[0]!.subtypes[0], priceSom: "" });
      setShowAdd(false);
      load();
    }
  };

  const act = async (fn: () => Promise<{ ok: boolean }>, okMsg: string) => {
    const r = await fn().catch(() => ({ ok: false }));
    setMsg(r.ok ? okMsg : "❌ xatolik");
    load();
  };

  const saveDraft = async (id: number) => {
    if (!draft) return;
    if (draft.title.trim().length < 3) { setMsg("❌ Sarlavha kamida 3 ta belgi bo'lsin"); return; }
    setSaving(true);
    const patch: Record<string, unknown> = {
      title: draft.title, desc: draft.desc, phone: draft.phone, category: draft.category, subtype: draft.subtype,
      priceSom: draft.priceSom.trim() === "" ? null : Number(draft.priceSom),
    };
    const r = await adminApi.elonEdit(id, patch).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setMsg(r.ok ? "✅ Saqlandi" : `❌ ${("error" in r && r.error) || "xatolik"}`);
    setSaving(false);
    load();
  };

  const uploadPhoto = (id: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { setMsg("❌ Rasm 5MB dan kichik bo'lsin"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result).split(",")[1] ?? "";
        const r = await adminApi.elonPhotoUpload(id, f.type || "image/jpeg", base64).catch((e: Error) => ({ ok: false as const, error: e.message }));
        setMsg(r.ok ? `✅ Rasm yuklandi (${("photoCount" in r && r.photoCount) || "?"}/6)` : `❌ ${("error" in r && r.error) || "xatolik"}`);
        load();
      };
      reader.readAsDataURL(f);
    };
    input.click();
  };

  const clearPhotos = async (id: number) => {
    if (!window.confirm("Barcha rasmlar o'chirilsinmi? (qayta yuklash uchun avval tozalang)")) return;
    await adminApi.elonPhotoClear(id).catch(() => undefined);
    setMsg("🗑 Rasmlar tozalandi");
    load();
  };

  const remove = async (r: AdminClassifiedRow) => {
    if (!window.confirm(`"${r.title}" BUTUNLAY o'chirilsinmi? Bu qaytarib bo'lmaydi (arxivlash emas — to'liq o'chirish).`)) return;
    await adminApi.elonDelete(r.id).catch(() => undefined);
    if (openId === r.id) { setOpenId(null); setDraft(null); }
    setMsg("🗑 O'chirildi");
    load();
  };

  const rows = (data?.rows ?? [])
    .filter((r) => (stFilter === "all" ? true : r.status === stFilter))
    .filter((r) => (catFilter === "all" ? true : r.category === catFilter))
    .filter((r) => {
      const t = q.trim().toLowerCase();
      return !t || r.title.toLowerCase().includes(t) || r.owner.name.toLowerCase().includes(t) || (r.owner.phone ?? "").includes(t);
    });

  return (
    <section className="panel">
      <div className="panel-title">📋 E&apos;lonlar (mahalla doskasi)</div>
      <p className="muted" style={{ marginTop: 0 }}>
        {data && <>Jami {data.rows.length} ta · 🟢 faol {data.active} · {data.pending > 0 ? <b style={{ color: "#f59e0b" }}>⏳ {data.pending} moderatsiyada</b> : "⏳ 0 moderatsiyada"} · bugun 👁 {data.todayViews} ko&apos;rish · 🪙 {data.todayCoins} tanga tushum.</>}
        {" "}Tasdiqlash/rad Telegram&apos;da (owner [✅/❌]) YOKI shu yerda ✅/❌ tugmasi bilan; tarkibni tahrirlash/rasm/o&apos;chirish/arxivla/uzayt/TOP ham shu yerda.
      </p>
      <button className="btn sm" onClick={() => setShowAdd((v) => !v)}>{showAdd ? "✖ Yopish" : "➕ Yangi e'lon qo'shish"}</button>
      {showAdd && (
        <div className="adm-form-grid" style={{ marginTop: 10, marginBottom: 10 }}>
          <div className="adm-field"><span className="adm-field-label">Sarlavha</span><input value={newAd.title} onChange={(e) => setNewAd({ ...newAd, title: e.target.value })} placeholder="Masalan: Velosiped sotiladi" /></div>
          <div className="adm-field"><span className="adm-field-label">Telefon</span><input value={newAd.phone} onChange={(e) => setNewAd({ ...newAd, phone: e.target.value })} placeholder="+998 90 123 45 67" /></div>
          <div className="adm-field">
            <span className="adm-field-label">Toifa</span>
            <select value={newAd.category} onChange={(e) => {
              const cat = CLASSIFIED_CATEGORIES.find((c) => c.id === e.target.value);
              setNewAd({ ...newAd, category: e.target.value, subtype: cat?.subtypes[0] ?? newAd.subtype });
            }}>
              {CLASSIFIED_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </div>
          <div className="adm-field">
            <span className="adm-field-label">Kichik toifa</span>
            <select value={newAd.subtype} onChange={(e) => setNewAd({ ...newAd, subtype: e.target.value })}>
              {(CLASSIFIED_CATEGORIES.find((c) => c.id === newAd.category)?.subtypes ?? []).map((st, i) => (
                <option key={st} value={st}>{CLASSIFIED_CATEGORIES.find((c) => c.id === newAd.category)?.subtypeLabels[i] ?? st}</option>
              ))}
            </select>
          </div>
          <div className="adm-field"><span className="adm-field-label">Narx (so&apos;m, bo&apos;sh = Kelishiladi)</span><input value={newAd.priceSom} onChange={(e) => setNewAd({ ...newAd, priceSom: e.target.value.replace(/\D/g, "") })} /></div>
          <div className="adm-field"><span className="adm-field-label">&nbsp;</span><button onClick={createAd}>➕ Qo&apos;shish</button></div>
        </div>
      )}
      <div className="adm-toolbar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Sarlavha, egasi yoki telefon…" />
        <select className="inp" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">Barcha toifa</option>
          {CLASSIFIED_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        <span className="adm-count">{rows.length} ta topildi</span>
      </div>
      <div className="seg" style={{ marginBottom: 12 }}>
        {["all", "pending", "active", "sold", "rejected", "archived", "expired"].map((s) => (
          <button key={s} className={"seg-btn" + (stFilter === s ? " active" : "")} onClick={() => setStFilter(s)}>
            {s === "all" ? "Barchasi" : ELON_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {msg && <div className="action-msg">{msg}</div>}
      {rows.map((r) => (
        <div key={r.id} className={"adm-card" + (openId === r.id ? " open" : "") + (r.reports > 0 ? " flagged" : "")}>
          <div className="adm-card-head" role="button" tabIndex={0} onClick={() => void toggle(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void toggle(r); } }}>
            <div className="adm-card-main">
              <div className="adm-card-title">
                {r.hasPhoto ? "📷" : "🚫📷"} {r.title}
                <span className={"badge " + (ELON_STATUS_BADGE[r.status] ?? "badge-muted")}>{ELON_STATUS_LABEL[r.status] ?? r.status}</span>
                {r.isTop && <span className="badge badge-warn">📌 TOP</span>}
                {r.reports > 0 && <span className="badge badge-bad">⚑ {r.reports} shikoyat</span>}
              </div>
              <div className="adm-card-sub">
                <span>{elonCatLabel(r.category)}</span>
                <span>{r.priceSom ? `${r.priceSom.toLocaleString("ru-RU")} so'm` : "Kelishiladi"}</span>
                {r.paidCoins > 0 && <span>🪙 {r.paidCoins}</span>}
                <span>👤 {r.owner.name} · {r.owner.phone ?? "telefon yo'q"} · {r.owner.activeAdsCount} faol e&apos;lon</span>
                {r.pendingMinutes != null && <span>⏳ {r.pendingMinutes} daq kutmoqda</span>}
                {(r.likeCount > 0 || r.dislikeCount > 0) && <span>👍 {r.likeCount} · 👎 {r.dislikeCount}</span>}
              </div>
            </div>
            <span className="adm-card-stats">👁 {r.viewCount} · 📞 {r.contactCount}</span>
            <div className="adm-card-actions" onClick={(e) => e.stopPropagation()}>
              {r.owner.phone && <a className="btn sm" href={telHref(r.owner.phone)}>📞 Egasiga</a>}
              {r.status === "pending" && (
                <>
                  <button className="btn sm" onClick={() => void act(() => adminApi.elonEdit(r.id, { status: "active" }), "✅ Tasdiqlandi")}>✅ Tasdiqlash</button>
                  <button className="btn sm" onClick={() => void act(() => adminApi.elonEdit(r.id, { status: "rejected" }), "❌ Rad etildi")}>❌ Rad etish</button>
                </>
              )}
              {(r.status === "active" || r.status === "sold") && (
                <>
                  <button className="btn sm" title={r.isTop ? `TOP muddati: ${r.topUntil ? new Date(r.topUntil).toLocaleString("ru-RU") : "—"} — bosib o'chiring` : "24 soatga TOP qilib qo'yish (ro'yxat boshida)"} onClick={() => void act(() => adminApi.elonSetTop(r.id, !r.isTop), r.isTop ? "☆ TOP olib tashlandi" : "📌 TOP berildi")}>
                    {r.isTop ? "📌 TOP (o'chirish)" : "☆ TOP berish"}
                  </button>
                  <button className="btn sm" onClick={() => void act(() => adminApi.elonExtend(r.id), "⏳ 30 kunga uzaytirildi")}>⏳ Uzayt</button>
                  <button className="btn sm" onClick={() => void act(() => adminApi.elonArchive(r.id), "🗄 Arxivlandi")}>🗄 Arxivla</button>
                </>
              )}
              {(r.status === "rejected" || r.status === "archived" || r.status === "expired") && (
                <button className="btn sm" title="30 kunga uzaytirib qayta faollashtiradi" onClick={() => void act(() => adminApi.elonExtend(r.id), "♻️ Qayta faollashtirildi")}>♻️ Qayta faollashtir</button>
              )}
              <button className="btn sm danger" title="Butunlay o'chirish (arxivlash emas)" onClick={() => void remove(r)}>🗑 O&apos;chirish</button>
            </div>
            <span className="adm-card-chev">{openId === r.id ? "▾" : "▸"}</span>
          </div>
          {openId === r.id && (
            <div className="adm-card-body">
              {draft && (
                <div style={{ marginBottom: 16 }}>
                <div className="adm-form-grid wide">
                  <div className="adm-field"><span className="adm-field-label">Sarlavha</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
                  <div className="adm-field"><span className="adm-field-label">Telefon</span><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
                  <div className="adm-field">
                    <span className="adm-field-label">Toifa</span>
                    <select value={draft.category} onChange={(e) => {
                      const cat = CLASSIFIED_CATEGORIES.find((c) => c.id === e.target.value);
                      setDraft({ ...draft, category: e.target.value, subtype: cat?.subtypes[0] ?? draft.subtype });
                    }}>
                      {CLASSIFIED_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                    </select>
                  </div>
                  <div className="adm-field">
                    <span className="adm-field-label">Kichik toifa</span>
                    <select value={draft.subtype} onChange={(e) => setDraft({ ...draft, subtype: e.target.value })}>
                      {(CLASSIFIED_CATEGORIES.find((c) => c.id === draft.category)?.subtypes ?? []).map((st, i) => (
                        <option key={st} value={st}>{CLASSIFIED_CATEGORIES.find((c) => c.id === draft.category)?.subtypeLabels[i] ?? st}</option>
                      ))}
                    </select>
                  </div>
                  <div className="adm-field"><span className="adm-field-label">Narx (so&apos;m, bo&apos;sh = Kelishiladi)</span><input value={draft.priceSom} onChange={(e) => setDraft({ ...draft, priceSom: e.target.value.replace(/\D/g, "") })} /></div>
                  <div className="adm-field">
                    <span className="adm-field-label">Rasm ({r.photoCount}/6)</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn sm" onClick={() => uploadPhoto(r.id)}>📷 Yuklash</button>
                      {r.photoCount > 0 && <button className="btn sm" onClick={() => void clearPhotos(r.id)}>🗑 Tozalash</button>}
                    </div>
                  </div>
                  <div className="adm-field">
                    <span className="adm-field-label">&nbsp;</span>
                    <button disabled={saving} onClick={() => void saveDraft(r.id)}>{saving ? "Saqlanmoqda…" : "💾 Saqlash"}</button>
                  </div>
                </div>
                <div className="adm-field" style={{ marginTop: 10 }}>
                  <span className="adm-field-label">Tavsif</span>
                  <textarea value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} rows={3} />
                </div>
                </div>
              )}
              {!drill ? "Yuklanmoqda…" : (
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <div>
                    <b>👁 Kim ko&apos;rdi ({drill.viewers.length})</b>
                    {drill.viewers.map((v) => <div key={v.tgId} className="muted" style={{ fontSize: 12, marginTop: 4 }}>{v.name} · {new Date(v.at).toLocaleString("ru-RU")}</div>)}
                    {!drill.viewers.length && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Hali hech kim ko&apos;rmagan</div>}
                  </div>
                  <div>
                    <b>📞 Kim murojaat qildi ({drill.contacts.length})</b>
                    {drill.contacts.map((c, i) => <div key={i} className="muted" style={{ fontSize: 12, marginTop: 4 }}>{c.kind === "call" ? "📞" : "✍️"} {c.name} · {new Date(c.at).toLocaleString("ru-RU")}</div>)}
                    {!drill.contacts.length && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Hali hech kim murojaat qilmagan</div>}
                  </div>
                  <div>
                    <b>👍👎 Reaksiyalar ({drill.reactions.length})</b>
                    {drill.reactions.map((rx) => (
                      <div key={rx.id} className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {rx.kind === "like" ? "👍" : "👎"} {rx.authorName} · {new Date(rx.at).toLocaleString("ru-RU")}
                        {rx.comment && <div style={{ marginLeft: 18, marginTop: 2 }}>&quot;{rx.comment}&quot;</div>}
                      </div>
                    ))}
                    {!drill.reactions.length && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Hali hech kim reaksiya bildirmagan</div>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {data && rows.length === 0 && <p className="muted">Mos e&apos;lon topilmadi.</p>}
    </section>
  );
}

function DriverMissionsView() {
  const [missions, setMissions] = useState<DriverMissionRow[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [reward, setReward] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => adminApi.driverMissions().then(setMissions).catch(() => setMissions([]));
  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setEditingId(null);
    setTitle("");
    setTarget("");
    setReward("");
  };
  const submit = async () => {
    const t = Number(target);
    const r = Number(reward);
    if (!title.trim() || t <= 0 || r <= 0) {
      setMsg("⚠️ Nom, safar soni va tanga to'g'ri bo'lsin");
      return;
    }
    const res = editingId
      ? await adminApi.editDriverMission(editingId, title.trim(), t, r).catch(() => ({ ok: false, reason: "net" }))
      : await adminApi.addDriverMission(title.trim(), t, r).catch(() => ({ ok: false, reason: "net" }));
    setMsg(res.ok ? (editingId ? "✅ Saqlandi" : "✅ Qo'shildi") : "❌ " + (res.reason ?? ""));
    if (res.ok) {
      reset();
      load();
    }
  };
  const startEdit = (m: DriverMissionRow) => {
    setEditingId(m.id);
    setTitle(m.title);
    setTarget(String(m.target));
    setReward(String(m.reward));
    setMsg("✏️ Tahrirlanmoqda…");
  };
  const del = async (m: DriverMissionRow) => {
    if (!window.confirm(`"${m.title}" o'chirilsinmi?`)) return;
    await adminApi.deleteDriverMission(m.id).catch(() => undefined);
    if (editingId === m.id) reset();
    setMsg("🗑 O'chirildi");
    load();
  };
  const toggle = async (id: string, active: boolean) => {
    await adminApi.toggleDriverMission(id, active).catch(() => undefined);
    load();
  };

  return (
    <>
      <section className="panel">
        <div className="panel-title">{editingId ? "✏️ Topshiriqni tahrirlash" : "🎯 Yangi haydovchi topshirig'i"}</div>
        <p className="muted" style={{ marginTop: 0 }}>Kunlik safar soniga bog&apos;liq. Mukofot = tanga, haydovchi kuniga bir marta oladi.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ flex: "2 1 160px", padding: "8px 10px" }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom: Bugun 15 safar" />
          <input style={{ flex: "1 1 80px", padding: "8px 10px" }} type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Safar" />
          <input style={{ flex: "1 1 80px", padding: "8px 10px" }} type="number" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="Tanga" />
          <button onClick={submit}>{editingId ? "💾 Saqlash" : "➕ Qo'shish"}</button>
          {editingId && <button onClick={reset}>✖️ Bekor</button>}
        </div>
        {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
      </section>

      <section className="panel">
        <div className="panel-title">🎯 Topshiriqlar</div>
        {missions === null ? (
          <div className="muted">Yuklanmoqda…</div>
        ) : missions.length === 0 ? (
          <div className="muted">Hozircha topshiriq yo&apos;q</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Holat</th>
                <th style={{ textAlign: "left" }}>Nom</th>
                <th>Safar</th>
                <th>Tanga</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {missions.map((m) => (
                <tr key={m.id}>
                  <td>{m.active ? "🟢" : "🔴"}</td>
                  <td>
                    {m.emoji} {m.title}
                  </td>
                  <td style={{ textAlign: "center" }}>{m.target}</td>
                  <td style={{ textAlign: "center" }}>{m.reward.toLocaleString("ru-RU")}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => startEdit(m)} title="Tahrirlash">✏️</button>{" "}
                    <button onClick={() => toggle(m.id, !m.active)} title={m.active ? "To'xtatish" : "Yoqish"}>{m.active ? "⏸" : "▶️"}</button>{" "}
                    <button onClick={() => del(m)} title="O'chirish">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

// ─── 📞 Obzvon: kas1067 driver call panel ────────────────────────────────────
const OBZVON_STATUS: { id: string; label: string }[] = [
  { id: "new", label: "🆕 Yangi" },
  { id: "called", label: "📞 Qo'ng'iroq qilindi" },
  { id: "no_answer", label: "🔕 Javob yo'q" },
  { id: "callback", label: "⏰ Qayta qo'ng'iroq" },
  { id: "interested", label: "👍 Qiziqdi" },
  { id: "joined", label: "✅ Qo'shildi" },
  { id: "refused", label: "❌ Rad etdi" },
  { id: "invalid", label: "🚫 Noto'g'ri raqam" },
];
const OBZVON_SEGMENTS: { id: string; label: string }[] = [
  { id: "", label: "Hammasi" },
  { id: "notinbot", label: "🎯 Botda yo'q" },
  { id: "inbot", label: "✅ Botda bor" },
  { id: "taking", label: "🟢 Buyurtma olyapti" },
  { id: "idle", label: "⚪ Olmayapti" },
];
function obzvonStatusLabel(id: string): string {
  return OBZVON_STATUS.find((s) => s.id === id)?.label ?? id;
}
function telHref(phone: string | null): string {
  return "tel:" + (phone ?? "").replace(/[^\d+]/g, "");
}

function ObzvonView() {
  const [rows, setRows] = useState<DriverCallRow[]>([]);
  const [stats, setStats] = useState<DriverCallStats | null>(null);
  const [segment, setSegment] = useState("notinbot");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminApi.calls({ segment: segment || undefined, status: status || undefined, search: search || undefined });
      setRows(res.rows);
      setStats(res.stats);
    } catch {
      /* keep old */
    } finally {
      setLoading(false);
    }
  };

  // reload when filters change (search is debounced)
  useEffect(() => {
    const t = setTimeout(() => { load(); }, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, status, search]);

  const doSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await adminApi.callsSync();
      setSyncMsg(`✅ ${r.total} haydovchi (yangi: ${r.created}, botda: ${r.inBot}, faol: ${r.taking})`);
      await load(true);
    } catch {
      setSyncMsg("❌ Yangilashda xato — kas bilan aloqa?");
    } finally {
      setSyncing(false);
    }
  };

  const setRowStatus = async (row: DriverCallRow, newStatus: string) => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r)));
    await adminApi.callUpdate(row.id, { status: newStatus });
    load(true); // refresh stats + drop row if a status filter now excludes it (order is status-independent)
  };
  const saveNote = async (row: DriverCallRow, note: string) => {
    if (note === (row.note ?? "")) return;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, note } : r)));
    await adminApi.callUpdate(row.id, { note });
  };

  const pct = stats && stats.total ? Math.round((stats.called / stats.total) * 100) : 0;

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>📞 Obzvon — kas1067 haydovchilar</h3>
        <button className="btn" onClick={doSync} disabled={syncing}>{syncing ? "⏳ Yangilanmoqda…" : "🔄 Bazani yangilash"}</button>
        {syncMsg && <span className="muted" style={{ fontSize: 12 }}>{syncMsg}</span>}
      </div>
      <p className="muted" style={{ margin: "6px 0 10px", fontSize: 12 }}>
        Har haydovchini birma-bir qo'ng'iroq qiling. <b>Botda</b> — bizning botga ulanganmi; <b>🟢 olyapti</b> — kas'da faol (buyurtma oladi). Holat va izoh saqlanadi — sessiya yo'qolmaydi.
      </p>

      {stats && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, marginBottom: 6 }}>
            <span>Jami: <b>{stats.total}</b></span>
            <span>🎯 Botda yo'q: <b>{stats.notInBot}</b></span>
            <span>✅ Botda: <b>{stats.inBot}</b></span>
            <span>🟢 Faol: <b>{stats.taking}</b></span>
            <span>📞 Qilindi: <b>{stats.called}</b></span>
            <span>🆕 Qoldi: <b>{stats.remaining}</b></span>
            <span>✅ Qo'shildi: <b>{stats.joined}</b></span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#22c55e,#16a34a)" }} />
          </div>
          {stats.lastSyncAt && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Oxirgi yangilash: {new Date(stats.lastSyncAt).toLocaleString("ru-RU")}</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {OBZVON_SEGMENTS.map((s) => (
          <button key={s.id || "all"} className={"btn" + (segment === s.id ? " btn-primary" : "")} onClick={() => setSegment(s.id)} style={{ fontSize: 12, padding: "4px 10px" }}>{s.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input placeholder="🔎 Ism / mashina / telefon" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: "1 1 200px", minWidth: 160 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Barcha holatlar</option>
          {OBZVON_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : rows.length === 0 ? (
        <p className="muted">{stats && stats.total === 0 ? "Baza bo'sh — «Bazani yangilash» ni bosing." : "Bu filtrga mos haydovchi yo'q."}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => <ObzvonCard key={r.id} row={r} onStatus={setRowStatus} onNote={saveNote} />)}
        </div>
      )}
    </section>
  );
}

function ObzvonCard({ row, onStatus, onNote }: { row: DriverCallRow; onStatus: (r: DriverCallRow, s: string) => void; onNote: (r: DriverCallRow, note: string) => void }) {
  const [note, setNote] = useState(row.note ?? "");
  useEffect(() => { setNote(row.note ?? ""); }, [row.id, row.note]);
  return (
    <div style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <b>{row.fullName}</b> <span className="muted" style={{ fontSize: 12 }}>#{row.kasDriverId}</span>
          {row.carNumber && <span style={{ marginLeft: 6 }}>· {row.carNumber}{row.carModel ? ` (${row.carModel})` : ""}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge on={row.inBot} yes="✅ Botda" no="⛔ Botda yo'q" />
          <Badge on={row.takingOrders} yes="🟢 Olyapti" no="⚪ Olmayapti" />
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,.08)" }}>{obzvonStatusLabel(row.status)}</span>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: "4px 0 8px", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {row.phone && <span>📞 {row.phone}</span>}
        <span>🚕 {row.trips} safar</span>
        {row.rating > 0 && <span>⭐ {row.rating.toFixed(1)}</span>}
        <span>💰 {formatNumber(row.balance)}{row.debt > 0 ? ` · qarz ${formatNumber(row.debt)}` : ""}</span>
        {row.callCount > 0 && <span>☎️ {row.callCount}× {row.calledAt ? new Date(row.calledAt).toLocaleDateString("ru-RU") : ""}</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a
          className="btn btn-primary"
          href={telHref(row.phone)}
          style={{ pointerEvents: row.phone ? "auto" : "none", opacity: row.phone ? 1 : 0.5, textDecoration: "none" }}
        >📞 Qo'ng'iroq</a>
        <select value={row.status} onChange={(e) => onStatus(row, e.target.value)}>
          {OBZVON_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input
          placeholder="izoh…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onNote(row, note)}
          style={{ flex: "1 1 160px", minWidth: 120 }}
        />
      </div>
    </div>
  );
}

function Badge({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: on ? "rgba(34,197,94,.18)" : "rgba(148,163,184,.15)", color: on ? "#4ade80" : "#94a3b8" }}>
      {on ? yes : no}
    </span>
  );
}

function RecruitsView() {
  const [rows, setRows] = useState<{ driverId: number; fullName: string; scanned: number; joined: number; rode: number; earned: number }[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ driverId: number; fullName: string; clients: { name: string; phone: string; status: "scanned" | "joined" | "rode"; rides: number }[]; earned: { start: number; share: number; revshare: number; legacy: number; total: number } } | null>(null);
  useEffect(() => { adminApi.recruits().then(setRows).catch(() => setRows([])); }, []);
  const toggle = async (id: number) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    setDetail(await adminApi.recruitDetail(id).catch(() => null));
  };
  return (
    <section className="card">
      <h3>🚖 Haydovchi QR nazorati</h3>
      <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>
        Kim nechta skaner qildirgan → kimlar raqam ulagan → kimlar safar qilgan, va har haydovchi qancha topgan. «Ko'rish» — mijozlar ro'yxati + pul taqsimoti (START / raqam / revshare).
      </p>
      {!rows ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Hali QR orqali recruit yo'q.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Haydovchi</th><th className="num">Skaner</th><th className="num">Ulandi</th><th className="num">Safar</th><th className="num">🪙 Topdi</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.driverId}>
                <tr>
                  <td>{r.fullName} <span className="muted">#{r.driverId}</span></td>
                  <td className="num">{r.scanned}</td>
                  <td className="num">{r.joined}</td>
                  <td className="num">{r.rode}</td>
                  <td className="num">{formatNumber(r.earned)}</td>
                  <td><button className="btn" onClick={() => toggle(r.driverId)}>{openId === r.driverId ? "Yopish" : "Ko'rish"}</button></td>
                </tr>
                {openId === r.driverId && (
                  <tr>
                    <td colSpan={6}>
                      {!detail ? (
                        <span className="muted">Yuklanmoqda…</span>
                      ) : (
                        <div style={{ padding: "4px 0 8px" }}>
                          <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>
                            💰 START: {formatNumber(detail.earned.start)} · raqam: {formatNumber(detail.earned.share)} · revshare: {formatNumber(detail.earned.revshare)}
                            {detail.earned.legacy ? ` · eski: ${formatNumber(detail.earned.legacy)}` : ""} · jami: <b>{formatNumber(detail.earned.total)}</b>
                          </p>
                          {detail.clients.length === 0 ? (
                            <span className="muted">Mijoz yo'q.</span>
                          ) : (
                            <table>
                              <thead><tr><th>Mijoz</th><th>Telefon</th><th>Holat</th><th className="num">Safar</th></tr></thead>
                              <tbody>
                                {detail.clients.map((c, i) => (
                                  <tr key={i}>
                                    <td>{c.name}</td>
                                    <td>{c.phone}</td>
                                    <td>{c.status === "rode" ? "🚕 safar qildi" : c.status === "joined" ? "📱 ulandi" : "👀 skaner"}</td>
                                    <td className="num">{c.rides}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BoshqaruvView() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [msg, setMsg] = useState("");
  const [wds, setWds] = useState<AdminWithdrawalRow[] | null>(null);
  const [codePhone, setCodePhone] = useState("");
  const [codeResult, setCodeResult] = useState<{ phone: string; code: string } | null>(null);

  const search = async () => {
    setMsg("⏳ qidirilmoqda…");
    try {
      setUsers(await adminApi.searchUsers(q));
      setMsg("");
    } catch {
      setMsg("❌ qidiruv xatosi");
    }
  };
  useEffect(() => {
    adminApi.withdrawals(30).then(setWds).catch(() => undefined);
  }, []);

  const tgId = users?.find((u) => u.telegram)?.telegram?.id ?? null;
  const done = async (m: string) => {
    setMsg(m);
    await search();
  };
  const relink = async (memberId: number) => {
    if (!tgId) {
      setMsg("⚠️ Bu odamning hech qaysi akkauntiga Telegram ulanmagan");
      return;
    }
    const r = await adminApi.relinkUser(tgId, memberId).catch(() => ({ ok: false, reason: "net" }));
    await done(r.ok ? "✅ Telegram qayta ulandi" : "❌ " + (r.reason ?? "xato"));
  };
  const unlink = async (id: string) => {
    const r = await adminApi.unlinkUser(id).catch(() => ({ ok: false }));
    await done(r.ok ? "✅ Uzildi (foydalanuvchi qayta /start qila oladi)" : "❌ xato");
  };
  const genCode = async (phone: string) => {
    setMsg("⏳ kod yaratilmoqda…");
    const r = await adminApi.linkCode(phone).catch(() => ({ ok: false, message: "net" }) as { ok: boolean; code?: string; message?: string });
    if (r.ok && r.code) {
      setCodeResult({ phone, code: r.code });
      setMsg("");
    } else setMsg("❌ " + (r.message ?? "xato"));
  };
  const makeCode = () => {
    const phone = codePhone.trim();
    if (!/^\+?\d[\d\s\-()]{8,}$/.test(phone)) {
      setMsg("❌ Raqam noto'g'ri (masalan: +998901234567)");
      return;
    }
    genCode(phone);
  };
  const adjust = async (memberId: number) => {
    const a = window.prompt("Tanga (+ berish / − ayirish):");
    if (a === null) return;
    const reason = window.prompt("Sabab:") ?? "admin";
    // grant TANGA to THIS exact account (by id) — not by phone (a phone can have client+driver)
    const r = await adminApi.grantMemberCoins(memberId, Number(a), reason).catch(() => ({ ok: false, message: "net" }) as { ok: boolean; message?: string });
    await done(r.ok ? "✅ " + (r.message ?? "bajarildi") : "❌ " + (r.message ?? ""));
  };
  // 💼 move this account's OWN tanga → their OWN kas balance, with NO daily cap (admin bypass).
  const moveBal = async (memberId: number) => {
    const a = window.prompt("Balansga necha tanga?");
    if (a === null) return;
    const r = await adminApi.moveToBalance(memberId, Number(a)).catch(() => ({ ok: false, message: "net" }) as { ok: boolean; message?: string });
    await done(r.ok ? (r.message ?? "✅ bajarildi") : "❌ " + (r.message ?? ""));
  };

  return (
    <>
      <section className="panel">
        <div className="panel-title">🔑 Boshqa raqam uchun login kod</div>
        <div className="muted" style={{ marginBottom: 10, lineHeight: 1.5 }}>
          Telegrami <b>boshqa</b> raqamda bo'lgan odam o'z 1067 raqami bilan kirmoqchi bo'lsa — raqamini yozing, kod yarating va unga ayting. U botda «📱 Boshqa raqam» tugmasi orqali kiritadi. Kod <b>1 soat</b> amal qiladi, bir marta ishlaydi.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, padding: "8px 10px" }}
            value={codePhone}
            onChange={(e) => setCodePhone(e.target.value)}
            placeholder="+998901234567"
            onKeyDown={(e) => e.key === "Enter" && makeCode()}
          />
          <button onClick={makeCode}>🔑 Kod yaratish</button>
        </div>
        {codeResult && (
          <div style={{ marginTop: 12, textAlign: "center", padding: 14, border: "1px solid var(--line, #2a3242)", borderRadius: 12 }}>
            <div className="muted">{codeResult.phone} uchun kod:</div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 12, margin: "6px 0" }}>{codeResult.code}</div>
            <div className="muted">1 soat amal qiladi · odamga ayting</div>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">👑 Foydalanuvchi boshqaruvi</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input style={{ flex: 1, padding: "8px 10px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Raqam yoki ism…" onKeyDown={(e) => e.key === "Enter" && search()} />
          <button onClick={search}>🔎 Qidirish</button>
        </div>
        {msg && <div className="muted" style={{ marginBottom: 8 }}>{msg}</div>}
        {users && users.length === 0 && <div className="muted">Topilmadi.</div>}
        {users?.map((u) => (
          <div key={u.id} style={{ borderTop: "1px solid var(--line, #2a3242)", padding: "10px 0" }}>
            <div>
              <b>{u.fullName}</b> · {u.type === "driver" ? "🚗 Haydovchi" : "🏅 Mijoz"} · {u.phone ?? "—"}
            </div>
            <div className="muted">
              id={u.id} · kasId={u.kasId} · 🪙 {u.coins} tanga · kas-ball {u.points} · {u.trips} safar · {u.tier}
            </div>
            <div className="muted">{u.telegram ? `📱 ${u.telegram.id}${u.telegram.username ? " @" + u.telegram.username : ""}${u.telegram.name ? " (" + u.telegram.name + ")" : ""}` : "📱 Telegram ulanmagan"}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              <button onClick={() => relink(u.id)}>📱 Telegram'ni bunga ulash</button>
              {u.telegram && <button onClick={() => unlink(u.telegram!.id)}>🔌 Uzish</button>}
              {u.phone && <button onClick={() => genCode(u.phone!)}>🔑 Kod</button>}
              <button onClick={() => adjust(u.id)}>🪙 Tanga ±</button>
              <button onClick={() => moveBal(u.id)}>💼 → Balans</button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-title">💸 Oxirgi yechishlar (cashout)</div>
        {!wds && <div className="muted">⏳</div>}
        {wds?.map((w) => (
          <div key={w.id} className="muted" style={{ padding: "3px 0" }}>
            {w.kasApplied ? "✅" : "⏳"} <b>{w.amount.toLocaleString("ru-RU")}</b> — {w.member?.name ?? "?"} ({w.member?.phone ?? "—"}) · {new Date(w.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </div>
        ))}
      </section>
    </>
  );
}

function BotUsersTab() {
  const [data, setData] = useState<AdminBotUsersResponse | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    adminApi.botUsers().then(setData).catch(() => undefined);
  }, []);
  return <BotUsersView data={data} query={query} setQuery={setQuery} />;
}

function MembersView({ type, stats, members, query, setQuery }: { type: "driver" | "client"; stats: AdminStats | null; members: AdminMemberRow[]; query: string; setQuery: (s: string) => void }) {
  const isDriver = type === "driver";
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((d) => [d.fullName, d.carNumber, d.phone, d.kasId].some((v) => v?.toLowerCase().includes(q)));
  }, [members, query]);
  if (!stats) return <div className="screen center"><div className="spinner" /></div>;
  return (
    <>
      <section className="cards">
        <Card icon="👥" label={isDriver ? "Haydovchilar" : "Mijozlar"} value={formatNumber(stats.totalMembers)} sub={`${stats.activeMembers} faol`} />
        <Card icon="🔗" label="Bog'langan" value={formatNumber(stats.linkedMembers)} sub="Telegram" />
        <Card icon="💰" label={`Jami ${stats.metricLabel.toLowerCase()}`} value={`${formatNumber(stats.pointsSum)} so'm`} accent />
        <Card icon="🚕" label="Safarlar" value={formatNumber(stats.tripsSum)} />
      </section>
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">{isDriver ? "Haydovchilar" : "Mijozlar"} ({formatNumber(filtered.length)})</div>
          <input className="search" placeholder="🔍 Ism, raqam, telefon…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>{isDriver ? "Haydovchi" : "Mijoz"}</th><th>Daraja</th><th className="num">{stats.metricLabel}</th><th className="num">Safar</th>{isDriver && <th className="num">Reyting</th>}<th>TG</th></tr></thead>
            <tbody>
              {filtered.slice(0, 500).map((d, i) => (
                <tr key={d.id}>
                  <td className="muted">{i + 1}</td>
                  <td><div className="td-name">{d.fullName}</div><div className="td-sub muted">{(isDriver ? d.carNumber : null) ?? d.phone ?? "—"}</div></td>
                  <td><span className="lvl">{d.level.emoji} {d.level.name}</span></td>
                  <td className="num strong">{formatNumber(d.points)}</td>
                  <td className="num">{formatNumber(d.trips)}</td>
                  {isDriver && <td className="num">{d.rating.toFixed(2)}</td>}
                  <td>{d.linked ? <span className="dot ok" /> : <span className="dot" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <div className="muted" style={{ padding: 10, fontSize: 12 }}>Birinchi 500 ko'rsatildi.</div>}
        </div>
      </section>
    </>
  );
}

function BotUsersView({ data, query, setQuery }: { data: AdminBotUsersResponse | null; query: string; setQuery: (s: string) => void }) {
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let list = data.users;
    if (onlyUnlinked) list = list.filter((u) => !u.linked);
    if (!q) return list;
    return list.filter((u) => [u.name, u.username, u.phone, u.memberName].some((v) => v?.toLowerCase().includes(q)));
  }, [data, query, onlyUnlinked]);
  if (!data) return <div className="screen center"><div className="spinner" /></div>;
  const unlinkedCount = data.total - data.linked;
  const onlineCount = data.users.filter((u) => u.online).length;
  return (
    <>
      <section className="cards">
        <Card icon="👥" label="Botga kirganlar" value={formatNumber(data.total)} accent />
        <Card icon="🟢" label="Hozir online" value={formatNumber(onlineCount)} sub="5 daq ichida faol" />
        <Card icon="🔗" label="Bog'langan" value={formatNumber(data.linked)} sub="profil bilan" />
        <Card icon="🆕" label="Bugun yangi" value={formatNumber(data.newToday)} sub={`${formatNumber(unlinkedCount)} bog'lanmagan`} />
      </section>
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">Bot foydalanuvchilari ({formatNumber(filtered.length)})</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className={"btn-sm" + (onlyUnlinked ? " active" : "")}
              onClick={() => setOnlyUnlinked((v) => !v)}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: onlyUnlinked ? "var(--accent)" : "transparent", color: onlyUnlinked ? "#fff" : "inherit", cursor: "pointer" }}
            >
              Faqat bog'lanmaganlar
            </button>
            <input className="search" placeholder="🔍 Ism, username, telefon…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Foydalanuvchi</th><th>Telefon</th><th>Profil</th><th>Tur</th><th>Qo'shilgan</th><th>Oxirgi faollik</th></tr></thead>
            <tbody>
              {filtered.slice(0, 500).map((u, i) => (
                <tr key={u.telegramId} style={!u.linked ? { background: "rgba(255,80,80,0.04)" } : undefined}>
                  <td className="muted">{i + 1}</td>
                  <td><div className="td-name">{u.name} {u.isAdmin && <span className="lvl">admin</span>}</div><div className="td-sub muted">{u.username ? `@${u.username}` : u.telegramId}</div></td>
                  <td>{u.phone ?? "—"}</td>
                  <td>{u.linked ? <span className="td-name">{u.memberName}</span> : <span className="muted">— bog'lanmagan</span>}</td>
                  <td>{u.memberType ? <span className="lvl">{u.memberType === "driver" ? "🚗 Haydovchi" : "🏅 Mijoz"}</span> : "—"}</td>
                  <td className="muted">{fmtTime(u.joinedAt)}</td>
                  <td className="muted">
                    {u.online && <span className="dot ok" style={{ marginRight: 6 }} title="Hozir online (5 daq ichida)" />}
                    {u.seenReliable ? fmtTime(u.lastActive) : <span title="Aniq faollik hali yozilmagan — taxminiy (foydalanuvchi keyingi bosishida aniqlashadi)">~{fmtTime(u.lastActive)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <div className="muted" style={{ padding: 10, fontSize: 12 }}>Birinchi 500 ko'rsatildi.</div>}
        </div>
      </section>
    </>
  );
}

function Card({ icon, label, value, sub, accent }: { icon: string; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={"card" + (accent ? " accent" : "")}>
      <div className="card-icon">{icon}</div>
      <div className="card-value">{value}</div>
      <div className="card-label muted">{label}{sub ? ` · ${sub}` : ""}</div>
    </div>
  );
}

// ── 💓 M1: operations pulse — today vs same weekday last week + live alerts ──
function PulseView() {
  const [p, setP] = useState<Awaited<ReturnType<typeof adminApi.pulse>> | null>(null);
  const [err, setErr] = useState(false);
  const load = () => adminApi.pulse().then((x) => { setP(x); setErr(false); }).catch(() => setErr(true));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (err && !p)
    return <section className="panel"><div className="muted" style={{ padding: 12 }}>⚠️ Puls yuklanmadi · <button className="btn sm" onClick={load}>qayta urinish</button></div></section>;
  if (!p) return <section className="panel"><div className="muted" style={{ padding: 12 }}>Yuklanmoqda…</div></section>;
  const delta = (m: typeof p.metrics[number]) => {
    if (!m.prevAvailable) return { txt: "📈 ma'lumot to'planmoqda (~7 kun)", cls: "muted" };
    const d = m.today - m.prev;
    if (d === 0) return { txt: "= o'tgan hafta bilan bir xil", cls: "muted" };
    const up = d > 0;
    const good = (up && m.goodWhen === "up") || (!up && m.goodWhen === "down");
    return { txt: `${up ? "▲" : "▼"} ${Math.abs(d)}${m.unit === "pct" ? "%" : ""} (o'tgan hafta: ${m.prev}${m.unit === "pct" ? "%" : ""})`, cls: good ? "good" : "bad" };
  };
  return (
    <>
      {p.alerts.length > 0 && (
        <section className="panel">
          <div className="panel-title">🔔 Ogohlantirishlar</div>
          {p.alerts.map((a, i) => (
            <div key={i} className={"alert " + (a.level === "red" ? "alert-red" : "alert-amber")}>{a.level === "red" ? "🔴" : "🟠"} {a.text}</div>
          ))}
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">💓 Bugungi puls — {p.weekday}</div>
          <span className="muted" style={{ fontSize: 12 }}>o'tgan hafta shu kun, shu soatgacha · 30s</span>
        </div>
        <div className="cards">
          {p.metrics.map((m) => {
            const d = delta(m);
            return (
              <div key={m.label} className="card">
                <div className="card-value">{m.today}{m.unit === "pct" ? "%" : ""}</div>
                <div className="card-label muted">{m.label}</div>
                <div className={"delta " + d.cls}>{d.txt}</div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="cards">
        <Card icon="🚖" label="Hozir faol" value={String(p.activeNow)} sub={`${p.unassigned} haydovchisiz`} accent={p.unassigned > 0} />
        <Card icon="🪙" label="Bugun emissiya" value={formatNumber(p.emissionToday)} sub={`tavan ${formatNumber(p.emissionCapDay)}`} />
      </section>
      {p.trackcta && (
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">🛡 Oila kuzatuvi voronkasi</div>
            <span className="muted" style={{ fontSize: 12 }}>ulashish → kirish → birinchi safar</span>
          </div>
          <div className="cards">
            <div className="card">
              <div className="card-value">{p.trackcta.shares7d}</div>
              <div className="card-label muted">Ulashish (7 kun)</div>
              <div className="delta muted">jami {p.trackcta.sharesTotal}</div>
            </div>
            <div className="card">
              <div className="card-value">{p.trackcta.joins7d}</div>
              <div className="card-label muted">Havoladan kirish (7 kun)</div>
              <div className="delta muted">jami {p.trackcta.joinsTotal}</div>
            </div>
            <div className="card">
              <div className="card-value">{p.trackcta.activatedTotal}</div>
              <div className="card-label muted">Birinchi safar qildi</div>
              <div className="delta muted">
                {p.trackcta.sharesTotal > 0 ? `K ≈ ${(p.trackcta.activatedTotal / p.trackcta.sharesTotal).toFixed(2)}` : "hali ulashish yo'q"}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

// ── 💰 M2: finance center — real money figures only (liability, cashout, GMV, B2B) ──
function FinanceView() {
  const [f, setF] = useState<Awaited<ReturnType<typeof adminApi.finance>> | null>(null);
  const [err, setErr] = useState(false);
  const load = () => adminApi.finance().then((x) => { setF(x); setErr(false); }).catch(() => setErr(true));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (err && !f)
    return <section className="panel"><div className="muted" style={{ padding: 12 }}>⚠️ Moliya yuklanmadi · <button className="btn sm" onClick={load}>qayta urinish</button></div></section>;
  if (!f) return <section className="panel"><div className="muted" style={{ padding: 12 }}>Yuklanmoqda…</div></section>;
  const max = Math.max(1, ...f.liabilityByKind.map((k) => Math.abs(k.total)));
  return (
    <>
      <section className="cards">
        <Card icon="🪙" label="Tanga majburiyati" value={formatNumber(f.coinLiability)} sub={f.daysToCoverLiability != null ? `~${f.daysToCoverLiability} kun byudjet` : "byudjet yo'q"} accent />
        <Card icon="💸" label="Bugun yechildi" value={formatNumber(f.withdrawnToday)} sub={`jami ${formatNumber(f.withdrawnTotal)}`} />
        <Card icon="🛡" label="Withdraw qoldi" value={formatNumber(f.withdrawBudget.remaining)} sub={`${f.withdrawBudget.rides} safardan`} />
        <Card icon="🚕" label="GMV bugun" value={formatNumber(f.gmvToday)} sub={`hafta ${formatNumber(f.gmvWeek)}`} />
      </section>
      <section className="panel">
        <div className="panel-title">🪙 Majburiyat manbalari (eng katta)</div>
        {f.liabilityByKind.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>Ma'lumot yo'q</div>
        ) : (
          <div className="chart">
            {f.liabilityByKind.map((k) => (
              <div key={k.kind} className="chart-row">
                <div className="chart-label">{k.kind} <span className="muted">×{k.count}</span></div>
                <div className="chart-bar"><span style={{ width: `${(Math.abs(k.total) / max) * 100}%`, background: "var(--green)" }} /></div>
                <div className="chart-val">{formatNumber(k.total)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      {f.corpBalances.length > 0 && (
        <section className="panel">
          <div className="panel-title">🏢 B2B prepaid balanslar — alohida ledger (jami {formatNumber(f.corpTotal)})</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Korxona</th><th className="num">Balans</th><th className="num">Xodim</th></tr></thead>
              <tbody>{f.corpBalances.map((c, i) => (<tr key={i}><td className="td-name">{c.name}</td><td className="num">{formatNumber(c.balance)}</td><td className="num">{c.employees}</td></tr>))}</tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-title">⚠️ Withdraw navbati — kas'ga yetib bormaganlar ({f.withdrawQueue.length})</div>
        {f.withdrawQueue.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>✅ Hammasi yetib borgan</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mijoz</th><th className="num">So'm</th><th className="num">Yosh</th><th>Sabab</th></tr></thead>
              <tbody>{f.withdrawQueue.map((w, i) => (<tr key={i} className="row-warn"><td className="td-name">{w.member}</td><td className="num">{formatNumber(w.amount)}</td><td className="num">{w.ageMin}m</td><td className="muted">{w.message ?? "—"}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ── 📈 A4: north-star + driver distribution (tier gates come from THIS data) ──
function AnalyticsView() {
  const [ns, setNs] = useState<Awaited<ReturnType<typeof adminApi.northstar>> | null>(null);
  const [da, setDa] = useState<Awaited<ReturnType<typeof adminApi.driverAnalytics>> | null>(null);
  const [fn, setFn] = useState<Awaited<ReturnType<typeof adminApi.growthFunnel>> | null>(null);
  const [rc, setRc] = useState<Awaited<ReturnType<typeof adminApi.retentionCohorts>> | null>(null);
  useEffect(() => {
    adminApi.northstar().then(setNs).catch(() => undefined);
    adminApi.driverAnalytics().then(setDa).catch(() => undefined);
    adminApi.growthFunnel().then(setFn).catch(() => undefined);
    adminApi.retentionCohorts().then(setRc).catch(() => undefined);
  }, []);
  const delta = ns ? ns.weekCompleted - ns.prevWeekCompleted : 0;
  const maxBar = da ? Math.max(1, ...da.histogram.map((h) => h.drivers)) : 1;
  return (
    <div>
      {fn && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="card-title">🎯 Koson'ni egalash funneli — 7 kun</div>
          <div className="grid">
            <div className="card accent">
              <div className="card-title">🆕 Yangi mijoz</div>
              <div className="card-value">{formatNumber(fn.newRiders7d)}</div>
              <div className={fn.newRiders7d >= fn.newRidersPrev7d ? "lvl" : "lvl warn"}>
                {fn.newRiders7d >= fn.newRidersPrev7d ? "▲" : "▼"} o&apos;tgan hafta {formatNumber(fn.newRidersPrev7d)}
              </div>
            </div>
            <div className="card">
              <div className="card-title">🔁 Qaytish (2-safar)</div>
              <div className="card-value">{fn.retentionPct}%</div>
              <div className="muted">{formatNumber(fn.retentionCohort)} mijozdan (8–30 kun)</div>
            </div>
            <div className="card">
              <div className="card-title">💸 CAC — har yangi mijoz</div>
              <div className="card-value">{formatNumber(fn.cacTanga)}</div>
              <div className="muted">bonus/mijoz · 7 kun jami {formatNumber(fn.acqEmission7d)}</div>
            </div>
            <div className="card">
              <div className="card-title">🔥 Viral ulush</div>
              <div className="card-value">{fn.viralPct}%</div>
              <div className="muted">havola/QR orqali kelgan</div>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>Yangi mijoz = botda ILK safar (eski 1067 mijozi ham). Qaytish past bo&apos;lsa — 2-safar tajribasi; CAC yuqori bo&apos;lsa — bonusni pasaytiring; viral past bo&apos;lsa — QR/referalni kuchaytiring.</p>
        </div>
      )}
      {rc && rc.cohorts.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="card-title">📊 Qaytish kohortalari — D1 / D7 / D30 (haftalik, ilk safar bo&apos;yicha)</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr className="muted" style={{ textAlign: "left" }}>
                <th style={{ padding: "4px 6px" }}>Hafta</th>
                <th style={{ padding: "4px 6px" }}>Yangi</th>
                <th style={{ padding: "4px 6px" }}>D1</th>
                <th style={{ padding: "4px 6px" }}>D7</th>
                <th style={{ padding: "4px 6px" }}>D30</th>
              </tr>
            </thead>
            <tbody>
              {rc.cohorts.map((c) => (
                <tr key={c.cohort} style={{ borderTop: "1px solid #26304a" }}>
                  <td style={{ padding: "4px 6px" }}>{c.cohort}</td>
                  <td style={{ padding: "4px 6px" }}>{c.users}</td>
                  <td style={{ padding: "4px 6px" }}>{c.users ? Math.round((c.d1 / c.users) * 100) : 0}%</td>
                  <td style={{ padding: "4px 6px" }}>{c.users ? Math.round((c.d7 / c.users) * 100) : 0}%</td>
                  <td style={{ padding: "4px 6px" }}>{c.users ? Math.round((c.d30 / c.users) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>DN = ilk safardan keyin N kun ichida YANA safar qilganlar ulushi (kumulyativ). Phase 1-3 o&apos;zgarishlari shu jadvalga qarab baholanadi.</p>
        </div>
      )}
      <div className="grid">
        <div className="card accent">
          <div className="card-title">🌟 Haftalik yakunlangan safarlar</div>
          <div className="card-value">{ns ? formatNumber(ns.weekCompleted) : "…"}</div>
          {ns && (ns.weekDays < 7 ? (
            <div className="muted">📈 {ns.weekDays}/7 kun yig'ilmoqda</div>
          ) : (
            <div className={delta >= 0 ? "lvl" : "lvl warn"}>
              {delta >= 0 ? "▲" : "▼"} {formatNumber(Math.abs(delta))} vs o'tgan hafta
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">🤖 Bot ulushi</div>
          <div className="card-value">{ns ? `${ns.botShare}%` : "…"}</div>
          <div className="muted">safarlarning bot orqali qismi</div>
        </div>
        <div className="card">
          <div className="card-title">👥 Haftalik faol bot-mijozlar</div>
          <div className="card-value">{ns ? formatNumber(ns.weeklyActiveRiders) : "…"}</div>
        </div>
        <div className="card">
          <div className="card-title">🪙 Tanga majburiyati</div>
          <div className="card-value">{ns ? formatNumber(ns.coinLiability) : "…"}</div>
          <div className="muted">jami va'da qilingan tanga</div>
        </div>
      </div>

      <div className="panel">
        <div className="card-title">🚗 Haydovchi taqsimoti — oxirgi {da?.windowDays ?? 7} kun ({da?.activeDrivers ?? "…"} faol)</div>
        {da?.histogram.map((h) => (
          <div key={h.bucket} style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0" }}>
            <span style={{ width: 52, fontSize: 12 }} className="muted">{h.bucket}</span>
            <div className="chart-bar" style={{ flex: 1 }}>
              <span style={{ display: "block", height: "100%", width: `${(h.drivers / maxBar) * 100}%`, background: "var(--accent)", borderRadius: 999 }} />
            </div>
            <b style={{ width: 36, textAlign: "right" }}>{h.drivers}</b>
          </div>
        ))}
        {da && (
          <p className="muted" style={{ marginTop: 10 }}>
            Percentil: p50={da.percentiles.p50} · p75={da.percentiles.p75} · p90={da.percentiles.p90} safar/hafta →{" "}
            <b>tavsiya tier chegaralari: Kumush ≥{da.tierSuggestion.kumush} · Oltin ≥{da.tierSuggestion.oltin} · Olmos ≥{da.tierSuggestion.olmos}</b>
          </p>
        )}
      </div>

      <div className="panel">
        <div className="card-title">🏆 Top-20 haydovchi (7 kun)</div>
        <table>
          <thead><tr><th>#</th><th>Mashina</th><th>Model</th><th>Safar</th></tr></thead>
          <tbody>
            {da?.top.map((t, i) => (
              <tr key={t.carNumber}><td>{i + 1}</td><td><b>{t.carNumber}</b></td><td>{t.carModel}</td><td>{t.rides}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LoginScreen({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const pwd = password.trim();
    if (!pwd) return;
    setBusy(true);
    setErr(null);
    setAdminToken(pwd);
    try {
      await adminApi.health(); // verifies the credential against the backend
      onAuthed();
    } catch (e2) {
      clearAdminToken();
      const msg = e2 instanceof Error ? e2.message : String(e2);
      setErr(msg === "forbidden" ? "Noto'g'ri parol. Qayta urinib ko'ring." : "Serverga ulanib bo'lmadi. Internetni tekshiring.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">🚕</div>
        <h1 className="login-title">BirJoy · Command</h1>
        <p className="login-sub muted">Boshqaruv markaziga kirish</p>

        <label className="login-label">Parol</label>
        <div className="login-input-row">
          <input
            className="login-input"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin parolingizni kiriting"
            autoFocus
            autoComplete="current-password"
          />
          <button type="button" className="login-eye" onClick={() => setShow((s) => !s)} tabIndex={-1} title={show ? "Yashirish" : "Ko'rsatish"}>
            {show ? "🙈" : "👁"}
          </button>
        </div>

        {err && <div className="login-err">⛔ {err}</div>}

        <button className="login-btn" type="submit" disabled={busy || !password.trim()}>
          {busy ? "Tekshirilmoqda…" : "Kirish →"}
        </button>

        <p className="login-foot muted">Faqat administratorlar uchun · BirJoy</p>
      </form>
    </div>
  );
}

// ─── 💸 yechishlar (dedicated tab) ─────────────────────────────────────────
function YechishlarView() {
  const [rows, setRows] = useState<AdminWithdrawalTabRow[] | null>(null);
  const [q, setQ] = useState("");
  const load = () => adminApi.withdrawalsTab(200).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.memberName, r.phone, r.type].some((v) => v?.toLowerCase().includes(s)));
  }, [rows, q]);

  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const pending = rows.filter((r) => !r.kasApplied).length;

  const exportCsv = () => {
    const header = "ID,Ism,Telefon,Tur,Summa,kas,Xabar,Vaqt";
    const lines = rows.map((r) => [r.id, r.memberName ?? "", r.phone ?? "", r.type ?? "", r.amount, r.kasApplied ? "ha" : "yoq", (r.kasMessage ?? "").replace(/,/g, ";"), r.at].join(","));
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "yechishlar.csv"; a.click();
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">💸 Yechishlar — so'nggi 200 ta</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="search" placeholder="🔍 Ism, telefon…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn sm" onClick={exportCsv}>📥 CSV</button>
        </div>
      </div>
      <div className="cards" style={{ marginBottom: 12 }}>
        <Card icon="💸" label="Jami yechildi" value={formatNumber(total)} sub="so'm" accent />
        <Card icon="✅" label="kas'ga yetdi" value={formatNumber(rows.length - pending)} />
        <Card icon="⏳" label="Kutilmoqda" value={formatNumber(pending)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>A'zo</th><th>Telefon</th><th>Tur</th><th className="num">Summa</th><th>kas</th><th>Xabar</th><th>Vaqt</th></tr></thead>
          <tbody>
            {filtered.slice(0, 300).map((r, i) => (
              <tr key={r.id} className={!r.kasApplied ? "row-warn" : ""}>
                <td className="muted">{i + 1}</td>
                <td className="td-name">{r.memberName ?? "—"}</td>
                <td className="muted">{r.phone ?? "—"}</td>
                <td><span className="lvl">{r.type === "driver" ? "🚗" : "🏅"} {r.type ?? "—"}</span></td>
                <td className="num strong">{formatNumber(r.amount)}</td>
                <td>{r.kasApplied ? <span className="dot ok" /> : <span className="dot" />}</td>
                <td className="muted" style={{ fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.kasMessage ?? "—"}</td>
                <td className="muted">{fmtTime(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── ⭐ baholar ──────────────────────────────────────────────────────────────
function BaholarView() {
  const [rows, setRows] = useState<AdminRatingRow[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { adminApi.ratings().then(setRows).catch(() => setRows([])); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.carNumber.toLowerCase().includes(s) || r.tags.toLowerCase().includes(s));
  }, [rows, q]);

  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  const avg = rows.length ? (rows.reduce((s, r) => s + r.stars, 0) / rows.length).toFixed(2) : "—";
  const starCount = (n: number) => rows.filter((r) => r.stars === n).length;
  const exportCsv = () => {
    const header = "ID,Booking,Mashina,Yulduz,Teglar,Vaqt";
    const lines = rows.map((r) => [r.id, r.bookingId, r.carNumber, r.stars, r.tags, r.at].join(","));
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "baholar.csv"; a.click();
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">⭐ Baholar — so'nggi 200 ta</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="search" placeholder="🔍 Mashina, teg…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn sm" onClick={exportCsv}>📥 CSV</button>
        </div>
      </div>
      <div className="cards" style={{ marginBottom: 12 }}>
        <Card icon="⭐" label="O'rtacha baho" value={String(avg)} accent />
        <Card icon="5️⃣" label="5 yulduz" value={formatNumber(starCount(5))} />
        <Card icon="4️⃣" label="4 yulduz" value={formatNumber(starCount(4))} />
        <Card icon="🔴" label="1-3 yulduz" value={formatNumber(rows.length - starCount(5) - starCount(4))} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Booking</th><th>Mashina</th><th>Yulduz</th><th>Teglar</th><th>Vaqt</th></tr></thead>
          <tbody>
            {filtered.slice(0, 300).map((r, i) => (
              <tr key={r.id} className={r.stars <= 2 ? "row-warn" : ""}>
                <td className="muted">{i + 1}</td>
                <td className="muted">#{r.bookingId}</td>
                <td><b>{r.carNumber}</b></td>
                <td><span style={{ color: r.stars >= 4 ? "var(--green)" : r.stars <= 2 ? "var(--red)" : "var(--accent)" }}>{"⭐".repeat(r.stars)}</span></td>
                <td className="muted">{r.tags || "—"}</td>
                <td className="muted">{fmtTime(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 💬 mijozlar chat ────────────────────────────────────────────────────────
function ChatView() {
  const [convos, setConvos] = useState<AdminChatConvo[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<AdminChatMsg[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 🎧 Super Operator: pause toggle is UI-local state (best-effort — the server is the source
  // of truth on isAiPausedForOperator; this just avoids a round-trip to reflect the click).
  const [paused, setPaused] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const loadConvos = () => adminApi.chatConversations().then(setConvos).catch(() => setConvos([]));
  useEffect(() => { loadConvos(); const t = setInterval(loadConvos, 15000); return () => clearInterval(t); }, []);

  const openChat = async (tgId: string) => {
    setActive(tgId); setMsgs(null); setErr(null); setPaused(false); setShowActions(false);
    const m = await adminApi.chatMessages(tgId).catch(() => null);
    setMsgs(m ?? []);
    loadConvos();
  };

  const togglePause = async () => {
    if (!active || pausing) return;
    setPausing(true);
    try {
      await adminApi.chatPause(active, !paused);
      setPaused((p) => !p);
    } finally {
      setPausing(false);
    }
  };

  const send = async () => {
    if (!active || !reply.trim() || sending) return;
    setSending(true); setErr(null);
    try {
      await adminApi.chatReply(active, reply.trim());
      setReply("");
      const m = await adminApi.chatMessages(active).catch(() => null);
      setMsgs(m ?? []);
    } catch {
      setErr("Xabar yuborib bo'lmadi");
    } finally {
      setSending(false);
    }
  };

  const activeConvo = convos?.find((c) => c.telegramId === active);

  return (
    <div style={{ display: "flex", gap: 12, height: "calc(100vh - 120px)", minHeight: 400 }}>
      {/* conversation list */}
      <div style={{ width: 260, flexShrink: 0, background: "var(--card)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid var(--line)" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", fontWeight: 700 }}>💬 Suhbatlar</div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!convos && <div className="muted" style={{ padding: 14 }}>Yuklanmoqda…</div>}
          {convos?.length === 0 && <div className="muted" style={{ padding: 14 }}>Hali xabar yo'q.<br /><span style={{ fontSize: 12 }}>Foydalanuvchilar bot orqali yozganda bu yerda ko'rinadi.</span></div>}
          {convos?.map((c) => (
            <button key={c.telegramId} onClick={() => openChat(c.telegramId)} style={{ width: "100%", padding: "10px 14px", border: 0, background: active === c.telegramId ? "rgba(255,209,102,.12)" : "transparent", borderLeft: active === c.telegramId ? "3px solid var(--accent)" : "3px solid transparent", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name ?? c.username ?? c.telegramId}</span>
                {c.unread > 0 && <span style={{ background: "var(--red)", color: "#fff", fontSize: 11, padding: "1px 6px", borderRadius: 99 }}>{c.unread}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMsg}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{fmtTime(c.lastAt)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* message thread */}
      <div style={{ flex: 1, background: "var(--card)", borderRadius: 12, display: "flex", flexDirection: "column", border: "1px solid var(--line)", overflow: "hidden" }}>
        {!active ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="muted" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
              <div>Chap tarafdan suhbat tanlang</div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>
                {activeConvo?.name ?? activeConvo?.username ?? active}
                {activeConvo?.username && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>@{activeConvo.username}</span>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sm" onClick={() => setShowActions((s) => !s)}>🎧 {showActions ? "Yopish" : "Amallar"}</button>
                <button className="btn sm" onClick={togglePause} disabled={pausing} style={paused ? { background: "var(--red)", color: "#fff" } : undefined}>
                  {pausing ? "…" : paused ? "🙋 Operator yordamda" : "🤖 AI faol"}
                </button>
              </div>
            </div>
            {showActions && <div style={{ borderBottom: "1px solid var(--line)", padding: 12 }}><OperatorActions telegramId={active} onDone={() => { const m = active; if (m) void adminApi.chatMessages(m).then((r) => setMsgs(r)).catch(() => undefined); }} /></div>}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {!msgs && <div className="muted">Yuklanmoqda…</div>}
              {msgs?.length === 0 && <div className="muted">Xabar yo'q</div>}
              {msgs?.map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: m.direction === "out" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "75%", padding: "8px 12px", borderRadius: m.direction === "out" ? "14px 14px 2px 14px" : "14px 14px 14px 2px", background: m.direction === "out" ? "var(--accent)" : "var(--card-2)", color: m.direction === "out" ? "#000" : "var(--text)", fontSize: 13 }}>
                    <div>{m.text}</div>
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: "right" }}>{fmtTime(m.at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
              <input className="inp" style={{ flex: 1 }} placeholder="Javob yozing…" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()} />
              <button className="btn" onClick={send} disabled={sending || !reply.trim()}>{sending ? "…" : "Yuborish"}</button>
            </div>
            {err && <div className="muted" style={{ padding: "4px 14px 8px", color: "var(--red)" }}>{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 🎧 Super Operator — shared action panel ────────────────────────────────
// One memberId (resolved server-side from telegramId when only that's given — see
// /api/admin/opr/act) does everything the Koson AI agent + admin member-management can do.
// Mounted both inside ChatView (chat-attached) and CallMarkazView (call-center, no telegramId).
type OprSection = "taksi" | "qidiruv" | "eslatma" | "tezkor" | "tanga" | "ban";

function OperatorActions({ memberId, telegramId, onDone }: { memberId?: number | null; telegramId?: string | null; onDone?: () => void }) {
  const [section, setSection] = useState<OprSection>("tezkor");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const act = async (action: string, params: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null);
    try {
      const r = await adminApi.oprAct(memberId ?? null, telegramId ?? null, action, params);
      setMsg(r.message);
      onDone?.();
      return r;
    } catch {
      setMsg("Xatolik — qaytadan urinib ko'ring");
      return null;
    } finally {
      setBusy(false);
    }
  };

  // ── taksi ──
  const [addr, setAddr] = useState("");
  // ── qidiruv/buyurtma ──
  const [provider, setProvider] = useState("restoran");
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<{ id: string; title: string; subtitle?: string; restaurantId?: number; menuItemId?: number; shopId?: number; productId?: number }[] | null>(null);
  const [pickedId, setPickedId] = useState("");
  const [qty, setQty] = useState(1);
  const [orderAddr, setOrderAddr] = useState("");
  // ── eslatma ──
  const [remText, setRemText] = useState("");
  const [remAt, setRemAt] = useState("");
  // ── tanga ──
  const [coinAmt, setCoinAmt] = useState(0);
  const [coinReason, setCoinReason] = useState("");
  // ── ban ──
  const [banReason, setBanReason] = useState("");

  const search = async () => {
    setBusy(true); setMsg(null); setCards(null);
    const r = await adminApi.oprAct(memberId ?? null, telegramId ?? null, "search", { providerKey: provider, query });
    setBusy(false);
    if (r.ok) setCards(((r.extra as { cards?: typeof cards })?.cards) ?? []);
    else setMsg(r.message);
  };

  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {([["tezkor", "📍 Tezkor"], ["taksi", "🚕 Taksi"], ["qidiruv", "🔎 Buyurtma"], ["eslatma", "⏰ Eslatma"], ["tanga", "🪙 Tanga"], ["ban", "🚫 Ban"]] as [OprSection, string][]).map(([id, label]) => (
          <button key={id} className="btn sm" onClick={() => setSection(id)} style={section === id ? { background: "var(--accent)", color: "#000" } : undefined}>{label}</button>
        ))}
      </div>

      {section === "tezkor" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn sm" disabled={busy} onClick={() => act("status_taxi")}>📍 Taksi holati</button>
          <button className="btn sm" disabled={busy} onClick={() => act("balance")}>🪙 Balans</button>
          <button className="btn sm" disabled={busy} onClick={() => act("stats", { period: "oy" })}>📊 Oylik hisobot</button>
          <button className="btn sm" disabled={busy} onClick={() => act("cancel_taxi")}>✖️ Taksini bekor qilish</button>
        </div>
      )}

      {section === "taksi" && (
        <div style={{ display: "flex", gap: 6 }}>
          <input className="inp" style={{ flex: 1 }} placeholder="Manzil (bo'sh — saqlangan manzil ishlatiladi)" value={addr} onChange={(e) => setAddr(e.target.value)} />
          <button className="btn sm" disabled={busy} onClick={() => act("book", addr.trim() ? { addressQuery: addr.trim() } : {})}>🚕 Chaqirish</button>
        </div>
      )}

      {section === "qidiruv" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <select className="inp" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="restoran">🍽 Restoran</option>
              <option value="xizmat">🔎 Xizmat</option>
              <option value="bazar">🛒 Bozor</option>
              <option value="elon">📋 E'lon</option>
              <option value="reys">🚐 Reys</option>
            </select>
            <input className="inp" style={{ flex: 1 }} placeholder="Nima qidiryapsiz?" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} />
            <button className="btn sm" disabled={busy || !query.trim()} onClick={search}>Qidirish</button>
          </div>
          {cards && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {cards.length === 0 && <div className="muted">Hech narsa topilmadi</div>}
              {cards.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="radio" name="opr-card" checked={pickedId === c.id} onChange={() => setPickedId(c.id)} />
                  <b>{c.title}</b> {c.subtitle && <span className="muted">— {c.subtitle}</span>}
                </label>
              ))}
            </div>
          )}
          {(provider === "restoran" || provider === "bazar") && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input className="inp" type="number" min={1} style={{ width: 70 }} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
              <input className="inp" style={{ flex: 1 }} placeholder="Yetkazish manzili" value={orderAddr} onChange={(e) => setOrderAddr(e.target.value)} />
              <button
                className="btn sm"
                disabled={busy || !pickedId || !orderAddr.trim()}
                onClick={() => {
                  const picked = cards?.find((c) => c.id === pickedId);
                  if (!picked) return;
                  void act(provider === "restoran" ? "order_food" : "order_bazar", {
                    ...(provider === "restoran"
                      ? { restaurantId: picked.restaurantId, foodItems: [{ menuItemId: picked.menuItemId, qty }] }
                      : { shopId: picked.shopId, bazarItems: [{ productId: picked.productId, qty }] }),
                    address: orderAddr.trim(),
                  });
                }}
              >
                🛒 Buyurtma qilish
              </button>
            </div>
          )}
        </div>
      )}

      {section === "eslatma" && (
        <div style={{ display: "flex", gap: 6 }}>
          <input className="inp" style={{ flex: 1 }} placeholder="Eslatma matni" value={remText} onChange={(e) => setRemText(e.target.value)} />
          <input className="inp" type="datetime-local" value={remAt} onChange={(e) => setRemAt(e.target.value)} />
          <button className="btn sm" disabled={busy || !remText.trim() || !remAt} onClick={() => act("remind", { text: remText.trim(), runAtIso: new Date(remAt).toISOString() })}>Saqlash</button>
        </div>
      )}

      {section === "tanga" && (
        <div style={{ display: "flex", gap: 6 }}>
          <input className="inp" type="number" style={{ width: 100 }} placeholder="±summa" value={coinAmt || ""} onChange={(e) => setCoinAmt(Number(e.target.value) || 0)} />
          <input className="inp" style={{ flex: 1 }} placeholder="Sabab" value={coinReason} onChange={(e) => setCoinReason(e.target.value)} />
          <button className="btn sm" disabled={busy || !coinAmt} onClick={() => act("coins", { amount: coinAmt, reason: coinReason.trim() })}>Qo'llash</button>
        </div>
      )}

      {section === "ban" && (
        <div style={{ display: "flex", gap: 6 }}>
          <input className="inp" style={{ flex: 1 }} placeholder="Sabab" value={banReason} onChange={(e) => setBanReason(e.target.value)} />
          <button className="btn sm" disabled={busy} onClick={() => act("ban", { reason: banReason.trim() })}>🚫 Bloklash</button>
          <button className="btn sm" disabled={busy} onClick={() => act("unban")}>✅ Blokdan chiqarish</button>
        </div>
      )}

      {msg && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}

// ─── ☎️ Call-markaz — telefon-mijoz, kas1067'siz ────────────────────────────
function CallMarkazView() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [resolved, setResolved] = useState<{ memberId: number; fullName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resolve = async () => {
    if (!phone.trim()) return;
    setBusy(true); setErr(null); setResolved(null);
    const r = await adminApi.oprResolvePhone(phone.trim(), name.trim() || undefined);
    setBusy(false);
    if (r.ok && r.memberId) setResolved({ memberId: r.memberId, fullName: r.fullName ?? "Mijoz" });
    else setErr(r.message ?? "Topilmadi");
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="panel" style={{ padding: 12, marginBottom: 12 }}>
        <div className="panel-title">☎️ Qo'ng'iroq — mijozni toping yoki yarating</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input className="inp" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="inp" placeholder="Ism (agar yangi bo'lsa)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn sm" disabled={busy || !phone.trim()} onClick={resolve}>Topish / Yaratish</button>
        </div>
        {err && <div className="muted" style={{ marginTop: 6, color: "var(--red)" }}>{err}</div>}
        {resolved && <div className="muted" style={{ marginTop: 6 }}>✅ {resolved.fullName} (#{resolved.memberId})</div>}
      </div>
      {resolved && <OperatorActions memberId={resolved.memberId} />}
    </div>
  );
}

// ─── 📡 Nazorat — jonli buyurtma/safar-dashboard ────────────────────────────
function NazoratView() {
  const [rows, setRows] = useState<OprOpsRow[] | null>(null);
  const load = () => adminApi.oprDashboard().then((r) => setRows(r.rows)).catch(() => setRows([]));
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  const icon: Record<OprOpsRow["module"], string> = { taxi: "🚕", food: "🍽", bazar: "🛒", reys: "🚐" };

  return (
    <div className="table-wrap">
      <div className="panel-title" style={{ marginBottom: 8 }}>📡 Hozir faol — {rows?.length ?? "…"}</div>
      {!rows && <div className="muted">Yuklanmoqda…</div>}
      {rows?.length === 0 && <div className="muted">Hozir faol buyurtma/safar yo'q.</div>}
      {rows?.map((r) => (
        <div key={`${r.module}-${r.id}`} className="panel" style={{ padding: "8px 12px", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {icon[r.module]} <b>{r.title}</b> <span className="muted">— {r.status}</span>
          </div>
          <div>
            <span className="muted">{r.ageMin} daq</span>
            {r.stuck && <span className="badge badge-bad" style={{ marginLeft: 8 }}>⚠️ uzoq kutmoqda</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 🕵️ Jurnal — kim nima qildi ─────────────────────────────────────────────
function JurnalView() {
  const [rows, setRows] = useState<OprJurnalRow[] | null>(null);
  useEffect(() => { adminApi.oprJurnal().then((r) => setRows(r.items)).catch(() => setRows([])); }, []);
  return (
    <div className="table-wrap">
      {!rows && <div className="muted">Yuklanmoqda…</div>}
      {rows?.length === 0 && <div className="muted">Hali amal yo'q.</div>}
      {rows?.map((r) => (
        <div key={r.id} className="panel" style={{ padding: "8px 12px", marginBottom: 6, fontSize: 13 }}>
          <b>{r.actorRole}</b> <span className="muted">— {r.action.replace(/^opr_/, "")}</span>
          {r.targetId && <span className="muted"> · mijoz #{r.targetId}</span>}
          {r.detail && <div className="muted" style={{ marginTop: 2 }}>{r.detail}</div>}
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{fmtTime(r.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 🎧 Super Operator shell — minimal 4-tab console for the "chatops" role ─
function OperatorConsoleShell({ operatorName, onLogout }: { operatorName?: string; onLogout: () => void }) {
  const [tab, setTab] = useState<"chat" | "call" | "nazorat" | "jurnal">("chat");
  const tabs: [typeof tab, string][] = [["chat", "💬 Chat"], ["call", "☎️ Call-markaz"], ["nazorat", "📡 Nazorat"], ["jurnal", "🕵️ Mening amallarim"]];
  return (
    <div className="dash">
      <div className="content" style={{ marginLeft: 0 }}>
        <div className="content-header">
          <div className="content-title">🎧 Operator{operatorName ? ` — ${operatorName}` : ""}</div>
          <div className="content-header-right">
            <button className="logout-btn" onClick={onLogout}>🚪 Chiqish</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "0 16px", marginTop: 8 }}>
          {tabs.map(([id, label]) => (
            <button key={id} className="btn sm" onClick={() => setTab(id)} style={tab === id ? { background: "var(--accent)", color: "#000" } : undefined}>{label}</button>
          ))}
        </div>
        <div className="content-body">
          {tab === "chat" && <ChatView />}
          {tab === "call" && <CallMarkazView />}
          {tab === "nazorat" && <NazoratView />}
          {tab === "jurnal" && <JurnalView />}
        </div>
      </div>
    </div>
  );
}

// ─── 📱 xabar tarixi ────────────────────────────────────────────────────────
function XabarView() {
  const [rows, setRows] = useState<AdminMsgHistoryRow[] | null>(null);
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [q, setQ] = useState("");
  useEffect(() => { adminApi.msgHistory(300).then(setRows).catch(() => setRows([])); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let list = rows;
    if (dir !== "all") list = list.filter((r) => r.direction === dir);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((r) => r.text.toLowerCase().includes(s) || r.telegramId.includes(s));
    return list;
  }, [rows, dir, q]);

  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  const inCount = rows.filter((r) => r.direction === "in").length;
  const outCount = rows.filter((r) => r.direction === "out").length;

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">📱 Xabar tarixi — so'nggi 300 ta</div>
        <input className="search" placeholder="🔍 Matn, telegram id…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["all", "in", "out"] as const).map((d) => (
          <button key={d} className={"btn sm" + (dir === d ? " active" : "")} onClick={() => setDir(d)} style={{ background: dir === d ? "var(--accent)" : "transparent", color: dir === d ? "#000" : "inherit", border: "1px solid var(--line)" }}>
            {d === "all" ? "Hammasi" : d === "in" ? "📩 Kelgan" : "📤 Yuborilgan"}
          </button>
        ))}
        <span className="muted" style={{ marginLeft: 6, fontSize: 12, alignSelf: "center" }}>📩 {inCount} ta · 📤 {outCount} ta</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Yo'nalish</th><th>Telegram ID</th><th>Xabar</th><th>Vaqt</th></tr></thead>
          <tbody>
            {filtered.slice(0, 300).map((r) => (
              <tr key={r.id}>
                <td>{r.direction === "in" ? "📩 kelgan" : "📤 yuborilgan"}</td>
                <td className="muted">{r.telegramId}</td>
                <td style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.text}</td>
                <td className="muted">{fmtTime(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 🚕 safarlar tarixi ─────────────────────────────────────────────────────
function SafarlarView() {
  const [rows, setRows] = useState<AdminRideRow[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { adminApi.rides(150).then(setRows).catch(() => setRows([])); }, []);
  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.memberName, r.phone, String(r.bookingId), r.tier].some((v) => v?.toLowerCase().includes(s)));
  }, [rows, q]);
  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">🚕 Safarlar tarixi — so'nggi 150 ta cashback</div>
        <input className="search" placeholder="🔍 Ism, telefon, booking#, daraja…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cards" style={{ marginBottom: 12 }}>
        <Card icon="🚕" label="Jami safarlar" value={formatNumber(rows.length)} accent />
        <Card icon="🪙" label="Jami cashback" value={formatNumber(total)} sub="tanga" />
        <Card icon="🍀" label="Lucky safarlar" value={formatNumber(rows.filter((r) => r.lucky).length)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>A'zo</th><th>Telefon</th><th>Booking</th><th>Daraja</th><th className="num">Tanga</th><th>Lucky</th><th>Manba</th><th>Vaqt</th></tr></thead>
          <tbody>
            {filtered.slice(0, 300).map((r, i) => (
              <tr key={r.id}>
                <td className="muted">{i + 1}</td>
                <td className="td-name">{r.memberName}</td>
                <td className="muted">{r.phone ?? "—"}</td>
                <td className="muted">#{r.bookingId}</td>
                <td><span className="lvl">{r.tier}</span></td>
                <td className="num strong" style={{ color: "var(--green)" }}>+{formatNumber(r.amount)}</td>
                <td>{r.lucky ? "🍀" : "—"}</td>
                <td className="muted">{r.source}</td>
                <td className="muted">{fmtTime(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 300 && <div className="muted" style={{ padding: 10, fontSize: 12 }}>Birinchi 300 ko'rsatildi.</div>}
      </div>
    </section>
  );
}

// ─── 💳 haydovchi qarzlari ──────────────────────────────────────────────────
function QarzlarView() {
  const [rows, setRows] = useState<AdminDebtRow[] | null>(null);
  useEffect(() => { adminApi.driverDebts().then(setRows).catch(() => setRows([])); }, []);
  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  const byStatus = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <section className="panel">
      <div className="panel-title">💳 Haydovchi qarz to'lovlari — so'nggi 100 ta</div>
      <div className="cards" style={{ marginBottom: 12 }}>
        <Card icon="💳" label="Jami yozuvlar" value={formatNumber(rows.length)} accent />
        <Card icon="✅" label="Muvaffaqiyatli" value={formatNumber(byStatus("success"))} />
        <Card icon="⏳" label="Kutilmoqda" value={formatNumber(byStatus("pending"))} />
        <Card icon="❌" label="Xatolik" value={formatNumber(byStatus("error"))} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>A'zo ID</th><th>Mashina</th><th className="num">Summa</th><th>Holat</th><th>kas Balans</th><th>Xato</th><th>Vaqt</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={r.status === "error" ? "row-warn" : ""}>
                <td className="muted">{i + 1}</td>
                <td className="muted">#{r.memberId}</td>
                <td><b>{r.carNumber}</b></td>
                <td className="num strong">{formatNumber(r.amount)}</td>
                <td><span className={"lvl" + (r.status === "error" ? " warn" : "")}>{r.status === "success" ? "✅" : r.status === "error" ? "❌" : "⏳"} {r.status}</span></td>
                <td className="muted">{r.kasBalance != null ? formatNumber(r.kasBalance) : "—"}</td>
                <td className="muted" style={{ fontSize: 11 }}>{r.errorNote ?? "—"}</td>
                <td className="muted">{fmtTime(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 🚐 shaharlararo (intercity) ─────────────────────────────────────────────
const IC_STATUSES = ["", "OPEN", "BOARDING", "DEPARTED", "COMPLETED", "CANCELLED", "EXPIRED"];
function IntercityAdmin() {
  const [trips, setTrips] = useState<IntercityAdminTrip[] | null>(null);
  const [debts, setDebts] = useState<{ rows: IntercityAdminDebt[]; totalPending: number } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  const loadTrips = (s: string) => { setTrips(null); adminApi.intercityTrips(s || undefined).then(setTrips).catch(() => setTrips([])); };
  useEffect(() => { loadTrips(status); /* eslint-disable-next-line */ }, [status]);
  useEffect(() => { adminApi.intercityDebts().then(setDebts).catch(() => setDebts({ rows: [], totalPending: 0 })); }, []);

  const forceCancel = async (id: number) => {
    if (!window.confirm(`Reys #${id} ni bekor qilasizmi? Yo'lovchilarga xabar boradi.`)) return;
    setBusy(id);
    try { await adminApi.intercityForceCancel(id); loadTrips(status); } finally { setBusy(null); }
  };

  const open = trips?.filter((t) => t.status === "OPEN" || t.status === "BOARDING").length ?? 0;
  const completed = trips?.filter((t) => t.status === "COMPLETED").length ?? 0;
  return (
    <section className="panel">
      <div className="panel-title">🚐 Shaharlararo reyslar — so'nggi 100 ta</div>
      <div className="cards" style={{ marginBottom: 12 }}>
        <Card icon="🚐" label="Ko'rsatilgan" value={formatNumber(trips?.length ?? 0)} accent />
        <Card icon="🟢" label="Faol (open/boarding)" value={formatNumber(open)} />
        <Card icon="✅" label="Yakunlangan" value={formatNumber(completed)} />
        <Card icon="💸" label="Komissiya qarzi (kutilmoqda)" value={formatNumber(debts?.totalPending ?? 0) + " so'm"} />
      </div>

      <div className="chips" style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {IC_STATUSES.map((s) => (
          <button key={s || "all"} className="btn btn-sm" style={{ opacity: status === s ? 1 : 0.5 }} onClick={() => setStatus(s)}>
            {s || "Hammasi"}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Yo'nalish</th><th>Vaqt</th><th>Haydovchi</th><th className="num">O'rin</th><th className="num">Narx</th><th className="num">Bron</th><th>Holat</th><th>Amal</th></tr></thead>
          <tbody>
            {(trips ?? []).map((t) => (
              <tr key={t.id}>
                <td className="muted">#{t.id}</td>
                <td><b>{t.originCity.name} → {t.destCity.name}</b></td>
                <td className="muted">{fmtTime(t.scheduledAt)}</td>
                <td>{t.driver.fullName ?? "—"}{t.driver.carNumber ? <span className="muted"> · {t.driver.carNumber}</span> : null}</td>
                <td className="num">{t.bookedSeats}/{t.carCapacity}</td>
                <td className="num strong">{formatNumber(t.fareSom)}</td>
                <td className="num">{t._count.bookings}</td>
                <td><span className="lvl">{t.status}</span></td>
                <td>
                  {(t.status === "OPEN" || t.status === "BOARDING") && (
                    <button className="btn btn-sm" style={{ background: "#dc2626", color: "#fff" }} disabled={busy === t.id} onClick={() => forceCancel(t.id)}>{busy === t.id ? "…" : "Bekor"}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trips && trips.length === 0 && <div className="muted" style={{ padding: 16, textAlign: "center" }}>Reys yo'q</div>}
        {!trips && <div className="screen center"><div className="spinner" /></div>}
      </div>

      <div className="panel-title" style={{ marginTop: 18 }}>💸 Komissiya qarzlari (kutilmoqda)</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Haydovchi</th><th>Mashina</th><th>Reys</th><th className="num">Komissiya</th><th>Vaqt</th></tr></thead>
          <tbody>
            {(debts?.rows ?? []).map((d) => (
              <tr key={d.id}>
                <td className="muted">#{d.id}</td>
                <td>{d.driver.fullName ?? "—"}</td>
                <td><b>{d.driver.carNumber ?? "—"}</b></td>
                <td className="muted">#{d.trip.id}</td>
                <td className="num strong">{formatNumber(d.commissionSom)}</td>
                <td className="muted">{fmtTime(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {debts && debts.rows.length === 0 && <div className="muted" style={{ padding: 16, textAlign: "center" }}>Qarz yo'q (pilotda komissiya = 0)</div>}
      </div>
    </section>
  );
}

// ─── 👥 referallar ──────────────────────────────────────────────────────────
// ─── 🎮 BirJoy O'yinlar Mavsumi — kim-nima-qildi (B3) ──────────────────────────────────────────────────────
const OYIN_ACTION_LABEL: Record<string, string> = {
  ride: "🚕 Safar", first_ride: "🚕 Birinchi safar", phone: "📱 Telefon tasdiqlash",
  refer_join: "🤝 Do'st ulandi", refer_first_ride: "🤝 Do'st birinchi safari", refer_ride: "🤝 Do'stning safari",
  login: "📲 Kunlik kirish", share: "📤 Ulashish", sprint_bonus: "🏁 Sprint bonusi", ticket_buy: "🎟 Chipta xaridi",
};
function OyinActivityView() {
  const [data, setData] = useState<OyinActivityResponse | null>(null);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<OyinActivityAction | "">("");
  const load = () => { adminApi.oyinActivity({ action: action || undefined }).then(setData).catch(() => setData({ rows: [], total: 0, page: 1, pageSize: 50 })); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [action]);
  const filtered = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    if (!s) return data.rows;
    return data.rows.filter((r) => [r.name, r.helpedName].some((v) => v?.toLowerCase().includes(s)));
  }, [data, q]);
  if (!data) return <div className="screen center"><div className="spinner" /></div>;
  const positive = data.rows.filter((r) => r.ball > 0).reduce((s, r) => s + r.ball, 0);
  const spent = data.rows.filter((r) => r.ball < 0).reduce((s, r) => s + -r.ball, 0);
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">🎮 O'yin mavsumi — faoliyat ({data.total} voqea, so'nggi {data.pageSize})</div>
        <input className="search" placeholder="🔍 Ism bo'yicha…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cards" style={{ marginBottom: 12 }}>
        <Card icon="🎮" label="Ko'rsatilgan voqealar" value={formatNumber(data.rows.length)} accent />
        <Card icon="🟢" label="Jami keldi (ball)" value={formatNumber(positive)} />
        <Card icon="🎟" label="Jami sarflandi (ball)" value={formatNumber(spent)} sub="chipta xaridlari" />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button className={"btn sm" + (action === "" ? " active" : "")} onClick={() => setAction("")}>Hammasi</button>
        {Object.entries(OYIN_ACTION_LABEL).map(([k, label]) => (
          <button key={k} className={"btn sm" + (action === k ? " active" : "")} onClick={() => setAction(k as OyinActivityAction)}>{label}</button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Vaqt</th><th>A'zo</th><th>Harakat</th><th className="num">Ball</th><th>Kimga yordam berdi</th><th>Izoh</th></tr></thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.at}-${r.memberId}-${r.action}-${i}`}>
                <td className="muted">{fmtTime(r.at)}</td>
                <td className="td-name">{r.name}</td>
                <td>{OYIN_ACTION_LABEL[r.action] ?? r.action}</td>
                <td className="num strong" style={{ color: r.ball >= 0 ? "var(--green)" : "var(--red)" }}>{r.ball >= 0 ? "+" : ""}{formatNumber(r.ball)}</td>
                <td className="muted">{r.helpedName ?? "—"}</td>
                <td className="muted">{r.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReferallarView() {
  const [rows, setRows] = useState<AdminReferralRow[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { adminApi.referrals().then(setRows).catch(() => setRows([])); }, []);
  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.referrerName, r.refereeName].some((v) => v?.toLowerCase().includes(s)));
  }, [rows, q]);
  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  const paidCount = rows.filter((r) => r.paid).length;
  const totalReferrer = rows.reduce((s, r) => s + r.rewardReferrer, 0);
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">👥 Referal zanjiri — so'nggi 200 ta</div>
        <input className="search" placeholder="🔍 Ism bo'yicha…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cards" style={{ marginBottom: 12 }}>
        <Card icon="👥" label="Jami referallar" value={formatNumber(rows.length)} accent />
        <Card icon="✅" label="To'langan" value={formatNumber(paidCount)} />
        <Card icon="🪙" label="Mukofot (jami)" value={formatNumber(totalReferrer)} sub="taklif qilganlarga" />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Taklif qildi</th><th>Keldi</th><th className="num">Mukofot</th><th className="num">Yangi a'zo</th><th>To'landi</th><th>Vaqt</th></tr></thead>
          <tbody>
            {filtered.slice(0, 300).map((r, i) => (
              <tr key={r.id}>
                <td className="muted">{i + 1}</td>
                <td className="td-name">{r.referrerName}</td>
                <td className="td-name">{r.refereeName}</td>
                <td className="num strong" style={{ color: "var(--green)" }}>+{formatNumber(r.rewardReferrer)}</td>
                <td className="num">{formatNumber(r.rewardReferee)}</td>
                <td>{r.paid ? <span className="dot ok" /> : <span className="dot" />}</td>
                <td className="muted">{fmtTime(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── 🚫 bloklangan a'zolar ──────────────────────────────────────────────────
function BanListView() {
  const [rows, setRows] = useState<AdminBannedRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showBan, setShowBan] = useState(false);
  const [banId, setBanId] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banHard, setBanHard] = useState(true); // default = to'liq ban (owner asked for total lockout)
  const [banning, setBanning] = useState(false);
  const load = () => adminApi.banned().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const ban = async () => {
    const id = Number(banId);
    if (!banId.trim() || !id) { setMsg("❌ Noto'g'ri member ID"); return; }
    const kind = banHard ? "TO'LIQ BAN (butun botdan)" : "Naqd muzlatish (faqat pul chiqarish)";
    if (!window.confirm(`Member #${id} — ${kind}?\nSabab: ${banReason.trim() || "admin ban"}`)) return;
    setBanning(true);
    const reason = banReason.trim() || "admin ban";
    const r = await (banHard ? adminApi.hardBan(id, reason) : adminApi.ban(id, reason)).catch(() => ({ ok: false, message: "xato" }));
    setMsg(r.message);
    setBanning(false);
    if (r.ok) { setBanId(""); setBanReason(""); setShowBan(false); }
    await load();
  };

  const unban = async (id: number, name: string | null, hard: boolean) => {
    const what = hard ? "to'liq banni" : "naqd muzlatishni";
    if (!window.confirm(`${name ?? `#${id}`} — ${what} olib tashlaysizmi?`)) return;
    const r = await (hard ? adminApi.hardUnban(id) : adminApi.unban(id)).catch(() => ({ ok: false, message: "xato" }));
    setMsg(r.message);
    await load();
  };

  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  const filtered = rows.filter((r) => {
    const t = q.trim().toLowerCase();
    return !t || String(r.id).includes(t) || (r.fullName ?? "").toLowerCase().includes(t) || (r.phone ?? "").includes(t);
  });
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">🚫 Bloklangan a&apos;zolar ({filtered.length})</div>
        <button className="btn" onClick={() => setShowBan((v) => !v)}>{showBan ? "✖ Yopish" : "+ Bloklash"}</button>
      </div>
      {showBan && (
        <div className="adm-form-grid" style={{ marginBottom: 14, maxWidth: 620 }}>
          <div className="adm-field"><span className="adm-field-label">Member ID</span><input type="number" value={banId} onChange={(e) => setBanId(e.target.value)} placeholder="12345" /></div>
          <div className="adm-field"><span className="adm-field-label">Sabab</span><input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="masalan: firibgarlik shikoyati" /></div>
          <div className="adm-field" style={{ gridColumn: "1 / -1" }}>
            <span className="adm-field-label">Daraja</span>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={banHard} onChange={(e) => setBanHard(e.target.checked)} />
              <span>{banHard
                ? "🚫 To'liq ban — botga umuman kira olmaydi (bot + ilova)"
                : "🚩 Faqat naqd muzlatish — botdan foydalanadi, lekin pul chiqara olmaydi"}</span>
            </label>
          </div>
          <div className="adm-field">
            <span className="adm-field-label">&nbsp;</span>
            <button className="btn" disabled={banning} onClick={() => void ban()}>{banning ? "Bloklanmoqda…" : banHard ? "🚫 To'liq bloklash" : "🚩 Naqd muzlatish"}</button>
          </div>
        </div>
      )}
      {msg && <div className="action-msg" style={{ marginBottom: 8 }}>{msg}</div>}
      {rows.length > 0 && (
        <input className="search" style={{ marginBottom: 10 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 ID, ism yoki telefon…" />
      )}
      {rows.length === 0 ? (
        <div className="muted" style={{ padding: 12 }}>✅ Hozircha bloklangan a&apos;zo yo&apos;q.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Ism</th><th>Telefon</th><th>Tur</th><th>Daraja</th><th>Sabab</th><th className="num">Safar</th><th className="num">Tanga</th><th></th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="row-warn">
                  <td className="muted">#{r.id}</td>
                  <td className="td-name">{r.fullName ?? "—"}</td>
                  <td className="muted">{r.phone ?? "—"}</td>
                  <td><span className="lvl">{r.type === "driver" ? "🚗" : "🏅"} {r.type}</span></td>
                  <td>{r.hardBanned ? <span className="lvl" style={{ background: "#7f1d1d", color: "#fff" }}>🚫 To&apos;liq</span> : <span className="lvl">🚩 Naqd</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.hardBanned ? (r.banReason ?? "—") : (r.riskNote ?? "—")}</td>
                  <td className="num">{r.trips}</td>
                  <td className="num">{formatNumber(r.coins)}</td>
                  <td><button className="btn sm" onClick={() => unban(r.id, r.fullName, r.hardBanned)}>Ochish</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted" style={{ marginTop: 10 }}>Mos yozuv topilmadi.</p>}
        </div>
      )}
    </section>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ─── 🔥 Pik Vaqtlar ──────────────────────────────────────────────────────────
function PeakHoursView() {
  const [rows, setRows] = useState<PeakHourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<{ id?: number; label: string; startTime: string; endTime: string; bonusTanga: string; active: boolean }>({
    label: "", startTime: "07:00", endTime: "09:00", bonusTanga: "1000", active: true,
  });

  const load = () => { setLoading(true); adminApi.peakHours().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false)); };
  useEffect(load, []);

  const reset = () => setForm({ label: "", startTime: "07:00", endTime: "09:00", bonusTanga: "1000", active: true });

  const edit = (r: PeakHourRow) => setForm({ id: r.id, label: r.label, startTime: r.startTime, endTime: r.endTime, bonusTanga: String(r.bonusTanga), active: r.active });

  const save = async () => {
    if (!form.label || !form.startTime || !form.endTime || !form.bonusTanga) { setErr("Barcha maydonlarni to'ldiring"); return; }
    setSaving(true); setErr("");
    try {
      await adminApi.savePeakHour({ id: form.id, label: form.label, startTime: form.startTime, endTime: form.endTime, bonusTanga: Number(form.bonusTanga), active: form.active } as Parameters<typeof adminApi.savePeakHour>[0]);
      reset(); load();
    } catch { setErr("Saqlashda xato"); }
    setSaving(false);
  };

  const del = async (id: number) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    await adminApi.deletePeakHour(id); load();
  };

  return (
    <div className="panel">
      <div className="panel-title">🔥 Pik Vaqtlar — Driver Bonus</div>
      <p className="muted" style={{ marginBottom: 16 }}>
        Sozlangan vaqt oralig'ida buyurtma yakunlagan haydovchilarga avtomatik tanga bonusi + bildirishnoma yuboriladi.
      </p>

      {/* form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 600, marginBottom: 20 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <label className="muted" style={{ fontSize: 11 }}>Nom (masalan: Ertalab pik)</label>
          <input className="inp" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ertalab pik" />
        </div>
        <div>
          <label className="muted" style={{ fontSize: 11 }}>Boshlanish (Toshkent)</label>
          <input className="inp" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
        </div>
        <div>
          <label className="muted" style={{ fontSize: 11 }}>Tugash (Toshkent)</label>
          <input className="inp" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
        </div>
        <div>
          <label className="muted" style={{ fontSize: 11 }}>Bonus (tanga / buyurtma)</label>
          <input className="inp" type="number" min={0} value={form.bonusTanga} onChange={(e) => setForm((f) => ({ ...f, bonusTanga: e.target.value }))} placeholder="1000" />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
            Faol (haydovchilarga xabar yuboriladi)
          </label>
        </div>
        {err && <p style={{ gridColumn: "1/-1", color: "var(--red)", fontSize: 12 }}>{err}</p>}
        <div style={{ gridColumn: "1/-1", display: "flex", gap: 8 }}>
          <button className="btn" onClick={save} disabled={saving}>{saving ? "Saqlanmoqda…" : form.id ? "💾 Yangilash" : "➕ Qo'shish"}</button>
          {form.id && <button className="btn-outline" onClick={reset}>Bekor</button>}
        </div>
      </div>

      {/* table */}
      {loading ? <p className="muted">Yuklanmoqda…</p> : rows.length === 0 ? <p className="muted">Pik vaqtlar yo'q.</p> : (
        <table className="tbl">
          <thead><tr><th>Nom</th><th>Boshlanish</th><th>Tugash</th><th>Bonus</th><th>Holat</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td>{r.startTime}</td>
                <td>{r.endTime}</td>
                <td>+{r.bonusTanga.toLocaleString("ru-RU")} tanga</td>
                <td><span style={{ color: r.active ? "var(--green)" : "var(--muted)" }}>{r.active ? "✅ Faol" : "⏸ Nofaol"}</span></td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="btn-sm" onClick={() => edit(r)}>✏️</button>
                  <button className="btn-sm danger" onClick={() => del(r.id)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── 💸 Tranzaksiyalar — kim kimga pul tashladi + kim yechdi ─────────────────
function TransactionsView() {
  const [rows, setRows] = useState<AdminTxnRow[]>([]);
  const [kind, setKind] = useState<"all" | "transfer" | "tip" | "fare" | "withdraw">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    adminApi.transactions(kind, 300).then((r) => { setRows(r); setLoading(false); }).catch((e) => { setErr(e instanceof Error ? e.message : "xatolik"); setLoading(false); });
  }, [kind]);

  const kindLabel = (k: string): { txt: string; color: string } => {
    switch (k) {
      case "tip": return { txt: "🙏 Choychaqa", color: "#ffce4f" };
      case "fare": return { txt: "🚕 Haydovchiga to'lov", color: "#34d399" };
      case "transfer": return { txt: "🔁 O'tkazma", color: "#8ab4ff" };
      case "withdraw": return { txt: "💳 Yechish", color: "#f87171" };
      default: return { txt: k, color: "var(--muted)" };
    }
  };

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [r.fromName, r.fromPhone, r.toName, r.toPhone, r.note].some((x) => x?.toLowerCase().includes(s));
  });

  // jami: umumiy summa + komissiya + turlar bo'yicha
  const totals = filtered.reduce(
    (a, r) => {
      a.sum += r.amount;
      a.comm += r.commission;
      if (r.kind === "withdraw") a.withdraw += r.amount;
      else a.paid += r.amount;
      return a;
    },
    { sum: 0, comm: 0, withdraw: 0, paid: 0 },
  );

  const exportCsv = () => {
    const csv = "Sana,Turi,Kimdan,Telefon,Kimga,Telefon,Summa,Komissiya,Izoh\n" +
      filtered.map((r) => `"${fmtTime(r.at)}","${kindLabel(r.kind).txt}","${r.fromName ?? ""}","${r.fromPhone ?? ""}","${r.toName ?? ""}","${r.toPhone ?? ""}",${r.amount},${r.commission},"${(r.note ?? "").replace(/"/g, "'")}"`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "tranzaksiyalar.csv";
    a.click();
  };

  const FILTERS: { id: typeof kind; label: string }[] = [
    { id: "all", label: "🗂 Barchasi" },
    { id: "fare", label: "🚕 Haydovchiga to'lov" },
    { id: "tip", label: "🙏 Choychaqa" },
    { id: "transfer", label: "🔁 O'tkazma" },
    { id: "withdraw", label: "💳 Yechishlar" },
  ];

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">💸 Tranzaksiyalar — kim kimga, kim yechdi</div>
        <button className="btn sm" onClick={exportCsv} disabled={!filtered.length}>📥 CSV</button>
      </div>

      <div className="seg" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.id} className={kind === f.id ? "seg-btn active" : "seg-btn"} onClick={() => setKind(f.id)}>{f.label}</button>
        ))}
      </div>

      <input className="search" style={{ width: "100%", marginBottom: 12 }} placeholder="🔍 Ism / telefon / izoh bo'yicha qidirish" value={q} onChange={(e) => setQ(e.target.value)} />

      {!loading && filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="card-label">📊 Jami harakat ({filtered.length} ta)</div>
            <div className="card-value" style={{ fontSize: 22 }}>{formatNumber(totals.sum)} <span style={{ fontSize: 13, color: "var(--muted)" }}>tanga</span></div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="card-label">🚕 To'lov + choychaqa</div>
            <div className="card-value" style={{ fontSize: 22, color: "#34d399" }}>{formatNumber(totals.paid)}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="card-label">💳 Yechilgan</div>
            <div className="card-value" style={{ fontSize: 22, color: "#f87171" }}>{formatNumber(totals.withdraw)}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="card-label">💼 Komissiya (1067)</div>
            <div className="card-value" style={{ fontSize: 22, color: "var(--accent)" }}>{formatNumber(totals.comm)}</div>
          </div>
        </div>
      )}

      {err && <div className="action-msg">{err}</div>}
      {loading ? <p className="muted">Yuklanmoqda…</p> : filtered.length === 0 ? <p className="muted">Tranzaksiya topilmadi.</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Sana</th><th>Turi</th><th>Kimdan</th><th>Kimga</th><th className="num">Summa</th><th>Izoh</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const kl = kindLabel(r.kind);
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtTime(r.at)}</td>
                    <td><span style={{ color: kl.color, fontWeight: 700, whiteSpace: "nowrap" }}>{kl.txt}</span></td>
                    <td>
                      <div className="td-name">{r.fromName ?? "—"}{r.fromType === "driver" ? " 🚗" : ""}</div>
                      {r.fromPhone && <div className="td-sub">{r.fromPhone}</div>}
                    </td>
                    <td>
                      <div className="td-name">{r.toName ?? "—"}{r.toType === "driver" ? " 🚗" : ""}</div>
                      {r.toPhone && <div className="td-sub">{r.toPhone}</div>}
                    </td>
                    <td className="num strong" style={{ color: r.kind === "withdraw" ? "#f87171" : "#34d399", whiteSpace: "nowrap" }}>
                      {formatNumber(r.amount)}{r.commission > 0 ? <span className="td-sub"> +{formatNumber(r.commission)} komis.</span> : null}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 220 }}>{r.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>🚗 = haydovchi · Summa = tanga. «Haydovchiga to'lov» va «Choychaqa» — mijoz botda haydovchiga tanga yuboradi. «Yechish» — tanga real pulga.</p>
    </div>
  );
}

// ─── 📵 Bloklaganlar — botni bloklagan foydalanuvchilar ───────────────────────
// BLK-1: push turi → o'zbekcha yorliq. Ro'yxatda yo'q turlar xom ko'rinadi (to'qilmaydi).
const BLOCK_KIND_LABEL: Record<string, string> = {
  freespin_wait: "🎡 Bepul aylantirish eslatmasi",
  lucky_day: "🍀 Omad kuni",
  streak_saver: "🔥 Streak xavfda",
  comeback: "🎁 Sizni sog'indik",
  jackpot: "🎰 Jackpot",
  recap: "📊 Haftalik hisobot",
  decay_warn: "📉 Ball yechilmoqda",
  link_remind: "👋 Raqamni ulang",
  reminder: "🔔 Shaxsiy eslatma",
  elon_expiry: "⏳ E'lon tugayapti",
  elon_soldcheck: "🤔 Sotildimi?",
  mkt_life: "🛍 Bozor taklifi",
  mkt_expire: "⏳ Buyurtma bekor",
  ride_arrived: "🚕 Haydovchi yetib keldi",
  ride_assigned: "🚖 Haydovchi topildi",
  peak_bonus: "🔥 Pik bonus",
  intercity: "🚐 Shaharlararo",
  api_send: "📢 Broadcast / admin xabari",
};

function BlockedView() {
  const [rows, setRows] = useState<AdminBlockedRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    adminApi.blocked(1000).then((r) => { setRows(r); setLoading(false); }).catch((e) => { setErr(e instanceof Error ? e.message : "xatolik"); setLoading(false); });
  };
  useEffect(load, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [r.name, r.phone, r.telegramId].some((x) => x?.toLowerCase().includes(s));
  });

  const exportCsv = () => {
    const csv = "Ism,Telefon,TelegramID,Bog'langan,QaysiXabar,BloklaganSana\n" +
      filtered.map((r) => `"${r.name}",${r.phone ?? ""},${r.telegramId},${r.linked ? "ha" : "yo'q"},${r.kind ?? ""},"${fmtTime(r.at)}"`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "bloklaganlar.csv";
    a.click();
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">📵 Bloklaganlar — botni bloklagan foydalanuvchilar</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={load}>🔄 Yangilash</button>
          <button className="btn sm" onClick={exportCsv} disabled={!filtered.length}>📥 CSV</button>
        </div>
      </div>

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="card-label">📵 Jami bloklaganlar</div>
            <div className="card-value" style={{ fontSize: 22, color: "#f87171" }}>{rows.length}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="card-label">🔗 Bog'langan (mijoz/haydovchi)</div>
            <div className="card-value" style={{ fontSize: 22 }}>{rows.filter((r) => r.linked).length}</div>
          </div>
        </div>
      )}

      <input className="search" style={{ width: "100%", marginBottom: 12 }} placeholder="🔍 Ism / telefon bo'yicha qidirish" value={q} onChange={(e) => setQ(e.target.value)} />

      {err && <div className="action-msg">{err}</div>}
      {loading ? <p className="muted">Yuklanmoqda…</p> : filtered.length === 0 ? <p className="muted">Bloklagan foydalanuvchi yo'q. 🎉</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ism</th><th>Telefon</th><th>Holat</th><th>Qaysi xabardan keyin</th><th>Bloklagan sana</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.telegramId}>
                  <td className="td-name">{r.name}</td>
                  <td>{r.phone ?? <span className="muted">—</span>}</td>
                  <td>{r.linked ? <span className="lvl">🔗 Bog'langan</span> : <span className="muted">ulanmagan</span>}</td>
                  <td>{r.kind ? <span className="lvl">{BLOCK_KIND_LABEL[r.kind] ?? r.kind}</span> : <span className="muted">noma'lum</span>}</td>
                  <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtTime(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>Botga xabar yuborilganda 403 qaytsa (bot bloklangan) shu ro'yxatga tushadi. Foydalanuvchi qaytib /start bossa yoki bot bilan ishlasa — avtomatik ro'yxatdan chiqadi. «Qaysi xabardan keyin» ustuni 2026-07-29'dan boshlab yoziladi; undan oldingi bloklarda ma'lumot yo'q («noma'lum»).</p>
    </div>
  );
}
