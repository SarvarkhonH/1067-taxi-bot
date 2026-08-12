// 🎮 Koson O'yini vizual-QA — FAQAT `#oyindemo` hash bilan (App.tsx). ShopDemo/RstDemo naqshi:
// Telegram initData-autentifikatsiyasiz HAQIQIY OyinView komponent-daraxtini ko'rish uchun.
// Ega telefonda QABUL uchun ham shu manzil ishlatiladi: https://birjoy.online/#oyindemo
// (flag `oyin` hali yo'q — jonli mijozga hech narsa ko'rinmaydi).
//
// ⚠️ 2026-08-05 (Gashtak boshlig'i redizayni): eski izoh "OyinView to'liq mock-holatda ishlaydi,
// fetch-intercept kerak emas" ESKIRGAN — o'yin endi to'liq backendga ulangan
// (`OyinView`ning ilk qatorlarida `if (!state || !vitrina) return <Skeleton/>` bor), ya'ni
// initData'siz HAMMA so'rov 401 qaytarardi va butun ekran abadiy skeletonda qolardi.
// Shu sababli endi `window.fetch` ni FAQAT shu demo sahifa ichida (module-scope, boshqa
// hech qayerga ta'sir qilmaydi) `/api/oyin/*` yo'llari uchun ushlaymiz — real backend/DB
// kerak emas, HAQIQIY komponent daraxti REAL ko'rinishdagi ma'lumot bilan render bo'ladi.
import { useCallback } from "react";
import { OyinView } from "../oyin";
import type {
  OyinStateResponse, OyinVitrinaResponse, OyinActivityResponse, OyinMyTicketsResponse,
  OyinJamoamResponse, OyinJamoaView, OyinPrizeCardsResponse, OyinCardDetail,
} from "@t1067/shared";

const MOCK_STATE: OyinStateResponse = {
  ball: 4820, rank: 3,
  breakdown: { rides: 3200, phone: 20, referJoin: 0, referFirstRide: 350, referRides: 620, login: 18, share: 0, quest: 120, home: 20, story: 200, streak: 105, sprintBonus: 70, adjust: 0, jamoa: 204, earned: 4820, spent: 0, ball: 4820 },
  sponsor: { name: "BirJoy", photoUrl: null },
  hints: { referComboBall: 175, rideBall: 35, firstRideBall: 100, phoneBall: 20, loginBall: 1, shareBall: 0, referJoinBall: 0, referFirstRideBall: 175, referRideBall: 10, streakBall: 35, storyBall: 100, maxPerPrize: 3 },
  today: { login: true, rides: 1, shared: false, referJoined: false },
  live: { name: "Aziz", ball: 175 },
  lastWinner: { name: "Jasur aka", mahalla: "3-mahalla", prizeName: "Mikroto'lqinli pech", drawnAt: "2026-08-08T12:00:00+05:00", no: 4 },
  week: { streak: 2, target: 3, bonusBall: 35, done: false },
  season: { configured: true, phase: "active", label: "Avgust", startIso: "2026-08-01T00:00:00+05:00", endIso: "2026-09-15T00:00:00+05:00" },
  story: {
    approved: 1, limit: 3, pending: false, ballEach: 100, lastRejectReason: null,
    // 🖼 2026-08-05: 20 ta TAYYOR statik rasm (ega bergan asl dizaynlar).
    posters: Array.from({ length: 20 }, (_, i) => `/posters/${String(i + 1).padStart(2, "0")}.jpg`),
  },
  ticketCount: 2,
  quest: { key: "invite", icon: "🎯", title: "Sovrinni ulashing", hint: "Do'stlaringizga ulashing", ball: 20, done: false },
  homeTask: { ball: 20, done: true },
  soldTotal: 612, capacityTotal: 4000, prizeCount: 20,
  seasonRides: 128, goalPrizeKey: null,
};

const MOCK_VITRINA: OyinVitrinaResponse = {
  sponsor: { name: "BirJoy", photoUrl: null },
  prizes: [
    { key: "p1", icon: "🍳", name: "Nonstick qadoq to'plami", valueLabel: "480 000 so'm", price: 1200, limit: 20, sold: 12, photoUrl: null },
  ] as unknown as OyinVitrinaResponse["prizes"],
};

const MOCK_BELL: OyinActivityResponse = { rows: [], total: 0, page: 1, pageSize: 20 };
// 🎟 2026-08-06: ikkitadan — biri tirajga TAYYOR (`willDraw:true`, bekor tugmasi YO'Q), biri
// HALI YETMAGAN (`willDraw:false`, "bekor qilish" tugmasi ko'rinishi kerak) — QA uchun.
const MOCK_TICKETS: OyinMyTicketsResponse = {
  tickets: [
    { gno: 729480, prizeKey: "p1", prizeName: "Nonstick qadoq to'plami", prizeIcon: "🍳", photoUrl: null, no: 3, at: "2026-08-04T10:00:00.000Z", price: 1200, willDraw: true },
    { gno: 729481, prizeKey: "uzum-iphone-12-4", prizeName: "Apple iPhone 12, 64GB", prizeIcon: "📱", photoUrl: null, no: 1, at: "2026-08-05T09:00:00.000Z", price: 450000, willDraw: false },
  ],
  drawIso: "2026-09-15T00:00:00+05:00",
};
// 👥 Do'stlar ro'yxati — 2026-08-06 QA: username BOR/YO'Q aralash (Turtki/Uyg'ot ikkala yo'lini
// ko'rish uchun), FRIENDS_PAGE (8) dan ko'p a'zo ("ko'proq" tugmasini sinash uchun), turli status.
const MOCK_JAMOAM: OyinJamoamResponse = {
  friends: [
    { memberId: 601, name: "Amir", username: "amir_test", status: "active_today", daysSilent: 0, gainToday: 40, totalBallFromMe: 620, ridesToday: 2, thankedToday: false },
    { memberId: 602, name: "Nodira", username: null, status: "silent", daysSilent: 6, gainToday: 0, totalBallFromMe: 310, ridesToday: 0, thankedToday: false },
    { memberId: 603, name: "Sardor", username: "sardor_dev", status: "never_rode", daysSilent: 0, gainToday: 0, totalBallFromMe: 0, ridesToday: 0, thankedToday: false },
    { memberId: 604, name: "Dilnoza", username: null, status: "silent", daysSilent: 2, gainToday: 0, totalBallFromMe: 80, ridesToday: 0, thankedToday: false },
    { memberId: 605, name: "Jasur", username: "jasur99", status: "silent", daysSilent: 12, gainToday: 0, totalBallFromMe: 940, ridesToday: 0, thankedToday: false },
    { memberId: 606, name: "Malika", username: null, status: "never_rode", daysSilent: 0, gainToday: 0, totalBallFromMe: 0, ridesToday: 0, thankedToday: false },
    { memberId: 607, name: "Bekzod", username: "bekzod_b", status: "silent", daysSilent: 1, gainToday: 0, totalBallFromMe: 40, ridesToday: 0, thankedToday: false },
    { memberId: 608, name: "Zarina", username: null, status: "silent", daysSilent: 4, gainToday: 0, totalBallFromMe: 160, ridesToday: 0, thankedToday: false },
    { memberId: 609, name: "Otabek", username: "otabek_k", status: "never_rode", daysSilent: 0, gainToday: 0, totalBallFromMe: 0, ridesToday: 0, thankedToday: false },
    { memberId: 610, name: "Kamola", username: null, status: "silent", daysSilent: 8, gainToday: 0, totalBallFromMe: 210, ridesToday: 0, thankedToday: false },
  ],
  totalBall: 2360, oneTimeBall: 900, rideBall: 1460,
};

// 🤝 Gashtak — realistik holat: boshliq (SIZ), yana bir haqiqiy a'zo, ikkita 🧪 sinov a'zo
// (turli ism uzunligi — layoutni cho'zib ko'rish uchun), joriy oy uchun ONGLI e'lon (`turnNote`).
const MOCK_JAMOA: OyinJamoaView = {
  minSize: 3, maxSize: 10,
  jamoa: {
    id: "AB3XQ9", name: "Mahalla gashtagi", code: "AB3XQ9",
    inviteLink: "https://t.me/koson1067bot?start=gsk_AB3XQ9",
    createdAt: "2026-06-01T00:00:00.000Z", monthKey: "2026-08",
    ridesThisMonth: 34, ballPerRide: 6, navbatchiBall: 204, maxBall: 3600,
    isMine: false, isLeader: true,
    turnNote: "Sardorga karta uchun",
    members: [
      { memberId: 501, name: "Siz", isLeader: true, isNavbatchi: false, hadTurn: true, turnMonth: "2026-06", joinedAt: "2026-06-01T00:00:00.000Z", ridesThisMonth: 9, ridesLifetime: 41, ballEarnedTotal: 1200, isTest: false },
      { memberId: 502, name: "Sardor Aliyev", isLeader: false, isNavbatchi: true, hadTurn: false, turnMonth: "2026-08", joinedAt: "2026-06-14T00:00:00.000Z", ridesThisMonth: 14, ridesLifetime: 30, ballEarnedTotal: 0, isTest: false },
      // ⚠️ Emoji YO'Q — server ham endi qo'shmaydi (2026-08-05, "🧪 🧪" ikkilanish bugidan
      // keyin), `isTest` yagona manba, JSX o'zi chizadi.
      { memberId: -1001, name: "Test 1", isLeader: false, isNavbatchi: false, hadTurn: false, turnMonth: "2026-09", joinedAt: "2026-08-05T00:00:00.000Z", ridesThisMonth: 6, ridesLifetime: 6, ballEarnedTotal: 0, isTest: true },
      { memberId: -1002, name: "Uzoqroq ism sinovi", isLeader: false, isNavbatchi: false, hadTurn: false, turnMonth: null, joinedAt: "2026-08-05T00:00:00.000Z", ridesThisMonth: 0, ridesLifetime: 0, ballEarnedTotal: 0, isTest: true },
    ],
  },
};

const MOCK_GET: Record<string, unknown> = {
  "/api/oyin/state": MOCK_STATE,
  "/api/oyin/vitrina": MOCK_VITRINA,
  "/api/oyin/jamoam": MOCK_JAMOAM,
  "/api/oyin/jamoa": MOCK_JAMOA,
  "/api/oyin/tickets": MOCK_TICKETS,
};

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

// 🎟 Kartalar panjarasi uchun mock. Ega KO'RISHI kerak bo'lgan uch holat ham bor:
// bo'sh o'rin · boshqa odamning kartasi (ismi bilan) · o'zining kartasi.
const DEMO_NAMES = ["Aziz", "Mehri", "Bekzod", "Dilnoza", "Sardor", "Nodira", "Jamshid", "Zulfiya"];
function mockPrizeCards(key: string): OyinPrizeCardsResponse {
  const p = MOCK_VITRINA.prizes.find((x) => x.key === key) ?? MOCK_VITRINA.prizes[0]!;
  const cards = Array.from({ length: p.limit }, (_, i) => {
    const no = i + 1;
    if (no === 7 || no === 22) return { no, gno: 729470 + no, ownerName: "Sarvarxon", mine: true, at: "2026-08-10T09:12:00.000Z" };
    // Bo'sh o'rinlar ataylab tarqoq — panjara "birinchi N ta sotilgan" bo'lib ko'rinmasin.
    if (no % 3 === 0 || no % 7 === 0) return { no, gno: null, ownerName: null, mine: false, at: null };
    return { no, gno: 729400 + no, ownerName: DEMO_NAMES[no % DEMO_NAMES.length]!, mine: false, at: "2026-08-0" + ((no % 8) + 1) + "T12:00:00.000Z" };
  });
  return {
    prizeKey: p.key, prizeName: p.name, prizeIcon: p.icon, photoUrl: p.photoUrl,
    price: p.price, limit: p.limit, sold: cards.filter((c) => c.ownerName !== null).length,
    minSell: p.minSell, willDraw: p.willDraw, cards,
  };
}
function mockCard(gno: number): OyinCardDetail {
  const mine = gno === 729477 || gno === 729492;
  return {
    gno, no: gno - 729400, prizeKey: MOCK_VITRINA.prizes[0]!.key,
    prizeName: MOCK_VITRINA.prizes[0]!.name, prizeIcon: MOCK_VITRINA.prizes[0]!.icon,
    photoUrl: MOCK_VITRINA.prizes[0]!.photoUrl,
    ownerName: mine ? "Sarvarxon" : DEMO_NAMES[gno % DEMO_NAMES.length]!,
    mine, at: "2026-08-08T14:20:00.000Z",
    // Demo'da natija ko'rsatilmaydi (mavsum hali tugamagan) — «O'yinda» holati chiziladi.
    result: null, drawIso: MOCK_STATE.season?.endIso ?? null,
  };
}

let mockedOnce = false;
function installOyinMock(): void {
  if (mockedOnce) return;
  mockedOnce = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0] ?? "";
    if (path === "/api/oyin/bell") return jsonRes(MOCK_BELL);
    // 🎟 Kartalar panjarasi va karta sahifasi (2026-08-12). Bularsiz demo'da ikkala yangi
    // varaq XATO holatini ko'rsatardi — ya'ni ega ularni QABUL qila olmasdi.
    const cardsM = /^\/api\/oyin\/prize\/([^/]+)\/cards$/.exec(path);
    if (cardsM) return jsonRes(mockPrizeCards(decodeURIComponent(cardsM[1] ?? "")));
    const cardM = /^\/api\/oyin\/card\/(\d+)$/.exec(path);
    if (cardM) return jsonRes(mockCard(Number(cardM[1])));
    if (path in MOCK_GET) return jsonRes(MOCK_GET[path]);
    // 🤝 Gashtak boshliq amallari (kick/add/turn/message/rotate/disband) — demo'da HAQIQIY
    // guruh o'zgarmaydi (backend yo'q), lekin tugma "ishladi" deb javob qaytaradi, shunda
    // interfeys qulflanib qolmaydi (UI oqimini ko'rish uchun yetarli).
    if (path.startsWith("/api/oyin/jamoa/") && (init?.method === "POST")) {
      return jsonRes({ ok: true, view: MOCK_JAMOA });
    }
    return real(input, init);
  };
}

export function OyinDemoPage() {
  installOyinMock();
  // Onboardingni qayta ko'rish: localStorage belgisi o'chiriladi va sahifa yangilanadi.
  const resetOnboard = useCallback(() => {
    try { localStorage.removeItem("oyk_onboard_seen"); } catch { /* ignore */ }
    window.location.reload();
  }, []);
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", position: "relative" }}>
      <OyinView />
      <button
        type="button" onClick={resetOnboard}
        style={{
          position: "fixed", bottom: 8, right: 8, zIndex: 99, fontSize: 10, padding: "6px 8px",
          borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(0,0,0,.6)",
          color: "rgba(255,255,255,.6)", cursor: "pointer",
        }}
      >QA: onboarding qayta</button>
    </div>
  );
}
