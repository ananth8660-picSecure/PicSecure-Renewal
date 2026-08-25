"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type ThoughtNote = {
  id:string;
  title:string;
  body:string;
  color:string;
  pinned:boolean;
  createdAt:string;
  updatedAt:string;
};

type Props={
  notes:ThoughtNote[];
  onChange:(notes:ThoughtNote[])=>void;
  onToast:(message:string)=>void;
  onActivity?:(title:string,detail:string)=>void;
};

const PALETTE=["cyan","violet","sunset","emerald","rose","azure"];

function NoteIcon({name,size=20}:{name:"note"|"plus"|"sparkle"|"copy"|"edit"|"trash"|"pin"|"close"|"search"|"chevron";size?:number}){
  const paths={
    note:<><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5M8 12h8M8 16h6"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>,
    sparkle:<><path d="m12 3 1.4 4.1L17.5 9l-4.1 1.4L12 15l-1.4-4.6L6.5 9l4.1-1.9Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z"/></>,
    copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    edit:<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash:<><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></>,
    pin:<><path d="m15 4 5 5-3 1-4 4 1 4-1 1-8-8 1-1 4 1 4-4Z"/><path d="m9 15-5 5"/></>,
    close:<><path d="m6 6 12 12M18 6 6 18"/></>,
    search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    chevron:<path d="m9 18 6-6-6-6"/>
  } as const;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function smartPoints(body:string){
  const lines=body.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>line.replace(/^[-*•\d.)\s]+/,"").trim()).filter(Boolean);
  if(lines.length>1)return lines;
  const sentences=(lines[0]||"").split(/(?<=[.!?])\s+/).map(line=>line.trim()).filter(Boolean);
  return sentences.length>1?sentences:lines;
}

function dateLabel(value:string){
  return new Date(value).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"});
}

export default function ThoughtNotes({notes,onChange,onToast,onActivity}:Props){
  const [editorOpen,setEditorOpen]=useState(false),[editing,setEditing]=useState<ThoughtNote|null>(null),[query,setQuery]=useState(""),[expanded,setExpanded]=useState<Set<string>>(new Set()),[draftColor,setDraftColor]=useState(PALETTE[0]);
  const sorted=useMemo(()=>notes.filter(note=>`${note.title} ${note.body}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime()),[notes,query]);
  useEffect(()=>{
    const closeTopOverlay=(event:Event)=>{if(!editorOpen)return;setEditorOpen(false);setEditing(null);event.preventDefault()};
    window.addEventListener("picsecure:close-top-overlay",closeTopOverlay);
    return()=>window.removeEventListener("picsecure:close-top-overlay",closeTopOverlay)
  },[editorOpen]);

  function openNew(){setEditing(null);setDraftColor(PALETTE[notes.length%PALETTE.length]);setEditorOpen(true)}
  function openEdit(note:ThoughtNote){setEditing(note);setDraftColor(note.color);setEditorOpen(true)}
  function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const data=new FormData(e.currentTarget),title=String(data.get("title")||"").trim(),body=String(data.get("body")||"").trim();if(!title||!body)return;
    const now=new Date().toISOString();
    if(editing){const next={...editing,title,body,color:draftColor,updatedAt:now};onChange(notes.map(note=>note.id===editing.id?next:note));onActivity?.("Thought updated",title);onToast("Thought updated")}
    else{const next:ThoughtNote={id:crypto.randomUUID(),title,body,color:draftColor,pinned:false,createdAt:now,updatedAt:now};onChange([next,...notes]);setExpanded(current=>new Set(current).add(next.id));onActivity?.("New thought saved",title);onToast("Thought saved to your private vault")}
    setEditorOpen(false);setEditing(null)
  }
  function remove(note:ThoughtNote){if(!window.confirm(`Delete “${note.title}”?`))return;onChange(notes.filter(item=>item.id!==note.id));onActivity?.("Thought deleted",note.title);onToast("Thought deleted")}
  function togglePin(note:ThoughtNote){onChange(notes.map(item=>item.id===note.id?{...item,pinned:!item.pinned,updatedAt:new Date().toISOString()}:item));onToast(note.pinned?"Removed from pinned":"Pinned to the top")}
  function toggleExpand(id:string){setExpanded(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}
  async function copyAll(note:ThoughtNote){try{await navigator.clipboard.writeText(`${note.title}\n\n${note.body}`);onToast("Title and complete note copied")}catch{onToast("Copy permission is unavailable on this device")}}

  return <section className="thoughts-view">
    <div className="thoughts-hero">
      <div className="thoughts-hero-icon"><NoteIcon name="sparkle" size={26}/></div>
      <div><p>PRIVATE IDEA STUDIO</p><h2>Capture now. Shape it later.</h2><span>Your thoughts stay readable, searchable and synced across your signed-in devices.</span></div>
      <button onClick={openNew}><NoteIcon name="plus" size={18}/>New thought</button>
    </div>
    <div className="thoughts-toolbar">
      <div><NoteIcon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search titles or details…"/></div>
      <span><strong>{notes.length}</strong> {notes.length===1?"thought":"thoughts"} saved</span>
    </div>
    {sorted.length?<div className="thought-list">{sorted.map(note=>{
      const isOpen=expanded.has(note.id),points=smartPoints(note.body);
      return <article key={note.id} className={`thought-card thought-${note.color} ${isOpen?"expanded":""}`}>
        <button className="thought-summary" onClick={()=>toggleExpand(note.id)} aria-expanded={isOpen}>
          <span className="thought-color"><NoteIcon name="note" size={20}/></span>
          <span className="thought-title"><span>{note.pinned&&<i><NoteIcon name="pin" size={12}/>Pinned</i>}<time>Added {dateLabel(note.createdAt)}</time></span><strong>{note.title}</strong><small>{points[0]||"Open this thought to read the details."}</small></span>
          <span className="thought-chevron"><NoteIcon name="chevron" size={19}/></span>
        </button>
        <div className="thought-expand"><div className="thought-expand-inner">
          <div className="thought-detail-head"><div><span>SMART DETAIL VIEW</span><small>{note.updatedAt!==note.createdAt?`Edited ${dateLabel(note.updatedAt)}`:`Created ${dateLabel(note.createdAt)}`}</small></div><div className="thought-actions"><button onClick={()=>void copyAll(note)} title="Copy title and complete note"><NoteIcon name="copy" size={16}/><span>Copy all</span></button><button onClick={()=>togglePin(note)} title={note.pinned?"Unpin":"Pin"}><NoteIcon name="pin" size={16}/></button><button onClick={()=>openEdit(note)} title="Edit"><NoteIcon name="edit" size={16}/></button><button className="thought-delete" onClick={()=>remove(note)} title="Delete"><NoteIcon name="trash" size={16}/></button></div></div>
          <ul className="thought-points">{points.map((point,index)=><li key={`${note.id}-${index}`}><span>{String(index+1).padStart(2,"0")}</span><p>{point}</p></li>)}</ul>
          <div className="thought-original"><span>ORIGINAL NOTE</span><p>{note.body}</p></div>
        </div></div>
      </article>
    })}</div>:<div className="thought-empty"><span><NoteIcon name="sparkle" size={27}/></span><h3>{notes.length?"No matching thoughts":"Your idea space is ready"}</h3><p>{notes.length?"Try a different title or keyword.":"Save a title and your raw thought. PicSecure Renew will present it as a clear detail view."}</p>{!notes.length&&<button onClick={openNew}><NoteIcon name="plus" size={17}/>Write your first thought</button>}</div>}
    {editorOpen&&<div className="thought-modal-backdrop" onMouseDown={()=>setEditorOpen(false)}><section className="thought-editor" role="dialog" aria-modal="true" aria-label={editing?"Edit thought":"New thought"} onMouseDown={e=>e.stopPropagation()}>
      <header><div><span><NoteIcon name="sparkle" size={20}/></span><div><p>{editing?"REFINE THOUGHT":"NEW THOUGHT"}</p><h2>{editing?"Edit your idea":"Capture what is on your mind"}</h2></div></div><button onClick={()=>setEditorOpen(false)} aria-label="Close"><NoteIcon name="close"/></button></header>
      <form onSubmit={save}><label><span>Thought title</span><input name="title" required maxLength={120} defaultValue={editing?.title||""} placeholder="Give this thought a clear name" autoFocus/></label><label><span>Your thought</span><textarea name="body" required maxLength={12000} defaultValue={editing?.body||""} placeholder="Write freely. Use new lines when you already have separate points…"/></label><div className="thought-editor-footer"><div><span>Card color</span><div className="thought-palette">{PALETTE.map(color=><button key={color} type="button" className={`${color} ${draftColor===color?"active":""}`} onClick={()=>setDraftColor(color)} aria-label={`${color} color`}/>)}</div></div><button className="thought-save" type="submit"><NoteIcon name={editing?"edit":"sparkle"} size={17}/>{editing?"Save changes":"Save thought"}</button></div></form>
    </section></div>}
  </section>
}
