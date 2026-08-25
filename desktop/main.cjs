const { app, BrowserWindow, ipcMain, Menu, Notification, safeStorage, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

let mainWindow;
let tray;
let quitting = false;
let reminders = [];
let scanTimer;

function reminderFile(){return path.join(app.getPath("userData"),"renewal-reminders.bin")}
function persist(){
  const raw=JSON.stringify(reminders);
  const payload=safeStorage.isEncryptionAvailable()?safeStorage.encryptString(raw):Buffer.from(raw,"utf8");
  fs.writeFileSync(reminderFile(),payload);
}
function restore(){
  try{
    const payload=fs.readFileSync(reminderFile());
    const raw=safeStorage.isEncryptionAvailable()?safeStorage.decryptString(payload):payload.toString("utf8");
    reminders=JSON.parse(raw);
  }catch{reminders=[]}
}
function scan(){
  const now=Date.now();let changed=false;
  for(const item of reminders){
    if(item.delivered||new Date(item.at).getTime()>now)continue;
    if(Notification.isSupported())new Notification({title:item.title,body:item.body,icon:path.join(__dirname,"../public/picsecure-renew-logo-512.png")}).show();
    item.delivered=true;changed=true;
  }
  if(changed)persist();
}
function createWindow(){
  mainWindow=new BrowserWindow({
    width:1440,height:920,minWidth:360,minHeight:640,show:false,backgroundColor:"#070a10",
    icon:path.join(__dirname,"../public/picsecure-renew-logo-512.png"),
    title:"PicSecure Renew",
    webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  const dev=process.env.PICSECURE_DESKTOP_DEV_URL;
  if(dev)mainWindow.loadURL(dev);else mainWindow.loadFile(path.join(__dirname,"../dist-native/index.html"));
  mainWindow.once("ready-to-show",()=>mainWindow.show());
  mainWindow.on("close",event=>{if(!quitting){event.preventDefault();mainWindow.hide()}});
  mainWindow.webContents.setWindowOpenHandler(({url})=>{require("electron").shell.openExternal(url);return{action:"deny"}});
}
function createTray(){
  tray=new Tray(path.join(__dirname,"../public/picsecure-renew-logo-512.png"));
  tray.setToolTip("PicSecure Renew · reminders active");
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:"Open PicSecure Renew",click:()=>{mainWindow.show();mainWindow.focus()}},
    {type:"separator"},
    {label:"Quit",click:()=>{quitting=true;app.quit()}}
  ]));
  tray.on("double-click",()=>mainWindow.show());
}

app.whenReady().then(()=>{
  app.setAppUserModelId("com.picsecure.renew");
  app.setLoginItemSettings({openAtLogin:true,args:["--background"]});
  restore();createWindow();createTray();scan();scanTimer=setInterval(scan,30_000);
  if(process.argv.includes("--background"))mainWindow.once("ready-to-show",()=>mainWindow.hide());
});
app.on("before-quit",()=>{quitting=true;if(scanTimer)clearInterval(scanTimer)});
app.on("window-all-closed",event=>event.preventDefault());

ipcMain.handle("notifications:schedule",(_event,items)=>{
  if(!Array.isArray(items))throw new Error("Invalid reminders");
  const delivered=new Set(reminders.filter(r=>r.delivered).map(r=>r.id));
  reminders=items.slice(0,500).map(r=>({id:String(r.id),title:String(r.title),body:String(r.body),at:String(r.at),delivered:delivered.has(String(r.id))}));
  persist();scan();return{scheduled:reminders.filter(r=>!r.delivered).length};
});
ipcMain.handle("notifications:clear",()=>{reminders=[];persist()});
