import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const OUTPUT = "PicSecure-Renew-update.json";

export function extractAndroidVersion(gradleSource) {
  const code = gradleSource.match(/\bversionCode\s+(\d+)/)?.[1];
  const name = gradleSource.match(/\bversionName\s+["']([^"']+)["']/)?.[1];
  if (!code || !name) throw new Error("Android versionCode/versionName could not be read.");
  return { versionCode: Number(code), versionName: name };
}

export function createManifest({ buildId, version, versionCode, generatedAt }) {
  const normalizedBuildId = String(buildId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalizedBuildId)) throw new Error("A full 40-character Git build ID is required.");
  return {
    schemaVersion: 1,
    buildId: normalizedBuildId,
    version,
    generatedAt,
    platforms: {
      android: { assetName: "PicSecure-Renew.apk", versionCode },
      windows: { assetName: "PicSecure-Renew-Windows.exe" },
    },
  };
}

async function main() {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const android = extractAndroidVersion(await readFile("android/app/build.gradle", "utf8"));
  const appVersion = (await readFile("app/lib/app-version.ts", "utf8")).match(/APP_VERSION=["']([^"']+)["']/)?.[1];
  const cargoVersion = (await readFile("src-tauri/Cargo.toml", "utf8")).match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];
  const tauriVersion = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8")).version;
  const versions = [packageJson.version, android.versionName, appVersion, cargoVersion, tauriVersion];
  if (versions.some((version) => version !== packageJson.version)) {
    throw new Error(`Native release versions do not match: ${versions.join(", ")}`);
  }
  const buildId = process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const manifest = createManifest({
    buildId,
    version: packageJson.version,
    versionCode: android.versionCode,
    generatedAt: new Date().toISOString(),
  });
  await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Created ${OUTPUT} for ${manifest.buildId}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
