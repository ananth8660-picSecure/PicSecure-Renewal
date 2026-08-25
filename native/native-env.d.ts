/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    __PICSECURE_API_BASE__?: string;
    __TAURI_INTERNALS__?: unknown;
    picSecureDesktop?: {
      platform: "windows";
      scheduleNotifications(items: NativeReminder[]): Promise<{ scheduled:number }>;
      clearNotifications(): Promise<void>;
    };
  }
  type NativeReminder = { id:string; title:string; body:string; at:string };
}
