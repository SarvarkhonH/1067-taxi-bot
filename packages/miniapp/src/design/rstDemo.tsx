// 🍽 Restoran vizual-QA laboratoriyasi — FAQAT `#rstdemo` hash bilan (App.tsx).
// Sabab shopDemo bilan bir xil: Mini App Telegram initData-autentifikatsiyasini talab qiladi
// (repo'da dev-bypass yo'q), shuning uchun real `RestoranView`ni real API'siz ko'rib bo'lmasdi —
// dizayn ishini (B0…B5) har qadamda KO'RIB tekshirish esa shart. Bu fayl window.fetch'ni faqat
// /api/restoran* yo'llari uchun ushlaydi va HAQIQIY komponent-daraxtni (mock komponentlar EMAS,
// aslida ishlaydigan RestoranView/RestaurantCard/ReviewSection) `restoran-light` qobig'i ichida
// chizadi — ya'ni tokenlar, shrift va tema jonli ilovadagidek qo'llanadi.
//
// Ma'lumot manbai — design_handoff_restoran/data/content.json (dizaynerning V1 seed kontenti).
// U ATAYLAB ishlatiladi: dizayn aynan shu matn uzunliklariga chizilgan, shuning uchun yonma-yon
// solishtirish faqat shu bilan halol bo'ladi. JONLI bazaga bu ma'lumot HECH QACHON yozilmaydi.
import { useMemo, useState } from "react";
import type { FoodOrderView, MenuItemView, MeResponse, RestaurantView } from "@t1067/shared";
import { RestoranView } from "../restoran";
import { Icon } from "../icons";

const REST: RestaurantView[] = [
  { id: 1, name: "Choyxona Bahor", category: "milliy", address: "Ohangaron ko'chasi, 14", workHours: "09:00-22:00", deliveryFeeSom: 8000, minOrderSom: 30000, pickupEnabled: true, prepMinutes: 30, hasPhoto: false, avgRating: 4.8, reviewCount: 212, orderCount: 340 },
  // ⏰ Ataylab 24/7: QA istalgan vaqtda (tunda ham) OCHIQ holatni, [+] tugmasini va savat
  // panelini sinay olishi kerak. Qolgan 5 tasi real ish-vaqti bilan — "Yopiq" holati ular bilan.
  { id: 2, name: "Somsa Baraka", category: "milliy", address: "Bozor yoni", workHours: "00:00-23:59", deliveryFeeSom: 0, minOrderSom: 20000, pickupEnabled: true, prepMinutes: 20, hasPhoto: false, avgRating: 4.9, reviewCount: 318, orderCount: 512 },
  { id: 3, name: "Burger Time", category: "fastfood", address: "Markaziy ko'cha", workHours: "10:00-23:00", deliveryFeeSom: 6000, minOrderSom: 25000, pickupEnabled: true, prepMinutes: 25, hasPhoto: false, avgRating: 4.6, reviewCount: 140, orderCount: 190 },
  { id: 4, name: "Kabob Zarafshon", category: "milliy", address: null, workHours: "11:00-23:00", deliveryFeeSom: 8000, minOrderSom: 40000, pickupEnabled: true, prepMinutes: 35, hasPhoto: false, avgRating: 4.5, reviewCount: 96, orderCount: 88 },
  // Ataylab YOPIQ (ish vaqti tunda tugaydi) — "Yopiq" badge va bloklangan savat shu bilan sinaladi.
  { id: 5, name: "Shirinlik Nasiba", category: "shirinlik", address: null, workHours: "09:00-19:00", deliveryFeeSom: 6000, minOrderSom: 20000, pickupEnabled: false, prepMinutes: 25, hasPhoto: false, avgRating: 4.7, reviewCount: 77, orderCount: 41 },
  // Ataylab REYTINGSIZ (avgRating 0) — yangi restoran holati: yulduz qatori umuman chizilmasligi kerak.
  { id: 6, name: "Coffee Point", category: "ichimlik", address: null, workHours: "08:00-22:00", deliveryFeeSom: 5000, minOrderSom: 15000, pickupEnabled: true, prepMinutes: 15, hasPhoto: false, avgRating: 0, reviewCount: 0, orderCount: 12 },
];

const MENU: Record<number, MenuItemView[]> = {
  1: [
    { id: 101, section: "Asosiy taomlar", name: "Toy oshi", desc: "Qo'y go'shti, sabzi, mayiz · 1 kishilik", priceSom: 28000, hasPhoto: false, available: true },
    { id: 102, section: "Asosiy taomlar", name: "Norin", desc: "Qo'lda kesilgan xamir, qazi", priceSom: 32000, hasPhoto: false, available: true },
    { id: 103, section: "Asosiy taomlar", name: "Shurpa", desc: "Suyakli go'sht, kartoshka, sabzi", priceSom: 25000, hasPhoto: false, available: true },
    { id: 104, section: "Salat va non", name: "Achichuk", desc: "Pomidor, piyoz, ko'k", priceSom: 12000, hasPhoto: false, available: true },
    // Ataylab TUGAGAN — "tugagan" holati va o'chiq [+] tugmasi shu bilan sinaladi.
    { id: 105, section: "Salat va non", name: "Tandir non", desc: "1 dona, issiq", priceSom: 4000, hasPhoto: false, available: false },
    { id: 106, section: "Ichimliklar", name: "Ko'k choy", desc: "1 choynak", priceSom: 4000, hasPhoto: false, available: true },
    { id: 107, section: "Ichimliklar", name: "Coca-Cola 0.5", desc: "Sovuq", priceSom: 10000, hasPhoto: false, available: true },
  ],
  2: [
    { id: 201, section: "Somsalar", name: "Go'shtli somsa", desc: "Tandirdan, 1 dona", priceSom: 6000, hasPhoto: false, available: true },
    { id: 202, section: "Somsalar", name: "Kartoshkali somsa", desc: "1 dona", priceSom: 5000, hasPhoto: false, available: true },
    { id: 203, section: "Somsalar", name: "Varaqi somsa", desc: "Qatlamli, 1 dona", priceSom: 7000, hasPhoto: false, available: true },
    { id: 204, section: "Ichimliklar", name: "Ayron", desc: "0.5 l", priceSom: 7000, hasPhoto: false, available: true },
  ],
  3: [
    { id: 301, section: "Burgerlar", name: "BirJoy Burger", desc: "2 qatlam kotlet, chedar", priceSom: 34000, hasPhoto: false, available: true },
    { id: 302, section: "Burgerlar", name: "Tovuqli burger", desc: "Xamirli tovuq filesi", priceSom: 27000, hasPhoto: false, available: true },
    { id: 303, section: "Qo'shimcha", name: "Fri kartoshka", desc: "O'rtacha", priceSom: 12000, hasPhoto: false, available: true },
    { id: 304, section: "Qo'shimcha", name: "Nagets 6 dona", desc: "Sous bilan", priceSom: 18000, hasPhoto: false, available: true },
  ],
};
const GEN: MenuItemView[] = [
  { id: 901, section: "Mashhur", name: "Kunlik taom", desc: "Oshpaz tanlovi", priceSom: 26000, hasPhoto: false, available: true },
  { id: 902, section: "Mashhur", name: "Ichimlik", desc: "Sovuq", priceSom: 9000, hasPhoto: false, available: true },
];

// Har holat pilli ko'rinsin: jarayonda (bekor qilish tugmasi), rad etilgan (sabab), yetkazilgan
// ("Yana shu"). Bo'sh ro'yxatni ko'rish uchun bu massivni vaqtincha [] qiling.
const ORDERS: FoodOrderView[] = [
  // pending — timeline'ning 0-qadami HALI bajarilmagan holati (operator bog'lanmoqda).
  { id: 1044, restaurantId: 2, restaurantName: "Somsa Baraka", itemsJson: [{ menuItemId: 201, name: "Go'shtli somsa", qty: 4, priceSom: 6000 }], itemsTotalSom: 24000, deliveryFeeSom: 0, totalSom: 24000, isPickup: false, address: "Ohangaron ko'chasi, 14", status: "pending", createdAt: new Date().toISOString() },
  { id: 1043, restaurantId: 1, restaurantName: "Choyxona Bahor", itemsJson: [{ menuItemId: 101, name: "Toy oshi", qty: 3, priceSom: 28000 }], itemsTotalSom: 84000, deliveryFeeSom: 8000, totalSom: 92000, isPickup: false, address: "Ohangaron ko'chasi, 14", status: "preparing", createdAt: new Date().toISOString() },
  { id: 1042, restaurantId: 2, restaurantName: "Somsa Baraka", itemsJson: [{ menuItemId: 201, name: "Go'shtli somsa", qty: 5, priceSom: 6000 }], itemsTotalSom: 30000, deliveryFeeSom: 0, totalSom: 30000, isPickup: true, address: "", status: "delivered", createdAt: new Date().toISOString() },
  { id: 1041, restaurantId: 3, restaurantName: "Burger Time", itemsJson: [{ menuItemId: 301, name: "BirJoy Burger", qty: 1, priceSom: 34000 }], itemsTotalSom: 34000, deliveryFeeSom: 6000, totalSom: 40000, isPickup: false, address: "Markaziy ko'cha 2", status: "rejected", rejectReason: "Restoran band edi", createdAt: new Date().toISOString() },
];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

let installed = false;
function installRstMockFetch(): void {
  if (installed) return;
  installed = true;
  const real = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(location.origin, "");
    // 🔄 Versiya qorovuli (main.tsx) `/version.txt` ni so'raydi va o'zining build-shtampidan
    // farq qilsa sahifani QAYTA YUKLAYDI. Dev serverda shtamplar mos kelmaydi, natijada QA
    // o'rtasida ekran nolga qaytardi (restoran ochilib, darhol katalogga tashlanardi). Bu yerda
    // o'z shtampimizni qaytaramiz → qorovul "yangilik yo'q" deb tinch qoladi. Qorovulning
    // JONLI mantig'iga tegilmaydi — faqat shu QA sahifasida.
    if (path.startsWith("/version.txt")) {
      const mine = document.querySelector('meta[name="birjoy-build"]')?.getAttribute("content") ?? "";
      return new Response(mine, { status: 200, headers: { "content-type": "text/plain" } });
    }
    // Fotolar — 404: fotosiz holat (jonli bazadagi haqiqat) ataylab sinaladi.
    if (path.startsWith("/api/restoran/photo") || path.startsWith("/api/restoran/menuphoto")) return new Response(null, { status: 404 });
    if (path === "/api/restoran/list") return json({ restaurants: REST });
    // `?empty=1` — bo'sh holatlarni ko'rish uchun QA kaliti (bo'sh buyurtmalar ro'yxati).
    // Bo'sh ekranlar eng kam ko'riladigan, eng ko'p unutiladigan holat.
    if (path === "/api/restoran/orders") {
      return json({ orders: new URLSearchParams(location.search).get("empty") === "1" ? [] : ORDERS });
    }
    const detail = /^\/api\/restoran\/(\d+)$/.exec(path);
    if (detail) {
      const id = Number(detail[1]);
      return json({ restaurant: REST.find((r) => r.id === id) ?? null, items: MENU[id] ?? GEN });
    }
    // Diqqat: haqiqiy yo'l `/api/restoran/:id/reviews` (api.ts:229) — teskarisi emas.
    if (/^\/api\/restoran\/\d+\/reviews$/.test(path)) {
      return json({
        avgRating: 4.8, reviewCount: 2, myReview: null,
        reviews: [
          { id: 1, memberId: 5, stars: 5, text: "Osh juda mazali, issiq keldi.", createdAt: new Date().toISOString(), mine: false },
          { id: 2, memberId: 6, stars: 4, text: null, createdAt: new Date().toISOString(), mine: false },
        ],
      });
    }
    return real(input, init);
  }) as typeof window.fetch;
}

function mockMe(): MeResponse {
  return {
    linked: true,
    type: "client",
    metricLabel: "Bonus",
    member: { id: 999999, fullName: "Demo Foydalanuvchi", phone: "+998901234567" },
    stats: { points: 0, trips: 12, rating: 4.9 },
    level: { index: 2, name: "Kumush", emoji: "🥈", color: "#c0c0c0" },
    coins: 12400,
    flags: { restoran: true },
  } as unknown as MeResponse;
}

export function RstDemoPage() {
  installRstMockFetch();
  const me = useMemo(() => mockMe(), []);
  // Eski (amber) temani yonma-yon ko'rish uchun emas — u B0 da o'chdi. Bu tugma dizayndagi
  // «qorong'i rejim» emas, faqat QA uchun qobiqni ko'rsatish/yashirish.
  const [chrome, setChrome] = useState(true);
  return (
    <div className="app restoran-light">
      {chrome && (
        <header className="topbar">
          <div className="brand"><span className="brand-name"><b>Restoran</b></span></div>
          <div className="topbar-right">
            <button className="rst-chip" onClick={() => setChrome((v) => !v)}>QA: qobiqni yashirish</button>
          </div>
        </header>
      )}
      <main className="content">
        <div className="page">
          <RestoranView me={me} onBanner={(m) => console.log("[banner]", m)} openRestaurantId={null} />
        </div>
      </main>
      <nav className="tabbar">
        {[{ icon: "home", label: "Uy" }, { icon: "car", label: "Taksi" }, { icon: "food", label: "Restoran" }, { icon: "user", label: "Profil" }].map((t, i) => (
          <button key={t.label} className={i === 2 ? "tab active" : "tab"}>
            <Icon name={t.icon} filled={i === 2} size={23} />
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
