import assert from "node:assert/strict";
import test from "node:test";

test("renders the real empty vault without seeded demo renewals", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /Your vault is ready/i);
  assert.match(html, /Add your first renewal/i);
  assert.match(html, /Overview/i);
  assert.match(html, /Reminders/i);
  assert.match(html, /Activity/i);
  assert.match(html, /Firebase usage/i);
  assert.match(html, /Track\. Remind\. Renew\./i);
  assert.match(html, /favicon\.svg/i);
  assert.match(html, /favicon-16\.png/i);
  assert.match(html, /Welcome, Ananth\./i);
  assert.match(html, /RENEWAL OVERVIEW/i);
  assert.doesNotMatch(html, /Good (morning|afternoon|evening), Ananth\./i);
  assert.doesNotMatch(html, /Figma Professional/i);
  assert.doesNotMatch(html, /Cloudflare Pro/i);
  assert.doesNotMatch(html, /Zoho Mail Workplace/i);
});

test("Firebase usage API fails closed without server credentials", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("firebase-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/firebase-usage"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "setup_required");
  assert.doesNotMatch(JSON.stringify(body), /BEGIN PRIVATE KEY/);
});

test("native Firebase usage requests receive strict CORS headers", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("cors-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const response = await worker.fetch(new Request("http://localhost/api/firebase-usage", { headers: { Origin: "https://localhost" } }), env, ctx);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://localhost");
  const preflight = await worker.fetch(new Request("http://localhost/api/firebase-usage", { method: "OPTIONS", headers: { Origin: "capacitor://localhost" } }), env, ctx);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "capacitor://localhost");
});
