// node --test tests/svara-monitor.test.mjs — the Svara services monitor: status from the owner-only deep check,
// alerts at once on a failure (once a day while it lasts), no alert for things Svara skips on purpose, offline is
// not a failure, the token is sent as a bearer header and never stored in the result.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "svara-monitor-"));
const out = join(dir, "monitor.mjs");
await build({ entryPoints: [new URL("../app/lib/svara-monitor.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "neutral", outfile: out, external: ["@capacitor/*", "@tauri-apps/*"], logLevel: "silent" });

// A browser-like window: localStorage, events, Notification, and a fake Svara server.
const store = new Map(), shown = [];
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = Object.assign(new EventTarget(), { localStorage: globalThis.localStorage, setTimeout, clearTimeout, setInterval, clearInterval });
class FakeNotification { static permission = "granted"; constructor(title, o) { shown.push({ title, body: o.body }) } }
globalThis.Notification = window.Notification = FakeNotification;
let reply = () => new Response("{}"), lastInit = null, lastUrl = "";
globalThis.fetch = async (url, init) => { lastUrl = String(url); lastInit = init; return reply(); };
const m = await import(out);
test.after(() => rmSync(dir, { recursive: true, force: true }));
const check = async manual => { const r = await m.checkSvara(manual); await m.lastAlerts; return r; };

const healthy = { ok: true, wikipedia: "ok", duckduckgo: "ok", gemini: "ok", liveSearch: "off", gemma: "busy", groq: "ok", mistral: "off", sambanova: "off", requesty: "ok", openrouter: "ok", zai: "ok", tavily: "ok", exa: "ok", firecrawl: "set", database: "ok", backupAI: "ok", why: { liveSearch: "not on the free plan", mistral: "needs a paid plan on this account — skipped, nothing is billed", gemma: "busy on its side right now" }, checkedAt: 1 };
const json = (b, status = 200) => () => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

test("healthy server: everything working, skipped-on-purpose services are not alerts, token sent as bearer", async () => {
  m.saveSvaraConfig({ endpoint: "https://svara-ask.picsecure-svara.workers.dev/ask", token: " owner-token " });
  assert.equal(m.getSvaraConfig().endpoint, "https://svara-ask.picsecure-svara.workers.dev", "/ask is trimmed to the server");
  reply = json(healthy); shown.length = 0;
  const r = await check(true);
  assert.equal(lastUrl, "https://svara-ask.picsecure-svara.workers.dev/health?deep=1&fresh=1");
  assert.equal(lastInit.headers.Authorization, "Bearer owner-token");
  assert.equal(r.error, undefined);
  const v = Object.fromEntries(m.SVARA_SERVICES.map(s => [s.id, m.describe(s, r).state]));
  assert.equal(v.gemini, "ok"); assert.equal(v.cloudflare, "ok"); assert.equal(v.mistral, "unused"); assert.equal(v.sambanova, "unused");
  assert.equal(v["live-search"], "unused"); assert.equal(v.gemma, "busy"); assert.equal(v.firecrawl, "set"); assert.equal(v.mdn, "static");
  assert.equal(shown.filter(n => !/deadline/i.test(n.title)).length, 0, "no alert when nothing is wrong");
  assert.ok(!JSON.stringify(store.get("picsecure-renew.svara.result.v1")).includes("owner-token"), "the result never holds the token");
});

test("a failing key alerts at once, then not again for a day; working again clears it", async () => {
  reply = json({ ...healthy, groq: "fail", why: { groq: "HTTP 401 (openai/gpt-oss-120b): Invalid API Key" } }); shown.length = 0;
  const r = await check(false);
  assert.equal(m.describe(m.SVARA_SERVICES.find(s => s.id === "groq"), r).state, "fail");
  assert.equal(shown.filter(n => /Groq stopped working/.test(n.title)).length, 1);
  assert.match(shown.find(n => /Groq/.test(n.title)).body, /HTTP 401/);
  await check(false);
  assert.equal(shown.filter(n => /Groq/.test(n.title)).length, 1, "same failure: no repeat within 24 h");
  reply = json(healthy); await check(false);
  reply = json({ ...healthy, groq: "fail", why: { groq: "HTTP 401: Invalid API Key" } }); await check(false);
  assert.equal(shown.filter(n => /Groq/.test(n.title)).length, 2, "fixed, then broken again: alerts again");
});

test("a service that should work but is off, or busy when busy is not normal, needs attention", async () => {
  const r = { checkedAt: 1, status: { ...healthy, tavily: "off", database: "busy" }, why: {} };
  delete r.status.why;
  assert.equal(m.describe(m.SVARA_SERVICES.find(s => s.id === "tavily"), r).state, "fail");
  assert.equal(m.describe(m.SVARA_SERVICES.find(s => s.id === "cloudflare"), r).state, "fail");
});

test("wrong token and a down server alert; offline and rate limits do not and keep the last result", async () => {
  reply = json({ error: "token" }, 401); shown.length = 0;
  assert.equal((await check(true)).error, "token");
  assert.ok(shown.some(n => /token needed/.test(n.title)));
  reply = json(healthy); await check(false);
  const before = store.get("picsecure-renew.svara.result.v1");
  reply = json({ error: "slow_down" }, 429); shown.length = 0;
  assert.equal((await check(true)).error, "slow_down");
  globalThis.navigator ??= {}; Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  reply = () => { throw new TypeError("Failed to fetch") };
  assert.equal((await check(true)).error, "offline");
  assert.equal(store.get("picsecure-renew.svara.result.v1"), before, "last good result kept");
  assert.equal(shown.filter(n => !/deadline/i.test(n.title)).length, 0);
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  assert.equal((await check(true)).error, "unreachable");
  assert.ok(shown.some(n => /not answering/.test(n.title)));
});

test("only https server addresses; yearly Play deadline counted to the next 31 August", () => {
  assert.throws(() => m.cleanEndpoint("http://evil.example"));
  assert.equal(m.cleanEndpoint(""), m.SVARA_DEFAULT_ENDPOINT);
  assert.equal(m.nextYearly(8, 31, new Date(2026, 7, 1)).days, 30);
  assert.equal(m.nextYearly(8, 31, new Date(2026, 8, 1)).at.getFullYear(), 2027);
  const play = m.SVARA_SERVICES.find(s => s.id === "play-console");
  assert.equal(m.describe(play, null, new Date(2026, 7, 24)).state, "due");
  assert.ok(m.alertsFor({ checkedAt: 0, status: {}, why: {} }, new Date(2026, 7, 24)).some(a => /in 7 days/.test(a.title)));
});

test("wiring: screen, nav, monitor start, separate alert channel that renewal sync never cancels", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const note = readFileSync(new URL("../app/lib/notifications.ts", import.meta.url), "utf8");
  assert.match(page, /\{view==="svara"&&<SvaraServices\/>\}/);
  assert.match(page, /go\("svara"\)\}><Icon name="svara"\/><span>Svara services<\/span>/);
  assert.match(page, /if\(name==="svara"\)return <SvaraMark size=\{size\}\/>/, "Svara services uses the Svara logo");
  assert.match(page, /return startSvaraMonitor\(\)\},\[mounted\]\)/);
  assert.match(note, /channelId:"svara-services"/);
  assert.equal((note.match(/filter\(n=>!\(n\.extra as \{svaraAlert\?:boolean\}\|undefined\)\?\.svaraAlert\)/g) || []).length, 2);
  assert.match(readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8"), /generate_handler!\[schedule_notifications, clear_notifications, notify_now\]/);
  assert.match(readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8"), /notifyNow:/);
  const ui = readFileSync(new URL("../app/components/SvaraServices.tsx", import.meta.url), "utf8");
  assert.match(ui, /type="password"/, "the token field never shows the token");
  assert.doesNotMatch(ui, /\{token\}|value=\{getSvaraConfig\(\)\.token\}/, "a saved token is never put back on screen");
});

test("a used-up free limit is 'Limit reached' (its own count and alert), not a broken key", async () => {
  reply = json({ ...healthy, groq: "fail", tavily: "fail", why: { groq: "HTTP 429 (openai/gpt-oss-120b): Rate limit reached for requests | HTTP 429 (llama): too many requests", tavily: "HTTP 432: credits exhausted" } }); shown.length = 0;
  const r = await check(true);
  const state = id => m.describe(m.SVARA_SERVICES.find(s => s.id === id), r).state;
  assert.equal(state("groq"), "limit"); assert.equal(state("tavily"), "limit");
  assert.ok(shown.some(n => /Groq: free limit reached/.test(n.title)));
  assert.ok(!shown.some(n => /Groq stopped working/.test(n.title)));
  reply = json({ ...healthy, groq: "fail", why: { groq: "HTTP 429 | HTTP 401: Invalid API Key" } });
  assert.equal(m.describe(m.SVARA_SERVICES.find(s => s.id === "groq"), await check(true)).state, "fail", "one real failure among limits is a failure");
});

test("search finds services by name, key name, use, state words", () => {
  const r = { checkedAt: 1, status: { groq: "fail" }, why: { groq: "HTTP 429 rate limit" } };
  const find = q => m.SVARA_SERVICES.map(s => m.describe(s, r)).filter(v => m.matchesService(v, q, v.state === "limit" ? "Limit reached" : "")).map(v => v.service.id);
  assert.deepEqual(find("groq"), ["groq"]);
  assert.ok(find("GEMINI_KEY").includes("gemini") && find("GEMINI_KEY").includes("gemma"));
  for (const id of ["exa", "firecrawl", "tavily"]) assert.ok(find("web search").includes(id), id);
  assert.deepEqual(find("limit reached"), ["groq"]);
  assert.equal(find("").length, m.SVARA_SERVICES.length);
  assert.deepEqual(find("zzzz-nothing"), []);
});

test("thoughts: images and PDFs are stored owner-only in chunks under 1 MiB, cached for offline, removed with the thought", () => {
  const lib = readFileSync(new URL("../app/lib/thought-files.ts", import.meta.url), "utf8");
  const notes = readFileSync(new URL("../app/components/ThoughtNotes.tsx", import.meta.url), "utf8");
  const viewer = readFileSync(new URL("../app/components/ThoughtFiles.tsx", import.meta.url), "utf8");
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const fb = readFileSync(new URL("../app/lib/firebase-client.ts", import.meta.url), "utf8");
  assert.match(lib, /FILE_CHUNK = 900 \* 1024/); assert.match(lib, /MAX_FILE_BYTES = 15 \* 1024 \* 1024/);
  assert.match(lib, /"users",uid,"files",fileId,"chunks",String\(i\)/);
  assert.match(lib, /ACCEPT = "image\/\*,application\/pdf,\.pdf"/);
  assert.match(rules, /match \/users\/\{userId\}\/files\/\{fileId\}\/chunks\/\{chunkId\}/);
  assert.match(rules, /data\.data\.size\(\) <= 921600/); assert.match(rules, /allow update: if false;/);
  assert.ok(921600 === 900 * 1024 && Math.ceil(15 * 1024 * 1024 / (900 * 1024)) <= 18, "rules allow every chunk of the biggest file");
  assert.match(rules, /data\.n <= 18/);
  assert.match(fb, /cacheSizeBytes:400\*1024\*1024/);
  assert.match(notes, /void deleteFiles\(note\.files\?\?\[\]\)/, "deleting a thought deletes its files");
  assert.match(notes, /void deleteFiles\(uploaded\)/, "a failed save leaves no orphan files");
  assert.match(notes, /void deleteFiles\(removed\)/, "files removed in the editor are deleted after the save");
  assert.match(notes, /\(note\.files\?\?\[\]\)\.map\(f=>f\.name\)/, "search includes file names");
  assert.match(viewer, /pdf\.worker\.min\.mjs\?worker/, "PDF worker bundled as plain .js (Android WebView)");
  assert.match(viewer, /picsecure:close-top-overlay/, "Android back closes the viewer");
});

test("prepare: only images and PDFs, size limit, chunk count", async () => {
  // Built inside the project so the real firebase package resolves (never called here).
  const cache = new URL("../node_modules/.cache/renew-tests/", import.meta.url).pathname;
  const files = join(cache, `files-${process.pid}.mjs`);
  await build({ entryPoints: [new URL("../app/lib/thought-files.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "neutral", outfile: files, external: ["firebase/*", "@capacitor/*", "@tauri-apps/*"], logLevel: "silent" });
  globalThis.URL.createObjectURL ??= () => "blob:x";
  const t = await import(files);
  await assert.rejects(t.prepareFile(new File(["x"], "notes.txt", { type: "text/plain" })), /not an image or a PDF/);
  await assert.rejects(t.prepareFile(new File([new Uint8Array(16 * 1024 * 1024)], "big.pdf", { type: "application/pdf" })), /up to 15 MB/);
  const ok = await t.prepareFile(new File([new Uint8Array(2 * 1024 * 1024)], "plan.pdf", { type: "" }));
  assert.equal(ok.meta.type, "application/pdf"); assert.equal(ok.meta.chunks, 3); assert.equal(ok.meta.name, "plan.pdf");
  assert.equal(t.chunkCount(900 * 1024), 1); assert.equal(t.chunkCount(900 * 1024 + 1), 2);
  rmSync(files, { force: true });
});

test("free usage bars: used / limit from the server, limit reached at 100%, 90% alert, renewal time", async () => {
  const now = new Date("2026-11-26T10:00:00Z");
  reply = json({ ...healthy, usage: { tavily: { used: 950, limit: 1000, unit: "credits", period: "month" }, openrouter: { used: 50, limit: 50, unit: "requests", period: "day", resetsAt: "2026-11-27T00:00:00.000Z" }, groq: { used: 120, limit: 1000, unit: "requests", period: "day", model: "openai/gpt-oss-120b" }, bad: { used: "x", limit: 0 } } });
  shown.length = 0;
  const r = await check(true);
  assert.deepEqual(Object.keys(r.usage).sort(), ["groq", "openrouter", "tavily"], "malformed entries dropped");
  const v = id => m.describe(m.SVARA_SERVICES.find(s => s.id === id), r, now);
  assert.equal(v("tavily").state, "ok"); assert.equal(v("tavily").usage.used, 950);
  assert.equal(v("openrouter").state, "limit", "all free requests used → Limit reached");
  assert.equal(v("openrouter").resetsAt.toISOString(), "2026-11-27T00:00:00.000Z");
  assert.equal(v("groq").state, "ok"); assert.equal(v("groq").resetsAt.toISOString(), "2026-11-27T00:00:00.000Z", "Groq: next UTC midnight");
  const pac = v("gemini").resetsAt; assert.ok(pac > now && pac - now <= 86400000, "Gemini: next midnight in California");
  assert.equal(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hourCycle: "h23" }).format(pac), "00");
  assert.equal(v("tavily").resetsAt, undefined, "monthly plan date unknown → no made-up date");
  assert.ok(shown.some(n => /Tavily: 95% of free credits used/.test(n.title)), "90% alert");
  assert.ok(shown.some(n => /OpenRouter: free limit reached/.test(n.title)));
});
