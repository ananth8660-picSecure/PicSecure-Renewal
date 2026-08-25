const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("picSecureDesktop", {
  platform: "windows",
  scheduleNotifications: (items) => ipcRenderer.invoke("notifications:schedule", items),
  clearNotifications: () => ipcRenderer.invoke("notifications:clear"),
});
