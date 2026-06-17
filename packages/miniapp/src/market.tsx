import { useEffect, useState } from "react";
import { formatNumber } from "@t1067/shared";
import { api } from "./api";
import { haptic } from "./telegram";
import { confetti } from "./util";
import { LoadError, Spinner } from "./components";
import { Button, Sheet } from "./design/components";
import type { ItemsResponse, TradesResponse } from "./api";

// Savdolarim — escrowed offers + per-deal chat (moderated server-side).
function TradesPanel({ onBanner }: { onBanner: (m: string) => void }) {
  const [t, setT] = useState<TradesResponse | null>(null);
  const [chatFor, setChatFor] = useState<number | null>(null);
  const [text, setText] = useState("");
  const load = () => api.trades().then(setT).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);
  if (!t || (t.incoming.length === 0 && t.outgoing.length === 0)) return null;

  const act = async (fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) => {
    haptic();
    const r = await fn();
    onBanner(r.ok ? okMsg : r.reason === "moderated" ? "⚠️ Xabar bloklandi (raqam/naqd taqiq!)" : r.reason === "banned" ? "Savdo chat 30 kunga yopilgan" : r.reason === "insufficient" ? "Tanga yetarli emas" : "Xatolik");
    await load();
  };

  const row = (o: TradesResponse["incoming"][number], incoming: boolean) => (
    <div key={o.id} className="row-line">
      <div className="between g8">
        <span className="fs13">
          {incoming ? `${o.from} taklifi:` : "Sizning taklifingiz:"} <b>{o.item}</b> uchun{" "}
          {o.offerCoins > 0 && <b>🪙 {formatNumber(o.offerCoins)}</b>}
          {o.offerItem && <> {o.offerCoins > 0 ? "+" : ""} {o.offerItem} (almashuv)</>}
        </span>
        <span className="row g6">
          {incoming && <button className="btn-primary sm" onClick={() => act(() => api.tradeAccept(o.id), "🤝 Bitim yakunlandi!")}>✓</button>}
          <button className="btn-ghost sm" onClick={() => act(() => api.tradeCancel(o.id), incoming ? "Rad etildi" : "Bekor qilindi")}>✗</button>
          <button className="btn-ghost sm" onClick={() => setChatFor(chatFor === o.id ? null : o.id)}>💬{o.chat.length > 0 ? o.chat.length : ""}</button>
        </span>
      </div>
      {chatFor === o.id && (
        <div className="mt6">
          {o.chat.map((c, i) => (
            <div key={i} className={"muted fs12 " + (c.me ? "tar" : "tal")}>{c.me ? "Siz: " : ""}{c.text}</div>
          ))}
          <div className="row g6 mt4">
            <input className="bk-input grow" placeholder="Xabar (raqam/naqd taqiq)" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary sm" disabled={!text.trim()} onClick={() => act(async () => { const r = await api.tradeMessage(chatFor, text); setText(""); return r; }, "Yuborildi")}>➤</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section className="glass pad">
      <div className="section-title">🤝 Savdolarim</div>
      {t.incoming.map((o) => row(o, true))}
      {t.outgoing.map((o) => row(o, false))}
      <p className="muted game-hint">Hamma bitim escrow bilan — tanga garovda turadi. Real pul savdosi TAQIQLANGAN.</p>
    </section>
  );
}

// 💎 Xazina (Kolleksiya): catalog mint + my items + internal resale (10% burn)
function CollectionSection({ onBanner }: { onBanner: (m: string) => void }) {
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [offerFor, setOfferFor] = useState<ItemsResponse["market"][number] | null>(null);
  const [offerSum, setOfferSum] = useState("");
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
          <div key={c.code} className={"mk-item" + (["afsonaviy", "nodir"].includes(c.rarity) ? " d-sheen" : "")}>
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
          <div className="muted mk-sub mt10">Mening xazinam ({data.mine.length}) · qismlar {data.partsProgress.have}/{data.partsProgress.total}</div>
          <div className="badge-strip fs22">
            {data.mine.slice(0, 16).map((i) => (
              <span key={i.id} title={`${i.name}${i.cap > 0 ? ` #${i.serial}/${i.cap}` : ""}`}>{i.emoji}</span>
            ))}
          </div>
        </>
      )}
      {data.market.length > 0 && (
        <>
          <div className="muted mk-sub mt10">🛒 Tanga bozori (sotuvda):</div>
          {data.market.slice(0, 8).map((l) => (
            <div key={l.listingId} className="mk-voucher">
              <span>{l.emoji} {l.name}{l.serial ? ` #${l.serial}` : ""}</span>
              {l.mine ? (
                <span className="muted">sizniki</span>
              ) : (
                <span className="row g6">
                  <button className="btn-violet sm" disabled={busy} onClick={() => run(() => api.itemBuy(l.listingId), (r) => `💎 ${r.name ?? "Buyum"} sotib olindi!`)}>
                    🪙 {formatNumber(l.price)}
                  </button>
                  <button className="btn-ghost sm" disabled={busy} onClick={() => setOfferFor(l)}>🤝</button>
                </span>
              )}
            </div>
          ))}
        </>
      )}
      <Sheet open={!!offerFor} onClose={() => setOfferFor(null)}>
        {offerFor && (
          <>
            <h3>🤝 {offerFor.emoji} {offerFor.name}{offerFor.serial ? ` #${offerFor.serial}` : ""} uchun taklif</h3>
            <p className="dim fs13">Sotuvda: 🪙 {formatNumber(offerFor.price)}. Taklifingiz tanga garoviga olinadi — egasi rad etsa to'liq qaytadi.</p>
            <input className="bk-input" inputMode="numeric" placeholder={`Masalan: ${Math.floor(offerFor.price * 0.8)}`} value={offerSum} onChange={(e) => setOfferSum(e.target.value.replace(/\D/g, ""))} />
            <Button
              disabled={busy || !offerSum || Number(offerSum) < 100}
              onClick={() => {
                const v = Math.floor(Number(offerSum));
                const target = offerFor;
                setOfferFor(null);
                setOfferSum("");
                run(() => api.tradeOffer(target.itemId, v), () => "🤝 Taklif yuborildi — egasining javobini kuting!");
              }}
            >
              Taklif yuborish {offerSum ? `· 🪙 ${formatNumber(Number(offerSum))}` : ""}
            </Button>
            <Button variant="ghost" onClick={() => setOfferFor(null)}>Bekor</Button>
          </>
        )}
      </Sheet>
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
      <div className="login-input-row g8">
        <input className="bk-input grow uppercase" placeholder="Mijoz kodi: ABC123" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn-primary sm" disabled={busy || !code.trim()} onClick={redeem}>{busy ? "…" : "✅"}</button>
      </div>
      {mine.pending.length > 0 && (
        <>
          <div className="muted mk-sub mt8">Kutilayotgan vaucherlar: {mine.pending.length}</div>
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
  const [shopsErr, setShopsErr] = useState(false);
  const [buy, setBuy] = useState<{ shop: ShopView; listing: ShopView["listings"][number] } | null>(null);
  const [showOrders, setShowOrders] = useState(false);

  const load = () => {
    setShopsErr(false);
    // On failure surface a retry instead of silently degrading to an empty market
    // (an empty [] is indistinguishable from "no shops yet" → user is stuck).
    api.marketShops().then(setShops).catch(() => setShopsErr(true));
    api.marketOrders().then(setOrders).catch(() => undefined);
  };
  useEffect(() => {
    load();
  }, []);

  if (shopsErr && !shops) return <LoadError onRetry={load} />;
  if (!shops) return <Spinner />;

  const activeVouchers = (orders ?? []).filter((o) => o.status === "issued");

  return (
    <div className="view">
      <div className="section-title">🏪 Bozor — tanga bilan to'lang</div>
      <p className="muted mk-sub">Tangalaringiz Koson do'konlarida pul: tanlang, kod oling, do'konda ko'rsating.</p>

      <MyShopPanel onBanner={onBanner} />

      <CollectionSection onBanner={onBanner} />

      <TradesPanel onBanner={onBanner} />

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
        <section className="glass pad tac">
          <div className="fs40">🏗</div>
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
