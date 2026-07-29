// ═══════════════════════════════════════════════════════════════════════════
// 🎨 #kit — DIZAYN TIZIMI GALEREYASI
//
// Nima uchun kerak: butun panel SHU primitivlardan quriladi, shuning uchun
// ularni bitta ekranda ko'rib baholash — eng arzon sifat-nazorati. Miniapp'da
// ayni naqsh bor (`#demo`, `#rstdemo`). Ega bu sahifani ochib "shu ko'rinish
// menga mosmi?" degan qarorni BUTUN panel qurilishidan OLDIN beradi.
//
// Ochish: admin.birjoy.online/#kit
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  Async,
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
  cssVar,
  Dot,
  Drawer,
  Empty,
  ErrorState,
  Field,
  Input,
  KV,
  Kbd,
  Modal,
  Panel,
  RangePicker,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  SkeletonRows,
  Spinner,
  StatCard,
  Tabs,
  Textarea,
  ToastHost,
  useToast,
  type Tone,
} from "./kit";
import { ago, dt, mins, num, pctRaw, phone, som, tanga, delta } from "../lib/fmt";
import "./tokens.css";
import "./base.css";
import "./feat/kit.css";
import "./feat/demo.css";

const TONES: Tone[] = ["neutral", "ok", "warn", "bad", "info", "brand", "coin"];

function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="kd-row">
      <div className="kd-row-head">
        <h3 className="a2-h3">{title}</h3>
        {note && <span className="a2-hint">{note}</span>}
      </div>
      <div className="kd-row-body">{children}</div>
    </div>
  );
}

function DemoInner() {
  const toast = useToast();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [seg, setSeg] = useState<"a" | "b" | "c">("a");
  const [tab, setTab] = useState<"umumiy" | "safarlar" | "pul">("umumiy");
  const [range, setRange] = useState<7 | 14 | 30 | 60>(30);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<"all" | "client" | "driver">("all");
  const [area, setArea] = useState("");
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState<string[] | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-a2", theme);
    return () => document.documentElement.removeAttribute("data-a2");
  }, [theme]);

  // Async primitivini "haqiqiy" ko'rsatish: 1.4s skeleton → keyin kontent
  useEffect(() => {
    const t = window.setTimeout(() => setLoadingDemo(["Birinchi qator", "Ikkinchi qator", "Uchinchi qator"]), 1400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="a2 kd-page">
      <header className="kd-top">
        <div>
          <div className="a2-eyebrow">BirJoy Admin v2</div>
          <h1 className="a2-h1">Dizayn tizimi</h1>
        </div>
        <div className="a2-spacer" />
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: "dark", label: "🌙 Qorong'i" },
            { value: "light", label: "☀️ Yorug'" },
          ]}
        />
      </header>

      <p className="a2-dim kd-lead">
        Butun panel shu primitivlardan quriladi. Har element tokenlardan rang/o'lcham oladi — inline stil yo'q.
        Temani almashtirib ikkalasini ham tekshirish mumkin.
      </p>

      {/* ── StatCard: eng ko'p ko'rinadigan element ── */}
      <Row title="StatCard" note="qiymat + o'zgarish % + sparkline sloti (grafik 2-qadamda ulanadi)">
        <div className="a2-grid-4">
          <StatCard label="Safarlar" value={num(142)} delta={delta(142, 127)} deltaSub="o'tgan hafta shu kuni" />
          <StatCard label="GMV" value={som(2_140_000)} delta={delta(2_140_000, 1_980_000)} deltaSub="o'tgan hafta shu kuni" />
          <StatCard label="Bot ulushi" value={pctRaw(38.4)} delta={delta(38.4, 41.2)} deltaSub="o'tgan hafta shu kuni" />
          <StatCard label="Bekor" value={pctRaw(6.1)} delta={delta(6.1, 9.4)} deltaSub="kamaygani — yaxshi" tone="ok" />
        </div>
      </Row>

      <Row title="Tugmalar" note="4 variant · 2 o'lcham · yuklanish holati">
        <div className="a2-row-wrap">
          <Button variant="primary">Asosiy amal</Button>
          <Button>Oddiy</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Bloklash</Button>
          <Button variant="primary" loading>
            Yuklanmoqda
          </Button>
          <Button disabled>O'chirilgan</Button>
        </div>
        <div className="a2-row-wrap">
          <Button size="sm" variant="primary">
            Kichik asosiy
          </Button>
          <Button size="sm">Kichik</Button>
          <Button size="sm" variant="ghost" icon title="Yopish">
            ✕
          </Button>
          <Button size="sm" variant="danger">
            Bekor qilish
          </Button>
        </div>
      </Row>

      <Row title="Badge va holat nuqtalari" note="oltin FAQAT tanga uchun — boshqa hech narsaga">
        <div className="a2-row-wrap">
          {TONES.map((t) => (
            <Badge key={t} tone={t}>
              {t}
            </Badge>
          ))}
        </div>
        <div className="a2-row-wrap">
          <span className="a2-row">
            <Dot tone="ok" live /> <span className="a2-dim">jonli</span>
          </span>
          <span className="a2-row">
            <Dot tone="warn" /> <span className="a2-dim">kutmoqda</span>
          </span>
          <span className="a2-row">
            <Dot tone="bad" /> <span className="a2-dim">muammo</span>
          </span>
          <span className="a2-row">
            <Dot /> <span className="a2-dim">faol emas</span>
          </span>
        </div>
      </Row>

      <Row title="Maydonlar" note="fokus halqasi klaviatura bilan yurishda ko'rinadi (Tab bosib sinang)">
        <div className="a2-grid" style={cssVar({ "--min": "200px" })}>
          <Field label="Qidiruv">
            <SearchInput value={search} onChange={setSearch} placeholder="Ism, telefon, mashina…" />
          </Field>
          <Field label="Matn" hint="Oddiy matn maydoni">
            <Input value={text} onChange={setText} placeholder="Qiymat kiriting" />
          </Field>
          <Field label="Tanlov">
            <Select
              value={sel}
              onChange={setSel}
              options={[
                { value: "all", label: "Hammasi" },
                { value: "client", label: "Mijozlar" },
                { value: "driver", label: "Haydovchilar" },
              ]}
            />
          </Field>
          <Field label="Xato holati" error="Raqam noto'g'ri kiritilgan">
            <Input value="+998 90" onChange={() => undefined} invalid />
          </Field>
        </div>
        <Field label="Ko'p qatorli">
          <Textarea value={area} onChange={setArea} placeholder="Xabar matni…" />
        </Field>
      </Row>

      <Row title="Segmented · Tabs · Sana oralig'i">
        <div className="a2-row-wrap">
          <Segmented
            value={seg}
            onChange={setSeg}
            options={[
              { value: "a", label: "Safarlar" },
              { value: "b", label: "GMV" },
              { value: "c", label: "Bot ulushi" },
            ]}
          />
          <RangePicker value={range} onChange={setRange} />
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "umumiy", label: "Umumiy" },
            { value: "safarlar", label: "Safarlar", badge: 12 },
            { value: "pul", label: "Pul" },
          ]}
        />
      </Row>

      <Row title="Panellar">
        <div className="a2-grid-2">
          <Panel title="Sarlavhali panel" actions={<Button size="sm">Amal</Button>}>
            <p className="a2-dim">Panel — barcha kontentning asosiy idishi.</p>
          </Panel>
          <Panel title="Kalit-qiymat (obyekt-detali)">
            <KV
              rows={[
                { k: "Telefon", v: <span className="a2-row">{phone("998901234567")} <CopyButton value="+998901234567" /></span> },
                { k: "Tanga", v: <Badge tone="coin">{tanga(14190)}</Badge> },
                { k: "Safarlar", v: num(37) },
                { k: "Qo'shilgan", v: dt("2026-06-14T09:12:00Z") },
                { k: "Oxirgi faollik", v: ago(new Date(Date.now() - 42 * 60_000)) },
                { k: "Kutish", v: mins(143) },
              ]}
            />
          </Panel>
        </div>
      </Row>

      <Row title="Yuklanish · bo'sh · xato holatlari" note="har async holatda skeleton MAJBURIY (CLAUDE.md)">
        <div className="a2-grid-2">
          <Panel title="Async primitivi (1.4s skeleton → kontent)">
            <Async data={loadingDemo} empty={{ title: "Hech narsa yo'q" }}>
              {(rows) => (
                <div className="a2-col">
                  {rows.map((r) => (
                    <div key={r} className="a2-dim">
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </Async>
          </Panel>
          <Panel title="Skeleton shakllari">
            <div className="a2-col-3">
              <Skeleton h={26} w="55%" />
              <SkeletonRows rows={3} h={28} />
            </div>
          </Panel>
          <Panel title="Bo'sh holat">
            <Empty
              icon="🔎"
              title="Natija topilmadi"
              sub="Boshqa so'z bilan qidirib ko'ring yoki filtrlarni tozalang."
              action={<Button size="sm">Filtrlarni tozalash</Button>}
            />
          </Panel>
          <Panel title="Xato holati">
            <ErrorState onRetry={() => toast("Qayta urinildi")} />
          </Panel>
        </div>
      </Row>

      <Row title="Modal · Drawer · Toast · Tasdiqlash">
        <div className="a2-row-wrap">
          <Button onClick={() => setModal(true)}>Modal ochish</Button>
          <Button onClick={() => setDrawer(true)}>Drawer (obyekt-detali)</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Buzg'unchi amal
          </Button>
          <Button variant="ghost" onClick={() => toast("Saqlandi", "ok")}>
            Toast: muvaffaqiyat
          </Button>
          <Button variant="ghost" onClick={() => toast("Bajarilmadi — qaytadan urinib ko'ring", "bad")}>
            Toast: xato
          </Button>
        </div>
        <div className="a2-row-wrap">
          <span className="a2-dim">Klaviatura ko'rsatmasi:</span> <Kbd>⌘K</Kbd> <Kbd>Esc</Kbd> <Kbd>↑↓</Kbd>
          <Spinner />
        </div>
      </Row>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Modal sarlavhasi"
        footer={
          <div className="a2-row">
            <div className="a2-spacer" />
            <Button size="sm" onClick={() => setModal(false)}>
              Yopish
            </Button>
            <Button size="sm" variant="primary" onClick={() => setModal(false)}>
              Saqlash
            </Button>
          </div>
        }
      >
        <p className="a2-dim">Esc bosib yoki fonni bosib yopiladi.</p>
      </Modal>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast("Bloklandi", "warn");
        }}
        title="Rostdan bloklaymizmi?"
        body={<p className="a2-dim">Bu foydalanuvchi botdan ham, ilovadan ham foydalanolmaydi.</p>}
        confirmLabel="Bloklash"
        danger
      />

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        head={
          <div className="a2-between">
            <div>
              <h2 className="a2-h2">Sarvarxon Habibov</h2>
              <div className="a2-dim">{phone("998906391026")}</div>
            </div>
            <div className="a2-row">
              <Badge tone="brand">Mijoz</Badge>
              <Button variant="ghost" size="sm" icon onClick={() => setDrawer(false)} title="Yopish (Esc)">
                ✕
              </Button>
            </div>
          </div>
        }
      >
        <div className="a2-col-4">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "umumiy", label: "Umumiy" },
              { value: "safarlar", label: "Safarlar" },
              { value: "pul", label: "Pul" },
            ]}
          />
          <KV
            rows={[
              { k: "Tanga", v: <Badge tone="coin">{tanga(14190)}</Badge> },
              { k: "Safarlar", v: num(37) },
              { k: "Sarflagan", v: som(1_240_000) },
            ]}
          />
          <Panel title="Amallar">
            <div className="a2-row-wrap">
              <Button size="sm" variant="primary">
                🚕 Taksi chaqirish
              </Button>
              <Button size="sm">🪙 Tanga berish</Button>
              <Button size="sm" variant="danger">
                🚫 Bloklash
              </Button>
            </div>
          </Panel>
        </div>
      </Drawer>

      <footer className="kd-foot a2-dim-2">
        Tokenlar: <code className="a2-mono">design/tokens.css</code> · Kit:{" "}
        <code className="a2-mono">design/kit.tsx</code> · Stillar:{" "}
        <code className="a2-mono">design/feat/kit.css</code>
      </footer>
    </div>
  );
}

export function KitDemo() {
  return (
    <ToastHost>
      <DemoInner />
    </ToastHost>
  );
}
