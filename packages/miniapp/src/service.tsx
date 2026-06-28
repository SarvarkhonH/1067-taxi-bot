// Ravella — to'y xizmati catalog sahifasi
// Rasm, narxlar, telefon raqamni RAVELLA_* konstantalaridan o'zgartiring.

import { haptic } from "./telegram";

const RAVELLA_PHONE = "+998901234567"; // ← RAVELLA telefon raqami
const RAVELLA_WHATSAPP = "998901234567"; // ← WhatsApp (prefiks +998 minus)

const SERVICES: { emoji: string; name: string; desc: string; price: string }[] = [
  { emoji: "🚗", name: "To'y avtomobili", desc: "Mercedes S-klass, lentalar, gul bezaklari bilan", price: "500 000 so'm" },
  { emoji: "💐", name: "Gullar bezak", desc: "Zal, stol, avtomobil uchun professional bezak", price: "800 000 so'm" },
  { emoji: "📸", name: "Foto/video", desc: "2 kameraman, drone, xotira kitobi", price: "1 200 000 so'm" },
  { emoji: "🎵", name: "Musiqa/DJ", desc: "Professional tovush tizimi va DJ xizmati", price: "600 000 so'm" },
  { emoji: "🎂", name: "To'y torti", desc: "Buyurtmaga ko'ra 3-5 qavatli tort", price: "350 000 so'm" },
  { emoji: "🏛", name: "Zal ijarasi", desc: "100-300 kishi sig'adigan zamonaviy zal", price: "2 000 000 so'm" },
];

export function ServiceView({ onBack }: { onBack: () => void }) {
  const call = () => {
    haptic();
    window.open(`tel:${RAVELLA_PHONE}`);
  };
  const whatsapp = () => {
    haptic();
    window.open(`https://wa.me/${RAVELLA_WHATSAPP}?text=${encodeURIComponent("Salom, Ravella xizmatlari haqida so'ramoqchi edim")}`);
  };

  return (
    <div className="view" style={{ background: "var(--bg)", minHeight: "100vh", paddingBottom: 100 }}>
      {/* header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", borderBottom: "1px solid var(--line)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => { haptic(); onBack(); }} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: "var(--accent)" }}>💍 Ravella</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>To'y xizmatlari</div>
        </div>
      </div>

      {/* banner */}
      <div style={{ margin: "16px 16px 0", borderRadius: 16, overflow: "hidden", background: "linear-gradient(135deg, #1a0533, #3d0f6b)", padding: "28px 20px", textAlign: "center", position: "relative" }}>
        <div style={{ fontSize: 48 }}>💍</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 8 }}>Ravella</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>Orzu to'yingizni haqiqatga aylantiring</div>
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={call} style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 24, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>📞 Qo'ng'iroq</button>
          <button onClick={whatsapp} style={{ background: "#25D366", color: "#fff", border: "none", borderRadius: 24, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>💬 WhatsApp</button>
        </div>
      </div>

      {/* services */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Xizmatlar va narxlar</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SERVICES.map((s) => (
            <div key={s.name} style={{ background: "var(--card)", borderRadius: 14, padding: "14px 16px", display: "flex", gap: 14, alignItems: "center", border: "1px solid var(--line)" }}>
              <div style={{ fontSize: 30, flexShrink: 0 }}>{s.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{s.desc}</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "var(--accent)", flexShrink: 0, textAlign: "right" }}>{s.price}</div>
            </div>
          ))}
        </div>
      </div>

      {/* note */}
      <div style={{ margin: "20px 16px 0", background: "var(--card)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--line)" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          💡 Narxlar taxminiy. Aniq narx uchun qo'ng'iroq qiling yoki WhatsApp'ga yozing.<br />
          Barcha xizmatlar buyurtmaga ko'ra va paket shaklida ham mavjud.
        </div>
      </div>

      {/* sticky bottom CTA */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px", background: "var(--bg)", borderTop: "1px solid var(--line)", display: "flex", gap: 10 }}>
        <button onClick={call} style={{ flex: 1, background: "var(--accent)", color: "#000", border: "none", borderRadius: 14, padding: "14px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>📞 Bog'lanish</button>
        <button onClick={whatsapp} style={{ flex: 1, background: "#25D366", color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>💬 WhatsApp</button>
      </div>
    </div>
  );
}
