type RenewalReminderSource = { id:string; name:string; provider:string; expiresOn:string };
type Reminder = { id:string; title:string; body:string; at:string; atEpochMs:number };

const OFFSETS = [30, 15, 7, 3, 1, 0] as const;

function stableNumber(value:string){
  let hash=2166136261;
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return Math.abs(hash)%2_000_000_000+1;
}

function reminderCopy(item:RenewalReminderSource,days:number){
  if(days===0)return{title:`${item.name} renews today`,body:`Open ${item.provider}'s official site to review the renewal.`};
  return{title:`${item.name} · ${days} days left`,body:`${item.provider} renewal is approaching. Review it before the due date.`};
}

export function buildRenewalReminders(items:RenewalReminderSource[],now=new Date()):Reminder[]{
  const reminders:Reminder[]=[];
  for(const item of items){
    const due=new Date(`${item.expiresOn}T09:00:00`);
    if(Number.isNaN(due.getTime()))continue;
    for(const days of OFFSETS){
      const at=new Date(due);at.setDate(at.getDate()-days);
      if(at.getTime()<=now.getTime())continue;
      const copy=reminderCopy(item,days);
      reminders.push({id:`renewal:${item.id}:${days}`,title:copy.title,body:copy.body,at:at.toISOString(),atEpochMs:at.getTime()});
    }
  }
  return reminders.sort((a,b)=>a.at.localeCompare(b.at)).slice(0,500);
}

export async function requestNotificationPermission(){
  if(typeof window==="undefined")return false;
  if(window.picSecureDesktop)return true;
  if(window.__TAURI_INTERNALS__)return true;
  try{
    const [{Capacitor},{LocalNotifications}]=await Promise.all([
      import("@capacitor/core"),import("@capacitor/local-notifications")
    ]);
    if(!Capacitor.isNativePlatform())return false;
    const current=await LocalNotifications.checkPermissions();
    if(current.display==="granted")return true;
    return (await LocalNotifications.requestPermissions()).display==="granted";
  }catch{return false}
}

export async function clearRenewalNotifications(){
  if(typeof window==="undefined")return;
  if(window.picSecureDesktop){await window.picSecureDesktop.clearNotifications();return}
  if(window.__TAURI_INTERNALS__){try{const{invoke}=await import("@tauri-apps/api/core");await invoke("clear_notifications")}catch{}return}
  try{
    const [{Capacitor},{LocalNotifications}]=await Promise.all([
      import("@capacitor/core"),import("@capacitor/local-notifications")
    ]);
    if(!Capacitor.isNativePlatform())return;
    const pending=await LocalNotifications.getPending();
    const renewalsPending=pending.notifications.filter(n=>!(n.extra as {svaraAlert?:boolean}|undefined)?.svaraAlert);
    if(renewalsPending.length)await LocalNotifications.cancel({notifications:renewalsPending.map(n=>({id:n.id}))});
  }catch{}
}

export async function syncRenewalNotifications(items:RenewalReminderSource[]){
  if(typeof window==="undefined")return{scheduled:0,available:false};
  const reminders=buildRenewalReminders(items);
  if(window.picSecureDesktop){
    const result=await window.picSecureDesktop.scheduleNotifications(reminders);
    return{...result,available:true};
  }
  if(window.__TAURI_INTERNALS__){
    try{const{invoke}=await import("@tauri-apps/api/core");const scheduled=await invoke<number>("schedule_notifications",{items:reminders});return{scheduled,available:true}}catch{return{scheduled:0,available:false}}
  }
  try{
    const [{Capacitor},{LocalNotifications}]=await Promise.all([
      import("@capacitor/core"),import("@capacitor/local-notifications")
    ]);
    if(!Capacitor.isNativePlatform())return{scheduled:0,available:false};
    const allowed=await requestNotificationPermission();
    if(!allowed)return{scheduled:0,available:true};
    await LocalNotifications.createChannel({id:"renewals",name:"Renewal reminders",description:"PicSecure Renew due-date reminders",importance:5,visibility:1,vibration:true});
    const pending=await LocalNotifications.getPending();
    const renewalsPending=pending.notifications.filter(n=>!(n.extra as {svaraAlert?:boolean}|undefined)?.svaraAlert);
    if(renewalsPending.length)await LocalNotifications.cancel({notifications:renewalsPending.map(n=>({id:n.id}))});
    if(reminders.length)await LocalNotifications.schedule({notifications:reminders.map(r=>({
      id:stableNumber(r.id),title:r.title,body:r.body,channelId:"renewals",schedule:{at:new Date(r.at),allowWhileIdle:true},extra:{reminderId:r.id}
    }))});
    return{scheduled:reminders.length,available:true};
  }catch{return{scheduled:0,available:false}}
}

/** Shows one alert now (Svara services monitor). Separate from renewal reminders: syncing renewals never cancels it. */
export async function notifyNow(key:string,title:string,body:string){
  if(typeof window==="undefined")return false;
  title=title.slice(0,120);body=body.slice(0,400);
  if(window.picSecureDesktop){
    if(!window.picSecureDesktop.notifyNow)return false;
    try{await window.picSecureDesktop.notifyNow({title,body});return true}catch{return false}
  }
  if(window.__TAURI_INTERNALS__){try{const{invoke}=await import("@tauri-apps/api/core");await invoke("notify_now",{title,body});return true}catch{return false}}
  try{
    const [{Capacitor},{LocalNotifications}]=await Promise.all([
      import("@capacitor/core"),import("@capacitor/local-notifications")
    ]);
    if(Capacitor.isNativePlatform()){
      if(!await requestNotificationPermission())return false;
      await LocalNotifications.createChannel({id:"svara-services",name:"Svara services",description:"A Svara AI service, key or free limit needs attention",importance:4,visibility:1,vibration:true});
      await LocalNotifications.schedule({notifications:[{id:stableNumber(`svara:${key}`),title,body,channelId:"svara-services",schedule:{at:new Date(Date.now()+1500),allowWhileIdle:true},extra:{svaraAlert:true,key}}]});
      return true;
    }
  }catch{}
  try{
    if(!("Notification" in window))return false;
    const allowed=Notification.permission==="granted"||(Notification.permission!=="denied"&&await Notification.requestPermission()==="granted");
    if(!allowed)return false;
    new Notification(title,{body,tag:`svara:${key}`});
    return true;
  }catch{return false}
}
