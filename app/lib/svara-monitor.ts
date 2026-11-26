// Svara services monitor: every AI, search source, key and account PicSecure Svara uses, with a live check through
// the Svara server's owner-only /health?deep=1 (ok / busy / off / fail per service, never a key) and an alert the
// moment something stops working. Runs when the app opens and every 6 hours while it is open (the desktop app keeps
// running in the tray, so there it watches all day).
import { notifyNow } from "./notifications";

export const SVARA_DEFAULT_ENDPOINT = "https://svara-ask.picsecure-svara.workers.dev";
export const SVARA_CHECK_EVERY_MS = 6 * 3600_000;
export const SVARA_ALERT_REPEAT_MS = 24 * 3600_000;
const CONFIG_KEY = "picsecure-renew.svara.config.v1";
const RESULT_KEY = "picsecure-renew.svara.result.v1";
const ALERTS_KEY = "picsecure-renew.svara.alerts.v1";
export const SVARA_UPDATED_EVENT = "picsecure:svara-updated";

export type LiveStatus = "ok" | "busy" | "off" | "fail" | "set";
export type ServiceState = "ok" | "busy" | "limit" | "unused" | "fail" | "set" | "static" | "unknown" | "due";
/** A free limit / quota / rate limit ran out (it comes back by itself at the reset). */
export const LIMIT_REASON = /\bHTTP 429\b|quota|rate.?limit|too many requests|exhausted|insufficient (?:credits|balance)|out of credits|limit (?:reached|exceeded)/i;
export type SvaraService = {
  id: string; name: string; category: "Server" | "AI writer" | "Web search" | "Facts" | "Location" | "Updates" | "Security" | "Store" | "Phone";
  /** Keys in /health?deep=1 that tell this service's state (empty: nothing to check online). */
  health: string[];
  /** Svara skips it on purpose (no free API plan): "off" is normal, never an alert. */
  unusedOnPurpose?: boolean;
  /** Overloaded now and then on its side: "busy" is normal, never an alert. */
  busyIsNormal?: boolean;
  /** When the free limit comes back, for the countdown: midnight UTC, midnight in California (Google), or monthly. */
  reset?: "utc-day" | "pacific-day" | "month";
  /** Yearly deadline (month 1-12, day) to act on, alerted 30, 7 and 1 days before. */
  yearly?: { month: number; day: number; what: string };
  secret: string; usedFor: string; manageUrl: string; plan: string; limits: string; resets: string; watch: string;
};

export const SVARA_SERVICES: SvaraService[] = [
  { id: "cloudflare", reset: "utc-day", name: "Cloudflare (Worker, D1, Workers AI)", category: "Server", health: ["database", "backupAI"], secret: "wrangler login (on your PC)", usedFor: "Answer server, answer cache, backup AI writer", manageUrl: "https://dash.cloudflare.com", plan: "Workers Free", limits: "100,000 requests/day · Workers AI 10,000 neurons/day · D1 5 GB", resets: "Daily", watch: "Requests per day near the limit. No card on the account." },
  { id: "gemini", reset: "pacific-day", name: "Google Gemini API", category: "AI writer", health: ["gemini"], secret: "GEMINI_KEY", usedFor: "Main answer writer", manageUrl: "https://aistudio.google.com/apikey", plan: "Free tier", limits: "Per-model daily limits (AI Studio → Rate limits)", resets: "Daily", watch: "Never turn on billing. Model changes are handled by Svara; run a check after Google announces one." },
  { id: "live-search", reset: "pacific-day", name: "Google Search grounding (Gemini)", category: "AI writer", health: ["liveSearch"], unusedOnPurpose: true, secret: "GEMINI_KEY (same)", usedFor: "Today's facts straight from Google, when the project has it", manageUrl: "https://aistudio.google.com", plan: "Free only on Gemini 2.5 Flash / Flash-Lite", limits: "Shared with the Gemini key", resets: "Daily", watch: "Not given to some new Google projects — today's facts then come from web search. Not a fault." },
  { id: "gemma", reset: "pacific-day", name: "Google Gemma (via Gemini key)", category: "AI writer", health: ["gemma"], busyIsNormal: true, secret: "GEMINI_KEY (same)", usedFor: "Second answer writer", manageUrl: "https://aistudio.google.com", plan: "Free", limits: "Shared with the Gemini key", resets: "Daily", watch: "Often busy for a moment — normal, Svara uses the next writer." },
  { id: "groq", reset: "utc-day", name: "Groq", category: "AI writer", health: ["groq"], busyIsNormal: true, secret: "GROQ_KEY", usedFor: "Fast answer writer", manageUrl: "https://console.groq.com/keys", plan: "Free (no card)", limits: "~30 requests/min · ~1,000 requests/day per model", resets: "Daily", watch: "Never add billing." },
  { id: "requesty", name: "Requesty", category: "AI writer", health: ["requesty"], busyIsNormal: true, secret: "REQUESTY_KEY", usedFor: "Free-models router", manageUrl: "https://app.requesty.ai/api-keys", plan: "Free models only (balance $0)", limits: "Free model limits per model", resets: "Daily", watch: "Free model IDs have end dates: a failing check with HTTP 404 means a model was retired. Never Top Up." },
  { id: "openrouter", reset: "utc-day", name: "OpenRouter", category: "AI writer", health: ["openrouter"], busyIsNormal: true, secret: "OPENROUTER_KEY", usedFor: "Free-models router (free model IDs only)", manageUrl: "https://openrouter.ai/keys", plan: "Free (no credits)", limits: "20 requests/min · 50 requests/day", resets: "Daily", watch: "Never buy credits." },
  { id: "zai", name: "Z.ai (GLM Flash)", category: "AI writer", health: ["zai"], busyIsNormal: true, secret: "ZAI_KEY", usedFor: "Backup answer writer (free Flash models only)", manageUrl: "https://z.ai", plan: "Free Flash models", limits: "One request at a time", resets: "—", watch: "Never Top Up. FlashX is paid; Svara never sends it." },
  { id: "mistral", name: "Mistral AI", category: "AI writer", health: ["mistral"], unusedOnPurpose: true, secret: "MISTRAL_KEY", usedFor: "Not used — the API needs a paid plan on this account", manageUrl: "https://admin.mistral.ai", plan: "Free (Studio only)", limits: "—", resets: "—", watch: "Never enable pay-as-you-go. Svara skips it automatically." },
  { id: "sambanova", name: "SambaNova", category: "AI writer", health: ["sambanova"], unusedOnPurpose: true, secret: "SAMBANOVA_KEY (not set)", usedFor: "Not used — needs a card", manageUrl: "https://cloud.sambanova.ai", plan: "—", limits: "—", resets: "—", watch: "Keep unset." },
  { id: "tavily", reset: "month", name: "Tavily", category: "Web search", health: ["tavily"], secret: "TAVILY_KEY", usedFor: "Today's facts (news, prices, local) — first web search", manageUrl: "https://app.tavily.com", plan: "Researcher (free, no card)", limits: "1,000 credits/month", resets: "Monthly", watch: "Credits used this month. When out, Exa takes over." },
  { id: "exa", reset: "month", name: "Exa", category: "Web search", health: ["exa"], busyIsNormal: true, secret: "EXA_KEY", usedFor: "Second web search", manageUrl: "https://dashboard.exa.ai/api-keys", plan: "Free monthly credit (no card)", limits: "$10 credit/month", resets: "Monthly", watch: "Never add a card." },
  { id: "firecrawl", reset: "month", name: "Firecrawl", category: "Web search", health: ["firecrawl"], secret: "FIRECRAWL_KEY", usedFor: "Third web search (reserve, not spent by checks)", manageUrl: "https://www.firecrawl.dev/app/api-keys", plan: "Free (no card)", limits: "1,000 credits/month", resets: "Monthly", watch: "Only used when Tavily and Exa are out." },
  { id: "wikipedia", name: "Wikipedia API", category: "Facts", health: ["wikipedia"], secret: "No key", usedFor: "Facts about places and people (EN/TE/HI)", manageUrl: "https://www.mediawiki.org/wiki/API:Etiquette", plan: "Free", limits: "Fair use", resets: "—", watch: "Nothing to renew." },
  { id: "duckduckgo", name: "DuckDuckGo Instant Answers", category: "Facts", health: ["duckduckgo"], secret: "No key", usedFor: "Short facts and definitions", manageUrl: "https://duckduckgo.com/api", plan: "Free", limits: "Fair use", resets: "—", watch: "Nothing to renew." },
  { id: "mdn", name: "MDN Web Docs", category: "Facts", health: [], secret: "No key", usedFor: "Software-learning answers in the app", manageUrl: "https://developer.mozilla.org", plan: "Free", limits: "Fair use", resets: "—", watch: "Nothing to renew." },
  { id: "open-meteo", name: "Open-Meteo Geocoding", category: "Location", health: [], secret: "No key", usedFor: "Finding a home town not in Svara's list (once per town)", manageUrl: "https://open-meteo.com/en/pricing", plan: "Free API", limits: "Non-commercial use, under 10,000 calls/day", resets: "Daily", watch: "If Svara becomes a paid product: take Open-Meteo's commercial plan or switch geocoder." },
  { id: "firebase-hosting", name: "Firebase Hosting (live updates)", category: "Updates", health: [], secret: "firebase-tools login (on your PC)", usedFor: "Host for live app updates", manageUrl: "https://console.firebase.google.com", plan: "Spark (free)", limits: "10 GB storage · 360 MB/day transfer", resets: "Daily", watch: "Transfer per day as users grow — see the Firebase usage screen." },
  { id: "live-update-key", name: "Live-update signing key", category: "Security", health: [], secret: "Kept outside the project, on your PC", usedFor: "Signs live updates", manageUrl: "", plan: "—", limits: "—", resets: "—", watch: "Keep an offline backup. Never commit or share it." },
  { id: "upload-keystore", name: "Android upload keystore", category: "Security", health: [], secret: "Kept outside the project, on your PC", usedFor: "Signs the APK / AAB for Google Play", manageUrl: "https://play.google.com/console", plan: "—", limits: "—", resets: "—", watch: "Keep an offline backup. Add its certificate expiry date as a renewal (keytool -list -v shows it)." },
  { id: "play-console", name: "Google Play Console", category: "Store", health: [], yearly: { month: 8, day: 31, what: "Google Play target API level deadline" }, secret: "Google account", usedFor: "Publishing the Android app", manageUrl: "https://play.google.com/console", plan: "One-time developer fee", limits: "—", resets: "Yearly", watch: "Each year new apps and updates must target a recent Android API level (usually by 31 August)." },
  { id: "phone-speech", name: "Google speech & TTS on the phone", category: "Phone", health: [], secret: "No key", usedFor: "Speech recognition and reading answers aloud", manageUrl: "", plan: "Built into Android", limits: "—", resets: "—", watch: "Nothing to renew." },
];

export type SvaraConfig = { endpoint: string; token: string };
/** Free credits used / allowed, as the service itself reports it (Tavily, OpenRouter, Firecrawl, Groq). */
export type ServiceUsage = { used: number; limit: number; unit: string; period: "day" | "month"; resetsAt?: string; model?: string };
export type SvaraResult = {
  checkedAt: number;
  /** Server-side check time (it keeps one result 5 minutes). */
  serverCheckedAt?: number;
  error?: "token" | "unreachable" | "server" | "slow_down" | "offline";
  status: Record<string, LiveStatus>;
  why: Record<string, string>;
  usage?: Record<string, ServiceUsage>;
};
export type ServiceView = { service: SvaraService; state: ServiceState; reason: string; due?: { at: Date; days: number }; usage?: ServiceUsage; resetsAt?: Date };

/** Next time the free limit comes back, from the service's own date when it gives one, else from its rule. */
export function nextReset(service: SvaraService, usage?: ServiceUsage, now = new Date()): Date | undefined {
  const given = usage?.resetsAt ? new Date(usage.resetsAt) : null;
  if (given && !Number.isNaN(given.getTime()) && given > now) return given;
  if (service.reset === "utc-day") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  if (service.reset === "pacific-day") {
    // Midnight in America/Los_Angeles (Google's daily quota), found without a time-zone library.
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0) % 24;
    const passed = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000;
    return new Date(Math.ceil((now.getTime() - passed + 86400000) / 1000) * 1000);
  }
  return undefined;
}

const read = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or blocked: the next check tries again */ } };

export function cleanEndpoint(value: string) {
  const v = value.trim().replace(/\/+$/, "").replace(/\/(ask|health)$/, "");
  if (!v) return SVARA_DEFAULT_ENDPOINT;
  const url = new URL(v);
  if (url.protocol !== "https:") throw new Error("Use the https:// address of the Svara server.");
  return url.origin;
}
export function getSvaraConfig(): SvaraConfig {
  const c = read<Partial<SvaraConfig>>(CONFIG_KEY, {});
  return { endpoint: c.endpoint || SVARA_DEFAULT_ENDPOINT, token: c.token || "" };
}
export function saveSvaraConfig(next: Partial<SvaraConfig>) {
  const merged = { ...getSvaraConfig(), ...next };
  write(CONFIG_KEY, { endpoint: cleanEndpoint(merged.endpoint), token: merged.token.trim() });
}
export const getSvaraResult = () => read<SvaraResult | null>(RESULT_KEY, null);

/** The next yearly deadline on or after today, and how many days away it is. */
export function nextYearly(month: number, day: number, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let at = new Date(now.getFullYear(), month - 1, day);
  if (at < today) at = new Date(now.getFullYear() + 1, month - 1, day);
  return { at, days: Math.round((at.getTime() - today.getTime()) / 86400000) };
}

/** What each service looks like now, from the last check. */
export function describe(service: SvaraService, result: SvaraResult | null, now = new Date()): ServiceView {
  if (service.yearly) {
    const due = nextYearly(service.yearly.month, service.yearly.day, now);
    return { service, state: due.days <= 30 ? "due" : "static", reason: `${service.yearly.what}: ${due.at.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`, due };
  }
  if (!service.health.length) return { service, state: "static", reason: "" };
  const usage = result?.usage?.[service.id], resetsAt = nextReset(service, usage, now);
  const view = describeState(service, result);
  // Used up by its own count: the limit is reached even when the check call itself still got through.
  if (usage && usage.limit > 0 && usage.used >= usage.limit && (view.state === "ok" || view.state === "busy" || view.state === "set")) return { ...view, state: "limit", reason: view.reason || `All ${usage.limit} free ${usage.unit} of this ${usage.period} used`, usage, resetsAt };
  return { ...view, usage, resetsAt };
}

function describeState(service: SvaraService, result: SvaraResult | null): ServiceView {
  if (!result || result.error) return { service, state: "unknown", reason: "" };
  const states = service.health.map(k => result.status[k]).filter(Boolean) as LiveStatus[];
  const reason = service.health.map(k => result.why[k]).filter(Boolean).join(" · ");
  if (!states.length) return { service, state: "unknown", reason };
  if ((states.includes("fail") || states.includes("busy")) && reason && reason.split(/ \| | · /).every(part => LIMIT_REASON.test(part))) return { service, state: "limit", reason };
  if (states.includes("fail")) return { service, state: "fail", reason };
  if (states.includes("busy")) return { service, state: service.busyIsNormal ? "busy" : "fail", reason };
  if (states.includes("off")) return { service, state: service.unusedOnPurpose ? "unused" : "fail", reason: reason || "Not set on the Svara server" };
  if (states.every(s => s === "ok")) return { service, state: "ok", reason };
  return { service, state: "set", reason };
}

/** One check now. manual: asks the server to check again instead of reusing its 5-minute result. */
let running: Promise<SvaraResult> | null = null;
/** The alerts of the last check (tests wait on it). */
export let lastAlerts: Promise<void> = Promise.resolve();
export function checkSvara(manual = false): Promise<SvaraResult> {
  return running ??= (async () => {
    const { endpoint, token } = getSvaraConfig();
    const result: SvaraResult = { checkedAt: Date.now(), status: {}, why: {} };
    try {
      const res = await fetch(`${endpoint}/health?deep=1${manual ? "&fresh=1" : ""}`, {
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(45_000), cache: "no-store",
      });
      if (res.status === 401) result.error = "token";
      else if (res.status === 429) result.error = "slow_down";
      else if (!res.ok) result.error = "server";
      else {
        const body = await res.json() as Record<string, unknown>;
        for (const [k, v] of Object.entries(body)) if (typeof v === "string" && ["ok", "busy", "off", "fail", "set"].includes(v)) result.status[k] = v as LiveStatus;
        if (body.why && typeof body.why === "object") for (const [k, v] of Object.entries(body.why as Record<string, unknown>)) if (typeof v === "string") result.why[k] = v.slice(0, 300);
        if (typeof body.checkedAt === "number") result.serverCheckedAt = body.checkedAt;
        if (body.usage && typeof body.usage === "object") {
          result.usage = {};
          for (const [k, v] of Object.entries(body.usage as Record<string, Partial<ServiceUsage>>)) {
            if (v && typeof v.used === "number" && typeof v.limit === "number" && v.limit > 0 && Number.isFinite(v.used))
              result.usage[k] = { used: Math.max(0, v.used), limit: v.limit, unit: String(v.unit ?? "requests").slice(0, 20), period: v.period === "month" ? "month" : "day", ...(typeof v.resetsAt === "string" ? { resetsAt: v.resetsAt } : {}), ...(typeof v.model === "string" ? { model: v.model.slice(0, 80) } : {}) };
          }
        }
      }
    } catch { result.error = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "unreachable"; }
    // "Too many checks" or this device being offline is not news about the services: keep the last result, no alert.
    if (result.error === "slow_down" || result.error === "offline") return result;
    write(RESULT_KEY, result);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SVARA_UPDATED_EVENT));
    // Alerts never hold the check: a notification-permission prompt left unanswered must not keep "Checking…".
    lastAlerts = alertChanges(result).catch(() => {});
    return result;
  })().finally(() => { running = null });
}

/** What needs an alert in this result (each at most once a day while it lasts). Exported for tests. */
export function alertsFor(result: SvaraResult, now = new Date()) {
  const out: { key: string; title: string; body: string }[] = [];
  if (result.error === "token") out.push({ key: "token", title: "Svara monitor: token needed", body: "The Svara server refused the check. Run npm run ai:token on your PC and paste the token in Svara services." });
  else if (result.error === "unreachable" || result.error === "server") out.push({ key: "server", title: "Svara server not answering", body: "PicSecure Renew could not reach the Svara server. Open Svara services → Check now; if it stays down, open the Cloudflare dashboard." });
  else if (!result.error) for (const s of SVARA_SERVICES) {
    const v = describe(s, result, now);
    if (v.state === "fail") out.push({ key: s.id, title: `${s.name} stopped working`, body: v.reason ? `Reason: ${v.reason}` : `Open ${s.manageUrl || "its dashboard"} and check the key and free plan.` });
    else if (v.state === "limit") out.push({ key: `${s.id}:limit`, title: `${s.name}: free limit reached`, body: `Comes back at the reset (${s.resets}). Svara uses the next service meanwhile. ${v.reason}`.slice(0, 400) });
    else if (v.usage && v.usage.used / v.usage.limit >= 0.9) out.push({ key: `${s.id}:90:${v.usage.period}:${(v.resetsAt ?? now).toISOString().slice(0, 10)}`, title: `${s.name}: ${Math.round(v.usage.used / v.usage.limit * 100)}% of free ${v.usage.unit} used`, body: `${v.usage.limit - v.usage.used} ${v.usage.unit} left this ${v.usage.period}.${v.resetsAt ? ` Resets ${v.resetsAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}` });
  }
  for (const s of SVARA_SERVICES) {
    if (!s.yearly) continue;
    const { days } = nextYearly(s.yearly.month, s.yearly.day, now);
    if ([30, 7, 1, 0].includes(days)) out.push({ key: `${s.id}:due:${days}`, title: `${s.yearly.what} in ${days} ${days === 1 ? "day" : "days"}`, body: `${s.name}: ${s.watch}` });
  }
  return out;
}

async function alertChanges(result: SvaraResult) {
  const sent = read<Record<string, number>>(ALERTS_KEY, {}), now = Date.now();
  const due = alertsFor(result);
  const active = new Set(due.map(a => a.key));
  // A service that works again is forgotten, so a new failure alerts at once.
  for (const k of Object.keys(sent)) if (!active.has(k) && !k.includes(":due:")) delete sent[k];
  for (const a of due) {
    if (sent[a.key] && now - sent[a.key] < SVARA_ALERT_REPEAT_MS) continue;
    if (await notifyNow(a.key, a.title, a.body)) sent[a.key] = now;
  }
  write(ALERTS_KEY, sent);
}

/** Checks when the app opens or comes back, and every 6 hours while it runs. Returns the stop function. */
export function startSvaraMonitor() {
  if (typeof window === "undefined") return () => {};
  const maybe = () => {
    const last = getSvaraResult();
    if (!last || Date.now() - last.checkedAt >= SVARA_CHECK_EVERY_MS) void checkSvara(false);
  };
  const first = window.setTimeout(maybe, 4000);
  const timer = window.setInterval(maybe, 30 * 60_000);
  const visible = () => { if (document.visibilityState === "visible") maybe() };
  document.addEventListener("visibilitychange", visible);
  return () => { window.clearTimeout(first); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible) };
}

/** Matches a service against what was typed in the search box (name, use, key name, category, plan, state, reason). */
export function matchesService(view: ServiceView, query: string, label = "") {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const s = view.service;
  const text = [s.name, s.category, s.usedFor, s.secret, s.plan, s.limits, s.resets, s.watch, view.reason, view.state, label].join(" ").toLowerCase();
  return words.every(word => text.includes(word));
}
