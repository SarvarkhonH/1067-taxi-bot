// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔮 REJA — «bosishdan OLDIN nima bo'ladi?»
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ HALOL NOM. Bu MONTE-CARLO EMAS va «simulyator» deb atalmaydi.
//
// Loyihada to'liq raqamli egizak BOR (`packages/server/src/sim/` — `predict.ts`, `runArms.ts`,
// 1067'ning 2026-iyul bozori bilan kalibrlangan, ~1 500 qator). Lekin u hozircha git'ga
// QO'SHILMAGAN (boshqa sessiyaning ishi, `git status` da `?? sim/`) — uni panelga ulash uni
// commit qilishni talab qiladi, ya'ni boshqa odamning tugallanmagan ishini chiqarish bo'lardi.
//
// Shuning uchun bu yerda ODDIY chiziqli proyeksiya: har qadami ekranda ochiq ko'rsatiladi va
// «ehtimollik oralig'i» kabi mavjud bo'lmagan aniqlik VA'DA QILINMAYDI. Egizak repoga
// tushganda shu ekran o'sha manbaga ulanadi.
import { useMemo, useState } from "react";
import { OYIN_SOM_PER_BALL, oyinProject } from "@t1067/shared";
import { adminApi } from "../api";
import { num, short } from "../lib/fmt";
import { Badge, Btn, Card, ErrBox, Note, Skeleton, Stat, useLoad } from "./ui";

function parseSum(label: string): number {
  const digits = label.replace(/[^\d]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function Reja() {
  const d = useLoad(async () => {
    const [budget, vitals, catalog, econ] = await Promise.all([
      adminApi.oyinBudget(),
      adminApi.oyinVitals(),
      adminApi.oyinCatalog().then((r) => r.prizes),
      adminApi.bonusEconomy(),
    ]);
    return { budget, vitals, catalog, econ };
  }, []);

  const [rideBall, setRideBall] = useState<number | null>(null);
  const [priceMult, setPriceMult] = useState(1);

  const base = d.data;
  const open = useMemo(() => (base?.catalog ?? []).filter((p) => p.active && p.queued !== true), [base]);

  if (d.err) return <ErrBox err={d.err} onRetry={d.reload} />;
  if (!base) return <Card title="🔮 Reja"><Skeleton rows={6} /></Card>;

  const liveRideBall = Number(base.econ.values.oyinRideBall ?? 35) || 35;
  const rb = rideBall ?? liveRideBall;
  const openSlots = open.reduce((s, p) => s + Math.max(0, p.limit - p.sold), 0);
  const openValueSom = open.reduce((s, p) => s + parseSum(p.valueLabel), 0);
  const avgPriceLive = open.length > 0 ? Math.round(open.reduce((s, p) => s + p.price, 0) / open.length) : 0;
  const avgPrice = Math.max(1, Math.round(avgPriceLive * priceMult));

  const mk = (rideB: number, price: number) => oyinProject({
    rides30d: base.budget.rides30d ?? 0,
    daysLeft: base.vitals.daysLeft ?? 0,
    circulatingBall: base.vitals.circulatingBall,
    rideBall: rideB,
    avgCardPrice: price,
    openSlots,
    openValueSom,
  });

  const now = mk(liveRideBall, avgPriceLive);
  const next = mk(rb, avgPrice);
  const changed = rb !== liveRideBall || priceMult !== 1;

  if (base.vitals.daysLeft == null || base.vitals.daysLeft <= 0) {
    return (
      <Note tone="warn">
        Mavsum tugagan yoki sozlanmagan — proyeksiya qilish uchun <b>qolgan kun</b> kerak.
        Avval «⚙ Sozlama → 📅 Mavsum» da sanalarni kiriting.
      </Note>
    );
  }

  return (
    <>
      <Note tone="brand">
        <b>Bu ehtimollik hisobi emas — oddiy proyeksiya.</b> Manba: oxirgi 30 kunning REAL safar
        soni ({num(base.budget.rides30d ?? 0)} ta), mavsumga qolgan {base.vitals.daysLeft} kun va
        hozirgi ball. Har qadam pastda ochiq ko'rsatilgan. Loyihada to'liq Monte-Carlo egizak bor,
        lekin u hali repoga qo'shilmagan — qo'shilganda shu ekran o'shanga ulanadi va ishonch
        oralig'i chiqadi.
      </Note>

      <div className="oy-grid oy-g2">
        <Card title="Nima o'zgartiramiz" sub="faqat reja — hech narsa saqlanmaydi">
          <div className="oy-col">
            <div>
              <div className="oy-row">
                <span className="oy-dim">Safar bali</span>
                <span className="oy-spacer oy-num"><b>{rb}</b> ball {rb !== liveRideBall && <span className="oy-dim3">(hozir {liveRideBall})</span>}</span>
              </div>
              <input type="range" min={0} max={80} step={5} value={rb} onChange={(e) => setRideBall(Number(e.target.value))} />
            </div>
            <div>
              <div className="oy-row">
                <span className="oy-dim">Karta bahosi</span>
                <span className="oy-spacer oy-num"><b>{priceMult.toFixed(1)}×</b> <span className="oy-dim3">≈ {num(avgPrice)} ball</span></span>
              </div>
              <input type="range" min={0.5} max={2} step={0.1} value={priceMult} onChange={(e) => setPriceMult(Number(e.target.value))} />
            </div>
            <div className="oy-row">
              <Btn sm onClick={() => { setRideBall(null); setPriceMult(1); }}>↺ Hozirgi holat</Btn>
            </div>
            <Note>
              O'zgartirish shu ekranda qoladi. Yoqsa — «⚙ Sozlama → 🎚 Ball jadvali» da
              QO'LDA kiritasiz (ikkinchi ongli qadam, tasodifan saqlanib qolmasin).
            </Note>
          </div>
        </Card>

        <Card title="Mavsum oxirida" sub={changed ? "o'zgartirilgan holat" : "hozirgi holat"}>
          <div className="oy-grid oy-g4">
            <Stat sm k="Berilgan ball" v={short(next.ballFromRides)} tone="coin" />
            <Stat sm k="Sotilgan karta" v={num(next.cardsSold)} />
            <Stat sm k="Sizga tushadi" v={short(next.costSom)} tone="bad" />
            <Stat sm k="Qoplash" v={next.coverage > 0 ? `${next.coverage.toFixed(1)}×` : "—"} tone={next.coverage >= 3 ? "ok" : "bad"} />
          </div>
          {changed && (
            <div className="oy-dim3">
              Hozirgi holatda: {num(now.cardsSold)} karta · {short(now.costSom)} so'm · {now.coverage.toFixed(1)}× qoplash
            </div>
          )}
          {next.coverage > 0 && next.coverage < 3 && (
            <Note tone="bad">
              <b>Qoplash 3× dan past.</b> Bu holatda to'lgan mukofot sizga zarar keltiradi.
              Karta bahosini oshiring yoki safar balini kamaytiring.
            </Note>
          )}
          {next.strandedBall > 0 && (
            <Note tone="warn">
              Mavsum oxirida <b>{num(next.strandedBall)} ball</b> sarflanmay qoladi
              {next.slotsAreTheLimit && <> — sabab: <b>o'rin tugaydi</b>, ball emas</>}.
              Mijoz «yig'dim, lekin olib bo'lmadi» deydi. Navbatdan mukofot oching.
            </Note>
          )}
        </Card>
      </div>

      <Card title="Hisob qanday chiqdi" sub="har qadam ochiq — ishonish uchun tekshiring">
        <div className="oy-tw">
          <table>
            <tbody>
              <tr><td>Oxirgi 30 kunda REAL safar</td><td className="oy-r oy-main">{num(base.budget.rides30d ?? 0)}</td><td className="oy-sub">RideReward jadvalidan</td></tr>
              <tr><td>Kuniga o'rtacha</td><td className="oy-r oy-main">{((base.budget.rides30d ?? 0) / 30).toFixed(1)}</td><td className="oy-sub">30 ga bo'lindi</td></tr>
              <tr><td>Mavsumga qolgan kun</td><td className="oy-r oy-main">{base.vitals.daysLeft}</td><td className="oy-sub">mavsum sanasidan</td></tr>
              <tr><td>Kutilayotgan safar</td><td className="oy-r oy-main">{num(next.projectedRides)}</td><td className="oy-sub">kunlik × qolgan kun</td></tr>
              <tr><td>Yangi ball</td><td className="oy-r oy-coin">{num(next.ballFromRides)}</td><td className="oy-sub">safar × {rb} ball</td></tr>
              <tr><td>Hozir xalqda</td><td className="oy-r oy-coin">{num(base.vitals.circulatingBall)}</td><td className="oy-sub">sarflanmagan</td></tr>
              <tr><td><b>Mavsum oxirida jami ball</b></td><td className="oy-r oy-coin"><b>{num(next.ballAtEnd)}</b></td><td className="oy-sub">ikkisining yig'indisi</td></tr>
              <tr><td>Ball yetadigan karta</td><td className="oy-r">{num(next.cardsAffordable)}</td><td className="oy-sub">jami ball ÷ {num(avgPrice)}</td></tr>
              <tr><td>Bo'sh o'rin</td><td className="oy-r">{num(openSlots)}</td><td className="oy-sub">{open.length} ochiq mukofotda</td></tr>
              <tr><td><b>Sotiladigan karta</b></td><td className="oy-r"><b>{num(next.cardsSold)}</b></td><td className="oy-sub">{next.slotsAreTheLimit ? "o'rin cheklaydi" : "ball cheklaydi"}</td></tr>
              <tr><td>Kassaga</td><td className="oy-r">{num(next.kassaSom)} so'm</td><td className="oy-sub">karta × {num(avgPrice)} × {OYIN_SOM_PER_BALL}</td></tr>
              <tr><td>Mukofot xarajati</td><td className="oy-r">{num(next.costSom)} so'm</td><td className="oy-sub">to'lgan ulush × {short(openValueSom)}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Note>
        <b>Nimani hisobga OLMAYDI:</b> yangi mijozlar oqimi · bayram/mavsumiylik · do'st chaqirish
        bonuslari · hikoya va kunlik ballar · mukofot navbatdan ochilishi. Shuning uchun bu
        <b> pastki chegara</b> deb qaralsin, aniq bashorat emas.
      </Note>
    </>
  );
}
