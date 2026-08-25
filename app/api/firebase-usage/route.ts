import { NextRequest } from "next/server";
import { corsJson, corsOptions } from "../../lib/cors";

type Project = { label:string; projectId:string; configured:boolean };
type MetricSpec = {
  id:string; product:string; label:string; type:string; mode:"sum"|"latest";
  start:Date; limit:number|null; unit:"count"|"bytes"|"connections";
  period:"daily"|"monthly"|"current"; resetAt:Date|null; note:string;
};
type MonitoringPoint = { value?:{ int64Value?:string; doubleValue?:number }; interval?:{ endTime?:string } };
type TimeSeries = { points?:MonitoringPoint[] };
type MonitoringResponse = { timeSeries?:TimeSeries[]; nextPageToken?:string; error?:{ message?:string } };
type ReadyResponse = {
  status:"ready"; projects:Project[]; selectedProject:string;
  metrics:Array<{id:string;product:string;label:string;used:number|null;limit:number|null;unit:MetricSpec["unit"];period:MetricSpec["period"];resetAt:string|null;note:string;status:"live"|"unavailable"}>;
  checkedAt:string; monitoringDelay:string;
};

const DEFAULT_PROJECTS="Development:pic-dev-f28a7,Staging:YOUR_STAGING_PROJECT_ID,Production:YOUR_PRODUCTION_PROJECT_ID";
const GB=1024**3;
const TOKEN_TIMEOUT_MS=8_000;
const METRIC_TIMEOUT_MS=12_000;
const RESULT_CACHE_MS=60_000;
let cachedToken:{value:string;expiresAt:number}|null=null;
const resultCache=new Map<string,{value:ReadyResponse;expiresAt:number}>();

async function timedFetch(input:string,init:RequestInit,timeoutMs:number){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(input,{...init,signal:controller.signal})}
  finally{clearTimeout(timeout)}
}

function projects():Project[]{
  return (process.env.FIREBASE_MONITOR_PROJECTS||DEFAULT_PROJECTS).split(",").map(entry=>{
    const [label,...rest]=entry.split(":");const projectId=rest.join(":").trim();
    return {label:label.trim()||"Project",projectId,configured:!!projectId&&!/^YOUR_/i.test(projectId)};
  }).filter(p=>p.label);
}
function b64url(input:Uint8Array|string){
  const bytes=typeof input==="string"?new TextEncoder().encode(input):input;
  let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function pemBytes(pem:string){
  const clean=pem.replace(/\\n/g,"\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const binary=atob(clean);return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function accessToken(email:string,privateKey:string){
  if(cachedToken&&cachedToken.expiresAt>Date.now())return cachedToken.value;
  const now=Math.floor(Date.now()/1000),header=b64url(JSON.stringify({alg:"RS256",typ:"JWT"})),payload=b64url(JSON.stringify({iss:email,scope:"https://www.googleapis.com/auth/monitoring.read",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})),unsigned=`${header}.${payload}`;
  const key=await crypto.subtle.importKey("pkcs8",pemBytes(privateKey),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned));
  const response=await timedFetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${unsigned}.${b64url(new Uint8Array(signature))}`})},TOKEN_TIMEOUT_MS);
  const data=await response.json() as {access_token?:string;error_description?:string};
  if(!response.ok||!data.access_token)throw new Error(data.error_description||"Google authentication failed");
  cachedToken={value:data.access_token,expiresAt:Date.now()+50*60_000};
  return data.access_token;
}
function zoneParts(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const get=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find(p=>p.type===type)?.value||0);
  return {year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute"),second:get("second")};
}
function zonedUtc(year:number,month:number,day:number,timeZone:string){
  const wanted=Date.UTC(year,month-1,day,0,0,0);let guess=wanted;
  for(let i=0;i<3;i++){const actual=zoneParts(new Date(guess),timeZone),shown=Date.UTC(actual.year,actual.month-1,actual.day,actual.hour,actual.minute,actual.second);guess+=wanted-shown}
  return new Date(guess);
}
function cycles(now=new Date()){
  const timeZone="America/Los_Angeles",p=zoneParts(now,timeZone),tomorrow=new Date(Date.UTC(p.year,p.month-1,p.day+1));
  return {dailyStart:zonedUtc(p.year,p.month,p.day,timeZone),dailyReset:zonedUtc(tomorrow.getUTCFullYear(),tomorrow.getUTCMonth()+1,tomorrow.getUTCDate(),timeZone),monthStart:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)),monthReset:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1))};
}
function numeric(point:MonitoringPoint){
  const value=point.value?.int64Value??point.value?.doubleValue;
  return value===undefined?0:Number(value);
}
async function metricValue(projectId:string,token:string,spec:MetricSpec,end:Date){
  let pageToken="",total=0,pages=0;
  const deadline=Date.now()+METRIC_TIMEOUT_MS;
  do{
    const params=new URLSearchParams({filter:`metric.type = "${spec.type}"`,"interval.startTime":spec.start.toISOString(),"interval.endTime":end.toISOString(),view:"FULL",pageSize:"1000"});
    if(pageToken)params.set("pageToken",pageToken);
    const remaining=deadline-Date.now();
    if(remaining<=0)throw new Error("Metric query timed out");
    const response=await timedFetch(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${params}`,{headers:{Authorization:`Bearer ${token}`}},remaining);
    const data=await response.json() as MonitoringResponse;
    if(!response.ok)throw new Error(data.error?.message||`Metric query failed (${response.status})`);
    for(const series of data.timeSeries||[]){const points=series.points||[];if(spec.mode==="latest")total+=numeric(points[0]||{});else for(const point of points)total+=numeric(point)}
    pageToken=data.nextPageToken||"";pages++;
  }while(pageToken&&pages<4);
  return total;
}

export async function GET(request:NextRequest){
  const allProjects=projects(),configured=allProjects.filter(p=>p.configured),email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),privateKey=process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if(!configured.length||!email||!privateKey)return corsJson(request,{status:"setup_required",projects:allProjects,message:"Project IDs and a backend-only Monitoring Viewer service account are required. Use the included .env.example; never place the private key in frontend code."},{headers:{"Cache-Control":"no-store"}});
  const requested=request.nextUrl.searchParams.get("project"),selected=requested||configured[0].projectId;
  if(!configured.some(p=>p.projectId===selected))return corsJson(request,{status:"error",projects:allProjects,message:"That Firebase project is not in the server allowlist."},{status:400,headers:{"Cache-Control":"no-store"}});
  const forceRefresh=request.nextUrl.searchParams.get("refresh")==="1";
  const cached=resultCache.get(selected);
  if(!forceRefresh&&cached&&cached.expiresAt>Date.now())return corsJson(request,cached.value,{headers:{"Cache-Control":"private, max-age=30"}});
  try{
    const now=new Date(),cycle=cycles(now),token=await accessToken(email,privateKey);
    const MB=1024**2;
    const specs:MetricSpec[]=[
      {id:"firestore-reads",product:"Firestore",label:"Document reads",type:"firestore.googleapis.com/document/read_ops_count",mode:"sum",start:cycle.dailyStart,limit:50_000,unit:"count",period:"daily",resetAt:cycle.dailyReset,note:"Standard edition free daily allowance."},
      {id:"firestore-writes",product:"Firestore",label:"Document writes",type:"firestore.googleapis.com/document/write_ops_count",mode:"sum",start:cycle.dailyStart,limit:20_000,unit:"count",period:"daily",resetAt:cycle.dailyReset,note:"Standard edition free daily allowance."},
      {id:"firestore-deletes",product:"Firestore",label:"Document deletes",type:"firestore.googleapis.com/document/delete_ops_count",mode:"sum",start:cycle.dailyStart,limit:20_000,unit:"count",period:"daily",resetAt:cycle.dailyReset,note:"Standard edition free daily allowance."},
      {id:"firestore-size",product:"Firestore",label:"Data + index storage",type:"firestore.googleapis.com/storage/data_and_index_storage_bytes",mode:"latest",start:new Date(now.getTime()-3*86400000),limit:GB,unit:"bytes",period:"current",resetAt:null,note:"One free Standard-edition database per project includes 1 GiB stored."},
      {id:"function-invocations",product:"Functions",label:"Function executions",type:"cloudfunctions.googleapis.com/function/execution_count",mode:"sum",start:cycle.monthStart,limit:2_000_000,unit:"count",period:"monthly",resetAt:cycle.monthReset,note:"Selected-project usage; the Blaze no-cost allowance is pooled by billing account."},
      {id:"function-egress",product:"Functions",label:"Network egress",type:"cloudfunctions.googleapis.com/function/network_egress",mode:"sum",start:cycle.monthStart,limit:5*GB,unit:"bytes",period:"monthly",resetAt:cycle.monthReset,note:"Selected-project usage; the Blaze 5 GB allowance is pooled by billing account."},
      {id:"storage-size",product:"Storage",label:"Current object storage",type:"storage.googleapis.com/storage/total_bytes",mode:"latest",start:new Date(now.getTime()-3*86400000),limit:null,unit:"bytes",period:"current",resetAt:null,note:"Live bucket total; free allowance varies by bucket type and region."},
      {id:"storage-egress",product:"Storage",label:"Monthly bytes sent",type:"storage.googleapis.com/network/sent_bytes_count",mode:"sum",start:cycle.monthStart,limit:null,unit:"bytes",period:"monthly",resetAt:cycle.monthReset,note:"Cloud Storage pricing varies by region and destination."},
      {id:"storage-requests",product:"Storage",label:"Monthly API requests",type:"storage.googleapis.com/api/request_count",mode:"sum",start:cycle.monthStart,limit:null,unit:"count",period:"monthly",resetAt:cycle.monthReset,note:"Free operation limits differ for legacy and new Firebase buckets."},
      {id:"rtdb-storage",product:"Realtime Database",label:"Stored data",type:"firebasedatabase.googleapis.com/storage/total_bytes",mode:"latest",start:new Date(now.getTime()-3*86400000),limit:GB,unit:"bytes",period:"current",resetAt:null,note:"Blaze includes the first 1 GB stored at no cost."},
      {id:"rtdb-download",product:"Realtime Database",label:"Monthly downloads",type:"firebasedatabase.googleapis.com/network/monthly_sent",mode:"latest",start:cycle.monthStart,limit:10*GB,unit:"bytes",period:"monthly",resetAt:cycle.monthReset,note:"Cloud metric resets monthly; Firebase describes the allowance as 360 MB/day, about 10 GB/month."},
      {id:"rtdb-connections",product:"Realtime Database",label:"Active connections",type:"firebasedatabase.googleapis.com/network/active_connections",mode:"latest",start:new Date(now.getTime()-3*3600000),limit:200_000,unit:"connections",period:"current",resetAt:null,note:"Current simultaneous connections against the Blaze per-database limit."},
      {id:"hosting-storage",product:"Hosting",label:"Hosted storage",type:"firebasehosting.googleapis.com/storage/total_bytes",mode:"latest",start:new Date(now.getTime()-2*86400000),limit:10*GB,unit:"bytes",period:"current",resetAt:null,note:"Firebase Hosting includes 10 GB stored at no cost."},
      {id:"hosting-transfer",product:"Hosting",label:"Daily data transfer",type:"firebasehosting.googleapis.com/network/sent_bytes_count",mode:"sum",start:cycle.dailyStart,limit:360*MB,unit:"bytes",period:"daily",resetAt:cycle.dailyReset,note:"Firebase Hosting includes 360 MB data transfer per day at no cost."},
      {id:"monitoring-reads",product:"Monitoring API",label:"Time series queried",type:"monitoring.googleapis.com/billing/time_series_billed_for_queries_count",mode:"sum",start:cycle.monthStart,limit:1_000_000,unit:"count",period:"monthly",resetAt:cycle.monthReset,note:"Selected-project count; first 1 million queried time series are free per billing account."}
    ];
    const queried=await Promise.all(specs.map(async spec=>{try{return {...spec,used:await metricValue(selected,token,spec,now),status:"live" as const}}catch{return {...spec,used:null,status:"unavailable" as const}}}));
    const metrics=queried.map(metric=>({id:metric.id,product:metric.product,label:metric.label,used:metric.used,limit:metric.limit,unit:metric.unit,period:metric.period,resetAt:metric.resetAt?.toISOString()||null,note:metric.note,status:metric.status}));
    const payload:ReadyResponse={status:"ready",projects:allProjects,selectedProject:selected,metrics,checkedAt:now.toISOString(),monitoringDelay:"Firestore is usually within ~4 min. RTDB monthly values can lag ~90 min, RTDB storage up to a day, and Hosting several hours."};
    resultCache.set(selected,{value:payload,expiresAt:Date.now()+RESULT_CACHE_MS});
    return corsJson(request,payload,{headers:{"Cache-Control":"private, max-age=30"}});
  }catch(error){
    const text=error instanceof Error?error.message:"Unknown error";
    const keyFormat=/keydata|pkcs8|private key|data provided|domexception|base64|atob/i.test(text);
    const auth=/auth|credential|signature|invalid_grant|invalid jwt|unauthorized|oauth|401/i.test(text);
    const apiDisabled=/has not been used|serviceusage|monitoring api.*disabled|api.*not enabled/i.test(text);
    const permission=/permission|403|denied|forbidden/i.test(text);
    const quota=/quota|resource_exhausted|429|rate limit/i.test(text);
    const errorCode=keyFormat?"KEY_FORMAT":auth?"AUTH":apiDisabled?"API_DISABLED":permission?"PERMISSION":quota?"QUOTA":"TEMPORARY";
    const message=keyFormat?"The service-account private key could not be read. Copy the JSON private_key exactly into .env.local and keep every \\n marker.":auth?"Google authentication failed. Verify GOOGLE_SERVICE_ACCOUNT_EMAIL and the matching JSON private key.":apiDisabled?"Cloud Monitoring API is not enabled for this Firebase project. Enable it, wait a minute, then refresh.":permission?"Monitoring access was denied. Grant Monitoring Viewer to the service account on this exact project.":quota?"Google temporarily limited Monitoring requests. Wait briefly and refresh manually.":"Google Cloud Monitoring could not be reached. Check the project setup, then refresh manually.";
    return corsJson(request,{status:"error",errorCode,projects:allProjects,selectedProject:selected,message},{status:502,headers:{"Cache-Control":"no-store"}});
  }
}

export async function OPTIONS(request:NextRequest){return corsOptions(request)}
