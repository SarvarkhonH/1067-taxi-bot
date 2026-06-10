# 1067 — MASTER PLAN v2 (bor kuch bilan)

> Telegram-native, o'yinlashtirilgan super-app. Taksi — kirish nuqtasi. Cashback — valyuta. Odat — moat.

---

## I. VIZYON — kategoriya yaratish (app emas, platforma)

Biz "taksi cashback bot" qurmayapmiz. Biz **hududning kunlik moliyaviy-hayotiy super-app**ini quryapmiz — taksi shunchaki Trojan ot.

**3 bosqichli evolyutsiya:**
1. **Hook** (0-6 oy): Taksi + cashback + o'yin → kunlik odat (Koson).
2. **Wallet** (6-18 oy): Cashback wallet → P2P transfer, partner do'konlar, bill payment.
3. **Super-app** (18-36 oy): Yetkazib berish, kuryer, xizmatlar → Qashqadaryo → O'zbekiston.

**Moat (raqobat himoyasi):** tarmoq effekti (referral) × wallet lock-in (pul ichkarida) × odat (kunlik streak) × ma'lumot (har userni biladi). To'rttasi birga = ko'chmas.

**North Star:** *Kunlik faol foydalanuvchi (DAU)* va *D30 retention* — har boshqa metrika shularga xizmat qiladi.

---

## II. THE SCIENCE — odat mashinasi (Hooked'dan chuqurroq)

Faqat Trigger→Action→Reward→Investment emas. To'liq xulq-atvor muhandisligi:

### Octalysis — 8 ta Core Drive (Yu-kai Chou) → har biriga mexanika
1. **Epic Meaning** — "Koson #1 cashback hamjamiyati", missiya, shahar reytingi
2. **Accomplishment** — daraja, nishon, progress bar, season-pass
3. **Empowerment** — g'ildirak strategiyasi, gem'ni qayerga sarflash tanlovi
4. **Ownership** — cashback wallet (meniki!), to'plangan balans, kosmetika
5. **Social Influence** — reyting, klan, 1v1, referral, ulashish
6. **Scarcity** — vaqtli missiya, live event, cheklangan season-nishon
7. **Unpredictability** — g'ildirak, mystery box, surprise drop (eng addictive)
8. **Avoidance (loss aversion)** — streak tugashi, cashback muddati, daraja pasayishi

### Boshqa ramkalar
- **Fogg (B=MAT):** har harakat = maksimal oson (1-tap), to'g'ri vaqt trigger.
- **Bartle player types:** Achiever (daraja/missiya) · Socializer (klan/reyting) · Explorer (yashirin mukofot) · Killer (1v1 duel) — har tip uchun yo'l.
- **Flow (Csikszentmihalyi):** qiyinlik ↔ mahorat balansi — missiyalar har userga moslashadi (juda oson ham, juda qiyin ham emas).
- **Compulsion loop:** appointment (kunlik g'ildirak qaytishni majbur qiladi) + core loop (chaqir→ol→o'yna) + progress loop (darajaga yaqinlashish).
- **Behavioral economics:** mental accounting (cashback "boshqa pul") · endowment + IKEA effect (o'zi yiqqan qadrli) · decoy effect (3 tarif — o'rtasi tanlanadi) · default effect · hyperbolic discounting (hozir kichik mukofot > keyin katta) · anchoring (chegirma).

### Variable reward ilmi (slot-mashina)
- Variable-ratio schedule · **near-miss** (yutuq yonidan o'tadi — eng kuchli) · loss-framed win · escalating jackpot · "almost" dizayn.

---

## III. IQTISOD — tokenomika

| Valyuta | Roli | Faucet (manba) | Drain (sarf) |
|---|---|---|---|
| 💰 Cashback (so'm) | real qiymat, lock-in | safar, g'ildirak, missiya, streak, referral, surprise | safar to'lovi, partner do'kon, P2P |
| ✨ XP | status (faqat o'sadi) | har harakat | — |
| 💎 Gem | o'yin valyutasi | kunlik, challenge, daraja | qo'shimcha spin, kosmetika, mystery box |

**Iqtisod boshqaruvi:** har faucet/drain modellashtiriladi · inflyatsiya nazorati · **dinamik reward** (AI: faolga kam, ketayotganga ko'p — optimal ROI) · kunlik/oylik cap (anti-abuse) · LTV > reward-cost kafolati.

---

## IV. MAHSULOT — super-app yo'li

**Core (bor):** taksi chaqirish + cashback.
**Wallet:** balans · **P2P** (cashback do'stga sovg'a) · tranzaksiya tarixi.
**Marketplace:** partner do'konlarda cashback ishlatish/yig'ish (ekotizim, drain).
**Bill pay:** mobil/kommunal (kunlik sabab — qaytish).
**Mini-services:** yetkazib berish, kuryer (bir xil wallet, bir xil o'yin).
**Driver app:** haydovchiga ham o'yin — smena maqsadi, balans, reyting, bonus, daraja (ikki tomonni ham ushlaymiz).

---

## V. AI — birinchi darajali (Claude API)

1. **Personalization engine** — har userga optimal reward/mission/push (reinforcement learning g'oyasi).
2. **Churn prediction** — kim ketmoqda → avtomatik proaktiv win-back.
3. **AI concierge** — tabiiy tilda booking, support, tavsiya ("ertaga 8da ishxonaga").
4. **Fraud/abuse detection** — anomaliya (qurilma, tezlik, naqsh).
5. **Demand forecasting** — qachon/qayerda taksi kerak (haydovchini yo'naltirish).
6. **Smart cashback** — har userga psixologik optimal miqdor (juda kam = befoyda, juda ko'p = isrof).

---

## VI. GROWTH — viral mashina

- **K-faktor muhandisligi:** har taklif ROI · double-sided reward · referral zanjir · referral turnir (kim ko'p taklif).
- **Telegram-native:** ulashish kartalari · story · kanal · mini-app virality · "do'stга 5000 so'm" deep-link.
- **Onboarding funnel:** ulan → birinchi cashback → birinchi g'ildirak — **aha-moment < 5 daqiqa**, endowed progress.
- **Ambassador:** top referrer'lar status + ulush.

---

## VII. RETENTION — lifecycle OS

- Segment: **yangi → faol → kuchayuvchi → xavf ostida → uxlagan → churned**.
- Har segmentга avtomatik kampaniya + behavioral trigger:
  - 1 kun yo'q → streak eslatma (loss aversion)
  - 3 kun → "sog'indik +2000"
  - 14 kun → katta win-back (anchored)
- **Personalizatsiya at scale:** har kishiga mukofot/missiya/push vaqti AI bilan.
- **Smart push engine:** behavioral triggers · A/B · eng yaxshi vaqt · chastota cap (spam emas).

---

## VIII. TEXNIKA — masshtab arxitekturasi

- **Event-driven:** har harakat = event (tracking + trigger + grant async via queue).
- **Stack:** PostgreSQL (doimiy) · Redis (cache + queue + leaderboard sorted-set) · WebSocket (real-time kuzatuv) · object storage.
- **Observability:** structured log · metrics · alert · trace.
- **Anti-fraud:** qurilma fingerprint · rate-limit · anomaliya ML · telefon-verifikatsiya · idempotent grant (bor) · cap.
- **Security:** initData HMAC (bor) · RBAC · secret rotation · audit-log (grant'lar — bor).
- **Multi-tenant:** shahar bo'yicha (Koson → boshqalar).

---

## IX. ROADMAP — 12 oy (3 yillik vizyon ostida)

| Chorak | Tema | Asosiy natijalar |
|---|---|---|
| **Q1** | Hook'ni mukammallashtirish | season, daraja-perk, variable-rewards to'liq (box/drop/jackpot), social (reyting+klan+referral), quests engine |
| **Q2** | Booking Uber-level + Growth | jonli xarita, narx, mashina turi, kuzatuv; push-engine, onboarding funnel, win-back |
| **Q3** | Wallet + AI | P2P, partner marketplace, churn-AI, smart cashback, AI concierge |
| **Q4** | Scale + Super-app | Postgres/Redis, anti-fraud, observability; bill-pay/mini-services pilot; Qashqadaryo ekspansiya |

---

## X. BUSINESS & strategiya

- **Unit economics:** LTV (cashback ROI orqali) vs CAC (referral arzon) — k-faktor > 1 maqsad.
- **Moat:** tarmoq + wallet lock-in + odat + ma'lumot (qaytarib bo'lmaydi).
- **Ekspansiya:** Koson → Qashqadaryo → respublika (multi-tenant tayyor).
- **Daromad:** taksi komissiya + partner do'kon + (kelajak) premium tier + float.
- **Fundraising-ready:** retention egri chizig'i + k-faktor + DAU o'sishi = investor tili.

---

## XI. RISK & ETIKA

- **Reward abuse** → cap, anti-fraud, verifikatsiya.
- **Qimor-yaqin (g'ildirak)** → etik chegaralar: hech qachon pul yo'qotmaydi, faqat yutadi/0; yoshга e'tibor; shaffof ehtimollar.
- **Regulyatsiya** (cashback/fintech) → huquqiy moslik.
- **Data privacy** → minimal ma'lumot, xavfsiz saqlash, rozilik.
- **Burnout** → push chastota cap (addictive ≠ bezovta).

---

## XII. KPI — North Star + input metrikalar

**North Star:** DAU × D30 retention.
**Input:** D1/D7/D30 · k-faktor · streak ushlash % · g'ildirak/mission engagement · cashback ROI · safar/user · churn % · LTV · aha-moment % (5 daq).

---

## XIII. To'liq xarita — har mexanika → drive + psixologiya

| Mexanika | Octalysis | Cialdini | Kahneman |
|---|---|---|---|
| Streak + comeback | Avoidance + Accomplishment | Consistency | Loss aversion |
| G'ildirak / box / drop | Unpredictability | — | Prospect theory, near-miss |
| Cashback wallet | Ownership | Reciprocity | Endowment, mental accounting |
| Reyting / klan / 1v1 | Social Influence | Social Proof + Liking | — |
| Vaqtli missiya / live event | Scarcity + Epic Meaning | Scarcity | Framing, WYSIATI |
| Daraja-perk (cashback %) | Accomplishment + Empowerment | Authority | Goal-gradient |
| Safar oxiri cashback | Accomplishment | — | Peak-end |
| Referral | Social Influence | Liking + Reciprocity | — |
| 3 tarif (decoy) | Empowerment | — | Decoy + anchoring |

---

## ✅ Poydevor (bajarilgan)
Bot · Mini App · admin · kas1067 (o'qish + **cashback yozish 1303**) · streak · g'ildirak · gamified home · booking + real-time push · Render+Vercel jonli · audit/idempotent grant.

## 🚀 Q1 — boshlandi (yangi, jonli)
- **🎯 Topshiriqlar dvigateli** — kunlik (kirish/g'ildirak/safar) + haftalik (5 safar / do'st taklif). Progress bar, real cashback claim, idempotent. *Octalysis: Accomplishment+Scarcity · Kahneman: goal-gradient.*
- **👥 Double-sided referral** — har do'st: siz +3000, do'stingiz +2000. Deep-link (`?start=ref_CODE`), avtomatik to'lov bog'langanda, anti-self-invite, bir martalik. *Octalysis: Social Influence · Cialdini: Liking+Reciprocity · k-faktor dvigateli.*
- **🎁 Sirli quti** — barcha 3 kunlik vazifa bajarilsa ochiladi ("mukammal kun"). 500…10 000 so'm, kuniga 1 marta. *Octalysis: Unpredictability · compulsion loop ustida meta-loop.*
- **🗄 Postgres (Q4'dan oldinga olindi)** — har deploy'da ma'lumot o'chish muammosi hal: streak/missiya/referral/bog'lanish endi doimiy. Redeploy bilan isbotlangan. ⚠️ Bepul tarif 2026-07-10 da tugaydi — upgrade yoki ko'chirish kerak.
- **⚡️ Haftalik liga** — har harakat ball (kunlik +10 · g'ildirak +10 · vazifa +15 · quti +20 · safar +30 · taklif +50), dushanba top-3 ga real pul (10000/5000/3000) avtomatik + push. *Cialdini: Social Proof + raqobat · Kahneman: fresh-start effekti (har hafta nol'dan).*
- **🎰 O'suvchi JACKPOT** — har spin pool'ga +50 so'm, JACKPOT bo'lagi butun pool'ni beradi (min 5000). Bot va Mini App'da jonli ko'rinadi. *Near-miss + ko'rinadigan o'sish.*
- **🎁 Surprise drop** — faol foydalanuvchilarga tasodifiy 200…1000 so'm sovg'a (~haftada 1, kuniga max 1). *Variable-INTERVAL reinforcement · Reciprocity.*
- Bot: inline "Olish"/"Qutini ochish" tugmalari, share, Reyting'da liga bloki · Mini App: Vazifa (quti), Do'st, Reyting'da Haftalik/Umumiy toggle, jackpot badge.

> **Keyingi Q1 bloklari:** season-pass · klan/jamoa · onboarding funnel (aha-moment < 5 daq). Bor kuch bilan davom etamiz.

## 🎮 SUPER-O'YIN — S1 BAJARILDI (jonli)
**Ikki hamyon:** 🚕 cashback (faqat safarlar, kas1067) + 🪙 coin (barcha o'yinlar, bizning DB, CoinTxn ledger). **💸 Withdraw:** 1 coin = 1 so'm, min 5k, kunlik 50k, kas-xato bo'lsa avto-refund — real pul FAQAT shu nuqtadan chiqadi.
**Chegarasiz o'yin:** g'ildirak 1 bepul + 300 coin'ga cheksiz respin · premium quti 2 000 coin cheksiz (~94% RTP) · o'yin ichida cap YO'Q.
**Mini App 2.0:** glass+neon dizayn, count-up balanslar, confetti, bottom-sheet withdraw, 5 tab (Hamyon · O'yinlar · Vazifa · Liga · Do'st), arcade hub + "tez kunda" kartalari.
**Sinov:** 44/44 test (ledger, sink, refund, respin) · prod verify 6 endpoint.

**Keyingi sprintlar:** S2 🏎 Poyga + 🎰 Slot 777 → S3 🏙 Taxi Park + ⚔️ Duel + 🧠 Viktorina → S4 Uber-darajali booking (jonli xarita).
