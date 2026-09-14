# BIRJOY TAXI — QOLGAN ISHLARNING YAGONA REYESTRI

**Oxirgi o'lchov: 2026-09-14** · Manba: `BIRJOY_TAXI_REJA_V3.md` (G0–G6) · `YAKUNIY_AUDIT_2026-09-12.md`
(§2.3, §2.4, §3a/b/c) · `BIRJOY_TAXI_MASTER.md` (F0–F9) · `KAS_PARITET.md` · `docs/TESTING-PLAN.md`
(C1–C7) · `ZANJIRLI_DISPATCH_DOD.md` · `SMS_SHLYUZ_DOD.md` · `ROLLAR_TAKLIF.md`

> **Usul.** Har band **hozirgi kodga qarshi** uchta mustaqil tekshiruvchi agent tomonidan qayta
> o'lchandi (audit ro'yxatlari · kas pariteti · reja darvozalari), har biri `fayl:qator` isboti bilan.
> Hujjatdan ko'chirilgan, lekin qayta o'lchanmagan bironta satr yo'q. Auditning **o'zi ham 6 joyda
> noto'g'ri chiqdi** — §6 ga qarang.

---

## 0. Egangizning uch savoliga qisqa javob

| Savol | Javob |
|---|---|
| **Auditdagi hamma ish bo'ldimi?** | **Yo'q, lekin ko'pi bo'ldi.** 57 banddan **31 bajarildi · 10 qisman · 16 ochiq**. Birinchi real safarni to'sadigan bandlarning deyarli hammasi 09-13/09-14 da yopildi |
| **kas1067 dan qolishmaydigan bo'ldikmi?** | **Hali yo'q — lekin farq torayib, bir tomonga siljidi.** kas oldinda bo'lgan ~22 banddan **9 tasi yopildi, 5 qisman, 10 ochiq**. Dispatch/narx/platformada paritetdamiz yoki oldindamiz; **yo'lovchi tomoni va kas'dan chiqish ko'prigi** tegilmagan |
| **Rejadagi hamma ish bo'ldimi?** | **Yo'q. Yashil darvoza bittasi — G1.** G0 bitta `.env` satri va ikkita sir almashtirishdan uzoqda; G2/G3 kod tomondan deyarli tugagan, **real telefonga** taqaladi; G4/G5/G6 yaqin emas |

**Bitta jumlada:** muhandislik farqi asosan yopildi; qolgani — **ko'prik, hamyon va telefon liniyasi**,
va ular 1956 safar tashiyapti, biz **0 ta to'lovli safar**.

---

## 1. kas1067 PARITETI — kas oldinda bo'lgan bandlar

| Band | Bizda hozir | Qayerda / nima qoldi |
|---|---|---|
| Qorong'i ekranga taklif | ✅ | `OfferAlert.kt` full-screen intent + Android 14 ruxsat satri |
| Yopiq ilovaga push | ✅ **biz oldinda** — kas'da FCM umuman yo'q | Jonli: 750 dan **1 ta** token |
| Qo'lda biriktirish telefonga yetadi | ✅ | socket + FCM push |
| Android 5/6/7 da o'rnatiladi | ❌ | `minSdk = 26` (kas: 21) — ega qarori |
| Real telefonda isbotlangan | 🟡 | Kirish + profil + taklif + qabul ✅; **safarni yakunlash** ❌ |
| Taksi navbati (FIFO) | 🟡 | Dvigatel + dispatch + panel ekrani tayyor; **qorong'i** va `queue_zones` bo'sh |
| Qo'ng'iroqda mijoz kartasi (CTI) | ❌ | Route va popup bor, **ring yuboruvchi yo'q** |
| Pog'onali km tarifi | ✅ | `pricing.tiers` |
| Shahar/qishloq stavkasi | 🟡 | Zona koeffitsienti o'qiladi, ikkala Koson zonasi ×1.00 |
| Tarifni deploysiz o'zgartirish | ✅ | Panel, chegara + audit + manba yorlig'i |
| Kutish narxi | ✅ | Bitta formula |
| **Mijoz cashback hamyoni (so'm)** | ❌ | Ustun ham, ledger ham, route ham **yo'q**. 3 ta ko'prik metodini bloklaydi |
| App vs qo'ng'iroq stavkasi | ❌ | `sourceChannel` yoziladi, **hech kim guruhlamaydi** |
| **Yo'lovchiga SMS** (mashina, raqam, havola) | ❌ | Shlyuzda faqat `test`/`invite` maqsadi bor |
| Haydovchi qarzi maydoni | ❌ | Manfiy balans — de-fakto o'rinbosar |
| Uch qismli qo'shimcha to'lov | ❌ | Bitta yig'ma ustun — ega qarori |
| Kompaniya ma'lumoti (nom, dispetcher raqamlari) | ❌ | Seed, ~1 soat |
| Guvohnoma muddati | 🟡 | Endpoint + panel bor, obzvon ro'yxatiga ulanmagan |
| Rol ajratmasi | ✅ | 35/35 admin kontroller `RolesGuard` bilan |
| Zaxira / tiklash | ✅ | Tungi, shifrlangan, tiklash isbotlangan; **skanlar bugun qo'shildi** |
| Onlayn vaqt o'lchovi | ✅ | |
| Qo'ng'iroq natijasi | ✅ | |
| **kas'dan chiqish ko'prigi (27/27)** | 🟡 **27/27 kod, 0 kun tekshiruv** | `packages/server/src/kas/birjoy.ts` — stub qolmadi (2026-09-14). `KAS_MODE=birjoy` hamon **boot'da rad etiladi**: kod to'liq ≠ ishonchli. Soya rejimi 2026-09-14 15:23 da yoqildi |
| Buzilganda qo'ng'iroq qiladigan odam | ❌ | Tashkiliy |

**Cutover kunida eng og'rig'i uchtasi:** ko'prikning **tekshiruvi** (kod bor, isbot yo'q) ·
cashback hamyoni (umuman yo'q) · telefon kanali (CTI + yo'lovchiga SMS).

**Biz kas'dan oldinda:** FCM push · HTTPS + domen · paneldan jonli tarif · taklif logi va
«rad ≠ javob bermadi» KPI'si · manzilsiz server taksometri · oflayn amal navbati · ilova ichida
ratsiya · xarita/heatmap/TTS · RBAC · mock-GPS + 7 firibgarlik signali · isbotlangan zaxira ·
qutqaruv navbati, ta'minot-qayta-urinishi, to'lqin, zona FIFO (oxirgi ikkitasi qorong'i).

---

## 2. QOLGAN — kod ishi, hech kimdan javob kerak emas

| # | Ish | Kun | Qayerda |
|---|---|---|---|
| ~~K-A~~ | ~~**`BirJoySource` 19 ta stub**~~ → **27/27 yozildi 2026-09-14**. Qolgani kod emas, **vaqt**: 7 kunlik soya taqqoslovi (G6) | 0 | `packages/server/src/kas/birjoy.ts` |
| K-B | **Mijoz cashback hamyoni** — ~~ko'prikni bloklaydi~~ **XATO edi, 2026-09-14 tuzatildi**: `setClientBonus`/`addClientBonus`/`checkClient` botning O'Z daftarida (`grantCoins`/`spendCoins`) hal bo'ladi, B da som-hamyon **kerak emas**. Qolgan haqiqiy kamchilik: **panel operatori mijoz tangasini ko'ra/qo'llay olmaydi** — telefon kanalidagi funksiya kamchiligi, kalit to'sig'i emas | 2 | `birjoy.ts:596-640` |
| K-C | **Soya rejimi** (G6) | 0 kod / **7 kun kalendar** | Qurildi va **jonli yoqildi 2026-09-14 15:23** (`KAS_SHADOW_ENABLED=1`, har 3-o'qish). Qolgani — kutish va hisobotni o'qish |
| K-D | `in_progress` ni qayta biriktirish | 1 | `operator.service.ts` — safar o'rtasida mashina almashtirish **pulni bo'lish** masalasi |
| K-E | Komissiya pog'onasi paneldan | 1 | Tarif naqshini takrorlash |
| K-F | Versiya chegarasi DB'dan (hozir env) | 1 | `drivers.service.ts` |
| K-G | Web test yurgizgichi + birinchi testlar | 3 | `apps/web` da test skripti yo'q (qisman `panel-route-coverage.spec.ts` qoplaydi) |
| K-H | `priorityPosition` API'dan qaytmaydi → ilovadagi navbat pilligi o'lik | 1 | `HomeViewModel.kt:95` |
| K-I | `values-uz-rCyrl` (~70 qattiq matn) | 2 | 45+ yoshli haydovchilar |
| K-J | OEM autostart (Xiaomi/MIUI) | 1 | Qayta yuklangan Xiaomi dispatch'ga ko'rinmaydi |
| K-K | `TZ=Asia/Tashkent` repo konfiguratsiyasida yo'q | 0.2 | Jonli `.env` da **bor**; qayta qurilsa yo'qoladi |
| K-L | `.env.example` da `TELEGRAM_INITDATA_DEV_BYPASS=1` | 0.1 | Jonli'da o'chirilgan, namunada qolgan |
| K-M | `vehicle_classes`, `cancellation_rules`, `queue_zones` seed qilinmagan | 0.5 | Endpointlar `[]` qaytaradi |
| K-N | Kotlin testlari: `BootReceiver`, tanaffus | 1 | Hozir 24 ta test, 4 fayl |
| K-O | Rol jadvali skanerda to'liq emas (7 fragment) | 0.5 | `staff-routes.spec.ts` |

**Jami ≈ 17 muhandis-kun** (K-A 12 kun va K-C 4 kun 2026-09-14 da yopildi), shundan
**hamyon = 5 kun** (kas'dan chiqish uchun) + **7 kun kalendar** soya taqqoslovi.

---

## 3. QOLGAN — egadan javob kerak

| # | Savol | Nimani bloklaydi |
|---|---|---|
| E1 | **Taksi to'xtash nuqtalari** (nom + nuqta + metr) | Zona FIFO — kod tayyor, panel ekrani tayyor, `queue_zones` bo'sh |
| E2 | **5 pilot haydovchi** — 2026-09-14 o'lchovi: bazada **750** haydovchi, **4 tasi ilovani ochgan**, **1 tasida push tokeni bor**, hozir onlayn **0**. APK jonli va yuklab olinadi (200, 3.4 MB) | **Butun G4 + har qanday kanal** |
| E3 | Ekranda push ko'rindimi (bitta tasdiq) | C4 |
| E4 | **APK chiqarilsinmi** | Bugungi ilova tuzatishlari hech bir telefonda yo'q |
| E5 | Bekor qilish jarimasi bormi, qancha | `CancellationService` chaqirilmaydi |
| E6 | Surge yoqilsinmi, `maxSurge` qancha | G0 yopilishi |
| E7/E8 | Bot tokeni va super-admin parolini almashtirish | G0 |
| E9 | Ma'lumot joylashuvi (yurist) | Xavf #2 |
| E10 | Naqd modelda «Yechib olish» nima qiladi | G4 |
| E11 | SMS shlyuzini yoqish | C6, yo'lovchiga SMS |
| E12 | **v3 §1.1–§1.2 dagi 27 band** — o'chirilsinmi / qurilmasinmi | Hech biri bajarilmagan: `apps/client` joyida, haftalik settlement cron qurollangan, `sla`/`surge` bo'sh papkalar, OSRM va route-deviation cron o'lik |
| E13 | Cashback stavkasi: app vs qo'ng'iroq, va ≤350 tanga klampi bilan qanday birlashadi | G6 |

---

## 4. QOLGAN — real telefon yoki real safar kerak (men qila olmayman)

| # | Nima | Nega men qila olmayman |
|---|---|---|
| C2 | Ruxsat oqimi Android 12/13/14 | Har versiyada boshqa dialog |
| C3 | Taklif → qabul → **yakunlash** telefonda | Yagona haqiqiy «ishlaydi» |
| C4 | Ekran o'chiq holda taklif | `fcm_token` ilova o'rnatilmaguncha 0 |
| C5 | Qayta yuklangandan keyin smena | Boot broadcast'ni taqlid qilib bo'lmaydi |
| G4 | Batareya ≤25%/8 soat · 4/5 «yaxshi» · 0 halokat | 5 haydovchi × 8 soat |
| G4 | Pul 3 joyda — **real to'lovli** safarda | 0 ta real safar |
| G5 | Onlayn 16.5 → 40 · rad <12% | O'lchov asboblari tayyor, **vaqt** kerak |
| G6 | Soya rejimi 7 kun · 30 kun orqaga qaytish | Kalendar vaqti |

---

## 5. Darvozalar — G0…G6 (2026-09-14 o'lchovi)

| Darvoza | Holat | Qolgani |
|---|---|---|
| **G0** qon to'xtatish | 🟡 | `.env.example` bypass satri · bot tokeni va parol almashtirish (E7/E8) · surge qarori (E6). **Commitlar push qilingan** |
| **G1** ko'z ochish | 🟢 **YAGONA YASHIL** | Rad sabablari · onlayn vaqt · ertalabki hisobot — hammasi jonli va tekshirilgan |
| **G2** birinchi real safar | 🟡 | Kod tayyor (ruxsat, crash, versiya darvozasi, cleartext yopildi) → **C2 telefonlar** |
| **G3** yetkazish | 🟡 | FCM, overlay, qo'lda biriktirish, «Band», boot — hammasi kodda ✅. Qolgani: **C3/C4 telefonda** + `in_progress` qayta biriktirish |
| **G4** pilot | ⬜ | **E2 (5 haydovchi)** — kodsiz to'siq |
| **G5** ta'minot hujumi | ⬜ | FIFO va to'lqin **qurilgan, qorong'i**; E1 kerak; komissiya paneli (K-E) |
| **G6** kanal + uzilish | 🟡 | Ko'prik 27/27 · **soya rejimi ishlamoqda (boshlandi 2026-09-14)** · hamyon yo'q |

### Soya rejimini o'qish (G6)

Jonli bot 2026-09-14 15:23 dan beri **ikkala manbadan** so'rayapti: javob har doim kas1067 niki,
har 3-o'qish esa `1067-taxi` ga ham yuboriladi va taqqoslanadi. **Yozuvlar ikkilanmaydi.**

```
ssh root@169.58.55.249 'journalctl -u bot1067 --since "7 days ago" | grep "\[shadow\] SUMMARY" | tail -1'   # umumiy hisob
ssh root@169.58.55.249 'journalctl -u bot1067 --since "7 days ago" | grep "\[shadow\] NEW"'                  # har xil farq — har biri BIR MARTA
```

`NEW` qatorlari qisqa bo'lishi kerak: har farq shakli bir marta yoziladi, takrorlari
yarim soatlik `SUMMARY` da faqat sanaladi. O'chirish: `/opt/app/.env` dagi `KAS_SHADOW_*`
uch satrini olib tashlab `systemctl restart bot1067` (zaxira: `.env.bak.shadow.*`).

---

## 6. Auditning O'ZI noto'g'ri chiqqan joylar

1. «`getAvailableDrivers` da status filtri yo'q — bu **bug**» — kod ataylab **rozi emas**: band mashinalar
   ro'yxatda qoladi (qo'lda zanjir haqiqiy asbob), lekin yorliq bilan. **2026-09-14 da server tomonda
   rad etish qo'shildi** — yorliq qorovul emas edi.
2. «15% reyting og'irligi o'lik» — `redistributeRatingWeight` bilan tuzatilgan; konstanta hali `0.15`
   ko'rinadi, chunki ish vaqtida qayta taqsimlanadi.
3. «`deviceModel` hech qachon to'lmaydi» — to'ladi (`DeviceInfo.kt`).
4. «P0-4: zona va vaqt ko'paytirgichi qotib qolgan 1.0» — tuzatilgan, buyurtmaga qotiriladi.
5. «Kotlin'da 0 test» — hozir **24 test, 4 fayl**.
6. «`/api/health` baza o'lik bo'lsa ham 200» — endi **503**.

---

*Har «0 / hammasi / hech kim» da'vosi buyruq+natija bilan o'lchangan (CLAUDE.md R3).
«Done» — faqat ega qabul qilgandan keyin (R1/R7).*
