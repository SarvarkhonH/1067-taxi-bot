// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚙ SOZLAMA & AUDIT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Beshta bo'lim: 📅 Mavsum · 🎚 Ball jadvali · 🧾 Audit · 🏅 Homiy · 🧪 Men.
//
// 🧾 AUDIT — eski panelda UMUMAN yo'q edi. Narx kim tomonidan, qachon o'zgartirilgani hech
// qayerda qolmasdi. ⚠️ «📜 faoliyat jurnali» BILAN CHALKASHTIRILMAYDI: u mijoz ball voqealari.
import { useMemo, useState } from "react";
import type { OyinAuditEntry, OyinSeasonView } from "@t1067/shared";
import { OYIN_AUDIT_ACTIONS } from "@t1067/shared";
import { adminApi } from "../api";
import type { OyinView } from "./Konsol";
import { csvName, downloadCsv } from "../lib/csv";
import { ago, dt, num } from "../lib/fmt";
import { Badge, Btn, Card, Chip, ErrBox, Note, Skeleton, Stat, Table, useLoad, useToast } from "./ui";

type Sub = "ishga" | "mavsum" | "ball" | "audit" | "homiy" | "men";

export function Sozlama({ onChanged, onGo }: { onChanged: () => void; onGo: (v: OyinView) => void }) {
  const [sub, setSub] = useState<Sub>("ishga");
  return (
    <>
      <div className="oy-chips">
        <Chip on={sub === "ishga"} onClick={() => setSub("ishga")}>🚦 Ishga tushirish</Chip>
        <Chip on={sub === "mavsum"} onClick={() => setSub("mavsum")}>📅 Mavsum</Chip>
        <Chip on={sub === "ball"} onClick={() => setSub("ball")}>🎚 Ball jadvali</Chip>
        <Chip on={sub === "audit"} onClick={() => setSub("audit")}>🧾 Audit jurnali</Chip>
        <Chip on={sub === "homiy"} onClick={() => setSub("homiy")}>🏅 Homiy</Chip>
        <Chip on={sub === "men"} onClick={() => setSub("men")}>🧪 Men</Chip>
      </div>
      {sub === "ishga" && <Ishga onGo={onGo} onChanged={onChanged} />}
      {sub === "mavsum" && <Mavsum onChanged={onChanged} />}
      {sub === "ball" && <Ball />}
      {sub === "audit" && <Audit />}
      {sub === "homiy" && <Homiy />}
      {sub === "men" && <Men />}
    </>
  );
}

/* ── 📅 MAVSUM ─────────────────────────────────────────────────────────────────────────────── */
const PHASE: Record<OyinSeasonView["phase"], [string, "ok" | "warn" | "bad" | "mute"]> = {
  unset: ["Sozlanmagan — o'yin yopiq", "bad"], upcoming: ["Boshlanishi kutilmoqda", "warn"],
  active: ["Mavsum ochiq", "ok"], ended: ["Mavsum yakunlandi", "warn"],
};

function Mavsum({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const s = useLoad(() => adminApi.oyinSeason(), []);
  const plan = useLoad(() => adminApi.oyinSeasonPlan(), []);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (s.data && !loaded) {
    setStart(s.data.startIso?.slice(0, 16) ?? "");
    setEnd(s.data.endIso?.slice(0, 16) ?? "");
    setLabel(s.data.label ?? "");
    setLoaded(true);
  }

  if (s.err) return <ErrBox err={s.err} onRetry={s.reload} />;
  if (!s.data) return <Card title="📅 Mavsum"><Skeleton rows={5} /></Card>;
  const v = s.data;
  const [phaseLabel, phaseTone] = PHASE[v.phase];

  const save = (): void => {
    const savedS = v.startIso?.slice(0, 16) ?? "";
    const savedE = v.endIso?.slice(0, 16) ?? "";
    if ((savedS && start > savedS) || (savedE && end < savedE)) {
      if (!window.confirm(`⛔ Mavsum oynasi TORAYMOQDA.\n\nYangi oynadan tashqarida qolgan KARTALAR mijozning «Mening kartalarim» ro'yxatidan, hisobidan va tiraj eksportidan YO'QOLADI.\nSarflangan ball ularga qaytib keladi va reyting o'zgaradi. Xabar bormaydi.\n\nDavom etasizmi?`)) return;
    }
    setBusy(true);
    void adminApi.setOyinSeason(start, end, label.trim() || null)
      .then(() => { toast("✓ Mavsum saqlandi · audit jurnaliga yozildi", "ok"); s.reload(); onChanged(); })
      .catch(() => toast("⛔ Saqlanmadi — sanani tekshiring (tugash sanasi kelajakda bo'lsin)", "bad"))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Card title="📅 Mavsum vaqtlari" sub={`${v.seasonId}-mavsum`}>
        <div className="oy-col">
          <div className="oy-row">
            <Badge tone={phaseTone}>{phaseLabel}</Badge>
            {v.phase === "active" && v.endMs != null && v.endMs - Date.now() <= 48 * 3600_000 && <Badge tone="warn">🔒 FINAL-48 — karta xaridi yopiq</Badge>}
          </div>
          <div className="oy-row"><span className="oy-dim">Boshlanishi</span><input className="oy-inp oy-srch" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="oy-row"><span className="oy-dim">Tugashi</span><input className="oy-inp oy-srch" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <div className="oy-row"><span className="oy-dim">Nomi</span><input className="oy-inp" maxLength={40} placeholder="Avgust mavsumi (ixtiyoriy)" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <Note>
            Ball <b>faqat mavsum ichidagi</b> harakatlar uchun beriladi. Oxirgi <b>48 soatda</b>
            karta xaridi avtomatik yopiladi — ro'yxat tirajga qotadi, siz ham istisno emassiz.
          </Note>
          <div className="oy-row">
            <Btn variant="pri" disabled={busy} onClick={save}>Saqlash</Btn>
            <Btn variant="dgr" disabled={busy} onClick={() => {
              if (!window.confirm("Yangi mavsum TOZA boshlansinmi?\n\nEski kartalar, sotilgan-hisoblagichlar va kunlik belgilar ARXIVGA ko'chiriladi (o'chirilmaydi). Mukofotlar ro'yxati saqlanadi.")) return;
              setBusy(true);
              void adminApi.resetOyinSeason(start, end, label.trim() || null)
                .then((r) => { toast(r.ok ? `✓ ${r.seasonId} mavsumi boshlandi — ${r.archivedRows ?? 0} yozuv arxivlandi` : `⛔ ${r.error ?? "bajarilmadi"}`, r.ok ? "ok" : "bad"); s.reload(); onChanged(); })
                .finally(() => setBusy(false));
            }}>🔄 Yangi mavsum (toza boshlash)</Btn>
          </div>
        </div>
      </Card>

      <Card title="🗓 Kelasi mavsum qoralamasi" sub="JONLI mavsumga tegmaydi — faqat reja">
        {!plan.data ? <Skeleton rows={3} /> : (
          <div className="oy-col">
            <div className="oy-row"><span className="oy-dim">Byudjet</span>
              <input className="oy-inp oy-srch" type="number" defaultValue={plan.data.budgetSom}
                onBlur={(e) => void adminApi.setOyinSeasonPlan({ budgetSom: Number(e.target.value) || 0 }).then(() => { toast("Qoralama saqlandi", "ok"); plan.reload(); })} />
              <span className="oy-dim3">so'm</span></div>
            <div className="oy-row"><span className="oy-dim">Eslatma</span>
              <input className="oy-inp" defaultValue={plan.data.note} placeholder="Nima rejalashtiryapsiz…"
                onBlur={(e) => void adminApi.setOyinSeasonPlan({ note: e.target.value }).then(() => plan.reload())} /></div>
            <div className="oy-dim3">
              {plan.data.updatedAt ? <>Oxirgi tahrir: {ago(plan.data.updatedAt)}</> : "Hali to'ldirilmagan."}
              {" "}Qoralamani ishga tushirish — yuqoridagi «Yangi mavsum» tugmasi orqali, ALOHIDA ongli qadam.
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

/* ── 🎚 BALL JADVALI ───────────────────────────────────────────────────────────────────────── */
function Ball() {
  const toast = useToast();
  const e = useLoad(() => adminApi.bonusEconomy(), []);
  const [busy, setBusy] = useState<string | null>(null);
  if (e.err) return <ErrBox err={e.err} onRetry={e.reload} />;
  if (!e.data) return <Card title="🎚 Ball jadvali"><Skeleton rows={6} /></Card>;

  const knobs = e.data.knobs.filter((k) => k.key.startsWith("oyin"));
  return (
    <>
      <Card title="🎚 Ball jadvali" sub={`${knobs.length} ta sozlama · o'zgarish DARHOL kuchga kiradi`} flush>
        <Table
          rows={knobs} rowKey={(k) => k.key}
          cols={[
            { key: "label", label: "Nima", render: (k) => <><span className="oy-main">{k.label}</span><div className="oy-sub oy-mono">{k.key}</div></> },
            { key: "range", label: "Chegara", render: (k) => <span className="oy-dim3">{k.min}…{k.max} (asl {k.def})</span> },
            {
              key: "v", label: "Qiymat", align: "r",
              render: (k) => (
                <input
                  className="oy-inp oy-srch" type="number" min={k.min} max={k.max} step={k.step}
                  defaultValue={e.data!.values[k.key] ?? k.def} disabled={busy === k.key}
                  onBlur={(ev) => {
                    const val = Number(ev.target.value);
                    if (!Number.isFinite(val) || val === (e.data!.values[k.key] ?? k.def)) return;
                    setBusy(k.key);
                    void adminApi.setBonusEconomy(k.key, val)
                      .then(() => { toast(`✓ ${k.label} = ${val}`, "ok"); e.reload(); })
                      .catch(() => toast("Saqlanmadi", "bad"))
                      .finally(() => setBusy(null));
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
      <Note tone="warn">
        Bu raqamlar <b>mavsum o'rtasida</b> o'zgarsa mijozlar boshqa qoida bilan ball yig'ib
        bo'lgan bo'ladi. O'zgartirishdan oldin «🔮 Reja» bo'limida natijasini ko'ring.
      </Note>
    </>
  );
}

/* ── 🧾 AUDIT ──────────────────────────────────────────────────────────────────────────────── */
const AUDIT_LABEL: Record<string, string> = {
  "prize.upsert": "Mukofot tahriri", "prize.delete": "Mukofot o'chirildi", "prize.active": "Vitrina holati",
  "prize.photo": "Rasm yuklandi", "prize.cancelTickets": "Kartalar bekor qilindi",
  "catalog.bulk": "Ommaviy yuklash", "catalog.restore": "Katalog tiklandi",
  "season.set": "Mavsum sanalari", "season.reset": "Yangi mavsum", "knobs.set": "Ball jadvali", "sponsor.set": "Homiy",
  "freeze.set": "Tiraj muzlatish", "capacity.open": "Navbatdan ochish",
  "ball.adjust": "Ball tuzatish", "ticket.cancel": "Karta bekor qilindi", "member.ban": "Chetlatish",
  "story.review": "Hikoya qarori", "gashtak.kick": "Gashtakdan chiqarish", "gashtak.disband": "Gashtak tarqatildi", "gashtak.turn": "Gashtak navbati",
};

function Audit() {
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const a = useLoad(() => adminApi.oyinAudit({ ...(action ? { action } : {}), ...(q ? { q } : {}), page }), [action, q, page]);

  if (a.err) return <ErrBox err={a.err} onRetry={a.reload} />;

  const used = useMemo(() => (a.data ? [...new Set(a.data.rows.map((r) => r.action))] : []), [a.data]);

  return (
    <>
      <Card
        title="🧾 Audit jurnali"
        sub="kim · qachon · eski → yangi"
        head={
          <div className="oy-spacer oy-row">
            <input className="oy-inp oy-srch" placeholder="🔍 Nima yoki kim…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            <Btn sm disabled={!a.data || a.data.rows.length === 0} onClick={() => a.data && downloadCsv(csvName("oyin-audit"), ["Vaqt", "Kim", "Amal", "Nimaga", "O'zgarish", "Izoh"], a.data.rows.map((r) => [r.at, r.actor, AUDIT_LABEL[r.action] ?? r.action, r.target, r.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · "), r.note ?? ""]))}>⬇ CSV</Btn>
          </div>
        }
        flush
      >
        <div className="oy-card-b-tight">
          <div className="oy-chips">
            <Chip on={action === ""} onClick={() => { setAction(""); setPage(1); }}>Hammasi</Chip>
            {(used.length > 0 ? used : (OYIN_AUDIT_ACTIONS as readonly string[]).slice(0, 8)).map((k) => (
              <Chip key={k} on={action === k} onClick={() => { setAction(k); setPage(1); }}>{AUDIT_LABEL[k] ?? k}</Chip>
            ))}
          </div>
        </div>
        {!a.data ? <div className="oy-card-b"><Skeleton rows={8} /></div> : (
          <>
            <Table
              rows={a.data.rows} rowKey={(r: OyinAuditEntry) => `${r.at}-${r.action}-${r.target}`}
              cols={[
                { key: "at", label: "Qachon", render: (r) => <span className="oy-sub" title={dt(r.at)}>{ago(r.at)}</span> },
                { key: "actor", label: "Kim", render: (r) => <span className="oy-main">{r.actor}</span> },
                { key: "act", label: "Nima", render: (r) => AUDIT_LABEL[r.action] ?? r.action },
                { key: "target", label: "Nimaga", render: (r) => r.target },
                {
                  key: "chg", label: "O'zgarish",
                  render: (r) => (r.changes.length === 0 ? <span className="oy-dim3">—</span> : (
                    <span>{r.changes.map((c) => (
                      <span key={c.field}>{c.field}: <span className="oy-old">{c.from}</span> <span className="oy-chg">→ {c.to}</span>{" "}</span>
                    ))}</span>
                  )),
                },
                { key: "note", label: "Izoh", render: (r) => (r.note ? <span className="oy-sub">{r.note}</span> : <span className="oy-dim3">—</span>) },
              ]}
              empty="Hali yozuv yo'q — birinchi o'zgarishingizdan keyin paydo bo'ladi."
            />
            <div className="oy-card-b-tight oy-row">
              <span className="oy-dim3">{num(a.data.total)} yozuv{a.data.truncated && " · jurnal to'lgan, eng eskilari chiqib ketgan"}</span>
              <div className="oy-spacer oy-row">
                <Btn sm disabled={a.data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Oldingi</Btn>
                <Btn sm disabled={a.data.page * a.data.pageSize >= a.data.total} onClick={() => setPage((p) => p + 1)}>Keyingi →</Btn>
              </div>
            </div>
          </>
        )}
      </Card>
      <Note>
        Bu jurnal <b>sizning va operatorlarning</b> amallari haqida. Mijozning ball voqealari
        alohida — «◍ Odamlar → 📜 Faoliyat jurnali» da. Ikkalasi bir-birini almashtirmaydi.
      </Note>
    </>
  );
}

/* ── 🏅 HOMIY ──────────────────────────────────────────────────────────────────────────────── */
function Homiy() {
  const toast = useToast();
  const s = useLoad(() => adminApi.oyinSponsor(), []);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [active, setActive] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  if (s.data && !loaded) { setName(s.data.name); setUrl(s.data.photoUrl ?? ""); setActive(s.data.active); setLoaded(true); }
  if (s.err) return <ErrBox err={s.err} onRetry={s.reload} />;
  if (!s.data) return <Card title="🏅 Homiy"><Skeleton rows={4} /></Card>;

  return (
    <Card title="🏅 Mavsum homiysi" sub="nomi va logotipi mijoz ekranida va posterda chiqadi">
      <div className="oy-col">
        <div className="oy-row"><span className="oy-dim">Nomi</span><input className="oy-inp" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="oy-row"><span className="oy-dim">Logotip URL</span><input className="oy-inp" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ixtiyoriy" /></div>
        <label className="oy-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Mijoz ekranida ko'rsatilsin</span></label>
        {s.data.isDefault && <Note>Hozir <b>standart</b> qiymat ishlatilyapti — hali o'zgartirilmagan.</Note>}
        <Note>O'chirilsa BirJoy'ning o'z nomi chiqadi — ekranda bo'sh joy qolmaydi.</Note>
        <div>
          <Btn variant="pri" disabled={busy || !name.trim()} onClick={() => {
            setBusy(true);
            void adminApi.setOyinSponsor(name.trim(), url.trim() || null, active)
              .then(() => { toast("✓ Homiy saqlandi · audit jurnaliga yozildi", "ok"); s.reload(); })
              .catch(() => toast("Saqlanmadi", "bad"))
              .finally(() => setBusy(false));
          }}>Saqlash</Btn>
        </div>
      </div>
    </Card>
  );
}

/* ── 🧪 MEN ────────────────────────────────────────────────────────────────────────────────── */
const ME_KEY = "oyin_admin_me";

function Men() {
  const toast = useToast();
  const [meId, setMeId] = useState<number | null>(() => {
    try { const v = Number(localStorage.getItem(ME_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
  });
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ memberId: number; name: string; phone: string | null; ball: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useLoad(async () => (meId ? adminApi.oyinMember(meId) : null), [meId]);

  const pick = (id: number): void => {
    setMeId(id);
    setHits(null);
    try { localStorage.setItem(ME_KEY, String(id)); } catch { /* private rejim */ }
  };

  const search = async (): Promise<void> => {
    const s = q.trim();
    if (!s) return;
    setBusy(true);
    try {
      const r = await adminApi.oyinFind(s);
      if (r.hits.length === 0) { toast(`«${s}» bo'yicha hech kim topilmadi`, "warn"); return; }
      if (r.hits.length === 1 && r.hits[0]) { pick(r.hits[0].memberId); return; }
      setHits(r.hits);
    } catch (e) { toast(e instanceof Error ? e.message : "Qidiruv ishlamadi", "bad"); }
    finally { setBusy(false); }
  };

  const add = (n: number): void => {
    if (!meId) return;
    setBusy(true);
    void adminApi.oyinAdjustBall(meId, n, "ega sinovi — konsol")
      .then((r) => { toast(r.ok ? `✅ +${num(n)} ball — yangi balans ${num(r.ball ?? 0)}` : "Bajarilmadi", r.ok ? "ok" : "bad"); me.reload(); })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Card title="🧪 Men — o'zim o'ynab ko'raman" sub={meId ? `#${meId}` : "avval o'zingizni toping"}>
        <Note tone="warn">
          Bu yerdagi har harakat <b>REAL</b>: ball ham, karta ham haqiqiy hisobga tushadi,
          adminlarga xabar boradi va audit jurnaliga yoziladi. Sinov kartalari tirajga
          <b> kirmaydi</b>, lekin mukofotdagi o'rinni EGALLAYDI — sinovdan keyin tozalab qo'ying.
        </Note>
        {!meId && (
          <div className="oy-row">
            <input className="oy-inp" placeholder="O'z telefoningiz (901234567), ismingiz yoki ID" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} />
            <Btn variant="pri" disabled={busy || !q.trim()} onClick={() => void search()}>🔍 O'zimni topish</Btn>
          </div>
        )}
        {hits && (
          <Table
            rows={hits} rowKey={(h) => h.memberId}
            cols={[
              { key: "n", label: "A'zo", render: (h) => <>{h.name} <span className="oy-sub oy-mono">#{h.memberId}</span></> },
              { key: "p", label: "Telefon", render: (h) => <span className="oy-sub">{h.phone ?? "—"}</span> },
              { key: "b", label: "Ball", align: "r", render: (h) => <span className="oy-coin">{num(h.ball)}</span> },
              { key: "a", label: "", render: (h) => <Btn sm onClick={() => pick(h.memberId)}>Bu menman</Btn> },
            ]}
          />
        )}
      </Card>

      {meId && me.data && (
        <>
          <div className="oy-grid oy-g4">
            <Stat k="Ballim" v={num(me.data.ball)} tone="coin" />
            <Stat k="Yig'ilgan" v={num(me.data.earned)} />
            <Stat k="Sarflangan" v={num(me.data.spent)} s={`${me.data.tickets.length} ta karta`} />
            <Stat k="Mavsum safarim" v={num(me.data.seasonRides)} s={me.data.seasonRides > 0 ? "karta olishim mumkin" : "karta OLA OLMAYMAN"} tone={me.data.seasonRides > 0 ? "ok" : "bad"} />
          </div>
          <Card title="Sinov amallari" flush>
            <div className="oy-card-b oy-row">
              <Btn variant="pri" disabled={busy} onClick={() => add(5000)}>＋5 000 ball</Btn>
              <Btn disabled={busy} onClick={() => add(1000)}>＋1 000 ball</Btn>
              <Btn variant="dgr" disabled={busy || me.data.tickets.length === 0} onClick={() => {
                if (!window.confirm(`Sizning ${me.data!.tickets.length} ta kartangiz BEKOR qilinsinmi?\n\nHar birining o'rni mukofotga qaytadi va sarflangan ball sizga qaytariladi.`)) return;
                setBusy(true);
                void (async () => {
                  let done = 0;
                  for (const t of me.data!.tickets) {
                    const r = await adminApi.oyinCancelTicket(meId, t.gno).catch(() => null);
                    if (r?.ok) done += 1;
                  }
                  toast(`✅ ${done} ta karta bekor qilindi`, "ok");
                  me.reload();
                  setBusy(false);
                })();
              }}>🧹 Kartalarimni tozalash ({me.data.tickets.length})</Btn>
              <Btn variant="ghost" onClick={() => { try { localStorage.removeItem(ME_KEY); } catch { /* ignore */ } setMeId(null); }}>✕ Bu men emasman</Btn>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

/* ── 🚦 ISHGA TUSHIRISH ────────────────────────────────────────────────────────────────────── */
// Ega savoli (2026-08-11): «hammasi tayyormi o'yinni boshlashga yoki hali bormi?».
//
// Bu ekran shu savolga JONLI javob beradi va oxirida yagona tugmani ko'rsatadi. Avval
// `oyin` bayrog'i faqat eski «Amallar» tabida edi — ya'ni butun boshqaruv konsolda, lekin
// eng muhim tugma boshqa joyda edi.
//
// ⚠️ Ro'yxat TO'SIQLARNI ko'rsatadi, lekin tugmani BLOKLAMAYDI: ega o'z tizimining egasi,
// «men bilaman, baribir yoqaman» deyish huquqi bor. Faqat nima bo'lishini AYTADI.
interface Gate { ok: boolean; title: string; detail: string; go?: OyinView }

function Ishga({ onGo, onChanged }: { onGo: (v: OyinView) => void; onChanged: () => void }) {
  const toast = useToast();
  const st = useLoad(async () => {
    const [vitals, features, catalog] = await Promise.all([
      adminApi.oyinVitals(),
      adminApi.features().then((r) => r.features),
      adminApi.oyinCatalog().then((r) => r.prizes),
    ]);
    return { vitals, features, catalog };
  }, []);
  const [busy, setBusy] = useState(false);

  if (st.err) return <ErrBox err={st.err} onRetry={st.reload} />;
  if (!st.data) return <Card title="🚦 Ishga tushirish"><Skeleton rows={6} /></Card>;

  const { vitals, features, catalog } = st.data;
  const on = features.find((f) => f.name === "oyin")?.on ?? false;
  const open = catalog.filter((p) => p.active && p.queued !== true);
  const withPhoto = open.filter((p) => p.photoFileId || p.photoUrl).length;

  const gates: Gate[] = [
    {
      ok: vitals.seasonPhase === "active" || vitals.seasonPhase === "upcoming",
      title: "Mavsum sanalari kiritilgan",
      detail: vitals.seasonPhase === "unset"
        ? "Sana yo'q — o'yin yoqilsa ham BUTUNLAY yopiq turadi, hech kim ball yig'a olmaydi."
        : vitals.seasonPhase === "ended" ? "Mavsum yakunlangan — yangi sana kerak."
        : `Mavsum ${vitals.seasonPhase === "active" ? "ochiq" : "boshlanishini kutmoqda"}.`,
      go: "sozlama",
    },
    {
      ok: open.length > 0,
      title: "Vitrinada mukofot bor",
      detail: open.length === 0
        ? "Ochiq mukofot yo'q — mijoz ball yig'adi-yu, sarflaydigan narsa topmaydi."
        : `${open.length} ta mukofot ochiq.`,
      go: "mukofot",
    },
    {
      ok: open.length === 0 || withPhoto === open.length,
      title: "Har mukofotda rasm bor",
      detail: withPhoto === open.length
        ? "Hammasida rasm bor."
        : `${open.length - withPhoto} tasida rasm yo'q — mijoz nima yutishini KO'RMAYDI (jismoniy narsa = real rasm).`,
      go: "mukofot",
    },
    {
      ok: vitals.capacityHealthy,
      title: "Sig'im yetarli (3×)",
      detail: vitals.capacityHealthy
        ? `Sig'im ${vitals.capacityRatio.toFixed(1)}× — yetarli.`
        : `Sig'im ${vitals.capacityRatio.toFixed(1)}× — xalqdagi ball sarflanadigan joyga sig'maydi. Navbatdan mukofot oching.`,
      go: "nazorat",
    },
    {
      ok: !vitals.overBudget,
      title: "Byudjet ichida",
      detail: vitals.overBudget ? "Katalog byudjetdan oshgan." : "Byudjet ichidasiz.",
      go: "mukofot",
    },
    {
      ok: !vitals.frozen,
      title: "Tiraj muzlatilmagan",
      detail: vitals.frozen ? "Tiraj MUZLATILGAN — hech kim karta ola olmaydi." : "Tiraj ochiq.",
      go: "kartalar",
    },
  ];
  const blocked = gates.filter((g) => !g.ok);

  const toggle = (): void => {
    const next = !on;
    const warn = next
      ? `O'YIN MIJOZLARGA OCHILSINMI?\n\n${blocked.length > 0 ? `⚠️ ${blocked.length} ta to'siq bor:\n${blocked.map((g) => `· ${g.title}`).join("\n")}\n\n` : ""}Ochilgach mijozlar ball yig'ishni va karta olishni boshlaydi.\nAdminlarga xabar boradi.\n\nDavom etasizmi?`
      : `O'YIN MIJOZLARDAN YOPILSINMI?\n\nIlovada o'yin ekrani YO'QOLADI va karta xaridi to'xtaydi.\nYig'ilgan ball va olingan kartalar SAQLANADI.\nAdminlarga xabar boradi.\n\nDavom etasizmi?`;
    if (!window.confirm(warn)) return;
    setBusy(true);
    void adminApi.setFeature("oyin", next)
      .then(() => { toast(next ? "🎮 O'yin MIJOZLARGA OCHILDI" : "⛔ O'yin yopildi", next ? "ok" : "warn"); st.reload(); onChanged(); })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : "Bajarilmadi", "bad"))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Card
        title={on ? "🟢 O'yin MIJOZLARGA OCHIQ" : "⛔ O'yin yopiq — mijozlar ko'rmaydi"}
        sub={on ? "ilovada o'yin ekrani ko'rinadi, karta sotilyapti" : "kod jonli, lekin mijoz uchun o'chirilgan"}
        head={
          <span className="oy-spacer">
            <Btn variant={on ? "dgr" : "pri"} disabled={busy} onClick={toggle}>
              {busy ? "⏳…" : on ? "⛔ O'yinni yopish" : "🎮 O'yinni ochish"}
            </Btn>
          </span>
        }
      >
        {blocked.length > 0 ? (
          <Note tone="warn">
            <b>{blocked.length} ta to'siq bor.</b> Tugma baribir ishlaydi — bu sizning tizimingiz.
            Lekin shu holda ochilsa mijoz nimani ko'rishini pastdagi ro'yxat aytadi.
          </Note>
        ) : (
          <Note tone="ok"><b>Hamma shart bajarilgan</b> — ochsangiz bo'ladi.</Note>
        )}
      </Card>

      <Card title="Ishga tushirish ro'yxati" sub={`${gates.length - blocked.length}/${gates.length} tayyor`} flush>
        {gates.map((g) => (
          <div key={g.title} className={g.ok ? "oy-task oy-task-ok" : "oy-task oy-task-warn"}>
            <span className="oy-task-x">
              <b>{g.ok ? "✓" : "✗"} {g.title}</b>
              <div className="oy-dim3">{g.detail}</div>
            </span>
            {!g.ok && g.go && <Btn sm onClick={() => onGo(g.go as OyinView)}>Tuzatish →</Btn>}
          </div>
        ))}
      </Card>

      <Note>
        Bayroq o'zgarishi HAR DOIM adminlarga Telegram xabar yuboradi — jim yoqish/o'chirish
        loyihada taqiq (bir marta <code>welcomebonus</code> jimgina o'chirilgan va hech kim
        bilmay qolgan edi).
      </Note>
    </>
  );
}
