"use client";

import { useEffect, useState } from "react";
import { APP_VERSION } from "../lib/app-version";
import { isNativeRuntime } from "../lib/runtime";

type UpdateState={state:"idle"|"checking"|"available"|"current"|"downloading"|"installing"|"error";message?:string;version?:string};

export default function AppVersionCard(){
  const [status,setStatus]=useState<UpdateState>({state:"idle"});
  useEffect(()=>{
    const receive=(event:Event)=>setStatus((event as CustomEvent<UpdateState>).detail);
    window.addEventListener("picsecure:update-status",receive);
    return()=>window.removeEventListener("picsecure:update-status",receive);
  },[]);
  async function check(){
    setStatus({state:"checking"});
    if(!isNativeRuntime()){
      try{const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();setStatus({state:"current",version:APP_VERSION,message:"Web app checked. Browser-installed updates apply automatically."})}
      catch{setStatus({state:"error",version:APP_VERSION,message:"Web update check could not be completed."})}
      return;
    }
    window.dispatchEvent(new CustomEvent("picsecure:check-updates",{detail:{manual:true}}));
  }
  const busy=status.state==="checking"||status.state==="downloading"||status.state==="installing";
  const label=status.state==="checking"?"Checking…":status.state==="downloading"?"Downloading update…":status.state==="installing"?"Preparing installer…":"Check for updates";
  return <section className="app-version-card">
    <div className="app-version-mark">PS</div><div className="app-version-copy"><strong>PicSecure Renew</strong><small>Installed version · v{status.version||APP_VERSION}</small>{status.message&&<p className={`update-inline ${status.state}`}>{status.message}</p>}</div>
    <button type="button" onClick={()=>void check()} disabled={busy}>{busy?<i className="mini-spinner"/>:null}{label}</button>
  </section>;
}
