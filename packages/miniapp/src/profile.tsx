// 👤 Profil (feature "newprofile", UY_REDESIGN Bosqich 5) — the "hisobim markazi": unified orders
// (taxi + do'kon + restoran + yo'l), saved addresses, favorites, tier, referral, settings (3-theme
// picker), partner onboarding. Reuses existing endpoints (no new server work) + shared --nh theme
// tokens. Classic profile stays the fallback when the flag is OFF.
import { useEffect, useState } from "react";
import type { MeResponse, ShopProductView } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { cloudGet, cloudSet, haptic, tg } from "./telegram";
import { AccountCard, TierLadderCompact } from "./wallet";

// ── tema: mantiq `theme.ts` da (App uni birinchi paintdan oldin chaqiradi; bu fayl esa lazy).
//    Bu yerdan qayta eksport — eski importlar buzilmasin.
export { applyTheme, initTheme, syncThemeFromCloud, saveTheme, THEME_KEY, THEMES } from "./theme";

export function ThemePicker() {
  const [t, setT] = useState<string>(() => document.documentElement.getAttribute("data-theme") || "dark");
  const pick = (v: string) => {
    haptic();
    applyTheme(v);
    try { localStorage.setItem(THEME_KEY, v); } catch { /* ignore */ }
    cloudSet(THEME_KEY, v); // ☁️ boshqa qurilmada ham shu mavzu ochiladi
    setT(v);
  };
  const opts: [string, string][] = [["dark", "Tungi"], ["light", "Kunduzgi"], ["vibrant", "Yorqin"]];
  return (
    <div className="nh-settings-row">
      <span className="nh-set-lb">🎨 Mavzu</span>
      <div className="nh-seg">{opts.map(([v, l]) => <b key={v} className={t === v ? "on" : ""} onClick={() => pick(v)}>{l}</b>)}</div>
    </div>
  );
}

type OrderRow = { key: string; icon: string; iconCls: string; title: string; sub: string; status: string; kind: "done" | "way" | "book" | "bad"; ts: number; amount: string; nav: string };

const num = (n: number) => n.toLocaleString("ru-RU");
function ago(iso: string): string {
  const d = Date.parse(iso); if (!Number.isFinite(d)) return "";
  const s = (Date.now() - d) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} daq oldin`;
  if (s < 86400) return `${Math.round(s / 3600)} soat oldin`;
  return `${Math.round(s / 86400)} kun oldin`;
}
const rideKind = (s: string): OrderRow["kind"] => /cancel|bekor/i.test(s) ? "bad" : "done";
const shopKind = (s: string): OrderRow["kind"] => s === "delivered" ? "done" : s === "pending" ? "way" : "bad";
const foodKind = (s: string): OrderRow["kind"] => /deliver|yetkaz/i.test(s) && !/way|yo/i.test(s) ? "done" : /cancel|reject|bekor/i.test(s) ? "bad" : "way";
const icKind = (s: string): OrderRow["kind"] => /cancel|bekor/i.test(s) ? "bad" : /complete|arriv|done|tugadi/i.test(s) ? "done" : "book";
const KIND_LB: Record<OrderRow["kind"], string> = { done: "Yakunlandi", way: "Yo'lda", book: "Bron", bad: "Bekor" };

export function NewProfileView({ me, onNav, onBanner }: { me: MeResponse; onNav: (t: string) => void; onBanner?: (m: string) => void }) {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [favs, setFavs] = useState<ShopProductView[]>([]);
  const [addrs, setAddrs] = useState<{ id: number; name: string }[]>([]);
  const [ref, setRef] = useState<{ invited: number; earned: number } | null>(null);
  const [rides, setRides] = useState<number | null>(null);
  const f = me.flags ?? {};

  useEffect(() => {
    let alive = true;
    const empty = <T,>(): Promise<T[]> => Promise.resolve([] as T[]);
    Promise.all([
      api.bookingHistory().catch(() => ({ rides: [], totals: { count: 0, spent: 0, cashback: 0, savingsPct: 0 } })),
      f.shop ? api.shopOrders().then((r) => r.orders).catch(() => []) : empty<import("@t1067/shared").ShopPurchaseView>(),
      f.restoran ? api.restoranOrders().then((r) => r.orders).catch(() => []) : empty<import("@t1067/shared").FoodOrderView>(),
      f.intercity ? api.icMyBookings().catch(() => []) : empty<import("./api").IntercityBookingRow>(),
      f.shop ? api.shopFavs().then((r) => r.products).catch(() => []) : empty<ShopProductView>(),
      api.recentPickups().catch(() => []),
      api.referral().catch(() => null),
    ]).then(([hist, shop, food, ic, favList, recent, referral]) => {
      if (!alive) return;
      setRides(hist.totals.count);
      const rows: OrderRow[] = [];
      for (const r of hist.rides.slice(0, 10)) rows.push({ key: "r" + r.id, icon: "🚖", iconCls: "taxi", title: r.addressName || "Safar", sub: "Taxi · " + ago(r.at), status: KIND_LB[rideKind(r.status)], kind: rideKind(r.status), ts: Date.parse(r.at) || 0, amount: num(r.payment) + " so'm", nav: "history" });
      for (const o of shop) rows.push({ key: "s" + o.id, icon: "🏪", iconCls: "shop", title: o.productName, sub: "Do'kon · " + ago(o.createdAt), status: KIND_LB[shopKind(o.status)], kind: shopKind(o.status), ts: Date.parse(o.createdAt) || 0, amount: num(o.priceTanga) + " 🪙", nav: "dokon" });
      for (const o of food) rows.push({ key: "f" + o.id, icon: "🍽", iconCls: "food", title: o.restaurantName, sub: "Restoran · " + ago(o.createdAt), status: KIND_LB[foodKind(o.status)], kind: foodKind(o.status), ts: Date.parse(o.createdAt) || 0, amount: num(o.totalSom) + " so'm", nav: "restoran" });
      for (const o of ic) rows.push({ key: "i" + o.id, icon: "🚐", iconCls: "yol", title: `${o.trip.originCity.name} → ${o.trip.destCity.name}`, sub: "Yo'l · " + ago(o.createdAt), status: KIND_LB[icKind(o.status)], kind: icKind(o.status), ts: Date.parse(o.createdAt) || 0, amount: `${o.seatsBooked} o'rin`, nav: "yol" });
      rows.sort((a, b) => b.ts - a.ts);
      setOrders(rows.slice(0, 8));
      setFavs(favList.filter((p) => p.hasPhoto).slice(0, 6));
      setAddrs(recent.slice(0, 3).map((a) => ({ id: a.id, name: a.name })));
      if (referral) setRef({ invited: referral.invited, earned: referral.earned });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (t: string) => { haptic(); onNav(t); };
  const initial = (me.member.fullName || "").trim().charAt(0).toUpperCase() || "🙂";

  return (
    <div className="nh-view">
      <div className="np-head">
        <div className="np-av" style={{ ["--lvl" as string]: me.level?.color || "var(--nh-brand)" }}><span>{initial}</span></div>
        <div className="np-id">
          <div className="np-nm">{me.member.fullName || "Foydalanuvchi"}</div>
          {me.level?.emoji && <div className="np-tier">{me.level.emoji} {me.level.name ?? "Daraja"}</div>}
        </div>
      </div>

      <div className="np-stats">
        <div className="np-st"><div className="v">{rides ?? "·"}</div><div className="k">Safar</div></div>
        <div className="np-st"><div className="v g">{num(me.coins)}</div><div className="k">🪙 Tanga</div></div>
        <div className="np-st"><div className="v">{num(me.stats.points)}</div><div className="k">Cashback</div></div>
      </div>

      <div className="nh-sh"><div className="t">📦 Mening buyurtmalarim</div><button className="all" onClick={() => go("history")}>Barchasi</button></div>
      {orders === null ? (
        <div className="np-ocard">{[0, 1, 2].map((i) => <div key={i} className="np-orow"><div className="np-oic nh-skel" /><div style={{ flex: 1 }}><div className="nh-skel" style={{ height: 13, marginBottom: 6 }} /><div className="nh-skel" style={{ height: 11, width: "50%" }} /></div></div>)}</div>
      ) : orders.length > 0 ? (
        <div className="np-ocard">
          {orders.map((o) => (
            <button key={o.key} className="np-orow" onClick={() => go(o.nav)}>
              <div className={`np-oic ${o.iconCls}`}>{o.icon}</div>
              <div className="np-ot"><div className="a">{o.title}</div><div className="b">{o.sub}</div></div>
              <div className="np-ost"><div className="p">{o.amount}</div><span className={`np-s ${o.kind}`}>{o.status}</span></div>
            </button>
          ))}
        </div>
      ) : (
        <div className="np-empty">Hali buyurtma yo'q — birinchi safaringizni chaqiring 🚖</div>
      )}

      {addrs.length > 0 && (
        <>
          <div className="nh-sh"><div className="t">📍 Saqlangan manzillar</div></div>
          <div className="np-chips">
            {addrs.map((a, i) => <button key={a.id + a.name} className="np-chip" onClick={() => go("uy")}><span className="ci">{i === 0 ? "🏠" : "📍"}</span>{a.name}</button>)}
          </div>
        </>
      )}

      {favs.length > 0 && (
        <>
          <div className="nh-sh"><div className="t">🧡 Sevimlilar</div><button className="all" onClick={() => go("dokon")}>Barchasi</button></div>
          <div className="np-frow">
            {favs.map((p) => (
              <button key={p.id} className="np-fav" onClick={() => go("dokon")}>
                <div className="im"><img src={apiUrl(`/api/shop/photo/${p.id}?s=1`)} alt="" loading="lazy" decoding="async" onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0")} /><span className="hh">🧡</span></div>
                <div className="fb"><div className="fn">{p.name}</div><div className="fp">{num(p.priceTanga)} 🪙</div></div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="nh-sh"><div className="t">🏅 Daraja & imtiyozlar</div></div>
      <TierLadderCompact me={me} onOpen={() => go("play")} />

      <button className="nh-invite" onClick={() => go("invite")} style={{ marginTop: 14 }}>
        <span className="ii">👥</span>
        <span><b>Do'st chaqir{ref ? ` — ${ref.invited} do'st` : ""}</b><small>{ref && ref.earned > 0 ? `${num(ref.earned)} so'm ishlangan · yana chaqir` : "Har do'st uchun bonus"}</small></span>
        <span className="ar">→</span>
      </button>

      <div className="nh-sh"><div className="t">⚙️ Sozlamalar</div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ThemePicker />
        <button className="nh-settings-row" onClick={() => onBanner?.("🌐 Til: hozircha faqat O'zbekcha")}><span className="nh-set-lb">🌐 Til</span><span style={{ color: "var(--nh-dim)", fontWeight: 600, fontSize: 13 }}>O'zbekcha ›</span></button>
      </div>

      <div className="nh-sh"><div className="t">🤝 Hamkor bo'lish</div></div>
      <div className="np-partners">
        <button className="np-pc" onClick={() => go("invite")}><div className="pi">🚕</div><div className="pt">Haydovchi bo'lish</div><div className="ps">Daromad qo'shing</div></button>
        <button className="np-pc" onClick={() => (f.shop ? go("dokon") : onBanner?.("🏪 Do'kon ochish uchun administrator bilan bog'laning"))}><div className="pi">🏪</div><div className="pt">Do'kon / restoran</div><div className="ps">Mahsulot soting</div></button>
      </div>

      <div style={{ marginTop: 16 }}><AccountCard /></div>
      {/* 🔖 Build shtampi — "yangilanmadi" shikoyatini 2 soniyada tekshirish uchun. Telegram
          Mini App'ni keshlaydi; bu sana eskimasa, demak telefon eski nusxani ochyapti. */}
      <div style={{ marginTop: 18, textAlign: "center", fontSize: 11, color: "var(--nh-dim)", opacity: .7 }}>
        BirJoy · {document.querySelector('meta[name="birjoy-build"]')?.getAttribute("content") ?? "—"}
      </div>
    </div>
  );
}
