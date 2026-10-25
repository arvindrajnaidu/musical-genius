"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  createRoom,
  genresOf,
  joinUrl,
  setGenres,
  setStatus,
  watchAllNominations,
  watchMembers,
  watchMeta,
  watchSettings,
  DEFAULT_SETTINGS,
  MAX_GENRES,
  type Member,
  type RoomMeta,
  type RoomSettings,
} from "@/lib/room";
import { get, ref } from "firebase/database";
import { db } from "@/lib/firebase/client";
import { errorMessage } from "@/lib/errors";
import { load, save } from "@/lib/storage";
import { enterFullscreen } from "@/lib/fullscreen";
import { SHELVES } from "@/lib/songs";
import type { Nomination } from "@/lib/game";
import { HostGame } from "./HostGame";

// Every song shelf is a genre the host can make a round of.
const GENRES = Object.keys(SHELVES);
const MIN_PLAYERS = 2;

// Reuse this TV's room across a refresh (sessionStorage is per tab), as long as
// we still host it and it isn't finished; otherwise claim a new code.
async function resumeOrCreate(uid: string): Promise<string> {
  const saved = load("mg.hostRoom", "session");
  if (saved && db) {
    const meta = (await get(ref(db, `rooms/${saved}/meta`))).val() as RoomMeta | null;
    if (meta && meta.hostUid === uid && meta.status !== "finished") return saved;
  }
  const code = await createRoom(uid);
  save("mg.hostRoom", code, "session");
  return code;
}

// The TV's lobby: big join code + QR, live player list, genres (= rounds),
// and Start. Designed to be read from across a room.
export function HostLobby() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [nominations, setNominations] = useState<Record<string, Record<string, Nomination>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await ensureSignedIn();
        const c = await resumeOrCreate(user.uid);
        if (!cancelled) setCode(c);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!code) return;
    const offs = [
      watchMeta(code, setMeta),
      watchSettings(code, (s) => setSettings(s || DEFAULT_SETTINGS)),
      watchMembers(code, setMembers),
      watchAllNominations(code, setNominations),
    ];
    return () => offs.forEach((off) => off());
  }, [code]);

  async function newRoom() {
    save("mg.hostRoom", null, "session");
    setCode(null);
    setMembers({});
    try {
      const user = await ensureSignedIn();
      setCode(await resumeOrCreate(user.uid));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="text-3xl text-nope">{error}</p>
        <button onClick={() => location.reload()} className="rounded-2xl bg-white px-8 py-4 text-2xl font-semibold text-stage">
          Try again
        </button>
      </div>
    );
  }
  if (!code) return <p className="text-3xl text-white/70">Creating a room…</p>;

  const players = Object.entries(members).sort(([, a], [, b]) => (a.joinedAt || 0) - (b.joinedAt || 0));
  // Everyone who joined counts toward starting: a dimmed (offline) player has
  // usually just locked their phone and will be back when it wakes.
  const joinedCount = players.length;
  const url = joinUrl(code);
  const genres = genresOf(settings);
  const picked = (uid: string) => {
    const mine = Object.values(nominations[uid] || {});
    return genres.filter((g) => mine.some((n) => n.genre === g)).length;
  };
  const toggleGenre = (g: string) =>
    setGenres(code, genres.includes(g) ? genres.filter((x) => x !== g) : [...genres, g].slice(0, MAX_GENRES));

  if (meta && meta.status !== "lobby") {
    return <HostGame code={code} meta={meta} settings={settings} members={members} onNewRoom={newRoom} />;
  }

  return (
    <div className="grid w-full max-w-7xl grid-cols-1 gap-12 lg:grid-cols-[auto_1fr]">
      <section className="flex flex-col items-center gap-6 rounded-3xl bg-white/5 p-10">
        <p className="text-2xl text-white/70">Join on your phone and pick your songs</p>
        <div className="rounded-2xl bg-white p-4">
          <QRCodeSVG value={url} size={240} />
        </div>
        <p className="text-xl text-white/60">{url.replace(/^https?:\/\//, "").replace(/\?.*/, "")}</p>
        <p className="font-display text-9xl font-bold tracking-[0.2em]">{code}</p>
      </section>

      <section className="flex flex-col gap-8">
        <div>
          <h2 className="mb-4 text-3xl font-semibold">
            Players <span className="text-white/50">({joinedCount})</span>
          </h2>
          {players.length === 0 ? (
            <p className="text-2xl text-white/50">Waiting for people to join…</p>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {players.map(([uid, m]) => (
                <li
                  key={uid}
                  className={`rounded-full px-6 py-3 text-2xl font-semibold ${m.online ? "bg-white text-stage" : "bg-white/20 text-white/50"}`}
                >
                  {m.name}
                  <span className="ml-2 opacity-60">
                    {picked(uid)}/{genres.length} 🎵
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-1 text-3xl font-semibold">
            Genres <span className="text-white/50">({genres.length} {genres.length === 1 ? "round" : "rounds"})</span>
          </h2>
          <p className="mb-4 text-xl text-white/50">
            Tap in the order you want to play them. Everyone picks one song per genre.
          </p>
          <div className="flex flex-wrap gap-3">
            {GENRES.map((g) => {
              const n = genres.indexOf(g);
              return (
                <button
                  key={g}
                  aria-pressed={n >= 0}
                  onClick={() => toggleGenre(g)}
                  className={`rounded-full px-5 py-2 text-xl ${n >= 0 ? "bg-white font-semibold text-stage" : "border-2 border-white/30"}`}
                >
                  {n >= 0 && <span className="mr-1 opacity-60">{n + 1} ·</span>}
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button
            disabled={joinedCount < MIN_PLAYERS || genres.length === 0}
            onClick={() => {
              enterFullscreen();
              setStatus(code, "nominating");
            }}
            className="rounded-2xl bg-like px-10 py-5 text-3xl font-bold text-stage disabled:opacity-40"
          >
            Start game
          </button>
          {joinedCount < MIN_PLAYERS ? (
            <p className="text-xl text-white/50">Needs at least {MIN_PLAYERS} players</p>
          ) : (
            genres.length === 0 && <p className="text-xl text-white/50">Pick at least one genre</p>
          )}
          <button onClick={newRoom} className="ml-auto text-xl text-white/50 underline">
            New room
          </button>
        </div>
      </section>
    </div>
  );
}
