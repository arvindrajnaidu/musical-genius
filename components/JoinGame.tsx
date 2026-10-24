"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ensureSignedIn } from "@/lib/firebase/auth";
import {
  joinRoom,
  leaveRoom,
  normalizeCode,
  watchMeta,
  watchSettings,
  CODE_LENGTH,
  type RoomMeta,
  type RoomSettings,
} from "@/lib/room";
import { errorMessage } from "@/lib/errors";
import { load, save } from "@/lib/storage";
import { PlayerGame } from "./PlayerGame";

async function buzz() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* haptics are a nicety */
  }
}

// The phone controller: enter the code from the TV plus a nickname, then wait in
// the lobby. A ?code= link (from the TV's QR code) prefills the code.
export function JoinGame() {
  const params = useSearchParams();
  const [code, setCode] = useState(() => normalizeCode(params.get("code") || ""));
  // useSearchParams makes this component client-rendered only, so storage is
  // safe to read during the first render.
  const [name, setName] = useState(() => load("mg.name") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ code: string; uid: string } | null>(null);
  const [meta, setMeta] = useState<RoomMeta | null | undefined>(undefined);
  const [settings, setSettings] = useState<RoomSettings | null>(null);

  useEffect(() => {
    if (!joined) return;
    const offs = [watchMeta(joined.code, setMeta), watchSettings(joined.code, setSettings)];
    return () => offs.forEach((off) => off());
  }, [joined]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const nick = name.trim().slice(0, 20);
    if (code.length !== CODE_LENGTH || !nick) return;
    setBusy(true);
    setError(null);
    try {
      const user = await ensureSignedIn(nick);
      await joinRoom(code, user.uid, nick);
      save("mg.name", nick);
      setJoined({ code, uid: user.uid });
      buzz();
    } catch (err) {
      console.error(err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (joined) await leaveRoom(joined.code, joined.uid).catch(() => {});
    setJoined(null);
    setMeta(undefined);
  }

  if (joined) {
    const theme = settings?.theme || "Anything goes";
    const rounds = settings?.rounds ?? 0;
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <p className="text-sm uppercase tracking-widest text-white/60">Room {joined.code}</p>
        {meta === null ? (
          <h1 className="font-display text-3xl font-bold">This game has ended</h1>
        ) : meta?.status === "lobby" || meta === undefined ? (
          <>
            <h1 className="font-display text-4xl font-bold">You&apos;re in, {name.trim()}!</h1>
            <p className="text-lg text-white/70">Watch the TV. The game starts when the host is ready.</p>
          </>
        ) : null}
        {meta && meta.status !== "lobby" && settings && (
          <PlayerGame code={joined.code} uid={joined.uid} meta={meta} settings={settings} />
        )}
        {settings && meta?.status === "lobby" && (
          <p className="rounded-xl bg-white/10 px-4 py-3 text-white/80">
            {theme} · {rounds} {rounds === 1 ? "song" : "songs"} each
          </p>
        )}
        <button onClick={leave} className="text-white/50 underline">
          Leave
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={join} className="flex w-full max-w-sm flex-col gap-4">
      <h1 className="mb-2 text-center font-display text-4xl font-bold">Join a game</h1>
      <label className="flex flex-col gap-1 text-left">
        <span className="text-sm text-white/70">Room code</span>
        <input
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          placeholder="ABCD"
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          className="rounded-2xl bg-white px-4 py-4 text-center font-display text-4xl font-bold tracking-[0.3em] text-stage placeholder:text-stage/30"
        />
      </label>
      <label className="flex flex-col gap-1 text-left">
        <span className="text-sm text-white/70">Your name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="DJ Awesome"
          autoComplete="nickname"
          className="rounded-2xl bg-white px-4 py-4 text-xl text-stage placeholder:text-stage/30"
        />
      </label>
      {error && <p className="text-nope">{error}</p>}
      <button
        type="submit"
        disabled={busy || code.length !== CODE_LENGTH || !name.trim()}
        className="mt-2 rounded-2xl bg-like px-6 py-4 text-xl font-bold text-stage disabled:opacity-40"
      >
        {busy ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
