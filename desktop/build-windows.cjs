const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectDir = path.resolve(__dirname, "..");
const releaseDir = path.join(projectDir, "release");
const appStageDir = path.join(projectDir, ".desktop-app");
const builderCli = require.resolve("electron-builder/cli.js", { paths: [projectDir] });

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function removeWithRetry(target) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      return;
    } catch (error) {
      if (attempt === 4) return;
      pause(750 * attempt);
    }
  }
}

function copyInstaller(stagingDir) {
  const installer = fs.readdirSync(stagingDir)
    .filter((name) => /^PicSecure-Renew-Setup-.*\.exe$/i.test(name))
    .map((name) => path.join(stagingDir, name))[0];
  if (!installer) throw new Error("electron-builder completed but the NSIS installer was not found.");
  fs.mkdirSync(releaseDir, { recursive: true });
  const destination = path.join(releaseDir, path.basename(installer));
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      fs.copyFileSync(installer, destination);
      return destination;
    } catch (error) {
      if (attempt === 4) throw error;
      pause(750 * attempt);
    }
  }
}

function prepareMinimalDesktopApp() {
  removeWithRetry(appStageDir);
  fs.mkdirSync(path.join(appStageDir, "desktop"), { recursive: true });
  fs.mkdirSync(path.join(appStageDir, "public"), { recursive: true });
  fs.cpSync(path.join(projectDir, "dist-native"), path.join(appStageDir, "dist-native"), { recursive: true });
  fs.copyFileSync(path.join(projectDir, "desktop", "main.cjs"), path.join(appStageDir, "desktop", "main.cjs"));
  fs.copyFileSync(path.join(projectDir, "desktop", "preload.cjs"), path.join(appStageDir, "desktop", "preload.cjs"));
  fs.copyFileSync(path.join(projectDir, "public", "picsecure-renew-logo-512.png"), path.join(appStageDir, "public", "picsecure-renew-logo-512.png"));
  const sourcePackage = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  const appPackage = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    description: sourcePackage.description,
    author: sourcePackage.author,
    private: true,
    main: "desktop/main.cjs",
  };
  fs.writeFileSync(path.join(appStageDir, "package.json"), `${JSON.stringify(appPackage, null, 2)}\n`);
  const bytes = fs.statSync(path.join(appStageDir, "dist-native", "index.html")).size;
  console.log(`Prepared minimal desktop app without web build dependencies (${bytes} byte entry document).`);
}

if (process.env.PICSECURE_BUILDER_SELF_TEST === "1") {
  const check = spawnSync(process.execPath, [builderCli, "--version"], {
    cwd: projectDir,
    encoding: "utf8",
    windowsHide: true,
  });
  if (check.error) throw check.error;
  if (check.stdout) process.stdout.write(check.stdout);
  if (check.stderr) process.stderr.write(check.stderr);
  process.exit(check.status ?? 1);
}

if (process.env.PICSECURE_STAGE_SELF_TEST === "1") {
  prepareMinimalDesktopApp();
  if (fs.existsSync(path.join(appStageDir, "node_modules"))) throw new Error("Desktop stage must not contain node_modules.");
  const stagedPackage = JSON.parse(fs.readFileSync(path.join(appStageDir, "package.json"), "utf8"));
  if (stagedPackage.dependencies || stagedPackage.devDependencies) throw new Error("Desktop package must not declare web dependencies.");
  console.log(`Minimal desktop stage verified for ${stagedPackage.name}@${stagedPackage.version}.`);
  removeWithRetry(appStageDir);
  process.exit(0);
}

if (process.platform !== "win32") {
  console.error("Windows installer builds must run on Windows or the included GitHub Actions Windows runner.");
  process.exit(1);
}

prepareMinimalDesktopApp();
let finalError = "Unknown packaging error";
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "picsecure-renew-build-"));
  console.log(`\nPicSecure Renew packaging attempt ${attempt}/3`);
  console.log("Using a protected temporary staging directory to avoid Desktop folder locks.\n");
  const result = spawnSync(process.execPath, [
    builderCli,
    "--win",
    "nsis",
    "--publish",
    "never",
    `--config.directories.output=${stagingDir}`,
  ], {
    cwd: projectDir,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    windowsHide: false,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    finalError = `Could not launch electron-builder: ${result.error.message}`;
    removeWithRetry(stagingDir);
    break;
  }
  if (result.status === 0) {
    try {
      const destination = copyInstaller(stagingDir);
      removeWithRetry(stagingDir);
      removeWithRetry(appStageDir);
      console.log(`\nInstaller ready: ${destination}`);
      process.exit(0);
    } catch (error) {
      finalError = error instanceof Error ? error.message : String(error);
    }
  } else {
    const details = `${result.stderr || result.stdout || `electron-builder exited with ${result.status}${result.signal ? ` (signal ${result.signal})` : ""}`}`.trim();
    finalError = details;
    if (!/EPERM|EBUSY|operation not permitted|resource busy|being used by another process/i.test(details)) {
      removeWithRetry(stagingDir);
      break;
    }
  }
  removeWithRetry(stagingDir);
  if (attempt < 3) {
    console.log("\nWindows temporarily locked a packaging file. Waiting, then retrying automatically…");
    pause(2500 * attempt);
  }
}

removeWithRetry(appStageDir);
console.error("\nPicSecure Renew installer could not be packaged after three isolated attempts.");
console.error(finalError);
process.exit(1);
