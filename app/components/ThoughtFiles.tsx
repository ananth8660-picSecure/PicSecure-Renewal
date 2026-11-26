"use client";
/* eslint-disable @next/next/no-img-element -- private blob: images from the vault; next/image cannot load them */

import { useEffect, useRef, useState } from "react";
import "./ThoughtFiles.css";
import { fileSize, isImage, isPdf, loadFile, saveFileToDevice, type ThoughtFile } from "../lib/thought-files";

type PdfLib = typeof import("pdfjs-dist");
let pdfLib:Promise<PdfLib>|null=null;
/** pdf.js, loaded only when a PDF is shown (works the same in the browser, the Android app and the desktop app). */
function pdfjs(){
  return pdfLib??=(async()=>{
    // Bundled as a plain .js worker: Android's app WebView does not serve .mjs files as JavaScript.
    const [lib,worker]=await Promise.all([import("pdfjs-dist"),import("pdfjs-dist/build/pdf.worker.min.mjs?worker")]);
    lib.GlobalWorkerOptions.workerPort=new worker.default();
    return lib;
  })();
}
async function openPdf(blob:Blob){const lib=await pdfjs();return lib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise}

export function FileIcon({name,size=18}:{name:"image"|"pdf"|"clip"|"download"|"close"|"left"|"right"|"zoom";size?:number}){
  const paths={
    image:<><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 9"/></>,
    pdf:<><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3Zm0 3v2M14 13v5M14 13h2M14 15.5h1.5"/></>,
    clip:<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>,
    download:<><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></>,
    close:<path d="m6 6 12 12M18 6 6 18"/>,
    left:<path d="m15 18-6-6 6-6"/>,
    right:<path d="m9 18 6-6-6-6"/>,
    zoom:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></>,
  } as const;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/** Loads a file only when its tile comes on screen. */
function useFileUrl(meta:ThoughtFile,enabled:boolean){
  const [url,setUrl]=useState(""),[error,setError]=useState("");
  useEffect(()=>{
    if(!enabled)return;
    let alive=true,made="";
    loadFile(meta).then(blob=>{if(!alive)return;made=URL.createObjectURL(blob);setUrl(made)}).catch(e=>{if(alive)setError(e instanceof Error?e.message:"Could not load")});
    return()=>{alive=false;if(made)URL.revokeObjectURL(made)};
  },[meta,enabled]);
  return {url,error};
}
function useVisible<T extends Element>(){
  const ref=useRef<T|null>(null),[seen,setSeen]=useState(false);
  useEffect(()=>{
    const node=ref.current;if(!node||seen)return;
    if(typeof IntersectionObserver==="undefined"){const t=setTimeout(()=>setSeen(true),0);return()=>clearTimeout(t)}
    const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setSeen(true);io.disconnect()}},{rootMargin:"200px"});
    io.observe(node);return()=>io.disconnect();
  },[seen]);
  return {ref,seen};
}

function PdfCover({meta,enabled}:{meta:ThoughtFile;enabled:boolean}){
  const canvas=useRef<HTMLCanvasElement|null>(null),[pages,setPages]=useState(0),[failed,setFailed]=useState(false);
  useEffect(()=>{
    if(!enabled)return;
    let alive=true;
    (async()=>{
      try{
        const pdf=await openPdf(await loadFile(meta));if(!alive)return;setPages(pdf.numPages);
        const page=await pdf.getPage(1),base=page.getViewport({scale:1}),scale=320/base.width,view=page.getViewport({scale});
        const c=canvas.current;if(!c||!alive)return;c.width=Math.round(view.width);c.height=Math.round(view.height);
        await page.render({canvas:c,canvasContext:c.getContext("2d")!,viewport:view}).promise;
      }catch{if(alive)setFailed(true)}
    })();
    return()=>{alive=false};
  },[meta,enabled]);
  return <>{failed?<span className="tf-tile-icon"><FileIcon name="pdf" size={30}/></span>:<canvas ref={canvas} aria-hidden="true"/>}<em className="tf-badge">PDF{pages?` · ${pages} ${pages===1?"page":"pages"}`:""}</em></>;
}

function Tile({meta,onOpen}:{meta:ThoughtFile;onOpen:()=>void}){
  const {ref,seen}=useVisible<HTMLButtonElement>();
  const image=isImage(meta),{url,error}=useFileUrl(meta,seen&&image);
  return <button ref={ref} type="button" className={`tf-tile ${image?"image":"pdf"}`} onClick={onOpen} title={meta.name}>
    <span className="tf-tile-media">
      {image?(url?<img src={url} alt={meta.name} loading="lazy"/>:<span className={`tf-tile-icon ${error?"error":"loading"}`}><FileIcon name="image" size={28}/></span>):<PdfCover meta={meta} enabled={seen}/>}
    </span>
    <span className="tf-tile-meta"><strong>{meta.name}</strong><small>{error?"Tap to retry":fileSize(meta.size)}</small></span>
  </button>;
}

export function FileGallery({files,onOpen}:{files:ThoughtFile[];onOpen:(index:number)=>void}){
  if(!files.length)return null;
  const images=files.filter(isImage).length,pdfs=files.length-images;
  return <div className="tf-gallery">
    <div className="tf-gallery-head"><span><FileIcon name="clip" size={14}/>ATTACHMENTS</span><small>{[images&&`${images} ${images===1?"image":"images"}`,pdfs&&`${pdfs} ${pdfs===1?"PDF":"PDFs"}`].filter(Boolean).join(" · ")}</small></div>
    <div className="tf-grid">{files.map((f,i)=><Tile key={f.id} meta={f} onOpen={()=>onOpen(i)}/>)}</div>
  </div>;
}

function PdfPages({meta}:{meta:ThoughtFile}){
  const host=useRef<HTMLDivElement|null>(null),[state,setState]=useState<{pages:number;shown:number;error:string}>({pages:0,shown:0,error:""});
  const [limit,setLimit]=useState(20);
  useEffect(()=>{
    let alive=true;
    const box=host.current;if(!box)return;
    box.replaceChildren();
    (async()=>{
      try{
        const pdf=await openPdf(await loadFile(meta));if(!alive)return;
        const count=Math.min(pdf.numPages,limit),ratio=Math.min(window.devicePixelRatio||1,2),width=Math.min(box.clientWidth||800,1100);
        setState({pages:pdf.numPages,shown:0,error:""});
        for(let n=1;n<=count&&alive;n++){
          const page=await pdf.getPage(n),base=page.getViewport({scale:1}),view=page.getViewport({scale:width/base.width*ratio});
          const c=document.createElement("canvas");c.width=Math.round(view.width);c.height=Math.round(view.height);c.style.width=`${Math.round(view.width/ratio)}px`;c.setAttribute("aria-label",`Page ${n}`);
          await page.render({canvas:c,canvasContext:c.getContext("2d")!,viewport:view}).promise;
          if(!alive)return;box.appendChild(c);setState(s=>({...s,shown:n}));
        }
      }catch(e){if(alive)setState(s=>({...s,error:e instanceof Error?e.message:"This PDF could not be opened."}))}
    })();
    return()=>{alive=false};
  },[meta,limit]);
  return <div className="tf-pdf">
    {state.error?<p className="tf-error">{state.error}</p>:state.shown<Math.min(state.pages||1,limit)&&<p className="tf-loading">Opening page {state.shown+1}{state.pages?` of ${state.pages}`:""}…</p>}
    <div ref={host} className="tf-pdf-pages"/>
    {state.pages>limit&&state.shown>=limit&&<button type="button" className="tf-more" onClick={()=>setLimit(l=>l+20)}>Show next pages ({state.pages-limit} more)</button>}
  </div>;
}

function ImageView({meta}:{meta:ThoughtFile}){
  const {url,error}=useFileUrl(meta,true),[zoom,setZoom]=useState(false);
  if(error)return <p className="tf-error">{error}</p>;
  if(!url)return <p className="tf-loading">Opening image…</p>;
  return <div className={`tf-image ${zoom?"zoomed":""}`} onClick={()=>setZoom(z=>!z)}><img src={url} alt={meta.name}/></div>;
}

/** Full-screen viewer: images (tap to zoom) and PDFs page by page; arrows / swipe between files; Esc or back closes. */
export function FileViewer({files,index,onIndex,onClose}:{files:ThoughtFile[];index:number;onIndex:(i:number)=>void;onClose:()=>void}){
  const meta=files[index],[saving,setSaving]=useState(false),touch=useRef<number|null>(null);
  const go=(step:number)=>onIndex((index+step+files.length)%files.length);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();else if(e.key==="ArrowRight"&&files.length>1)onIndex((index+1)%files.length);else if(e.key==="ArrowLeft"&&files.length>1)onIndex((index-1+files.length)%files.length)};
    const back=(e:Event)=>{onClose();e.preventDefault();e.stopImmediatePropagation()};
    window.addEventListener("keydown",key);window.addEventListener("picsecure:close-top-overlay",back,{capture:true});
    return()=>{window.removeEventListener("keydown",key);window.removeEventListener("picsecure:close-top-overlay",back,{capture:true})};
  },[files.length,index,onClose,onIndex]);
  if(!meta)return null;
  async function save(){setSaving(true);try{await saveFileToDevice(meta)}catch{/* the viewer already shows load errors */}finally{setSaving(false)}}
  return <div className="tf-viewer" role="dialog" aria-modal="true" aria-label={meta.name}
    onTouchStart={e=>{touch.current=e.touches[0]?.clientX??null}} onTouchEnd={e=>{const x=e.changedTouches[0]?.clientX;if(touch.current!=null&&x!=null&&files.length>1&&isImage(meta)&&Math.abs(x-touch.current)>70)go(x<touch.current?1:-1);touch.current=null}}>
    <header>
      <span className="tf-viewer-kind"><FileIcon name={isPdf(meta)?"pdf":"image"} size={17}/></span>
      <div><strong>{meta.name}</strong><small>{fileSize(meta.size)}{files.length>1?` · ${index+1} of ${files.length}`:""}</small></div>
      <button type="button" onClick={()=>void save()} disabled={saving} title="Save to device"><FileIcon name="download"/><span>{saving?"Saving…":"Save"}</span></button>
      <button type="button" onClick={onClose} aria-label="Close"><FileIcon name="close"/></button>
    </header>
    <main>{isPdf(meta)?<PdfPages key={meta.id} meta={meta}/>:<ImageView key={meta.id} meta={meta}/>}</main>
    {files.length>1&&<><button type="button" className="tf-nav prev" onClick={()=>go(-1)} aria-label="Previous file"><FileIcon name="left" size={22}/></button><button type="button" className="tf-nav next" onClick={()=>go(1)} aria-label="Next file"><FileIcon name="right" size={22}/></button></>}
  </div>;
}
