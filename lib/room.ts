// Realtime Database room layer. Pure data plumbing, no game rules; access is
// constrained by database.rules.json. Same shape as irummy's @cardkit/net rooms,
// adapted for one TV host plus many phone players:
//
//   rooms/<CODE>/meta                    { hostUid, status, createdAt }
//   rooms/<CODE>/settings                { genres, rounds, theme, clipSeconds } (host writes)
//   rooms/<CODE>/members/<uid>           { name, online, joinedAt } (each player writes their own)
//   rooms/<CODE>/nominations/<uid>/<id>  Nomination (player writes own; only they and the host read)
//   rooms/<CODE>/queue                   QueueItem[] (host writes when the music starts)
//   rooms/<CODE>/play                    { index, phase, startedAt } (host drives playback)
//   rooms/<CODE>/votes/<index>/<uid>     1 (player writes own, only while that song plays;
//                                        see lib/game.ts for how that becomes one vote per round)
import { siteOrigin } from "./site";
import {
  ref,
  push,
  get,
  set,
  update,
  onValue,
  onDisconnect,
  runTransaction,
  serverTimestamp,
} from "firebase/database";
import { db } from "./firebase/client";
import type { Nomination, QueueItem, Vote, Votes } from "./game";

export type RoomStatus = "lobby" | "nominating" | "playing" | "finished";

export type RoomMeta = { hostUid: string; status: RoomStatus; createdAt: number };
// genres: the rounds, in play order; each player picks one song per genre.
// rounds mirrors genres.length (at least 1, as the rules require) and theme is
// unused; both stay for rooms and builds from before genres.
// clipSeconds: how much of each song plays before the reveal (0 = whole song).
export type RoomSettings = { genres?: string[]; rounds: number; theme: string; clipSeconds: number };
// "playing" while the song is on and votes are open; "reveal" shows who picked it
// and the tally before the next song.
export type Play = { index: number; phase: "playing" | "reveal"; startedAt: number };
export type Member = { name: string; online: boolean; joinedAt: number };

export const DEFAULT_SETTINGS: RoomSettings = { genres: [], rounds: 1, theme: "", clipSeconds: 0 };
export const MAX_GENRES = 10;

// The Realtime Database drops empty arrays, so a room with no genres yet reads back without the key.
export const genresOf = (s: RoomSettings) => (s.genres || []).filter(Boolean);
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
}

// Keep `online` true whenever this phone is connected. An onDisconnect handler
// fires once and is not re-armed, so a phone that locked its screen (dropping
// the socket) would otherwise stay "offline" after it reconnects. Re-arm and
// re-mark on every (re)connect instead. Returns an unsubscribe.
export function trackPresence(code: string, uid: string): () => void {
  const d = database();
  const onlineRef = ref(d, `${base(code)}/members/${uid}/online`);
  return onValue(ref(d, ".info/connected"), async (snap) => {
    if (snap.val() !== true) return;
    await onDisconnect(onlineRef).set(false);
    // Only re-mark if we're still a member (not removed via Leave).
    const name = (await get(ref(d, `${base(code)}/members/${uid}/name`))).val();
    if (name) await set(onlineRef, true);
  });
}

export async function leaveRoom(code: string, uid: string): Promise<void> {
  const d = database();
  // Cancel the armed presence write, or it would recreate a nameless entry.
  await onDisconnect(ref(d, `${base(code)}/members/${uid}/online`)).cancel();
  await set(ref(d, `${base(code)}/members/${uid}`), null);
}

export async function updateSettings(code: string, settings: Partial<RoomSettings>): Promise<void> {
  await update(ref(database(), `${base(code)}/settings`), settings);
}

export async function setGenres(code: string, genres: string[]): Promise<void> {
  await updateSettings(code, { genres, rounds: Math.max(1, genres.length) });
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

// ---- nominations (phones) ----
// One pick per genre: a new pick for a genre replaces the old one.
export async function nominateForGenre(
  code: string,
  uid: string,
  song: Omit<Nomination, "at" | "genre">,
  genre: string,
  replace: string[],
): Promise<void> {
  const d = database();
  const mine = `${base(code)}/nominations/${uid}`;
  const id = push(ref(d, mine)).key!;
  await update(ref(d), {
    ...Object.fromEntries(replace.map((old) => [`${mine}/${old}`, null])),
    [`${mine}/${id}`]: { ...song, genre, at: serverTimestamp() },
  });
}
export const watchMyNominations = (code: string, uid: string, cb: (n: Record<string, Nomination>) => void) =>
  watch<Record<string, Nomination>>(`${base(code)}/nominations/${uid}`, (v) => cb(v || {}));
// Host only (rules): everyone's picks, to show progress and build the queue.
export const watchAllNominations = (
  code: string,
  cb: (n: Record<string, Record<string, Nomination>>) => void,
) => watch<Record<string, Record<string, Nomination>>>(`${base(code)}/nominations`, (v) => cb(v || {}));

// ---- playback (host) ----
// One multi-path update so phones never see a queue without a matching play state.
export async function startMusic(code: string, queue: QueueItem[]): Promise<void> {
  await update(ref(database()), {
    [`${base(code)}/queue`]: queue,
    [`${base(code)}/votes`]: null,
    [`${base(code)}/play`]: { index: 0, phase: "playing", startedAt: serverTimestamp() },
    [`${base(code)}/meta/status`]: "playing",
  });
}
export async function setPlay(code: string, play: Omit<Play, "startedAt">): Promise<void> {
  await set(ref(database(), `${base(code)}/play`), { ...play, startedAt: serverTimestamp() });
}
// Back to the lobby with the same players; picks, queue and votes are cleared.
export async function resetGame(code: string): Promise<void> {
  await update(ref(database()), {
    [`${base(code)}/nominations`]: null,
    [`${base(code)}/queue`]: null,
    [`${base(code)}/votes`]: null,
    [`${base(code)}/play`]: null,
    [`${base(code)}/meta/status`]: "lobby",
  });
}
export const watchQueue = (code: string, cb: (q: QueueItem[]) => void) =>
  watch<QueueItem[]>(`${base(code)}/queue`, (v) => cb(v || []));
export const watchPlay = (code: string, cb: (p: Play | null) => void) => watch<Play>(`${base(code)}/play`, cb);
export const watchVotes = (code: string, cb: (v: Votes) => void) =>
  watch<Votes>(`${base(code)}/votes`, (v) => cb(v || {}));

// ---- voting (phones) ----
export async function vote(code: string, index: number, uid: string, v: Vote = 1): Promise<void> {
  await set(ref(database(), `${base(code)}/votes/${index}/${uid}`), v);
}

// The link phones open (and the QR code on the TV encodes).
export const joinUrl = (code: string) => `${siteOrigin()}/play?code=${code}`;
