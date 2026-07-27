# 🎀 RAVELLA V2 — REJA (kartada surish · to'liq ekran · havola-kartochkasi · Story)

> Ega so'radi (2026-07-28). Bu **reja** — kod yozilmagan. Tasdiqlashingizdan keyin boshlanadi.
> Har bo'limda: nima quriladi · nega aynan shunday · nima xavf · qanday isbotlanadi.

---

## §1. Kartaning O'ZIDA surish (ichiga kirmasdan)

**Nima.** Katalogdagi har kartada rasmlar chapga-o'ngga suriladi; pastda kichik nuqtalar.
Bezakni ochish shart emas — mijoz ro'yxatni aylanayotib 8 ta bezakning 40 ta suratini ko'radi.

**Nega muhim.** Hozir mijoz bitta qopqoq rasmni ko'radi va «kirsammi-kirmasammi» deb qaror
qiladi. Har kirish — bir qadam yo'qotish. To'y bezagi ko'z bilan tanlanadi: qancha ko'p surat
shuncha ko'p ishonch.

**Qanday.** Kartaning ichida ham xuddi bezak sahifasidagi `scroll-snap` karusel. Yangi
kutubxona yo'q.

**Nozik joy — buni oldindan hal qilamiz:** kartani surish bilan **bosish** bir-biriga
xalaqit beradi (barmoq sal qimirlasa "bosildi" deb hisoblanishi mumkin). Yechim: bosish
`click` hodisasida emas, **surish masofasi 8px dan kam** bo'lgandagina hisobga olinadi.
Bu bir marta yoziladi va ikkala ekranda ishlatiladi.

**Ma'lumot.** Katalog javobiga har bezak uchun **eng ko'pi 5 ta rasm id'si** qo'shiladi
(faqat raqamlar — 8 bezak × 5 = 40 raqam, ~0.4 KB). Qolganini bezak sahifasida ko'radi.
Ya'ni qo'shimcha so'rov YO'Q.

**Isbot.** Brauzerda: kartani surganda rasm almashadi va sahifa OCHILMAYDI; bosganda ochiladi.

---

## §2. Rasmni to'liq ekranda ochish

**Nima.** Bezak sahifasidagi rasmni bosganda — qora fon, rasm to'liq ekranda, ikki barmoq
bilan kattalashtirish, pastga surib yopish, chapga-o'ngga o'tish, tepada `3/7` hisoblagichi.

**Nega.** Bezakning detali (gul turi, harf shakli, sharlar zichligi) kichik kadrda ko'rinmaydi.
Aynan shu detal «shu odamlarga buyurtma beraman» degan qarorni yopadi.

**Qanday.** Kodbazada `Lightbox` komponenti ALLAQACHON bor (`design/components.tsx`,
do'kon mahsulot-galereyasida ishlaydi) — Ravella unga ulanadi, yangi komponent yozilmaydi.
Kattalashtirish brauzerning o'z `touch-action: pinch-zoom` imkoniyati bilan.

**Isbot.** Rasm bosiladi → to'liq ekran ochiladi → surib o'tiladi → pastga surib yopiladi.

---

## §3. Mijoz uchun oddiy, lekin kuchli 3 ta qulaylik (mening taklifim)

Ega «oddiy lekin qulay imkoniyatlar taklif qil» dedi. Uchtasini tanladim — har biri
**bir bosish**, hech biri yangi ekran talab qilmaydi:

**3.1 «Ulashish» — har bezakda.** Tugma bosiladi → Telegram/WhatsApp'ga rasm + nom +
havola ketadi. *Nega birinchi o'rinda: to'y bezagini bitta odam tanlamaydi — kelin, onasi,
qaynonasi maslahatlashadi. Hozir mijoz skrinshot olib yuboryapti (rasm sifati past, havola
yo'q). Bu tugma — Ravella uchun eng arzon reklama kanali: har ulashish yangi odamni saytga
olib keladi.*

**3.2 «Narxini so'rash» — tayyor matn bilan.** Telegramni ochadi va xabar maydoniga o'zi
yozib qo'yadi: «Salom! «Kelin uyi» bezagi bo'yicha narx so'ramoqchi edim.» Mijoz faqat
"Yuborish" ni bosadi. *Nega: birinchi jumlani yozish — eng katta psixologik to'siq. Odam
"nima deb yozsam ekan" deb o'ylayotgan payt chiqib ketadi.*

**3.3 «Sana + joy» — ixtiyoriy ikki qator.** So'rash tugmasida ikkita ixtiyoriy maydon:
sana va joy (masalan «5-avgust, Koson to'yxonasi»). Ular tayyor matnga qo'shiladi.
*Nega: Ravella'ning birinchi savoli doim shu bo'ladi. Oldindan yuborilsa — bitta yozishma
o'rniga darhol narx aytiladi.*

**Ataylab QILINMAYDIGAN narsalar** (hozircha): sevimlilar ro'yxati, taqqoslash, band-kunlar
kalendari, onlayn to'lov. Har biri yangi ekran va yangi qoidalar talab qiladi — mijozga esa
hozir kerak emas. Sodda qolgani yaxshi.

---

## §4. Havolani rasmli kartochka qilish

**Nima.** `app.birjoy.online/ravella` havolasi Telegramga tashlanganda — kichik kul rang
satr emas, **katta rasm + sarlavha + tavsif** bo'lib chiqadi (siz yuborgan skrinshotdagi kabi).

**Ikki xil narsa borligini ajratib olaylik — ikkalasi ham kerak:**

**(a) Havola-oldindan ko'rish (link preview).** Telegram sahifadagi `og:` teglarini o'qiydi.
Bizda ular bor, lekin `og:image` — logotip (kvadrat). Kerak: **1200×630** o'lchamli maxsus
kartochka rasmi (chapda logotip va shior, o'ngda eng chiroyli bezak surati, pastda
«Orzudagi bezaklar — Ravella bilan»). Bu rasm skript bilan chiziladi, ya'ni bezak
almashsa yangilash oson.
⚠️ **Telegram oldindan ko'rishni uzoq keshlaydi** — rasm almashganda havolaga `?v=2`
qo'shiladi, aks holda eski kartochka ko'rinaveradi.

**(b) Bot orqali yuboriladigan kartochka.** Skrinshotdagi ko'rinish (rasm + tagida tugma)
— bu OG emas, **bot yuborgan post**. Bizda `/elonrasm` allaqachon shuni qiladi: rasm +
izoh + tugma. Reja: `/ravella` menyusiga «📣 Reklama kartochkasi» qo'shiladi — bosilganda
ega/hamkorga tayyor post beriladi (rasm + matn + «🎀 Ravella'ni ochish» tugmasi), uni
kanalga yoki do'stlarga forward qiladi.

**Isbot.** Havola test-chatga tashlanadi → katta rasmli kartochka chiqadi (skrinshot).

---

## §5. Ravella Story (ega bergan qoidalar bilan)

Avvalgi reja (`RAVELLA_STORY_PLAN.md`) kuchda, lekin ega **uchta qoidani aniqladi** —
ular modelni soddalashtiradi:

| Ega qoidasi | Nima demak | Ta'siri |
|---|---|---|
| «10 tagacha» | Bir vaqtda eng ko'pi 10 ta hikoya | Ro'yxat cheklangan, ekran hech qachon cho'zilib ketmaydi |
| «cheksiz qo'yadi, yangi yuklasa eskilari o'chadi» | 11-chi qo'yilsa — eng eskisi AVTOMATIK o'chadi (FIFO) | Hamkor hech narsani qo'lda o'chirmaydi |
| «kichik video ham» | Rasm + qisqa video | Videoga chegara kerak (quyida) |

**Muhim farq — 24 soat masalasi.** Avvalgi rejada hikoya 24 soatda o'chardi (Instagram
qoidasi). Ega tavsifida bunday shart yo'q: «yangi yuklasa eskisi o'chadi». Ravella kuniga
bir marta ish qilsa, 24 soatlik qoida hikoyani doim bo'sh qoldiradi — halqa ko'pincha
umuman ko'rinmaydi.
**Tavsiyam: 24 soatlik muddat OLIB TASHLANADI.** Hikoya faqat 11-chisi kelganda o'chadi.
Ya'ni bu «bugungi lenta» emas, **«oxirgi 10 ta ish»** — Ravella uchun bu ancha foydali:
har doim to'la, har doim yangi. *(Agar «24 soat baribir kerak» desangiz — bir qator kod.)*

**Video chegarasi:** ≤ 30 soniya, ≤ 20 MB, ovozsiz avto-ijro (`muted autoplay playsinline`),
bosilganda ovoz yoqiladi. Telegram file_id bilan saqlanadi — bayt yuklanmaydi, joy egallamaydi.
*Nega chegara: uzun video hikoya emas, u — kino; mobil internetda ochilmaydi va odam chiqib
ketadi.*

**Qolgani avvalgi rejadagidek:** alohida `RavellaStory` jadvali (do'kon-hikoyalariga
tegilmaydi), botdan joylash, halqa + to'liq ekranli ko'ruvchi, alohida `ravellastory` bayrog'i.

---

## §6. Fazalar va qabul mezoni

| Faza | Nima | Qabul mezoni (isbot) |
|---|---|---|
| **V1** | Kartada surish + bosish-surish ajratimi | Surganda ochilmaydi, bosganda ochiladi (brauzer) |
| **V2** | To'liq ekran (mavjud `Lightbox` ulanadi) | Ochiladi, o'tadi, yopiladi |
| **V3** | Ulashish · narx so'rash · sana+joy | Tugma bosiladi → Telegram tayyor matn bilan ochiladi (skrinshot) |
| **V4** | 1200×630 kartochka + `/ravella` menyusidagi reklama posti | Havola chatda katta rasm bo'lib chiqadi (skrinshot) |
| **S1-S5** | Story (§5 qoidalari bilan) | Alohida rejada, o'sha DoD |
| **QABUL** | Ega telefonida ko'radi | Faqat shundan keyin bayroqlar yoqiladi |

**Baho:** V1-V4 ≈ bir kunlik ish; Story ≈ yarim kun. Eng nozik joyi — V1 dagi
bosish/surish ajratimi (yomon qilinsa mijoz asabiylashadi), shuning uchun u birinchi
va alohida isbotlanadi.

---

## §7. Egadan javob kutiladigan 3 ta savol

1. **Hikoya 24 soatda o'chsinmi?** Tavsiyam: **yo'q** — faqat 11-chisi kelganda eskisi ketsin
   (§5). Shunda halqa har doim to'la turadi.
2. **Reklama kartochkasidagi rasm qaysi bezak bo'lsin?** Tavsiyam: «Premium bitiruv zali»
   (eng ta'sirli surat) yoki siz aytgan boshqasi.
3. **Story kim joylaydi?** Faqat Zoyir aka va sizmi, yoki «faylasuf» ham? (Hozir buyurtma
   kartalari uchalangizga tushadi — hikoya ham shundaymi?)
