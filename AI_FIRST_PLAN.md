# AI-FIRST BirJoy — «AI to'liq control» rejasi
*2026-07-23. Ega vizioni: faqat AI, tugmalar to'xtasin, odam so'rasin — AI tushunib qilsin,
kerakli tugmani AI o'zi chaqirsin. Holat: MASLAHAT + TASDIQ KUTMOQDA (hech narsa buzilmagan).*

## Vizion
BirJoy'ning bosh eshigi — AI. Odam yozadi yoki gapiradi → AI tushunadi → o'zi bajaradi YOKI
aynan kerakli tugma/ekranни chiqaradi. Doimiy tugma-menyu yo'qoladi, AI — interfeys.

## MUHIM MASLAHAT (bosh muhandis + dizayner sifatida — halol)
«Faqat AI, tugma UMUMAN yo'q» — bu **xavfli** bo'lishi mumkin:
- Ba'zi odamlar (keksa, texnikaga uncha ko'nikmagan) tugmaга o'rgangan — yozish qiyin
- AI band/o'chib qolsa — odam **qamalib qoladi** (agar tugma umuman bo'lmasa)
- Ba'zi narsa **vizual/interaktiv** (g'ildirak animatsiyasi, xarita, Mini App) — matn-AI buni
  o'ynatib bera olmaydi, faqat **tugma/havola** chiqaradi
- AI xato tushunsa — zaxira bo'lmasa, tupik

**LEKIN sizning o'z gapingiz to'g'ri yechim:** «tugmalarni AI so'rab chaqirib bersin». Ya'ni
tugmalar **yo'qolmaydi** — AI ularni **kerak bo'lganda o'zi chiqaradi** (aynan hozir taksi/ovqатда
qilyapti). Doimiy pastki menyu yo'qoladi, tugma AI-boshqaruvида paydo bo'ladi.

**Tavsiyam: «AI-FIRST + zaxira-to'r», «AI-ONLY» emas.** 99% odam AI bilan ishlaydi (kuchli,
zamonaviy), zaxira-to'r ko'rinmaydi — faqat kerak bo'lganда (AI band / qamalib qolganда / keksa
odam uchun). Bu AI-first hissini susaytirmaydi, lekin hech kimni yo'qotmaydi (Bible: SEVILISH).

## REJA — 3 bosqich

### Bosqich 1 — AI HAMMANI qamrasin (yetishmagan tool'lar)
Hozir AI biladi: taksi · ovqat · usta · bazar · eslatma · balans · hisobot · xotira · bilim.
YETISHMAYDI (tugma ortidagi funksiyalar) — AI'ga tool qo'shiladi:
- 💰 `hamyon` (balans+tarix ekrani/link) · 🎡 `gildirak` (spin tugmasi) · 🎁 `vazifalar`
- 🏆 `reyting` · 👥 `dost_chaqir` (havola) · 🚀 `ilova` (Mini App) · ❓ `yordam` (imkoniyatlar)
Shunda AI HAR narsani so'ralganда chaqira oladi. (agent.ts'ga tool'lar; bot.ts native-handlerни chaqiradi.)

### Bosqich 2 — Doimiy menyu olib tashlash + AI-first tanishuv
- Pastki doimiy tugma-keyboard **olib tashlanadi** (AI-first ko'rinish).
- /start: iliq tanishuv — «Men BirJoy. Shunchaki yozing yoki gapiring — tushunaman. Masalan:
  'uyimga taksi', 'balansim qancha', 'osh buyurtma qil', 'g'ildirak aylantiray'...»
- AI kontekstли inline tugmalarni o'zi chiqaradi (hozirgidek).

### Bosqich 3 — ZAXIRA-TO'R (kritik, tavsiyam)
- Rules-first tez-yo'llar (salom + eng ko'p intent) → LLM'siz, darrov, AI o'lса ham ishlaydi.
- `/menu` HAR DOIM ishlaydi — yashirin «zaxira eshik» (hamma funksiya tugmalar bilan) — qamalib
  qolган yoki tugma yoqtiradigan odam uchun.
- AI band/o'chik → iliq fallback + /menu taklifi.
- Ulanmagan odam → AI telefon-ulashга yo'naltiradi.

## CASE-TAHLIL (aniq o'ylab — ega so'radi)
| Case | AI-first'da nima bo'ladi |
|---|---|
| Odam «taksi» deydi | AI tushunadi → 1-tap tugma chiqaradi ✅ |
| «g'ildirak aylantiray» | AI → spin tugmasi/Mini App chiqaradi (animatsiya o'zi Mini App'da) |
| «balansim qancha» | AI → hamyon-ekrani/xulosasi |
| Keksa odam nima yozishni bilmaydi | /start iliq misollar + «yordam» deса — imkoniyatlar ro'yxati |
| **AI band/o'chik** | Rules-first zaxira (salom/taksi) + «/menu» — QAMALMAYDI ⚠️ eng muhim |
| AI xato tushundi | Aniqlashtiruvchi savol yoki variant beradi (tupik yo'q) |
| Vizual (xarita, animatsiya) | AI matn bilan qila olmaydi → tugma/Mini App chiqaradi |
| Pul (yechish, o'tkazma) | AI o'zi qilmaydi (xavfsizlik) → xavfsiz oqim tugmasini chiqaradi |
| Ulanmagan | AI «raqamingizni ulang» + tugma |
| Ovoz | Allaqachon ishlaydi ✅ |

## Qaror kerak bo'lgan nuqtalar (maslahat)
1. **AI-only mi, AI-first+zaxira mi?** Tavsiyam: AI-first + `/menu` zaxira-eshik (hech kim qamalmaydi).
2. **Bitta tugma qolsinmi?** Bible: yadro «ertalabki taksi». «🚕 Taxi» bitta tugmani qoldirish
   (eng ko'p ishlatiladigan + tezlik) mumkin, yoki uni ham AI'ga bermaymi?
3. **Bosqichma-bosqich mi, birdan mi?** Tavsiyam: avval Bosqich 1 (AI hammani qamrasin) — tugmalar
   hali turadi, xавfsiz sinaymiz; ISHONCH hosil bo'lgach Bosqich 2 (menyuни olib tashlash).
