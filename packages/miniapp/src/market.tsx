import { useEffect, useState } from "react";
import { formatNumber } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";
import { Spinner } from "./components";
import type { ItemsResponse } from "./api";

// 💎 Xazina (Kolleksiya): catalog mint + my items + internal resale (10% burn)
function CollectionSection({ onBanner }: { onBanner: (m: string) => void }) {
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.items().then(setData).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  if (!data) return null;

  const run = async (fn: () => Promise<{ ok: boolean; reason?: string; name?: string; serial?: number }>, okMsg: (r: { name?: string; serial?: number }) => string) => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await fn();
      onBanner(r.ok ? okMsg(r) : r.reason === "insufficient" ? "Tanga yetarli emas" : r.reason === "sold_out" ? "Sotuvda qolmadi!" : r.reason === "need_rides" ? "Kamida 3 safar kerak" : "Xatolik");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass pad">
      <div className="section-title">💎 Xazina — noyob buyumlar</div>
      <div className="mk-listings">
        {data.catalog.map((c) => (
          <div key={c.code} className="mk-item" style={{ cursor: "default" }}>
            <span className="mk-item-emoji">{c.emoji}</span>
            <span className="mk-item-title">{c.name}{c.left != null && <span className="muted"> · qoldi {c.left}</span>}</span>
            <button className="btn-primary sm" disabled={busy || c.left === 0} onClick={() => run(() => api.itemMint(c.code), (r) => `💎 ${c.name} #${r.serial} sizniki!`)}>
              {c.left === 0 ? "TUGADI" : `🪙 ${formatNumber(c.price)}`}
            </button>
          </div>
        ))}
      </div>
      {data.mine.length > 0 && (
        <>
          <div className="muted mk-sub" style={{ marginTop: 10 }}>Mening xazinam ({data.mine.length}) · qismlar {data.partsProgress.have}/{data.partsProgress.total}</div>
          <div className="badge-strip" style={{ fontSize: 22 }}>
            {data.mine.slice(0, 16).map((i) => (
              <span key={i.id} title={`${i.name}${i.cap > 0 ? ` #${i.serial}/${i.cap}` : ""}`}>{i.emoji}</span>
            ))}
          </div>
        </>
      )}
      {data.market.length > 0 && (
        <>
          <div className="muted mk-sub" style={{ marginTop: 10 }}>🛒 Tanga bozori (sotuvda):</div>
          {data.market.slice(0, 8).map((l) => (
            <div key={l.listingId} className="mk-voucher">
              <span>{l.emoji} {l.name}{l.serial ? ` #${l.serial}` : ""}</span>
              {l.mine ? (
                <span className="muted">sizniki</span>
              ) : (
                <button className="btn-violet sm" disabled={busy} onClick={() => run(() => api.itemBuy(l.listingId), (r) => `💎 ${r.name ?? "Buyum"} sotib olindi!`)}>
                  🪙 {formatNumber(l.price)}
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

interface ShopView {
  id: number;
  name: string;
  emoji: string;
  category: string;
  listings: { id: number; title: string; emoji: string; priceCoins: number }[];
}

interface OrderView {
  id: number;
  shopName: string;
  title: string;
  emoji: string;
  priceCoins: number;
  voucherCode: string;
  status: string;
  at: string;
}

function BuySheet({ shop, listing, coins, onClose, onDone }: {
  shop: ShopView;
  listing: ShopView["listings"][number];
  coins: number;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    haptic();
    try {
      const r = await api.marketBuy(listing.id);
      if (r.ok && r.voucherCode) {
        confetti();
        setVoucher(r.voucherCode);
        onDone(`🏪 Xarid qilindi! Kod: ${r.voucherCode}`);
      } else {
        const msgs: Record<string, string> = {
          insufficient: "Tanga yetarli emas",
          per_user_limit: "Bu mahsulotni ko'p marta olib bo'lmaydi",
          not_found: "Mahsulot topilmadi",
        };
        setErr(msgs[r.reason ?? ""] ?? "Xatolik yuz berdi");
      }
    } catch {
      setErr("Tarmoq xatosi — qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {voucher ? (
          <>
            <h3>🎟 Vaucher tayyor!</h3>
            <div className="voucher-code">{voucher}</div>
            <p className="muted sheet-sub">
              Bu kodni <b>{shop.name}</b>da ko'rsating — {listing.title.toLowerCase()} sizniki.
              Kod «Xaridlarim»da saqlanadi.
            </p>
            <button className="btn-primary" onClick={onClose}>Tushunarli</button>
          </>
        ) : (
          <>
            <h3>{listing.emoji} {listing.title}</h3>
            <p className="muted sheet-sub">{shop.emoji} {shop.name} · narx <b>{formatNumber(listing.priceCoins)} tanga</b></p>
            <div className={coins >= listing.priceCoins ? "sheet-ok" : "sheet-warn"}>
              Sizda: {formatNumber(coins)} tanga
            </div>
            {err && <div className="sheet-err">{err}</div>}
            <button className="btn-primary" disabled={busy || coins < listing.priceCoins} onClick={submit}>
              {busy ? "Sotib olinmoqda…" : `🪙 ${formatNumber(listing.priceCoins)} — sotib olish`}
            </button>
            <button className="btn-ghost" onClick={onClose}>Bekor</button>
          </>
        )}
      </div>
    </div>
  );
}

// Shop owner mini-panel: pending vouchers + redeem-by-code.
function MyShopPanel({ onBanner }: { onBanner: (m: string) => void }) {
  const [mine, setMine] = useState<Awaited<ReturnType<typeof api.marketMyShop>> | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.marketMyShop().then(setMine).catch(() => setMine(null));
  useEffect(() => {
    load();
  }, []);

  if (!mine) return null;

  const redeem = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.marketRedeem(code);
      if (r.ok) {
        confetti();
        onBanner(`✅ Vaucher qabul qilindi: ${r.title ?? ""}`);
        setCode("");
        load();
      } else {
        const msgs: Record<string, string> = { not_found: "Kod topilmadi", already: "Allaqachon ishlatilgan", not_owner: "Bu sizning do'koningiz emas" };
        onBanner(`⚠️ ${msgs[r.reason ?? ""] ?? "Xatolik"}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass pad">
      <div className="section-title">{mine.shop.emoji} Mening do'konim — {mine.shop.name}</div>
      <div className="login-input-row" style={{ gap: 8 }}>
        <input className="bk-input" placeholder="Mijoz kodi: ABC123" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ flex: 1, textTransform: "uppercase" }} />
        <button className="btn-primary sm" disabled={busy || !code.trim()} onClick={redeem}>{busy ? "…" : "✅"}</button>
      </div>
      {mine.pending.length > 0 && (
        <>
          <div className="muted mk-sub" style={{ marginTop: 8 }}>Kutilayotgan vaucherlar: {mine.pending.length}</div>
          {mine.pending.slice(0, 6).map((p) => (
            <div key={p.id} className="mk-voucher">
              <span>{p.emoji} {p.title}</span>
              <span className="muted">🪙 {formatNumber(p.priceCoins)}</span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export function MarketView({ coins, onBanner }: { coins: number; onBanner: (m: string) => void }) {
  const [shops, setShops] = useState<ShopView[] | null>(null);
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [buy, setBuy] = useState<{ shop: ShopView; listing: ShopView["listings"][number] } | null>(null);
  const [showOrders, setShowOrders] = useState(false);

  const load = () => {
    api.marketShops().then(setShops).catch(() => setShops([]));
    api.marketOrders().then(setOrders).catch(() => undefined);
  };
  useEffect(() => {
    load();
  }, []);

  if (!shops) return <Spinner />;

  const activeVouchers = (orders ?? []).filter((o) => o.status === "issued");

  return (
    <div className="view">
      <div className="section-title">🏪 Bozor — tanga bilan to'lang</div>
      <p className="muted mk-sub">Tangalaringiz Koson do'konlarida pul: tanlang, kod oling, do'konda ko'rsating.</p>

      <MyShopPanel onBanner={onBanner} />

      <CollectionSection onBanner={onBanner} />

      {activeVouchers.length > 0 && (
        <section className="glass pad">
          <div className="section-title">🎟 Faol vaucherlarim</div>
          {activeVouchers.map((o) => (
            <div key={o.id} className="mk-voucher">
              <span>{o.emoji} {o.title}</span>
              <b className="mk-code">{o.voucherCode}</b>
            </div>
          ))}
        </section>
      )}

      {shops.length === 0 ? (
        <section className="glass pad" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🏗</div>
          <p className="muted">Do'konlar tez orada qo'shiladi — birinchi hamkorlar yo'lda!</p>
        </section>
      ) : (
        shops.map((s) => (
          <section key={s.id} className="glass pad">
            <div className="section-title">{s.emoji} {s.name}</div>
            <div className="mk-listings">
              {s.listings.map((l) => (
                <button key={l.id} className="mk-item" onClick={() => { haptic(); setBuy({ shop: s, listing: l }); }}>
                  <span className="mk-item-emoji">{l.emoji}</span>
                  <span className="mk-item-title">{l.title}</span>
                  <span className="mk-item-price">🪙 {formatNumber(l.priceCoins)}</span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {(orders ?? []).length > 0 && (
        <button className="btn-ghost" onClick={() => setShowOrders((v) => !v)}>
          {showOrders ? "Yopish" : `📜 Xaridlarim (${orders!.length})`}
        </button>
      )}
      {showOrders && orders && (
        <section className="glass pad">
          {orders.map((o) => (
            <div key={o.id} className="mk-voucher">
              <span>{o.status === "redeemed" ? "✅" : "🎟"} {o.title}</span>
              <span className="muted">{o.status === "redeemed" ? "ishlatilgan" : o.voucherCode}</span>
            </div>
          ))}
        </section>
      )}

      {buy && (
        <BuySheet
          shop={buy.shop}
          listing={buy.listing}
          coins={coins}
          onClose={() => { setBuy(null); load(); }}
          onDone={onBanner}
        />
      )}
    </div>
  );
}
