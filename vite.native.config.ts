import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    root: "native",
    base: "./",
    plugins: [react()],
    server: { host: "127.0.0.1", port: 4174, strictPort: true },
    define: {
      __PICSECURE_API_BASE__: JSON.stringify(env.VITE_PICSECURE_API_BASE || ""),
    },
    build: {
      outDir: "../dist-native",
      emptyOutDir: true,
      target: "es2022",
    },
  };
});
