import { FormEvent, ReactNode, useEffect, useState } from "react";
import { createVaultPin, readVaultPinRecord, VaultPinRecord, verifyVaultPin } from "../app/lib/vault-pin";

export default function AppLock({children}:{children:ReactNode}){
  const [record,setRecord]=useState<VaultPinRecord|null>(()=>readVaultPinRecord()),[unlocked,setUnlocked]=useState(false),[pin,setPin]=useState(""),[confirm,setConfirm]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[attempts,setAttempts]=useState(0),[biometricAvailable,setBiometricAvailable]=useState(false);
  useEffect(()=>{let active=true;void (async()=>{try{const [{Capacitor},{BiometricAuth}]=await Promise.all([import("@capacitor/core"),import("@aparajita/capacitor-biometric-auth")]);if(!Capacitor.isNativePlatform())return;const result=await BiometricAuth.checkBiometry();if(active)setBiometricAvailable(result.isAvailable)}catch{if(active)setBiometricAvailable(false)}})();return()=>{active=false}},[]);
  useEffect(()=>{
    if(!unlocked)return;
    let hiddenAt=0;
    const visibility=()=>{if(document.hidden)hiddenAt=Date.now();else if(hiddenAt&&Date.now()-hiddenAt>120_000){setUnlocked(false);setPin("")}};
    document.addEventListener("visibilitychange",visibility);return()=>document.removeEventListener("visibilitychange",visibility)
  },[unlocked]);
  async function biometricUnlock(){
    setBusy(true);setError("");
    try{const {BiometricAuth,AndroidBiometryStrength}=await import("@aparajita/capacitor-biometric-auth");await BiometricAuth.authenticate({reason:"Unlock your private renewal vault",allowDeviceCredential:true,androidTitle:"Unlock PicSecure Renew",androidSubtitle:"Use fingerprint, face or device PIN",androidConfirmationRequired:false,androidBiometryStrength:AndroidBiometryStrength.strong});setUnlocked(true);setAttempts(0)}catch{setError("Biometric unlock was cancelled or unavailable. Use your PicSecure PIN.")}finally{setBusy(false)}
  }
  async function createPin(e:FormEvent){
    e.preventDefault();setError("");
    if(!/^\d{6}$/.test(pin)){setError("Enter exactly 6 digits.");return}
    if(pin!==confirm){setError("PINs do not match.");return}
    setBusy(true);const next=await createVaultPin(pin,biometricAvailable);setRecord(next);setPin("");setConfirm("");setUnlocked(true);setBusy(false)
  }
  async function unlock(e:FormEvent){
    e.preventDefault();if(!record||busy)return;
    if(attempts>=5){setError("Too many attempts. Close the app and try again after a short break.");return}
    setBusy(true);const valid=await verifyVaultPin(pin);
    if(valid){setUnlocked(true);setAttempts(0);setPin("");setError("")}else{setAttempts(v=>v+1);setPin("");setError(`Incorrect PIN · ${Math.max(0,4-attempts)} attempts remaining`)}setBusy(false)
  }
  if(unlocked)return <>{children}</>;
  const setup=!record;
  return <main className="native-lock"><div className="lock-ambient one"/><div className="lock-ambient two"/><section className="lock-card">
    <div className="lock-brand"><img src="./picsecure-renew-logo.svg" alt=""/><div><strong>PicSecure Renew</strong><small>TRACK. REMIND. RENEW.</small></div></div>
    <div className="lock-shield"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9 12l2 2 4-5"/></svg></div>
    <p className="lock-eyebrow">{setup?"PRIVATE VAULT SETUP":"LOCAL VAULT LOCKED"}</p><h1>{setup?"Create your PicSecure PIN":"Welcome back, Ananth"}</h1><p className="lock-copy">{setup?"Use this six-digit PIN to protect renewal details on this device.":"Unlock with your PIN or your device biometrics."}</p>
    <form onSubmit={setup?createPin:unlock} className="lock-form"><label><span>{setup?"Create 6-digit PIN":"6-digit PIN"}</span><input inputMode="numeric" autoComplete={setup?"new-password":"current-password"} type="password" maxLength={6} pattern="[0-9]{6}" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,6))} autoFocus/></label>{setup&&<label><span>Confirm PIN</span><input inputMode="numeric" autoComplete="new-password" type="password" maxLength={6} pattern="[0-9]{6}" value={confirm} onChange={e=>setConfirm(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>}{error&&<p className="lock-error">{error}</p>}<button className="lock-primary" disabled={busy||pin.length!==6||Boolean(setup&&confirm.length!==6)}>{busy?"Securing…":setup?"Create private vault":"Unlock vault"}</button></form>
    {!setup&&record.biometric&&biometricAvailable&&<button className="lock-biometric" onClick={()=>void biometricUnlock()} disabled={busy}><span>◎</span>Use fingerprint or device lock</button>}
    <p className="lock-note">Your PIN is never stored. Only a salted verification hash remains on this device.</p>
  </section></main>
}
