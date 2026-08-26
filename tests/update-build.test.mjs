import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentRelease, normalizeBuildId } from "../app/lib/update-build.js";
import { createManifest, extractAndroidVersion } from "../scripts/create-update-manifest.mjs";
import { nextPatchVersion, updateCargoVersion, updateGradleVersion } from "../scripts/bump-native-version.mjs";

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
