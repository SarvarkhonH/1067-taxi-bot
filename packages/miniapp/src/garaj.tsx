// 🏆 GARAJ v2 — the dedicated full-screen restoration game (opens when feature
// "garajx" is ON). Core loop: ol (buy) → diagnoz → ta'mirla → sot (flip).
// Pure view layer — all money logic + idempotency live on the server.
import { useCallback, useEffect, useRef, useState } from "react";
import type { GarajStateResponse, RepairQuality } from "@t1067/shared";
import { KOZACHA_SHOP, reputationTier } from "@t1067/shared";
import { api } from "./api";
import { haptic, hapticSuccess } from "./telegram";
import { Button, Card, Chip, CoinCounter, LoadSection, ProgressBar, Sheet } from "./design/components";
import "./garaj.css";

const TASKS = [
  { code: "oil_change", label: "Moy almashtirish" },
  { code: "tyre", label: "G'ildiraklar" },
  { code: "body", label: "Kuzov" },
  { code: "interior", label: "Salon" },
  { code: "engine", label: "Dvigatel" },
];
// buyer chips carry their style preference in the label — no hidden rules.
const BUYERS = [
  { code: "FAMILY_DRIVER", name: "👨‍👩‍👧 Oilaviy · To'liq" },
  { code: "YOUNG_TUNER", name: "🏁 Yoshlar · Tюнинг" },
  { code: "NEWLYWED", name: "💍 Kelin-kuyov · To'liq/davr" },
  { code: "COLLECTOR", name: "👑 Kolleksioner · Davr (retro)" },
];
// restoration styles; TUNING/PERIOD_CORRECT gate on garage tier (matches the plan).
const STYLES = [
  { code: "QUICK_FLIP", name: "Tezkor", minTier: 1 },
  { code: "FULL_RESTORE", name: "To'liq", minTier: 1 },
  { code: "TUNING", name: "Tюнинг", minTier: 2 },
  { code: "PERIOD_CORRECT", name: "Davr asili", minTier: 3 },
];
const ZONE_LABELS: Record<string, string> = { engine: "Dvigatel", body: "Kuzov", transmission: "Transmissiya", electric: "Elektr", interior: "Salon" };
const COND_LABEL: Record<string, string> = { WORN: "Eski", FAIR: "O'rtacha", GOOD: "Yaxshi", MINT: "A'lo" };

export function GarajShell({ onClose, initial }: { onClose: () => void; initial?: GarajStateResponse }) {
  const [st, setSt] = useState<GarajStateResponse | null>(initial ?? null);
  const [state, setState] = useState<"loading" | "error" | "ready">(initial ? "ready" : "loading");
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState<{ amount: number; label: string } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>("QUICK_FLIP");
  const [bazaar, setBazaar] = useState<{ id: number; carCode: string; name: string; emoji: string; askPrice: number; mine: boolean }[]>([]);
  const [auctions, setAuctions] = useState<{ id: number; carCode: string; name: string; emoji: string; minBid: number; endsAt: string; mine: boolean }[]>([]);
  const [league, setLeague] = useState<{ rank: number; name: string; score: number; memberCount: number }[]>([]);
  const [cipherInput, setCipherInput] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    if (initial) return; // demo/fixture mode — no backend fetch
    setState("loading");
    void api.garajBazaar().then(setBazaar).catch(() => undefined);
    void api.garajAuctions().then(setAuctions).catch(() => undefined);
    void api.garajMahallaLeague().then(setLeague).catch(() => undefined);
    api
      .garajState()
      .then((s) => {
        setSt(s);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [initial]);
  useEffect(() => load(), [load]);
  const flash = (msg: string): void => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const car = st?.cars.find((c) => c.id === openId) ?? null;

  const act = async (fn: () => Promise<{ ok: boolean; reason?: string; grant?: number }>, onWin?: (grant: number) => void): Promise<void> => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await fn();
      if (r.ok && onWin && r.grant) onWin(r.grant);
      setSt(await api.garajState());
    } catch {
      /* keep current state; user can retry */
    } finally {
      setBusy(false);
    }
  };

  const coins = st?.coins ?? 0;
  const doneCount = car ? Math.floor(car.repairSpent / 80) : 0;
  const nextTask = TASKS[doneCount] ?? null;

  return (
    <div className="gz">
      <div className="gz-head">
        <button className="gz-back" onClick={() => { haptic(); onClose(); }} aria-label="Ortga">←</button>
        <span className="gz-title">🏆 <b>GARAJ</b></span>
        <div className="gz-purse">
          <span className="gz-pill">🪙 <CoinCounter value={coins} /></span>
          <span className="gz-pill koz">🏺 {st?.kozacha ?? 0}</span>
        </div>
      </div>

      <div className="gz-body">
        <LoadSection state={state} onRetry={load}>
          {st && (
            <>
              <div className="gz-scene">
                <div className="gz-rep">
                  <b>{st.reputationName ?? reputationTier(st.reputationScore)}</b> · Daraja <b>{st.garageTier}</b> · Obro' <b>{st.reputationScore}</b>
                  {st.prestige.count > 0 && <span className="gz-prestige-star"> · {"★".repeat(st.prestige.count)}</span>}
                </div>
                <p className="mt6 fs13">Eski mashina ol → diagnoz qil → ta'mirla → foyda bilan sot.</p>
                {st.seasonalEvent && <div className="gz-season">🎉 {st.seasonalEvent} — mavsumiy bonus faol</div>}
              </div>

              {/* daily engagement row: streak + offline box */}
              <div className="gz-daily">
                <div className="gz-streak">
                  <span className="gz-streak-fire">🔥</span>
                  <span className="gz-streak-n">{st.streak.current}</span>
                  <span className="gz-streak-lbl">
                    kun ketma-ket{st.streak.freezeAvailable ? " · 🛞 zaxira" : ""}
                    {st.streak.nextMilestone ? ` · ${st.streak.nextMilestone}-kunda bonus` : ""}
                  </span>
                </div>
                {st.offlineBoxPending > 0 && (
                  <Button sm disabled={busy} onClick={() => collectBox()}>
                    📦 Quti +{st.offlineBoxPending}
                  </Button>
                )}
              </div>

              {/* daily cipher pad */}
              {!st.cipher.solvedToday && st.cipher.attemptsLeft > 0 && (
                <Card className="gz-cipher">
                  <div className="gz-sec-title mt0">🔐 Kunlik shifr — kanaldagi 3 harfni kiriting (+{st.cipher.reward})</div>
                  <div className="row g8">
                    <input
                      className="gz-cipher-in"
                      value={cipherInput}
                      onChange={(e) => setCipherInput(e.target.value.toUpperCase().slice(0, 3))}
                      placeholder="ABC"
                      maxLength={3}
                      aria-label="Shifr kodi"
                    />
                    <Button sm disabled={busy || cipherInput.length < 3} onClick={() => submitCipher()}>Tasdiqlash</Button>
                  </div>
                  <div className="fs12 dim mt4">{st.cipher.attemptsLeft} urinish qoldi</div>
                </Card>
              )}
              {st.cipher.solvedToday && <div className="gz-cipher-done">🔐 Bugungi shifr yechildi ✓</div>}

              <div className="gz-skill">
                <div className="gz-skill-top">🔍 Usta-ko'z <b>{st.skill.ustaKozRank}</b>/100</div>
                <ProgressBar value={st.skill.ustaKozRank} max={100} />
                <div className="gz-skill-branches">
                  <span>⚙ {st.skill.muhandis}</span>
                  <span>🎨 {st.skill.kuzovchi}</span>
                  <span>💰 {st.skill.savdogar}</span>
                  <span>🏛 {st.skill.kollektsioner}</span>
                </div>
              </div>

              <div className="gz-sec-title">Mening mashinalarim ({st.cars.length})</div>
              {st.cars.length === 0 ? (
                <p className="gz-empty">Hali mashina yo'q — pastdagi do'kondan birinchi loyihangizni oling.</p>
              ) : (
                <div className="gz-grid">
                  {st.cars.map((c) => (
                    <button key={c.id} className="gz-car" onClick={() => { haptic(); setOpenId(c.id); }}>
                      <span className="gz-car-emoji">{c.emoji}</span>
                      <span className="gz-car-name">{c.name}</span>
                      <span className={`gz-cond ${c.condition.toLowerCase()}`}>{COND_LABEL[c.condition] ?? c.condition}</span>
                      <span className="gz-car-sub">{c.diagnosed ? "Diagnoz ✓" : "Diagnoz kerak"}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="gz-sec-title">Do'kon — yangi loyiha</div>
              <div className="gz-grid">
                {st.shop
                  .filter((s) => !s.owned)
                  .map((s) => (
                    <Card key={s.carCode} className="gz-car">
                      <span className="gz-car-emoji">{s.emoji}</span>
                      <span className="gz-car-name">{s.name}</span>
                      <span className="gz-car-sub">🪙 {s.buyPrice.toLocaleString("ru-RU")}</span>
                      <Button sm disabled={busy || coins < s.buyPrice} onClick={() => buyCar(s.carCode)}>
                        Sotib olish
                      </Button>
                    </Card>
                  ))}
              </div>

              {bazaar.filter((b) => !b.mine).length > 0 && (
                <>
                  <div className="gz-sec-title">🛒 Bozor — boshqa ustalardan</div>
                  <div className="gz-grid">
                    {bazaar
                      .filter((b) => !b.mine)
                      .map((b) => (
                        <Card key={b.id} className="gz-car">
                          <span className="gz-car-emoji">{b.emoji}</span>
                          <span className="gz-car-name">{b.name}</span>
                          <span className="gz-car-sub">🪙 {b.askPrice.toLocaleString("ru-RU")}</span>
                          <Button sm disabled={busy || coins < b.askPrice} onClick={() => bazaarBuy(b.id)}>
                            Sotib olish
                          </Button>
                        </Card>
                      ))}
                  </div>
                </>
              )}

              {auctions.filter((a) => !a.mine).length > 0 && (
                <>
                  <div className="gz-sec-title">🔨 Auksion (yopiq taklif)</div>
                  <div className="col g8">
                    {auctions
                      .filter((a) => !a.mine)
                      .map((a) => (
                        <Card key={a.id} className="gz-auc">
                          <div className="row between">
                            <span>{a.emoji} {a.name}</span>
                            <span className="fs12 dim">min 🪙{a.minBid.toLocaleString("ru-RU")}</span>
                          </div>
                          <div className="gz-buyers">
                            {[1, 1.5, 2].map((mult) => {
                              const bid = Math.round(a.minBid * mult);
                              return (
                                <Chip key={mult} onClick={() => aucBid(a.id, bid)}>
                                  🪙{bid.toLocaleString("ru-RU")}
                                </Chip>
                              );
                            })}
                          </div>
                        </Card>
                      ))}
                  </div>
                </>
              )}

              {/* 🏘 Mahalla — clan + weekly league */}
              <div className="gz-sec-title">🏘 Mahalla</div>
              {st.mahalla ? (
                <Card className="gz-mahalla">
                  <div className="row between">
                    <span className="gz-mahalla-name">{st.mahalla.name}</span>
                    <span className="gz-pill">#{st.mahalla.rank}</span>
                  </div>
                  <div className="fs12 dim mt4">
                    Kod <b>{st.mahalla.code}</b> · {st.mahalla.memberCount} a'zo · haftalik ball <b>{st.mahalla.weeklyScore.toLocaleString("ru-RU")}</b>
                  </div>
                  {league.length > 0 && (
                    <div className="gz-league mt8">
                      {league.slice(0, 5).map((g) => (
                        <div key={g.rank} className={`gz-league-row${st.mahalla && g.name === st.mahalla.name ? " me" : ""}`}>
                          <span className="gz-league-rank">{g.rank}</span>
                          <span className="gz-league-name">{g.name}</span>
                          <span className="gz-league-score">{g.score.toLocaleString("ru-RU")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="ghost" sm className="mt8" disabled={busy} onClick={() => leaveMahalla()}>Chiqish</Button>
                </Card>
              ) : (
                <Card className="gz-mahalla">
                  <p className="fs13 dim mt0">Mahallaga qo'shiling — har safar mashinangiz sifati × vaqt haftalik ballga aylanadi.</p>
                  <div className="row g8 mt8">
                    <input className="gz-cipher-in wide" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="KOD (6 harf)" maxLength={6} aria-label="Mahalla kodi" />
                    <Button sm disabled={busy || joinCode.length < 6} onClick={() => joinMahalla()}>Qo'shilish</Button>
                  </div>
                  <Button variant="ghost" sm className="mt8" disabled={busy} onClick={() => createMahalla()}>+ Yangi mahalla ochish</Button>
                </Card>
              )}

              {/* ♻️ Prestige — end-game reset for a permanent multiplier */}
              {st.prestige.eligible && (
                <Card className="gz-prestige">
                  <div className="gz-sec-title mt0">♻️ Prestij {st.prestige.count + 1}</div>
                  <p className="fs13 dim mt0">Garajni qaytadan boshlang — barcha mashinalar ketadi, lekin obro' saqlanadi va doimiy <b>×{((st.prestige.multiplier + 0.05).toFixed(2))}</b> bonus ochiladi.</p>
                  <Button sm className="mt8" disabled={busy} onClick={() => doPrestige()}>Prestij qilish</Button>
                </Card>
              )}
            </>
          )}
        </LoadSection>
      </div>

      <Sheet open={!!car} onClose={() => setOpenId(null)}>
        {car && (
          <div className="col g8">
            <div className="row between">
              <span className="gz-title">{car.emoji} {car.name}</span>
              <span className={`gz-cond ${car.condition.toLowerCase()}`}>{COND_LABEL[car.condition] ?? car.condition}</span>
            </div>

            {car.diagnosis ? (
              Object.entries(car.diagnosis).map(([zone, val]) => (
                <div key={zone} className="gz-zone">
                  <span className="gz-zone-label">{ZONE_LABELS[zone] ?? zone}</span>
                  <ProgressBar value={val} max={100} />
                  <span className="gz-zone-val">{val}</span>
                </div>
              ))
            ) : (
              <p className="gz-empty">Ichki holati noma'lum — diagnoz qiling.</p>
            )}

            <div className="gz-buyers">
              <Chip onClick={() => diagnose(car.id, "VISUAL")}>👁 Ko'z (bepul)</Chip>
              <Chip onClick={() => diagnose(car.id, "TOOL")}>🔧 Asbob (120)</Chip>
              <Chip onClick={() => diagnose(car.id, "EXPERT")}>🔬 Ekspert (400)</Chip>
            </div>

            <div className="gz-actions">
              {!car.style ? (
                <>
                  <div className="gz-sec-title">Uslubni tanlang (birinchi ta'mirda qulflanadi)</div>
                  <div className="gz-buyers">
                    {STYLES.map((s) => {
                      const locked = (st?.garageTier ?? 1) < s.minTier;
                      return (
                        <Chip key={s.code} on={selectedStyle === s.code} onClick={() => { if (!locked) { haptic(); setSelectedStyle(s.code); } }}>
                          {locked ? `🔒 ${s.name}` : s.name}
                        </Chip>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="fs12 dim">Uslub: {car.style}</div>
              )}
              {nextTask ? (
                repairing ? (
                  <TimingBar
                    onResult={(q) => { setRepairing(false); repair(car.id, nextTask.code, q); }}
                    onCancel={() => setRepairing(false)}
                  />
                ) : (
                  <Button disabled={busy || coins < 80} onClick={() => { haptic(); setRepairing(true); }}>
                    🔧 {nextTask.label} — 80 tanga
                  </Button>
                )
              ) : (
                <Button variant="ghost" disabled>✓ To'liq ta'mirlangan</Button>
              )}

              <div className="gz-sec-title">Sotish — xaridorni tanlang</div>
              <div className="gz-buyers">
                {BUYERS.map((b) => (
                  <Chip key={b.code} onClick={() => flip(car.id, b.code)}>
                    {b.name}
                  </Chip>
                ))}
              </div>

              <div className="gz-sec-title">🏺 Ko'zacha do'kon ({st?.kozacha ?? 0})</div>
              <div className="gz-buyers">
                {KOZACHA_SHOP.map((it) => (
                  <Chip key={it.code} onClick={() => kozBuy(it.code, car.id)}>
                    {it.name} · 🏺{it.cost}
                  </Chip>
                ))}
              </div>

              <Button variant="ghost" sm onClick={() => bazaarList(car.id, car.basePrice)}>
                🛒 Bozorga qo'yish ({car.basePrice.toLocaleString("ru-RU")})
              </Button>
              <Button variant="ghost" sm onClick={() => aucCreate(car.id, Math.round(car.basePrice * 0.5))}>
                🔨 Auksionga qo'yish (min {Math.round(car.basePrice * 0.5).toLocaleString("ru-RU")})
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {st && state === "ready" && st.onboardStep < 5 && (
        <GarajFtue
          onDone={(grant) => {
            hapticSuccess();
            if (grant > 0) {
              setBurst({ amount: grant, label: "BIRINCHI FOYDA! 🎉" });
              setTimeout(() => setBurst(null), 2200);
            }
            if (!initial) api.garajState().then(setSt).catch(() => undefined);
          }}
        />
      )}

      {burst && (
        <div className="gz-burst" onClick={() => setBurst(null)}>
          <span className="gz-burst-emoji">🪙</span>
          <span className="gz-burst-amt">+{burst.amount.toLocaleString("ru-RU")}</span>
          <span className="gz-burst-label">{burst.label}</span>
        </div>
      )}

      {toast && <div className="gz-toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  );

  function buyCar(code: string): void {
    void act(() => api.garajAcquire(code));
  }
  function collectBox(): void {
    void act(
      () => api.garajCollectBox(),
      (grant) => { hapticSuccess(); setBurst({ amount: grant, label: "OFFLINE QUTI 📦" }); setTimeout(() => setBurst(null), 1900); },
    );
  }
  async function submitCipher(): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.garajCipher(cipherInput);
      if (r.ok && (r.grant ?? 0) > 0) { hapticSuccess(); setBurst({ amount: r.grant!, label: "SHIFR YECHILDI 🔐" }); setTimeout(() => setBurst(null), 1900); }
      else if (r.reason === "wrong") flash(`Noto'g'ri — ${r.attemptsLeft ?? 0} urinish qoldi`);
      else if (r.reason === "locked") flash("Bugungi urinishlar tugadi");
      else if (r.reason === "no_cipher") flash("Bugun shifr yo'q");
      setCipherInput("");
      if (!initial) setSt(await api.garajState());
    } catch { /* retry */ } finally { setBusy(false); }
  }
  async function mahallaAct(fn: () => Promise<{ ok: boolean; reason?: string; code?: string }>, okMsg?: (r: { code?: string }) => string): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await fn();
      if (r.ok && okMsg) flash(okMsg(r));
      else if (!r.ok && r.reason === "full") flash("Mahalla to'la (20 a'zo)");
      else if (!r.ok && r.reason === "not_found") flash("Bunday kod topilmadi");
      else if (!r.ok && r.reason === "already_in_mahalla") flash("Siz allaqachon mahalladasiz");
      if (!initial) { setSt(await api.garajState()); setLeague(await api.garajMahallaLeague()); }
    } catch { /* retry */ } finally { setBusy(false); }
  }
  function createMahalla(): void {
    void mahallaAct(() => api.garajMahallaCreate(mahallaNameDefault()), (r) => `Mahalla ochildi! Kod: ${r.code}`);
  }
  function joinMahalla(): void {
    void mahallaAct(() => api.garajMahallaJoin(joinCode));
    setJoinCode("");
  }
  function leaveMahalla(): void {
    void mahallaAct(() => api.garajMahallaLeave());
  }
  function doPrestige(): void {
    void act(() => api.garajPrestige(), () => { hapticSuccess(); flash("Prestij! Doimiy bonus ochildi ♻️"); });
  }
  function mahallaNameDefault(): string {
    return `Garaj ${Math.floor(coins % 1000)}`; // simple auto-name; rename UI ships later
  }
  function diagnose(id: number, tier: "VISUAL" | "TOOL" | "EXPERT"): void {
    void act(() => api.garajDiagnose(id, tier));
  }
  function repair(id: number, taskCode: string, quality?: RepairQuality): void {
    void act(() => api.garajRepair(id, taskCode, car?.style ?? selectedStyle, quality));
  }
  function kozBuy(itemCode: string, id: number): void {
    void act(() => api.garajKozBuy(itemCode, id));
  }
  async function bazaarAct(fn: () => Promise<{ ok: boolean }>): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      await fn();
      if (!initial) {
        setSt(await api.garajState());
        setBazaar(await api.garajBazaar());
        setAuctions(await api.garajAuctions());
      }
    } catch {
      /* keep state */
    } finally {
      setBusy(false);
    }
  }
  function bazaarList(id: number, price: number): void {
    void bazaarAct(() => api.garajBazaarList(id, price));
    setOpenId(null);
  }
  function bazaarBuy(listingId: number): void {
    void bazaarAct(() => api.garajBazaarBuy(listingId));
  }
  function aucBid(auctionId: number, amount: number): void {
    void bazaarAct(() => api.garajAuctionBid(auctionId, amount));
  }
  function aucCreate(id: number, minBid: number): void {
    void bazaarAct(() => api.garajAuctionCreate(id, minBid));
    setOpenId(null);
  }
  function flip(id: number, buyer: string): void {
    void act(
      () => api.garajFlip(id, buyer),
      (grant) => {
        hapticSuccess();
        setBurst({ amount: grant, label: "SOTILDI!" });
        setOpenId(null);
        setTimeout(() => setBurst(null), 1900);
      },
    );
  }
}

// Static fixture for the #garajdemo render-proof (no backend, no auth).
export const GARAJ_DEMO: GarajStateResponse = {
  enabled: true,
  coins: 4820,
  kozacha: 24,
  garageTier: 2,
  reputationScore: 1340,
  onboardStep: 5,
  cars: [
    { id: 1, carCode: "nexia", name: "Nexia", emoji: "🚙", basePrice: 2600, source: "ride_drop", condition: "GOOD", style: "FULL_RESTORE", level: 2, diagnosed: true, diagnosis: { engine: 72, body: 58, transmission: 64, electric: 80, interior: 45 }, acquireCost: 1690, repairSpent: 240 },
    { id: 2, carCode: "damas", name: "Damas", emoji: "🚐", basePrice: 900, source: "shop", condition: "WORN", style: null, level: 1, diagnosed: false, diagnosis: null, acquireCost: 585, repairSpent: 0 },
  ],
  shop: [
    { carCode: "tiko", name: "Tiko", emoji: "🚙", buyPrice: 455, owned: false },
    { carCode: "matiz", name: "Matiz", emoji: "🚗", buyPrice: 975, owned: false },
    { carCode: "cobalt", name: "Cobalt", emoji: "🚘", buyPrice: 2470, owned: false },
    { carCode: "tracker", name: "Tracker", emoji: "🛻", buyPrice: 7800, owned: false },
  ],
  skill: { ustaKozRank: 47, muhandis: 3, kuzovchi: 2, savdogar: 1, kollektsioner: 3, muhandisXp: 80, kuzovchiXp: 40, savdogarXp: 12, kollektsionerXp: 90 },
  reputationName: "Usta",
  streak: { current: 4, longest: 9, freezeAvailable: false, nextMilestone: 5 },
  cipher: { solvedToday: false, attemptsLeft: 5, reward: 30 },
  prestige: { count: 0, multiplier: 1.0, eligible: false },
  offlineBoxPending: 18,
  seasonalEvent: "Navro'z",
  mahalla: { id: 1, name: "Koson Ustalari", code: "LUPYQG", weeklyScore: 1240, memberCount: 7, rank: 2, role: "MEMBER" },
};

/** #garajdemo render-proof entry — the shell populated from the static fixture. */
export function GarajDemo() {
  return <GarajShell initial={GARAJ_DEMO} onClose={() => { window.location.hash = ""; }} />;
}

// 90-second onboarding — scripted first restoration on a free starter Tiko.
// Pure visual until the final "sell" step, which calls the one-time +80 grant.
function GarajFtue({ onDone }: { onDone: (grant: number) => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const STEPS = [
    { emoji: "🚗", title: "Xush kelibsiz, usta!", body: "Mana hovlingizdagi birinchi loyiha — buzuq Tiko. Keling, unga jon beramiz.", btn: "Boshlaymiz" },
    { emoji: "🔧", title: "Detalni o'rnating", body: "Bitta detal qo'yamiz — usta ishi shunday boshlanadi.", btn: "Detal qo'y" },
    { emoji: "🔑", title: "Dvigatelni sinang", body: "Endi ishlaydimi? Vrooom!", btn: "Sinab ko'r" },
    { emoji: "💰", title: "Xaridor topildi!", body: "Tiklangan Tiko'ni sotamiz — birinchi foydangiz.", btn: "Sotish" },
  ];
  const cur = STEPS[Math.min(step, STEPS.length - 1)]!;
  const advance = async (): Promise<void> => {
    if (busy) return;
    haptic();
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const r = await api.garajOnboardFinish();
      onDone(r.grant ?? 80);
    } catch {
      onDone(0);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gz-ftue">
      <div className="gz-ftue-car">{cur.emoji}</div>
      <h2 className="gz-ftue-title">{cur.title}</h2>
      <p className="gz-ftue-body">{cur.body}</p>
      <Button onClick={advance} disabled={busy}>{busy ? "…" : cur.btn}</Button>
      <div className="gz-ftue-dots">
        {STEPS.map((_, i) => (
          <span key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

// Timing mini-game — a marker sweeps a bar; tap in the green zone for a better
// repair (raises repairQualityBonus → higher flip price). Avtomatik = skip (a11y).
function TimingBar({ onResult, onCancel }: { onResult: (q: RepairQuality) => void; onCancel: () => void }) {
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  const dirRef = useRef(1);
  const rafRef = useRef(0);
  useEffect(() => {
    const tick = () => {
      posRef.current += dirRef.current * 1.7;
      if (posRef.current >= 100) { posRef.current = 100; dirRef.current = -1; }
      else if (posRef.current <= 0) { posRef.current = 0; dirRef.current = 1; }
      setPos(posRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
  const stop = (auto: boolean) => {
    cancelAnimationFrame(rafRef.current);
    haptic();
    if (auto) { onResult("AUTO"); return; }
    const d = Math.abs(posRef.current - 50);
    onResult(d <= 7 ? "EXCELLENT" : d <= 18 ? "GOOD" : d <= 30 ? "FAIR" : "DEFECT");
  };
  return (
    <div className="gz-timing">
      <div className="gz-timing-track">
        <span className="gz-timing-green" />
        <span className="gz-timing-marker" style={{ left: `${pos}%` }} />
      </div>
      <div className="row g8">
        <Button onClick={() => stop(false)}>To'xtat! 🎯</Button>
        <Button variant="ghost" sm onClick={() => stop(true)}>Avtomatik</Button>
      </div>
      <button className="gz-timing-cancel" onClick={() => { cancelAnimationFrame(rafRef.current); onCancel(); }}>Bekor</button>
    </div>
  );
}