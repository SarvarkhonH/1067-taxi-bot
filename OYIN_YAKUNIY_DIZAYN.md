# 🎮 O'YIN — YAKUNIY DIZAYN

**2026-08-03.** To'rtta manba birlashtirildi: jonli kodimiz · ikkita rasm-maket · Claude Design
jonli prototipi · `DIZAYN_QOIDALARI.md` (17 qoida). Har qarama-qarshilik hal qilindi, har qaror
sababi bilan yozildi. **Bu hujjat — kodga o'tkazish uchun yagona manba.**

---

## 0. Har manbadan nima olindi

| Manba | Olindi | Olinmadi |
|---|---|---|
| **Jonli kodimiz** | mavsum tizimi, ball hisobi, hikoya-poster, sovrin katalogi, admin panel | — |
| **Maket v1** | maqsad-sovrin hero · tugmalarda mukofot · "olingan/qolgan" | 5-tabli ilova navi |
| **Maket v2** | **chipta = ko'rinadigan buyum** · ishonch ekranlari · "ball pul emas" · countdown | qizil bosim (yumshatildi) · ball diapazonlari |
| **Prototip v3** | "xariddan keyin qoladi" · "2 faol do'st = 1 chipta" · bo'sh holat matnlari · rasm-slotlari | teskari sovrin narxlari · eskirgan ball jadvali |

---

## 1. TUZILISH — 4 tab, ma'lumot esa "?" ortida

O'yin — **alohida to'liq ekran** (1-qoida: ilova menyusi u yerda chizilmaydi).

| Tab | Nima | Nega tab |
|---|---|---|
| 🎮 **O'yin** | maqsad, vazifalar, ball jadvali, yordam zanjiri | asosiy ekran |
| 🎁 **Sovrinlar** | vitrina → sovrin tafsiloti → chipta olish | asosiy harakat |
| 🎟 **Chiptalarim** | chipta-buyumlar (Aktiv / Tarix) | **chipta endi asosiy obyekt** — varaqda yashirilmaydi |
| 👥 **Jamoam** | do'stlar, ikkita summa, reyting | ijtimoiy o'zak |

**"?" tugmasi** (sarlavhada) → ma'lumot to'plami: *Qanday ishlaydi · Qoidalar · Jonli tiraj nima ·
Chipta nima*. Bular **tab emas** (3-qoida: yangi tab qo'shilmaydi) — lekin doim qo'l ostida
(hozirgi onboarding bir marta chiqib yo'qolardi).

v3-dagi "Uy" va "Profil" tablari **olib tashlandi**: ilovaning o'zida Uy bor (ikkilanish), profil
esa o'yinga tegishli emas — chiptalar o'z tabiga chiqdi.

---

## 2. O'ZAK QAROR: chipta — ko'rinadigan buyum

Bu butun sintezdagi eng qimmatli g'oya (maket v2 dan).

- Chipta **grafik obyekt**: binafsha bilet, teshikli chekka, **global noyob raqam** (№ 729475)
- Har chiptada: sovrin nomi, tiraj sanasi va **vaqti**, holati (AKTIV / TUGAGAN)
- "Chiptalarim" — alohida tab, Aktiv/Tarix bo'limlari bilan

**Nega:** eng og'ir muammomiz — *"600 ball to'ladim, qo'limda hech narsa qolmadi"*. Real
lotereyada qog'oz chipta qoladi. Endi raqamli chipta qoladi va u yig'iladi.

**Kodga ta'siri:** chipta raqami hozir har sovrin ichida 1, 2, 3… — **global ketma-ket raqamga**
o'tadi (AppState hisoblagichi). Mavsumga tiraj **vaqti** qo'shiladi (hozir faqat sana bor).

---

## 3. ⚠️ MAJBURIY TUZATISH: sovrin narxi qiymatga ergashsin

Prototipdagi katalog **teskari**: pech ~600 000 so'm bo'lib 600 ball, dazmol ~180 000 bo'lib
1 000 ball. Bitta ball uchun pech vaucherdan **13 barobar** ko'p beradi → hamma faqat pechni
oladi, qolgani o'lik zaxira.

**Qoida:** `ball narxi ≈ real qiymat ÷ K`, K butun katalog uchun **bir xil**.

K = 150 so'm/ball bilan sog'lom katalog:

| Sovrin | Qiymati | **Ball narxi** | O'rin |
|---|--:|--:|--:|
| 30k voucher | 30 000 | **200** | 25 |
| Choy serviz | 120 000 | **800** | 12 |
| Dazmol | 180 000 | **1 200** | 10 |
| Mikroto'lqinli pech | 600 000 | **4 000** | 6 |
| Air Fryer | 800 000 | **5 300** | 3 |

Endi tanlov **haqiqiy**: arzon sovrin tez, qimmati uzoq. Hozirgidek "eng qimmati eng arzon"
bo'lsa tanlov ham, o'yin ham yo'q.

**Admin panelda ogohlantirish:** narx/qiymat nisbati boshqalardan 2× chetga chiqsa — qizil izoh.

---

## 4. Ball — QAT'IY sonlar, diapazon EMAS

Maket v2 "+20-100 ball" degan diapazonni taklif qilgan. **Olmaymiz.**

Sabab: diapazon "Eng tez yo'l: 2 do'st + 4 safar" degan **bashoratni buzadi**. Bashorat esa —
mijozga aniq yo'l ko'rsatadigan yagona narsa. Bir kuchli narsa boshqasini yeydi; bashorat
qimmatroq.

Yakuniy jadval (jonli knoblar — ega ierarxiyasi 2026-08-02):

| # | Harakat | Ball | Cheklov |
|:--:|---|--:|---|
| 🥇 | Hikoya joylash | **150** | mavsumda 3 ta, admin tasdig'i |
| 2 | Do'st birinchi safarini qildi | **120** | har do'st uchun 1 marta |
| 3 | Birinchi safaring | **80** | mavsumda 1 marta |
| 4 | 3 kunlik zanjir | **50** | har to'liq 3 kun |
| 5 | Do'stning har safari | **40** | **cheksiz** ← 2-o'rin, o'z safaridan yuqori |
| 5 | Do'st telefon uladi | **40** | har do'st uchun 1 marta |
| 6 | O'z safaring | **30** | cheksiz |
| 7 | Telefon tasdiqlash | **20** | 1 marta |
| 8 | Ulashish | **10** | kuniga 1 |
| 9 | Kunlik kirish | **2** | kuniga 1 |

**Ekranda ko'rsatiladi** (varaqda yashirilmaydi) va oxirida doimiy qator:
> **Ball pul emas. Ball faqat chipta olish uchun.**

Va yordam zanjiri aniq raqam bilan (v3 dan, lekin knoblardan hisoblanadi):
> **2 faol do'st ≈ 1 chipta** — do'stingiz har yurganda sizga +40.

---

## 5. "Har 25 chipta = yangi sovrin" — HISOB

Bu mexanika yoqilishidan oldin bitta savolga javob kerak edi. Hisoblab chiqdim:

Sog'lom katalog bo'yicha o'rtacha chipta ≈ **1 740 ball** (limitlarga vaznlangan).
→ 25 chipta ≈ **43 500 ball**.

Ball asosan safardan keladi: o'z safari 30 + taklifchiga 40 = bitta safar ~**55 ball** yaratadi.
→ 43 500 ÷ 55 ≈ **790 safar**.

**Ya'ni: har 25 chipta ≈ 790 ta real safar.**

Qaror shu bitta savolga qisqaradi:
> **Bitta safardan sizga qancha sof daromad qoladi?**

- 1 000 so'm/safar → byudjet **790 000 so'm** → 600 000 lik pech qo'shsa bo'ladi ✅
- 500 so'm/safar → **395 000** → dazmol darajasi ✅, pech ❌
- 200 so'm/safar → **158 000** → faqat voucher ✅

**Tavsiya:** mexanika yoqilsin, lekin **yangi sovrin narxi admin qo'lida** bo'lsin va panelda
shu hisob ko'rsatilsin ("25 chipta ≈ 790 safar ≈ N so'm byudjet"). Shunda ega har mavsumda
o'zi qaror qiladi va tizim hech qachon zarar keltirmaydi.

---

## 6. Shoshilish — o'lchangan

Maket v2 da uchala sovrinda ham qizil "QOLGAN: N ta" turardi va bitta ekran butunlay
"DIQQAT! CHIPTALAR KAM QOLDI!" ga bag'ishlangan.

**Yakuniy qoida:**
- Qolgan ≥ 50% → **rangsiz**, oddiy matn: "12 / 15 qoldi"
- 20–50% → **kahrabo**: "5 ta qoldi"
- < 20% → **qizil**: "2 ta qoldi — tugayapti"
- Bir ekranda **eng ko'pi bitta** qizil element

Sabab: lotereya + qizil bosim + "hoziroq" uchligi mahalliy bozorda "aldov ilova" tuyg'usini
beradi. Tanqislik **haqiqat bo'lgandagina** ko'rsatiladi — shunda unga ishonishadi.

---

## 7. Ekranlar — yakuniy ro'yxat

### 🎮 O'yin (tab 1)
Sarlavha (nom + mavsum + "?") · **maqsad-hero** (sovrin rasmi, "660 ball qoldi", progress,
"eng tez yo'l") · ikkita tugma **mukofoti bilan** ("Safar qilish +30" to'q sariq — brend rangi;
"Do'st chaqirish +40" binafsha) · bugungi vazifalar (3 qator) · yordam-zanjiri kartasi ("Nodirjon
bugun 3 safar qildi → +120, **Rahmat ayt**") · **ball jadvali** (10 qator + "ball pul emas") ·
homiy.

### 🎁 Sovrinlar (tab 2)
Tiraj banneri (sana **va vaqt**) · sovrin kartalari: **real rasm**, nom, qiymat, "Olingan: N ·
Qolgan: M", progress, ball narxi, "Sizda: N ta" · **maqsad qilish** tugmasi · qulflangan sovrin
(agar 25-mexanika yoqilsa).
→ **Sovrin tafsiloti**: katta rasm, o'lchangan tanqislik, "Sizning ballingiz", miqdor (max 3),
**"Xariddan keyin qoladi: N ball"**, katta tugma, ikki qatorli huquqiy izoh.

### 🎟 Chiptalarim (tab 3)
Aktiv / Tarix · har chipta — **bilet obyekti** (raqam, sovrin, sana+vaqt, holat) ·
"Jami: N ta — qancha ko'p bo'lsa, ehtimol shuncha yuqori" · bo'sh holat: *"Hali chiptangiz yo'q.
600 ball yig'ing — birinchi chiptangizni oling!"* + "Sovrinlarni ko'rish" tugmasi.

### 👥 Jamoam (tab 4)
**Ikkita summa alohida**: "Bir martalik mukofot 640" va "Do'stlar safaridan +600" · jami ·
do'stlar ro'yxati (Rahmat ayt / Uyg'ot) · reyting · "Do'st chaqirish".

### ❓ Ma'lumot ("?" ortida)
*Qanday ishlaydi* (5 qadam, sahna-illyustratsiyalar) · *Qoidalar* (5 band) · *Jonli tiraj nima* ·
*Chipta nima* (noyob raqam · tirajda ishtirok · tasodifiy tanlov).

### Mavsum holatlari
*Sozlanmagan* → o'yin yopiq · *Boshlanmagan* → **countdown** (kun/soat/daq) + sovrinlar ko'rinadi ·
*Faol* → yuqoridagi hammasi · *Tiraj kuni* → jonli efir ekrani · *Tugagan* → yakun + **g'oliblar**.

---

## 8. Kodda nima o'zgaradi

| # | O'zgarish | Hajm |
|:--:|---|:--:|
| 1 | Maqsad-sovrin: `oyin:goal:<id>`, `POST /api/oyin/goal`, hero qayta yozilishi | O |
| 2 | Chipta **global raqami** + tiraj **vaqti** | O |
| 3 | "Chiptalarim" varaqdan **tabga** chiqadi, bilet grafikasi | O |
| 4 | Ball jadvali varaqdan **ekranga**, "ball pul emas" qatori | K |
| 5 | Tugmalarga mukofot, sovrin kartasiga "olingan/qolgan" | K |
| 6 | O'lchangan tanqislik (3 daraja) | K |
| 7 | "Xariddan keyin qoladi" | K |
| 8 | Ma'lumot to'plami ("?" ortida 4 ekran) | O |
| 9 | Countdown va tiraj-kuni ekranlari | O |
| 10 | G'oliblar: yozish + ko'rsatish | **KT** |
| 11 | Admin: narx/qiymat nisbati ogohlantirishi | K |
| 12 | *(ixtiyoriy)* 25-chipta qulfi + byudjet hisobi panelda | **KT** |

**K** kichik · **O** o'rta · **KT** katta

---

## 9. Qoida tuzatilishi

`DIZAYN_QOIDALARI.md` **13-qoida eskirgan**: "O'yin ekranlari mavzudan mustaqil **qorong'i**"
deb yozilgan. Ega keyinroq *"light tursin va yengil chaqmoqdek bo'lsin"* dedi va ekran yorug'ga
o'tkazildi (jonli holat).

**Yangi 13-qoida:** *O'yin ekranlari ilovaning mavzusidan **mustaqil** — o'z doimiy palitrasida
(yorug'). Bu ongli qaror; ilova mavzusi o'zgarsa o'yin o'zgarmaydi.*

---

## 10. Kod yozishdan oldin

Bittagina qadam qoldi: **prototipni 5-10 kishiga ko'rsatish.** Hech narsa tushuntirmasdan, uch
savolga javob bera olsalar dizayn ishlaydi:

1. Bu nima?
2. Nima qilsam ball ko'payadi?
3. Chipta olsam nima bo'ladi?

Bu — kod yozishdan oldingi eng arzon va eng ishonchli tekshiruv.
