# KOSON O'YINI — QURILISH REJASI + DoD (ega tasdig'ini kutadi)
*2026-08-02 · Manba: KOSON_OYIN_PLAN.md v9.2 · Holat: **not started** — kod yozilmagan.
CLAUDE.md §2: reja + DoD ega TASDIG'idan keyin kod boshlanadi.*

---

## 0. NIMA QURILADI (qisqacha)

Miniapp prototipi tayyor (`#oyindemo`, ✅ tekshirilgan). Endi 4 ta yetishmayotgan qatlam:
**(A) admin nazorat markazi** (ega talabi — ball qiymatlari + kim-nima-qildi jadvali + homiy),
**(B) server yuragi** (ball hisobi, chipta, limit), **(C) miniapp yetishmagan 6 holat**,
**(D) uy-ekranga kirish kartasi**.

**Schema o'zgarishi YO'Q · yangi poller YO'Q · flag `oyin` DEFAULT_OFF (qorong'i).**

---

## 1. BOSQICHLAR (shu tartibda — har biri mustaqil tekshiriladi)

### B1 — Knoblar + Homiy (eng arzon, mustaqil)
| Fayl | O'zgarish |
|---|---|
| `packages/shared/src/economy.ts` | `BONUS_ECON_KNOBS` massiviga `group: "Koson O'yini"` ostida ~12 knob: safar 30 · birinchi-safar 80 · telefon 20 · do'st-ulash 40 · do'st-birinchi-safar 120 · **do'st-har-safar 10** · kunlik-kirish 2 · ulashish 5 · hikoya-isbot 100 · sprint-bonus 100 · chipta-narxlari (5 ta sovrin) · chipta-limitlari (5 ta) |
| `packages/server/src/services/sponsorService.ts` (yangi ~40 satr) | `AppState` kaliti `sponsor:current` = `{name, photoUrl?, photoFileId?, active}`; o'qishda BirJoy-fallback. Naqsh: `RavellaItem` ikki-manbali rasm (`ravellaService.ts:423,457,470`) |
| `packages/server/src/api/server.ts` | `GET/POST /api/admin/oyin/sponsor` |
| `packages/admin/src/App.tsx` + `api.ts` | Homiy kartochkasi (nom + rasm URL/yuklama + yoqish). **Knoblar uchun admin-kod YOZILMAYDI** — `ControlCards()` (App.tsx:749-778) massivdan avtomatik chizadi |

**Isbot:** knob paneldan o'zgartirilsa `GET /api/admin/bonus-economy` yangi qiymat qaytaradi; homiy
sozlanmaganda API `"BirJoy"` qaytaradi.

### B2 — Server yuragi (dark)
| Fayl | O'zgarish |
|---|---|
| `packages/shared/src/oyin.ts` (yangi) | Sovrin-katalog tiplari, `OyinState`/`OyinVitrina`/`OyinBoard` javob-tiplari (miniapp props aynan shundan) |
| `packages/server/src/services/oyinService.ts` (yangi ~500 satr) | `getBall(memberId)` = **earned − spent** (earned: `RideReward`+`Referral`+`TelegramUser`+login-mask, 60s kesh, Toshkent `dayKey`; spent: `AppState oyin:spent:<id>`) · `buyTicket(prizeId)` — **`withMemberLock` + idempotent kalit + N-limit reserve→tekshir→rollback** (`economyService.ts` `consumeWithdrawBudget` naqshi) · `getBoard()` · `getVitrina()` · `drawExport()` · `sprintCheck()`/`seasonClose()` — idempotent markerlar, ega/xodim CHETDA |
| `packages/server/src/api/server.ts` | `GET /api/oyin/{state,vitrina,board,jamoam}` · `POST /api/oyin/{ticket,share}` |
| `packages/server/src/services/bookingNotifier.ts` | `:685-707` mavjud do'st-safar bloki yonida: taklifchiga **+10** (idempotent `bookingId` kalit) + safar-kartasiga "🤝 Azizga ham +10" qatori + push (`notifyOnce`, bir do'st = kuniga max 1) |
| `packages/server/src/services/featureFlags.ts` | `oyin` DEFAULT_OFF |

### B3 — Admin faoliyat-jadvali (B2 dan KEYIN — ma'lumot bo'lishi kerak)
| Fayl | O'zgarish |
|---|---|
| `packages/server/src/api/server.ts` | `GET /api/admin/oyin/activity?memberId=&action=&from=&to=&page=` — `CoinTxn` (`schema.prisma:327-341`) dan sahifalangan ro'yxat + `groupBy` jamlama |
| `packages/admin/src/App.tsx` + `api.ts` | Yangi "🎮 Koson O'yini" tab: sana · a'zo (ism+telefon) · harakat turi · ball · **kimga yordam berdi** (yordam-zanjiri juftligi) · filtrlar · kunlik jamlama |

**Nega yangi:** bugun `CoinTxn`ni ko'rsatadigan HECH QANDAY admin ekrani yo'q (tekshirildi — Jurnal
tabi eski `RewardGrant`ni, `AdminAuditLog` faqat do'kon-tahrirni o'qiydi).

### B4 — Miniapp: yetishmagan 6 holat + serverga ulash
- Qolgan chipta soni **aniq raqam** ("24/30 band — 6 ta qoldi") · "❌ Bu oy yakunlandi" holati ·
  skeleton · 0-ball yangi odam · final-48 (qizil/muzlagan) · mavsum yakuni (konvertatsiya xulosasi)
- Mock holat → `OyinState` props; homiy serverdan (BirJoy-fallback bilan)
- Matn aniqligi: "Jami: 313" → "313 chipta sotilgan · 6 o'rin qoldi"; "Imkoning: —" → "Chipta olsang
  imkoning paydo bo'ladi"

### B5 — Uy-ekran kartasi
`uy.tsx` — taksi CTA'dan KEYIN, `me.flags?.oyin` bilan gated compact karta (ball + o'rin +
countdown + 2 tugma).

---

## 2. DoD — har satr buyruq+natija bilan isbotlanadi

**Builder HECH QACHON "done" demaydi — faqat "READY FOR VERIFICATION" + isbot.**

| # | Qabul mezoni | Tekshiruv |
|---|---|---|
| D1 | Flag OFF = mijoz UI'da hech narsa yo'q | jonli bundle grep + flag OFF da real render |
| D2 | Ball hisobi 3 real a'zo uchun psql qo'lda = API javobi | psql + curl solishtirish |
| D3 | Safar-ball CHEKSIZ (kunlik cap yo'q) | 10 ketma-ket safar → 10× ball |
| D4 | Do'st-ball 3 manba: 40 (1×) + 120 (1×) + **10 (har safar, idempotent `bookingId`)** | psql: bir safar = bitta +10 |
| D5 | Chipta: idempotent, parallel 2 so'rov → 1 chipta, N-limit HECH QACHON oshmaydi | race-test (10 parallel so'rov) |
| D6 | Limit to'lganda "❌ Bu oy yakunlandi" + xarid rad | curl + render |
| D7 | Yangi poller/schema diff YO'Q | `git diff` da `setInterval`/`schema.prisma` yo'q |
| D8 | Push: bir do'st = kuniga max 1 | `notifyOnce` kaliti bilan takroriy chaqiruv |
| D9 | Ega/xodim: chipta rad, sprint/top-3/tiraj ro'yxatlarida yo'q | ega akkaunti bilan urinish |
| D10 | **Knob:** panelda son o'zgartirilsa 60s ichida API javobi yangilanadi | panel → curl |
| D11 | **Admin jadval:** 3 xil harakat turi to'g'ri (kim/nima/qancha/qachon/kimga yordam) | real ma'lumot bilan skrinshot |
| D12 | **Homiy:** sozlanmaganda "BirJoy"; admin o'rnatgach darhol almashadi | 2 holat render |
| D13 | Emissiyalar ≤350-clamp TASHQARI, o'z markerlari bilan; jami bitta SELECT'da | psql |
| D14 | `oyin:`/`sponsor:` prefikslari AppState tozalash ro'yxatlarida YO'Q | grep isbot |
| D15 | Flag ON dan keyin **REAL MIJOZ akkauntida** ko'rinadi (ega-preview EMAS) | mijoz telefonida render |
| D16 | Vitrina: qolgan chipta ANIQ raqam + "ishtirok, g'alaba emas" har kartada | render + grep |
| D17 | Har async holatda skeleton, <100ms tap-javob, `prefers-reduced-motion` | render + kod |

**Tekshiruv READ-ONLY:** real mijozga test-xabar YUBORILMAYDI. Mustaqil tekshiruv (kodni yozmagan
sub-agent) har D-satrni `file:line`+natija bilan qayta isbotlaydi → keyin "READY" → ega telefonda
QABUL → flag ON.

---

## 3. XAVFLAR
1. **`bookingNotifier` — eng nozik joy** (jonli sweep, pul beradi). Yangi kod TRY ichida, xato
   bo'lsa safar-oqimi buzilmaydi.
2. **N-limit poyga (race)** — 2 odam oxirgi chiptani bir vaqtda olsa. Yechim: atomik
   reserve→rollback (mavjud withdraw-byudjet naqshi), D5 da 10-parallel test bilan isbot.
3. **Kesh vs knob** — knob o'zgarsa 60s kesh eskirgan qiymat berishi mumkin (D10 shuni o'lchaydi).
4. **Admin jadval hajmi** — `CoinTxn` katta jadval; sahifalash + indeks (`[memberId, createdAt]`
   mavjud) majburiy.

## 4. EGA TASDIG'I KERAK
- [ ] Bosqich tartibi B1→B5 ma'qulmi?
- [ ] Hikoya-isbot tasdig'i: Telegram-tugma (tavsiya, kod deyarli tayyor) yoki + web-admin ro'yxat?
- [ ] B1 dan boshlaymanmi (knoblar + homiy — bir kunlik, mustaqil, xavfsiz)?

*Tasdiq kelgach shu hujjat "in progress" ga o'tadi va har bosqich yopilishida D-satrlar isbot bilan
to'ldiriladi (PROGRESS.md literal-haqiqat qoidasi).*
