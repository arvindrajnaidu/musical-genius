// Realtime Database room layer. Pure data plumbing, no game rules; access is
// constrained by database.rules.json. Same shape as irummy's @cardkit/net rooms,
// adapted for one TV host plus many phone players:
//
//   rooms/<CODE>/meta              { hostUid, status, createdAt }
//   rooms/<CODE>/settings          { rounds, theme }       (host writes)
//   rooms/<CODE>/members/<uid>     { name, online, joinedAt } (each player writes their own)
import {
  ref,
  get,
  set,
  update,
  onValue,
  onDisconnect,
  runTransaction,
  serverTimestamp,
} from "firebase/database";
import { db } from "./firebase/client";

export type RoomStatus = "lobby" | "nominating" | "playing" | "finished";

export type RoomMeta = { hostUid: string; status: RoomStatus; createdAt: number };
export type RoomSettings = { rounds: number; theme: string };
export type Member = { name: string; online: boolean; joinedAt: number };

export const DEFAULT_SETTINGS: RoomSettings = { rounds: 3, theme: "" };
export const MAX_PLAYERS = 20;

// Room codes are typed on phones across a loud room, so: 4 letters, no digits,
// and none of the easily confused I, L or O. 23^4 ≈ 280k codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

function randomCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, "").slice(0, CODE_LENGTH);
}

const base = (code: string) => `rooms/${code}`;

function database() {
  if (!db) throw new Error("firebase-not-configured");
  return db;
}

// Claim a fresh code with a transaction on meta, so two TVs can never end up
// hosting the same room. Rooms older than 12h are treated as free to reuse.
export async function createRoom(hostUid: string): Promise<string> {
  const d = database();
  const STALE_MS = 12 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const res = await runTransaction(ref(d, `${base(code)}/meta`), (cur: RoomMeta | null) => {
      if (cur && Date.now() - (cur.createdAt || 0) < STALE_MS) return; // taken → abort
      return { hostUid, status: "lobby", createdAt: Date.now() };
    });
    if (res.committed) {
      await update(ref(d), {
        [`${base(code)}/settings`]: DEFAULT_SETTINGS,
        [`${base(code)}/members`]: null,
      });
      return code;
    }
  }
  throw new Error("no-free-code");
}

// Join from a phone. Rejects unknown codes, finished games and full rooms (a
// player who already joined can always rejoin, e.g. after a refresh).
export async function joinRoom(code: string, uid: string, name: string): Promise<void> {
  const d = database();
  const meta = (await get(ref(d, `${base(code)}/meta`))).val() as RoomMeta | null;
  if (!meta) throw new Error("room-not-found");
  if (meta.status === "finished") throw new Error("room-finished");
  const members = ((await get(ref(d, `${base(code)}/members`))).val() || {}) as Record<string, Member>;
  if (!members[uid] && Object.keys(members).length >= MAX_PLAYERS) throw new Error("room-full");
  await set(ref(d, `${base(code)}/members/${uid}`), {
    name,
    online: true,
    joinedAt: members[uid]?.joinedAt ?? serverTimestamp(),
  });
  const onlineRef = ref(d, `${base(code)}/members/${uid}/online`);
  onDisconnect(onlineRef).set(false);
}

export async function leaveRoom(code: string, uid: string): Promise<void> {
  await set(ref(database(), `${base(code)}/members/${uid}`), null);
}

export async function updateSettings(code: string, settings: Partial<RoomSettings>): Promise<void> {
  await update(ref(database(), `${base(code)}/settings`), settings);
}

export async function setStatus(code: string, status: RoomStatus): Promise<void> {
  await update(ref(database(), `${base(code)}/meta`), { status });
}

function watch<T>(path: string, cb: (v: T | null) => void) {
  return onValue(ref(database(), path), (s) => cb(s.val() as T | null));
}
export const watchMeta = (code: string, cb: (m: RoomMeta | null) => void) =>
  watch<RoomMeta>(`${base(code)}/meta`, cb);
export const watchSettings = (code: string, cb: (s: RoomSettings | null) => void) =>
  watch<RoomSettings>(`${base(code)}/settings`, cb);
export const watchMembers = (code: string, cb: (m: Record<string, Member>) => void) =>
  watch<Record<string, Member>>(`${base(code)}/members`, (v) => cb(v || {}));

// The link phones open (and the QR code on the TV encodes). Native webviews run
// at capacitor://localhost, which isn't shareable, so fall back to the site URL.
export const SITE_URL = "https://musical-genius.vercel.app";
export function joinUrl(code: string): string {
  const origin =
    typeof location !== "undefined" && location.protocol.startsWith("http") ? location.origin : SITE_URL;
  return `${origin}/play?code=${code}`;
}
