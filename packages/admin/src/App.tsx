import { useEffect, useMemo, useState } from "react";
import {
  formatNumber,
  type AdminAuditRow,
  type AdminBotUsersResponse,
  type AdminEconomy,
  type AdminGrowth,
  type AdminHealth,
  type AdminLiveBooking,
  type AdminMemberRow,
  type AdminStats,
} from "@t1067/shared";
import { adminApi } from "./api";

type Tab = "overview" | "driver" | "client" | "botusers" | "actions" | "audit";

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  // poll health for the always-on status pill
  useEffect(() => {
    const load = () => adminApi.health().then(setHealth).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (error === "forbidden") return <Denied />;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "📊 Umumiy" },
    { id: "driver", label: "🚗 Haydovchi" },
    { id: "client", label: "🏅 Mijoz" },
    { id: "botusers", label: "👥 Bot" },
    { id: "actions", label: "⚡ Amallar" },
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
        <HealthPill h={health} />
      </header>

      <div className="seg seg-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "seg-btn active" : "seg-btn"} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === "overview" && <Overview health={health} />}
      {(tab === "driver" || tab === "client") && <MembersTab type={tab} />}
      {tab === "botusers" && <BotUsersTab />}
      {tab === "actions" && <ActionsView />}
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
          <Card icon="🪙" label="Coin egalari" value={formatNumber(growth.coinHolders)} />
        </section>
      )}

      {eco && (
        <section className="panel">
          <div className="panel-title">💰 Iqtisod (coin)</div>
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

function Denied() {
  return (
    <div className="screen center">
      <div>
        <div style={{ fontSize: 56 }}>⛔</div>
        <h2>Ruxsat yo'q</h2>
        <p className="muted">Bu sahifa faqat administratorlar uchun.<br />Telegram id'ingizni <code>ADMIN_TELEGRAM_IDS</code> ga qo'shing.</p>
      </div>
    </div>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
