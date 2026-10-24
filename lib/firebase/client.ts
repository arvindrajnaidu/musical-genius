import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

// Firebase web config for the musical-genius project. It is public by design
// (it ships in every client bundle); access is governed by database.rules.json.
// Committed so web, iOS and Android builds work without per-machine env setup;
// NEXT_PUBLIC_FIREBASE_* env vars still override it (e.g. a staging project).
const env = process.env;
const config = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAqX3_rdDdMO-6ApM2awTOTGm0cFNbt7F8",
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "musical-genius.firebaseapp.com",
  databaseURL:
    env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://musical-genius-default-rtdb.firebaseio.com",
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "musical-genius",
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "musical-genius.firebasestorage.app",
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1059959884070",
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1059959884070:web:3fa6c28f3b4362d4e2d9e7",
};

export const firebaseConfigured = Boolean(config.apiKey && config.databaseURL);

export const app: FirebaseApp | null = firebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(config)
  : null;

// Inside the Capacitor WebView (capacitor://localhost) getAuth()'s popup/redirect
// resolver waits on a cross-origin iframe that never loads, which hangs every auth
// call. We only use anonymous sign-in, so the native build skips the resolver.
// (Same workaround as Birthday Scroll and Rummy Monk.)
function createAuth(a: FirebaseApp): Auth {
  if (process.env.NEXT_PUBLIC_NATIVE_BUILD !== "1") return getAuth(a);
  return initializeAuth(a, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  });
}

export const auth: Auth | null = app ? createAuth(app) : null;

// Realtime Database (not Firestore) for rooms: low-latency fan-out and
// onDisconnect presence, which is what live voting needs. Mirrors irummy.
export const db: Database | null = app ? getDatabase(app) : null;
