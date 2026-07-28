// 📷 OCHIQ LITSENZIYALI rasm topuvchi (ega so'rovi 2026-07-28: «rasmlarni topib yukla»).
//
// NEGA "internetdan" EMAS: internetdagi rasmning egasi bor (fotograf, brend, boshqa do'kon) —
// olib sotuvga qo'yish mualliflik huquqini buzadi. Shuning uchun FAQAT ikki ochiq manba:
//   1) Open Food Facts (ma'lumot ODbL, rasm CC-BY-SA) — BRENDLI qadoq mahsulotlar uchun
//      (Coca-Cola, Nescafé, Red Bull…): haqiqiy qadoq rasmi.
//   2) Openverse, faqat CC0/PDM (mualliflikdan voz kechilgan) — oddiy mahsulotlar uchun
//      (kartoshka, non, olma…).
// Har rasm bilan birga MANBA saqlanadi (Product.photoCredit) va mahsulot sahifasida ko'rsatiladi.
//
// ⚠️ CHEKLOV: bular STOK rasmlar — sizning javoningizdagi aynan o'sha mahsulot emas. Meva-sabzavot
// uchun bu odatiy amaliyot; qadoq mahsulotda esa brend mos kelmasa mijozni chalg'itadi, shuning
// uchun brend-nomli mahsulotga FAQAT OFF (haqiqiy qadoq) qidiriladi, Openverse'ga tushmaydi.
const UA = "BirJoy/1.0 (https://birjoy.online; open-licence product images)";

/** Rasm yuklab olishga RUXSAT ETILGAN hostlar. Ro'yxatdan tashqarisi rad etiladi — aks holda bu
 *  servis "istalgan URL'dan rasm tort" ga aylanardi (SSRF + o'zganing fotosi). */
const ALLOWED_HOSTS = [
  "images.openfoodfacts.org",
  "live.staticflickr.com",
  "upload.wikimedia.org",
  "images.rawpixel.com",
  "cdn.stocksnap.io",
  "farm1.staticflickr.com", "farm2.staticflickr.com", "farm3.staticflickr.com",
  "farm4.staticflickr.com", "farm5.staticflickr.com", "farm6.staticflickr.com", "farm8.staticflickr.com",
];

/** Openverse'da SIFATLI (stok-uslub) rasm beradigan provayderlar — arxiv/hujjatli fotolar emas.
 *  Jonli sinovda ko'rindi: umumiy so'rov «Hilling potatoes, 1899» yoki «Banana freckle» (kasallik)
 *  kabi natijalar berardi — bunday rasm mahsulot kartasida hozirgi gradientdan ham yomon. */
const GOOD_PROVIDERS = new Set(["rawpixel", "stocksnap", "flickr", "wikimedia"]);

export interface FoundPhoto {
  url: string;
  title: string;
  source: "openfoodfacts" | "openverse";
  license: string;
  credit: string;
}

/** O'zbekcha nomdan inglizcha qidiruv-so'zi. Eng UZUN mos kalit g'olib (masalan «ko'k choy» —
 *  «choy» dan oldin tekshiriladi). Ro'yxat jonli katalogdagi 226 nomdan chiqarilgan. */
const UZ_EN: [string, string][] = [
  // brendlar (OFF'ga boradi)
  ["coca-cola", "coca cola"], ["fanta", "fanta"], ["sprite", "sprite"], ["pepsi", "pepsi"],
  ["red bull", "red bull"], ["adrenaline", "adrenaline rush drink"], ["hell energy", "hell energy drink"],
  ["nescaf", "nescafe"], ["frisolac", "baby formula"], ["flash up", "energy drink"], ["non-stop", "energy drink"],
  // ichimlik
  ["ichimlik suvi", "bottled water"], ["mineral suv", "mineral water bottle"],
  ["apelsin sharbati", "orange juice"], ["olma sharbati", "apple juice"], ["shaftoli nektari", "peach juice"],
  ["multifrukt", "fruit juice"], ["limonad", "lemonade bottle"], ["sharbat", "juice"],
  ["ko'k choy paketda", "green tea bags"], ["qora choy paketda", "black tea bags"],
  ["ko'k choy", "green tea"], ["qora choy", "black tea"], ["mevali choy", "hibiscus tea"],
  ["3-in-1 qahva", "instant coffee"], ["qahva donasi", "coffee beans"], ["qahva", "coffee"],
  // sabzavot-meva
  ["kartoshka fri", "french fries"], ["kartoshka chipsi", "potato chips"], ["kartoshka pyuresi", "mashed potato"],
  ["kartoshka", "potato"], ["piyoz", "onion"], ["ko'k piyoz", "green onion"], ["sabzi", "carrot"],
  ["pomidor pastasi", "tomato paste"], ["pomidor", "tomato"], ["bodring", "cucumber"],
  ["bulg'or qalampiri", "bell pepper"], ["baqlajon", "eggplant"], ["oq karam", "cabbage"],
  ["pekin karami", "napa cabbage"], ["sarimsoq kukuni", "garlic powder"], ["sarimsoq", "garlic"],
  ["qizil turp", "radish"], ["lavlagi", "beetroot"], ["rayhon", "basil"], ["shivit", "dill"],
  ["oshqovoq", "pumpkin"], ["olma", "apple"], ["shaftoli", "peach"], ["o'rik", "apricot"],
  ["tarvuz", "watermelon"], ["qovun", "melon"], ["qulupnay", "strawberry"], ["banan", "banana"],
  ["nok", "pear"], ["apelsin", "orange fruit"], ["limon", "lemon"], ["anor", "pomegranate"],
  ["mandarin", "mandarin fruit"], ["husayni uzum", "green grapes"], ["qora uzum", "black grapes"], ["uzum", "grapes"],
  // yong'oq, quruq meva
  ["bodom", "almonds"], ["yeryong'oq", "peanuts"], ["yong'oq mag'zi", "walnut kernels"],
  ["yong'oq assorti", "mixed nuts"], ["pista", "pistachios"], ["oq mayiz", "raisins"],
  ["qora mayiz", "black raisins"], ["turshak", "dried apricots"], ["xurmo", "dates fruit"], ["kunjut urug'i", "sesame seeds"],
  // non, shirinlik
  ["toshkent noni", "flatbread"], ["obi non", "flatbread"], ["patir non", "flatbread"],
  ["baton", "white bread loaf"], ["qora non", "rye bread"], ["yupqa lavash", "lavash bread"],
  ["shirin bulochka", "sweet bun"], ["suxarik", "rusks bread"], ["tuzli kreker", "crackers"],
  ["napoleon torti", "layer cake"], ["medovik", "honey cake"], ["shokoladli tort", "chocolate cake"],
  ["cheesecake", "cheesecake"], ["keks", "muffin cake"], ["shokoladli rulet", "chocolate roll cake"],
  ["pirojnoe", "pastry"], ["ekler", "eclair"], ["qatlama", "flaky pastry"], ["somsa", "samosa pastry"],
  ["vafli tort", "wafer cake"], ["marmelad", "marmalade candy"], ["zefir", "marshmallow"],
  ["oq shokolad", "white chocolate"], ["qora shokolad", "dark chocolate"], ["sut shokoladi", "milk chocolate"],
  ["shokoladli pechenye", "chocolate cookies"], ["yulafli pechenye", "oat cookies"],
  ["bolalar pechenyesi", "biscuits"], ["konfet", "candy sweets"], ["halva", "halva"], ["novvot", "rock sugar"],
  // muzqaymoq
  ["plombir", "ice cream cone"], ["eskimo", "ice cream bar"], ["pistali muzqaymoq", "pistachio ice cream"],
  ["qulupnayli rojok", "strawberry ice cream cone"], ["muzqaymoq tort", "ice cream cake"], ["muzqaymoq", "ice cream"],
  // sut
  ["sut aralashmasi", "baby formula"], ["bolalar suti", "milk carton"], ["quyultirilgan sut", "condensed milk"],
  ["sut ", "milk bottle"], ["ayron", "ayran drink"], ["suzma", "strained yogurt"], ["smetana", "sour cream"],
  ["kefir", "kefir"], ["qatiq", "yogurt"], ["mevali yogurt", "fruit yogurt"], ["tvorog", "cottage cheese"],
  ["sariyog'", "butter"], ["margarin", "margarine"], ["pishloq", "cheese"], ["suluguni", "suluguni cheese"],
  ["brinza", "feta cheese"], ["mozzarella", "mozzarella"], ["eritilgan pishloq", "processed cheese"],
  // go'sht, baliq, tuxum
  ["mol go'shti", "beef meat"], ["mol qiymasi", "ground beef"], ["mol jigari", "beef liver"],
  ["qo'y go'shti", "lamb meat"], ["qo'y qovurg'asi", "lamb ribs"], ["dumba yog'i", "lamb fat"],
  ["tovuq son", "chicken thighs"], ["tovuq filesi", "chicken breast"], ["tovuq (butun)", "whole chicken"],
  ["tovuqli nagets", "chicken nuggets"], ["kazi", "horse sausage"], ["vetchina", "ham meat"],
  ["salyami", "salami"], ["servelat", "smoked sausage"], ["varyoniy kolbasa", "boiled sausage"],
  ["sutli sosiska", "sausages"], ["tovuqli sosiska", "chicken sausages"], ["barbekyu sosiska", "grilled sausages"],
  ["sazan", "carp fish"], ["forel", "trout fish"], ["losos", "salmon fillet"], ["skumbriya", "mackerel fish"],
  ["seld", "herring fish"], ["baliq filesi", "fish fillet"], ["qisqichbaqa", "shrimp"],
  ["tovuq tuxumi", "eggs"], ["bedana tuxumi", "quail eggs"], ["uy tuxumi", "eggs"],
  // yorma, makaron, dukkakli, yog'
  ["devzira guruch", "rice grain"], ["lazer guruch", "rice grain"], ["guruch", "rice"],
  ["grechka", "buckwheat"], ["manniy yormasi", "semolina"], ["suli yormasi", "oat flakes"],
  ["bug'doy yormasi", "wheat groats"], ["makkajo'xori yormasi", "corn grits"], ["oliy nav un", "wheat flour"],
  ["shakar", "sugar"], ["spagetti", "spaghetti"], ["spiral makaron", "fusilli pasta"],
  ["rojki makaron", "elbow pasta"], ["perya makaron", "penne pasta"], ["vermishel", "vermicelli pasta"],
  ["lag'mon", "noodles"], ["lazanya", "lasagna sheets"], ["makaron", "pasta"],
  ["mosh", "mung beans"], ["oq loviya", "white beans"], ["qizil loviya", "red beans"],
  ["yasmiq", "lentils"], ["no'xat", "chickpeas"], ["soya donasi", "soybeans"],
  ["kungaboqar yog'i", "sunflower oil"], ["makkajo'xori yog'i", "corn oil"], ["kunjut yog'i", "sesame oil"],
  ["paxta yog'i", "cottonseed oil"], ["zaytun yog'i", "olive oil"],
  // ziravor, konserva, asal
  ["yodlangan tuz", "salt"], ["qora murch", "black pepper"], ["qizil achchiq murch", "chili pepper"],
  ["zira", "cumin seeds"], ["kashnich urug'i", "coriander seeds"], ["lavr bargi", "bay leaves"],
  ["za'faron", "saffron"], ["kabob ziravori", "spice mix"], ["osh ziravori", "spice mix"],
  ["tushonka", "canned meat"], ["tovuq tushonkasi", "canned chicken"], ["sardina konservasi", "canned sardines"],
  ["tunes konservasi", "canned tuna"], ["konserva no'xat", "canned peas"], ["konserva makkajo'xori", "canned corn"],
  ["marinadlangan bodring", "pickled cucumbers"], ["oq asal", "honey jar"], ["tog' asali", "honey jar"],
  ["asal", "honey"], ["murabbo", "jam jar"],
  // muzlatilgan, tayyor
  ["manti", "dumplings"], ["pelmen", "dumplings"], ["chuchvara", "dumplings"],
  ["slonniy xamir", "puff pastry dough"], ["muzlatilgan sabzavot", "frozen vegetables"],
  ["muzlatilgan qulupnay", "frozen strawberries"], ["popkorn", "popcorn"],
  ["tez tayyor sho'rva", "instant soup"], ["bolalar bo'tqasi", "baby porridge"], ["meva pyuresi", "baby food puree"],
];

/** Nomdan inglizcha so'z topish (eng uzun mos kalit). Topilmasa null — bunday mahsulot
 *  TEGILMAYDI (noto'g'ri rasm qo'yishdan ko'ra rasmsiz qolgani yaxshi). */
export function searchTermFor(name: string): { term: string; brandLike: boolean } | null {
  const n = name.toLowerCase().replace(/[ʻʼ‘’`´]/g, "'");
  let best: { key: string; term: string } | null = null;
  for (const [key, term] of UZ_EN) {
    if (n.includes(key) && (!best || key.length > best.key.length)) best = { key, term };
  }
  if (!best) return null;
  const brandLike = ["coca cola", "fanta", "sprite", "pepsi", "red bull", "nescafe"].includes(best.term);
  return { term: best.term, brandLike };
}

/** Open Food Facts matn-qidiruvi — brendli qadoq mahsulot uchun HAQIQIY qadoq rasmi. */
export async function searchOpenFoodPhoto(term: string): Promise<FoundPhoto | null> {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&json=1&page_size=5&fields=product_name,brands,image_front_url`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { products?: { product_name?: string; image_front_url?: string }[] };
    // ⚠️ QATTIQ FILTR (jonli dry-run saboqlari, 2026-07-28): OFF matn-qidiruvi «sugar» so'roviga
    // «KRISPROLLS Complets» (non), «corn oil» ga «Nachos», «white beans» ga «Coffee Beans»
    // qaytardi — ya'ni mahsulot nomida so'rov so'zi BO'LMASA moslik yolg'on. Endi nomda
    // so'rovning MA'NOLI so'zlari (3 harfdan uzun) BO'LISHI shart.
    // So'z-CHEGARALI moslik va 3 harfli so'zlar ham hisobga olinadi: «sesame oil» da "oil"
    // tashlansa «Organic Sesame Biscuits» o'tib ketardi; substring bo'lsa «white beans»
    // «CoffeeBEANS» ga mos kelardi. Ikkalasi ham jonli dry-run'da chiqdi.
    const need = term.split(" ").filter((w) => w.length >= 3).map((w) => w.toLowerCase());
    const wordIn = (hay: string, w: string): boolean => new RegExp("\\b" + w.replace(/[^a-z0-9]/gi, "") + "\\b", "i").test(hay);
    const hit = (d.products ?? []).find((p) => {
      if (!p.image_front_url || !p.product_name) return false;
      const nm = p.product_name.toLowerCase();
      return need.length === 0 || need.every((w) => wordIn(nm, w));
    });
    if (!hit) return null;
    return { url: hit.image_front_url!, title: hit.product_name!, source: "openfoodfacts", license: "CC BY-SA", credit: `Open Food Facts (CC BY-SA) · ${hit.product_name}` };
  } catch {
    return null;
  }
}

/** Openverse — FAQAT CC0/PDM (mualliflik talab qilinmaydi). «white background» so'rovi stok-uslub
 *  natija beradi; provayder oq ro'yxati arxiv fotolarini chetlab o'tadi. */
export async function searchOpenversePhoto(term: string): Promise<FoundPhoto | null> {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(term + " white background")}&license=cc0,pdm&page_size=12&mature=false`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { results?: { title?: string; url?: string; license?: string; provider?: string; creator?: string }[] };
    const words = term.split(" ").filter((w) => w.length >= 3);
    const wordIn = (hay: string, w: string): boolean => new RegExp("\\b" + w.replace(/[^a-z0-9]/gi, "") + "\\b", "i").test(hay);
    // ⚠️ SHOVQIN-SO'ZLAR (jonli dry-run): «buckwheat» so'rovi «Bee atop California buckwheat»
    // (asalari!) ni, «potato» esa 1899-yilgi dala fotosini qaytargan edi. Bunday hujjatli/tabiat
    // fotosi mahsulot kartasida hozirgi gradientdan ham yomon ko'rinadi.
    const NOISE = new RegExp("\b(bee|bees|insect|beetle|disease|freckle|pest|farm|field|harvest|plantation|museum|vintage|worker|recipe|salad|soup)\b|\b(18|19)\d\d\b", "i");
    const ok = (r: { title?: string; provider?: string }): boolean => {
      const title = (r.title ?? "").toLowerCase();
      if (!r.provider || !GOOD_PROVIDERS.has(r.provider)) return false;
      if (NOISE.test(title)) return false;
      // sarlavhada so'rovning HAR ma'noli so'zi bo'lishi shart (avval "biror biri" edi)
      return words.length === 0 || words.every((w) => wordIn(title, w));
    };
    const hit = (d.results ?? []).find((r) => r.url && ok(r));
    if (!hit?.url) return null;
    return {
      url: hit.url,
      title: hit.title ?? term,
      source: "openverse",
      license: (hit.license ?? "cc0").toUpperCase(),
      credit: `${hit.title ?? term} · ${hit.creator ?? "noma'lum"} (${(hit.license ?? "cc0").toUpperCase()}) · Openverse`,
    };
  } catch {
    return null;
  }
}

export async function findPhotoFor(name: string): Promise<FoundPhoto | null> {
  const t = searchTermFor(name);
  if (!t) return null;
  // Brendli qadoq → faqat OFF (haqiqiy qadoq). Openverse'dagi tasodifiy foto brendni
  // noto'g'ri ko'rsatib mijozni chalg'itardi.
  if (t.brandLike) return await searchOpenFoodPhoto(t.term);
  return (await searchOpenversePhoto(t.term)) ?? (await searchOpenFoodPhoto(t.term));
}

export async function downloadPhoto(url: string): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const host = new URL(url).hostname;
    if (!ALLOWED_HOSTS.includes(host)) return null;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000 || buf.length > 5 * 1024 * 1024) return null;
    return { buf, mime };
  } catch {
    return null;
  }
}
