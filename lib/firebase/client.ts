import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

// Firebase web config (public; access is governed by database.rules.json). When
// the env isn't set yet, `app` is null and the UI shows a setup notice instead of
// crashing.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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
