import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function nextPatchVersion(version) {
  const match = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Unsupported release version: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function replaceSingle(source, pattern, replacement, label) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) || [];
  if (matches.length !== 1) throw new Error(`${label} must match exactly once; found ${matches.length}.`);
  return source.replace(pattern, replacement);
}

export function updateGradleVersion(source, version, versionCode) {
  const withCode = replaceSingle(source, /\bversionCode\s+\d+/, `versionCode ${versionCode}`, "Android versionCode");
  return replaceSingle(withCode, /\bversionName\s+["'][^"']+["']/, `versionName "${version}"`, "Android versionName");
}

export function updateCargoVersion(source, version) {
  return replaceSingle(source, /(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/, `$1"${version}"`, "Tauri Cargo version");
}

async function main() {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const gradleSource = await readFile("android/app/build.gradle", "utf8");
  const codeMatch = gradleSource.match(/\bversionCode\s+(\d+)/);
  if (!codeMatch) throw new Error("Android versionCode could not be read.");

  const version = nextPatchVersion(packageJson.version);
  const versionCode = Number(codeMatch[1]) + 1;
  packageJson.version = version;
  packageLock.version = version;
  if (!packageLock.packages?.[""]) throw new Error("Root package-lock entry is missing.");
  packageLock.packages[""].version = version;

  const cargoSource = await readFile("src-tauri/Cargo.toml", "utf8");
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  tauriConfig.version = version;

  await Promise.all([
    writeFile("package.json", `${JSON.stringify(packageJson, null, 2)}\n`, "utf8"),
    writeFile("package-lock.json", `${JSON.stringify(packageLock, null, 2)}\n`, "utf8"),
    writeFile("android/app/build.gradle", updateGradleVersion(gradleSource, version, versionCode), "utf8"),
    writeFile("app/lib/app-version.ts", `export const APP_VERSION="${version}";\n`, "utf8"),
    writeFile("src-tauri/Cargo.toml", updateCargoVersion(cargoSource, version), "utf8"),
    writeFile("src-tauri/tauri.conf.json", `${JSON.stringify(tauriConfig, null, 2)}\n`, "utf8"),
  ]);

  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, `version=${version}\nversion_code=${versionCode}\n`, { encoding: "utf8", flag: "a" });
  }
  process.stdout.write(`Prepared PicSecure Renew ${version} (Android ${versionCode}).\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
