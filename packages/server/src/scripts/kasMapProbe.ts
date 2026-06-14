// READ-ONLY: which map provider/tiles does kas1067 use (proven reachable on UZ networks)?
import "../env";
import { env } from "../env";
import { KasLiveSource } from "../kas/client";

const kas = new KasLiveSource({ baseUrl: env.KAS_BASE_URL, username: env.KAS_USERNAME, password: env.KAS_PASSWORD });
const KW = ["google", "ymaps", "yandex", "2gis", "mapbox", "leaflet", "tilelayer", "openstreetmap", "maptiler", "cartocdn", "tile.", "gis.uz", "maps.google", "vt/lyrs", "/vt?"];

async function main(): Promise<void> {
  await kas.login();
  for (const path of ["", "driverMap.html", "js/main/main.js"]) {
    try {
      const b = (await kas.getText(path, "*/*")).body.toLowerCase();
      const hits = KW.filter((k) => b.includes(k));
      console.log(`[${path || "shell"}] (${b.length}b) → ${hits.length ? hits.join(", ") : "no map-kw"}`);
      for (const k of hits.slice(0, 4)) {
        const i = b.indexOf(k);
        console.log(`    ${k}: ...${b.slice(Math.max(0, i - 20), i + 90).replace(/\s+/g, " ")}...`);
      }
    } catch (e) {
      console.log(`[${path}] ERR ${e instanceof Error ? e.message : e}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e instanceof Error ? e.message : e); process.exit(1); });
