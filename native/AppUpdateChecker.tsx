import { ReactNode, useCallback, useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { APP_VERSION } from "../app/lib/app-version";
import { isCurrentRelease } from "../app/lib/update-build";

declare const __PICSECURE_BUILD_TIME__: string;
declare const __PICSECURE_BUILD_ID__: string;

type ReleaseAsset={id:number;name:string;size:number;updated_at:string;browser_download_url:string};
type GitHubRelease={assets:ReleaseAsset[]};
type UpdateManifest={schemaVersion:number;buildId:string;version:string;generatedAt:string;platforms:{android:{assetName:string;versionCode:number};windows:{assetName:string}}};
type AvailableUpdate={asset:ReleaseAsset;currentVersion:string;latestVersion:string};
type InstallResult={status:"installer_opened"|"permission_required"};
type UpdateInstallerPlugin={installApk(options:{url:string;fileName:string}):Promise<InstallResult>};
type UpdateState={state:"idle"|"checking"|"available"|"current"|"downloading"|"installing"|"error";message?:string;version?:string};

const UpdateInstaller=registerPlugin<UpdateInstallerPlugin>("UpdateInstaller");
const RELEASE_API="https://api.github.com/repos/ananth8660-picSecure/PicSecure-Renewal/releases/tags/latest-native";
const MANIFEST_ASSET="PicSecure-Renew-update.json";
const REMIND_KEY="picsecure-renew.update-reminder.v1";
const SIX_HOURS=6*60*60*1000;
const REQUEST_TIMEOUT=15_000;

function readableSize(bytes:number){return `${Math.max(1,Math.round(bytes/1024/1024))} MB`}
function announce(detail:UpdateState){window.dispatchEvent(new CustomEvent<UpdateState>("picsecure:update-status",{detail}))}
function parseJson<T>(value:unknown):T{
  if(typeof value==="string")return JSON.parse(value) as T;
  return value as T;
}
async function getJson<T>(url:string,headers:Record<string,string>={}):Promise<T>{
  if(Capacitor.isNativePlatform()){
    const response=await CapacitorHttp.get({url,headers,connectTimeout:REQUEST_TIMEOUT,readTimeout:REQUEST_TIMEOUT,responseType:"json"});
    if(response.status<200||response.status>=300)throw new Error(`Update service returned ${response.status}`);
    return parseJson<T>(response.data);
  }
  const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),REQUEST_TIMEOUT);
  try{
    const response=await fetch(url,{headers,cache:"no-store",signal:controller.signal});
    if(!response.ok)throw new Error(`Update service returned ${response.status}`);
    return await response.json() as T;
  }finally{window.clearTimeout(timer)}
}
function friendlyUpdateError(error:unknown){
  const message=error instanceof Error?error.message:"Could not check for updates.";
  if(error instanceof Error&&error.name==="AbortError")return "The update check timed out. Check your internet connection and try again.";
  if(/failed to fetch|network request failed|networkerror|load failed|unable to resolve host|connection (?:reset|refused)/i.test(message))return "Could not reach the secure update service. Check your internet connection and try again.";
  return message;
}

export default function AppUpdateChecker({children}:{children:ReactNode}){
  const [update,setUpdate]=useState<AvailableUpdate|null>(null),[installState,setInstallState]=useState<"idle"|"downloading"|"installing">("idle"),[error,setError]=useState("");

  const check=useCallback(async(manual=false)=>{
    let currentVersion="";
    try{
      currentVersion=Capacitor.isNativePlatform()?(await App.getInfo()).version:APP_VERSION;
      announce({state:"checking",message:"Checking the verified GitHub release…",version:currentVersion});
      const release=await getJson<GitHubRelease>(RELEASE_API,{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"});
      const android=Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android";
      const manifestAsset=release.assets.find(item=>item.name===MANIFEST_ASSET);
      if(!manifestAsset)throw new Error("Verified update information is not available yet.");
      const manifest=await getJson<UpdateManifest>(`${manifestAsset.browser_download_url}?t=${Date.now()}`,{Accept:"application/json"});
      if(manifest.schemaVersion!==1||!manifest.buildId||!manifest.version)throw new Error("Verified update information is invalid.");
      const assetName=android?manifest.platforms?.android?.assetName:manifest.platforms?.windows?.assetName;
      const asset=release.assets.find(item=>item.name===assetName);
      if(!asset)throw new Error("The verified installer is not available yet.");
      if(isCurrentRelease({currentBuildId:__PICSECURE_BUILD_ID__,currentBuildTime:__PICSECURE_BUILD_TIME__,latestBuildId:manifest.buildId,generatedAt:manifest.generatedAt})){
        setUpdate(null);setError("");localStorage.removeItem(REMIND_KEY);
        announce({state:"current",message:"Everything is up to date. No updates available.",version:currentVersion});return;
      }
      if(!manual){
        const reminder=JSON.parse(localStorage.getItem(REMIND_KEY)||"null") as {assetId?:number;until?:number}|null;
        if(reminder?.assetId===asset.id&&Number(reminder.until)>Date.now())return;
      }
      setError("");setUpdate({asset,currentVersion,latestVersion:manifest.version});announce({state:"available",message:`Version ${manifest.version} is ready to install.`,version:currentVersion});
    }catch(nextError){
      const message=friendlyUpdateError(nextError);
      announce({state:"error",message,version:currentVersion});
    }
  },[]);

  useEffect(()=>{
    const manual=()=>void check(true);
    window.addEventListener("picsecure:check-updates",manual);
    if(Capacitor.isNativePlatform()||window.picSecureDesktop){
      const timer=window.setTimeout(()=>void check(false),1800);
      return()=>{window.clearTimeout(timer);window.removeEventListener("picsecure:check-updates",manual)};
    }
    return()=>window.removeEventListener("picsecure:check-updates",manual);
  },[check]);

  function remindLater(){
    if(update)localStorage.setItem(REMIND_KEY,JSON.stringify({assetId:update.asset.id,until:Date.now()+SIX_HOURS}));
    setUpdate(null);announce({state:"idle",version:update?.currentVersion});
  }

  async function downloadAndInstall(){
    if(!update)return;
    setError("");setInstallState("downloading");localStorage.removeItem(REMIND_KEY);
    announce({state:"downloading",message:"Downloading securely to the app cache…",version:update.currentVersion});
    try{
      if(Capacitor.isNativePlatform()&&Capacitor.getPlatform()==="android"){
        const result=await UpdateInstaller.installApk({url:update.asset.browser_download_url,fileName:"PicSecure-Renew-update.apk"});
        if(result.status==="permission_required"){
          setInstallState("idle");setError("Allow installs from PicSecure Renew, then tap Download & install again.");
          announce({state:"error",message:"Android install permission is required once.",version:update.currentVersion});return;
        }
        setInstallState("installing");announce({state:"installing",message:"Android installer is ready for confirmation.",version:update.currentVersion});return;
      }
      window.open(update.asset.browser_download_url,"_blank","noopener,noreferrer");setInstallState("idle");
    }catch(nextError){
      const message=nextError instanceof Error?nextError.message:"Update download failed.";
      setInstallState("idle");setError(message);announce({state:"error",message,version:update.currentVersion});
    }
  }

  return <>{children}{update&&<div className="native-update-backdrop">
    <section className="native-update-card" role="dialog" aria-modal="true" aria-labelledby="native-update-title">
      <div className="native-update-orbit"><span><img src="./picsecure-renew-logo-512.png" alt=""/></span></div>
      <p>PICSECURE VERIFIED UPDATE</p><h2 id="native-update-title">A fresh build is ready</h2>
      <p className="native-update-copy">{Capacitor.getPlatform()==="android"?"Download stays inside PicSecure Renew cache. Android will only show the final secure installation confirmation.":"Download the verified Windows installer and continue the secure update."}</p>
      <div className="native-update-meta"><span><small>INSTALLED</small><strong>v{update.currentVersion}</strong></span><i/><span><small>AVAILABLE</small><strong>v{update.latestVersion} · {readableSize(update.asset.size)}</strong></span></div>
      {error&&<p className="native-update-error">{error}</p>}
      <button className="native-update-primary" onClick={()=>void downloadAndInstall()} disabled={installState!=="idle"}>{installState==="downloading"?"Downloading securely…":installState==="installing"?"Opening installer…":"Download & install"}<span>{installState==="idle"?"↓":""}</span></button>
      <button className="native-update-later" onClick={remindLater} disabled={installState!=="idle"}>Remind me later</button>
      <small className="native-update-note">{Capacitor.getPlatform()==="android"?"Silent installation is blocked by Android security; one final system confirmation is required.":"Windows may request confirmation before replacing the installed version."}</small>
    </section>
  </div>}</>;
}
