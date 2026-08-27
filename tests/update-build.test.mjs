import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isCurrentRelease, normalizeBuildId } from "../app/lib/update-build.js";
import { createManifest, extractAndroidVersion } from "../scripts/create-update-manifest.mjs";
import { nextPatchVersion, updateCargoVersion, updateGradleVersion } from "../scripts/bump-native-version.mjs";
import { cloudSnapshotAction, stableVaultFingerprint } from "../app/lib/cloud-restore.js";

const BUILD_A = "a".repeat(40);
const BUILD_B = "b".repeat(40);

test("the installed GitHub build is not offered again", () => {
  assert.equal(isCurrentRelease({ currentBuildId: BUILD_A.toUpperCase(), latestBuildId: BUILD_A, currentBuildTime: "2026-08-26T10:00:00Z", generatedAt: "2026-08-26T10:05:00Z" }), true);
});

test("a different newer GitHub build is offered", () => {
  assert.equal(isCurrentRelease({ currentBuildId: BUILD_A, latestBuildId: BUILD_B, currentBuildTime: "2026-08-26T10:00:00Z", generatedAt: "2026-08-26T11:00:00Z" }), false);
});

test("a local build newer than the rolling release is not downgraded", () => {
  assert.equal(isCurrentRelease({ currentBuildId: BUILD_B, latestBuildId: BUILD_A, currentBuildTime: "2026-08-26T12:00:00Z", generatedAt: "2026-08-26T11:00:00Z" }), true);
});

test("release manifest contains immutable build and Android metadata", () => {
  assert.deepEqual(extractAndroidVersion('versionCode 12\nversionName "0.6.0"'), { versionCode: 12, versionName: "0.6.0" });
  const manifest = createManifest({ buildId: BUILD_A, version: "0.6.0", versionCode: 12, generatedAt: "2026-08-26T12:00:00Z" });
  assert.equal(normalizeBuildId(manifest.buildId), BUILD_A);
  assert.equal(manifest.platforms.android.assetName, "PicSecure-Renew.apk");
  assert.equal(manifest.platforms.android.versionCode, 12);
});

test("native releases increment the patch version and Android version code", () => {
  assert.equal(nextPatchVersion("0.6.1"), "0.6.2");
  assert.match(updateGradleVersion('versionCode 13\nversionName "0.6.1"', "0.6.2", 14), /versionCode 14\nversionName "0\.6\.2"/);
  assert.match(updateCargoVersion('[package]\nname = "picsecure-renew"\nversion = "0.6.1"\n', "0.6.2"), /version = "0\.6\.2"/);
});

test("a fresh install waits for Firestore server data before creating an empty vault", () => {
  assert.equal(cloudSnapshotAction({ exists: false, fromCache: true }), "wait_for_server");
  assert.equal(cloudSnapshotAction({ exists: true, fromCache: false }), "load");
  assert.equal(cloudSnapshotAction({ exists: false, fromCache: false }), "create");
});

test("Firestore field ordering cannot trigger a repeated cloud write", () => {
  const local = {
    items: [{ id: "renewal-1", provider: "Zoho", active: true }],
    log: [],
    profile: { name: "Ananth", preferences: { accent: "cyan", compact: false } },
    settings: { smartReminders: true, registryRefresh: true },
    notes: [{ id: "thought-1", title: "Secure Moments" }],
  };
  const firestore = {
    settings: { registryRefresh: true, smartReminders: true },
    profile: { preferences: { compact: false, accent: "cyan" }, name: "Ananth" },
    notes: [{ title: "Secure Moments", id: "thought-1" }],
    log: [],
    items: [{ active: true, provider: "Zoho", id: "renewal-1" }],
  };

  assert.equal(stableVaultFingerprint(local), stableVaultFingerprint(firestore));
  assert.notEqual(stableVaultFingerprint(local), stableVaultFingerprint({ ...firestore, notes: [] }));
});

test("cloud writer schema stays aligned with Firestore security rules", async () => {
  const [client, rules] = await Promise.all([
    readFile("app/lib/cloud-sync.ts", "utf8"),
    readFile("firestore.rules", "utf8"),
  ]);
  const clientSchemas = [...client.matchAll(/schemaVersion:(\d+)/g)].map((match) => Number(match[1]));
  const rulesSchema = Number(rules.match(/data\.schemaVersion\s*==\s*(\d+)/)?.[1]);
  assert.ok(clientSchemas.length > 0);
  assert.ok(Number.isInteger(rulesSchema));
  assert.deepEqual([...new Set(clientSchemas)], [rulesSchema]);
});

test("thoughts use acknowledged Firestore writes instead of app localStorage", async () => {
  const [page, cloudSync, thoughts] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/lib/cloud-sync.ts", "utf8"),
    readFile("app/components/ThoughtNotes.tsx", "utf8"),
  ]);
  assert.doesNotMatch(page, /localStorage\.setItem\(KEYS\.notes/);
  assert.match(page, /await saveCloudNotes\(next\)/);
  assert.match(page, /cloudSync\.ready&&cloudSync\.status!=="offline"/);
  assert.match(cloudSync, /await setDoc\(doc\(db,"users",active\.uid,"vault","main"\)/);
  assert.match(thoughts, /await onChange\(/);
  assert.match(thoughts, /Thought saved securely to Firestore/);
});

test("destructive actions use branded confirmation dialogs", async () => {
  const [page, thoughts] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/components/ThoughtNotes.tsx", "utf8"),
  ]);
  assert.doesNotMatch(`${page}\n${thoughts}`, /window\.confirm/);
  assert.match(page, /<ConfirmDialog open=\{Boolean\(confirmRenewal\)\}/);
  assert.match(thoughts, /<ConfirmDialog open=\{Boolean\(pendingDelete\)\}/);
});

test("native dialogs hide mobile navigation and keep primary actions touch friendly", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /app-shell:has\([^}]+\)>\.mobile-nav\{[^}]*visibility:hidden/);
  assert.match(css, /\.thought-editor\{[^}]*height:100dvh;[^}]*overflow:hidden/);
  assert.match(css, /\.thought-save\{min-height:54px;height:54px/);
  assert.match(css, /\.form-submit\{height:54px;min-height:54px/);
});
