// 🎀 RAVELLA admin (RAVELLA_PLAN §5) — EGA shu yerda: kategoriya ochadi, bezak qo'shadi (nom +
// narx + RASM), har bezakka qo'shimcha qo'shadi (nom + qo'shiladigan narx + "qo'shilgan holat"
// RASMI — mijoz `+` bosganda konstruktordagi katta rasm aynan shunga o'tadi), hamkor chat-id'sini
// yozadi va buyurtma navbatini boshqaradi. Pul-mantiq bu yerda YO'Q — hammasi serverda.
import { useEffect, useState } from "react";
import type { AdminRavellaAddonRow, AdminRavellaCategoryRow, AdminRavellaItemRow, AdminRavellaOrderRow } from "@t1067/shared";
import { adminApi } from "./api";

const som = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ");

/** Fayl tanlash → base64 → yuklash (restoran/driver-photo bilan bir xil quvur). */
function pickPhoto(onPicked: (mime: string, base64: string) => Promise<void>): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const base64 = await new Promise<string>((res) => {
      const rd = new FileReader();
      rd.onload = () => res(String(rd.result).split(",")[1] ?? "");
      rd.readAsDataURL(f);
    });
    await onPicked(f.type || "image/jpeg", base64);
  };
  input.click();
}

export function RavellaAdminView() {
  const [data, setData] = useState<{
    enabled: boolean; partnerChatId: string | null;
    categories: AdminRavellaCategoryRow[]; items: AdminRavellaItemRow[]; addons: AdminRavellaAddonRow[];
  } | null>(null);
  const [orders, setOrders] = useState<AdminRavellaOrderRow[]>([]);
  const [msg, setMsg] = useState("");
  const [photoV, setPhotoV] = useState(0); // rasm yangilangach <img> keshini buzish uchun
  const [openItem, setOpenItem] = useState<number | null>(null);

  // yangi-yozuv formalari
  const [catName, setCatName] = useState("");
  const [catEmoji, setCatEmoji] = useState("🎀");
  const [itemForm, setItemForm] = useState<{ categoryId: number | null; name: string; price: string; desc: string }>({ categoryId: null, name: "", price: "", desc: "" });
  const [addonForm, setAddonForm] = useState<{ name: string; price: string; maxQty: string }>({ name: "", price: "", maxQty: "5" });
  const [chatId, setChatId] = useState("");

  const load = () => {
    adminApi.ravellaAll().then((d) => { setData(d); setChatId(d.partnerChatId ?? ""); }).catch(() => undefined);
    adminApi.ravellaOrders().then((r) => setOrders(r.orders)).catch(() => undefined);
  };
  useEffect(load, []);
  useEffect(() => {
    const iv = setInterval(() => adminApi.ravellaOrders().then((r) => setOrders(r.orders)).catch(() => undefined), 15000);
    return () => clearInterval(iv);
  }, []);

  if (!data) return <div className="card">Yuklanmoqda…</div>;

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  const addCategory = async () => {
    if (!catName.trim()) return;
    await adminApi.ravellaCategoryCreate({ name: catName.trim(), emoji: catEmoji.trim() || "🎀" }).catch(() => undefined);
    setCatName("");
    flash("✅ Kategoriya qo'shildi");
    load();
  };

  const addItem = async () => {
    const price = Number(itemForm.price.replace(/\s/g, ""));
    if (!itemForm.categoryId || !itemForm.name.trim() || !Number.isFinite(price)) { flash("❌ Kategoriya, nom va narx kerak"); return; }
    const r = await adminApi.ravellaItemCreate({ categoryId: itemForm.categoryId, name: itemForm.name.trim(), basePriceSom: price, desc: itemForm.desc.trim() || undefined }).catch(() => null);
    if (!r?.ok) { flash("❌ Qo'shilmadi"); return; }
    setItemForm({ categoryId: itemForm.categoryId, name: "", price: "", desc: "" });
    flash("✅ Bezak qo'shildi — endi RASM yuklang va «Yoqish»ni bosing");
    load();
  };

  const addAddon = async (itemId: number) => {
    const price = Number(addonForm.price.replace(/\s/g, ""));
    if (!addonForm.name.trim() || !Number.isFinite(price)) { flash("❌ Nom va narx kerak"); return; }
    const r = await adminApi.ravellaAddonCreate({ itemId, name: addonForm.name.trim(), priceSom: price, maxQty: Number(addonForm.maxQty) || 5 }).catch(() => null);
    if (!r?.ok) { flash("❌ Qo'shilmadi"); return; }
    setAddonForm({ name: "", price: "", maxQty: "5" });
    flash("✅ Qo'shimcha qo'shildi — «qo'shilgan holat» RASMINI yuklang");
    load();
  };

  const uploadItemPhoto = (id: number) => pickPhoto(async (mime, base64) => {
    const r = await adminApi.ravellaItemPhoto(id, mime, base64).catch(() => ({ ok: false }));
    flash(r.ok ? "✅ Rasm yuklandi" : "❌ Rasm yuklanmadi");
    setPhotoV((v) => v + 1);
    load();
  });

  const uploadAddonPhoto = (id: number) => pickPhoto(async (mime, base64) => {
    const r = await adminApi.ravellaAddonPhoto(id, mime, base64).catch(() => ({ ok: false }));
    flash(r.ok ? "✅ Rasm yuklandi" : "❌ Rasm yuklanmadi");
    setPhotoV((v) => v + 1);
    load();
  });

  const act = async (o: AdminRavellaOrderRow, action: "accept" | "call" | "done" | "reject") => {
    const reason = action === "reject" ? window.prompt("Rad etish sababi:") ?? "" : undefined;
    if (action === "reject" && !reason) return;
    const r = await adminApi.ravellaOrderAction(o.id, action, reason)
      .catch(() => ({ ok: false, reason: "xato", cashbackSom: undefined } as { ok: boolean; reason?: string; cashbackSom?: number }));
    flash(r.ok ? (r.cashbackSom ? `✅ Bajarildi — mijozga +${som(r.cashbackSom)} tanga` : "✅ Bajarildi") : `❌ ${r.reason ?? "o'tmadi"}`);
    load();
  };

  const live = orders.filter((o) => ["pending", "accepted", "called"].includes(o.status));

  return (
    <>
      {msg && <div className="card" style={{ background: "#132" }}>{msg}</div>}

      <div className="card">
        <h3>🎀 Ravella — holat</h3>
        <p className="muted">
          Xizmat: <b>{data.enabled ? "🟢 JONLI" : "🌑 DARK (faqat siz ko'rasiz)"}</b> ·
          {" "}Bezaklar: <b>{data.items.length}</b> ({data.items.filter((i) => i.active).length} yoqilgan) ·
          {" "}Qo'shimchalar: <b>{data.addons.length}</b>
        </p>
        <p className="muted">
          Hamkorlarning Telegram chat-id'lari — buyurtma kartalari shu chatlarga tushadi. Bir nechta
          bo'lsa VERGUL bilan yozing (masalan <code>159391041,7019500305</code>). Bo'sh bo'lsa faqat
          egaga boradi. (Hamkor avval botga <code>/start</code> bossin.)
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="159391041,7019500305" />
          <button onClick={async () => {
            const r = await adminApi.ravellaPartnerChat(chatId.trim()).catch(() => ({ ok: false }));
            flash(r.ok ? "✅ Saqlandi" : "❌ Faqat raqam va vergul (bittasi noto'g'ri bo'lsa hech biri saqlanmaydi)");
            load();
          }}>Saqlash</button>
        </div>
      </div>

      <div className="card">
        <h3>📦 Buyurtmalar {live.length > 0 && <span className="pill">{live.length} ochiq</span>}</h3>
        {orders.length === 0 ? (
          <p className="muted">Hali buyurtma yo'q.</p>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Bezak</th><th>Mijoz</th><th>Summa</th><th>Holat</th><th>Amal</th></tr></thead>
            <tbody>
              {orders.slice(0, 60).map((o) => (
                <tr key={o.id} style={o.status === "pending" && o.ageMinutes > 15 ? { background: "rgba(255,80,80,.12)" } : undefined}>
                  <td>{o.id}</td>
                  <td>
                    {o.itemName}
                    {o.addons.length > 0 && <div className="muted" style={{ fontSize: 11 }}>{o.addons.map((a) => `${a.name} ×${a.qty}`).join(", ")}</div>}
                    {o.eventDate && <div className="muted" style={{ fontSize: 11 }}>📅 {o.eventDate}</div>}
                  </td>
                  <td>{o.buyerName}<div className="muted" style={{ fontSize: 11 }}>{o.contact}</div><div className="muted" style={{ fontSize: 11 }}>{o.address}</div></td>
                  <td>
                    {som(o.totalSom)}
                    {o.discountSom > 0 && <div className="muted" style={{ fontSize: 11 }}>−{som(o.discountSom)} (Ravella)</div>}
                    {o.cashbackSom > 0 && <div className="muted" style={{ fontSize: 11 }}>🪙 +{som(o.cashbackSom)}</div>}
                  </td>
                  <td>{o.status}{o.status === "pending" && <div className="muted" style={{ fontSize: 11 }}>{o.ageMinutes} daq</div>}</td>
                  <td>
                    {o.status === "pending" && <button onClick={() => act(o, "accept")}>✅</button>}
                    {["pending", "accepted"].includes(o.status) && <button onClick={() => act(o, "call")}>☎️</button>}
                    {["accepted", "called"].includes(o.status) && <button onClick={() => act(o, "done")}>✔</button>}
                    {["pending", "accepted", "called"].includes(o.status) && <button onClick={() => act(o, "reject")}>❌</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>🗂 Kategoriyalar</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input style={{ width: 60 }} value={catEmoji} onChange={(e) => setCatEmoji(e.target.value)} placeholder="🎭" />
          <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Saxna bezaklari" />
          <button onClick={addCategory}>➕ Qo'shish</button>
        </div>
        {data.categories.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #222" }}>
            <span>{c.emoji} <b>{c.name}</b></span>
            <span className="muted">{c.itemCount} bezak</span>
            <button style={{ marginLeft: "auto" }} onClick={async () => { await adminApi.ravellaCategoryEdit(c.id, { active: !c.active }); load(); }}>
              {c.active ? "🟢 Ko'rinadi" : "⚪ Yashirin"}
            </button>
            <button onClick={async () => {
              if (!window.confirm(`"${c.name}" va ICHIDAGI HAMMA bezak o'chirilsinmi? (buyurtma tarixi saqlanadi)`)) return;
              await adminApi.ravellaCategoryDelete(c.id).catch(() => undefined);
              load();
            }}>🗑</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>🎭 Bezak qo'shish</h3>
        <p className="muted">Avval yozuv/bezak nomi va NARXI. Qo'shilgach — rasm yuklaysiz, keyin «Yoqish».</p>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <select value={itemForm.categoryId ?? ""} onChange={(e) => setItemForm({ ...itemForm, categoryId: Number(e.target.value) || null })}>
            <option value="">— kategoriya —</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
          <input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="«Onajon» yozuvi" />
          <input value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} placeholder="Narxi: 100000" inputMode="numeric" />
          <input value={itemForm.desc} onChange={(e) => setItemForm({ ...itemForm, desc: e.target.value })} placeholder="Tavsif (ixtiyoriy)" />
        </div>
        <button style={{ marginTop: 8 }} onClick={addItem}>➕ Bezak qo'shish</button>
      </div>

      {data.categories.map((c) => {
        const items = data.items.filter((i) => i.categoryId === c.id);
        if (!items.length) return null;
        return (
          <div className="card" key={`cat-${c.id}`}>
            <h3>{c.emoji} {c.name}</h3>
            {items.map((it) => {
              const addons = data.addons.filter((a) => a.itemId === it.id);
              const open = openItem === it.id;
              return (
                <div key={it.id} style={{ borderTop: "1px solid #222", padding: "10px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {it.hasPhoto
                      ? <img src={`${adminApi.ravellaItemPhotoUrl(it.id)}?v=${photoV}`} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 10 }} />
                      : <div style={{ width: 54, height: 54, borderRadius: 10, background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>🎀</div>}
                    <div style={{ flex: 1 }}>
                      <b>{it.name}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{som(it.basePriceSom)} so'm · {addons.length} qo'shimcha · {it.orderCount} buyurtma</div>
                    </div>
                    <button onClick={() => uploadItemPhoto(it.id)}>🖼 Rasm</button>
                    <button onClick={async () => { await adminApi.ravellaItemEdit(it.id, { active: !it.active }); load(); }}>
                      {it.active ? "🟢 Yoqilgan" : "⚪ Yoqish"}
                    </button>
                    <button onClick={() => setOpenItem(open ? null : it.id)}>{open ? "▲" : "▼ Qo'shimchalar"}</button>
                    <button onClick={async () => {
                      if (!window.confirm(`"${it.name}" o'chirilsinmi?`)) return;
                      await adminApi.ravellaItemDelete(it.id).catch(() => undefined);
                      load();
                    }}>🗑</button>
                  </div>

                  {open && (
                    <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: "2px solid #333" }}>
                      <p className="muted" style={{ fontSize: 12 }}>
                        Qo'shimchaning RASMI = mijoz uni qo'shganda katta ekranda chiqadigan rasm
                        (masalan «salyut qo'shilgan» holat). Rasm yuklanmasa — asosiy rasm qoladi.
                      </p>
                      {addons.map((a) => (
                        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                          {a.hasPhoto
                            ? <img src={`${adminApi.ravellaAddonPhotoUrl(a.id)}?v=${photoV}`} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8 }} />
                            : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>✨</div>}
                          <span style={{ flex: 1 }}>{a.name} <span className="muted">+{som(a.priceSom)} so'm · max {a.maxQty}</span></span>
                          <button onClick={() => uploadAddonPhoto(a.id)}>🖼 Rasm</button>
                          <button onClick={async () => { await adminApi.ravellaAddonEdit(a.id, { active: !a.active }); load(); }}>{a.active ? "🟢" : "⚪"}</button>
                          <button onClick={async () => {
                            if (!window.confirm(`"${a.name}" o'chirilsinmi?`)) return;
                            await adminApi.ravellaAddonDelete(a.id).catch(() => undefined);
                            load();
                          }}>🗑</button>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input value={addonForm.name} onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })} placeholder="Salyut" />
                        <input style={{ width: 110 }} value={addonForm.price} onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })} placeholder="+150000" inputMode="numeric" />
                        <input style={{ width: 70 }} value={addonForm.maxQty} onChange={(e) => setAddonForm({ ...addonForm, maxQty: e.target.value })} placeholder="max" inputMode="numeric" />
                        <button onClick={() => addAddon(it.id)}>➕</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
