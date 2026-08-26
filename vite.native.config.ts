import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

function resolveBuildId(explicitBuildId:string){
  if(explicitBuildId.trim())return explicitBuildId.trim().toLowerCase();
  try{return execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim().toLowerCase()}
  catch{return "local-development-build"}
}

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
      __PICSECURE_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __PICSECURE_BUILD_ID__: JSON.stringify(resolveBuildId(env.VITE_PICSECURE_BUILD_ID||"")),
    },
    build: {
      outDir: "../dist-native",
      emptyOutDir: true,
      target: "es2022",
    },
  };
});
