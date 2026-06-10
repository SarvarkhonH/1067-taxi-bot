# 1067 Super-App — Qilingan ishlar hujjati

_Yangilangan: 2026-06-10_

Bu hujjat — botda real qilingan ishlar ro'yxati. Har bir punkt **deploy qilingan va jonli**.

---

## 🌐 Jonli tizim (hozir internetда ishlayapti)

| Qism | Manzil | Holat |
|---|---|---|
| 🤖 Bot | [@koson1067bot](https://t.me/koson1067bot) | ✅ 24/7 (Render, webhook) |
| 📱 Mini App | https://1067taxi-miniapp.vercel.app | ✅ HTTPS (Vercel) |
| ⚙️ Backend API | https://kas1067-taxi-bot.onrender.com | ✅ Render |
| 💻 Kod | github.com/SarvarkhonH/1067-taxi-bot | ✅ |

Hajm: **12 commit · 67 fayl · ~4200 satr kod.**

---

## 🎮 Funksiyalar + psixologiya (sizning yozuvingizga bog'langan)

### 🔥 Kunlik streak
Har kun botga kir → streak o'sadi → 3/7/14/30/100-kunda real cashback (500…60000 so'm).
- **Cialdini: Commitment & Consistency** — bir marta boshlagan davom etadi.
- **Kahneman: Loss aversion** — streak uzilishi qo'rquvi qaytaradi.
- **Goal-gradient** — keyingi milestone'ga progress.

### 🎡 Omad g'ildiragi
Kunlik 1 marta aylantir → tasodifiy real so'm (100…JACKPOT 5000). Mini App'da animatsiya bilan aylanadi.
- **Variable-ratio reinforcement (slot-mashina)** — eng addictive mexanika.
- **Kahneman: Prospect theory** — kichik ehtimol katta yutuq ortiqcha baholanadi.

### 💰 Real cashback (kas1067'ga yoziladi)
Yutuqlar haqiqiy pulга aylanib, mijoz bonusiga qo'shiladi (`1303` kodi). Audit + idempotent + kunlik cap.
- **Cialdini: Reciprocity** — pul olgan qaytarishga (yana safar) moyil.
- **Kahneman: Endowment + Sunk cost** — to'plangan balans "meniki", tashlab ketilmaydi.

### 🚖 Booking + real-time kuzatuv
Botdan taxi chaqir → "qidirilyapti → haydovchi tayinlandi → yetib keldi → yakunlandi" avtomatik push → oxirida cashback.
- **Kahneman: Peak-end rule** — safar cashback bilan tugaydi (eng yaxshi xotira).

### 🎯 Topshiriqlar (YANGI)
Kunlik (kirib chiqing / g'ildirak / 1 safar) + haftalik (5 safar / do'st taklif). Har birida progress bar, tugaganda **real cashback** "Olish" tugmasi. Botda inline tugma, Mini App'da alohida tab.
- **Cialdini: Scarcity** — kunlik/haftalik reset → shoshilinch.
- **Kahneman: Goal-gradient** — progress bar marraga tortadi.
- **Octalysis: Accomplishment** — har vazifa = yutuq hissi.

### 👥 Do'st taklif — double-sided (YANGI)
Har taklif uchun **ikkalangiz ham** pul olasiz: siz +3000, do'stingiz +2000 so'm. Shaxsiy havola (`?start=ref_KOD`), do'st raqamini ulaganda **avtomatik to'lov**. O'zini taklif qilish bloklangan, bir martalik.
- **Cialdini: Liking + Reciprocity** — tanish odamdan kelgan taklif kuchli.
- **k-faktor** — har user yangi userlar olib keladi (viral o'sish).

### 🎁 Sirli quti — "mukammal kun" mukofoti (YANGI)
Barcha 3 kunlik vazifani bajaring → quti ochiladi → **500…10 000 so'm** tasodifiy real cashback (kuniga 1 marta). Botda vazifalar ichida inline tugma, Mini App'da animatsiyali karta.
- **Octalysis: Unpredictability** — eng addictive drayv.
- **Compulsion meta-loop** — vazifalar tugashi o'z-o'zidan maqsadga aylanadi.

### 🗄 Doimiy baza — Postgres (YANGI, kritik)
Avval har deploy'da SQLite o'chib, streak/bog'lanish/referral nolga tushardi (loss-aversion psixologiyasini o'ldiradi). Endi **Render Postgres** — redeploy bilan isbotlangan: bog'lanish va referral kodi saqlanib qoldi. ⚠️ Bepul tarif **2026-07-10** gacha — keyin upgrade kerak.

### ⚙️ Asos
Telefon-bog'lash · daraja (7 ta) · nishon (10 ta) · reyting · admin dashboard (haydovchi/mijoz/bot-a'zolari) · on-demand sync (kas1067'ga yuklamasiz).

### 🛠 Deploy tartibi (eslatma)
`git push` → Render avtomatik EMAS: `POST api.render.com/v1/services/srv-d8k27oernols73dhm0ng/deploys` trigger kerak. Mini App: `VITE_API_URL=https://kas1067-taxi-bot.onrender.com pnpm --filter @t1067/miniapp build` → `vercel deploy --prebuilt --prod`. Tekshirish: `tsx src/scripts/prodVerify.ts`.

---

## 📜 Git tarixi (har biri = qilingan ish)

```
b7f23b8  Booking status-push (real-time ride tracking)
5f68b9d  Gamified Mini App home (streak + animated wheel + reward banner)
779b9bb  Spin-the-wheel (daily, variable reward → real cashback)
7f5d173  Phase 1: reward ledger + cashback grant + daily streak
d2e894d  Fix: initData validation (signature both ways)
19e9124  Mini App: initData from URL hash fallback
2b8da68  Auth-path logging (diagnostics)
90b2c66  kas1067 reachability debug + pin Node 20
9caa687  Fix: Telegram initData signature bug (THE auth fix)
3b5503b  Resilience: keep Render warm + fetch retry
c279d28  Pin pnpm version
92c88cc  1067 Super-App: bot + Mini App + admin (foundation)
```

---

## ❓ Nega "hech nima o'zgarmadi" tuyuldi?

Gamified funksiyalar (🔥 Kunlik, 🎡 G'ildirak, Mini App home) **faqat raqamingiz bog'langandan keyin** ko'rinadi. Bog'lanmagan bo'lsangiz — bot eski "raqam ulang" ekranini ko'rsatadi (o'zgarmaganday tuyuladi).

**Ko'rish uchun:** /start → raqam ulang. Agar raqamingiz Koson 1067 mijozi bo'lmasa, "topilmadi" chiqadi → o'shanda men sizni demo-mijozга bog'lab beraman, hammasini ko'rasiz.

---

## 🗺 Qolgan roadmap (qaysi psixologiya tugmasini qo'shadi)

| Keyingi | Psixologiya |
|---|---|
| 🏆 Haftalik reyting + sovg'a | **Social Proof + raqobat** (Cialdini) |
| 🎯 Vaqtli missiyalar | **Scarcity** (Cialdini) + goal-gradient |
| 👥 Referral | **Liking + Social Proof** |
| 🎁 Surprise cashback | **Reciprocity** + variable reward |

> Cialdini = qurol, Kahneman = qalqon. Cashback'da 6 tugma birato'la: Reciprocity · Consistency · Scarcity · Loss aversion · Endowment · Peak-end. Aynan shu yo'nalishda davom etamiz.
