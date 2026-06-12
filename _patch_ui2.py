# UI wave: itemId in market view, miniapp api methods, booking 3.0 UI bits,
# trade UI in market.tsx, admin livemap/360/mashina/QR/optoken.

# ── 0) server: expose itemId in collection market rows ──────────────────────
p = "packages/server/src/services/itemService.ts"
s = open(p, encoding="utf-8").read()
old = "return { listingId: l.id, name: t?.name ?? \"\", emoji: t?.emoji ?? \"💎\", serial: i?.serial ?? 0, price: l.price, mine: l.sellerId === memberId };"
assert old in s
s = s.replace(old, "return { listingId: l.id, itemId: l.itemId, name: t?.name ?? \"\", emoji: t?.emoji ?? \"💎\", serial: i?.serial ?? 0, price: l.price, mine: l.sellerId === memberId };")
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("itemService ok")

# ── 1) miniapp api.ts ────────────────────────────────────────────────────────
p = "packages/miniapp/src/api.ts"
s = open(p, encoding="utf-8").read()
old = '''  plus: () => get<'''
assert old in s
s = s.replace(old, '''  bookingNearby: () => get<{ pins: { lat: number; lng: number; bearing: number; busy: boolean }[]; freeDrivers: number }>("/api/booking/nearby"),
  bookingPredict: (address?: string) => get<{ rides: number; avg: number; p50: number; byAddress?: { name: string; avg: number; rides: number } | null }>(`/api/booking/predict${address ? `?address=${encodeURIComponent(address)}` : ""}`),
  bookingRate: (bookingId: number, stars: number, tags: string[]) => request<{ ok: boolean; reason?: string }>("POST", "/api/booking/rate", { bookingId, stars, tags }, 1),
  trades: () => get<TradesResponse>("/api/trade"),
  tradeOffer: (itemId: number, coins: number, offerItemId?: number) => request<{ ok: boolean; reason?: string; offerId?: number }>("POST", "/api/trade/offer", { itemId, coins, offerItemId }, 1),
  tradeAccept: (offerId: number) => request<{ ok: boolean; reason?: string }>("POST", "/api/trade/accept", { offerId }, 1),
  tradeCancel: (offerId: number) => request<{ ok: boolean; reason?: string }>("POST", "/api/trade/cancel", { offerId }, 1),
  tradeMessage: (offerId: number, text: string) => request<{ ok: boolean; reason?: string }>("POST", "/api/trade/message", { offerId, text }, 1),
''' + old)
s = s.replace('''export interface ItemsResponse {''', '''export interface TradesResponse {
  incoming: { id: number; item: string; offerCoins: number; offerItem: string | null; from: string; mine: boolean; chat: { me: boolean; text: string }[] }[];
  outgoing: { id: number; item: string; offerCoins: number; offerItem: string | null; from: string; mine: boolean; chat: { me: boolean; text: string }[] }[];
}

export interface ItemsResponse {''')
s = s.replace("market: { listingId: number; name: string;", "market: { listingId: number; itemId: number; name: string;")
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("miniapp api ok")

# ── 2) booking.tsx: nearby pins + free count + predict + rating sheet ───────
p = "packages/miniapp/src/booking.tsx"
s = open(p, encoding="utf-8").read()

# state additions
old = '''  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);'''
assert old in s
s = s.replace(old, old + '''
  const [freeDrivers, setFreeDrivers] = useState(0);
  const [predict, setPredict] = useState<{ avg: number; byAddress?: { name: string; avg: number; rides: number } | null } | null>(null);
  const [rateFor, setRateFor] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [rateTags, setRateTags] = useState<string[]>([]);
  const nearbyMarkers = useRef<any[]>([]);
  const prevActiveId = useRef<number | null>(null);''')

# nearby pins effect + ride-end → rating trigger (insert after pickup marker effect)
old = '''  // fare estimate when pickup + dest set'''
assert old in s
s = s.replace(old, '''  // E1: live free-car pins (45s refresh, only while idle)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await api.bookingNearby().catch(() => null);
      if (!alive || !r) return;
      setFreeDrivers(r.freeDrivers);
      const L = (window as any).L;
      if (!map.current || !L) return;
      for (const m of nearbyMarkers.current) m.remove();
      nearbyMarkers.current = r.pins.slice(0, 20).map((d) =>
        L.marker([d.lat, d.lng], { icon: pin(L, d.busy ? "#666" : "#22c55e", d.busy ? "🚖" : "🟢") }).addTo(map.current),
      );
    };
    load();
    const t = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // E3: history-based fare prediction for the picked address
  useEffect(() => {
    if (!pickup) return setPredict(null);
    api.bookingPredict(pickup.name).then((r) => setPredict({ avg: r.avg, byAddress: r.byAddress })).catch(() => undefined);
  }, [pickup?.id]);

  // E7: ride finished (active → null) → ask for stars
  useEffect(() => {
    if (active?.id) prevActiveId.current = active.id;
    else if (prevActiveId.current) {
      setRateFor(prevActiveId.current);
      prevActiveId.current = null;
    }
  }, [active?.id]);

  // fare estimate when pickup + dest set''')

# predict line in UI: find the quote render and add predict near it
old = '''      {msg && <div className="bk-msg">{msg}</div>}'''
assert old in s
s = s.replace(old, '''      {msg && <div className="bk-msg">{msg}</div>}
      {rateFor && (
        <div className="sheet-back" onClick={() => setRateFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <h3>⭐ Safar qanday o'tdi?</h3>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", fontSize: 34, margin: "10px 0" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} style={{ cursor: "pointer", opacity: n <= stars ? 1 : 0.3 }} onClick={() => { haptic(); setStars(n); }}>⭐</span>
              ))}
            </div>
            <div className="chip-row" style={{ flexWrap: "wrap" }}>
              {["Toza mashina", "Xushmuomala", "Tez yetib keldi", "Sekin haydadi", "Mashina eski"].map((t) => (
                <button key={t} className={"amt-chip" + (rateTags.includes(t) ? " active" : "")} onClick={() => setRateTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}>
                  {t}
                </button>
              ))}
            </div>
            <button className="btn-primary" disabled={!stars} onClick={async () => { await api.bookingRate(rateFor, stars, rateTags).catch(() => undefined); setRateFor(null); setStars(0); setRateTags([]); setMsg("🙏 Rahmat! Bahoyingiz haydovchi reytingiga qo'shildi."); }}>
              Yuborish
            </button>
            <button className="btn-ghost" onClick={() => setRateFor(null)}>O'tkazib yuborish</button>
          </div>
        </div>
      )}''')

# freeDrivers badge + predict line — anchor on the search input area; find "Qayerga" or bk-input placeholder
import re
m = re.search(r'placeholder="([^"]*)"', s[s.find("bk-input"):])
# safer: insert predict under quote display; find quote usage
oldq = "{quote && ("
if oldq in s:
    s = s.replace(oldq, '''{predict && !active && (
        <div className="muted" style={{ fontSize: 12, textAlign: "center" }}>
          📊 {predict.byAddress ? `${predict.byAddress.name}: odatda ~${formatNumber(predict.byAddress.avg)} so'm (${predict.byAddress.rides} safar)` : `Kosonda o'rtacha safar ~${formatNumber(predict.avg)} so'm`}
          {freeDrivers > 0 ? ` · 🟢 bo'sh mashinalar: ${freeDrivers}` : ""}
        </div>
      )}
      ''' + oldq, 1)
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("booking ui ok")

# ── 3) market.tsx: trade offers UI ───────────────────────────────────────────
p = "packages/miniapp/src/market.tsx"
s = open(p, encoding="utf-8").read()
old = '''import type { ItemsResponse } from "./api";'''
assert old in s
s = s.replace(old, '''import type { ItemsResponse, TradesResponse } from "./api";

// 🤝 Savdolarim — escrowed offers + per-deal chat (moderated server-side).
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
    onBanner(r.ok ? okMsg : r.reason === "moderated" ? "⚠️ Xabar blocklandi (raqam/naqd taqiq!)" : r.reason === "banned" ? "Savdo chat 30 kunga yopilgan" : "Xatolik");
    await load();
  };

  const row = (o: TradesResponse["incoming"][number], incoming: boolean) => (
    <div key={o.id} style={{ borderTop: "1px solid rgba(255,255,255,.08)", padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13 }}>
          {incoming ? `${o.from} taklifi:` : "Sizning taklifingiz:"} <b>{o.item}</b> uchun{" "}
          {o.offerCoins > 0 && <b>🪙 {formatNumber(o.offerCoins)}</b>}
          {o.offerItem && <> {o.offerCoins > 0 ? "+" : ""} {o.offerItem} (almashuv)</>}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          {incoming && <button className="btn-primary sm" onClick={() => act(() => api.tradeAccept(o.id), "🤝 Bitim yakunlandi!")}>✓</button>}
          <button className="btn-ghost sm" onClick={() => act(() => api.tradeCancel(o.id), incoming ? "Rad etildi" : "Bekor qilindi")}>✗</button>
          <button className="btn-ghost sm" onClick={() => setChatFor(chatFor === o.id ? null : o.id)}>💬{o.chat.length > 0 ? o.chat.length : ""}</button>
        </span>
      </div>
      {chatFor === o.id && (
        <div style={{ marginTop: 6 }}>
          {o.chat.map((c, i) => (
            <div key={i} className="muted" style={{ fontSize: 12, textAlign: c.me ? "right" : "left" }}>{c.me ? "Siz: " : ""}{c.text}</div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input className="bk-input" style={{ flex: 1 }} placeholder="Xabar (raqam/naqd taqiq)" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary sm" disabled={!text.trim()} onClick={() => act(async () => { const r = await api.tradeMessage(o.id, text); setText(""); return r; }, "Yuborildi")}>➤</button>
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
      <p className="muted game-hint">Hamma bitim escrow bilan: tanga garovda turadi, real pul savdosi TAQIQLANGAN.</p>
    </section>
  );
}''')

# offer button on market listings (next to buy)
old = '''              {l.mine ? (
                <span className="muted">sizniki</span>
              ) : (
                <button className="btn-violet sm" disabled={busy} onClick={() => run(() => api.itemBuy(l.listingId), (r) => `💎 ${r.name ?? "Buyum"} sotib olindi!`)}>
                  🪙 {formatNumber(l.price)}
                </button>
              )}'''
assert old in s
s = s.replace(old, '''              {l.mine ? (
                <span className="muted">sizniki</span>
              ) : (
                <span style={{ display: "flex", gap: 6 }}>
                  <button className="btn-violet sm" disabled={busy} onClick={() => run(() => api.itemBuy(l.listingId), (r) => `💎 ${r.name ?? "Buyum"} sotib olindi!`)}>
                    🪙 {formatNumber(l.price)}
                  </button>
                  <button className="btn-ghost sm" disabled={busy} onClick={() => {
                    const v = prompt(`🤝 ${l.name} uchun taklifingiz (tanga):`, String(Math.floor(l.price * 0.8)));
                    if (v) run(() => api.tradeOffer(l.itemId, Math.floor(Number(v))), () => "🤝 Taklif yuborildi — egasi javobini kuting!");
                  }}>🤝</button>
                </span>
              )}'''
)
old = "      <CollectionSection onBanner={onBanner} />"
assert old in s
s = s.replace(old, old + "\n\n      <TradesPanel onBanner={onBanner} />")
open(p, "w", encoding="utf-8", newline="\n").write(s)
print("market trade ui ok")
