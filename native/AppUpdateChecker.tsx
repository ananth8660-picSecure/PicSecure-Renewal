import { ReactNode, useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

declare const __PICSECURE_BUILD_TIME__: string;

type ReleaseAsset = { id:number; name:string; size:number; updated_at:string; browser_download_url:string };
type GitHubRelease = { assets:ReleaseAsset[] };
type AvailableUpdate = { asset:ReleaseAsset; currentVersion:string };

const RELEASE_API="https://api.github.com/repos/ananth8660-picSecure/PicSecure-Renewal/releases/tags/latest-native";
const REMIND_KEY="picsecure-renew.update-reminder.v1";
const SIX_HOURS=6*60*60*1000;

function readableSize(bytes:number){return `${Math.max(1,Math.round(bytes/1024/1024))} MB`}

export default function AppUpdateChecker({children}:{children:ReactNode}){
  const [update,setUpdate]=useState<AvailableUpdate|null>(null),[opening,setOpening]=useState(false);

  useEffect(()=>{
    if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=="android")return;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>void (async()=>{
      try{
        const response=await fetch(RELEASE_API,{headers:{Accept:"application/vnd.github+json"},signal:controller.signal,cache:"no-store"});
        if(!response.ok)return;
        const release=await response.json() as GitHubRelease;
        const asset=release.assets.find(item=>item.name==="PicSecure-Renew.apk");
        if(!asset||new Date(asset.updated_at).getTime()<=new Date(__PICSECURE_BUILD_TIME__).getTime())return;
        const reminder=JSON.parse(localStorage.getItem(REMIND_KEY)||"null") as {assetId?:number;until?:number}|null;
        if(reminder?.assetId===asset.id&&Number(reminder.until)>Date.now())return;
        const info=await App.getInfo();
        setUpdate({asset,currentVersion:info.version});
      }catch{/* Update checks never interrupt access to the private vault. */}
    })(),1800);
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[]);

  function remindLater(){
    if(update)localStorage.setItem(REMIND_KEY,JSON.stringify({assetId:update.asset.id,until:Date.now()+SIX_HOURS}));
    setUpdate(null);
  }
  function download(){
    if(!update)return;
    setOpening(true);localStorage.removeItem(REMIND_KEY);
    window.open(update.asset.browser_download_url,"_blank","noopener,noreferrer");
    window.setTimeout(()=>setOpening(false),1200);
  }

  return <>{children}{update&&<div className="native-update-backdrop">
    <section className="native-update-card" role="dialog" aria-modal="true" aria-labelledby="native-update-title">
      <div className="native-update-orbit"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"/></svg></span></div>
      <p>PICSECURE VERIFIED UPDATE</p><h2 id="native-update-title">A fresh build is ready</h2>
      <p className="native-update-copy">Update PicSecure Renew for the latest fixes, cloud sync improvements and mobile polish.</p>
      <div className="native-update-meta"><span><small>INSTALLED</small><strong>v{update.currentVersion}</strong></span><i/><span><small>DOWNLOAD</small><strong>{readableSize(update.asset.size)}</strong></span></div>
      <button className="native-update-primary" onClick={download} disabled={opening}>{opening?"Opening download…":"Download update"}<span>↗</span></button>
      <button className="native-update-later" onClick={remindLater}>Remind me later</button>
      <small className="native-update-note">Android will ask you to confirm installation. Your vault data stays on this device.</small>
    </section>
  </div>}</>;
}
