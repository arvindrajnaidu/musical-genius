"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  createRoom,
  joinUrl,
  setStatus,
  updateSettings,
  watchMembers,
  watchMeta,
  watchSettings,
  DEFAULT_SETTINGS,
  type Member,
  type RoomMeta,
  type RoomSettings,
} from "@/lib/room";
import { get, ref } from "firebase/database";
import { db } from "@/lib/firebase/client";
import { errorMessage } from "@/lib/errors";
import { load, save } from "@/lib/storage";

const THEMES = ["Anything goes", "80s", "90s", "2000s", "Rock", "Hip-hop", "Pop", "Bollywood"];
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

// The TV's lobby: big join code + QR, live player list, round/theme settings,
// and Start. Designed to be read from across a room.
export function HostLobby() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [members, setMembers] = useState<Record<string, Member>>({});

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
  const online = players.filter(([, m]) => m.online).length;
  const url = joinUrl(code);
  const theme = settings.theme || THEMES[0];

  if (meta && meta.status !== "lobby") {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <p className="text-2xl uppercase tracking-widest text-white/60">Room {code}</p>
        <h1 className="font-display text-7xl font-bold">Nominations are open!</h1>
        <p className="text-3xl text-white/70">
          {theme} · {settings.rounds} {settings.rounds === 1 ? "song" : "songs"} each
        </p>
        <p className="text-xl text-white/50">(Song picking and playback arrive in the next step.)</p>
        <button onClick={() => setStatus(code, "lobby")} className="mt-4 text-xl text-white/60 underline">
          Back to lobby
        </button>
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-7xl grid-cols-1 gap-12 lg:grid-cols-[auto_1fr]">
      <section className="flex flex-col items-center gap-6 rounded-3xl bg-white/5 p-10">
        <p className="text-2xl text-white/70">Join on your phone</p>
        <div className="rounded-2xl bg-white p-4">
          <QRCodeSVG value={url} size={240} />
        </div>
        <p className="text-xl text-white/60">{url.replace(/^https?:\/\//, "").replace(/\?.*/, "")}</p>
        <p className="font-display text-9xl font-bold tracking-[0.2em]">{code}</p>
      </section>

      <section className="flex flex-col gap-8">
        <div>
          <h2 className="mb-4 text-3xl font-semibold">
            Players <span className="text-white/50">({online})</span>
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
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-4 text-3xl font-semibold">Theme</h2>
          <div className="flex flex-wrap gap-3">
            {THEMES.map((t) => (
              <button
                key={t}
                onClick={() => updateSettings(code, { theme: t === THEMES[0] ? "" : t })}
                className={`rounded-full px-5 py-2 text-xl ${t === theme ? "bg-white text-stage" : "border-2 border-white/30"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <h2 className="text-3xl font-semibold">Songs each</h2>
          <button
            aria-label="Fewer songs"
            onClick={() => updateSettings(code, { rounds: Math.max(1, settings.rounds - 1) })}
            className="h-14 w-14 rounded-full border-2 border-white/30 text-3xl"
          >
            −
          </button>
          <span className="w-10 text-center text-4xl font-bold">{settings.rounds}</span>
          <button
            aria-label="More songs"
            onClick={() => updateSettings(code, { rounds: Math.min(10, settings.rounds + 1) })}
            className="h-14 w-14 rounded-full border-2 border-white/30 text-3xl"
          >
            +
          </button>
        </div>

        <div className="flex items-center gap-6">
          <button
            disabled={online < MIN_PLAYERS}
            onClick={() => setStatus(code, "nominating")}
            className="rounded-2xl bg-like px-10 py-5 text-3xl font-bold text-stage disabled:opacity-40"
          >
            Start game
          </button>
          {online < MIN_PLAYERS && <p className="text-xl text-white/50">Needs at least {MIN_PLAYERS} players</p>}
          <button onClick={newRoom} className="ml-auto text-xl text-white/50 underline">
            New room
          </button>
        </div>
      </section>
    </div>
  );
}
