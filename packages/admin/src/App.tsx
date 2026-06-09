import { useEffect, useMemo, useState } from "react";
import {
  formatNumber,
  type AdminBotUsersResponse,
  type AdminMemberRow,
  type AdminStats,
} from "@t1067/shared";
import { adminApi } from "./api";

type Tab = "driver" | "client" | "botusers";

export function App() {
  const [tab, setTab] = useState<Tab>("driver");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [members, setMembers] = useState<AdminMemberRow[]>([]);
  const [botUsers, setBotUsers] = useState<AdminBotUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");

  const load = async (t: Tab) => {
    try {
      if (t === "botusers") {
        setBotUsers(await adminApi.botUsers());
      } else {
        const [s, m] = await Promise.all([adminApi.stats(t), adminApi.members(t)]);
        setStats(s);
        setMembers(m);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    setQuery("");
    void load(tab);
  }, [tab]);

  const onSync = async () => {
    setSyncing(true);
    try {
      await adminApi.sync();
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  if (error === "forbidden") return <Denied />;
  if (error) return <div className="screen center muted">⚠️ {error}</div>;

  const lastSync = stats?.lastSync ?? null;

  return (
    <div className="dash">
      <header className="bar">
        <div className="bar-brand">
          <span className="logo">🚕</span>
          <div>
            <div className="bar-title">1067 TAXI · <b>Admin</b></div>
            <div className="bar-sub muted">Boshqaruv paneli</div>
          </div>
        </div>
        <div className="bar-right">
          <div className="sync-info muted">
            {lastSync ? (
              <>Sync: <b className={lastSync.status === "ok" ? "ok" : "bad"}>{lastSync.status}</b> · {lastSync.membersSeen} ta · {fmtTime(lastSync.at)}</>
            ) : ""}
          </div>
          <button className="btn" onClick={onSync} disabled={syncing}>{syncing ? "⏳ Sync…" : "🔄 Sync now"}</button>
        </div>
      </header>

      <div className="seg" style={{ marginTop: 16, maxWidth: 460 }}>
        <button className={tab === "driver" ? "seg-btn active" : "seg-btn"} onClick={() => setTab("driver")}>🚗 Haydovchilar</button>
        <button className={tab === "client" ? "seg-btn active" : "seg-btn"} onClick={() => setTab("client")}>🏅 Mijozlar</button>
        <button className={tab === "botusers" ? "seg-btn active" : "seg-btn"} onClick={() => setTab("botusers")}>👥 Bot a'zolari</button>
      </div>

      {tab === "botusers" ? (
        <BotUsersView data={botUsers} query={query} setQuery={setQuery} />
      ) : (
        <MembersView type={tab} stats={stats} members={members} query={query} setQuery={setQuery} />
      )}
    </div>
  );
}

function MembersView({
  type,
  stats,
  members,
  query,
  setQuery,
}: {
  type: "driver" | "client";
  stats: AdminStats | null;
  members: AdminMemberRow[];
  query: string;
  setQuery: (s: string) => void;
}) {
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
        <div className="panel-title">🏆 Top-5 ({stats.metricLabel})</div>
        <div className="chart">
          {stats.topMembers.map((r) => {
            const max = Math.max(1, ...stats.topMembers.map((x) => x.points));
            return (
              <div key={r.memberId} className="chart-row">
                <div className="chart-label">{r.level.emoji} {r.fullName}</div>
                <div className="chart-bar"><span style={{ width: `${(r.points / max) * 100}%`, background: r.level.color }} /></div>
                <div className="chart-val">{formatNumber(r.points)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">{isDriver ? "Haydovchilar" : "Mijozlar"} ({formatNumber(filtered.length)})</div>
          <input className="search" placeholder="🔍 Ism, raqam, telefon…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>{isDriver ? "Haydovchi" : "Mijoz"}</th><th>Daraja</th>
                <th className="num">{stats.metricLabel}</th><th className="num">Safar</th>
                {isDriver && <th className="num">Reyting</th>}<th>TG</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((d, i) => (
                <tr key={d.id}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <div className="td-name">{d.fullName}</div>
                    <div className="td-sub muted">{(isDriver ? d.carNumber : null) ?? d.phone ?? "—"}</div>
                  </td>
                  <td><span className="lvl">{d.level.emoji} {d.level.name}</span></td>
                  <td className="num strong">{formatNumber(d.points)}</td>
                  <td className="num">{formatNumber(d.trips)}</td>
                  {isDriver && <td className="num">{d.rating.toFixed(2)}</td>}
                  <td>{d.linked ? <span className="dot ok" title="bog'langan" /> : <span className="dot" title="bog'lanmagan" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && <div className="muted" style={{ padding: 10, fontSize: 12 }}>Birinchi 500 ko'rsatildi. Qidiruvdan foydalaning.</div>}
        </div>
      </section>
    </>
  );
}

function BotUsersView({
  data,
  query,
  setQuery,
}: {
  data: AdminBotUsersResponse | null;
  query: string;
  setQuery: (s: string) => void;
}) {
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
            <thead>
              <tr>
                <th>#</th><th>Foydalanuvchi</th><th>Telefon</th><th>Profil</th><th>Tur</th><th>Oxirgi faollik</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((u, i) => (
                <tr key={u.telegramId}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <div className="td-name">{u.name} {u.isAdmin && <span className="lvl">admin</span>}</div>
                    <div className="td-sub muted">{u.username ? `@${u.username}` : u.telegramId}</div>
                  </td>
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
