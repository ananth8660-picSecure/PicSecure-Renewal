import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiBase = env.VITE_PICSECURE_API_BASE || "https://renewvault.ananthcolors.chatgpt.site";
  return {
    root: "native",
    envDir: process.cwd(),
    publicDir: resolve(process.cwd(), "public"),
    base: "./",
    plugins: [react()],
    server: { host: "127.0.0.1", port: 4174, strictPort: true },
    define: {
      __PICSECURE_API_BASE__: JSON.stringify(apiBase),
    },
    build: {
      outDir: "../dist-native",
      emptyOutDir: true,
      target: "es2022",
    },
  };
});
