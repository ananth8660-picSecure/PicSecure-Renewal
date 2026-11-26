"use client";
// Images and PDFs attached to thoughts. The thought keeps only a small list of its files; the bytes are stored in the
// owner's private Firestore space as chunks (users/{uid}/files/{fileId}/chunks/{n}, under 1 MiB each, owner-only by
// the security rules). Firestore's on-device cache keeps them, so a file opened once opens offline too.
// Free plan: no Cloud Storage needed (it needs a card on new projects); Firestore free has 1 GiB.
import { Bytes, deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseServices } from "./firebase-client";

export type ThoughtFile = { id:string; name:string; type:string; size:number; chunks:number; width?:number; height?:number; addedAt:string };
/** A file picked in the editor, ready to upload with the thought. */
export type PendingFile = { meta:ThoughtFile; blob:Blob; url:string };

export const FILE_CHUNK = 900 * 1024;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES_PER_THOUGHT = 12;
export const ACCEPT = "image/*,application/pdf,.pdf";
const IMAGE_EDGE = 2400, IMAGE_KEEP_BYTES = 1_200_000, NAME_MAX = 140;

export const isImage = (f:{type:string}) => f.type.startsWith("image/");
export const isPdf = (f:{type:string;name?:string}) => f.type === "application/pdf" || /\.pdf$/i.test(f.name ?? "");
export const chunkCount = (size:number) => Math.max(1, Math.ceil(size / FILE_CHUNK));

export function fileSize(bytes:number){
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${Math.round(bytes/1024)} KB`;
  return `${(bytes/1024/1024).toFixed(bytes<10*1024*1024?1:0)} MB`;
}
const cleanName = (name:string) => (name.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim() || "file").slice(0, NAME_MAX);

/** Big photos are resized (longest side 2400 px) and re-encoded, so they upload fast and use little of the free space. */
async function shrinkImage(file:File):Promise<{blob:Blob;width:number;height:number}>{
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(file)}catch{throw new Error(`“${file.name}” is not an image this device can open. Use JPG, PNG or WebP.`)}
  const {width,height}=bitmap;
  // Animated GIFs and already-small images stay exactly as they are.
  if(file.type==="image/gif"||(file.size<=IMAGE_KEEP_BYTES&&Math.max(width,height)<=IMAGE_EDGE)){bitmap.close();return {blob:file,width,height}}
  const scale=Math.min(1,IMAGE_EDGE/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale);
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d");if(!ctx){bitmap.close();return {blob:file,width,height}}
  ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
  const encode=(type:string)=>new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,.86));
  const out=(await encode("image/webp"))??(await encode("image/jpeg"));
  return out&&out.size<file.size?{blob:out,width:w,height:h}:{blob:file,width,height};
}

/** Checks and prepares one picked file (images shrunk); throws a message the person can read. */
export async function prepareFile(file:File):Promise<PendingFile>{
  const pdf=isPdf(file),image=!pdf&&file.type.startsWith("image/");
  if(!pdf&&!image)throw new Error(`“${file.name}” is not an image or a PDF.`);
  let blob:Blob=file,width:number|undefined,height:number|undefined;
  if(image)({blob,width,height}=await shrinkImage(file));
  if(blob.size>MAX_FILE_BYTES)throw new Error(`“${file.name}” is ${fileSize(blob.size)}. Files can be up to ${fileSize(MAX_FILE_BYTES)}.`);
  if(!blob.size)throw new Error(`“${file.name}” is empty.`);
  let name=cleanName(file.name);
  const type=pdf?"application/pdf":blob.type||file.type;
  if(image&&blob!==file)name=name.replace(/\.[a-z0-9]+$/i,"")+(type==="image/webp"?".webp":".jpg");
  const meta:ThoughtFile={id:crypto.randomUUID(),name,type,size:blob.size,chunks:chunkCount(blob.size),width,height,addedAt:new Date().toISOString()};
  return {meta,blob,url:URL.createObjectURL(blob)};
}

async function owner(){
  const {auth,db}=await getFirebaseServices();
  const uid=auth.currentUser?.uid;
  if(!uid)throw new Error("Sign in to Private Cloud Vault before adding files.");
  return {uid,db};
}
const chunkRef=(db:Awaited<ReturnType<typeof owner>>["db"],uid:string,fileId:string,i:number)=>doc(db,"users",uid,"files",fileId,"chunks",String(i));

/** Uploads one file; onProgress gets 0..1. Each chunk is confirmed by Firestore before the next. */
export async function uploadFile(file:PendingFile,onProgress?:(part:number)=>void){
  if(!navigator.onLine)throw new Error("Internet connection is needed to save files securely.");
  const {uid,db}=await owner();
  const bytes=new Uint8Array(await file.blob.arrayBuffer()),n=file.meta.chunks;
  for(let i=0;i<n;i++){
    const part=bytes.subarray(i*FILE_CHUNK,Math.min(bytes.length,(i+1)*FILE_CHUNK));
    try{await setDoc(chunkRef(db,uid,file.meta.id,i),{data:Bytes.fromUint8Array(part),i,n})}
    catch(error){
      const code=typeof error==="object"&&error&&"code" in error?String((error as {code?:unknown}).code):"";
      throw new Error(code.includes("permission-denied")?"Files are not allowed yet: deploy the updated Firestore rules (npx firebase-tools deploy --only firestore:rules).":`“${file.meta.name}” could not be uploaded. Check the connection and try again.`);
    }
    onProgress?.((i+1)/n);
  }
  remember(file.meta.id,Promise.resolve(file.blob));
}

const loaded=new Map<string,Promise<Blob>>();
function remember(id:string,blob:Promise<Blob>){
  if(loaded.size>40){const first=loaded.keys().next().value;if(first)loaded.delete(first)}
  loaded.set(id,blob);
}
/** The file's bytes (from memory, the on-device cache, or Firestore). */
export function loadFile(meta:ThoughtFile):Promise<Blob>{
  const kept=loaded.get(meta.id);if(kept)return kept;
  const job=(async()=>{
    const {uid,db}=await owner();
    const parts=await Promise.all(Array.from({length:meta.chunks},async(_,i)=>{
      const snap=await getDoc(chunkRef(db,uid,meta.id,i));
      const data=snap.exists()?snap.get("data"):null;
      if(!(data instanceof Bytes))throw new Error(navigator.onLine?`“${meta.name}” could not be loaded.`:`“${meta.name}” has not been opened on this device yet. Connect to the internet once to keep it offline.`);
      return data.toUint8Array();
    }));
    return new Blob(parts as BlobPart[],{type:meta.type});
  })();
  remember(meta.id,job);
  job.catch(()=>loaded.delete(meta.id));
  return job;
}

/** Removes a file's stored bytes (after the thought no longer lists it). Failures are left for the next delete. */
export async function deleteFiles(files:ThoughtFile[]){
  if(!files.length)return;
  const {uid,db}=await owner();
  await Promise.allSettled(files.flatMap(f=>Array.from({length:f.chunks},(_,i)=>deleteDoc(chunkRef(db,uid,f.id,i)))));
  for(const f of files)loaded.delete(f.id);
}

/** Saves the file to the device (download on desktop and web, share / open sheet where the browser offers it). */
export async function saveFileToDevice(meta:ThoughtFile){
  const blob=await loadFile(meta);
  const file=new File([blob],meta.name,{type:meta.type});
  const nav=navigator as Navigator&{canShare?:(data:{files:File[]})=>boolean};
  if(nav.canShare?.({files:[file]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){try{await nav.share({files:[file],title:meta.name});return}catch{/* cancelled: fall back to download */}}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=meta.name;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(a.href),30_000);
}
