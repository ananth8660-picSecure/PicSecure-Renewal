import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import Home from "../app/page";
import AppLock from "./AppLock";
import "../app/globals.css";
import "./native.css";

declare const __PICSECURE_API_BASE__: string;

window.__PICSECURE_API_BASE__ = __PICSECURE_API_BASE__;
if(Capacitor.isNativePlatform())document.documentElement.classList.add("capacitor-native");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppLock><Home /></AppLock>
  </StrictMode>,
);
