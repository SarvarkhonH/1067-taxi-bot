import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  formatNumber,
  type AdminAuditRow,
  type AdminBotUsersResponse,
  type AdminEconomy,
  type BallDistribution,
  type AdminGrowth,
  type AdminHealth,
  type AdminIntegrity,
  type AdminLiveBooking,
  type AdminMemberRow,
  type AdminStats,
} from "@t1067/shared";
import { adminApi, clearAdminToken, hasAdminToken, setAdminToken, type AdminBannedRow, type AdminChatConvo, type AdminChatMsg, type AdminDebtRow, type AdminMsgHistoryRow, type AdminRatingRow, type AdminReferralRow, type AdminRideRow, type AdminUserRow, type AdminWithdrawalRow, type AdminWithdrawalTabRow, type CampaignRow, type Driver360, type DriverCallRow, type DriverCallStats, type DriverMissionRow, type IntercityAdminTrip, type IntercityAdminDebt, type Member360, type PeakHourRow } from "./api";

type Tab = "overview" | "pulse" | "analytics" | "finance" | "live" | "x360" | "driver" | "client" | "botusers" | "obzvon" | "boshqaruv" | "topshiriq" | "actions" | "integrity" | "audit" | "safarlar" | "qarzlar" | "referallar" | "banlist" | "yechishlar" | "baholar" | "xabar" | "chat" | "intercity" | "pik";

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
    ],
  },
  {
    label: "BOSHQARUV",
    items: [
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

  useEffect(() => {
    if (!authed) return;
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

  if (!authed) return <LoginScreen onAuthed={() => setAuthed(true)} />;

  function logout() { clearAdminToken(); setHealth(null); setAuthed(false); }

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
            <div className="sb-title">1067 TAXI</div>
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
          {tab === "topshiriq" && <><QuickAnnounceView /><CampaignsView /><DriverMissionsView /></>}
          {tab === "actions" && <><ActionsView /><ControlCards /></>}
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

  useEffect(() => {
    adminApi.economy().then(setEco).catch(() => undefined);
    adminApi.ballDist().then(setBall).catch(() => undefined);
    adminApi.growth().then(setGrowth).catch(() => undefined);
    const load = () => adminApi.bookings().then(setBookings).catch(() => undefined);
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
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
            <p><b>{m.member.name}</b> ({m.member.type}) · 🪙 {m.member.coins.toLocaleString("ru-RU")} · {m.member.trips} safar (30 kunda {m.rides30}) {m.member.riskFlag && "· 🚩 RISK"} {m.member.plusUntil && "· 💎Plus"}</p>
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

// kill-switch toggles + mashina fund + B2B corp registry
function ControlCards() {
  const [flags, setFlags] = useState<{ name: string; on: boolean }[] | null>(null);
  const [fund, setFund] = useState(0);
  const [bonusEcon, setBonusEcon] = useState<{ knobs: { key: string; label: string; def: number; min: number; max: number; step: number; group: string }[]; values: Record<string, number> } | null>(null);
  const [txEcon, setTxEcon] = useState<{ knobs: { key: string; label: string; def: number; min: number; max: number; step: number }[]; values: Record<string, number>; enabled: boolean; earned: { total: number; today: number } } | null>(null);
  const [corps, setCorps] = useState<{ id: number; name: string; balance: number; employees: number }[]>([]);
  const [cName, setCName] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empCorp, setEmpCorp] = useState<number | null>(null);
  const [balCorp, setBalCorp] = useState<number | null>(null);
  const [balAmt, setBalAmt] = useState("");
  const [optokens, setOptokens] = useState<{ token: string; role: string; createdAt: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [msg2, setMsg2] = useState<string | null>(null);

  const load = () => {
    adminApi.features().then((r) => { setFlags(r.features); setFund(r.mashinaFund); }).catch(() => undefined);
    adminApi.bonusEconomy().then(setBonusEcon).catch(() => undefined);
    adminApi.transferEconomy().then(setTxEcon).catch(() => undefined);
    adminApi.corps().then((r) => setCorps(r.corps)).catch(() => undefined);
    adminApi.optokens().then((r) => setOptokens(r.tokens)).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const saveBonusEcon = async (key: string, value: number) => {
    try { const r = await adminApi.setBonusEconomy(key, value); setBonusEcon((e) => (e ? { ...e, values: r.values } : e)); }
    catch { alert(`'${key}' qiymatini saqlab bo'lmadi`); }
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
        <h3>🔌 Mexanika kill-switch (deploy'siz o'chirish)</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(flags ?? []).map((f) => (
            <button key={f.name} className={f.on ? "btn" : "btn danger"} onClick={() => toggle(f.name, !f.on)}>
              {f.on ? "🟢" : "🔴"} {f.name}
            </button>
          ))}
        </div>
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
          <button className="btn" onClick={async () => { const r = await adminApi.optoken(); setMsg2(`Operator token (faqat bir marta ko'rsatiladi): ${r.token}`); load(); }}>🔑 Operator-token yaratish</button>
          {msg2 && <p className="muted" style={{ wordBreak: "break-all" }}>{msg2}</p>}
          {optokens.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p className="muted" style={{ marginBottom: 4 }}>Faol operator-tokenlar ({optokens.length}) — bekor qilsangiz egasi darhol kira olmaydi:</p>
              {optokens.map((t) => (
                <div key={t.token} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
                  <code style={{ flex: 1, fontSize: 12, opacity: 0.8 }}>{t.token.slice(0, 8)}…{t.token.slice(-4)} · {t.role}</code>
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

function ActionsView() {
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
                <div className="muted" style={{ fontSize: 12 }}>✅ {annStats.sent} yetdi · 📵 {annStats.total - annStats.sent} bormadi</div>
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
                  <div className="bc-phone-title">1067 Taxi</div>
                  <div className="bc-phone-sub">bot</div>
                </div>
              </div>
              <div className="bc-phone-body">
                <div className="bc-bubble">
                  <b>📣 1067 Taxi</b><br /><br />
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
  return (
    <>
      <section className="cards">
        <Card icon="👥" label="Botga kirganlar" value={formatNumber(data.total)} accent />
        <Card icon="🔗" label="Bog'langan" value={formatNumber(data.linked)} sub="profil bilan" />
        <Card icon="⏳" label="Bog'lanmagan" value={formatNumber(unlinkedCount)} sub="raqam ulamagan" />
        <Card icon="🆕" label="Bugun yangi" value={formatNumber(data.newToday)} />
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
                  <td className="muted">{fmtTime(u.lastActive)}</td>
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

function LoginScreen({ onAuthed }: { onAuthed: () => void }) {
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
        <h1 className="login-title">1067 TAXI · Command</h1>
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

        <p className="login-foot muted">Faqat administratorlar uchun · 1067 Taxi</p>
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

  const loadConvos = () => adminApi.chatConversations().then(setConvos).catch(() => setConvos([]));
  useEffect(() => { loadConvos(); const t = setInterval(loadConvos, 15000); return () => clearInterval(t); }, []);

  const openChat = async (tgId: string) => {
    setActive(tgId); setMsgs(null); setErr(null);
    const m = await adminApi.chatMessages(tgId).catch(() => null);
    setMsgs(m ?? []);
    loadConvos();
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
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", fontWeight: 700 }}>
              {activeConvo?.name ?? activeConvo?.username ?? active}
              {activeConvo?.username && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>@{activeConvo.username}</span>}
            </div>
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
  const load = () => adminApi.banned().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const ban = async () => {
    const idStr = window.prompt("Bloklash uchun member ID:");
    if (!idStr) return;
    const id = Number(idStr);
    if (!id) { setMsg("Noto'g'ri ID"); return; }
    const reason = window.prompt("Blok sababi:") ?? "admin ban";
    const r = await adminApi.ban(id, reason).catch(() => ({ ok: false, message: "xato" }));
    setMsg(r.message);
    await load();
  };

  const unban = async (id: number, name: string | null) => {
    if (!window.confirm(`${name ?? `#${id}`} blokini ochishni tasdiqlaysizmi?`)) return;
    const r = await adminApi.unban(id).catch(() => ({ ok: false, message: "xato" }));
    setMsg(r.message);
    await load();
  };

  if (!rows) return <div className="screen center"><div className="spinner" /></div>;
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">🚫 Bloklangan a'zolar ({rows.length})</div>
        <button className="btn" onClick={ban}>+ Bloklash</button>
      </div>
      {msg && <div className="action-msg" style={{ marginBottom: 8 }}>{msg}</div>}
      {rows.length === 0 ? (
        <div className="muted" style={{ padding: 12 }}>✅ Hozircha bloklangan a'zo yo'q.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Ism</th><th>Telefon</th><th>Tur</th><th>Sabab</th><th className="num">Safar</th><th className="num">Tanga</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="row-warn">
                  <td className="muted">#{r.id}</td>
                  <td className="td-name">{r.fullName ?? "—"}</td>
                  <td className="muted">{r.phone ?? "—"}</td>
                  <td><span className="lvl">{r.type === "driver" ? "🚗" : "🏅"} {r.type}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.riskNote ?? "—"}</td>
                  <td className="num">{r.trips}</td>
                  <td className="num">{formatNumber(r.coins)}</td>
                  <td><button className="btn sm" onClick={() => unban(r.id, r.fullName)}>Ochish</button></td>
                </tr>
              ))}
            </tbody>
          </table>
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
