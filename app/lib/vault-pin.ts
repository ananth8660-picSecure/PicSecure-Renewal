"use client";

export type VaultPinRecord = { salt:string; hash:string; biometric:boolean };

const LOCK_KEY="picsecure.renew.lock.v1";
const PIN_PATTERN=/^\d{6}$/;

function bytesToBase64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes))}
function base64ToBytes(value:string){return Uint8Array.from(atob(value),character=>character.charCodeAt(0))}
async function pinHash(pin:string,salt:Uint8Array){
  const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
  const normalizedSalt=new Uint8Array(salt).buffer as ArrayBuffer;
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:normalizedSalt,iterations:310_000},material,256);
  return bytesToBase64(new Uint8Array(bits));
}

export function readVaultPinRecord():VaultPinRecord|null{
  if(typeof window==="undefined")return null;
  try{
    const parsed=JSON.parse(localStorage.getItem(LOCK_KEY)||"null") as Partial<VaultPinRecord>|null;
    return parsed&&typeof parsed.salt==="string"&&typeof parsed.hash==="string"?{salt:parsed.salt,hash:parsed.hash,biometric:Boolean(parsed.biometric)}:null;
  }catch{return null}
}

export function hasVaultPin(){return Boolean(readVaultPinRecord())}

export async function createVaultPin(pin:string,biometric=false){
  if(!PIN_PATTERN.test(pin))throw new Error("Enter exactly 6 digits.");
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const record:VaultPinRecord={salt:bytesToBase64(salt),hash:await pinHash(pin,salt),biometric};
  localStorage.setItem(LOCK_KEY,JSON.stringify(record));
  return record;
}

export async function verifyVaultPin(pin:string){
  if(!PIN_PATTERN.test(pin))return false;
  const record=readVaultPinRecord();
  if(!record)return false;
  const candidate=await pinHash(pin,base64ToBytes(record.salt));
  if(candidate.length!==record.hash.length)return false;
  let difference=0;
  for(let index=0;index<candidate.length;index++)difference|=candidate.charCodeAt(index)^record.hash.charCodeAt(index);
  return difference===0;
}
