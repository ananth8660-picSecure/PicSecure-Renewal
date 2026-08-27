"use client";

import { useEffect } from "react";

type Props={
  open:boolean;
  title:string;
  message:string;
  confirmLabel:string;
  busy?:boolean;
  tone?:"danger"|"primary";
  onCancel:()=>void;
  onConfirm:()=>void|Promise<void>;
};

export default function ConfirmDialog({open,title,message,confirmLabel,busy=false,tone="danger",onCancel,onConfirm}:Props){
  useEffect(()=>{
    if(!open)return;
    const closeTopOverlay=(event:Event)=>{if(busy)return;onCancel();event.preventDefault()};
    window.addEventListener("picsecure:close-top-overlay",closeTopOverlay);
    return()=>window.removeEventListener("picsecure:close-top-overlay",closeTopOverlay)
  },[busy,onCancel,open]);

  if(!open)return null;
  return <div className="confirm-backdrop" onMouseDown={()=>{if(!busy)onCancel()}}>
    <section className={`confirm-dialog confirm-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" onMouseDown={event=>event.stopPropagation()}>
      <span className="confirm-mark" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>
      </span>
      <div className="confirm-copy"><p>CONFIRM ACTION</p><h2 id="confirm-title">{title}</h2><span id="confirm-message">{message}</span></div>
      <div className="confirm-actions">
        <button type="button" className="confirm-cancel" disabled={busy} onClick={onCancel}>Keep it</button>
        <button type="button" className="confirm-submit" disabled={busy} onClick={()=>void onConfirm()}>{busy?"Please wait…":confirmLabel}</button>
      </div>
    </section>
  </div>
}
