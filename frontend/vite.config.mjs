import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 与 manifest 的统一网关前缀保持一致：/app/easyffmpeg
const BASE = "/app/easyffmpeg/";

export default defineConfig({
  base: BASE,
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: new URL("./index.html", import.meta.url).pathname,
        callback: new URL("./callback.html", import.meta.url).pathname
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      // 本地开发时把 API/WS 转给后端（后端同时挂载在 / 和网关前缀下）
      [`${BASE}api`]: {
        target: "http://localhost:5001",
        changeOrigin: true
      },
      [`${BASE}ws`]: {
        target: "ws://localhost:5001",
        ws: true
      }
    }
  }
});
