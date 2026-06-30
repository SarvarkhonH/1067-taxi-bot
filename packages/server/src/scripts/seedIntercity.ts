// Seed the nationwide intercity city catalog (~50 cities, all 14 regions) + a few
// pilot route fares. Idempotent (upsert by name+region). Adds cities without a
// deploy: dotenv -e ../../.env -- tsx src/scripts/seedIntercity.ts
import "../env";
import { prisma } from "../db";
import { getOrCreateRoute } from "../services/intercityService";

interface CitySeed { name: string; nameRu?: string; region: string; lat: number; lng: number }

const CITIES: CitySeed[] = [
  // Toshkent shahri
  { name: "Toshkent", nameRu: "Ташкент", region: "toshkent_shahar", lat: 41.311, lng: 69.279 },
  // Toshkent viloyati
  { name: "Chirchiq", nameRu: "Чирчик", region: "toshkent", lat: 41.469, lng: 69.582 },
  { name: "Angren", nameRu: "Ангрен", region: "toshkent", lat: 41.017, lng: 70.143 },
  { name: "Olmaliq", nameRu: "Алмалык", region: "toshkent", lat: 40.844, lng: 69.598 },
  { name: "Bekobod", nameRu: "Бекабад", region: "toshkent", lat: 40.220, lng: 69.269 },
  { name: "Yangiyo'l", nameRu: "Янгиюль", region: "toshkent", lat: 41.112, lng: 69.046 },
  // Samarqand
  { name: "Samarqand", nameRu: "Самарканд", region: "samarqand", lat: 39.654, lng: 66.975 },
  { name: "Kattaqo'rg'on", nameRu: "Каттакурган", region: "samarqand", lat: 39.899, lng: 66.256 },
  // Buxoro
  { name: "Buxoro", nameRu: "Бухара", region: "buxoro", lat: 39.768, lng: 64.421 },
  { name: "Kogon", nameRu: "Каган", region: "buxoro", lat: 39.722, lng: 64.553 },
  // Qashqadaryo
  { name: "Qarshi", nameRu: "Карши", region: "qashqadaryo", lat: 38.860, lng: 65.799 },
  { name: "Shahrisabz", nameRu: "Шахрисабз", region: "qashqadaryo", lat: 39.058, lng: 66.829 },
  { name: "Kitob", nameRu: "Китаб", region: "qashqadaryo", lat: 39.112, lng: 66.881 },
  { name: "Koson", nameRu: "Касан", region: "qashqadaryo", lat: 39.040, lng: 65.590 },
  { name: "Muborak", nameRu: "Мубарек", region: "qashqadaryo", lat: 39.256, lng: 65.149 },
  // Surxondaryo
  { name: "Termiz", nameRu: "Термез", region: "surxondaryo", lat: 37.224, lng: 67.278 },
  { name: "Denov", nameRu: "Денау", region: "surxondaryo", lat: 38.268, lng: 67.896 },
  { name: "Boysun", nameRu: "Байсун", region: "surxondaryo", lat: 38.207, lng: 67.198 },
  // Navoiy
  { name: "Navoiy", nameRu: "Навои", region: "navoiy", lat: 40.084, lng: 65.379 },
  { name: "Zarafshon", nameRu: "Зарафшан", region: "navoiy", lat: 41.572, lng: 64.205 },
  // Xorazm
  { name: "Urganch", nameRu: "Ургенч", region: "xorazm", lat: 41.550, lng: 60.631 },
  { name: "Xiva", nameRu: "Хива", region: "xorazm", lat: 41.378, lng: 60.364 },
  // Qoraqalpog'iston
  { name: "Nukus", nameRu: "Нукус", region: "qoraqalpogiston", lat: 42.460, lng: 59.617 },
  { name: "Xo'jayli", nameRu: "Ходжейли", region: "qoraqalpogiston", lat: 42.405, lng: 59.452 },
  // Farg'ona
  { name: "Farg'ona", nameRu: "Фергана", region: "fargona", lat: 40.389, lng: 71.787 },
  { name: "Qo'qon", nameRu: "Коканд", region: "fargona", lat: 40.529, lng: 70.943 },
  { name: "Marg'ilon", nameRu: "Маргилан", region: "fargona", lat: 40.471, lng: 71.724 },
  // Andijon
  { name: "Andijon", nameRu: "Андижан", region: "andijon", lat: 40.783, lng: 72.344 },
  { name: "Asaka", nameRu: "Асака", region: "andijon", lat: 40.640, lng: 72.240 },
  // Namangan
  { name: "Namangan", nameRu: "Наманган", region: "namangan", lat: 40.998, lng: 71.672 },
  { name: "Chust", nameRu: "Чуст", region: "namangan", lat: 41.003, lng: 71.236 },
  // Sirdaryo
  { name: "Guliston", nameRu: "Гулистан", region: "sirdaryo", lat: 40.489, lng: 68.791 },
  { name: "Yangiyer", nameRu: "Янгиер", region: "sirdaryo", lat: 40.270, lng: 68.819 },
  // Jizzax
  { name: "Jizzax", nameRu: "Джизак", region: "jizzax", lat: 40.116, lng: 67.842 },
];

// Pilot route fares (per seat, som). commission stays 0 in pilot. distance/duration informational.
const ROUTE_FARES: { a: string; b: string; fareSom: number; km: number; durationMin: number }[] = [
  { a: "Koson", b: "Toshkent", fareSom: 120000, km: 550, durationMin: 480 },
  { a: "Qarshi", b: "Toshkent", fareSom: 110000, km: 520, durationMin: 450 },
  { a: "Samarqand", b: "Toshkent", fareSom: 80000, km: 300, durationMin: 240 },
];

async function main(): Promise<void> {
  let upserted = 0;
  const idByName = new Map<string, number>();
  for (const c of CITIES) {
    const row = await prisma.intercityCity.upsert({
      where: { name_regionCode: { name: c.name, regionCode: c.region } },
      update: { nameRu: c.nameRu ?? null, lat: c.lat, lng: c.lng, active: true },
      create: { name: c.name, nameRu: c.nameRu ?? null, regionCode: c.region, lat: c.lat, lng: c.lng },
    });
    idByName.set(c.name, row.id);
    upserted++;
  }

  let routes = 0;
  for (const r of ROUTE_FARES) {
    const aId = idByName.get(r.a);
    const bId = idByName.get(r.b);
    if (!aId || !bId) continue;
    const route = await getOrCreateRoute(aId, bId);
    if (!route) continue;
    await prisma.intercityRoute.update({ where: { id: route.id }, data: { defaultFareSom: r.fareSom, distanceKm: r.km, durationMin: r.durationMin } });
    routes++;
  }

  console.log(`✅ Intercity seed: ${upserted} cities upserted, ${routes} pilot route fares set.`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
