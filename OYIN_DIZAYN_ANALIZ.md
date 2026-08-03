# 🎮 O'yin dizayni — analiz (tasdiqdan OLDIN)

**v2 — 2026-08-03.** Ikkinchi dizayn varianti keldi va u birinchisidan jiddiy farq qiladi.
Quyida: nima kuchaydi, nima zaiflashdi, qanday YANGI mexanikalar paydo bo'ldi va ular qanday
qaror talab qiladi.

---

## 1. Eng katta yutuq: chipta endi KO'RINADIGAN NARSA

Avvalgi hamma versiyada chipta — modal oynadagi raqam edi. Bu versiyada chipta **jismoniy
buyum**: binafsha bilet, teshikli chekka, yulduzcha, va o'z **noyob raqami** (№ 729475).
Unga uchta ekran bag'ishlangan (4 — olish, 5 — mening chiptalarim, 7 — chipta nima).

**Nega bu muhim:** biz aniqlagan eng og'ir muammo — "600 ball to'ladim, qo'limda hech narsa
qolmadi" — shu bilan **butunlay yopiladi**. Real lotereyada qog'oz chipta qoladi; bu yerda endi
raqamli chipta qoladi. Yig'ish hissi paydo bo'ladi: 3 ta chipta = 3 ta ko'rinadigan buyum.

Bu — butun dizayndagi eng qimmatli g'oya.

---

## 2. Ishonch ekranlari — bizda umuman yo'q edi

| Ekran | Nima qiladi | Bugun |
|---|---|---|
| 7 · Chipta qanday ko'rinishda | "noyob raqam", "jonli tirajda ishtirok etadi", "raqamlar tasodifiy — adolatli tiraj" | ❌ yo'q |
| 10 · Jonli tiraj nima | tirajning o'zini tushuntiradi: qayerda, qanday, kim tanlaydi | ❌ yo'q |
| 6 · footer | **"Ball pul emas, ball faqat chipta olish uchun!"** | ❌ yo'q |

Uchinchisi alohida ta'kidlashga arziydi. Lotereya-tipidagi mexanikada "ball pul emas" degan
ochiq gap — **huquqiy va ishonch masalasi**. Hozir bu hech qayerda aytilmagan.

---

## 3. UCHTA YANGI MEXANIKA — qaror talab qiladi

### 3.1 "Har 25 ta chipta ochilganda — yangi sovrin" ⭐ eng qiziq

3-ekranda: *"Har 25 ta chipta ochilganda, vitrinaga yangi sovrin qo'shiladi"*, va pastda
qulflangan karta: *"Yangi sovrin tez orada! 18 / 25 chipta"*.

**Nega kuchli:** bu **jamoaviy** progress. Hozir har kim yolg'iz o'ynaydi. Bu qoida bilan
boshqaning chipta olishi **menga ham foyda** — yangi sovrin ochiladi. Ya'ni raqobat o'rniga
hamkorlik paydo bo'ladi va vitrina "tirik" bo'lib turadi.

**Nima kerak:** admin sovrinlarni **navbatga** qo'yishi (qaysi biri keyingi ochiladi), qulf
holati, umumiy sotilgan chipta hisoblagichi. Kod tomonda o'rtacha ish.

**Xavf:** sovrin soni sotuvga bog'lanadi — ya'ni **xarajat ham o'sadi**. 100 ta chipta sotilsa
4 ta yangi sovrin ochiladi. Buni pul bilan bog'lab hisoblash kerak: har 25 chipta = qancha
ball = qancha safar = bizga qancha daromad? Agar sovrin narxi o'sha daromaddan qimmat bo'lsa —
zarar. **Buni raqam bilan tekshirmasdan yoqib bo'lmaydi.**

### 3.2 Ball diapazonlari: "+20-100 ball" o'rniga "+30"

6-ekranda: "Taksi safarlari **+20-100 ball**", "Do'st chaqirish **+40-120**",
"Vazifalarni bajarish **+10-50**".

**Nega kuchli:** o'zgaruvchan mukofot qat'iy sondan ancha qiziqarli — har safar "nechchi
tushadi?" degan kutish paydo bo'ladi. Bizning tanga tizimida bu allaqachon bor (80/15/4/1
ko'paytirgichlar).

**Nima buziladi:** "Eng tez yo'l: 2 do'st + 4 safar" degan hisob **aniq bo'lmay qoladi**.
Diapazon bilan progress-bashorat qilib bo'lmaydi. Ya'ni bir kuchli narsa boshqasini yeydi.

**Uchinchi yo'l:** ball qat'iy qoladi, lekin **vazifalar** o'zgaruvchan bo'ladi
("Vazifalarni bajarish +10-50") — shunda kutish ham bor, bashorat ham buzilmaydi.

### 3.3 "Izoh qoldirish +5 ball"

Xizmat haqida izoh yozgani uchun ball. Bizda bunday manba yo'q. Kichik ish, lekin **izoh
qayerga tushadi va kim o'qiydi** — hal qilinishi kerak (aks holda ball bepul tarqaladi).

---

## 4. Nima ZAIFLASHDI

**Maqsad-sovrin yo'qoldi.** Avvalgi versiyada hero "660 ball qoldi — Choy serviz" deb aniq
maqsad ko'rsatardi. Bu versiyada hero — **tiraj sanasi**, balans esa alohida kartada
"92 / 600 ball" deb turibdi. Ya'ni "men NIMA uchun yig'yapman" savoli yana javobsiz.

Ikkalasini birlashtirish mumkin va kerak: tiraj sanasi banner sifatida tepada qolsin, balans
kartasi esa **tanlangan sovrin** bilan ishlasin ("Choy servizgacha 660 ball").

---

## 5. Texnik nomuvofiqliklar (kodga o'tkazishda hal qilinadi)

| Dizaynda | Bizda hozir | Qaror |
|---|---|---|
| Chipta raqami **№ 729475** — global noyob | Har sovrin ichida 1, 2, 3… | Global raqamga o'tish kerak — dizayn shunga qurilgan |
| Chiptada "O'yin sanasi: 31-avgust, **20:00**" | Mavsumda faqat SANA bor, soat yo'q | Tiraj vaqti qo'shiladi |
| Miqdor tanlagich (− 1 +) cheksiz | `oyinMaxTicketsPerPrize` = 3 | Tanlagich 3 bilan cheklanadi |
| "Sizda: 2 ta chipta" har sovrinda | bor (`mine`) | mos |
| Ball: +20-100 | qat'iy 30 | §3.2 qarori |

---

## 6. Xavf: qizil bosim

9-ekran butunlay shoshiltirishga qurilgan: **"DIQQAT! CHIPTALAR KAM QOLDI!"**, katta qizil
"2 ta", "Kech qolmang, hoziroq chipta oling".

Bu ishlaydi, lekin **ehtiyot bo'lish kerak**. Lotereya + qizil bosim + "hoziroq" — bu uchlik
osonlik bilan "aldov ilova" tuyg'usini beradi, ayniqsa mahalliy bozorda. Tavsiyam: qizil
faqat **haqiqatan** kam qolganda (masalan ≤20%) chiqsin va bir ekranda bittadan oshmasin.
Hozirgi dizaynda uchala sovrinda ham qizil badge turibdi — bu darhol ishonchni pasaytiradi.

---

## 7. Ekranlar holati

| | Ekran | Bugun | Ish |
|:--:|---|---|:--:|
| 1 | Uy | ✅ bor, hero boshqacha | O |
| 2 | Qanday ishlaydi (5 qadam) | ⚠️ 4 slayd bor, sahnasiz | O |
| 3 | Sovrinlar + qulflangan sovrin | ✅ bor, qulf mexanikasi yo'q | **KT** |
| 4 | Chipta olish + bilet grafikasi | ⚠️ varaq | O |
| 5 | Mening chiptalarim (Aktiv/Tarix) | ✅ yaqinda qurildi, oddiyroq | K |
| 6 | Ball qanday yig'iladi | ✅ varaqda bor | K |
| 7 | Chipta nima | ❌ yo'q | K |
| 8 | Boshlanish sanasi + countdown | ⚠️ faza bor, ekran yo'q | K |
| 9 | Sovrin tafsiloti + shoshilish | ❌ yo'q | O |
| 10 | Jonli tiraj nima | ❌ yo'q | K |

**K** kichik · **O** o'rta · **KT** katta

---

## 8. Tavsiya qilinadigan tartib

| Bosqich | Nima | Nega birinchi |
|:--:|---|---|
| **1** | Chipta grafikasi + global raqam + "Mening chiptalarim" boyitilgan (4, 5, 7) | Eng og'ir muammoni yopadi, yangi mexanika talab qilmaydi |
| **2** | Ishonch ekranlari (10, 6-footer "ball pul emas") + tiraj vaqti | Arzon, huquqiy jihatdan muhim |
| **3** | Maqsad-sovrin hero (1) + countdown (8) | Tushunarlilik |
| **4** | Sovrin tafsiloti + o'lchangan shoshilish (9) | Konversiya |
| **5** | "Har 25 chipta = yangi sovrin" (3) | **Faqat iqtisod hisobidan keyin** |

---

## 9. Tasdiq kutilmoqda

1. **"Har 25 chipta = yangi sovrin"** — yoqamizmi? Yoqsak, avval hisob kerak: 25 chipta qancha
   ball, qancha safar, bizga qancha daromad keltiradi va yangi sovrin shundan arzonmi?
2. **Ball diapazon bo'lsinmi** (+20-100) yoki qat'iy qolsinmi (+30)? Diapazon "eng tez yo'l"
   bashoratini buzadi — uchinchi yo'l sifatida faqat *vazifalar* o'zgaruvchan bo'lishi mumkin.
3. **Qizil shoshilish** — hamma sovrinda turaversinmi yoki faqat ≤20% qolganda?
4. **Maqsad-sovrin** — qaytaramizmi (avvalgi versiyada bor edi, bunda yo'q)?
5. **"Izoh qoldirish"** — izoh qayerga tushadi, kim o'qiydi?
6. **Sovrin fotolari** — dizayn real fotolarga qurilgan. Ular bormi?


---

# 📱 v3 — "BirJoy Koson · Full App" jonli prototipi

Manba: Claude Design loyihasi `c463c2a6` → `BirJoy Koson - Full App.dc.html` (+ `image-slot.js`,
`support.js`). **Yakuniy qaror emas** — variant sifatida ko'rib chiqildi.

## Nima uchun bu boshqacha

Oldingi ikkitasi — **rasm**. Bu — **ishlaydigan prototip**: 390×844 telefon ramkasi, 5 bo'lim
(`UY · SOVRINLAR · CHIPTA OLISH · JAMOAM · PROFIL`), holat almashadi, chipta olib ko'rish va do'st
chaqirishni bosib sinash mumkin.

**Amaliy qiymati:** buni **real odamlarga ko'rsatib sinab ko'rsa bo'ladi** — kod yozilmasdan
oldin. "Tushunarlimi?" degan savolga taxmin emas, kuzatuv bilan javob olinadi.

Va `image-slot.js` bor: har sovrinda `slotHint` ("Pech rasmi", "Dazmol rasmi"…) — ya'ni prototip
**real fotolarni qabul qilish uchun** qurilgan. Mening "rasmlar bormi?" degan savolimga javob shu.

## Bizdagidan farq qiladigan yaxshi topilmalar

| Topilma | Nega qimmatli |
|---|---|
| **"Xariddan keyin qoladi"** — xarid oynasida qoladigan ball | Xarid xavotirini kamaytiradi. Bizda yo'q |
| **"2 faol do'st = 1 chipta"** | Yordam zanjirini **aniq raqamga** aylantiradi. "Do'st chaqir" mavhum, bu esa aniq |
| **Bo'sh holat matnlari** — *"Hali chiptangiz yo'q. 600 ball yig'ing — birinchi chiptangizni oling!"* | Bo'sh ekran ham yo'l ko'rsatadi |
| **"1-mavsum hali tugamagan. Birinchi g'oliblar 31-avgustda e'lon qilinadi."** | G'oliblar ekrani birinchi mavsumda bo'sh bo'ladi — bu matn shuni halol hal qiladi |
| **PROFIL bo'limi o'yin ichida** | Chiptalar, tarix, sozlamalar bir joyda |
| `prefers-reduced-motion` hurmat qilingan | Bizning dizayn qoidamizga mos |

## ⚠️ Jiddiy muammo: sovrin narxlari TESKARI

Prototipdagi katalog:

| Sovrin | Real qiymati | Ball narxi | **1 ball qancha so'm beradi** |
|---|--:|--:|--:|
| 30k voucher | 30 000 | 400 | 75 |
| Choy serviz | ~120 000 | 800 | 150 |
| Dazmol | ~180 000 | 1 000 | 180 |
| Air Fryer | ~800 000 | 3 200 | 250 |
| **Mikroto'lqinli pech** | **~600 000** | **600** | **1 000** ⚠️ |

Pech — dazmoldan **3,3 barobar qimmat**, lekin ball narxi **40% arzon**. Ya'ni bitta ball uchun
pech vaucherdan **13 barobar** ko'p qiymat beradi.

**Oqibati:** har qanday mantiqli o'yinchi faqat **pech** chiptasini oladi. Pech bir kunda tugaydi,
qolgan sovrinlar esa o'lik zaxira bo'lib qoladi — va biz eng qimmat sovrinni eng arzonga bergan
bo'lamiz.

Bu, ehtimol, shunchaki namuna ma'lumot. Lekin **shu holida chiqsa real zarar**. Qoida oddiy:
**ball narxi real qiymatga ergashishi shart.** Masalan pech ~4 000, fryer ~5 000.

## Ball qiymatlari eskirgan

Prototipdagi jadval bizning **kechagi ierarxiyamizdan oldingi** holat:

| Harakat | Prototipda | Bizda hozir |
|---|--:|--:|
| Do'stning har safari | +10 | **+40** ← siz 2-o'ringa ko'targansiz |
| Ulashish | +5 | **+10** |
| Hikoya joylash | ❌ yo'q | **+150** ← 1-o'rin |
| 3 kunlik zanjir | ❌ yo'q | **+50** |

Qolgan beshtasi mos (telefon 20, birinchi safar 80, safar 30, do'st uladi 40, do'st birinchi
safari 120).

## Takrorlanayotgan uchta savol

Bu prototipda ham **"har 25 chipta = yangi sovrin"** mexanikasi bor (qulflangan karta, 18/25).
Savol o'zgarmaydi: **iqtisod hisobisiz yoqib bo'lmaydi** — 25 chipta bizga qancha daromad
keltiradi va yangi sovrin shundan arzonmi?

Maqsad-sovrin bu versiyada ham yo'q (hero — ball). Qizil bosim esa bu variantda **yo'q** —
oldingi versiyadan tinchroq, bu yaxshi.

## Xulosa

Uchala variantdan **eng foydalisi shu** — chunki uni sinab ko'rish mumkin. Lekin uni shundoq
olib bo'lmaydi:

1. **Sovrin narxlarini tuzatish** (teskari — yuqoriga qarang) — bu majburiy
2. **Ball qiymatlarini yangilash** (do'st safari 40, ulashish 10, hikoya 150, zanjir 50)
3. **Maqsad-sovrin** qo'shish (v1 da bor edi, keyin yo'qolgan)
4. **25-chipta mexanikasi** — iqtisod hisobidan keyin qaror

## Taklif

Prototipga real sovrin fotolarini tashlang va **5-10 kishiga ko'rsating** — hech narsa
tushuntirmasdan. Uch savolga javob bera olsalar, dizayn ishlaydi:
*bu nima · nima qilsam ball ko'payadi · chipta olsam nima bo'ladi.*

Kod yozishdan oldin shu sinov eng arzon va eng ishonchli tekshiruv bo'ladi.
