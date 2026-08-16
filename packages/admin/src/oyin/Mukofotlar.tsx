// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🎁 MUKOFOTLAR — ma'lumot boshqaruvi va yuklashning yuragi
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Ega talabi: «ma'lumotlarni boshqarish va yuklashga osonlashtir». Eski panelda:
//   · rasm FAQAT tashqi URL bilan qo'yilardi (server har ko'rsatishda o'sha saytga borardi)
//   · ommaviy yuklash 100 ta mukofot = 100 ta so'rov, oldindan ko'rish YO'Q
//   · xato bo'lsa qo'lda qidirib tuzatilardi — qaytarish yo'q
//   · ikkita QARAMA-QARSHI narx formulasi bir qatorga ikki xil «to'g'ri narx» berardi
import { useMemo, useState } from "react";
import type { OyinAdminPrizeRow, OyinBulkPrizeInput, OyinPrizeVelocity } from "@t1067/shared";
import { OYIN_BULK_MAX, OYIN_PRIZE_MULTIPLIER, OYIN_SOM_PER_BALL, oyinCardPlan, oyinSuggestTier } from "@t1067/shared";
import { adminApi } from "../api";
import { csvName, downloadCsv } from "../lib/csv";
import { ago, num, short } from "../lib/fmt";
import { Badge, Btn, Card, Chip, Drawer, Drop, ErrBox, Mini, Modal, Note, Skeleton, Stat, Table, useLoad, useToast, type Col } from "./ui";

type Sub = "katalog" | "tezlik" | "byudjet" | "tarix";
type Stage = "all" | "open" | "queued" | "filled" | "hidden";

const STAGE_LABEL: Record<string, [string, "ok" | "info" | "warn" | "mute"]> = {
  open: ["🟢 Ochiq", "ok"], queued: ["📋 Navbatda", "info"], filled: ["📦 To'lgan", "warn"], hidden: ["🙈 Yashirilgan", "mute"],
};

/** «900 000 so'm» → 900000. Faqat raqamlar olinadi (matn erkin yoziladi). */
function parseSum(label: string): number | null {
  const digits = label.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const stageOf = (p: OyinAdminPrizeRow): Stage => (!p.active ? "hidden" : p.queued === true ? "queued" : p.limit > 0 && p.sold >= p.limit ? "filled" : "open");

// 🛡 B3 (2026-08-16 audit): `oyinCardPlan`/`oyinSuggestTier` jonli `oyinRideBall`/
// `oyinPrizeMultiplier` knoblarini o'qimasdan qattiq kodlangan standartga (35, 3×) tushib
// qolgan edi — Sozlama.tsx "Ball jadvali"da bu ikkalasini o'zgartirsangiz ham narx-tavsiya
// SEZMASDI (v1 panel to'g'ri o'qirdi, v2 qayta qurishda tushib qolgan). Bitta joydan olinadi.
function econRates(values: Record<string, number> | undefined): { rideBall: number; multiplier: number } {
  return {
    rideBall: Number(values?.oyinRideBall ?? 35) || 35,
    multiplier: Number(values?.oyinPrizeMultiplier ?? OYIN_PRIZE_MULTIPLIER) || OYIN_PRIZE_MULTIPLIER,
  };
}

export function Mukofotlar({ onChanged }: { onChanged: () => void }) {
  const [sub, setSub] = useState<Sub>("katalog");
  const cat = useLoad(() => adminApi.oyinCatalog().then((r) => r.prizes), []);
  const reload = (): void => { cat.reload(); onChanged(); };

  return (
    <>
      <div className="oy-chips">
        <Chip on={sub === "katalog"} onClick={() => setSub("katalog")}>🎁 Katalog</Chip>
        <Chip on={sub === "tezlik"} onClick={() => setSub("tezlik")}>📈 Tezlik</Chip>
        <Chip on={sub === "byudjet"} onClick={() => setSub("byudjet")}>💰 Byudjet</Chip>
        <Chip on={sub === "tarix"} onClick={() => setSub("tarix")}>↩ Tarix</Chip>
      </div>
      {cat.err && <ErrBox err={cat.err} onRetry={cat.reload} />}
      {!cat.data && !cat.err && <Card title="🎁 Katalog"><Skeleton rows={8} /></Card>}
      {cat.data && sub === "katalog" && <Katalog prizes={cat.data} reload={reload} />}
      {cat.data && sub === "tezlik" && <Tezlik prizes={cat.data} />}
      {cat.data && sub === "byudjet" && <Byudjet prizes={cat.data} />}
      {sub === "tarix" && <Tarix reload={reload} />}
    </>
  );
}

/* ── 🎁 KATALOG ────────────────────────────────────────────────────────────────────────────── */
function Katalog({ prizes, reload }: { prizes: OyinAdminPrizeRow[]; reload: () => void }) {
  const toast = useToast();
  const econ = useLoad(() => adminApi.bonusEconomy(), []); // B3 — jonli rideBall/multiplier
  const [stage, setStage] = useState<Stage>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoJob, setPhotoJob] = useState<{ done: number; total: number } | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return prizes.filter((p) => (stage === "all" || stageOf(p) === stage) && (!s || p.name.toLowerCase().includes(s)));
  }, [prizes, stage, q]);

  const bulkAct = async (label: string, patch: (p: OyinAdminPrizeRow) => Partial<OyinBulkPrizeInput>): Promise<void> => {
    const picked = prizes.filter((p) => sel.has(p.key));
    if (picked.length === 0) return;
    if (!window.confirm(`${picked.length} ta mukofot: ${label}\n\nDavom etasizmi?`)) return;
    setBusy(true);
    try {
      const r = await adminApi.oyinBulkPrizes(picked.map((p) => ({
        key: p.key, icon: p.icon, name: p.name, valueLabel: p.valueLabel,
        price: p.price, limit: p.limit, photoUrl: p.photoUrl, ...patch(p),
      })));
      toast(r.ok ? `✓ ${r.updated} ta mukofot: ${label}` : `⛔ ${r.rejected[0]?.reason ?? "bajarilmadi"}`, r.ok ? "ok" : "bad");
      setSel(new Set());
      reload();
    } finally { setBusy(false); }
  };

  /** 📤 Nom bo'yicha biriktirish. Solishtirish «normallashtirilgan» nom bo'yicha:
   *  kichik harf, kengaytmasiz, faqat harf/raqam. «iPhone 12.jpg» → «iphone12». */
  const norm = (x: string): string => x.replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9Ѐ-ӿ]/gi, "");
  const bulkPhotos = async (files: File[]): Promise<void> => {
    const matched: { file: File; prize: OyinAdminPrizeRow }[] = [];
    const missed: string[] = [];
    for (const f of files) {
      const n = norm(f.name);
      const hit = prizes.find((p) => norm(p.name) === n) ?? prizes.find((p) => n.length >= 4 && norm(p.name).includes(n));
      if (hit) matched.push({ file: f, prize: hit });
      else missed.push(f.name);
    }
    if (matched.length === 0) {
      toast(`⛔ Birorta fayl mukofotga mos kelmadi. Fayl nomi mukofot nomi bilan bir xil bo'lsin.`, "bad");
      return;
    }
    // Tasdiq matni: HAR bir moslik ochiq ko'rsatiladi va mos kelmaganlari SANALADI —
    // jimgina o'tkazib yuborish «hammasi yuklandi» degan yolg'on taassurot berardi.
    const preview = matched.slice(0, 8).map((m) => `${m.file.name} → ${m.prize.name}`).join("\n");
    const more = matched.length > 8 ? `\n…yana ${matched.length - 8} ta` : "";
    const skipped = missed.length > 0
      ? `\n\n⚠️ Mos kelmagan ${missed.length} ta fayl O'TKAZIB YUBORILADI:\n${missed.slice(0, 5).join(", ")}`
      : "";
    if (!window.confirm(`${matched.length} ta rasm biriktiriladi:\n\n${preview}${more}${skipped}\n\nDavom etasizmi?`)) return;
    setPhotoJob({ done: 0, total: matched.length });
    let ok = 0;
    let fail = 0;
    for (const [i, m] of matched.entries()) {
      try {
        const r = await adminApi.oyinPrizePhoto(m.prize.key, await fileToBase64(m.file), m.file.type || "image/jpeg");
        if (r.ok) ok += 1; else fail += 1;
      } catch { fail += 1; }
      setPhotoJob({ done: i + 1, total: matched.length });
    }
    setPhotoJob(null);
    toast(`📤 ${ok} ta rasm biriktirildi${fail > 0 ? ` · ⛔ ${fail} tasi yuklanmadi` : ""}${missed.length > 0 ? ` · ${missed.length} ta fayl mos kelmadi` : ""}`, fail > 0 ? "warn" : "ok");
    reload();
  };

  const cols: Col<OyinAdminPrizeRow>[] = [
    {
      key: "sel", label: "",
      render: (p) => (
        <input
          type="checkbox" checked={sel.has(p.key)} aria-label={`${p.name} tanlash`}
          onClick={(e) => e.stopPropagation()}
          onChange={() => setSel((s) => { const n = new Set(s); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })}
        />
      ),
    },
    {
      key: "name", label: "Mukofot", sort: (p) => p.name,
      render: (p) => (
        <div className="oy-row">
          <span className="oy-thumb">{p.photoFileId || p.photoUrl ? <img src={`/api/oyin/prizephoto?key=${encodeURIComponent(p.key)}`} alt="" /> : (p.icon || "🎁")}</span>
          <span>
            <span className="oy-main">{p.name}</span>
            <div className="oy-sub">
              {p.photoFileId ? "📤 yuklangan rasm" : p.photoUrl ? "🔗 tashqi havola" : <span className="oy-err">rasm yo'q</span>} · {p.limit} o'rin
            </div>
          </span>
        </div>
      ),
    },
    { key: "som", label: "Real narx", align: "r", sort: (p) => parseSum(p.valueLabel) ?? 0, render: (p) => (parseSum(p.valueLabel) != null ? `${num(parseSum(p.valueLabel)!)} so'm` : <span className="oy-err">yozilmagan</span>) },
    { key: "price", label: "Ball", align: "r", sort: (p) => p.price, render: (p) => <span className="oy-coin">{num(p.price)}</span> },
    {
      key: "sold", label: "Sotilgan", sort: (p) => (p.limit > 0 ? p.sold / p.limit : 0),
      render: (p) => {
        const pct = p.limit > 0 ? Math.round((p.sold / p.limit) * 100) : 0;
        return <><Mini pct={pct} tone={pct >= 100 ? "warn" : "ok"} /> <span className="oy-num">{p.sold}/{p.limit}</span></>;
      },
    },
    {
      key: "cover", label: "Qoplash", align: "r",
      sort: (p) => { const s = parseSum(p.valueLabel); return s ? (p.limit * p.price * OYIN_SOM_PER_BALL) / s : 0; },
      render: (p) => {
        const s = parseSum(p.valueLabel);
        if (!s) return <span className="oy-dim3">—</span>;
        const c = (p.limit * p.price * OYIN_SOM_PER_BALL) / s;
        return <span className={c >= 3 ? "oy-add" : "oy-err"}>{c.toFixed(1)}×</span>;
      },
    },
    {
      key: "guard", label: "Qo'riq",
      render: (p) => (p.queued === true ? <span className="oy-dim3">—</span> : p.minSell <= 0 ? <span className="oy-dim3">o'chiq</span> : p.willDraw ? <Badge tone="ok">tirajda</Badge> : <Badge tone="bad">{p.sold}/{p.minSell}</Badge>),
    },
    { key: "stage", label: "Holat", render: (p) => { const [l, t] = STAGE_LABEL[stageOf(p)]!; return <Badge tone={t}>{l}</Badge>; } },
  ];

  const counts = (s: Stage): number => (s === "all" ? prizes.length : prizes.filter((p) => stageOf(p) === s).length);

  return (
    <>
      <Card
        title="🎁 Mukofot katalogi"
        sub={sel.size > 0 ? `${sel.size} ta belgilandi` : `${num(rows.length)} qator · qatorni belgilab ommaviy amal qiling`}
        head={
          <div className="oy-spacer oy-row">
            <input className="oy-inp oy-srch" placeholder="🔍 Mukofot nomi…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Btn variant="pri" onClick={() => setAddOpen(true)}>➕ Qo'shish</Btn>
            <Btn onClick={() => setImportOpen(true)}>📥 Excel'dan yuklash</Btn>
            <Btn sm onClick={() => downloadCsv(csvName("oyin-mukofotlar"), ["Nomi", "Real narx", "Ball", "O'rin", "Sotilgan", "Holat"], rows.map((p) => [p.name, p.valueLabel, p.price, p.limit, p.sold, stageOf(p)]))}>⬇ CSV</Btn>
          </div>
        }
        flush
      >
        <div className="oy-card-b-tight">
          <div className="oy-chips">
            {(["all", "open", "queued", "filled", "hidden"] as Stage[]).map((s) => (
              <Chip key={s} on={stage === s} onClick={() => setStage(s)}>
                {s === "all" ? "Hammasi" : STAGE_LABEL[s]![0]} <b>{counts(s)}</b>
              </Chip>
            ))}
          </div>
        </div>

        {sel.size > 0 && (
          <div className="oy-card-b-tight">
            <div className="oy-row">
              <Btn sm disabled={busy} onClick={() => void bulkAct("navbatga surildi", () => ({ queued: true }))}>📋 Navbatga sur</Btn>
              <Btn sm disabled={busy} onClick={() => void bulkAct("vitrinaga chiqarildi", () => ({ queued: false }))}>🟢 Vitrinaga chiqar</Btn>
              <Btn sm disabled={busy} onClick={() => void bulkAct("narxi qayta hisoblandi", (p) => {
                const s = parseSum(p.valueLabel);
                if (!s) return {};
                const { rideBall, multiplier } = econRates(econ.data?.values);
                const plan = oyinCardPlan(s, oyinSuggestTier(s, rideBall, multiplier), rideBall, multiplier);
                return { price: plan.ballPrice, limit: Math.max(plan.slots, p.sold) };
              })}>🧮 Narxni qayta hisobla</Btn>
              <span className="oy-spacer"><Btn sm variant="ghost" onClick={() => setSel(new Set())}>Bekor</Btn></span>
            </div>
          </div>
        )}

        <Table rows={rows} cols={cols} rowKey={(p) => p.key} onRow={(p) => setOpenKey(p.key)} selected={(p) => sel.has(p.key)} empty="Bu kesim bo'yicha mukofot yo'q." />
      </Card>

      <Note>
        Mukofot FAQAT hamma karta sotilganda o'ynaladi — to'lmagan mukofot sizga <b>bir so'm ham
        turmaydi</b>. Shuning uchun yuklab qo'yavering: navbat bepul, sig'im kamayganda tizim
        o'zi ochadi.
      </Note>

      <Card title="📤 Ommaviy rasm biriktirish" sub={`${prizes.filter((p) => !p.photoFileId && !p.photoUrl).length} ta mukofotda rasm yo'q`}>
        <Drop
          title="Rasmlarni shu yerga tashlang" accept="image/*" multiple
          hint={<>Fayl NOMI bo'yicha mukofotga o'zi biriktiriladi · masalan <span className="oy-mono">iPhone 12.jpg</span></>}
          onFiles={(files) => void bulkPhotos(files)}
        />
        {photoJob && <div className="oy-dim3">⏳ {photoJob.done} / {photoJob.total} yuklandi…</div>}
        <Note>
          Rasm <b>Telegram'da</b> saqlanadi, ya'ni bizniki — tashqi sayt o'chsa ham vitrina
          bo'shab qolmaydi. Fayllar <b>bittalab, navbat bilan</b> yuboriladi (50 tasini bitta
          so'rovga solish javob hajmini portlatardi), shuning uchun jarayon ko'rinib turadi.
        </Note>
      </Card>

      {openKey && <PrizeDrawer prize={prizes.find((p) => p.key === openKey)!} onClose={() => setOpenKey(null)} reload={reload} />}
      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} prizes={prizes} reload={reload} />
      <AddPrize open={addOpen} onClose={() => setAddOpen(false)} reload={reload} />
    </>
  );
}

/* ── MUKOFOT DRAWER ────────────────────────────────────────────────────────────────────────── */
function PrizeDrawer({ prize, onClose, reload }: { prize: OyinAdminPrizeRow; onClose: () => void; reload: () => void }) {
  const toast = useToast();
  const econ = useLoad(() => adminApi.bonusEconomy(), []); // B3 — jonli rideBall/multiplier
  const [d, setD] = useState({ icon: prize.icon, name: prize.name, valueLabel: prize.valueLabel, price: String(prize.price), limit: String(prize.limit), photoUrl: prize.photoUrl ?? "" });
  const [busy, setBusy] = useState(false);

  const som = parseSum(d.valueLabel);
  const price = Number(d.price) || 0;
  const limit = Number(d.limit) || 0;
  const cover = som ? (limit * price * OYIN_SOM_PER_BALL) / som : null;

  const save = async (): Promise<void> => {
    if (limit < prize.sold) {
      if (!window.confirm(`⛔ «${prize.name}» da ALLAQACHON ${prize.sold} ta karta sotilgan,\nsiz esa o'rinni ${limit} ta qilmoqchisiz.\n\nServer o'rinni ${prize.sold} ga ko'taradi (karta olganlarning imkoniyati jimgina o'zgarmasin).\n\nDavom etasizmi?`)) return;
    } else if (prize.sold > 0 && (price !== prize.price || limit !== prize.limit)) {
      const parts: string[] = [];
      if (price !== prize.price) parts.push(`narx: ${prize.price} → ${price} ball`);
      if (limit !== prize.limit) parts.push(`o'rin: ${prize.limit} → ${limit} ta`);
      if (!window.confirm(`⚠️ «${prize.name}» ga ALLAQACHON ${prize.sold} ta karta sotilgan.\n\n${parts.join(" · ")}\n\nKarta olganlar boshqa narx/imkoniyat bilan to'lagan edi — ularning yutish imkoniyati o'zgaradi va bu haqda xabar bormaydi.\n\nDavom etasizmi?`)) return;
    }
    setBusy(true);
    try {
      await adminApi.upsertOyinPrize({ key: prize.key, icon: d.icon, name: d.name, valueLabel: d.valueLabel, price, limit, photoUrl: d.photoUrl || null });
      toast("✓ Saqlandi · audit jurnaliga yozildi", "ok");
      reload();
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : "Saqlanmadi", "bad"); }
    finally { setBusy(false); }
  };

  const uploadPhoto = async (files: File[]): Promise<void> => {
    const f = files[0];
    if (!f) return;
    setBusy(true);
    try {
      const base64 = await fileToBase64(f);
      const r = await adminApi.oyinPrizePhoto(prize.key, base64, f.type || "image/jpeg");
      if (r.ok) { toast("📤 Rasm yuklandi — endi Telegram'da saqlanadi", "ok"); reload(); }
      else toast(r.reason === "telegram_off_and_too_big" ? "⛔ Rasm juda katta va Telegram javob bermadi — kichikroq rasm tanlang" : `⛔ ${r.reason ?? "yuklanmadi"}`, "bad");
    } catch (e) { toast(e instanceof Error ? e.message : "Yuklanmadi", "bad"); }
    finally { setBusy(false); }
  };

  const applyPlan = (months: number): void => {
    if (!som) { toast("Avval real narxni yozing", "warn"); return; }
    // Bitta manba: `oyinCardPlan` — «🧮 Narxlash» dagi ikkinchi formula OLIB TASHLANDI.
    const tier = months <= 3 ? "kichik" : months <= 6 ? "orta" : months <= 10 ? "katta" : "bosh";
    const { rideBall, multiplier } = econRates(econ.data?.values);
    const plan = oyinCardPlan(som, tier, rideBall, multiplier);
    setD((x) => ({ ...x, price: String(plan.ballPrice), limit: String(Math.max(plan.slots, prize.sold)) }));
    toast(`📐 ${plan.ballPrice} ball × ${plan.slots} o'rin qo'yildi (${tier})`, "ok");
  };

  return (
    <Drawer
      open onClose={onClose}
      head={
        <>
          <span className="oy-thumb">{prize.photoFileId || prize.photoUrl ? <img src={`/api/oyin/prizephoto?key=${encodeURIComponent(prize.key)}`} alt="" /> : (prize.icon || "🎁")}</span>
          <div>
            <div className="oy-card-t">{prize.name}</div>
            <div className="oy-dim">{prize.valueLabel || "narx yozilmagan"} · sotilgan {prize.sold}/{prize.limit}</div>
          </div>
          <div className="oy-spacer"><Btn sm variant="ghost" onClick={onClose}>✕</Btn></div>
        </>
      }
      foot={
        <>
          <Btn variant="pri" disabled={busy} onClick={() => void save()}>Saqlash</Btn>
          <Btn disabled={busy} onClick={() => {
            void adminApi.setOyinPrizeActive(prize.key, !prize.active).then(() => { toast(prize.active ? "Yashirildi" : "Qaytarildi", "ok"); reload(); onClose(); });
          }}>{prize.active ? "🙈 Yashirish" : "👁 Qaytarish"}</Btn>
          {prize.sold > 0 && (
            <Btn variant="dgr" disabled={busy} onClick={() => {
              if (!window.confirm(`«${prize.name}» ning HAMMA kartasi bekor qilinsinmi?\n\n${prize.sold} ta karta o'chadi, sarflangan ball egalariga QAYTADI.\nUlar buni ilovada ko'radi (balans o'sadi), lekin alohida xabar bormaydi.\n\nBu amal qaytarilmaydi.`)) return;
              void adminApi.oyinCancelPrizeTickets(prize.key).then((r) => {
                toast(r.ok ? `✓ ${r.cancelled} ta karta bekor qilindi (${r.members} a'zoga ball qaytdi)` : "Bajarilmadi", r.ok ? "ok" : "bad");
                reload(); onClose();
              });
            }}>♻️ Kartalarni bekor qilish ({prize.sold})</Btn>
          )}
          {prize.sold === 0 && (
            <Btn variant="dgr" disabled={busy} onClick={() => {
              if (!window.confirm(`«${prize.name}» butunlay o'chirilsinmi?`)) return;
              void adminApi.deleteOyinPrize(prize.key).then((r) => {
                toast(r.ok ? "O'chirildi" : "Karta sotilgan — o'chirib bo'lmaydi, «Yashirish»ni ishlating", r.ok ? "ok" : "bad");
                reload(); onClose();
              });
            }}>🗑 O'chirish</Btn>
          )}
        </>
      }
    >
      <Drop
        title={prize.photoFileId ? "Rasmni almashtirish" : "Rasm yuklash"}
        hint={<>Tashlang yoki bosing · JPG/PNG · Telegram'da saqlanadi, tashqi saytga bog'liq emas</>}
        accept="image/*" onFiles={(f) => void uploadPhoto(f)}
      />

      <div>
        <div className="oy-sec">Asosiy</div>
        <div className="oy-col">
          <div className="oy-row"><span className="oy-dim">Emoji</span><input className="oy-inp" maxLength={8} value={d.icon} onChange={(e) => setD({ ...d, icon: e.target.value })} /></div>
          <div className="oy-row"><span className="oy-dim">Nomi</span><input className="oy-inp" maxLength={60} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          <div className="oy-row"><span className="oy-dim">Real narxi</span><input className="oy-inp" placeholder="900 000 so'm" value={d.valueLabel} onChange={(e) => setD({ ...d, valueLabel: e.target.value })} /></div>
          <div className="oy-row"><span className="oy-dim">Karta bahosi</span><input className="oy-inp oy-srch" type="number" min={1} value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} /><span className="oy-dim3">ball</span></div>
          <div className="oy-row"><span className="oy-dim">O'rinlar</span><input className="oy-inp oy-srch" type="number" min={1} value={d.limit} onChange={(e) => setD({ ...d, limit: e.target.value })} /><span className="oy-dim3">sotilgan: {prize.sold}</span></div>
          <div className="oy-row"><span className="oy-dim">Tashqi rasm</span><input className="oy-inp" placeholder="ixtiyoriy — yuklangan rasm ustun" value={d.photoUrl} onChange={(e) => setD({ ...d, photoUrl: e.target.value })} /></div>
        </div>
      </div>

      <div>
        <div className="oy-sec">Narx maslahatchisi — BITTA manba</div>
        {som == null ? (
          <Note tone="warn">Real narxni (so'm) yozing — qoplash hisobi shundan chiqadi.</Note>
        ) : (
          <Note tone={cover != null && cover >= 3 ? "ok" : "bad"}>
            To'lganda kassaga <b>{num(Math.round(limit * price * OYIN_SOM_PER_BALL))} so'm</b>,
            siz to'laysiz <b>{num(som)} so'm</b> → <b>{cover?.toFixed(1)}× qoplash</b>
            {cover != null && cover < 3 && <> — kerak 3.0×</>}.
            <br />Bitta karta ≈ <b>{Math.round(price / 35)} safarlik mehnat</b> · imkoniyat <b>1/{Math.max(1, limit)}</b>.
          </Note>
        )}
        <div className="oy-row">
          <Btn sm onClick={() => applyPlan(3)}>📐 3 oyda yetsin</Btn>
          <Btn sm onClick={() => applyPlan(6)}>📐 6 oyda</Btn>
          <Btn sm onClick={() => applyPlan(10)}>📐 10 oyda</Btn>
        </div>
        <div className="oy-dim3">
          Eski panelda bu hisob IKKI xil formuladan chiqardi va bitta qator uchun ikki xil
          «to'g'ri narx» berardi. Endi bitta: <span className="oy-mono">oyinCardPlan</span>.
        </div>
      </div>
    </Drawer>
  );
}

/* ── 📥 IMPORT SEHRGARI ────────────────────────────────────────────────────────────────────── */
interface ParsedRow { name: string; som: number | null; icon: string; photoUrl: string | null; raw: string }
interface PlanRow { kind: "add" | "chg" | "err"; name: string; reason?: string; som?: number; price?: number; limit?: number; oldPrice?: number; oldLimit?: number; key?: string; icon: string; photoUrl: string | null }

function ImportWizard({ open, onClose, prizes, reload }: { open: boolean; onClose: () => void; prizes: OyinAdminPrizeRow[]; reload: () => void }) {
  const toast = useToast();
  const econ = useLoad(() => adminApi.bonusEconomy(), []); // B3 — jonli rideBall/multiplier
  const [step, setStep] = useState(1);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; updated: number; rejected: number } | null>(null);

  const parsed: ParsedRow[] = useMemo(() => text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    // Excel'dan nusxa TAB bilan keladi, qo'lda yozilsa `|` bilan — ikkalasi ham qabul qilinadi.
    const parts = line.split(/\t|\|/).map((x) => x.trim());
    return { name: (parts[0] ?? "").slice(0, 60), som: parseSum(parts[1] ?? ""), icon: parts[2] || "🎁", photoUrl: parts[3] || null, raw: line };
  }), [text]);

  const plan: PlanRow[] = useMemo(() => {
    const { rideBall, multiplier } = econRates(econ.data?.values);
    return parsed.map((r) => {
    if (!r.name) return { kind: "err", name: r.raw.slice(0, 40), reason: "nom bo'sh", icon: r.icon, photoUrl: r.photoUrl };
    if (r.som == null) return { kind: "err", name: r.name, reason: "narx o'qilmadi", icon: r.icon, photoUrl: r.photoUrl };
    const p = oyinCardPlan(r.som, oyinSuggestTier(r.som, rideBall, multiplier), rideBall, multiplier);
    const existing = prizes.find((x) => x.name.toLowerCase() === r.name.toLowerCase());
    if (existing) {
      return { kind: "chg", name: r.name, som: r.som, price: p.ballPrice, limit: Math.max(p.slots, existing.sold), oldPrice: existing.price, oldLimit: existing.limit, key: existing.key, icon: r.icon, photoUrl: r.photoUrl };
    }
    return { kind: "add", name: r.name, som: r.som, price: p.ballPrice, limit: p.slots, icon: r.icon, photoUrl: r.photoUrl };
    });
  }, [parsed, prizes, econ.data]);

  const ok = plan.filter((p) => p.kind !== "err");
  const errs = plan.filter((p) => p.kind === "err");

  const apply = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await adminApi.oyinBulkPrizes(ok.map((p) => ({
        ...(p.key ? { key: p.key } : {}),
        icon: p.icon, name: p.name, valueLabel: `${num(p.som ?? 0)} so'm`,
        price: p.price ?? 0, limit: p.limit ?? 0, photoUrl: p.photoUrl,
        // Import HAR DOIM navbatga — 100 ta mukofot birdan vitrinaga chiqsa ball tarqalib
        // ketadi va hech biri to'lmaydi.
        queued: true,
      })));
      setDone({ added: r.added, updated: r.updated, rejected: r.rejected.length });
      setStep(4);
      reload();
      if (r.rejected.length > 0) toast(`⚠️ ${r.rejected.length} ta qator server tomonidan qabul qilinmadi`, "warn");
    } catch (e) { toast(e instanceof Error ? e.message : "Yuklanmadi", "bad"); }
    finally { setBusy(false); }
  };

  const close = (): void => { setStep(1); setText(""); setDone(null); onClose(); };
  const STEPS = ["Ma'lumot", "Ko'rib chiqish", "Qo'llash"];
  const stepIdx = step >= 4 ? 3 : step === 3 ? 2 : step;

  return (
    <Modal open={open} onClose={close}>
      <div className="oy-card-h">
        <span className="oy-card-t">📥 Excel'dan mukofot yuklash</span>
        <span className="oy-card-sub">{OYIN_BULK_MAX} tagacha · BITTA atomik yozuv · qaytarish mumkin</span>
        <span className="oy-spacer"><Btn sm variant="ghost" onClick={close}>✕</Btn></span>
      </div>
      <div className="oy-step">
        {STEPS.map((s, i) => (
          <span key={s} className={`oy-step-i ${stepIdx === i + 1 ? "oy-step-on" : stepIdx > i + 1 ? "oy-step-done" : ""}`}>
            <b>{stepIdx > i + 1 ? "✓" : i + 1}</b>{s}
          </span>
        ))}
      </div>

      {step === 1 && (
        <>
          <div className="oy-card-b oy-col">
            <Drop
              title="CSV faylni tashlang" accept=".csv,text/csv,text/plain"
              hint={<>yoki Excel'dan nusxalab pastga qo'ying</>}
              onFiles={(files) => { const f = files[0]; if (f) void f.text().then(setText); }}
            />
            <textarea
              className="oy-inp oy-ta" rows={8} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={"Velosiped Desna\t1 250 000\t🚲\nQuloqchin JBL\t560 000\t🎧\nChoy serviz | 145 000"}
            />
            <div className="oy-dim3">
              Ustunlar: <b>nom · narx · emoji (ixtiyoriy) · rasm havolasi (ixtiyoriy)</b>.
              Excel'dan nusxa TAB bilan keladi, qo'lda yozsangiz <span className="oy-mono">|</span> bilan ajrating.
              Karta bahosi va o'rinlar soni <b>o'zi hisoblanadi</b>.
            </div>
            {parsed.length > 0 && <div className="oy-dim3">{parsed.length} ta satr o'qildi.</div>}
          </div>
          <div className="oy-drw-f">
            <span className="oy-spacer"><Btn variant="pri" disabled={parsed.length === 0} onClick={() => setStep(3)}>Ko'rib chiqish →</Btn></span>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="oy-card-b oy-col">
            <div className="oy-row">
              <Badge tone="ok">{plan.filter((p) => p.kind === "add").length} ta yangi</Badge>
              <Badge tone="warn">{plan.filter((p) => p.kind === "chg").length} tasi o'zgaradi</Badge>
              {errs.length > 0 && <Badge tone="bad">{errs.length} ta xato</Badge>}
              <span className="oy-spacer oy-dim3">Bosishdan OLDIN aynan nima bo'lishini ko'rasiz</span>
            </div>
            <Table
              rows={plan} rowKey={(p, ) => `${p.kind}-${p.name}`}
              cols={[
                { key: "kind", label: "", render: (p) => (p.kind === "add" ? <Badge tone="ok">yangi</Badge> : p.kind === "chg" ? <Badge tone="warn">o'zgaradi</Badge> : <Badge tone="bad">xato</Badge>) },
                { key: "name", label: "Mukofot", render: (p) => <span className={p.kind === "err" ? "oy-err" : undefined}>{p.icon} {p.name}</span> },
                { key: "som", label: "Real narx", align: "r", render: (p) => (p.kind === "err" ? <span className="oy-err">{p.reason}</span> : `${num(p.som ?? 0)} so'm`) },
                {
                  key: "plan", label: "Karta rejasi",
                  render: (p) => (p.kind === "err" ? <span className="oy-dim3">—</span> : p.kind === "chg"
                    ? <><span className="oy-old">{num(p.oldPrice ?? 0)} × {p.oldLimit}</span> <span className="oy-chg">→ {num(p.price ?? 0)} ball × {p.limit} o'rin</span></>
                    : <>{num(p.price ?? 0)} ball × {p.limit} o'rin</>),
                },
              ]}
            />
            {errs.length > 0 && (
              <Note tone="bad">
                <b>{errs.length} ta satr o'tkazib yuboriladi</b> — jimgina yo'qolmaydi, yuqorida sababi bilan sanalgan.
              </Note>
            )}
            <Note>Hammasi <b>navbatga</b> tushadi — mijoz darhol ko'rmaydi. Sig'im kamayganda tizim o'zi ochadi.</Note>
          </div>
          <div className="oy-drw-f">
            <Btn onClick={() => setStep(1)}>← Orqaga</Btn>
            <span className="oy-spacer">
              <Btn variant="pri" disabled={busy || ok.length === 0} onClick={() => void apply()}>
                {busy ? "⏳ Yozilmoqda…" : `${ok.length} ta o'zgarishni qo'llash`}
              </Btn>
            </span>
          </div>
        </>
      )}

      {step === 4 && done && (
        <>
          <div className="oy-card-b oy-col">
            <Stat k="Natija" v={`${done.added} qo'shildi · ${done.updated} yangilandi`} s={done.rejected > 0 ? `${done.rejected} ta qator qabul qilinmadi` : "hammasi qabul qilindi"} tone="ok" />
            <Note tone="ok">
              Bitta so'rovda, bitta yozuvda bajarildi. Hammasi <b>navbatda</b> — mijoz hali ko'rmaydi.
              Xato qilgan bo'lsangiz «↩ Tarix» bo'limidan bitta bosishda qaytaring.
            </Note>
          </div>
          <div className="oy-drw-f"><span className="oy-spacer"><Btn variant="pri" onClick={close}>Yopish</Btn></span></div>
        </>
      )}
    </Modal>
  );
}

async function fileToBase64(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000; // katta faylda `apply` stek to'lib ketmasin
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/* ── 📈 TEZLIK ─────────────────────────────────────────────────────────────────────────────── */
function Tezlik({ prizes }: { prizes: OyinAdminPrizeRow[] }) {
  const v = useLoad(() => adminApi.oyinVelocity().then((r) => r.rows), []);
  if (v.err) return <ErrBox err={v.err} onRetry={v.reload} />;
  if (!v.data) return <Card title="📈 Tezlik"><Skeleton rows={6} /></Card>;

  const byKey = new Map<string, OyinPrizeVelocity>(v.data.map((r) => [r.key, r]));
  const rows = prizes.filter((p) => p.active && p.queued !== true);

  return (
    <>
      <Card title="📈 Mukofot tezligi" sub="qaysi biri mavsumga ulgurmaydi" flush>
        <Table
          rows={rows} rowKey={(p) => p.key}
          cols={[
            { key: "name", label: "Mukofot", render: (p) => <>{p.icon} <span className="oy-main">{p.name}</span></> },
            { key: "sold", label: "Sotilgan", render: (p) => <><Mini pct={p.limit > 0 ? (p.sold / p.limit) * 100 : 0} tone={p.sold >= p.limit ? "warn" : "ok"} /> <span className="oy-num">{p.sold}/{p.limit}</span></> },
            { key: "v7", label: "7 kunda", align: "r", sort: (p) => byKey.get(p.key)?.soldLast7d ?? 0, render: (p) => num(byKey.get(p.key)?.soldLast7d ?? 0) },
            {
              key: "eta", label: "To'lishiga", align: "r", sort: (p) => byKey.get(p.key)?.projectedDays ?? 99999,
              render: (p) => {
                const d = byKey.get(p.key)?.projectedDays;
                if (p.sold >= p.limit) return <Badge tone="warn">to'lgan</Badge>;
                // ⚠️ `null` = 7 kunda sotuv bo'lmagan. «∞ kun» yozish YOLG'ON aniqlik bo'lardi.
                if (d == null) return <span className="oy-err">sotuv yo'q</span>;
                return <span className={d > 30 ? "oy-err" : undefined}>{num(d)} kun</span>;
              },
            },
            { key: "guard", label: "Qo'riq", render: (p) => (p.minSell <= 0 ? <span className="oy-dim3">o'chiq</span> : p.willDraw ? <Badge tone="ok">tirajda</Badge> : <Badge tone="bad">{p.sold}/{p.minSell} kerak</Badge>) },
          ]}
          empty="Ochiq mukofot yo'q."
        />
      </Card>
      <Note tone="warn">
        <b>«sotuv yo'q»</b> — oxirgi 7 kunda birorta karta sotilmagan, ya'ni to'lish muddatini
        hisoblab bo'lmaydi. Bunday mukofot chegaraga yetmasa <b>tirajga tushmaydi</b> va karta
        olganlarga ball qaytarish kerak bo'ladi. Ikki yo'l: narxni tushirish yoki FINAL-48 dan
        oldin kartalarni bekor qilish.
      </Note>
    </>
  );
}

/* ── 💰 BYUDJET ────────────────────────────────────────────────────────────────────────────── */
function Byudjet({ prizes }: { prizes: OyinAdminPrizeRow[] }) {
  const b = useLoad(() => adminApi.oyinBudget(), []);
  if (b.err) return <ErrBox err={b.err} onRetry={b.reload} />;
  if (!b.data) return <Card title="💰 Byudjet"><Skeleton rows={5} /></Card>;
  const d = b.data;
  const open = prizes.filter((p) => p.active && p.queued !== true);
  const filledSom = open.filter((p) => p.limit > 0 && p.sold >= p.limit).reduce((s, p) => s + (parseSum(p.valueLabel) ?? 0), 0);
  const kassa = open.reduce((s, p) => s + p.sold * p.price * OYIN_SOM_PER_BALL, 0);

  return (
    <>
      <div className="oy-grid oy-g4">
        <Stat k="Mavsum byudjeti" v={short(d.budgetSom)} s="rejadagi shift" />
        <Stat k="Katalog qiymati" v={short(d.catalogSom)} s="hammasi to'lsa" tone={d.overBudget ? "bad" : "ok"} />
        <Stat k="HOZIR to'langani" v={short(filledSom)} s="to'lgan mukofotlar" tone="warn" />
        <Stat k="Kassaga tushgan" v={short(Math.round(kassa))} s="sotilgan kartalardan" tone="coin" />
      </div>
      <Card title="💰 Mavsum byudjeti" sub="faqat TO'LGAN mukofot pul turadi">
        <div className="oy-col">
          <span className="oy-fn-track"><i className="oy-fn-bar" style={{ width: `${Math.min(100, d.budgetSom > 0 ? (d.catalogSom / d.budgetSom) * 100 : 0)}%`, background: d.overBudget ? "var(--bad)" : "var(--c1)" }} /></span>
          <Note tone={d.overBudget ? "bad" : "ok"}>
            {d.overBudget
              ? <>Katalog byudjetdan <b>{short(d.catalogSom - d.budgetSom)} so'm</b> oshib ketdi. Bu HAMMA mukofot to'lgan holat uchun — real xarajat undan kam bo'ladi, lekin chegara baribir belgilangan.</>
              : <>Byudjet ichidasiz. Ochiq mukofotlarning <b>hammasi</b> to'lsa {short(d.catalogSom)} so'm bo'ladi — bu rejadagi {short(d.budgetSom)} so'm ichida.</>}
          </Note>
          <div className="oy-dim3">
            Mukofot faqat to'lganda pul turadi va to'lganda kassaga undan ko'proq tushadi
            (qoplash kafolati 3×). Shuning uchun to'lmagan mukofot xarajat EMAS.
          </div>
        </div>
      </Card>
      <Planner prizes={prizes} budgetSom={d.budgetSom} />
    </>
  );
}

/* ── ↩ TARIX ───────────────────────────────────────────────────────────────────────────────── */
function Tarix({ reload }: { reload: () => void }) {
  const toast = useToast();
  const s = useLoad(() => adminApi.oyinSnapshots().then((r) => r.rows), []);
  const [busy, setBusy] = useState(false);
  if (s.err) return <ErrBox err={s.err} onRetry={s.reload} />;
  if (!s.data) return <Card title="↩ Katalog tarixi"><Skeleton rows={5} /></Card>;

  return (
    <>
      <Card title="↩ Katalog tarixi" sub={`${s.data.length} ta nusxa · har yozuvdan OLDIN olinadi`} flush>
        <Table
          rows={s.data} rowKey={(r) => r.id}
          cols={[
            { key: "at", label: "Qachon", render: (r) => <span className="oy-sub">{ago(r.at)}</span> },
            { key: "label", label: "Nima bo'lgan", render: (r) => r.label },
            { key: "count", label: "Mukofot", align: "r", render: (r) => num(r.count) },
            {
              key: "act", label: "",
              render: (r) => (
                <Btn sm disabled={busy} onClick={() => {
                  if (!window.confirm(`Katalog «${r.label}» dan OLDINGI holatga qaytarilsinmi?\n\n${r.count} ta mukofot tiklanadi.\n\n⚠️ SOTILGAN kartalarga TEGILMAYDI — faqat narx/o'rin/nom/rasm qaytadi.`)) return;
                  setBusy(true);
                  void adminApi.oyinRestore(r.id).then((res) => {
                    toast(res.ok ? "↩ Katalog tiklandi" : `⛔ ${res.reason ?? "bajarilmadi"}`, res.ok ? "ok" : "bad");
                    reload(); s.reload();
                  }).finally(() => setBusy(false));
                }}>↩ Qaytarish</Btn>
              ),
            },
          ]}
          empty="Hali nusxa yo'q — katalogni birinchi marta o'zgartirganingizda paydo bo'ladi."
        />
      </Card>
      <Note>
        Nusxa <b>faqat qo'lda qilingan</b> o'zgarishlardan oldin olinadi. Tizimning avtomatik
        «navbatdan ochish»i tarixni to'ldirib, sizning tahrirlaringizni siqib chiqarmasligi uchun
        u nusxa OLMAYDI.
      </Note>
    </>
  );
}

/* ── ➕ BITTA MUKOFOT QO'SHISH ──────────────────────────────────────────────────────────────── */
// Eski panelda «➕ Yangi mukofot — faqat nomi va narxi» formasi bor edi va u MATEMATIKASIZ
// ishlardi: ega narx yozadi, karta bahosi va o'rinlar soni O'ZI hisoblanadi. Shu tamoyil
// saqlandi — ega hech qachon ball-narxni qo'lda o'ylab topmaydi.
function AddPrize({ open, onClose, reload }: { open: boolean; onClose: () => void; reload: () => void }) {
  const toast = useToast();
  const econ = useLoad(() => adminApi.bonusEconomy(), []); // B3 — jonli rideBall/multiplier
  const [icon, setIcon] = useState("🎁");
  const [name, setName] = useState("");
  const [somRaw, setSomRaw] = useState("");
  const [photo, setPhoto] = useState("");
  const [months, setMonths] = useState(6);
  const [busy, setBusy] = useState(false);

  const som = parseSum(somRaw);
  const tier = months <= 3 ? "kichik" : months <= 6 ? "orta" : months <= 10 ? "katta" : "bosh";
  const { rideBall, multiplier } = econRates(econ.data?.values);
  const plan = som ? oyinCardPlan(som, tier, rideBall, multiplier) : null;
  const cover = som && plan ? (plan.slots * plan.ballPrice * OYIN_SOM_PER_BALL) / som : null;

  const close = (): void => { setName(""); setSomRaw(""); setPhoto(""); setIcon("🎁"); setMonths(6); onClose(); };

  const add = async (): Promise<void> => {
    if (!name.trim() || !som || !plan) return;
    setBusy(true);
    try {
      await adminApi.upsertOyinPrize({
        icon: icon.trim() || "🎁", name: name.trim(), valueLabel: `${num(som)} so'm`,
        price: plan.ballPrice, limit: plan.slots, photoUrl: photo.trim() || null,
        // Yangi mukofot NAVBATGA tushadi — mijoz darhol ko'rmaydi. Vitrinaga chiqarish
        // alohida ongli qadam (katalogda «🟢 Vitrinaga chiqar»).
        queued: true,
      });
      toast(`✓ «${name.trim()}» qo'shildi — ${plan.slots} ta karta × ${num(plan.ballPrice)} ball · NAVBATDA`, "ok");
      reload();
      close();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Qo'shilmadi", "bad");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={close}>
      <div className="oy-card-h">
        <span className="oy-card-t">➕ Yangi mukofot</span>
        <span className="oy-card-sub">faqat nomi va narxi — qolganini tizim hisoblaydi</span>
        <span className="oy-spacer"><Btn sm variant="ghost" onClick={close}>✕</Btn></span>
      </div>
      <div className="oy-card-b oy-col">
        <div className="oy-row">
          <input className="oy-inp oy-srch" maxLength={8} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="emoji" />
          <input className="oy-inp" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nomi — masalan «Mikroto'lqinli pech»" />
        </div>
        <div className="oy-row">
          <input className="oy-inp oy-srch" value={somRaw} onChange={(e) => setSomRaw(e.target.value)} placeholder="Narxi so'mda (900 000)" />
          <span className="oy-dim">Necha oyda yetsin</span>
          {[3, 6, 10].map((m) => <Chip key={m} on={months === m} onClick={() => setMonths(m)}>{m} oy</Chip>)}
        </div>
        <input className="oy-inp" value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="Rasm havolasi (ixtiyoriy — keyin fayldan ham yuklash mumkin)" />

        {plan && som ? (
          <Note tone={cover != null && cover >= 3 ? "ok" : "bad"}>
            Daraja <b>{tier}</b> · karta bahosi <b>{num(plan.ballPrice)} ball</b>
            {plan.rides > 0 && <> (≈ {plan.rides} safarlik mehnat)</>} · kartalar soni <b>{num(plan.slots)} ta</b>
            <br />To'lganda kassaga <b>{num(Math.round(plan.slots * plan.ballPrice * OYIN_SOM_PER_BALL))} so'm</b> —
            <b> {cover?.toFixed(1)}× qoplash</b>{cover != null && cover < 3 && <> (kerak 3.0×)</>}. To'lmasa bir so'm ham sarflanmaydi.
            {plan.clamped && <><br /><b>⛔ Narx 100 mln so'm shipidan oshdi</b> — hisob KESILGAN qiymatdan, kafolat buzilgan.</>}
          </Note>
        ) : (
          <div className="oy-dim3">💡 Narxni yozing — karta bahosi, kartalar soni va qoplash o'zi hisoblanadi.</div>
        )}
      </div>
      <div className="oy-drw-f">
        <Btn variant="ghost" onClick={close}>Bekor</Btn>
        <span className="oy-spacer">
          <Btn variant="pri" disabled={busy || !name.trim() || !som} onClick={() => void add()}>
            {busy ? "⏳ Qo'shilmoqda…" : "Qo'shish (navbatga)"}
          </Btn>
        </span>
      </div>
    </Modal>
  );
}

/* ── 🧭 SOVRIN REJALASHTIRUVCHI ────────────────────────────────────────────────────────────── */
// Eski `OyinBudgetCard` ning ikkinchi yarmi: byudjetni daraja bo'yicha taqsimlash va «nechta
// kerak / nechta bor» ni ko'rsatish. Taqsimot `oyin:seasonplan` da saqlanadi (jonli mavsumga
// tegmaydi) — ya'ni reja qayta ochilganda yo'qolmaydi.
const TIERS: { id: "kichik" | "orta" | "katta"; label: string; lo: number; hi: number }[] = [
  { id: "kichik", label: "Kichik", lo: 0, hi: 500_000 },
  { id: "orta", label: "O'rta", lo: 500_000, hi: 2_000_000 },
  { id: "katta", label: "Katta", lo: 2_000_000, hi: Infinity },
];

function Planner({ prizes, budgetSom }: { prizes: OyinAdminPrizeRow[]; budgetSom: number }) {
  const toast = useToast();
  const plan = useLoad(() => adminApi.oyinSeasonPlan(), []);
  const [split, setSplit] = useState<{ kichik: number; orta: number; katta: number } | null>(null);
  const cur = split ?? plan.data?.split ?? null;

  if (!plan.data || !cur) return <Card title="🧭 Sovrin rejalashtiruvchi"><Skeleton rows={4} /></Card>;

  const total = cur.kichik + cur.orta + cur.katta;
  const open = prizes.filter((p) => p.active);
  const have = (t: typeof TIERS[number]): number => open.filter((p) => { const s = parseSum(p.valueLabel) ?? 0; return s >= t.lo && s < t.hi; }).length;
  const avgOf = (t: typeof TIERS[number]): number => {
    const list = open.filter((p) => { const s = parseSum(p.valueLabel) ?? 0; return s >= t.lo && s < t.hi; }).map((p) => parseSum(p.valueLabel) ?? 0);
    // O'rtacha narx MAVJUD mukofotlardan olinadi. Bo'sh daraja uchun oraliq o'rtasi ishlatiladi
    // (Infinity bo'lsa quyi chegaraning 1.5 baravari) — soxta aniqlik ko'rsatmaslik uchun.
    if (list.length > 0) return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
    return Number.isFinite(t.hi) ? Math.round((t.lo + t.hi) / 2) : Math.round(t.lo * 1.5);
  };

  const save = (next: typeof cur): void => {
    setSplit(next);
    void adminApi.setOyinSeasonPlan({ split: next }).then(() => plan.reload()).catch(() => toast("Saqlanmadi", "bad"));
  };

  return (
    <Card title="🧭 Sovrin rejalashtiruvchi" sub={`byudjetni darajaga taqsimlang · jami ${total}%`}>
      <div className="oy-col">
        <div className="oy-tw">
          <table>
            <thead><tr><th>Daraja</th><th className="oy-r">Ulush</th><th className="oy-r">Summa</th><th className="oy-r">Kerak</th><th className="oy-r">Bor</th><th>Holat</th></tr></thead>
            <tbody>
              {TIERS.map((t) => {
                const pct = cur[t.id];
                const somFor = Math.round((budgetSom * pct) / 100);
                const avg = avgOf(t);
                const need = avg > 0 ? Math.max(0, Math.round(somFor / avg)) : 0;
                const has = have(t);
                return (
                  <tr key={t.id}>
                    <td><span className="oy-main">{t.label}</span><div className="oy-sub">{num(t.lo)}{Number.isFinite(t.hi) ? `–${num(t.hi)}` : "+"} so'm</div></td>
                    <td className="oy-r">
                      <input
                        className="oy-inp oy-srch" type="number" min={0} max={100} value={pct}
                        onChange={(e) => save({ ...cur, [t.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      />
                    </td>
                    <td className="oy-r">{short(somFor)}</td>
                    <td className="oy-r oy-sub">≈ {num(need)} ta</td>
                    <td className="oy-r">{num(has)} ta</td>
                    <td>{has >= need ? <Badge tone="ok">yetarli</Badge> : <Badge tone="warn">{need - has} ta kam</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total !== 100 && <Note tone="warn">Ulushlar yig'indisi <b>{total}%</b> — 100% bo'lishi SHART emas, lekin bilib turing.</Note>}
        <Note>
          «Kerak» soni <b>o'sha darajadagi mavjud mukofotlarning o'rtacha narxidan</b> chiqadi.
          Daraja bo'sh bo'lsa oraliq o'rtasi olinadi — bu taxmin, shuning uchun aniq raqam emas,
          yo'nalish. Taqsimot kelasi mavsum qoralamasida saqlanadi, jonli mavsumga tegmaydi.
        </Note>
      </div>
    </Card>
  );
}
