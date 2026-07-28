import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 🔖 Build shtampi: mijoz qaysi versiyani ochganini AYTIB berish uchun. Telegram Mini App'ni
// juda qattiq keshlaydi va "yangilanmadi" degan shikoyatni tekshirishning yagona ishonchli yo'li —
// ekranning o'zida sana ko'rsatish (ega 2026-07-28 da aynan shu holatga tushdi).
const BUILD_STAMP = new Date().toISOString().slice(0, 16).replace("T", " ");

export default defineConfig({
  define: { __BUILD_STAMP__: JSON.stringify(BUILD_STAMP) },
  plugins: [react()],
  resolve: {
    alias: {
      "@t1067/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: { allow: ["..", "../.."] },
    proxy: {
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
});
