"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseServices, isFirebaseSyncConfigured } from "./firebase-client";

export type CloudVault = { items:unknown[]; log:unknown[]; profile:unknown; settings:unknown; notes:unknown[] };
export type CloudSyncStatus = "not_configured"|"connecting"|"signed_out"|"syncing"|"synced"|"offline"|"error";
export type CloudSyncController = {
  configured:boolean; user:User|null; status:CloudSyncStatus; error:string; lastSyncedAt:string;
  signIn:(email:string,password:string)=>Promise<void>;
  createAccount:(email:string,password:string)=>Promise<void>;
  resetPassword:(email:string)=>Promise<void>;
  signOutAccount:()=>Promise<void>;
  syncNow:()=>Promise<void>;
};

const DEVICE_KEY="picsecure.cloud.device.v1";

function hashVault(vault:CloudVault){return JSON.stringify(vault)}
function isCloudVault(value:unknown):value is CloudVault{
  if(!value||typeof value!=="object")return false;
  const vault=value as Partial<CloudVault>;
  return Array.isArray(vault.items)&&Array.isArray(vault.log)&&Boolean(vault.profile)&&typeof vault.profile==="object"&&Boolean(vault.settings)&&typeof vault.settings==="object"&&(!("notes" in vault)||Array.isArray(vault.notes));
}
function normalizeVault(vault:CloudVault,fallbackNotes:unknown[]=[]):CloudVault{return {...vault,notes:Array.isArray(vault.notes)?vault.notes:fallbackNotes}}
function mergeNotes(remote:unknown[],local:unknown[]){
  const merged=new Map<string,unknown>();
  const stamp=(value:unknown)=>{if(!value||typeof value!=="object")return 0;const note=value as {updatedAt?:unknown;createdAt?:unknown};return new Date(String(note.updatedAt||note.createdAt||0)).getTime()||0};
  for(const value of [...remote,...local]){
    if(!value||typeof value!=="object"||!("id" in value))continue;
    const id=String((value as {id:unknown}).id),existing=merged.get(id);
    if(!existing||stamp(value)>=stamp(existing))merged.set(id,value);
  }
  return [...merged.values()];
}
function deviceId(){
  const saved=localStorage.getItem(DEVICE_KEY);if(saved)return saved;
  const id=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,id);return id;
}
function friendlyError(error:unknown){
  const code=typeof error==="object"&&error&&"code" in error?String((error as {code?:unknown}).code):"";
  if(code.includes("invalid-credential"))return "Email or password is incorrect.";
  if(code.includes("email-already-in-use"))return "An account already exists for this email. Sign in instead.";
  if(code.includes("weak-password"))return "Use a password with at least 6 characters.";
  if(code.includes("operation-not-allowed"))return "Enable Email/Password sign-in in Firebase Authentication.";
  if(code.includes("network-request-failed"))return "You are offline. Local changes are safe and will sync when connected.";
  if(code.includes("permission-denied"))return "Firestore access was denied. Deploy the included security rules.";
  return error instanceof Error?error.message:"Cloud sync could not be completed.";
}

export function useCloudVaultSync(vault:CloudVault,ready:boolean,applyRemote:(vault:CloudVault)=>void):CloudSyncController{
  const configured=isFirebaseSyncConfigured();
  const [user,setUser]=useState<User|null>(null),[status,setStatus]=useState<CloudSyncStatus>(configured?"connecting":"not_configured"),[error,setError]=useState(""),[lastSyncedAt,setLastSyncedAt]=useState("");
  const vaultRef=useRef(vault),applyRemoteRef=useRef(applyRemote),userRef=useRef<User|null>(null),cloudReadyRef=useRef(false),lastCloudHashRef=useRef(""),pendingRemoteHashRef=useRef(""),timerRef=useRef<number|null>(null),unsubscribeDocRef=useRef<null|(()=>void)>(null);
  useEffect(()=>{vaultRef.current=vault;applyRemoteRef.current=applyRemote},[applyRemote,vault]);

  const push=useCallback(async(force=false)=>{
    const active=userRef.current;if(!active||!cloudReadyRef.current)return;
    const current=vaultRef.current,currentHash=hashVault(current);
    if(!force&&currentHash===lastCloudHashRef.current)return;
    setStatus("syncing");setError("");
    try{
      const {db}=await getFirebaseServices();
      await setDoc(doc(db,"users",active.uid,"vault","main"),{schemaVersion:5,vault:current,updatedAt:serverTimestamp(),updatedBy:deviceId()},{merge:true});
      lastCloudHashRef.current=currentHash;setLastSyncedAt(new Date().toISOString());setStatus(navigator.onLine?"synced":"offline");
    }catch(nextError){setError(friendlyError(nextError));setStatus(navigator.onLine?"error":"offline");throw nextError}
  },[]);

  useEffect(()=>{
    if(!configured||!ready)return;
    let cancelled=false,unsubscribeAuth:(()=>void)|null=null;
    void getFirebaseServices().then(({auth,db})=>{
      if(cancelled)return;
      unsubscribeAuth=onAuthStateChanged(auth,nextUser=>{
        unsubscribeDocRef.current?.();unsubscribeDocRef.current=null;userRef.current=nextUser;setUser(nextUser);cloudReadyRef.current=false;lastCloudHashRef.current="";pendingRemoteHashRef.current="";setError("");
        if(!nextUser){setStatus("signed_out");return}
        setStatus("connecting");
        const vaultDoc=doc(db,"users",nextUser.uid,"vault","main");
        unsubscribeDocRef.current=onSnapshot(vaultDoc,{includeMetadataChanges:true},snapshot=>{
          if(!snapshot.exists()){
            cloudReadyRef.current=true;setStatus(snapshot.metadata.fromCache?"offline":"syncing");
            if(!snapshot.metadata.fromCache)void push(true).catch(()=>undefined);
            return;
          }
          const snapshotData=snapshot.data(),remote=snapshotData.vault;
          if(!isCloudVault(remote))return;
          const remoteHasNotes=Array.isArray((remote as Partial<CloudVault>).notes);
          const localNotes=vaultRef.current.notes;
          const normalized=normalizeVault(remote,localNotes);
          normalized.notes=remoteHasNotes?mergeNotes(normalized.notes,localNotes):localNotes;
          const remoteHash=hashVault(normalized),storedRemoteHash=hashVault(normalizeVault(remote,[])),localHash=hashVault(vaultRef.current);
          lastCloudHashRef.current=remoteHash;cloudReadyRef.current=true;
          if(remoteHash!==localHash){pendingRemoteHashRef.current=remoteHash;applyRemoteRef.current(normalized)}
          // Vaults created before Thoughts existed have no `vault.notes` field.
          // Migrate only that field so an older cloud snapshot can never erase
          // notes which already live in this browser. The following snapshot
          // then distributes them to Android and Windows in real time.
          if((!remoteHasNotes&&localNotes.length)||storedRemoteHash!==remoteHash){
            setStatus("syncing");
            void updateDoc(vaultDoc,{"vault.notes":normalized.notes,schemaVersion:5,updatedAt:serverTimestamp(),updatedBy:deviceId()})
              .catch(nextError=>{setError(friendlyError(nextError));setStatus(navigator.onLine?"error":"offline")});
          }
          setLastSyncedAt(new Date().toISOString());setStatus(snapshot.metadata.fromCache?"offline":"synced");setError("");
        },nextError=>{setError(friendlyError(nextError));setStatus(navigator.onLine?"error":"offline")});
      });
      if(cancelled)unsubscribeAuth();
    }).catch(nextError=>{if(!cancelled){setError(friendlyError(nextError));setStatus("error")}});
    return()=>{cancelled=true;unsubscribeAuth?.();unsubscribeDocRef.current?.();unsubscribeDocRef.current=null};
  },[configured,push,ready]);

  useEffect(()=>{
    if(!configured||!ready||!user||!cloudReadyRef.current)return;
    const localHash=hashVault(vault);
    if(pendingRemoteHashRef.current){
      if(localHash===pendingRemoteHashRef.current){lastCloudHashRef.current=localHash;pendingRemoteHashRef.current=""}
      return;
    }
    if(localHash===lastCloudHashRef.current)return;
    if(timerRef.current)window.clearTimeout(timerRef.current);
    timerRef.current=window.setTimeout(()=>void push().catch(()=>undefined),650);
    return()=>{if(timerRef.current)window.clearTimeout(timerRef.current)};
  },[configured,push,ready,user,vault]);

  useEffect(()=>{
    if(!configured)return;
    const online=()=>{if(userRef.current){setStatus("syncing");void push(true).catch(()=>undefined)}};
    const offline=()=>{if(userRef.current)setStatus("offline")};
    window.addEventListener("online",online);window.addEventListener("offline",offline);
    return()=>{window.removeEventListener("online",online);window.removeEventListener("offline",offline)};
  },[configured,push]);

  const authenticate=async(mode:"signin"|"create",email:string,password:string)=>{
    setStatus("connecting");setError("");
    try{const {auth}=await getFirebaseServices();if(mode==="create")await createUserWithEmailAndPassword(auth,email.trim(),password);else await signInWithEmailAndPassword(auth,email.trim(),password)}
    catch(nextError){const message=friendlyError(nextError);setError(message);setStatus("signed_out");throw new Error(message)}
  };
  const resetPassword=async(email:string)=>{try{const {auth}=await getFirebaseServices();await sendPasswordResetEmail(auth,email.trim())}catch(nextError){throw new Error(friendlyError(nextError))}};
  const signOutAccount=async()=>{const {auth}=await getFirebaseServices();await signOut(auth);setStatus("signed_out")};

  return {configured,user,status,error,lastSyncedAt,signIn:(email,password)=>authenticate("signin",email,password),createAccount:(email,password)=>authenticate("create",email,password),resetPassword,signOutAccount,syncNow:()=>push(true)};
}
