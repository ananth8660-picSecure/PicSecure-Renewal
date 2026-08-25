import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.picsecure.renew",
  appName: "PicSecure Renew",
  webDir: "dist-native",
  backgroundColor: "#070a10",
  android: { allowMixedContent: false },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      style: "LIGHT",
      hidden: false,
      animation: "NONE",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_picsecure",
      iconColor: "#24dce8",
      sound: "default",
    },
  },
};

export default config;
