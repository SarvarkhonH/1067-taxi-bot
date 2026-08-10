// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 👑 GASHTAK — guruh nazorati
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ Nom «Gashtak» — admin panelda ALLAQACHON «👔 Jamoa» tab bor (xodimlar moduli). Bu BOSHQA
// narsa: mijozlarning kichik guruhi navbat bilan ball yig'adi.
//
// Yettita amal eski `OyinGashtakBlock` dan KO'CHIRILDI, mantiq o'zgarmadi:
//   ro'yxat · tafsilot · chiqarish · tarqatish · sinov a'zo · sinov safar · navbatni belgilash
// Asosiy tamoyil: guruh tarqatilsa ham O'TGAN BALL TARIXI BUZILMAYDI.
import { useMemo, useState } from "react";
import type { OyinAdminGashtakDetail, OyinAdminGashtakRow } from "@t1067/shared";
import { adminApi } from "../api";
import { d as fmtDay, num, phone as fmtPhone } from "../lib/fmt";
import { Badge, Btn, Card, Drawer, ErrBox, Note, Skeleton, Stat, Table, useLoad, useToast, type Col } from "./ui";

export function Gashtak() {
  const list = useLoad(() => adminApi.oyinGashtakList().then((r) => r.rows), []);
  const [q, setQ] = useState("");
  const [code, setCode] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = list.data ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((g) => g.name.toLowerCase().includes(s) || g.code.toLowerCase().includes(s) || g.leaderName.toLowerCase().includes(s) || String(g.leaderId) === s);
  }, [list.data, q]);

  if (list.err) return <ErrBox err={list.err} onRetry={list.reload} />;
  if (!list.data) return <Card title="👑 Gashtak"><Skeleton rows={6} /></Card>;

  const all = list.data;
  const active = all.filter((g) => !g.disbandedAt);
  const cols: Col<OyinAdminGashtakRow>[] = [
    { key: "name", label: "Guruh", sort: (g) => g.name, render: (g) => <><span className="oy-main">{g.name}</span><div className="oy-sub oy-mono">{g.code}</div></> },
    { key: "leader", label: "Boshliq", sort: (g) => g.leaderName, render: (g) => <>{g.leaderName} <span className="oy-sub oy-mono">#{g.leaderId}</span></> },
    { key: "n", label: "A'zo", align: "r", sort: (g) => g.memberCount, render: (g) => g.memberCount },
    { key: "ball", label: "Jami ball", align: "r", sort: (g) => g.ballEarnedTotal, render: (g) => <span className="oy-coin">{num(g.ballEarnedTotal)}</span> },
    { key: "created", label: "Ochilgan", sort: (g) => g.createdAt, render: (g) => <span className="oy-sub">{fmtDay(g.createdAt)}</span> },
    { key: "st", label: "Holat", render: (g) => (g.disbandedAt ? <Badge tone="mute">tarqatilgan</Badge> : <Badge tone="ok">faol</Badge>) },
  ];

  return (
    <>
      <div className="oy-grid oy-g4">
        <Stat k="Faol guruh" v={num(active.length)} s={`${all.length - active.length} tasi tarqatilgan`} />
        <Stat k="Guruhdagi odam" v={num(active.reduce((s, g) => s + g.memberCount, 0))} s={active.length > 0 ? `o'rtacha ${(active.reduce((s, g) => s + g.memberCount, 0) / active.length).toFixed(1)} kishi` : "—"} />
        <Stat k="Berilgan ball" v={num(all.reduce((s, g) => s + g.ballEarnedTotal, 0))} s="navbat bonuslari" tone="coin" />
        <Stat k="Bo'sh guruh" v={num(active.filter((g) => g.memberCount <= 1).length)} s="faqat boshliq bor" tone={active.some((g) => g.memberCount <= 1) ? "warn" : undefined} />
      </div>

      <Card
        title="👑 Gashtak guruhlari"
        sub={`${num(rows.length)} ta · guruhni bosing → tafsilot`}
        head={<span className="oy-spacer"><input className="oy-inp oy-srch" placeholder="🔍 Nom, kod yoki boshliq…" value={q} onChange={(e) => setQ(e.target.value)} /></span>}
        flush
      >
        <Table rows={rows} cols={cols} rowKey={(g) => g.code} onRow={(g) => setCode(g.code)} empty={all.length === 0 ? "Hali birorta gashtak yo'q." : "Bu qidiruv bo'yicha guruh yo'q."} />
      </Card>

      <Note>
        Guruh a'zosi chiqarilsa yoki guruh tarqatilsa ham <b>o'tgan oylarning ball tarixi
        buzilmaydi</b> — hisob shu tamoyilga quriladi (yozuvlar o'zgarmas ledgerda).
      </Note>

      {code && <GroupDrawer code={code} onClose={() => setCode(null)} onChanged={list.reload} />}
    </>
  );
}

function GroupDrawer({ code, onClose, onChanged }: { code: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const g = useLoad(() => adminApi.oyinGashtakDetail(code), [code]);
  const [busy, setBusy] = useState(false);
  const [testName, setTestName] = useState("");
  const [testRides, setTestRides] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [turnTarget, setTurnTarget] = useState("");
  const [turnNote, setTurnNote] = useState("");

  const run = async (fn: () => Promise<{ ok: boolean }>, msg: string): Promise<void> => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) { toast(msg, "ok"); g.reload(); onChanged(); }
      else toast("Bajarilmadi — shartlarni tekshiring", "bad");
    } catch (e) { toast(e instanceof Error ? e.message : "Xato", "bad"); }
    finally { setBusy(false); }
  };

  const d: OyinAdminGashtakDetail | null = g.data;
  const disbanded = !!d?.disbandedAt;

  return (
    <Drawer
      open onClose={onClose}
      head={
        <>
          <div className="oy-ava">👑</div>
          <div>
            <div className="oy-card-t">{d?.name ?? "Yuklanmoqda…"}</div>
            <div className="oy-dim"><span className="oy-mono">{code}</span>{disbanded && <> · <Badge tone="mute">TARQATILGAN {fmtDay(d?.disbandedAt)}</Badge></>}</div>
          </div>
          <div className="oy-spacer"><Btn sm variant="ghost" onClick={onClose}>✕</Btn></div>
        </>
      }
      foot={!disbanded && d ? (
        <Btn variant="dgr" disabled={busy} onClick={() => {
          if (!window.confirm(`«${d.name}» guruhi BUTUNLAY TARQATILSINMI?\n\nHamma a'zo chiqariladi. O'tgan oylarning ball tarixi SAQLANADI — faqat guruh endi faol bo'lmaydi.\n\nBu amal qaytarilmaydi.`)) return;
          void run(() => adminApi.oyinGashtakDisband(code), "Guruh tarqatildi — ball tarixi saqlandi").then(onClose);
        }}>🗑 Tarqatish</Btn>
      ) : undefined}
    >
      {g.err && <ErrBox err={g.err} onRetry={g.reload} />}
      {!d && !g.err && <Skeleton rows={6} />}
      {d && (
        <>
          {!disbanded && (
            <Note>
              <b>🧪 Sinov a'zo qo'shish</b> — jonli sinash uchun, haqiqiy Telegram akkaunt shart emas.
              Haqiqiy a'zolarga, RideReward'ga va Member yozuvlariga TEGMAYDI.
              <div className="oy-row">
                <input className="oy-inp oy-srch" placeholder="Ism (masalan «Test 1»)" value={testName} onChange={(e) => setTestName(e.target.value)} />
                <input className="oy-inp oy-srch" placeholder="Boshlang'ich safar" value={testRides} onChange={(e) => setTestRides(e.target.value)} />
                <Btn sm disabled={busy || !testName.trim()} onClick={() => void run(() => adminApi.oyinGashtakAddTestMember(code, testName.trim(), Number(testRides) || 0), "Sinov a'zo qo'shildi").then(() => { setTestName(""); setTestRides(""); })}>+ Qo'shish</Btn>
                {d.members.some((m) => m.isTest) && (
                  <Btn sm variant="ghost" disabled={busy} onClick={() => {
                    if (!window.confirm("Barcha SINOV a'zolari olib tashlansinmi?\n\nHaqiqiy a'zolarga tegilmaydi.")) return;
                    void run(() => adminApi.oyinGashtakClearTest(code).then((r) => ({ ok: r.ok })), "Sinov a'zolar tozalandi");
                  }}>🧹 Sinovlarni tozalash</Btn>
                )}
              </div>
            </Note>
          )}

          <div>
            <div className="oy-sec">A'zolar ({d.members.length})</div>
            <Table
              rows={d.members} rowKey={(m) => m.memberId}
              cols={[
                {
                  key: "name", label: "A'zo",
                  render: (m) => (
                    <>
                      {m.isLeader && "👑 "}{m.isTest && "🧪 "}<span className="oy-main">{m.name}</span> <span className="oy-sub oy-mono">#{m.memberId}</span>
                      {!m.inGroup && <span className="oy-sub"> · chiqib ketgan</span>}
                    </>
                  ),
                },
                { key: "phone", label: "Telefon", render: (m) => <span className="oy-sub">{m.phone ? fmtPhone(m.phone) : "—"}</span> },
                { key: "joined", label: "Qo'shilgan", render: (m) => <span className="oy-sub">{m.joinedAt ? fmtDay(m.joinedAt) : "—"}</span> },
                { key: "turn", label: "Navbat oyi", render: (m) => <span className="oy-sub">{m.turnMonth ?? "—"}</span> },
                {
                  key: "rides", label: "Umrbod safar", align: "r",
                  render: (m) => (m.isTest && m.inGroup
                    ? <input className="oy-inp oy-srch" defaultValue={m.ridesLifetime} disabled={busy}
                        onBlur={(e) => { if (e.target.value !== String(m.ridesLifetime)) void run(() => adminApi.oyinGashtakSetTestRides(code, m.memberId, month, Math.max(0, Math.round(Number(e.target.value) || 0))), "Sinov safar soni yangilandi"); }} />
                    : num(m.ridesLifetime)),
                },
                { key: "ball", label: "Jami ball", align: "r", render: (m) => <span className="oy-coin">{num(m.ballEarnedTotal)}</span> },
                {
                  key: "act", label: "",
                  render: (m) => (m.inGroup && !m.isLeader && !disbanded
                    ? <Btn sm disabled={busy} onClick={() => {
                      if (!window.confirm(`${m.name} guruhdan CHIQARILSINMI?\n\nO'tgan navbat ballari SAQLANADI — faqat kelajakdagi a'zolik bekor bo'ladi.`)) return;
                      void run(() => adminApi.oyinGashtakKick(code, m.memberId), `${m.name} chiqarildi`);
                    }}>Chiqarish</Btn>
                    : null),
                },
              ]}
            />
          </div>

          {!disbanded && (
            <Note>
              <b>🎯 Navbatni qo'lda belgilash</b> — odatda boshliqning o'zi ilovada qiladi.
              Bu — nizo yoki xato bosilgan holatlar uchun qolgan yo'l.
              <div className="oy-row">
                <input className="oy-inp oy-srch" placeholder="YYYY-MM" value={month} onChange={(e) => setMonth(e.target.value)} />
                <select className="oy-inp oy-srch" value={turnTarget} onChange={(e) => setTurnTarget(e.target.value)}>
                  <option value="">Odam tanlang…</option>
                  {d.members.filter((m) => m.inGroup).map((m) => <option key={m.memberId} value={m.memberId}>{m.isTest ? "🧪 " : ""}{m.name}</option>)}
                </select>
                <input className="oy-inp" placeholder="Sabab / e'lon matni" value={turnNote} onChange={(e) => setTurnNote(e.target.value)} />
                <Btn sm variant="pri" disabled={busy || !turnTarget} onClick={() => void run(() => adminApi.oyinGashtakSetTurn(code, month, Number(turnTarget), turnNote.trim()), "Navbat belgilandi · audit jurnaliga yozildi").then(() => { setTurnTarget(""); setTurnNote(""); })}>Belgilash</Btn>
              </div>
              {d.turnOverrides.length > 0 && (
                <div>
                  <b>📅 Tarix:</b>
                  {d.turnOverrides.map((t) => <div key={t.monthKey} className="oy-dim3">{t.monthKey}: {t.note}</div>)}
                </div>
              )}
            </Note>
          )}
        </>
      )}
    </Drawer>
  );
}
