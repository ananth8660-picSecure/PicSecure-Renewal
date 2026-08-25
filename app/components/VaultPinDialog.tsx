"use client";

import { FormEvent, useState } from "react";
import { createVaultPin, verifyVaultPin } from "../lib/vault-pin";

type VaultPinDialogProps={
  mode:"setup"|"verify";
  onCancel?:()=>void;
  onVerified:()=>void|Promise<void>;
};

export default function VaultPinDialog({mode,onCancel,onVerified}:VaultPinDialogProps){
  const [pin,setPin]=useState(""),[confirm,setConfirm]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[attempts,setAttempts]=useState(0);
  const setup=mode==="setup";
  async function submit(event:FormEvent){
    event.preventDefault();setError("");
    if(!/^\d{6}$/.test(pin)){setError("Enter your exact 6-digit PIN.");return}
    if(setup&&pin!==confirm){setError("PINs do not match. Try again.");return}
    if(!setup&&attempts>=5){setError("Too many attempts. Close and reopen the app before trying again.");return}
    setBusy(true);
    try{
      if(setup)await createVaultPin(pin);
      else if(!await verifyVaultPin(pin)){
        const next=attempts+1;setAttempts(next);setPin("");setError(next>=5?"Too many attempts. Sign out remains blocked.":`Incorrect PIN · ${5-next} attempts remaining`);return;
      }
      await onVerified();
    }catch(nextError){setError(nextError instanceof Error?nextError.message:"PIN verification failed.")}
    finally{setBusy(false)}
  }
  return <div className="vault-pin-backdrop" role="presentation" onMouseDown={()=>onCancel?.()}>
    <section className="vault-pin-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-pin-title" onMouseDown={event=>event.stopPropagation()}>
      <div className="vault-pin-orbit"><span>PS</span></div>
      <p className="vault-pin-eyebrow">{setup?"PRIVATE VAULT SECURITY":"PROTECTED ACTION"}</p>
      <h2 id="vault-pin-title">{setup?"Create your 6-digit PIN":"Verify before signing out"}</h2>
      <p className="vault-pin-copy">{setup?"This PIN protects your vault on this device and is required before account sign-out.":"Enter your PicSecure PIN. Your cloud account stays connected until verification succeeds."}</p>
      <form onSubmit={submit} className="vault-pin-form">
        <label><span>{setup?"Create PIN":"Current PIN"}</span><input autoFocus inputMode="numeric" autoComplete={setup?"new-password":"current-password"} type="password" maxLength={6} pattern="[0-9]{6}" value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,"").slice(0,6))} aria-label={setup?"Create six digit PIN":"Current six digit PIN"}/></label>
        {setup&&<label><span>Confirm PIN</span><input inputMode="numeric" autoComplete="new-password" type="password" maxLength={6} pattern="[0-9]{6}" value={confirm} onChange={event=>setConfirm(event.target.value.replace(/\D/g,"").slice(0,6))} aria-label="Confirm six digit PIN"/></label>}
        {error&&<p className="vault-pin-error">{error}</p>}
        <button className="vault-pin-primary" disabled={busy||pin.length!==6||Boolean(setup&&confirm.length!==6)}>{busy?"Verifying…":setup?"Secure my vault":"Verify & sign out"}</button>
        {!setup&&onCancel&&<button type="button" className="vault-pin-cancel" onClick={onCancel}>Keep me signed in</button>}
      </form>
      <small>Only a salted verification hash stays on this device. Your PIN is never uploaded.</small>
    </section>
  </div>;
}
