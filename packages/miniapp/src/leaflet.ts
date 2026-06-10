// Loads Leaflet from CDN on demand (keeps the bundle small — no npm dep).
let loading: Promise<any> | null = null;

export function ensureLeaflet(): Promise<any> {
  const w = window as unknown as { L?: unknown };
  if (w.L) return Promise.resolve(w.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve((window as unknown as { L: unknown }).L);
    s.onerror = () => reject(new Error("leaflet load failed"));
    document.head.appendChild(s);
  });
  return loading;
}
