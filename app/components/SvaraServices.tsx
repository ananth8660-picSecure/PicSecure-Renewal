"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import "./SvaraServices.css";
import SvaraMark from "./SvaraMark";
import { SVARA_SERVICES, SVARA_UPDATED_EVENT, SVARA_DEFAULT_ENDPOINT, checkSvara, describe, matchesService, getSvaraConfig, getSvaraResult, saveSvaraConfig, type ServiceState, type SvaraResult } from "../lib/svara-monitor";

const CATEGORIES = ["Server", "AI writer", "Web search", "Facts", "Location", "Updates", "Security", "Store", "Phone"] as const;
const CATEGORY_TEXT: Record<(typeof CATEGORIES)[number], string> = {
  Server: "Where every answer is made", "AI writer": "Free AI models that write the answers, tried in turn",
  "Web search": "Today's facts: news, prices, local", Facts: "Free sources, no key", Location: "Home-town lookup",
  Updates: "Live app updates", Security: "Signing keys (kept off the project, never shown here)", Store: "Publishing", Phone: "Built into the phone",
};
const LABEL: Record<ServiceState, string> = { ok: "Working", busy: "Busy now", limit: "Limit reached", unused: "Not used", fail: "Needs attention", set: "Key set", static: "No online check", unknown: "Not checked", due: "Deadline soon" };
const TONE: Record<ServiceState, string> = { ok: "safe", busy: "warning", limit: "warning", unused: "neutral", fail: "critical", set: "safe", static: "neutral", unknown: "neutral", due: "warning" };
const ERROR_TEXT: Record<NonNullable<SvaraResult["error"]>, string> = {
  token: "The Svara server wants the owner token. On your PC run  npm run ai:token  and paste it below.",
  unreachable: "The Svara server did not answer. Check the address below, or open the Cloudflare dashboard.",
  server: "The Svara server answered with an error. Open the Cloudflare dashboard → Workers → svara-ask → Logs.",
  slow_down: "Too many checks in a minute. Try again shortly.",
  offline: "This device is offline. The last result is shown.",
};

const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : 0 });
function untilText(at: Date, now: Date) {
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), d = Math.floor(h / 24);
  return d >= 2 ? `in ${d} days` : h >= 1 ? `in ${h}h ${m}m` : `in ${Math.max(1, m)} min`;
}
const whenText = (at: Date) => at.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type Filter = "all" | "working" | "limit" | "off" | "attention";
const FILTERS: { id: Filter; label: string; hint: string; states: ServiceState[]; tone: string }[] = [
  { id: "all", label: "All services", hint: "Everything Svara uses", states: [], tone: "neutral" },
  { id: "working", label: "Working", hint: "Ready right now", states: ["ok", "set", "busy"], tone: "safe" },
  { id: "limit", label: "Limit reached", hint: "Free limit used up — comes back at reset", states: ["limit"], tone: "warning" },
  { id: "off", label: "Off / not used", hint: "Skipped on purpose, nothing billed", states: ["unused"], tone: "neutral" },
  { id: "attention", label: "Needs attention", hint: "Key, plan or deadline to fix", states: ["fail", "due"], tone: "critical" },
];

function icon(name: "pulse" | "refresh" | "shield" | "key" | "search") {
  const paths = {
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    refresh: <path d="M20 7h-5V2M4 17h5v5M5.2 9A8 8 0 0 1 18.4 5.2L20 7M4 17l1.7 1.8A8 8 0 0 0 19 15" />,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  };
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function SvaraServices() {
  const [result, setResult] = useState<SvaraResult | null>(null), [checking, setChecking] = useState(false), [ready, setReady] = useState(false);
  const [endpoint, setEndpoint] = useState(SVARA_DEFAULT_ENDPOINT), [hasToken, setHasToken] = useState(false), [tokenDraft, setTokenDraft] = useState(""), [message, setMessage] = useState(""), [open, setOpen] = useState(false);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const load = () => { setResult(getSvaraResult()); const c = getSvaraConfig(); setEndpoint(c.endpoint); setHasToken(!!c.token); };
    const first = window.setTimeout(() => { load(); setReady(true); if (!getSvaraConfig().token) setOpen(true) }, 0);
    window.addEventListener(SVARA_UPDATED_EVENT, load);
    return () => { window.clearTimeout(first); window.removeEventListener(SVARA_UPDATED_EVENT, load) };
  }, []);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t) }, []);
  const views = useMemo(() => SVARA_SERVICES.map(s => describe(s, result, now)), [result, now]);
  const count = (...states: ServiceState[]) => views.filter(v => states.includes(v.state)).length;
  const attention = count("fail", "due");
  const shown = views.filter(v => (filter === "all" || FILTERS.find(f => f.id === filter)!.states.includes(v.state)) && matchesService(v, query, LABEL[v.state]));

  async function run() {
    setChecking(true); setMessage("");
    try { const r = await checkSvara(true); if (r.error) setMessage(ERROR_TEXT[r.error]); setResult(getSvaraResult()) } finally { setChecking(false) }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      saveSvaraConfig({ endpoint, ...(tokenDraft.trim() ? { token: tokenDraft } : {}) });
      const c = getSvaraConfig(); setEndpoint(c.endpoint); setHasToken(!!c.token); setTokenDraft(""); setOpen(false);
      void run();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Enter a valid https:// address.") }
  }
  function forgetToken() { saveSvaraConfig({ token: "" }); setHasToken(false); setTokenDraft(""); setOpen(true) }

  const headline = !result ? "Not checked yet" : result.error && result.error !== "offline" ? "Svara monitor needs attention" : attention ? `${attention} ${attention === 1 ? "service needs" : "services need"} attention` : "All Svara services are working";
  const shownError = message || (result?.error ? ERROR_TEXT[result.error] : "");

  if (!ready) return <div className="usage-skeleton" aria-label="Loading Svara services"><div /><div /><div className="skeleton-grid">{Array.from({ length: 6 }).map((_, i) => <span key={i} />)}</div></div>;

  return <div className="firebase-dashboard svara-services">
    <section className="usage-command">
      <div className="usage-brand"><span className="svara-brand-mark"><SvaraMark size={26} /></span><div><p>PICSECURE SVARA · SERVICES</p><h2>{headline}</h2><small>{views.length} services · auto check every 6 h while the app is open</small></div></div>
      <div className="usage-command-meta"><span><i className="live-dot" />{result ? `Checked ${new Date(result.checkedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Waiting for the first check"}</span><button onClick={() => void run()} disabled={checking}>{icon("refresh")}<b>{checking ? "Checking…" : "Check now"}</b></button></div>
    </section>

    <section className="svara-stats" aria-label="Service counts">{FILTERS.map(f => {
      const n = f.id === "all" ? views.length : count(...f.states);
      return <button key={f.id} type="button" className={`svara-stat ${f.tone} ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(filter === f.id && f.id !== "all" ? "all" : f.id)} aria-pressed={filter === f.id}><span>{f.label}</span><strong>{n}</strong><small>{f.hint}</small></button>;
    })}</section>

    <div className="svara-search"><span>{icon("search")}</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search services — e.g. Groq, web search, limit, GEMINI_KEY…" aria-label="Search Svara services" />{(query || filter !== "all") && <button type="button" onClick={() => { setQuery(""); setFilter("all") }}>Clear</button>}<small>{shown.length} of {views.length}</small></div>

    {shownError && <section className="usage-footnote svara-alert" role="alert"><span>{icon("shield")}</span><div><strong>Check did not finish</strong><p>{shownError}</p></div><button type="button" onClick={() => setOpen(true)}>Connection</button></section>}

    <section className="metric-section svara-connect">
      <header><span>{icon("key")}</span><div><h3>Connection</h3><p>{hasToken ? "Owner token saved on this device only" : "Add the owner token to run live checks"} · {endpoint.replace("https://", "")}</p></div><button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? "Close" : "Change"}</button></header>
      {open && <form onSubmit={save}>
        <label><span>Svara server</span><input value={endpoint} onChange={e => setEndpoint(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} placeholder={SVARA_DEFAULT_ENDPOINT} /></label>
        <label><span>Owner token {hasToken && <em>(saved — leave empty to keep it)</em>}</span><input type="password" value={tokenDraft} onChange={e => setTokenDraft(e.target.value)} autoComplete="off" spellCheck={false} placeholder={hasToken ? "••••••••••••" : "Paste from npm run ai:token"} /></label>
        <p>On your PC, in the Svara project: <code>npm run ai:token</code> copies the token to the clipboard (it is never shown). Paste it here only — never in a chat. It lets this app run the check; it cannot read or change any key.</p>
        <div><button type="submit">Save & check</button>{hasToken && <button type="button" className="ghost" onClick={forgetToken}>Remove token</button>}</div>
      </form>}
    </section>

    {CATEGORIES.map(category => {
      const list = shown.filter(v => v.service.category === category);
      if (!list.length) return null;
      const bad = list.filter(v => v.state === "fail" || v.state === "due").length;
      return <section className="metric-section" key={category}>
        <header><span>{icon(category === "Security" ? "shield" : "pulse")}</span><div><h3>{category}</h3><p>{CATEGORY_TEXT[category]}</p></div><small>{bad ? `${bad} need attention` : `${list.length} ${list.length === 1 ? "service" : "services"}`}</small></header>
        <div className="metric-grid">{list.map(({ service: s, state, reason, due, usage, resetsAt }) => <article className={`metric-card ${TONE[state]}`} key={s.id}>
          <div className="metric-top"><span>{s.secret}</span><i>{LABEL[state].toUpperCase()}</i></div>
          <h4>{s.name}</h4>
          <strong>{due ? `${due.days} ${due.days === 1 ? "day" : "days"}` : LABEL[state]}</strong>
          <p>{s.usedFor}</p>
          {usage ? (() => {
            const pct = Math.min(100, Math.round(usage.used / usage.limit * 100)), left = Math.max(0, usage.limit - usage.used);
            return <div className={`svara-meter ${pct >= 90 ? "high" : pct >= 70 ? "mid" : "low"}`} aria-label={`${pct}% of free ${usage.unit} used`}>
              <div className="svara-meter-top"><span>{num(usage.used)} / {num(usage.limit)} {usage.unit} used this {usage.period}</span><b>{pct}%</b></div>
              <div className="svara-meter-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${Math.max(pct, 2)}%` }} /></div>
              <small>{num(left)} {usage.unit} left{usage.model ? ` · ${usage.model}` : ""}</small>
            </div>;
          })() : s.health.length > 0 && s.reset && !s.unusedOnPurpose && <div className="svara-meter none"><small>This service does not report its free usage — see it under Manage ↗</small></div>}
          {(resetsAt || s.reset === "month") && s.health.length > 0 && !s.unusedOnPurpose && <div className="svara-reset"><span>↻</span><p>{resetsAt ? <>Free limit renews <b>{untilText(resetsAt, now)}</b> · {whenText(resetsAt)}</> : <>Renews monthly on your plan date (shown in its billing page)</>}</p></div>}
          {reason && <div className="unavailable-line svara-reason"><i />{reason}</div>}
          <div className="quota-line"><span>{s.plan}</span><span>{s.resets === "—" ? "" : `Resets: ${s.resets}`}</span></div>
          <p>{[s.limits, s.watch].filter(t => t && t !== "—").join(" · ")}</p>
          <footer><span>{state === "fail" ? "Fix: check the key and free plan" : state === "limit" ? `Comes back at reset (${s.resets})` : state === "unused" ? "Skipped automatically, nothing billed" : "Nothing to do"}</span>{s.manageUrl && <small><a href={s.manageUrl} target="_blank" rel="noreferrer">Manage ↗</a></small>}</footer>
        </article>)}</div>
      </section>;
    })}

    {!shown.length && <section className="metric-section svara-empty"><p>No service matches {query ? <>“{query}”</> : "this filter"}.</p><button type="button" onClick={() => { setQuery(""); setFilter("all") }}>Show all services</button></section>}

    <section className="usage-footnote"><span>{icon("shield")}</span><div><strong>No key ever reaches this app</strong><p>Keys stay as encrypted secrets on the Svara server. This screen only sees working / busy / not used / failing and the reason each service gives. Cost stays ₹0: never add a card or top up on any of these accounts.</p></div><a href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">Open Cloudflare ↗</a></section>
  </div>;
}
