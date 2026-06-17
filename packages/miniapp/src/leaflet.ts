// Leaflet is BUNDLED (npm), NOT loaded from unpkg.com. The foreign CDN was slow/
// blocked in Uzbekistan and blanked the classic booking map for real users (the same
// failure booking3 already fixed by bundling). ensureLeaflet now just hands back the
// bundled module — same async signature so callers are unchanged.
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export function ensureLeaflet(): Promise<any> {
  (window as unknown as { L: unknown }).L = L; // some callers read the global
  return Promise.resolve(L);
}
