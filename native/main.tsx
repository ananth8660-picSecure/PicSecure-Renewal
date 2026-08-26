import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import Home from "../app/page";
import AppLock from "./AppLock";
import AppUpdateChecker from "./AppUpdateChecker";
import "../app/globals.css";
import "./native.css";

declare const __PICSECURE_API_BASE__: string;

window.__PICSECURE_API_BASE__ = __PICSECURE_API_BASE__;
if(Capacitor.isNativePlatform())document.documentElement.classList.add("capacitor-native");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppLock><AppUpdateChecker><Home /></AppUpdateChecker></AppLock>
  </StrictMode>,
);

if(Capacitor.isNativePlatform()){
  let lastHomeBackPress=0;
  void App.addListener("backButton",()=>{
    const backEvent=new Event("picsecure:hardware-back",{cancelable:true});
    const handled=!window.dispatchEvent(backEvent);
    if(handled){lastHomeBackPress=0;return}

    const now=Date.now();
    if(now-lastHomeBackPress<=2000){void App.exitApp();return}
    lastHomeBackPress=now;
    window.dispatchEvent(new Event("picsecure:exit-hint"));
  });
}
