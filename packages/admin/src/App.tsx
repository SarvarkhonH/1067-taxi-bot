import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  formatNumber,
  type AdminAuditRow,
  type AdminBotUsersResponse,
  type AdminEconomy,
  type AdminGrowth,
  type AdminHealth,
  type AdminIntegrity,
  type AdminLiveBooking,
  type AdminMemberRow,
  type AdminStats,
} from "@t1067/shared";
import { adminApi, clearAdminToken, hasAdminToken, setAdminToken, type AdminUserRow, type AdminWithdrawalRow, type Driver360, type DriverMissionRow, type Member360 } from "./api";

type Tab = "overview" | "pulse" | "analytics" | "finance" | "live" | "x360" | "driver" | "client" | "botusers" | "boshqaruv" | "topshiriq" | "actions" | "integrity" | "audit";

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean>(hasAdminToken);

  // poll health for the always-on status pill (only once we have a credential)
  useEffect(() => {
    if (!authed) return;
    const load = () =>
      adminApi
        .health()
        .then((h) => {
          setHealth(h);
          setError(null);
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          if (msg === "forbidden") {
            // stored credential is wrong/stale → back to the login screen
            clearAdminToken();
            setAuthed(false);
          }
        });
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [authed]);

  if (!authed) return <LoginScreen onAuthed={() => setAuthed(true)} />;

  function logout() {
    clearAdminToken();
    setHealth(null);
    setError(null);
    setAuthed(false);
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "📊 Umumiy" },
    { id: "pulse", label: "💓 Puls" },
    { id: "analytics", label: "📈 Analitika" },
    { id: "finance", label: "💰 Moliya" },
    { id: "live", label: "🗺 Jonli" },
    { id: "x360", label: "🔎 360" },
    { id: "driver", label: "🚗 Haydovchi" },
    { id: "client", label: "🏅 Mijoz" },
    { id: "botusers", label: "👥 Bot" },
    { id: "boshqaruv", label: "👑 Boshqaruv" },
    { id: "topshiriq", label: "🎯 Topshiriq" },
    { id: "actions", label: "⚡ Amallar" },
    { id: "integrity", label: "🔐 Integrity" },
    { id: "audit", label: "📜 Jurnal" },
  ];

  return (
    <div className="dash">
      <header className="bar">
        <div className="bar-brand">
          <span className="logo">🚕</span>
          <div>
            <div className="bar-title">1067 TAXI · <b>Command</b></div>
            <div className="bar-sub muted">Boshqaruv markazi v4</div>
          </div>
        </div>
        <div className="bar-right">
          <HealthPill h={health} />
          <button className="logout-btn" onClick={logout} title="Chiqish">🚪 Chiqish</button>
        </div>
      </header>

      <div className="seg seg-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "seg-btn active" : "seg-btn"} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === "overview" && <Overview health={health} />}
      {tab === "pulse" && <PulseView />}
      {tab === "analytics" && <AnalyticsView />}
      {tab === "finance" && <FinanceView />}
      {tab === "live" && <LiveMapView />}
      {tab === "x360" && <X360View />}
      {(tab === "driver" || tab === "client") && <MembersTab type={tab} />}
      {tab === "botusers" && <BotUsersTab />}
      {tab === "boshqaruv" && <BoshqaruvView />}
      {tab === "topshiriq" && <DriverMissionsView />}
      {tab === "actions" && (<><ActionsView /><ControlCards /></>)}
      {tab === "integrity" && <IntegrityView />}
      {tab === "audit" && <AuditView />}
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
  const [growth, setGrowth] = useState<AdminGrowth | null>(null);
  const [bookings, setBookings] = useState<AdminLiveBooking[] | null>(null);

  useEffect(() => {
    adminApi.economy().then(setEco).catch(() => undefined);
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
  const [econ, setEcon] = useState<{ knobs: { key: string; label: string; def: number; min: number; max: number; step: number; live: boolean }[]; values: Record<string, number> } | null>(null);
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
    adminApi.motorEconomy().then(setEcon).catch(() => undefined);
    adminApi.corps().then((r) => setCorps(r.corps)).catch(() => undefined);
    adminApi.optokens().then((r) => setOptokens(r.tokens)).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const saveEcon = async (key: string, value: number) => {
    try { const r = await adminApi.setMotorEconomy(key, value); setEcon((e) => (e ? { ...e, values: r.values } : e)); }
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
        {econ && (
          <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
            <h3 style={{ margin: "0 0 6px" }}>🎛 Motor Olami iqtisod — jonli narx boshqaruvi</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {econ.knobs.map((k) => (
                <div key={k.key} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 190 }}>{k.label}{!k.live && <span className="muted"> (P2)</span>}</span>
                  <input type="number" step={k.step} min={k.min} max={k.max} defaultValue={econ.values[k.key]} id={`econ-${k.key}`} style={{ width: 90 }} />
                  <span className="muted" style={{ fontSize: 11 }}>[{k.min}–{k.max}]</span>
                  <button className="btn sm" onClick={() => { const el = document.getElementById(`econ-${k.key}`) as HTMLInputElement | null; if (el) void saveEcon(k.key, Number(el.value)); }}>Saqlash</button>
                </div>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>⛽ Yoqilg'i ×0.7 = arzon-promo (faollik↑). ⚡ Daromad ×0.5 = inflyatsiya tormozi. Har qiymat clamp'langan — buzib bo'lmaydi.</p>
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

  const [text, setText] = useState("");
  const [segment, setSegment] = useState<"all" | "linked">("all");
  const [annMsg, setAnnMsg] = useState<string | null>(null);
  const [annBusy, setAnnBusy] = useState(false);

  const doGrant = async () => {
    if (!phone || !amount || grantBusy) return;
    setGrantBusy(true);
    setGrantMsg(null);
    try {
      const r = await adminApi.grant(phone, Number(amount), reason);
      setGrantMsg(r.message);
      if (r.ok) { setAmount(""); setReason(""); }
    } catch (e) {
      setGrantMsg(e instanceof Error ? e.message : "xatolik");
    } finally {
      setGrantBusy(false);
    }
  };

  const doAnnounce = async () => {
    if (text.trim().length < 3 || annBusy) return;
    if (!confirm(`${segment === "all" ? "BARCHA" : "bog'langan"} foydalanuvchilarga yuborilsinmi?`)) return;
    setAnnBusy(true);
    setAnnMsg(null);
    try {
      const r = await adminApi.announce(text, segment);
      setAnnMsg(r.message);
      if (r.ok) setText("");
    } catch (e) {
      setAnnMsg(e instanceof Error ? e.message : "xatolik");
    } finally {
      setAnnBusy(false);
    }
  };

  return (
    <div className="actions">
      <section className="panel">
        <div className="panel-title">💸 Cashback berish / tuzatish</div>
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>Mijoz raqamiga bonus yozadi (kas1067 · 1303). Manfiy ham bo'ladi (tuzatish).</p>
        <div className="form-grid">
          <input className="search" placeholder="📱 Telefon (+998…)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="search" placeholder="💰 Summa (+ yoki −)" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
        </div>
        <input className="search" style={{ width: "100%", marginTop: 8 }} placeholder="📝 Sabab (ixtiyoriy)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn" style={{ marginTop: 12 }} onClick={doGrant} disabled={grantBusy}>{grantBusy ? "⏳…" : "💸 Berish"}</button>
        {grantMsg && <div className="action-msg">{grantMsg}</div>}
      </section>

      <section className="panel">
        <div className="panel-title">📣 E'lon yuborish</div>
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 12px" }}>Botdagi foydalanuvchilarga xabar. HTML qo'llanadi.</p>
        <textarea className="search" style={{ width: "100%", minHeight: 90, resize: "vertical" }} placeholder="📢 Xabar matni… (masalan: Bugun 2x cashback!)" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="seg" style={{ maxWidth: 320, marginTop: 10 }}>
          <button className={segment === "all" ? "seg-btn active" : "seg-btn"} onClick={() => setSegment("all")}>Hammaga</button>
          <button className={segment === "linked" ? "seg-btn active" : "seg-btn"} onClick={() => setSegment("linked")}>Bog'langanlarga</button>
        </div>
        <button className="btn" style={{ marginTop: 12 }} onClick={doAnnounce} disabled={annBusy}>{annBusy ? "⏳ Yuborilmoqda…" : "📤 Yuborish"}</button>
        {annMsg && <div className="action-msg">{annMsg}</div>}
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
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter((u) => [u.name, u.username, u.phone, u.memberName].some((v) => v?.toLowerCase().includes(q)));
  }, [data, query]);
  if (!data) return <div className="screen center"><div className="spinner" /></div>;
  return (
    <>
      <section className="cards">
        <Card icon="👥" label="Botga kirganlar" value={formatNumber(data.total)} accent />
        <Card icon="🔗" label="Bog'langan" value={formatNumber(data.linked)} sub="profil bilan" />
        <Card icon="🆕" label="Bugun yangi" value={formatNumber(data.newToday)} />
        <Card icon="🛠" label="Adminlar" value={formatNumber(data.admins)} />
      </section>
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">Bot foydalanuvchilari ({formatNumber(filtered.length)})</div>
          <input className="search" placeholder="🔍 Ism, username, telefon…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Foydalanuvchi</th><th>Telefon</th><th>Profil</th><th>Tur</th><th>Oxirgi faollik</th></tr></thead>
            <tbody>
              {filtered.slice(0, 500).map((u, i) => (
                <tr key={u.telegramId}>
                  <td className="muted">{i + 1}</td>
                  <td><div className="td-name">{u.name} {u.isAdmin && <span className="lvl">admin</span>}</div><div className="td-sub muted">{u.username ? `@${u.username}` : u.telegramId}</div></td>
                  <td>{u.phone ?? "—"}</td>
                  <td>{u.linked ? <span className="td-name">{u.memberName}</span> : <span className="muted">— bog'lanmagan</span>}</td>
                  <td>{u.memberType ? <span className="lvl">{u.memberType === "driver" ? "🚗 Haydovchi" : "🏅 Mijoz"}</span> : "—"}</td>
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
  useEffect(() => {
    adminApi.northstar().then(setNs).catch(() => undefined);
    adminApi.driverAnalytics().then(setDa).catch(() => undefined);
  }, []);
  const delta = ns ? ns.weekCompleted - ns.prevWeekCompleted : 0;
  const maxBar = da ? Math.max(1, ...da.histogram.map((h) => h.drivers)) : 1;
  return (
    <div>
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

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
