// 🏆 GARAJ v2 — the dedicated full-screen restoration game (opens when feature
// "garajx" is ON). Core loop: ol (buy) → diagnoz → ta'mirla → sot (flip).
// Pure view layer — all money logic + idempotency live on the server.
import { useCallback, useEffect, useRef, useState } from "react";
import type { GarajStateResponse, RepairQuality } from "@t1067/shared";
import { KOZACHA_SHOP, reputationTier, REPUTATION_TIERS, REPAIR_ZONES, ZONE_NAMES, PART_TIERS, garajCarMeta, CRAFT_STATIONS, craftCost, MAKE_BASE, npcForBuyer, npcLine } from "@t1067/shared";
import { api } from "./api";
import { haptic, hapticSuccess } from "./telegram";
import { Button, Card, Chip, CoinCounter, LoadSection, ProgressBar, Sheet } from "./design/components";
import "./garaj.css";

// buyer chips = named NPCs (#7) + their style preference hint — no hidden rules.
const BUYERS = [
  { code: "FAMILY_DRIVER", hint: "To'liq" },
  { code: "YOUNG_TUNER", hint: "Tюнинг" },
  { code: "NEWLYWED", hint: "To'liq/davr" },
  { code: "COLLECTOR", hint: "Davr (retro)" },
];
// restoration styles; TUNING/PERIOD_CORRECT gate on garage tier (matches the plan).
const STYLES = [
  { code: "QUICK_FLIP", name: "Tezkor", minTier: 1 },
  { code: "FULL_RESTORE", name: "To'liq", minTier: 1 },
  { code: "TUNING", name: "Tюнинг", minTier: 2 },
  { code: "PERIOD_CORRECT", name: "Davr asili", minTier: 3 },
];
const COND_LABEL: Record<string, string> = { WORN: "Eski", FAIR: "O'rtacha", GOOD: "Yaxshi", MINT: "A'lo" };
const STYLE_SHORT: Record<string, string> = { QUICK_FLIP: "Tezkor", FULL_RESTORE: "To'liq", TUNING: "Tюнинг", PERIOD_CORRECT: "Davr asili" };

// per-model paint so each car reads as ITS car (not a generic emoji)
const CAR_PAINT: Record<string, string> = {
  tiko: "#3aa6a0", damas: "#cdd2d9", matiz: "#d2433a", nexia: "#aeb6c4", spark: "#3d7fd6",
  cobalt: "#2b3a67", lacetti: "#c39a3c", malibu: "#262a33", tracker: "#e07b39", tahoe: "#2b313d", gelik: "#15171d",
};

/** Stylized side-view car. Condition drives grime/sheen/headlights; level ≥5 = gold frame.
 *  Pure SVG (no WebGL, no foreign images) → renders instantly inside Telegram in UZ. */
export function GarajCarArt({ carCode, condition, level, size = 132 }: { carCode: string; condition: string; level: number; size?: number }) {
  const body = CAR_PAINT[carCode] ?? "#8a93a3";
  const cond = (condition || "WORN").toUpperCase();
  const grime = cond === "WORN" ? 0.55 : cond === "FAIR" ? 0.3 : cond === "GOOD" ? 0.08 : 0;
  const sheen = cond === "MINT" ? 0.55 : cond === "GOOD" ? 0.28 : 0.12;
  const lightsOn = cond === "GOOD" || cond === "MINT";
  const gold = level >= 5;
  return (
    <svg viewBox="0 0 200 124" width={size} height={size * 0.62} className={`gz-art${cond === "MINT" ? " mint" : ""}${gold ? " gold" : ""}`} role="img" aria-label={`${carCode} ${cond}`}>
      <ellipse cx="100" cy="113" rx="80" ry="8" fill="rgba(0,0,0,0.4)" />
      {/* body */}
      <path d="M16 88 L30 60 Q34 51 45 49 L72 47 Q82 35 100 34 L130 35 Q152 37 164 56 L184 64 Q192 69 192 79 L192 89 Q192 95 184 95 L24 95 Q16 95 16 88 Z"
        fill={body} stroke={gold ? "#ffce4f" : "rgba(0,0,0,0.3)"} strokeWidth={gold ? 3.5 : 1.5} />
      {/* cabin glass */}
      <path d="M78 48 Q86 38 100 37 L124 38 Q140 40 148 54 L100 56 Z" fill="rgba(186,214,238,0.6)" />
      {/* sheen */}
      <path d="M40 70 L150 56 L150 62 L40 78 Z" fill="#ffffff" opacity={sheen} />
      {/* headlight */}
      {lightsOn && <circle cx="186" cy="75" r="12" fill="#fff3c4" opacity="0.32" />}
      <circle cx="186" cy="75" r="5" fill={lightsOn ? "#fff6d0" : "#5b626d"} />
      {/* wheels */}
      <circle cx="60" cy="95" r="17" fill="#14161b" /><circle cx="60" cy="95" r="7.5" fill="#3a4350" />
      <circle cx="146" cy="95" r="17" fill="#14161b" /><circle cx="146" cy="95" r="7.5" fill="#3a4350" />
      {/* grime + rust (worn) */}
      {grime > 0 && (
        <g opacity={grime}>
          <rect x="16" y="62" width="176" height="33" fill="#3b2f22" opacity="0.45" />
          <ellipse cx="52" cy="80" rx="11" ry="6" fill="#6b4423" />
          <ellipse cx="118" cy="84" rx="9" ry="5" fill="#6b4423" />
          <ellipse cx="168" cy="82" rx="7" ry="4" fill="#6b4423" />
        </g>
      )}
    </svg>
  );
}

export function GarajShell({ onClose, initial }: { onClose: () => void; initial?: GarajStateResponse }) {
  const [st, setSt] = useState<GarajStateResponse | null>(initial ?? null);
  const [state, setState] = useState<"loading" | "error" | "ready">(initial ? "ready" : "loading");
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState<{ amount: number; label: string } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>("QUICK_FLIP");
  const [repairZoneSel, setRepairZoneSel] = useState<string | null>(null); // zone being repaired
  const [partSel, setPartSel] = useState<string>("STD"); // chosen part tier
  const [bazaar, setBazaar] = useState<{ id: number; carCode: string; name: string; emoji: string; askPrice: number; mine: boolean }[]>([]);
  const [auctions, setAuctions] = useState<{ id: number; carCode: string; name: string; emoji: string; minBid: number; endsAt: string; mine: boolean }[]>([]);
  const [league, setLeague] = useState<{ rank: number; name: string; score: number; memberCount: number }[]>([]);
  const [history, setHistory] = useState<{ kind: string; carCode: string; name: string; emoji: string; amount: number; profit: number | null; at: string }[]>(initial ? GARAJ_DEMO_HISTORY : []);
  const [cipherInput, setCipherInput] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    if (initial) return; // demo/fixture mode — no backend fetch
    setState("loading");
    void api.garajBazaar().then(setBazaar).catch(() => undefined);
    void api.garajAuctions().then(setAuctions).catch(() => undefined);
    void api.garajMahallaLeague().then(setLeague).catch(() => undefined);
    void api.garajHistory().then(setHistory).catch(() => undefined);
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
      void api.garajHistory().then(setHistory).catch(() => undefined); // keep "Sotuvlar tarixi" fresh
    } catch {
      /* keep current state; user can retry */
    } finally {
      setBusy(false);
    }
  };

  const coins = st?.coins ?? 0;

  // 🏠 "my garage" hero: the active PROJECT car = the one still needing work (else newest)
  const condRank: Record<string, number> = { WORN: 0, FAIR: 1, GOOD: 2, MINT: 3 };
  const projectCar = st && st.cars.length ? [...st.cars].sort((a, b) => condRank[a.condition]! - condRank[b.condition]!)[0]! : null;
  const condPct = (c: string): number => ({ WORN: 25, FAIR: 50, GOOD: 75, MINT: 100 })[c] ?? 25;
  // "next dream" = cheapest car you don't own yet (aspirational progress bar)
  const dream = st ? st.shop.filter((s) => !s.owned).sort((a, b) => a.buyPrice - b.buyPrice)[0] ?? null : null;
  const ownedCount = st ? st.cars.length : 0;
  // reputation → next-tier progress (drives the hero bar)
  const tIdx = Math.max(0, (st?.garageTier ?? 1) - 1);
  const floorRep = REPUTATION_TIERS[tIdx]?.min ?? 0;
  const nextTier = REPUTATION_TIERS[tIdx + 1];
  const rep = st?.reputationScore ?? 0;
  const tierProg = nextTier
    ? { cur: rep - floorRep, max: Math.max(1, nextTier.min - floorRep), toNext: Math.max(0, nextTier.min - rep), nextName: nextTier.name }
    : { cur: 1, max: 1, toNext: 0, nextName: null as string | null };

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
              {/* 📅 weekly liveops event — a screen-wide chip (discount / bonus / drops / xp) */}
              {st.weeklyEvent && <div className="gz-weekevent">{st.weeklyEvent.label}</div>}

              {/* 🏠 STAGE — your active project car is the hero of the screen */}
              {projectCar ? (
                <button className="gz-stage" onClick={() => { haptic(); setOpenId(projectCar.id); }}>
                  <div className="gz-stage-badges">
                    <span className="gz-hero-badge">{st.reputationName ?? reputationTier(rep)}</span>
                    {st.prestige.count > 0 && <span className="gz-hero-stars">{"★".repeat(st.prestige.count)}</span>}
                    {st.seasonalEvent && <span className="gz-stage-season">🎉 {st.seasonalEvent}</span>}
                  </div>
                  <GarajCarArt carCode={projectCar.carCode} condition={projectCar.condition} level={projectCar.level} size={186} />
                  <div className="gz-stage-name">{projectCar.name}{projectCar.level > 1 ? ` ★${projectCar.level}` : ""}</div>
                  <div className="gz-stage-cond">
                    <span className={`gz-cond ${projectCar.condition.toLowerCase()}`}>{COND_LABEL[projectCar.condition] ?? projectCar.condition}</span>
                    <div className="gz-stage-bar"><ProgressBar value={condPct(projectCar.condition)} max={100} /></div>
                  </div>
                  <span className="gz-stage-cta">{projectCar.condition === "MINT" ? "💰 Sotishga tayyor" : projectCar.diagnosed ? "🔧 Ta'mirlash" : "🔍 Diagnoz qilish"} ›</span>
                </button>
              ) : (
                <div className="gz-stage empty">
                  <GarajCarArt carCode="tiko" condition="WORN" level={1} size={150} />
                  <div className="gz-stage-name">Garajingiz hozircha bo'sh</div>
                  <p className="gz-empty mt0">Bozor tabidan birinchi loyiha mashinangizni oling — keyin shu yerda tiklaysiz.</p>
                </div>
              )}

              {/* tier / reputation progress (compact, under the stage) */}
              <div className="gz-tier">
                <div className="gz-tier-line"><span className="dim fs12">Obro'</span> <b>{rep.toLocaleString("ru-RU")}</b> <span className="dim fs12">· Daraja {st.garageTier}/5</span></div>
                <ProgressBar value={tierProg.cur} max={tierProg.max} />
                <span className="gz-hero-next">{tierProg.nextName ? `${tierProg.toNext.toLocaleString("ru-RU")} obro' → ${tierProg.nextName}` : "Eng yuqori daraja 🏁"}</span>
              </div>

              {/* daily strip: streak + offline box (box ALWAYS visible) */}
              <div className="gz-daily">
                <div className="gz-streak">
                  <span className="gz-streak-fire">🔥</span>
                  <span className="gz-streak-n">{st.streak.current}</span>
                  <span className="gz-streak-lbl">
                    kun ketma-ket{st.streak.freezeAvailable ? " · 🛞 zaxira" : ""}
                    {st.streak.nextMilestone ? ` · ${st.streak.nextMilestone}-kunda bonus` : ""}
                  </span>
                </div>
                {st.offlineBoxPending > 0 ? (
                  <Button sm disabled={busy} onClick={() => collectBox()}>📦 Quti +{st.offlineBoxPending}</Button>
                ) : (
                  <span className="gz-box-idle">📦 Quti to'lmoqda</span>
                )}
              </div>

              {/* daily cipher — ALWAYS visible (pad / locked / no-code) */}
              <Card className="gz-cipher">
                {st.cipher.solvedToday ? (
                  <div className="gz-cipher-done mt0">🔐 Bugungi shifr yechildi ✓ (+{st.cipher.reward})</div>
                ) : !st.cipher.hasCode ? (
                  <div className="fs13 dim">🔐 Kunlik shifr — bugun kod yo'q. Kanalni kuzating: har kuni yangi 3 harf chiqadi (+{st.cipher.reward}).</div>
                ) : st.cipher.attemptsLeft <= 0 ? (
                  <div className="fs13 dim">🔐 Bugungi urinishlar tugadi — ertaga qayta urining.</div>
                ) : (
                  <>
                    <div className="gz-sec-title mt0">🔐 Kunlik shifr — kanaldagi 3 harf (+{st.cipher.reward})</div>
                    <div className="row g8">
                      <input className="gz-cipher-in" value={cipherInput} onChange={(e) => setCipherInput(e.target.value.toUpperCase().slice(0, 3))} placeholder="ABC" maxLength={3} aria-label="Shifr kodi" />
                      <Button sm disabled={busy || cipherInput.length < 3} onClick={() => submitCipher()}>Tasdiqlash</Button>
                    </div>
                    <div className="fs12 dim mt4">{st.cipher.attemptsLeft} urinish qoldi</div>
                  </>
                )}
              </Card>

              {/* 🚙 next dream — aspirational progress toward the next car */}
              {dream && (
                <div className="gz-dream">
                  <div className="gz-dream-art"><GarajCarArt carCode={dream.carCode} condition="GOOD" level={1} size={64} /></div>
                  <div className="gz-dream-info">
                    <span className="gz-dream-lbl">Keyingi orzu</span>
                    <span className="gz-dream-name">{dream.name}</span>
                    <ProgressBar value={Math.min(coins, dream.buyPrice)} max={dream.buyPrice} />
                    <span className="fs11 dim">{coins.toLocaleString("ru-RU")} / {dream.buyPrice.toLocaleString("ru-RU")} · Bozorda oling</span>
                  </div>
                </div>
              )}

              {/* 📦 Yo'l sovg'alari — real safarlardan topilgan buzuq mashina takliflari */}
              {st.roadDrops && st.roadDrops.length > 0 && (
                <>
                  <div className="gz-sec-title">📦 Yo'l sovg'alari</div>
                  <div className="col g8">
                    {st.roadDrops.map((d) => (
                      <Card key={d.id} className="gz-tow">
                        <div className="row between">
                          <span className="gz-tow-car">{d.emoji} <b>{d.name}</b> · yo'lda topildi</span>
                          <span className="gz-tow-price">🪙 {d.price.toLocaleString("ru-RU")}</span>
                        </div>
                        <div className="row g8 mt8">
                          <Button sm disabled={busy || coins < d.price} onClick={() => claimTow(d.id)}>Olish</Button>
                          <Button variant="ghost" sm disabled={busy} onClick={() => declineTow(d.id)}>Rad etish</Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}

              {/* 📋 NPC buyurtmalar — bugungi 3 topshiriq (mos mashinani tiklab → soting → bonus) */}
              {st.orders && st.orders.length > 0 && (
                <>
                  <div className="gz-sec-title">📋 Bugungi buyurtmalar</div>
                  <div className="col g8">
                    {st.orders.map((o) => {
                      const cm = garajCarMeta(o.carCode);
                      const npc = npcForBuyer(o.buyer);
                      return (
                        <Card key={o.slot} className={`gz-order${o.done ? " done" : ""}`}>
                          <div className="row between">
                            <span className="gz-order-car">{npc.emoji} <b>{npc.name}</b> so'rayapti</span>
                            <span className="gz-order-bonus">{o.done ? "✓" : `+${o.bonus}`}</span>
                          </div>
                          <span className="gz-order-line">"{npcLine(npc, o.slot)}"</span>
                          <span className="fs11 dim">→ {cm?.emoji ?? "🚗"} {cm?.name ?? o.carCode} · {STYLE_SHORT[o.style] ?? o.style} uslubda tiklab soting</span>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}

              {/* 🚗 collection — owned + locked (replaces the shop grid; shop now lives in Bozor) */}
              <div className="gz-sec-title">🚗 Mening kolleksiyam ({ownedCount}/{st.shop.length})</div>
              <div className="gz-coll">
                {st.shop.map((s) => {
                  const owned = st.cars.find((c) => c.carCode === s.carCode);
                  return owned ? (
                    <button key={s.carCode} className="gz-coll-car" onClick={() => { haptic(); setOpenId(owned.id); }}>
                      <GarajCarArt carCode={s.carCode} condition={owned.condition} level={owned.level} size={94} />
                      <span className="gz-coll-name">{s.name}</span>
                      <span className="gz-coll-tag own">✓{owned.level > 1 ? ` ★${owned.level}` : ""}</span>
                    </button>
                  ) : (
                    <div key={s.carCode} className="gz-coll-car locked">
                      <GarajCarArt carCode={s.carCode} condition="WORN" level={1} size={94} />
                      <span className="gz-coll-name">{s.name}</span>
                      <span className="gz-coll-tag">🔒</span>
                    </div>
                  );
                })}
              </div>

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

              {bazaar.filter((b) => b.mine).length > 0 && (
                <>
                  <div className="gz-sec-title">🏷 Mening sotuvdagilarim</div>
                  <div className="gz-grid">
                    {bazaar
                      .filter((b) => b.mine)
                      .map((b) => (
                        <Card key={b.id} className="gz-car">
                          <span className="gz-car-emoji">{b.emoji}</span>
                          <span className="gz-car-name">{b.name}</span>
                          <span className="gz-car-sub">🪙 {b.askPrice.toLocaleString("ru-RU")} · sotuvda</span>
                          <Button variant="ghost" sm disabled={busy} onClick={() => bazaarUnlist(b.id)}>
                            Bekor qilish
                          </Button>
                        </Card>
                      ))}
                  </div>
                </>
              )}

              <div className="gz-sec-title">🛒 Bozor — boshqa ustalardan</div>
              {bazaar.filter((b) => !b.mine).length === 0 ? (
                <p className="gz-empty">Hozircha boshqa ustalar e'loni yo'q. Mashinangizni sotuvga qo'ying — boshqalar shu yerdan sotib oladi.</p>
              ) : (
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

              {/* 📜 Sotuvlar tarixi — past flips + bazaar sales */}
              {history.length > 0 && (
                <>
                  <div className="gz-sec-title">📜 Sotuvlar tarixi</div>
                  <div className="gz-hist">
                    {history.map((h, i) => (
                      <div key={i} className="gz-hist-row">
                        <span className="gz-hist-emoji">{h.emoji}</span>
                        <span className="gz-hist-name">{h.name}<span className="gz-hist-kind">{h.kind === "bazaar" ? " · bozor" : ""}</span></span>
                        <span className="gz-hist-amt">
                          🪙 {h.amount.toLocaleString("ru-RU")}
                          {h.profit != null && <span className={h.profit >= 0 ? "gz-hist-prof up" : "gz-hist-prof down"}>{h.profit >= 0 ? "+" : ""}{h.profit.toLocaleString("ru-RU")}</span>}
                        </span>
                      </div>
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

              {/* 🏆 Ko'rgazma — weekly car show: submit, vote, last week's winner */}
              <div className="gz-sec-title">🏆 Haftalik ko'rgazma</div>
              <Card className="gz-exhib">
                {st.exhibition.lastWinner && (
                  <div className="gz-exhib-winner">🏅 O'tgan hafta g'olibi: {st.exhibition.lastWinner.emoji} <b>{st.exhibition.lastWinner.carName}</b> · {st.exhibition.lastWinner.name} ({st.exhibition.lastWinner.votes} ovoz)</div>
                )}
                {projectCar && st.exhibition.myEntryId == null && (
                  <Button sm className="mt4" disabled={busy} onClick={() => exhibitionSubmitAct(projectCar.id)}>📸 «{projectCar.name}»ni ko'rgazmaga qo'yish</Button>
                )}
                {st.exhibition.entries.length === 0 ? (
                  <p className="fs12 dim mt4">Hali hech kim qo'ymadi — birinchi bo'ling!</p>
                ) : (
                  <div className="gz-exhib-list mt8">
                    {st.exhibition.entries.map((e) => (
                      <div key={e.id} className={`gz-exhib-row${e.mine ? " mine" : ""}`}>
                        <span className="gz-exhib-car">{e.emoji} {e.name}{e.level > 1 ? ` ★${e.level}` : ""}{e.mine ? " · siz" : ""}</span>
                        <span className="gz-exhib-votes">👍 {e.votes}</span>
                        {!e.mine && st.exhibition.myVoteEntryId == null && (
                          <Button sm variant="ghost" disabled={busy} onClick={() => exhibitionVoteAct(e.id)}>Ovoz</Button>
                        )}
                        {st.exhibition.myVoteEntryId === e.id && <span className="gz-exhib-voted">✓</span>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

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

            {/* diagnose — reveals which zones are bad (so you don't waste a Sport part) */}
            <div className="gz-buyers">
              <Chip onClick={() => diagnose(car.id, "VISUAL")}>👁 Ko'z (bepul)</Chip>
              <Chip onClick={() => diagnose(car.id, "TOOL")}>🔧 Asbob (120)</Chip>
              <Chip onClick={() => diagnose(car.id, "EXPERT")}>🔬 Ekspert (400)</Chip>
            </div>

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

            {/* zones — fix each with a chosen part (Salvage→Sport): better part = +kondisiya + narx */}
            <div className="gz-sec-title">Zonalar — har birini ta'mirlang</div>
            {!(car.zones || car.diagnosis) ? (
              <p className="gz-empty">Ichki holat noma'lum — avval diagnoz qiling (qaysi zona buzuq ko'rinadi).</p>
            ) : (
              REPAIR_ZONES.map((zone) => {
                const known = (car.zones ?? car.diagnosis ?? {})[zone];
                const sel = repairZoneSel === zone;
                return (
                  <div key={zone} className="gz-zonecard">
                    <div className="gz-zone">
                      <span className="gz-zone-label">{ZONE_NAMES[zone] ?? zone}</span>
                      <ProgressBar value={known ?? 0} max={100} />
                      <span className="gz-zone-val">{known != null ? known : "?"}</span>
                    </div>
                    {known != null && known >= 96 ? (
                      <span className="fs11 dim gz-zone-done">✓ A'lo holatda</span>
                    ) : sel && repairing ? (
                      <TimingBar onResult={(q) => { setRepairing(false); setRepairZoneSel(null); repairZoneAct(car.id, zone, partSel, q); }} onCancel={() => { setRepairing(false); setRepairZoneSel(null); }} />
                    ) : sel ? (
                      <div className="gz-parts">
                        {PART_TIERS.map((p) => (
                          <Chip key={p.code} disabled={busy || coins < p.cost} onClick={() => { haptic(); setPartSel(p.code); setRepairing(true); }}>
                            {p.name} · 🪙{p.cost}
                          </Chip>
                        ))}
                        <button className="gz-timing-cancel" onClick={() => setRepairZoneSel(null)}>Bekor</button>
                      </div>
                    ) : (
                      <Button variant="ghost" sm disabled={busy} onClick={() => { haptic(); setRepairZoneSel(zone); }}>🔧 Detal qo'yish</Button>
                    )}
                  </div>
                );
              })
            )}

            <div className="gz-actions">
              {/* 🏭 Ustaxona — upgrade beyond stock for a higher flip (tanga sink) */}
              <div className="gz-sec-title">🏭 Ustaxona · Daraja {car.level}/5</div>
              <div className="col g8">
                {CRAFT_STATIONS.map((s) => {
                  const cost = craftCost(s.code, MAKE_BASE[car.carCode] ?? 1000, car.level);
                  const maxed = s.code === "TUNE" && car.level >= 5;
                  return (
                    <div key={s.code} className="gz-craft">
                      <div className="col">
                        <span className="gz-craft-name">{s.name}</span>
                        <span className="fs11 dim">{s.desc}</span>
                      </div>
                      <Button sm variant="ghost" disabled={busy || maxed || coins < cost} onClick={() => craft(car.id, s.code)}>
                        {maxed ? "Max" : `🪙 ${cost.toLocaleString("ru-RU")}`}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="gz-sec-title">Sotish — xaridorni tanlang</div>
              <div className="gz-buyers">
                {BUYERS.map((b) => {
                  const n = npcForBuyer(b.code as never);
                  return (
                    <Chip key={b.code} onClick={() => flip(car.id, b.code)}>
                      {n.emoji} {n.name} · {b.hint}
                    </Chip>
                  );
                })}
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

  function collectBox(): void {
    void act(
      () => api.garajCollectBox(),
      (grant) => { hapticSuccess(); setBurst({ amount: grant, label: "OFFLINE QUTI 📦" }); setTimeout(() => setBurst(null), 1900); },
    );
  }
  function claimTow(dropId: number): void {
    void act(() => api.garajClaimTow(dropId));
    flash("Mashina garajga qo'shildi 🚗");
  }
  function declineTow(dropId: number): void {
    void act(() => api.garajDeclineTow(dropId));
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
  function exhibitionSubmitAct(id: number): void {
    void act(() => api.garajExhibitionSubmit(id));
    flash("Ko'rgazmaga qo'yildi 🏆");
  }
  function exhibitionVoteAct(entryId: number): void {
    void act(() => api.garajExhibitionVote(entryId));
    flash("Ovoz berildi 👍");
  }
  function mahallaNameDefault(): string {
    return `Garaj ${Math.floor(coins % 1000)}`; // simple auto-name; rename UI ships later
  }
  function diagnose(id: number, tier: "VISUAL" | "TOOL" | "EXPERT"): void {
    void act(() => api.garajDiagnose(id, tier));
  }
  function repairZoneAct(id: number, zone: string, partTierCode: string, quality?: RepairQuality): void {
    void act(() => api.garajRepairZone(id, zone, partTierCode, car?.style ?? selectedStyle, quality));
  }
  function kozBuy(itemCode: string, id: number): void {
    void act(() => api.garajKozBuy(itemCode, id));
  }
  function craft(id: number, station: string): void {
    void act(() => api.garajCraft(id, station));
    flash(station === "TUNE" ? "Daraja oshdi 🔧" : station === "PAINT" ? "Bo'yaldi — sifat +4% 🎨" : "To'liq restavratsiya ⚙");
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
        void api.garajHistory().then(setHistory).catch(() => undefined);
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
    flash("Bozorga qo'yildi — pastdagi 🏷 «Mening sotuvdagilarim»da");
  }
  function bazaarBuy(listingId: number): void {
    void bazaarAct(() => api.garajBazaarBuy(listingId));
  }
  function bazaarUnlist(listingId: number): void {
    void bazaarAct(() => api.garajBazaarUnlist(listingId));
  }
  function aucBid(auctionId: number, amount: number): void {
    void bazaarAct(() => api.garajAuctionBid(auctionId, amount));
  }
  function aucCreate(id: number, minBid: number): void {
    void bazaarAct(() => api.garajAuctionCreate(id, minBid));
    setOpenId(null);
  }
  async function flip(id: number, buyer: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.garajFlip(id, buyer);
      if (r.ok) {
        hapticSuccess();
        const ob = r.orderBonus ?? 0;
        setBurst({ amount: (r.grant ?? 0) + ob, label: ob > 0 ? `SOTILDI! 📋 buyurtma +${ob}` : "SOTILDI!" });
        setOpenId(null);
        setTimeout(() => setBurst(null), 2100);
      } else if (r.reason === "daily_cap") flash("Bugungi sotuv chegarasi to'ldi");
      if (!initial) {
        setSt(await api.garajState());
        void api.garajHistory().then(setHistory).catch(() => undefined);
      }
    } catch {
      /* keep state */
    } finally {
      setBusy(false);
    }
  }
}

// Sales-history fixture for the #garajdemo render-proof.
export const GARAJ_DEMO_HISTORY: { kind: string; carCode: string; name: string; emoji: string; amount: number; profit: number | null; at: string }[] = [
  { kind: "flip", carCode: "nexia", name: "Nexia", emoji: "🚙", amount: 3120, profit: 980, at: "2026-06-18T10:00:00Z" },
  { kind: "flip", carCode: "tiko", name: "Tiko", emoji: "🚙", amount: 845, profit: 210, at: "2026-06-18T09:00:00Z" },
  { kind: "bazaar", carCode: "matiz", name: "Matiz", emoji: "🚗", amount: 1700, profit: null, at: "2026-06-17T18:00:00Z" },
];

// Static fixture for the #garajdemo render-proof (no backend, no auth).
export const GARAJ_DEMO: GarajStateResponse = {
  enabled: true,
  coins: 4820,
  kozacha: 24,
  garageTier: 2,
  reputationScore: 1340,
  onboardStep: 5,
  cars: [
    { id: 1, carCode: "nexia", name: "Nexia", emoji: "🚙", basePrice: 2600, source: "ride_drop", condition: "GOOD", style: "FULL_RESTORE", level: 2, diagnosed: true, diagnosis: { engine: 72, body: 58, transmission: 64, electric: 80, interior: 45 }, zones: { engine: 72, body: 58, transmission: 64, electric: 80, interior: 45 }, acquireCost: 1690, repairSpent: 240 },
    { id: 2, carCode: "damas", name: "Damas", emoji: "🚐", basePrice: 900, source: "shop", condition: "WORN", style: null, level: 1, diagnosed: false, diagnosis: null, zones: null, acquireCost: 585, repairSpent: 0 },
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
  cipher: { solvedToday: false, attemptsLeft: 5, reward: 30, hasCode: true },
  prestige: { count: 0, multiplier: 1.0, eligible: false },
  offlineBoxPending: 18,
  seasonalEvent: "Navro'z",
  mahalla: { id: 1, name: "Koson Ustalari", code: "LUPYQG", weeklyScore: 1240, memberCount: 7, rank: 2, role: "MEMBER" },
  orders: [
    { slot: 0, carCode: "nexia", style: "FULL_RESTORE", buyer: "FAMILY_DRIVER", bonus: 208, done: false },
    { slot: 1, carCode: "matiz", style: "TUNING", buyer: "YOUNG_TUNER", bonus: 120, done: true },
    { slot: 2, carCode: "tiko", style: "PERIOD_CORRECT", buyer: "COLLECTOR", bonus: 120, done: false },
  ],
  roadDrops: [{ id: 1, carCode: "matiz", name: "Matiz", emoji: "🚗", price: 825, expiresAt: "2026-06-20T10:00:00Z" }],
  weeklyEvent: { type: "discount_service", label: "🔧 Arzon ta'mir haftasi (−20%)", mult: 0.8 },
  exhibition: {
    entries: [
      { id: 1, carCode: "tahoe", name: "Tahoe", emoji: "🚙", level: 4, condition: "MINT", votes: 12, mine: false },
      { id: 2, carCode: "nexia", name: "Nexia", emoji: "🚙", level: 2, condition: "GOOD", votes: 5, mine: true },
    ],
    myEntryId: 2,
    myVoteEntryId: null,
    lastWinner: { name: "Jasur", carName: "Malibu", emoji: "🏎", votes: 19 },
  },
};

/** #garajdemo render-proof entry — the shell populated from the static fixture. */
export function GarajDemo() {
  return <GarajShell initial={GARAJ_DEMO} onClose={() => { window.location.hash = ""; }} />;
}

// 🏁 Garaj Bozori — the app-level "Bozor" tab market: every player's open listings
// + live auctions, buyable here without entering the game. Money logic is server-side.
export function GarajMarketView({ coins, onBanner }: { coins: number; onBanner?: (m: string) => void }) {
  const [bazaar, setBazaar] = useState<{ id: number; carCode: string; name: string; emoji: string; askPrice: number; mine: boolean }[]>([]);
  const [auctions, setAuctions] = useState<{ id: number; carCode: string; name: string; emoji: string; minBid: number; endsAt: string; mine: boolean }[]>([]);
  const [shop, setShop] = useState<{ carCode: string; name: string; emoji: string; buyPrice: number; owned: boolean; demandMult?: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);
  const load = useCallback(() => {
    void api.garajBazaar().then(setBazaar).catch(() => undefined);
    void api.garajAuctions().then(setAuctions).catch(() => undefined);
    void api.garajState().then((s) => setShop(s.shop)).catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);
  const act = async (fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg?: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await fn();
      if (r.ok) { hapticSuccess(); if (okMsg) onBanner?.(okMsg); }
      else if (r.reason === "insufficient") onBanner?.("Tanga yetarli emas");
      else if (r.reason === "already_sold") onBanner?.("Allaqachon sotilgan");
      else if (r.reason === "owned") onBanner?.("Bu mashina sizda bor");
      else if (r.reason === "self_trade") onBanner?.("O'z e'loningizni sotib ololmaysiz");
      else if (r.reason === "off") onBanner?.("Hozir mavjud emas");
      else if (!r.ok) onBanner?.("Xatolik — qayta urining");
      load();
    } catch { onBanner?.("Internet xatosi — qayta urining"); } finally { setBusy(false); }
  };
  const open = bazaar.filter((b) => !b.mine).sort((a, b) => (sortAsc ? a.askPrice - b.askPrice : b.askPrice - a.askPrice));
  const mine = bazaar.filter((b) => b.mine);
  const liveAuctions = auctions.filter((a) => !a.mine);
  return (
    <div className="view gz-market">
      <div className="gz-market-head">
        <span className="gz-market-title">🏁 Garaj Bozori</span>
        <span className="gz-market-sub">Yangi loyiha oling yoki boshqa ustalardan tiklangan mashina soting/sotib oling</span>
      </div>

      {/* 🛒 Do'kon — buy a fresh project car (moved here from the GARAJ screen) */}
      <div className="gz-sec-title">🛒 Do'kon — yangi loyiha</div>
      <div className="gz-coll">
        {shop.filter((s) => !s.owned).map((s) => (
          <div key={s.carCode} className="gz-coll-car">
            <GarajCarArt carCode={s.carCode} condition="WORN" level={1} size={94} />
            <span className="gz-coll-name">{s.name}</span>
            {s.demandMult != null && Math.abs(s.demandMult - 1) >= 0.03 && (
              <span className={`gz-demand ${s.demandMult > 1 ? "up" : "down"}`}>{s.demandMult > 1 ? `talab ↑ ${Math.round((s.demandMult - 1) * 100)}%` : `talab ↓ ${Math.round((1 - s.demandMult) * 100)}%`}</span>
            )}
            <Button sm disabled={busy || coins < s.buyPrice} onClick={() => act(() => api.garajAcquire(s.carCode), `${s.name} olindi! 🔧`)}>🪙 {s.buyPrice.toLocaleString("ru-RU")}</Button>
          </div>
        ))}
        {shop.length > 0 && shop.every((s) => s.owned) && <p className="gz-empty">Barcha mashinalar sizda! 🏆</p>}
      </div>

      {mine.length > 0 && (
        <>
          <div className="gz-sec-title">🏷 Mening sotuvdagilarim</div>
          <div className="gz-grid">
            {mine.map((b) => (
              <Card key={b.id} className="gz-car">
                <span className="gz-car-emoji">{b.emoji}</span>
                <span className="gz-car-name">{b.name}</span>
                <span className="gz-car-sub">🪙 {b.askPrice.toLocaleString("ru-RU")} · sotuvda</span>
                <Button variant="ghost" sm disabled={busy} onClick={() => act(() => api.garajBazaarUnlist(b.id), "Bekor qilindi")}>Bekor qilish</Button>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="gz-sec-title">
        🛒 Ochiq e'lonlar
        {open.length > 1 && <button className="gz-sort" onClick={() => { haptic(); setSortAsc((s) => !s); }}>{sortAsc ? "narx ↑" : "narx ↓"}</button>}
      </div>
      {open.length === 0 ? (
        <p className="gz-empty">Hozircha boshqa ustalar e'loni yo'q. GARAJ'da mashinangizni «Bozorga qo'yish» bilan birinchi bo'ling.</p>
      ) : (
        <div className="gz-grid">
          {open.map((b) => (
            <Card key={b.id} className="gz-car">
              <span className="gz-car-emoji">{b.emoji}</span>
              <span className="gz-car-name">{b.name}</span>
              <span className="gz-car-sub">🪙 {b.askPrice.toLocaleString("ru-RU")}</span>
              <Button sm disabled={busy || coins < b.askPrice} onClick={() => act(() => api.garajBazaarBuy(b.id), "Sotib olindi! 🚗")}>Sotib olish</Button>
            </Card>
          ))}
        </div>
      )}

      {liveAuctions.length > 0 && (
        <>
          <div className="gz-sec-title">🔨 Auksionlar (yopiq taklif)</div>
          <div className="col g8">
            {liveAuctions.map((a) => (
              <Card key={a.id} className="gz-auc">
                <div className="row between">
                  <span>{a.emoji} {a.name}</span>
                  <span className="fs12 dim">min 🪙{a.minBid.toLocaleString("ru-RU")}</span>
                </div>
                <div className="gz-buyers">
                  {[1, 1.5, 2].map((mult) => {
                    const bid = Math.round(a.minBid * mult);
                    return <Chip key={mult} onClick={() => act(() => api.garajAuctionBid(a.id, bid), "Taklif yuborildi 🔨")}>🪙{bid.toLocaleString("ru-RU")}</Chip>;
                  })}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 👤 Player collection sheet — opened by tapping a Reyting row. Shows another
// master's garage: reputation, stats, and the cars they own. Read-only.
export function GarajCollectionSheet({ memberId, name, onClose }: { memberId: number; name: string; onClose: () => void }) {
  const [col, setCol] = useState<Awaited<ReturnType<typeof api.garajCollection>>>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api.garajCollection(memberId).then((c) => { if (alive) { setCol(c); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [memberId]);
  return (
    <Sheet open onClose={onClose}>
      {loading ? (
        <p className="gz-empty">Yuklanmoqda…</p>
      ) : !col ? (
        <p className="gz-empty">Kolleksiya topilmadi.</p>
      ) : (
        <div className="col g8">
          <div className="gz-col-head">
            <span className="gz-hero-badge">{col.reputationName}</span>
            {col.prestige > 0 && <span className="gz-hero-stars">{"★".repeat(col.prestige)}</span>}
          </div>
          <div className="gz-title">{col.name || name}</div>
          <div className="gz-col-stats">
            <div><b>{col.reputationScore.toLocaleString("ru-RU")}</b><span>obro'</span></div>
            <div><b>{col.carsOwned}</b><span>mashina</span></div>
            <div><b>{col.flips}</b><span>sotuv</span></div>
            <div><b>{col.bestProfit.toLocaleString("ru-RU")}</b><span>eng zo'r foyda</span></div>
          </div>
          {col.mahalla && <div className="fs12 dim">🏘 {col.mahalla} · Daraja {col.garageTier}/5</div>}
          <div className="gz-sec-title">Kolleksiya</div>
          {col.cars.length === 0 ? (
            <p className="gz-empty">Hozircha garajda mashina yo'q.</p>
          ) : (
            <div className="gz-grid">
              {col.cars.map((c, i) => (
                <Card key={i} className="gz-car">
                  <span className={`gz-cond ${c.condition.toLowerCase()}`}>{COND_LABEL[c.condition] ?? c.condition}</span>
                  <span className="gz-car-emoji">{c.emoji}</span>
                  <span className="gz-car-name">{c.name}</span>
                  <span className="gz-car-sub">{c.level > 1 ? `★${c.level}` : "Daraja 1"}</span>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
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