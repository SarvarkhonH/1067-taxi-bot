// ◎ BUGUN — command-center. "3 soniya testi": ochilganda darhol javob beradi —
// hammasi joyidami · bugun qancha · nima tiqilib qolgan · nima tasdiq kutmoqda.
//
// Har vidjet MAVJUD endpointdan oziqlanadi (yangi backend ishi faqat bitta:
// /api/admin/daily-stats — trend uchun).
import { useEffect, useMemo, useState } from "react";
import type { AdminHealth, AdminGrowth, AdminLiveBooking, OpsPulse } from "@t1067/shared";
import { adminApi, type DailyStatRow, type OprOpsRow } from "../../api";
import { BarRows, ChartWithTable, Funnel, Sparkline, TrendChart } from "../../design/charts";
import { Async, Badge, Button, Dot, Empty, Panel, Segmented, SkeletonRows, StatCard } from "../../design/kit";
import { delta as calcDelta, mins, num, pctRaw, short, som } from "../../lib/fmt";
import { navigate } from "../../lib/routing";

type Metric = "rides" | "gmv" | "bot" | "cancel";

const METRIC_OPTS: { value: Metric; label: string }[] = [
  { value: "rides", label: "Safarlar" },
  { value: "gmv", label: "GMV" },
  { value: "bot", label: "Bot ulushi" },
  { value: "cancel", label: "Bekor" },
];

/** Bitta so'rovni yuklash + xato holatini bitta joyda saqlash. */
function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | null | undefined; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}

export function Bugun() {
  const [metric, setMetric] = useState<Metric>("rides");
  const [days, setDays] = useState<7 | 14 | 30 | 60>(30);

  const pulse = useLoad<OpsPulse>(() => adminApi.pulse());
  const health = useLoad<AdminHealth>(() => adminApi.health());
  const growth = useLoad<AdminGrowth>(() => adminApi.growth());
  const stats = useLoad<{ days: DailyStatRow[] }>(() => adminApi.dailyStats(days), [days]);
  const live = useLoad<AdminLiveBooking[]>(() => adminApi.bookings());
  const ops = useLoad<{ rows: OprOpsRow[] }>(() => adminApi.oprDashboard());
  const anomalies = useLoad(() => adminApi.anomalies());
  const inbox = useLoad(() => adminApi.inbox());
  const moder = useLoad(() => adminApi.moderationSummary());

  // jonli bloklar 20s da bir yangilanadi (eski panelning 15s naqshi)
  useEffect(() => {
    const t = window.setInterval(() => {
      live.reload();
      ops.reload();
      pulse.reload();
    }, 20_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = stats.data?.days ?? [];
  const x = rows.map((r) => r.day.slice(5).split("-").reverse().join("."));
  const series = useMemo(() => {
    const pick = (r: DailyStatRow): number =>
      metric === "rides"
        ? r.completedRides
        : metric === "gmv"
          ? r.gmv
          : metric === "bot"
            ? r.completedRides > 0 ? (r.botRides / r.completedRides) * 100 : 0
            : r.completedRides + r.cancelledRides > 0
              ? (r.cancelledRides / (r.completedRides + r.cancelledRides)) * 100
              : 0;
    return rows.map(pick);
  }, [rows, metric]);
  const fmtMetric = metric === "gmv" ? short : metric === "rides" ? num : (n: number) => pctRaw(n, 0);

  const stuck = (ops.data?.rows ?? []).filter((r) => r.stuck);
  const alerts = [
    ...(pulse.data?.alerts ?? []).map((a) => ({ bad: a.level === "red", text: a.text })),
    ...(anomalies.data?.items ?? []).map((a) => ({ bad: a.level === "alert", text: a.text })),
  ];

  return (
    <>
      {/* ── SALOMATLIK + OGOHLANTIRISH CHIZIG'I ── */}
      <div className="a2-row-wrap">
        {health.data && (
          <>
            {/* Salomatlik — uch mustaqil signal (kas · baza · bot). Bittasi
                yiqilsa aynan QAYSINISI yiqilganini ko'rsatish kerak: eski panel
                faqat umumiy "ok/bad" bergani uchun sabab har safar boshqa
                joydan qidirilardi. */}
            {(() => {
              const parts = [
                { k: "kas", ok: health.data!.kas.ok, hint: `${health.data!.kas.ms}ms · ${health.data!.kas.mode}` },
                { k: "baza", ok: health.data!.db.ok, hint: `${health.data!.db.ms}ms` },
                { k: "bot", ok: health.data!.bot, hint: health.data!.bookingLive ? "jonli" : "TEST rejimi" },
              ];
              const allOk = parts.every((p) => p.ok);
              return (
                <>
                  <Badge tone={allOk ? "ok" : "bad"}>
                    <Dot tone={allOk ? "ok" : "bad"} live={allOk} /> {allOk ? "Tizim sog'lom" : "Tizimda muammo"}
                  </Badge>
                  {parts
                    .filter((p) => !p.ok)
                    .map((p) => (
                      <Badge tone="bad" key={p.k}>
                        {p.k}: {p.hint}
                      </Badge>
                    ))}
                  {!health.data!.bookingLive && <Badge tone="warn">⚠ TEST rejimi — haqiqiy taksi chaqirilmaydi</Badge>}
                  {health.data!.lastSync && health.data!.lastSync!.ageMin > 30 && (
                    <Badge tone="warn">sinxron {mins(health.data!.lastSync!.ageMin)} oldin</Badge>
                  )}
                </>
              );
            })()}
          </>
        )}
        {pulse.data && <span className="a2-dim">{pulse.data.weekday}</span>}
        {pulse.data && pulse.data.activeNow > 0 && (
          <Badge tone="info">◉ {pulse.data.activeNow} faol safar</Badge>
        )}
        {pulse.data && pulse.data.unassigned > 0 && (
          <Badge tone="warn">⚠ {pulse.data.unassigned} haydovchisiz</Badge>
        )}
        {stuck.length > 0 && <Badge tone="bad">⚠ {stuck.length} tiqilib qolgan</Badge>}
        {pulse.data?.reportsStale && <Badge tone="warn">kas hisobotlari eskirgan — puls to'liq emas</Badge>}
      </div>

      {alerts.length > 0 && (
        <Panel title="⚠️ E'tibor talab qiladi">
          <div className="a2-col">
            {alerts.map((a, i) => (
              <div className="a2-row" key={i}>
                <Dot tone={a.bad ? "bad" : "warn"} />
                <span className={a.bad ? undefined : "a2-dim"}>{a.text}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── 4 ASOSIY RAQAM (bugun vs o'tgan hafta SHU KUNI) ── */}
      <Async
        data={pulse.data}
        error={pulse.error}
        onRetry={pulse.reload}
        skeleton={
          <div className="a2-grid-4">
            {[0, 1, 2, 3].map((i) => (
              <Panel key={i}>
                <SkeletonRows rows={2} h={26} />
              </Panel>
            ))}
          </div>
        }
      >
        {(p) => (
          <div className="a2-grid-4">
            {p.metrics.map((m, i) => {
              const d = m.prevAvailable ? calcDelta(m.today, m.prev) : undefined;
              // yo'nalish "yaxshi"ligi metrikaga bog'liq: safar ↑ yaxshi, bekor ↓ yaxshi
              const good = d && d.dir !== "flat" ? (m.goodWhen === "up" ? d.dir === "up" : d.dir === "down") : undefined;
              const sparkVals = rows.map((r) =>
                i === 0 ? r.completedRides : i === 1 ? r.botRides : i === 2 ? r.cancelledRides : r.gmv,
              );
              return (
                <StatCard
                  key={m.label}
                  label={m.label}
                  value={m.unit === "pct" ? pctRaw(m.today) : num(m.today)}
                  delta={d}
                  deltaSub={m.prevAvailable ? `o'tgan ${p.weekday}` : "solishtirish uchun ma'lumot yetarli emas"}
                  tone={good === undefined ? undefined : good ? "ok" : "bad"}
                  spark={sparkVals.length > 2 ? <Sparkline values={sparkVals} /> : undefined}
                />
              );
            })}
          </div>
        )}
      </Async>

      {/* ── TREND ── */}
      <Panel
        title="Trend"
        actions={
          <div className="a2-row-wrap">
            <Segmented value={metric} onChange={setMetric} options={METRIC_OPTS} />
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: 7 as const, label: "7k" },
                { value: 14 as const, label: "14k" },
                { value: 30 as const, label: "30k" },
                { value: 60 as const, label: "60k" },
              ]}
            />
          </div>
        }
      >
        <Async
          data={stats.data?.days}
          error={stats.error}
          onRetry={stats.reload}
          empty={{ icon: "📈", title: "Kunlik statistika hali yig'ilmagan" }}
        >
          {() => (
            <ChartWithTable
              chart={
                <TrendChart
                  x={x}
                  series={[{ label: METRIC_OPTS.find((o) => o.value === metric)!.label, values: series, area: true }]}
                  format={fmtMetric}
                />
              }
              table={
                <div className="a2-col">
                  {x.map((day, i) => (
                    <div className="a2-between" key={day}>
                      <span className="a2-dim">{day}</span>
                      <span className="a2-num">{fmtMetric(series[i] ?? 0)}</span>
                    </div>
                  ))}
                </div>
              }
            />
          )}
        </Async>
      </Panel>

      <div className="a2-grid-2">
        {/* ── HOZIR FAOL ── */}
        <Panel
          title="Hozir faol"
          actions={
            <Button size="sm" variant="ghost" onClick={() => navigate("jonli")}>
              Hammasi →
            </Button>
          }
        >
          <Async data={ops.data?.rows} error={ops.error} onRetry={ops.reload} empty={{ icon: "✓", title: "Hozir faol buyurtma yo'q" }}>
            {(list) => (
              <div className="a2-col">
                {[...list]
                  .sort((a, b) => Number(b.stuck) - Number(a.stuck) || b.ageMin - a.ageMin)
                  .slice(0, 8)
                  .map((r) => (
                    <div className="a2-between" key={`${r.module}-${r.id}`}>
                      <span className="a2-row">
                        <Dot tone={r.stuck ? "bad" : "ok"} live={!r.stuck} />
                        <span className="a2-truncate">{r.title}</span>
                      </span>
                      <span className="a2-row">
                        <span className="a2-dim-2">{r.status}</span>
                        <span className="a2-num a2-dim">{mins(r.ageMin)}</span>
                        {r.stuck && <Badge tone="bad">uzoq</Badge>}
                      </span>
                    </div>
                  ))}
                {live.data && live.data.length > 0 && (
                  <div className="a2-dim-2">🚕 kas'da {live.data.length} faol taksi buyurtmasi</div>
                )}
              </div>
            )}
          </Async>
        </Panel>

        {/* ── TASDIQ KUTAYOTGANLAR ── */}
        <Panel title="Tasdiq kutmoqda">
          <div className="a2-col-3">
            <Async data={inbox.data} error={inbox.error} onRetry={inbox.reload} skeleton={<SkeletonRows rows={2} />}>
              {(ib) =>
                ib.count === 0 ? (
                  <span className="a2-dim">💵 Yechish so'rovlari yo'q</span>
                ) : (
                  <div className="a2-col">
                    <span className="a2-row">
                      <Badge tone="warn">{ib.count}</Badge>
                      <span>yechish so'rovi</span>
                      <span className="a2-spacer" />
                      <Button size="sm" variant="ghost" onClick={() => navigate("yechishlar")}>
                        Ko'rish →
                      </Button>
                    </span>
                    {ib.pending.slice(0, 3).map((p) => (
                      <div className="a2-between" key={p.id}>
                        <span className="a2-truncate">{p.name}</span>
                        <span className="a2-num">{som(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </Async>
            <Async data={moder.data} error={moder.error} onRetry={moder.reload} skeleton={<SkeletonRows rows={1} />}>
              {(m) => {
                const items = [
                  { label: "AI bilim", n: m.aiKnowledgePending, to: "bilim" },
                  { label: "E'lonlar", n: m.classifiedAdsPending, to: "elonlar" },
                  { label: "Do'konlar", n: m.shopsAwaitingActivation, to: "dokon" },
                ].filter((i) => i.n > 0);
                return items.length === 0 ? (
                  <span className="a2-dim">✓ Moderatsiya navbati bo'sh</span>
                ) : (
                  <div className="a2-col">
                    {items.map((i) => (
                      <div className="a2-between" key={i.label}>
                        <span className="a2-row">
                          <Badge tone="warn">{i.n}</Badge> {i.label}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => navigate(i.to)}>
                          →
                        </Button>
                      </div>
                    ))}
                  </div>
                );
              }}
            </Async>
          </div>
        </Panel>

        {/* ── O'SISH VORONKASI ──────────────────────────────────────────────
            DIQQAT: voronkaga FAQAT haqiqatan ichma-ich joylashgan bosqichlar
            kiradi (bot → raqam ulash → faollik). `coinHolders` voronkaga
            KIRMAYDI: u butun `Member` jadvalidan sanaladi (kas1067 mijozlari
            ham), `botUsers` esa faqat Telegram foydalanuvchilari — ikki xil
            populyatsiya. Voronkaga qo'yilganda "3 331 / 1 110 = 3621%"
            degan bema'ni konversiya chiqdi (jonli ma'lumotda ko'rindi va shu
            yerda tuzatildi). Shuning uchun u alohida ko'rsatkich sifatida. */}
        <Panel title="O'sish voronkasi">
          <Async data={growth.data} error={growth.error} onRetry={growth.reload} skeleton={<SkeletonRows rows={4} h={22} />}>
            {(g) => (
              <div className="a2-col-3">
                <Funnel
                  stages={[
                    { label: "Botga kirgan", value: g.botUsers },
                    { label: "Raqam ulagan", value: g.linked },
                    { label: "24 soatda faol", value: g.active24h },
                  ]}
                />
                <div className="a2-between">
                  <span className="a2-dim">Bugun qo'shilgan · 7 kunda</span>
                  <span className="a2-num">
                    {num(g.newToday)} · {num(g.new7d)}
                  </span>
                </div>
                <div className="a2-between">
                  <span className="a2-dim-2">Tangasi bor (butun baza, voronkadan tashqari)</span>
                  <span className="a2-num a2-dim">{num(g.coinHolders)}</span>
                </div>
              </div>
            )}
          </Async>
        </Panel>

        {/* ── BUGUNGI EMISSIYA ── */}
        <Panel title="Bugungi tanga emissiyasi">
          <Async data={pulse.data} error={pulse.error} onRetry={pulse.reload} skeleton={<SkeletonRows rows={2} h={22} />}>
            {(p) => (
              <div className="a2-col-3">
                <BarRows
                  rows={[
                    { label: "Chiqarilgan", value: p.emissionToday },
                    { label: "Kunlik shift", value: p.emissionCapDay },
                  ]}
                />
                {p.emissionToday > p.emissionCapDay && (
                  <span className="a2-row">
                    <Dot tone="bad" /> <span>Kunlik shiftdan oshgan — sababi tekshirilishi kerak.</span>
                  </span>
                )}
              </div>
            )}
          </Async>
        </Panel>
      </div>

      {(live.error || ops.error) && (
        <Empty icon="⚠️" title="Jonli bloklar yuklanmadi" sub="Boshqa bo'limlar ishlayapti — sahifani yangilab ko'ring." />
      )}
    </>
  );
}
