import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": "http://127.0.0.1:8788",
      "/media": "http://127.0.0.1:8788",
    },
  },
});
