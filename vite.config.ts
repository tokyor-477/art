import { defineConfig } from "vite";

// ponytail: PWA(vite-plugin-pwa) は第一マイルストーン後に追加する
export default defineConfig({
  build: { target: "es2022" },
});
