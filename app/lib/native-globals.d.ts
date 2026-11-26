export {};

declare global {
  interface Window {
    __PICSECURE_API_BASE__?: string;
    __TAURI_INTERNALS__?: unknown;
    picSecureDesktop?: {
      platform: "windows";
      scheduleNotifications(items: PicSecureReminder[]): Promise<{ scheduled:number }>;
      clearNotifications(): Promise<void>;
      notifyNow?(item: { title:string; body:string }): Promise<void>;
    };
  }
  type PicSecureReminder = { id:string; title:string; body:string; at:string };
}
