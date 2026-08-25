const API_BASE_KEY = "picsecure-renew.api-base";

function normalized(value: string | undefined | null) {
  return value?.trim().replace(/\/$/, "") || "";
}

export function getApiBase() {
  if (typeof window === "undefined") return "";
  const saved = normalized(window.localStorage.getItem(API_BASE_KEY));
  return saved || normalized(window.__PICSECURE_API_BASE__);
}

export function setApiBase(value: string) {
  if (typeof window === "undefined") return;
  const next = normalized(value);
  if (next) window.localStorage.setItem(API_BASE_KEY, next);
  else window.localStorage.removeItem(API_BASE_KEY);
  window.dispatchEvent(new CustomEvent("picsecure:api-base-changed", { detail: next }));
}

export function hasApiBase() {
  return Boolean(getApiBase());
}

export function apiUrl(path: string) {
  if (!path.startsWith("/")) throw new Error("API paths must begin with /");
  if (typeof window === "undefined") return path;
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}

export function isNativeRuntime() {
  if (typeof window === "undefined") return false;
  const nativePlatform = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  return Boolean(nativePlatform || window.picSecureDesktop || window.__TAURI_INTERNALS__ || window.location.protocol === "capacitor:");
}
