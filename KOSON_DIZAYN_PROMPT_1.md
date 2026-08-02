# KOSON O'YINI — DIZAYN PROMPT №1 v2: UY-KARTASI
*2026-08-01 · v1 xatosi: cheklovlar ko'p, vizual yo'nalish nol — natija "oddiy yozuvlar" bo'ldi.
v2 ikki bosqichli: avval 3 KONSEPT (erkinlik), ega tanlaydi, KEYIN tokenlash (qoidalar).*

---

## SEN KIMSAN
BirJoy miniapp'ining mahsulot-dizaynerisan. Bu — O'YIN kartasi: u ko'rgan odamda "qiziq-ku,
bosib ko'ray" hissini uyg'otishi SHART. Agar karta "ma'lumot ro'yxati"ga o'xshasa — topshiriq
bajarilmagan, qanchalik toza kod bo'lmasin.

## HIS-TUYG'U MAQSADI (eng muhim qism — v1'da bu yo'q edi)
Karta his qildirishi kerak: **energiya + yutuqqa yaqinlik + shoshilish**. Odam kartaga qaraganda:
"Men allaqachon yo'ldaman (progress), oz qoldi (raqam), vaqt ketyapti (countdown), hoziroq nimadir
qilsam bo'ladi (CTA)". Bu bank-ilova emas, bu O'YIN — jonli, yorqin, mukofot-hidli. Lekin arzon
bozor-banner ham emas — premium o'yin (Duolingo/Hamster darajasidagi sayqal).

**Vizual ilhom (og'zaki referens):** Duolingo kunlik-vazifa kartasi (progress-halqa, quvnoq
raqamlar) · Hamster Kombat balans-paneli (katta hero-raqam, yaltiroq tanga) · Bolt promo-banner
(toza gradient, bitta kuchli rang-urg'u) · lototeya chiptasining taktil hissi (perforatsiya,
raqam-seriya).

## KONTEKST (1 daqiqa)
Telegram WebApp (React), Koson shahri taksi-loyalty. O'yin: safar qil + do'st chaqir → BALL →
400+ ball = CHIPTA → oy oxiri jonli TIRAJ, real sovrinlar (dazmol, blender, air fryer...).
Chipta = ishtirok, g'alaba emas. Bu karta uy-ekranda, taksi CTA'dan keyin turadi.

## KARTA MAZMUNI (faol holat)
- **Hero-raqam: joriy ball** (masalan 310) — kartaning vizual markazi, eng katta element.
- Progress chiptagacha: 310/600, to'ldirilgan qism "suvli" (juice) his qilinadi.
- Countdown-chip: "⏳ 18 kun 4:11" — alohida kichik kapsula, jonli.
- Reyting: "🏅 12-o'rin" — kichik, faxr-belgisi sifatida.
- Bitta qator tavsiya: "Eng tez yo'l: 2 do'st + 3 safar".
- CTA: [👥 Do'st chaqirish] (asosiy, katta) · [🎁 Sovrinlar] (ikkilamchi).
- Sovrin-vizual: kichik sovrin-tasvir/emoji-kompozitsiya kartada KO'RINIB TURSIN (nima uchun
  o'ynayotganini eslatadi — quruq raqamlar emas).

## ANTI-PATTERN (bular chiqsa — qayta)
- ❌ Bir xil o'lchamdagi 4-5 qator "Label: qiymat" matn ro'yxati.
- ❌ Hero-raqamsiz, hammasi teng-og'irlikdagi kulrang tipografiya.
- ❌ Progress-bar sifatida 2px ingichka chiziq (his qilinmaydigan).
- ❌ Sovrinlarning hech qanday vizual izi yo'qligi.
- ❌ CTA oddiy matn-havola ko'rinishida.

---

## BOSQICH A — 3 KONSEPT (HOZIR SHU QILINADI)

**Erkinlik qoidalari:** bu bosqichda inline-stil MUMKIN, yangi ranglar MUMKIN, tokens.css'ga
bog'lanish SHART EMAS (tokenlash — B bosqich ishi). Bitta mustaqil HTML fayl
(`scratch/oyin_konsept.html`), uchala variant yonma-yon, real kontent bilan (310 ball, 18 kun...),
avval DARK tema (mijozlarning asosiy muhiti), keyin light.

Uch variant — uch xil xarakter (bir-biridan ANIQ farq qilsin):
1. **"Premium O'yin"** — to'q fon + bitta kuchli aksent-gradient, yumshoq glow, katta raqamlar,
   chipta-taktilligi (Hamster-yo'nalish).
2. **"Toza Premium"** — Bolt/Uber minimalizmi + bitta o'yin-urg'u (progress-suvi va sovrin-vizual
   jonli, qolgani intizomli).
3. **"Bayram-Lototeya"** — issiq ranglar, konfetti-nozik detallar, tiraj-hayajoni (lekin arzon
   bozor-bannerga tushib ketmasdan).

**Har variantda:** faol holat (to'liq) + final-48 holatining kichik eskizi (qizil-shoshilish
qanday ko'rinadi). Boshqa holatlar B bosqichda.

**Deliverable A:** bitta HTML fayl + har variantning skrinshoti (dark) + har biriga 2 qatorlik
izoh (nima uchun bu yo'nalish). **SHU YERDA TO'XTA — ega tanlaydi.** "READY FOR VERIFICATION"
deb topshir.

---

## BOSQICH B — TANLANGANDAN KEYIN (hozir QILINMAYDI, faqat bilib tur)

Ega tanlagan variant tokenlashadi: kerakli yangi tokenlar `design/tokens.css`ga `--oyk-*`
bo'limi sifatida QO'SHILADI (mavjud fayl kambag'al bo'lsa — boyitish ruxsat, bu yangi qoida),
`design/feat/oyin.css` + tsx-komponent (mock-data, jonli API'siz), 6 holat to'liq (skeleton /
0-ball / faol / final-48 / yakun / flag-OFF), animatsiya faqat transform/opacity +
prefers-reduced-motion, <100ms bosish-javobi, tap-target ≥44px, tabular-nums, matnlar o'zbekcha,
"coin" taqiq ("tanga"), dark+light skrinshotlar, motion-jadval, 3-soniya-test javoblari.

## TAQIQLAR (ikkala bosqichda)
- Jonli kodga ulamaysан (`oyin` flag DEFAULT_OFF — qorong'i qurilish).
- `uy.tsx` taksi-oqimiga tegmaysан.
- "Tayyor/done" demaysан — faqat "READY FOR VERIFICATION" + skrinshot-isbot.
