// 📋 E'LONLAR (feature "elonlar", E2) — «Mahalla e'lon taxtasi» (OLX-uslub, ELONLAR_PLAN.md).
// Chip-birinchi browse → 3-tap post wizard (kategoriya → foto/matn/narx → to'lov-tasdiq) → detal
// sheet (galereya + ishonch-badge + 📞/✍️) → "Mening e'lonlarim". Narx REAL SO'M, joylash TANGA bilan.
import { useEffect, useRef, useState } from "react";
import {
  CLASSIFIED_CATEGORIES,
  CLASSIFIED_MAX_PHOTOS,
  classifiedCategoryDef,
  formatNumber,
  type ClassifiedCard,
  type ClassifiedCategory,
  type ClassifiedDetail,
  type MeResponse,
  type MyClassifiedRow,
} from "@t1067/shared";
import { api, apiUrl } from "./api";
import { haptic, hapticSuccess, tg } from "./telegram";
import { compressImage } from "./util";
import { Button, EmptyState, Sheet, Skeleton } from "./design/components";

type PriceBand = "arzon" | "ortacha" | "qimmat";

let ADS_CACHE: ClassifiedCard[] | null = null;
/** Idle-warm the first page so opening the tab paints instantly (§6.1) — App.tsx calls this. */
export function prefetchElonlarAds(): void {
  api.elonAds({ limit: 20 }).then((r) => { ADS_CACHE = r.ads; }).catch(() => undefined);
}

function AdCard({ ad, onOpen }: { ad: ClassifiedCard; onOpen: () => void }) {
  const cat = classifiedCategoryDef(ad.category);
  const lostfound = ad.category === "yoqoldi";
  return (
    <button
      className={`elon-card ${ad.isTop ? "top" : ""} ${lostfound ? `lostfound ${ad.subtype}` : ""}`.trim()}
      style={{ ["--acc" as string]: cat?.accent ?? "" }}
      onClick={() => { haptic(); onOpen(); }}
    >
      {ad.isTop && <span className="elon-card-pin">📌</span>}
      {ad.isNew && !ad.isTop && <span className="elon-new-dot" />}
      {ad.hasPhoto ? (
        <img className="elon-card-photo" src={apiUrl(`/api/elonlar/photo/${ad.id}?s=1`)} alt="" loading="lazy" />
      ) : (
        <div className="elon-card-photo">{cat?.emoji ?? "📋"}</div>
      )}
      <div className="elon-card-body">
        {lostfound && <span className={`elon-card-ribbon ${ad.subtype}`}>{ad.subtype === "yoqoldi" ? "Yo'qoldi" : "Topildi"}</span>}
        <div className="elon-card-title">{ad.title}</div>
        {!lostfound && (
          ad.priceSom ? <div className="elon-card-price">{formatNumber(ad.priceSom)} so'm</div> : <div className="elon-card-price deal">Kelishiladi</div>
        )}
      </div>
    </button>
  );
}

// ── post wizard: 3 teginish (§4) ─────────────────────────────────────────────────────────────────
function PostWizard({ me, onDone, onClose }: { me: MeResponse; onDone: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<ClassifiedCategory | null>(null);
  const [subtype, setSubtype] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priceSom, setPriceSom] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ paidCoins: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cat = category ? classifiedCategoryDef(category) : null;

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = CLASSIFIED_MAX_PHOTOS - photos.length;
    const out: string[] = [];
    for (const f of [...files].slice(0, room)) {
      const d = await compressImage(f);
      if (d) out.push(d);
    }
    if (out.length) setPhotos((p) => [...p, ...out].slice(0, CLASSIFIED_MAX_PHOTOS));
  };

  const canNext1 = !!category && !!subtype;
  const canNext2 = title.trim().length >= 3;

  const submit = async () => {
    if (!category || !subtype) return;
    setBusy(true);
    setErr(null);
    try {
      const price = cat?.priced && priceSom.trim() ? Number(priceSom.replace(/\D/g, "")) : null;
      const r = await api.elonSubmit({ category, subtype, title: title.trim(), desc: desc.trim() || undefined, priceSom: price });
      if (!r.ok) {
        setErr(
          r.reason === "insufficient" ? "Tanga yetmayapti — safar qiling yoki do'st taklif qiling"
          : r.reason === "max_active" ? "Aktiv e'lonlaringiz limiti to'ldi — birini yoping va qayta urining"
          : r.reason === "no_phone" ? "Telefon raqam topilmadi"
          : "Xatolik — qayta urinib ko'ring",
        );
        setBusy(false);
        return;
      }
      // photo upload — best-effort, wizard already succeeded (ad exists, pending moderation)
      if (photos.length && r.id) {
        for (const p of photos) {
          const m = /^data:([^;]+);base64,(.+)$/.exec(p);
          if (m) await api.elonPhoto(r.id, m[2]!, m[1]!).catch(() => undefined);
        }
      }
      hapticSuccess();
      setDone({ paidCoins: r.paidCoins ?? 0 });
      onDone();
    } catch {
      setErr("Tarmoq xatoligi — qayta urinib ko'ring");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="view d-stamp" style={{ textAlign: "center", padding: "24px 12px" }}>
        <div style={{ fontSize: 44 }}>✅</div>
        <h3>Moderatsiyada ⏳</h3>
        <p className="muted">Tez orada chiqadi. Rad etilsa {done.paidCoins > 0 ? "tanga qaytadi." : "hech narsa yo'qotmaysiz."}</p>
        <Button onClick={onClose}>Yopish</Button>
      </div>
    );
  }

  return (
    <div className="view">
      {step === 0 && (
        <>
          <h3>Qanday e'lon?</h3>
          <div className="elon-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            {CLASSIFIED_CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={`elon-chip ${category === c.id ? "on" : ""}`}
                style={{ ["--acc" as string]: c.accent, justifyContent: "center" }}
                onClick={() => { haptic(); setCategory(c.id); setSubtype(null); }}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          {cat && (
            <div className="elon-seg" style={{ marginTop: 12 }}>
              {cat.subtypes.map((s, i) => (
                <button key={s} className={subtype === s ? "on" : ""} onClick={() => { haptic(); setSubtype(s); }}>
                  {cat.subtypeLabels[i]}
                </button>
              ))}
            </div>
          )}
          <Button className="elon-fab-inline" disabled={!canNext1} onClick={() => setStep(1)}>
            Davom etish →
          </Button>
        </>
      )}
      {step === 1 && cat && (
        <>
          <h3>{cat.emoji} {cat.subtypeLabels[cat.subtypes.indexOf(subtype!)]}</h3>
          <div className="elon-chips" style={{ overflowX: "visible", flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative", width: 64, height: 64 }}>
                <img src={p} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover" }} />
                <button
                  style={{ position: "absolute", top: -4, right: -4, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,.6)", color: "#fff", border: "none", fontSize: 11 }}
                  onClick={() => { haptic(); setPhotos((ph) => ph.filter((_, j) => j !== i)); }}
                >✕</button>
              </div>
            ))}
            {photos.length < CLASSIFIED_MAX_PHOTOS && (
              <button
                onClick={() => fileRef.current?.click()}
                style={{ width: 64, height: 64, borderRadius: 10, border: "1.5px dashed #b9a582", background: "#faf6ee", color: "#5f6f66", fontSize: 20 }}
              >＋</button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
          <input className="bk-input" placeholder="Sarlavha (masalan: Velosiped sotiladi)" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} style={{ marginTop: 10 }} />
          <textarea className="bk-input" placeholder="Tavsif (ixtiyoriy)" value={desc} maxLength={500} onChange={(e) => setDesc(e.target.value)} style={{ marginTop: 8, minHeight: 70 }} />
          {cat.priced && (
            <input
              className="bk-input" placeholder="Narx, so'm (bo'sh = Kelishiladi)" inputMode="numeric"
              value={priceSom} onChange={(e) => setPriceSom(e.target.value.replace(/\D/g, ""))} style={{ marginTop: 8 }}
            />
          )}
          <div className="elon-btnrow">
            <Button variant="ghost" onClick={() => setStep(0)}>← Orqaga</Button>
            <Button className="elon-fab-inline" disabled={!canNext2} onClick={() => setStep(2)}>Davom etish →</Button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h3>Tasdiqlash</h3>
          <p className="muted">{title}</p>
          {err && <div className="d-empty" style={{ color: "var(--danger)" }}>{err}</div>}
          <Button className="elon-fab-inline" disabled={busy} onClick={() => void submit()}>
            {busy ? "Yuborilmoqda…" : "E'lon joylash"}
          </Button>
          <div className="elon-btnrow">
            <Button variant="ghost" onClick={() => setStep(1)}>← Orqaga</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── detail sheet: galereya + ishonch-badge (§4.2) + 📞/✍️ ────────────────────────────────────────
function AdDetail({ id, onBanner }: { id: number; onBanner: (m: string) => void }) {
  const [d, setD] = useState<ClassifiedDetail | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [reported, setReported] = useState(false);
  useEffect(() => { api.elonAd(id).then(setD).catch(() => setD(null)); }, [id]);
  if (!d) return <div className="view"><Skeleton h={220} /><Skeleton h={20} w="60%" /><Skeleton h={60} /></div>;
  const cat = classifiedCategoryDef(d.category);
  const lostfound = d.category === "yoqoldi";

  const call = () => { void api.elonContact(id, "call").catch(() => undefined); window.location.href = `tel:${d.phone}`; };
  const write = () => {
    if (!d.owner.username) return;
    void api.elonContact(id, "message").catch(() => undefined);
    const t = tg as unknown as { openTelegramLink?: (u: string) => void } | undefined;
    const url = `https://t.me/${d.owner.username}`;
    if (t?.openTelegramLink) t.openTelegramLink(url); else window.open(url, "_blank");
  };

  return (
    <div className="view">
      {d.hasPhoto ? (
        <img className="elon-card-photo" style={{ borderRadius: 14, aspectRatio: "4/3" }} src={apiUrl(`/api/elonlar/photo/${id}/${photoIdx}`)} alt="" />
      ) : (
        <div className="elon-card-photo" style={{ borderRadius: 14, aspectRatio: "4/3", fontSize: 48 }}>{cat?.emoji ?? "📋"}</div>
      )}
      {d.photoCount > 1 && (
        <div className="elon-chips" style={{ marginTop: 6 }}>
          {Array.from({ length: d.photoCount }, (_, i) => (
            <button key={i} className={`elon-chip ${i === photoIdx ? "on" : ""}`} style={{ ["--acc" as string]: cat?.accent }} onClick={() => setPhotoIdx(i)}>{i + 1}</button>
          ))}
        </div>
      )}
      {lostfound && <span className={`elon-card-ribbon ${d.subtype}`} style={{ marginTop: 10 }}>{d.subtype === "yoqoldi" ? "Yo'qoldi" : "Topildi"}</span>}
      <h3 style={{ marginTop: 8 }}>{d.title}</h3>
      {!lostfound && (d.priceSom ? <div className="elon-card-price" style={{ ["--acc" as string]: cat?.accent, fontSize: 18 }}>{formatNumber(d.priceSom)} so'm</div> : <div className="elon-card-price deal">Kelishiladi</div>)}
      {d.desc && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{d.desc}</p>}

      {/* 🤝 ishonch-badge'lar (§4.2) — pul-mexanika YO'Q, hammasi mavjud ma'lumotdan */}
      <div className="elon-chips" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <span className="elon-chip">✅ {d.authorName}</span>
        {d.owner.rideCount > 0 && <span className="elon-chip">🚗 {d.owner.rideCount} safar</span>}
        {d.owner.soldCount > 0 && <span className="elon-chip">🤝 {d.owner.soldCount} savdo</span>}
        {d.owner.isNewMember && <span className="elon-chip">⚠️ Yangi a'zo</span>}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>👁 {d.viewCount} ko'rgan · 📞 {d.callCount} murojaat</p>

      <div className="elon-btnrow">
        <Button className="elon-fab-inline" onClick={call}>📞 Qo'ng'iroq</Button>
        {d.owner.username && <Button variant="ghost" onClick={write}>✍️ Yozish</Button>}
      </div>
      <button
        style={{ marginTop: 10, background: "none", border: "none", color: "#a5896f", fontSize: 11, alignSelf: "flex-start" }}
        disabled={reported}
        onClick={() => { setReported(true); void api.elonReport(id).then(() => onBanner("🚩 Shikoyat qabul qilindi")).catch(() => undefined); }}
      >
        {reported ? "🚩 Shikoyat yuborildi" : "🚩 Shikoyat qilish"}
      </button>
    </div>
  );
}

// ── "Mening e'lonlarim" ──────────────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<MyClassifiedRow["status"], string> = {
  pending: "⏳ Moderatsiyada", active: "🟢 Faol", sold: "🤝 Sotildi",
  rejected: "❌ Rad etildi", archived: "🗄 Arxivlangan", expired: "⌛ Muddati tugagan",
};

function MyAdsView({ onBanner, reload }: { onBanner: (m: string) => void; reload: () => void }) {
  const [rows, setRows] = useState<MyClassifiedRow[] | null>(null);
  const load = () => { api.elonMine().then((r) => setRows(r.ads)).catch(() => setRows([])); };
  useEffect(load, []);
  if (!rows) return <div className="view"><Skeleton h={70} /><Skeleton h={70} /></div>;
  if (!rows.length) return <div className="view"><EmptyState icon="📋" text="Hali e'loningiz yo'q" /></div>;

  const act = async (fn: () => Promise<{ ok: boolean }>, okMsg: string) => {
    haptic();
    const r = await fn();
    onBanner(r.ok ? okMsg : "Amal bajarilmadi");
    load();
    reload();
  };
  const buyTop = async (id: number) => {
    haptic();
    const r = await api.elonTop(id);
    onBanner(
      r.ok ? "📌 TOP boost yoqildi — 24 soat doska tepasida!"
      : r.reason === "insufficient" ? "Tanga yetmayapti — safar qiling yoki do'st taklif qiling"
      : "Amal bajarilmadi",
    );
    load();
    reload();
  };

  return (
    <div className="view" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((a) => (
        <div key={a.id} className="elon-card" style={{ padding: 12, clipPath: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <b>{a.isTop && "📌 "}{a.title}</b>
            <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>{STATUS_LABEL[a.status]}</span>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>👁 {a.viewCount} ko'rdi · 📞 {a.callCount} tel qildi{a.paidCoins > 0 ? ` · 🪙 ${a.paidCoins}` : ""}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {a.status === "active" && <Button sm onClick={() => void act(() => api.elonSold(a.id), "✅ Sotilgan deb belgilandi")}>✅ Sotildi</Button>}
            {a.status === "active" && !a.isTop && <Button sm variant="ghost" onClick={() => void buyTop(a.id)}>📌 TOP qilish</Button>}
            {a.status === "expired" && <Button sm onClick={() => void act(() => api.elonReactivate(a.id), "🔄 Qayta faollashtirildi")}>🔄 Qayta faollashtirish</Button>}
            {a.status !== "sold" && a.status !== "archived" && (
              <Button sm variant="ghost" onClick={() => void act(() => api.elonDelete(a.id), "🗄 Arxivlandi")}>O'chirish</Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── main browse view ────────────────────────────────────────────────────────────────────────────
export function ElonlarView({ me, onBanner, reload }: { me: MeResponse; onBanner: (m: string) => void; reload: () => void }) {
  const [mode, setMode] = useState<"browse" | "mine">("browse");
  const [category, setCategory] = useState<ClassifiedCategory | null>(null);
  const [subtype, setSubtype] = useState<string | null>(null);
  const [priceBand, setPriceBand] = useState<PriceBand | null>(null);
  const [q, setQ] = useState("");
  const [ads, setAds] = useState<ClassifiedCard[] | null>(ADS_CACHE);
  const [loading, setLoading] = useState(!ADS_CACHE);
  const [openId, setOpenId] = useState<number | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const cat = category ? classifiedCategoryDef(category) : null;

  const load = () => {
    api.elonAds({ category: category ?? undefined, subtype: subtype ?? undefined, priceBand: priceBand ?? undefined, q: q || undefined })
      .then((r) => { setAds(r.ads); ADS_CACHE = r.ads; })
      .catch(() => setAds([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setLoading(true); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [category, subtype, priceBand, q]);

  return (
    <div className="view elonlar-wrap">
      <div className="elon-seg" style={{ marginBottom: 10 }}>
        <button className={mode === "browse" ? "on" : ""} onClick={() => { haptic(); setMode("browse"); }}>📋 Doska</button>
        <button className={mode === "mine" ? "on" : ""} onClick={() => { haptic(); setMode("mine"); load(); }}>👤 Mening e'lonlarim</button>
      </div>

      {mode === "mine" ? (
        <MyAdsView onBanner={onBanner} reload={reload} />
      ) : (
        <>
          <div className="elon-chips">
            <button className={`elon-chip ${!category ? "on" : ""}`} onClick={() => { haptic(); setCategory(null); setSubtype(null); }}>Barchasi</button>
            {CLASSIFIED_CATEGORIES.map((c) => (
              <button key={c.id} className={`elon-chip ${category === c.id ? "on" : ""}`} style={{ ["--acc" as string]: c.accent }} onClick={() => { haptic(); setCategory(c.id); setSubtype(null); }}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          {cat && (
            <div className="elon-seg" style={{ marginTop: 8 }}>
              <button className={!subtype ? "on" : ""} onClick={() => { haptic(); setSubtype(null); }}>Hammasi</button>
              {cat.subtypes.map((s, i) => (
                <button key={s} className={subtype === s ? "on" : ""} onClick={() => { haptic(); setSubtype(s); }}>{cat.subtypeLabels[i]}</button>
              ))}
            </div>
          )}
          {(!cat || cat.priced) && (
            <div className="elon-chips" style={{ marginTop: 8 }}>
              <button className={`elon-chip ${!priceBand ? "on" : ""}`} onClick={() => { haptic(); setPriceBand(null); }}>Barcha narx</button>
              <button className={`elon-chip ${priceBand === "arzon" ? "on" : ""}`} onClick={() => { haptic(); setPriceBand("arzon"); }}>💰 Arzon</button>
              <button className={`elon-chip ${priceBand === "ortacha" ? "on" : ""}`} onClick={() => { haptic(); setPriceBand("ortacha"); }}>💰💰 O'rtacha</button>
              <button className={`elon-chip ${priceBand === "qimmat" ? "on" : ""}`} onClick={() => { haptic(); setPriceBand("qimmat"); }}>💰💰💰 Qimmat</button>
            </div>
          )}
          <input className="bk-input" placeholder="🔍 Qidirish" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 8, marginBottom: 10 }} />

          {loading ? (
            <div className="elon-grid"><Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} /></div>
          ) : !ads?.length ? (
            <EmptyState
              icon="📌" text={category ? `Bu yerda hali yo'q — boshqa kategoriyani ko'ring` : "Hali e'lon yo'q — birinchi bo'lib joylang!"}
              action={category ? "🚜 Transport'ni ko'rish" : undefined}
              onAction={category ? () => { haptic(); setCategory("transport"); setSubtype(null); } : undefined}
            />
          ) : (
            <div className="elon-grid">
              {ads.map((a) => <AdCard key={a.id} ad={a} onOpen={() => setOpenId(a.id)} />)}
            </div>
          )}

          <button className="elon-fab" onClick={() => { haptic(); setWizardOpen(true); }}>+ E'lon berish</button>
        </>
      )}

      <Sheet open={openId != null} onClose={() => setOpenId(null)}>
        {openId != null && <AdDetail id={openId} onBanner={onBanner} />}
      </Sheet>
      <Sheet open={wizardOpen} onClose={() => setWizardOpen(false)}>
        {wizardOpen && <PostWizard me={me} onDone={() => { load(); reload(); }} onClose={() => setWizardOpen(false)} />}
      </Sheet>
    </div>
  );
}
