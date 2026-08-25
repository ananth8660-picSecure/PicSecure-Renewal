import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import AppLock from "./AppLock";
import "../app/globals.css";
import "./native.css";

declare const __PICSECURE_API_BASE__: string;

window.__PICSECURE_API_BASE__ = __PICSECURE_API_BASE__;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppLock><Home /></AppLock>
  </StrictMode>,
);
