"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl, hasApiBase, isNativeRuntime } from "../lib/runtime";

type Project = { label:string; projectId:string; configured:boolean };
type UsageMetric = {
  id:string; product:string; label:string; used:number|null; limit:number|null;
  unit:"count"|"bytes"|"connections"; period:"daily"|"monthly"|"current";
  resetAt:string|null; note:string; status:"live"|"unavailable";
};
type UsageResponse = {
  status:"ready"|"setup_required"|"error"; projects:Project[]; selectedProject?:string;
  metrics?:UsageMetric[]; checkedAt?:string; message?:string; monitoringDelay?:string; errorCode?:string;
};

const USAGE_CACHE_KEY="picsecure-renew.firebase-usage.v1";
const CLIENT_TIMEOUT_MS=15_000;

function miniIcon(name:"database"|"function"|"storage"|"hosting"|"refresh"|"shield"){
  const paths={
    database:<><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    function:<><path d="M9 4H6.8A2.8 2.8 0 0 0 4 6.8V10l-2 2 2 2v3.2A2.8 2.8 0 0 0 6.8 20H9M15 4h2.2A2.8 2.8 0 0 1 20 6.8V10l2 2-2 2v3.2a2.8 2.8 0 0 1-2.8 2.8H15"/><path d="m14 8-4 8M10 8h.01M14 16h.01"/></>,
    storage:<><path d="M5 4h14v16H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    hosting:<><path d="M4 18 12 3l8 15H4Z"/><path d="m8.5 13 3.5 5 3.5-5"/></>,
    refresh:<><path d="M20 7h-5V2M4 17h5v5M5.2 9A8 8 0 0 1 18.4 5.2L20 7M4 17l1.7 1.8A8 8 0 0 0 19 15"/></>,
    shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>
  };
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function formatValue(value:number|null,unit:UsageMetric["unit"]){
  if(value===null)return "Unavailable";
  if(unit==="bytes"){
    const sizes=["B","KB","MB","GB","TB"];let n=value,i=0;
    while(n>=1024&&i<sizes.length-1){n/=1024;i++}
    return `${n>=100||i===0?n.toFixed(0):n.toFixed(1)} ${sizes[i]}`;
  }
  return new Intl.NumberFormat("en-IN",{notation:value>=1_000_000?"compact":"standard",maximumFractionDigits:1}).format(value);
}
function countdown(resetAt:string|null,now:number){
  if(!resetAt)return "No reset cycle";
  const diff=Math.max(0,new Date(resetAt).getTime()-now),days=Math.floor(diff/86400000),hours=Math.floor(diff%86400000/3600000),mins=Math.floor(diff%3600000/60000);
  return days?`${days}d ${hours}h ${mins}m`:`${hours}h ${mins}m`;
}
function tone(metric:UsageMetric){
  if(metric.used===null||metric.limit===null)return "neutral";
  const p=metric.used/metric.limit*100;
  return p>=95?"critical":p>=85?"high":p>=70?"warning":"safe";
}

export default function FirebaseUsage(){
  const [data,setData]=useState<UsageResponse|null>(null),[selected,setSelected]=useState(""),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[now,setNow]=useState(0);
  const [setupProject,setSetupProject]=useState("Development"),[setupStep,setSetupStep]=useState(1),[copied,setCopied]=useState(false);
  const load=useCallback(async(project?:string,manual=false,silent=false)=>{
    if(manual)setRefreshing(true);else if(!silent)setLoading(true);
    if(isNativeRuntime()&&!hasApiBase()){
      setData({status:"error",projects:[],errorCode:"API_BASE",message:"This APK is not connected to the PicSecure Renew HTTPS usage API yet. Open Settings → Data connection and paste the deployed API URL."});
      setLoading(false);setRefreshing(false);return;
    }
    try{
      const params=new URLSearchParams();
      if(project)params.set("project",project);
      if(manual)params.set("refresh","1");
      const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),CLIENT_TIMEOUT_MS);
      const response=await fetch(apiUrl(`/api/firebase-usage${params.size?`?${params}`:""}`),{cache:"no-store",signal:controller.signal,headers:{Accept:"application/json"}}).finally(()=>window.clearTimeout(timeout));
      const contentType=response.headers.get("content-type")||"";
      if(!contentType.includes("application/json"))throw new Error(`Usage API returned ${response.status} instead of JSON`);
      const next=await response.json() as UsageResponse;
      setData(next);if(next.status==="ready")window.localStorage.setItem(USAGE_CACHE_KEY,JSON.stringify(next));if(next.selectedProject)setSelected(next.selectedProject);else setSelected(current=>current||next.projects.find(p=>p.configured)?.projectId||"")
    }catch(error){setData(current=>current||{status:"error",projects:[],errorCode:"API_CONNECTION",message:error instanceof Error?`${error.message}. The app will keep the last successful usage snapshot and retry when you refresh.`:"PicSecure Renew could not reach the usage service within 15 seconds."})}
    finally{setLoading(false);setRefreshing(false)}
  },[]);
  useEffect(()=>{let hasCached=false;try{const cached=JSON.parse(window.localStorage.getItem(USAGE_CACHE_KEY)||"null") as UsageResponse|null;if(cached?.status==="ready"){hasCached=true;setData(cached);setSelected(cached.selectedProject||cached.projects.find(project=>project.configured)?.projectId||"");setLoading(false)}}catch{}const initial=window.setTimeout(()=>{setNow(Date.now());void load(undefined,false,hasCached)},0);const reconnect=()=>void load(undefined,true);window.addEventListener("picsecure:api-base-changed",reconnect);return()=>{clearTimeout(initial);window.removeEventListener("picsecure:api-base-changed",reconnect)}},[load]);
  useEffect(()=>{const clock=window.setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(clock)},[]);
  const metrics=data?.metrics||[];
  const groups=useMemo(()=>[
    {key:"Firestore",title:"Cloud Firestore",icon:"database" as const,sub:"Daily document operations"},
    {key:"Functions",title:"Cloud Functions",icon:"function" as const,sub:"Monthly invocation allowance"},
    {key:"Storage",title:"Cloud Storage",icon:"storage" as const,sub:"Bucket storage, transfer and operations"},
    {key:"Realtime Database",title:"Realtime Database",icon:"database" as const,sub:"Monthly database allowance"},
    {key:"Hosting",title:"Firebase Hosting",icon:"hosting" as const,sub:"Storage and daily transfer"},
    {key:"Monitoring API",title:"Cloud Monitoring API",icon:"refresh" as const,sub:"Monthly read allowance used by this dashboard"}
  ],[]);
  const live=metrics.filter(m=>m.status==="live"&&m.used!==null),highest=live.reduce((max,m)=>m.limit?Math.max(max,m.used!/m.limit*100):max,0);
  const activeSetupProject=data?.projects.find(p=>p.label===setupProject)||data?.projects[0];
  const projectForLink=activeSetupProject?.configured?activeSetupProject.projectId:"YOUR_PROJECT_ID";
  const envTemplate=`FIREBASE_MONITOR_PROJECTS=Development:pic-dev-f28a7,Staging:pic-staging-37f03,Production:pic-87b28\nGOOGLE_SERVICE_ACCOUNT_EMAIL=picsecure-renew-monitor@pic-dev-f28a7.iam.gserviceaccount.com\nGOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nPASTE_FRESH_PRIVATE_KEY_HERE\\n-----END PRIVATE KEY-----\\n"`;
  async function copyEnv(){try{await navigator.clipboard.writeText(envTemplate);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch{setCopied(false)}}

  if(loading&&!data)return <div className="usage-skeleton" aria-label="Loading Firebase usage"><div/><div/><div className="skeleton-grid">{Array.from({length:6}).map((_,i)=><span key={i}/>)}</div></div>;
  if(data?.status==="setup_required")return <section className="firebase-setup interactive"><div className="setup-glow"/><span className="setup-icon">{miniIcon("shield")}</span><p className="eyebrow">SECURE CONNECTION REQUIRED</p><h2>Connect Google Cloud Monitoring</h2><p>{data.message||"Add backend-only Google Cloud credentials to unlock live quota usage."}</p>
    <div className="setup-projects" role="tablist" aria-label="Choose Firebase environment">{data.projects.map(p=><button type="button" role="tab" aria-selected={activeSetupProject?.label===p.label} className={activeSetupProject?.label===p.label?"active":""} key={p.label} onClick={()=>{setSetupProject(p.label);setSetupStep(1)}}><i className={p.configured?"ready":""}/><span><b>{p.label}</b><small>{p.configured?p.projectId:"Project ID required"}</small></span><em>›</em></button>)}</div>
    <div className="setup-steps" aria-label="Monitoring setup steps"><button className={setupStep===1?"active":""} onClick={()=>setSetupStep(1)}><b>1</b><span>Enable Monitoring API<small>For {activeSetupProject?.label}</small></span></button><button className={setupStep===2?"active":""} onClick={()=>setSetupStep(2)}><b>2</b><span>Add Monitoring Viewer<small>Read-only access</small></span></button><button className={setupStep===3?"active":""} onClick={()=>setSetupStep(3)}><b>3</b><span>Create .env.local<small>Backend credentials</small></span></button></div>
    <div className="setup-detail" aria-live="polite">
      {setupStep===1&&<><span className="detail-number">01</span><div><p>STEP ONE · {activeSetupProject?.label.toUpperCase()}</p><h3>{activeSetupProject?.configured?"Enable Cloud Monitoring API":"Add this environment’s Project ID first"}</h3><small>{activeSetupProject?.configured?`Open Google Cloud for ${activeSetupProject.projectId}, press Enable, then return here.`:"Firebase Console → Project settings → General → copy the exact Project ID. Do not use Project name, App ID or project number."}</small></div>{activeSetupProject?.configured?<a href={`https://console.cloud.google.com/apis/library/monitoring.googleapis.com?project=${encodeURIComponent(projectForLink)}`} target="_blank" rel="noreferrer">Open Monitoring API ↗</a>:<a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Find Project ID ↗</a>}</>}
      {setupStep===2&&<><span className="detail-number">02</span><div><p>STEP TWO · READ-ONLY IAM</p><h3>Create one PicSecure Renew monitoring service account</h3><small>Create it once, download its JSON key privately, then grant <strong>Monitoring Viewer</strong> (`roles/monitoring.viewer`) on all three Firebase projects. Never grant Owner or Editor.</small></div><a href={`https://console.cloud.google.com/iam-admin/serviceaccounts?project=${encodeURIComponent(projectForLink)}`} target="_blank" rel="noreferrer">Open Service Accounts ↗</a></>}
      {setupStep===3&&<><span className="detail-number">03</span><div><p>STEP THREE · LOCAL SECRET FILE</p><h3>Copy .env.example as .env.local</h3><small>Replace only the placeholders with your real Staging/Production IDs, service-account email and private key. Save it beside package.json, then restart `npm run dev`.</small></div><button className="copy-env" onClick={()=>void copyEnv()}>{copied?"Template copied ✓":"Copy env template"}</button></>}
    </div><p className="setup-note">Cards and steps are clickable. The private key stays on the server—it is never sent to the browser or saved in PicSecure Renew.</p></section>;
  if(data?.status==="error")return <section className="usage-error">
    <header className="usage-error-head"><div><span>{miniIcon("shield")}</span><div><p>FIREBASE CLOUD MONITOR</p><h2>Usage connection needs attention</h2><small>{selected||data.selectedProject||"Firebase project"}</small></div></div><button className="usage-error-refresh" onClick={()=>void load(selected||data.selectedProject,true)} disabled={refreshing} aria-label="Refresh Firebase usage data">{miniIcon("refresh")}<b>{refreshing?"Refreshing…":"Refresh data"}</b></button></header>
    <div className="usage-error-body"><span>{miniIcon("shield")}</span><p className="eyebrow">{data.errorCode||"MONITORING CONNECTION"}</p><h3>{data.errorCode==="API_BASE"?"Connect this device to your usage API":data.errorCode==="KEY_FORMAT"?"Check the private-key format":data.errorCode==="AUTH"?"Check the service-account credentials":data.errorCode==="API_DISABLED"?"Enable the Monitoring API":data.errorCode==="PERMISSION"?"Monitoring Viewer access is missing":data.errorCode==="QUOTA"?"Monitoring is temporarily limited":"Monitoring did not respond"}</h3><p>{data.message}</p>{data.errorCode==="API_BASE"&&<button className="usage-connect-button" onClick={()=>window.dispatchEvent(new Event("picsecure:open-settings"))}>Open Data connection</button>}<div className="usage-error-checks"><span><i>1</i>{data.errorCode==="API_BASE"?"Deploy the HTTPS API":"Server .env configured"}</span><span><i>2</i>{data.errorCode==="API_BASE"?"Save its URL in Settings":"Monitoring API enabled"}</span><span><i>3</i>{data.errorCode==="API_BASE"?"Press Refresh":"Monitoring Viewer granted"}</span></div></div>
  </section>;

  return <div className="firebase-dashboard">
    <section className="usage-command">
      <div className="usage-brand"><span>{miniIcon("shield")}</span><div><p>FIREBASE CLOUD MONITOR</p><h2>{highest>=95?"Critical quota pressure":highest>=85?"High usage detected":"All monitored quotas are healthy"}</h2><small>Read-only usage · manual refresh only · no background polling</small></div></div>
      <div className="usage-command-meta"><span><i className="live-dot"/>{data?.checkedAt?`Updated ${new Date(data.checkedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`:"Waiting for data"}</span><button onClick={()=>void load(selected,true)} disabled={refreshing}>{miniIcon("refresh")}<b>{refreshing?"Refreshing…":"Refresh"}</b></button></div>
    </section>
    <div className="project-switcher" role="tablist" aria-label="Firebase projects">{data?.projects.map(project=><button role="tab" aria-selected={selected===project.projectId} disabled={!project.configured} className={selected===project.projectId?"active":""} key={project.label} onClick={()=>{setSelected(project.projectId);void load(project.projectId)}}><span>{project.label}</span><small>{project.configured?project.projectId:"Not configured"}</small></button>)}</div>
    <section className="free-tools-explainer" aria-label="Free Firebase tools explained"><div><span>FREE</span><strong>Google Analytics</strong><p>Users, sessions and app events. It does not report database billing quotas.</p></div><div><span>FREE</span><strong>Performance Monitoring</strong><p>Startup speed, traces and network latency. It does not count Firestore or RTDB usage.</p></div><div className="usage-source"><span>USAGE SOURCE</span><strong>Cloud Monitoring API</strong><p>Supplies the database, Hosting, Functions and storage numbers shown below.</p></div></section>
    <section className="usage-summary"><div><span className={`health-pulse ${highest>=95?"critical":highest>=85?"high":highest>=70?"warning":"safe"}`}>{Math.round(highest)}%</span><div><p>HIGHEST QUOTA UTILIZATION</p><strong>{highest<70?"Comfortable headroom":highest<85?"Watch usage closely":highest<95?"Action recommended":"Immediate action required"}</strong><small>Alerts change at 70%, 85% and 95%.</small></div></div><aside><p>Data freshness</p><strong>Service-dependent delay</strong><small>{data?.monitoringDelay||"Monitoring values are not instant."}</small></aside></section>
    {groups.map(group=>{const list=metrics.filter(m=>m.product===group.key);return <section className="metric-section" key={group.key}><header><span>{miniIcon(group.icon)}</span><div><h3>{group.title}</h3><p>{group.sub}</p></div>{list.some(m=>m.resetAt)&&<small>Next reset · {countdown(list.find(m=>m.resetAt)?.resetAt||null,now)}</small>}</header><div className="metric-grid">{list.map(metric=>{const t=tone(metric),percent=metric.used!==null&&metric.limit?Math.min(100,metric.used/metric.limit*100):0,remaining=metric.used!==null&&metric.limit!==null?Math.max(0,metric.limit-metric.used):null;return <article className={`metric-card ${t}`} key={metric.id}><div className="metric-top"><span>{metric.period}</span><i>{metric.status==="live"?"LIVE":"CONSOLE ONLY"}</i></div><h4>{metric.label}</h4><strong>{formatValue(metric.used,metric.unit)}</strong>{metric.limit!==null?<><div className="quota-line"><span>{percent.toFixed(percent<1?1:0)}% used</span><span>{formatValue(remaining,metric.unit)} left</span></div><div className="usage-bar"><i style={{width:`${percent}%`}}/></div><p>Free allowance {formatValue(metric.limit,metric.unit)}</p></>:<><div className="unavailable-line"><i/>Live quota value is not exposed</div><p>{metric.note}</p></>}<footer><span>{metric.resetAt?`Resets in ${countdown(metric.resetAt,now)}`:"No automatic reset"}</span><small>{metric.resetAt?new Date(metric.resetAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",timeZone:metric.period==="daily"?"America/Los_Angeles":"UTC"}):""}</small></footer></article>})}</div></section>})}
    <section className="usage-footnote"><span>{miniIcon("shield")}</span><div><strong>Accurate by design</strong><p>Live cards use Google-published metrics and official no-cost allowances. A missing metric stays unavailable instead of being estimated; Billing remains authoritative.</p></div><a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Open Firebase Console ↗</a></section>
  </div>;
}
