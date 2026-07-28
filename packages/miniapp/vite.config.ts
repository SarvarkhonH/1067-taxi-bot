import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 🔖 Build shtampi: mijoz qaysi versiyani ochganini AYTIB berish uchun. Telegram Mini App'ni
// juda qattiq keshlaydi va "yangilanmadi" degan shikoyatni tekshirishning yagona ishonchli yo'li —
// ekranning o'zida sana ko'rsatish (ega 2026-07-28 da aynan shu holatga tushdi).
// Toshkent vaqti (UTC+5): ega soatiga qarab solishtira olsin — UTC ko'rsatsak "10:28" deb
// turardi-yu, telefonida 15:28 bo'lardi va shtamp shubha uyg'otardi.
const BUILD_STAMP = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

// ⚠️ NEGA `define` EMAS, `<meta>`: `define` shtampni JS bundle ichiga muhrlaydi va shtamp har
// build'da o'zgargani uchun BUNDLE HASH ham har deployda o'zgarardi — ya'ni faqat server kodi
// o'zgargan deployda ham har bir mijoz 78 KB (gzip) ni qayta yuklardi. `index.html` esa
// allaqachon `no-cache` bilan ketadi, shuning uchun shtamp O'SHA YERGA yoziladi: JS o'zgarmaydi,
// shtamp esa doim yangi.
export default defineConfig({
  plugins: [
    react(),
    {
      name: "birjoy-build-stamp",
      transformIndexHtml: {
        order: "pre" as const,
        handler: (html: string) => html.replace("</head>", `  <meta name="birjoy-build" content="${BUILD_STAMP}" />\n  </head>`),
      },
    },
  ],
  // 📦 React o'z chunkida. U DEPLOYDAN DEPLOYGA o'zgarmaydi, ilova kodi esa kuniga bir necha marta
  // o'zgaradi — bitta faylda bo'lsa mijoz har deployda IKKALASINI ham qayta yuklaydi. Ajratilgach
  // React'ning fayl nomi (va `immutable` keshi) joyida qoladi: takroriy deployda faqat ~23 KB
  // ilova kodi keladi, ~45 KB React emas. Birinchi yuklashda umumiy bayt o'zgarmaydi — yutuq
  // TAKRORIY ochishda, va u shtamp-ni `<meta>`ga ko'chirish bilan bir maqsadga xizmat qiladi.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
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
