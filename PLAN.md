# 1067 Super-App — PLAN (qilindi / qilinadi)

_Yangilangan: 2026-06-09_

**Belgilar:** ✅ qilindi (jonli) · 🔨 jarayonda · ⬜ qilinadi

---

## 1. Poydevor ✅
- [x] Telegram bot (grammY) — webhook, 24/7 Render
- [x] Mini App (React/Vite) — HTTPS Vercel
- [x] Admin dashboard (haydovchi/mijoz/bot-a'zolari)
- [x] kas1067 integratsiya (login, API, on-demand sync — yuklamasiz)
- [x] Telefon orqali bog'lash
- [x] Daraja (7) · nishon (10) · reyting
- [x] Deploy: GitHub + Render + Vercel
- [x] **Mijoz cashback YOZISH** (`1303` kodi — real pul)

## 2. Gamification — Hooked ✅ (Faza 1-2)
- [x] 🔥 Kunlik streak — milestone cashback (3/7/14/30/100-kun → 500…60000 so'm)
- [x] 🎡 Omad g'ildiragi — kunlik, animatsiya, real so'm (JACKPOT 5000)
- [x] Gamified Mini App home — streak alangasi + g'ildirak + reward banner + jonli balans
- [x] Reward-ledger — audit, idempotent, kunlik cap 50k (anti-abuse)
- [x] Cashback push — "+X so'm oldingiz"

## 3. Booking — Uber darajasi 🔨
- [x] 🚕 Botdan chaqirish — saqlangan manzil + qidiruv + tasdiq + dispatch
- [x] 📍 Jonli kuzatuv kartasi — haydovchi, mashina, lokatsiya, cashback
- [x] 🚖 Real-time status push — qidiruv→tayinlandi→yetib keldi→yakunlandi
- [ ] ⬜ Mini App'da booking (xaritadan manzil)
- [ ] ⬜ Safar tarixi + har safardan cashback
- [ ] ⬜ Narx/tarif preview ("bu safar ~X cashback")
- [ ] ⬜ Haydovchini baholash

## 4. Gamification+ ⬜ (Faza 3 — keyingi)
- [ ] ⬜ 🏆 Haftalik reyting + top-3 sovg'a — *Social Proof*
- [ ] ⬜ 🎯 Vaqtli missiyalar ("bu hafta 5 safar → +5000") — *Scarcity*
- [ ] ⬜ 👥 Referral (do'st chaqir → ikkalangiz bonus) — *Liking/viral*
- [ ] ⬜ 🎁 Surprise/lucky-ride cashback — *Reciprocity + variable*
- [ ] ⬜ Daraja → cashback % (yuqori daraja = ko'proq)
- [ ] ⬜ Nishon ulashish ("Men Olmosман!")

## 5. Mini App polish ⬜ (Faza 4)
- [ ] ⬜ Wheel ovozi/haptik · konfetti animatsiya
- [ ] ⬜ Booking ekrani (xarita, haydovchi harakati)
- [ ] ⬜ Push segmentatsiya (win-back: "sog'indik, mana 1000 so'm")

## 6. Operatsion ⬜
- [ ] ⬜ Admin: rewards analitika + broadcast (barchaga aksiya)
- [ ] ⬜ SQLite → Postgres (doimiy saqlash)
- [ ] ⬜ Temp debug kodni tozalash (`/debug/kas`, auth-logging)
- [ ] ⬜ Tokenlarni rotate (GitHub/Vercel/Render)

---

## 📊 Hozircha: 18 ✅ qilindi · 19 ⬜ qoldi

**Keyingi navbat:** 🏆 reyting sovg'asi → 🎯 missiya → 👥 referral (Faza 3).

> Har bir gamification elementи psixologiyaga bog'langan (Cialdini + Kahneman) — batafsil [ISHLAR.md](ISHLAR.md)da.
