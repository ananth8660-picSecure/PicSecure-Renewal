"use client";

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { Firestore, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

export type FirebaseServices = { app:FirebaseApp; auth:Auth; db:Firestore };

let servicesPromise:Promise<FirebaseServices>|null=null;

function publicConfig(){
  const env=import.meta.env;
  return {
    apiKey:env.VITE_FIREBASE_API_KEY?.trim(),
    authDomain:env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
    projectId:env.VITE_FIREBASE_PROJECT_ID?.trim(),
    storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET?.trim()||undefined,
    messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim()||undefined,
    appId:env.VITE_FIREBASE_APP_ID?.trim(),
  };
}

export function isFirebaseSyncConfigured(){
  const config=publicConfig();
  return Boolean(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
}

export function getFirebaseServices(){
  if(typeof window==="undefined")return Promise.reject(new Error("Firebase sync is available in the app only."));
  if(!isFirebaseSyncConfigured())return Promise.reject(new Error("Firebase app configuration is missing."));
  if(servicesPromise)return servicesPromise;
  servicesPromise=(async()=>{
    const app=getApps().length?getApp():initializeApp(publicConfig());
    const auth=getAuth(app);
    await setPersistence(auth,browserLocalPersistence);
    let db:Firestore;
    try{
      db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
    }catch{
      db=getFirestore(app);
    }
    return {app,auth,db};
  })();
  return servicesPromise;
}
