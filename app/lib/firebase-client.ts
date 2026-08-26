"use client";

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { Firestore, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

export type FirebaseServices = { app:FirebaseApp; auth:Auth; db:Firestore };

let servicesPromise:Promise<FirebaseServices>|null=null;

// Firebase web-app identifiers are public by design. Keeping the production
// project fallback here makes the same private vault available in web, APK and
// Windows builds even when a local .env file is not copied into the build.
const PRODUCTION_CONFIG={
  apiKey:"AIzaSyCLHUrPQ5C_V4QT-aUzkjYZa0vZkgcM0IA",
  authDomain:"pic-renew-track.firebaseapp.com",
  projectId:"pic-renew-track",
  storageBucket:"pic-renew-track.firebasestorage.app",
  messagingSenderId:"970817121961",
  appId:"1:970817121961:web:d0562f454bdc52f2f903b8",
};

function publicConfig(){
  const env=import.meta.env;
  return {
    apiKey:env.VITE_FIREBASE_API_KEY?.trim()||PRODUCTION_CONFIG.apiKey,
    authDomain:env.VITE_FIREBASE_AUTH_DOMAIN?.trim()||PRODUCTION_CONFIG.authDomain,
    projectId:env.VITE_FIREBASE_PROJECT_ID?.trim()||PRODUCTION_CONFIG.projectId,
    storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET?.trim()||PRODUCTION_CONFIG.storageBucket,
    messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim()||PRODUCTION_CONFIG.messagingSenderId,
    appId:env.VITE_FIREBASE_APP_ID?.trim()||PRODUCTION_CONFIG.appId,
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
