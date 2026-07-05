// 🔎 XIZMATLAR (feature "xizmatlar") — Koson services directory, "Koson 2GIS'i" darajasi:
// qidiruv → kategoriya grid → reyting/verified'li kartalar → boy profil (galereya + baho/sharh +
// bir bosishda qo'ng'iroq) → o'z xizmatini qo'shish (ega ✅/❌ moderatsiya). PUL YO'Q — faqat
// katalog. Har async holat skeleton bilan; barcha ranglar tokens.css klasslaridan.
import { useEffect, useMemo, useRef, useState } from "react";
import type { MeResponse, ServiceCategoryView, ServiceListingCard, ServiceListingDetail, ServiceReviewView, ServiceSubmitBody } from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess } from "./telegram";
import { Button, EmptyState, Sheet, Skeleton } from "./design/components";

const ACCENTS = ["#ffb300", "#f0426b", "#8b5cf6", "#22c55e", "#38bdf8", "#fb923c"];
function accentOf(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return ACCENTS[(h >>> 0) % ACCENTS.length]!;
}

/** "08:00-19:00" → open now? null = unknown/24h. Overnight ranges (22:00-06:00) supported. */
function openNow(wh?: string | null): boolean | null {
  if (!wh) return null;
  const m = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.exec(wh.trim());
  if (!m) return null;
  const cur = new Date().getHours() * 60 + new Date().getMinutes();
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(m[3]) * 60 + Number(m[4]);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}

function Stars({ v, dim }: { v: number; dim?: boolean }) {
  const full = Math.round(v);
  return (
    <span className={"svc-stars" + (dim ? " dim" : "")} aria-label={`${v} yulduz`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= full ? "on" : ""}>★</span>
      ))}
    </span>
  );
}

function RatingLine({ l }: { l: ServiceListingCard }) {
  if (l.reviewCount === 0) return <span className="muted fs12">Hali baho yo'q — birinchi bo'ling</span>;
  return (
    <span className="svc-rating-line">
      <span className="svc-rating-num">★ {l.avgRating.toFixed(1)}</span>
      <span className="muted fs12">({l.reviewCount})</span>
    </span>
  );
}

function OpenBadge({ wh }: { wh?: string | null }) {
  const o = openNow(wh);
  if (o === null) return null;
  return <span className={"svc-open" + (o ? "" : " closed")}>{o ? "Ochiq" : "Yopiq"} · {wh}</span>;
}

function SvcCard({ l, onOpen }: { l: ServiceListingCard; onOpen: (l: ServiceListingCard) => void }) {
  return (
    <button className="svc-card glass" onClick={() => onOpen(l)} style={{ ["--acc" as string]: accentOf(l.categoryName) }}>
      <div className="svc-card-thumb">
        {l.hasPhoto ? (
          <img src={apiUrl(`/api/services/photo/${l.id}`)} loading="lazy" alt="" />
        ) : (
          <span className="svc-card-emoji">{l.categoryEmoji || "🏪"}</span>
        )}
      </div>
      <div className="svc-card-body">
        <div className="svc-card-name">
          {l.isVip && <span className="svc-vip">TOP</span>}
          {l.name} {l.verified && <span className="svc-verified" title="Tasdiqlangan">✔</span>}
        </div>
        <RatingLine l={l} />
        {l.tags && <div className="svc-card-tags">{l.tags}</div>}
        <div className="svc-card-meta">
          <OpenBadge wh={l.workHours} />
          {!l.workHours && l.address && <span className="muted fs12">{l.address}</span>}
        </div>
      </div>
      <span className="svc-call-dot">📞</span>
    </button>
  );
}

// ── review widgets ──────────────────────────────────────────────────────────────────────────────

function RateBox({ listingId, initial, onDone }: { listingId: number; initial: { stars: number; text: string } | null; onDone: (avg: number, n: number) => void }) {
  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [text, setText] = useState(initial?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (!stars) return;
    setBusy(true);
    try {
      const r = await api.svcReview(listingId, stars, text);
      if (r.ok) {
        hapticSuccess();
        setDone(true);
        onDone(r.avgRating ?? 0, r.reviewCount ?? 0);
      }
    } catch { /* tarmoq — jim */ }
    setBusy(false);
  };
  if (done) return <div className="svc-rate-done">✅ Bahoyingiz saqlandi — rahmat!</div>;
  return (
    <div className="svc-rate-box glass pad">
      <div className="fs13"><b>{initial ? "Bahoni tahrirlash" : "Baho bering"}</b></div>
      <div className="svc-rate-stars">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} className={i <= stars ? "on" : ""} onClick={() => { haptic(); setStars(i); }}>★</button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <textarea className="svc-rate-text" placeholder="Fikringiz (ixtiyoriy)…" value={text} maxLength={400} onChange={(e) => setText(e.target.value)} rows={2} />
          <Button variant="brand" disabled={busy} onClick={submit}>{busy ? "Yuborilmoqda…" : "Yuborish"}</Button>
        </>
      )}
    </div>
  );
}

function ReviewRow({ r, onBanner }: { r: ServiceReviewView; onBanner: (m: string) => void }) {
  const [reported, setReported] = useState(false);
  return (
    <div className="svc-review">
      <div className="between">
        <b className="fs13">{r.authorName}</b>
        <Stars v={r.stars} dim />
      </div>
      {r.text && <div className="fs13 mt4">{r.text}</div>}
      <div className="between mt4">
        <span className="muted fs11">{new Date(r.createdAt).toLocaleDateString("uz-UZ")}</span>
        {!r.mine && !reported && (
          <button className="svc-report" onClick={() => { setReported(true); api.svcReport(r.id).then(() => onBanner("Shikoyat qabul qilindi")).catch(() => undefined); }}>
            ⚑ Shikoyat
          </button>
        )}
      </div>
    </div>
  );
}

// ── detail sheet ────────────────────────────────────────────────────────────────────────────────

function DetailSheet({ id, onClose, onBanner }: { id: number; onClose: () => void; onBanner: (m: string) => void }) {
  const [d, setD] = useState<ServiceListingDetail | null>(null);
  const [err, setErr] = useState(false);
  const [reviews, setReviews] = useState<ServiceReviewView[] | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [showRate, setShowRate] = useState(false);

  useEffect(() => {
    api.svcItem(id).then(setD).catch(() => setErr(true));
    api.svcReviews(id).then((r) => setReviews(r.reviews)).catch(() => setReviews([]));
  }, [id]);

  const call = () => {
    if (!d) return;
    haptic();
    void api.svcCall(d.id).catch(() => undefined);
    window.location.href = `tel:${d.phone}`;
  };
  const copy = (p: string) => {
    haptic();
    try {
      void navigator.clipboard.writeText(p);
      onBanner("📋 Raqam nusxalandi");
    } catch {
      onBanner(p);
    }
  };

  return (
    <Sheet open onClose={onClose}>
      {err ? (
        <EmptyState icon="📡" text="Yuklanmadi — qayta urinib ko'ring" />
      ) : !d ? (
        <><Skeleton h={150} /><Skeleton h={20} w="60%" className="mt8" /><Skeleton h={40} className="mt8" /></>
      ) : (
        <div className="svc-detail">
          {d.photoCount > 0 ? (
            <div className="svc-gallery">
              <div className="svc-gallery-strip" onScroll={(e) => { const el = e.currentTarget; setGalleryIdx(Math.round(el.scrollLeft / el.clientWidth)); }}>
                {Array.from({ length: Math.min(6, d.photoCount) }, (_, i) => (
                  <img key={i} src={apiUrl(`/api/services/photo/${d.id}/${i}`)} alt="" loading={i === 0 ? "eager" : "lazy"} />
                ))}
              </div>
              {d.photoCount > 1 && (
                <div className="svc-gallery-dots">
                  {Array.from({ length: Math.min(6, d.photoCount) }, (_, i) => <span key={i} className={i === galleryIdx ? "on" : ""} />)}
                </div>
              )}
            </div>
          ) : (
            <div className="svc-detail-noimg" style={{ ["--acc" as string]: accentOf(d.categoryName) }}>{d.categoryEmoji || "🏪"}</div>
          )}

          <h3 className="svc-detail-name">
            {d.name} {d.verified && <span className="svc-verified big">✔</span>}
          </h3>
          <div className="svc-detail-social">
            {d.reviewCount > 0 ? (
              <><Stars v={d.avgRating} /> <b>{d.avgRating.toFixed(1)}</b> · {d.reviewCount} baho</>
            ) : (
              <span className="muted">Yangi xizmat</span>
            )}
            {d.callCount > 0 && <span className="muted"> · 📞 {d.callCount} marta</span>}
          </div>

          <div className="svc-actions">
            <button className="svc-act primary" onClick={call}>📞 Qo'ng'iroq</button>
            <button className="svc-act" onClick={() => copy(d.phone)}>📋 Nusxa</button>
            <button className="svc-act" onClick={() => { haptic(); setShowRate(true); }}>★ Baho</button>
          </div>

          <div className="svc-info glass pad">
            <div className="svc-info-row"><span>📞</span><b>{d.phone}</b></div>
            {d.phone2 && <div className="svc-info-row"><span>📞</span><b>{d.phone2}</b></div>}
            {d.workHours && <div className="svc-info-row"><span>🕒</span><OpenBadge wh={d.workHours} /></div>}
            {d.address && <div className="svc-info-row"><span>📍</span>{d.address}</div>}
            {d.tags && <div className="svc-info-row"><span>🏷</span><span className="muted">{d.tags}</span></div>}
          </div>
          {d.desc && <p className="fs13 svc-desc">{d.desc}</p>}

          {(showRate || d.myReview) && (
            <RateBox
              listingId={d.id}
              initial={d.myReview ?? null}
              onDone={(avg, n) => {
                setD({ ...d, avgRating: avg, reviewCount: n });
                api.svcReviews(d.id).then((r) => setReviews(r.reviews)).catch(() => undefined);
              }}
            />
          )}

          <div className="svc-reviews">
            <div className="between">
              <b className="fs14">Baholar {d.reviewCount > 0 ? `(${d.reviewCount})` : ""}</b>
              {!showRate && !d.myReview && (
                <button className="svc-rate-cta" onClick={() => { haptic(); setShowRate(true); }}>★ Baho berish</button>
              )}
            </div>
            {reviews === null ? (
              <Skeleton h={54} className="mt8" />
            ) : reviews.length === 0 ? (
              <div className="muted fs13 mt8">Hali sharh yo'q — birinchi fikrni siz yozing.</div>
            ) : (
              reviews.map((r) => <ReviewRow key={r.id} r={r} onBanner={onBanner} />)
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ── submit form ─────────────────────────────────────────────────────────────────────────────────

function SubmitSheet({ cats, onClose, onBanner }: { cats: ServiceCategoryView[]; onClose: () => void; onBanner: (m: string) => void }) {
  const [b, setB] = useState<ServiceSubmitBody>({ categoryId: 0, name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof ServiceSubmitBody, v: string | number) => setB((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    setBusy(true);
    setErrMsg(null);
    try {
      const r = await api.svcSubmit(b);
      if (r.ok) {
        hapticSuccess();
        setSent(true);
      } else {
        const msgs: Record<string, string> = {
          off: "Bo'lim hozircha yopiq",
          bad_name: "Nom kamida 3 harf bo'lsin",
          bad_phone: "Telefon raqam noto'g'ri — +998 XX XXX XX XX",
          bad_category: "Kategoriyani tanlang",
          daily_limit: "Bugungi limit tugadi — ertaga yana yuborishingiz mumkin",
          duplicate: "Bu raqam bilan xizmat allaqachon mavjud",
        };
        setErrMsg(msgs[r.reason ?? ""] ?? "Xatolik — qayta urinib ko'ring");
      }
    } catch {
      setErrMsg("Tarmoq xatosi — qayta urinib ko'ring");
    }
    setBusy(false);
  };
  if (sent) {
    return (
      <Sheet open onClose={onClose}>
        <EmptyState icon="⏳" text="So'rov yuborildi! Admin tekshirgach xizmatingiz katalogda paydo bo'ladi — sizga xabar keladi." action="Yopish" onAction={onClose} />
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={onClose}>
      <h3>➕ Xizmatimni qo'shish</h3>
      <p className="muted fs13">Bepul. Admin tasdiqlagach katalogda ko'rinadi — mijozlar sizni topadi.</p>
      <div className="svc-cat-chips">
        {cats.map((c) => (
          <button key={c.id} className={"svc-chip" + (b.categoryId === c.id ? " on" : "")} onClick={() => { haptic(); set("categoryId", c.id); }}>
            {c.emoji} {c.name}
          </button>
        ))}
      </div>
      <input className="bk-input mt8" placeholder="Xizmat nomi (masalan: Usta Karim — santexnik)" value={b.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
      <input className="bk-input mt8" placeholder="Telefon: +998 90 123 45 67" inputMode="tel" value={b.phone} onChange={(e) => set("phone", e.target.value)} />
      <input className="bk-input mt8" placeholder="Qisqa tavsif (nima qilasiz?)" value={b.desc ?? ""} maxLength={500} onChange={(e) => set("desc", e.target.value)} />
      <input className="bk-input mt8" placeholder="Kalit so'zlar: santexnik, kran, isitish" value={b.tags ?? ""} maxLength={200} onChange={(e) => set("tags", e.target.value)} />
      <input className="bk-input mt8" placeholder="Manzil (ixtiyoriy)" value={b.address ?? ""} maxLength={160} onChange={(e) => set("address", e.target.value)} />
      <input className="bk-input mt8" placeholder="Ish vaqti: 08:00-19:00 (ixtiyoriy)" value={b.workHours ?? ""} maxLength={20} onChange={(e) => set("workHours", e.target.value)} />
      {errMsg && <div className="sheet-err">{errMsg}</div>}
      <Button variant="brand" disabled={busy || !b.categoryId || b.name.trim().length < 3 || b.phone.trim().length < 7} onClick={submit}>
        {busy ? "Yuborilmoqda…" : "Yuborish"}
      </Button>
      {void onBanner}
    </Sheet>
  );
}

// ── main view ───────────────────────────────────────────────────────────────────────────────────

export function XizmatlarView({ me, onBanner }: { me: MeResponse; onBanner: (msg: string) => void }) {
  const [cats, setCats] = useState<ServiceCategoryView[] | null>(null);
  const [top, setTop] = useState<ServiceListingCard[] | null>(null);
  const [err, setErr] = useState(false);
  const [cat, setCat] = useState<ServiceCategoryView | null>(null);
  const [catRows, setCatRows] = useState<ServiceListingCard[] | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<ServiceListingCard[] | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [mine, setMine] = useState<{ id: number; name: string; status: string; callCount: number; viewCount: number; avgRating: number; reviewCount: number }[] | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () => {
    setErr(false);
    Promise.all([api.svcCategories(), api.svcList({ limit: 8 })])
      .then(([c, l]) => { setCats(c.categories); setTop(l.listings); })
      .catch(() => setErr(true));
  };
  useEffect(load, []);

  // server-side search, debounced 300ms (name + tags + phone + desc)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const t = q.trim();
    if (!t) { setFound(null); return; }
    debounce.current = setTimeout(() => {
      api.svcList({ q: t, limit: 30 }).then((r) => setFound(r.listings)).catch(() => setFound([]));
    }, 300);
  }, [q]);

  const openCat = (c: ServiceCategoryView) => {
    haptic();
    setCat(c);
    setCatRows(null);
    api.svcList({ cat: c.id, limit: 50 }).then((r) => setCatRows(r.listings)).catch(() => setCatRows([]));
  };
  const openMine = () => {
    haptic();
    setMineOpen(true);
    api.svcMine().then((r) => setMine(r.listings)).catch(() => setMine([]));
  };

  const totalCount = useMemo(() => (cats ?? []).reduce((s, c) => s + c.count, 0), [cats]);
  const statusUz: Record<string, string> = { pending: "⏳ Kutilmoqda", active: "✅ Katalogda", rejected: "❌ Rad etilgan", archived: "🗄 Arxiv" };

  return (
    <div className="svc-wrap">
      <div className="between">
        <div>
          <div className="svc-title">🔎 Xizmatlar</div>
          <div className="muted fs12">{totalCount > 0 ? `Koson bo'yicha ${totalCount} ta xizmat — toping, qo'ng'iroq qiling` : "Kosonning barcha xizmatlari bir joyda"}</div>
        </div>
        <button className="svc-mine-btn" onClick={openMine}>🏪 Meniki</button>
      </div>

      <div className="shop-search-wrap mt10">
        <input className="shop-search" placeholder="🔍 Usta, sartarosh, sement…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="shop-search-x" onClick={() => setQ("")}>✕</button>}
      </div>

      {err ? (
        <EmptyState icon="📡" text="Yuklanmadi — internetni tekshirib qayta urinib ko'ring" action="🔄 Qayta urinish" onAction={load} />
      ) : q.trim() ? (
        found === null ? (
          <div className="mt10"><Skeleton h={74} /><Skeleton h={74} className="mt8" /></div>
        ) : found.length === 0 ? (
          <EmptyState icon="🔍" text={`«${q}» topilmadi — boshqacha yozib ko'ring`} action="Tozalash" onAction={() => setQ("")} />
        ) : (
          <div className="svc-list mt10">{found.map((l) => <SvcCard key={l.id} l={l} onOpen={(x) => { haptic(); setSelId(x.id); }} />)}</div>
        )
      ) : cat ? (
        <>
          <button className="pay-back mt8" onClick={() => { haptic(); setCat(null); }}>‹ Barcha kategoriyalar</button>
          <div className="svc-cat-head">
            <span className="svc-cat-head-emoji">{cat.emoji}</span>
            <div>
              <b>{cat.name}</b>
              <div className="muted fs12">{cat.count} ta xizmat · reyting bo'yicha</div>
            </div>
          </div>
          {catRows === null ? (
            <><Skeleton h={74} /><Skeleton h={74} className="mt8" /><Skeleton h={74} className="mt8" /></>
          ) : catRows.length === 0 ? (
            <EmptyState icon={cat.emoji || "🏪"} text="Bu kategoriyada hali xizmat yo'q — birinchi bo'lib qo'shiling!" action="➕ Xizmat qo'shish" onAction={() => setSubmitOpen(true)} />
          ) : (
            <div className="svc-list">{catRows.map((l) => <SvcCard key={l.id} l={l} onOpen={(x) => { haptic(); setSelId(x.id); }} />)}</div>
          )}
        </>
      ) : cats === null ? (
        <div className="mt10">
          <div className="svc-cat-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={78} />)}</div>
          <Skeleton h={74} className="mt10" />
        </div>
      ) : (
        <>
          <div className="svc-cat-grid mt10">
            {cats.map((c) => (
              <button key={c.id} className="svc-cat-tile glass" style={{ ["--acc" as string]: accentOf(c.name) }} onClick={() => openCat(c)}>
                <span className="svc-cat-emoji">{c.emoji}</span>
                <span className="svc-cat-name">{c.name}</span>
                <span className="svc-cat-count">{c.count} ta</span>
              </button>
            ))}
          </div>

          {top && top.length > 0 && (
            <div className="svc-section">
              <div className="between"><b className="fs14">⭐ Eng yaxshilari</b></div>
              <div className="svc-list mt8">{top.map((l) => <SvcCard key={l.id} l={l} onOpen={(x) => { haptic(); setSelId(x.id); }} />)}</div>
            </div>
          )}

          <button className="svc-add-cta glass" onClick={() => { haptic(); setSubmitOpen(true); }}>
            <span className="svc-add-plus">➕</span>
            <span className="grow tal">
              <b>Xizmatimni qo'shish</b>
              <div className="muted fs12">Bepul e'lon — mijozlar sizni shu yerdan topadi</div>
            </span>
            <span className="svc-add-chev">›</span>
          </button>
        </>
      )}

      {selId !== null && <DetailSheet id={selId} onClose={() => setSelId(null)} onBanner={onBanner} />}
      {submitOpen && cats && <SubmitSheet cats={cats} onClose={() => { setSubmitOpen(false); load(); }} onBanner={onBanner} />}

      <Sheet open={mineOpen} onClose={() => setMineOpen(false)}>
        <h3>🏪 Mening xizmatlarim</h3>
        {mine === null ? (
          <><Skeleton h={54} className="mt8" /><Skeleton h={54} className="mt8" /></>
        ) : mine.length === 0 ? (
          <EmptyState icon="🏪" text="Hali xizmat qo'shmagansiz — biznesingizni bepul e'lon qiling!" action="➕ Qo'shish" onAction={() => { setMineOpen(false); setSubmitOpen(true); }} />
        ) : (
          mine.map((m) => (
            <div key={m.id} className="glass pad svc-mine-row">
              <div className="between">
                <b>{m.name}</b>
                <span className="muted fs12">{statusUz[m.status] ?? m.status}</span>
              </div>
              {m.status === "active" && (
                <div className="muted fs12 mt4">👁 {m.viewCount} ko'rildi · 📞 {m.callCount} qo'ng'iroq{m.reviewCount > 0 ? ` · ★ ${m.avgRating.toFixed(1)} (${m.reviewCount})` : ""}</div>
              )}
            </div>
          ))
        )}
      </Sheet>
      {void me}
    </div>
  );
}
