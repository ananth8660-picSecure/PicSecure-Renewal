"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Props = { onToast?: (message: string) => void };

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isNativeShell() {
  if (typeof window === "undefined") return false;
  const bridge = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(bridge.Capacitor?.isNativePlatform?.() || bridge.__TAURI_INTERNALS__);
}

export default function PwaInstaller({ onToast }: Props) {
  const [mounted, setMounted] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const eligibleProtocol = location.protocol === "https:" || location.hostname === "localhost";
    if (!eligibleProtocol || isNativeShell()) return;

    setMounted(true);
    setInstalled(isStandalone());

    if ("serviceWorker" in navigator) {
      const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      if (document.readyState === "complete") void register();
      else window.addEventListener("load", register, { once: true });
    }

    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(null);
      onToast?.("PicSecure Renew installed successfully");
    };

    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, [onToast]);

  async function install() {
    if (installed) {
      onToast?.("PicSecure Renew is already installed");
      return;
    }
    if (!prompt) {
      const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      onToast?.(isiOS ? "Safari Share → Add to Home Screen" : "Browser menu → Install PicSecure Renew");
      return;
    }
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPrompt(null);
    } finally {
      setInstalling(false);
    }
  }

  if (!mounted) return null;

  return <section className={`pwa-install-card ${installed ? "installed" : ""}`}>
    <span className="pwa-install-icon"><img src="/pwa-192.png" alt="" /></span>
    <div>
      <strong>{installed ? "Web app installed" : "Install PicSecure Renew"}</strong>
      <small>{installed ? "Running in standalone app mode." : "Open like an app from your desktop, Start menu or home screen."}</small>
    </div>
    <button type="button" onClick={() => void install()} disabled={installing || installed}>
      {installed ? "Installed" : installing ? "Installing…" : prompt ? "Install app" : "How to install"}
    </button>
  </section>;
}
