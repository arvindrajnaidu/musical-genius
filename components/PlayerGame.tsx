"use client";

import { useEffect, useState } from "react";
import { tally, type Nomination, type QueueItem, type Vote, type Votes } from "@/lib/game";
import {
  nominate,
  removeNomination,
  vote,
  watchMyNominations,
  watchPlay,
  watchQueue,
  watchVotes,
  type Play,
  type RoomMeta,
  type RoomSettings,
} from "@/lib/room";
import { lookupVideo, parseVideoId, searchAvailable, searchSongs, thumbUrl, type Song } from "@/lib/youtube";

async function buzz() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* haptics are a nicety */
  }
}

type Props = { code: string; uid: string; meta: RoomMeta; settings: RoomSettings };

// The phone during a game: pick songs, then vote on each one as the TV plays it.
export function PlayerGame({ code, uid, meta, settings }: Props) {
  // Picking opens as soon as you join: in the lobby and during the picking phase.
  if (meta.status === "lobby" || meta.status === "nominating")
    return <Nominate code={code} uid={uid} settings={settings} />;
  return <PlayAndVote code={code} uid={uid} finished={meta.status === "finished"} />;
}

function Nominate({ code, uid, settings }: { code: string; uid: string; settings: RoomSettings }) {
  const [mine, setMine] = useState<Record<string, Nomination>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => watchMyNominations(code, uid, setMine), [code, uid]);

  const picks = Object.entries(mine).sort(([, a], [, b]) => (a.at || 0) - (b.at || 0));
  const full = picks.length >= settings.rounds;
  const over = picks.length - settings.rounds;

  async function add(song: Song) {
    if (full || picks.some(([, p]) => p.videoId === song.videoId)) return;
    await nominate(code, uid, song);
    setQuery("");
    setResults([]);
    buzz();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const id = parseVideoId(q);
      if (id) await add(await lookupVideo(id));
      else if (searchAvailable) {
        const found = await searchSongs(q);
        setResults(found);
        if (!found.length) setError("No results. Try another search.");
      } else setError("Paste a YouTube link (Share → Copy link in the YouTube app).");
    } catch (err) {
      console.error(err);
      const m = err instanceof Error ? err.message : "";
      setError(
        m === "not-embeddable"
          ? "That video can't be played outside YouTube. Try another upload of the song."
          : m === "video-not-found"
            ? "Couldn't find that video."
            : m === "search-quota"
              ? "Search is out of juice for today. Paste a YouTube link instead."
              : /permission/i.test(m)
                ? "The game server refused that song. (Host: make sure the latest database rules are deployed.)"
                : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Pick your songs</h1>
        <p className="text-white/70">
          {settings.theme || "Anything goes"} · {Math.min(picks.length, settings.rounds)}/{settings.rounds} picked
        </p>
        {over > 0 && (
          <p className="mt-1 text-sm text-amber-200">
            The host lowered the song count. Remove {over} so your favourites play.
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {picks.map(([id, p]) => (
          <li key={id} className="flex items-center gap-3 rounded-2xl bg-white/10 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, static export */}
            <img src={thumbUrl(p.videoId)} alt="" className="h-12 w-20 rounded-lg object-cover" />
            <span className="flex-1 text-left text-sm leading-tight">{p.title}</span>
            <button
              aria-label={`Remove ${p.title}`}
              onClick={() => removeNomination(code, uid, id)}
              className="px-2 text-xl text-white/50"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {full ? (
        <p className="rounded-2xl bg-like/20 p-4 text-center text-lg">
          You&apos;re all set! Keep your picks secret 🤫 and watch the TV.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchAvailable ? "Search a song or paste a YouTube link" : "Paste a YouTube link"}
            autoComplete="off"
            enterKeyHint={searchAvailable ? "search" : "done"}
            className="rounded-2xl bg-white px-4 py-4 text-lg text-stage placeholder:text-stage/40"
          />
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="rounded-2xl bg-like px-6 py-3 text-lg font-bold text-stage disabled:opacity-40"
          >
            {busy ? "…" : parseVideoId(query) || !searchAvailable ? "Add song" : "Search"}
          </button>
          {error && <p className="text-center text-nope">{error}</p>}
        </form>
      )}

      {!full && results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((r) => (
            <li key={r.videoId}>
              <button onClick={() => add(r)} className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-2 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, static export */}
                <img src={thumbUrl(r.videoId)} alt="" className="h-12 w-20 rounded-lg object-cover" />
                <span className="flex-1 text-sm leading-tight">
                  {r.title}
                  <span className="block text-white/50">{r.channel}</span>
                </span>
                <span className="px-2 text-2xl">＋</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlayAndVote({ code, uid, finished }: { code: string; uid: string; finished: boolean }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [play, setPlay] = useState<Play | null>(null);
  const [votes, setVotes] = useState<Votes>({});

  useEffect(() => {
    const offs = [watchQueue(code, setQueue), watchPlay(code, setPlay), watchVotes(code, setVotes)];
    return () => offs.forEach((off) => off());
  }, [code]);

  if (finished) {
    const { players } = tally(queue, votes);
    const rank = players.findIndex((p) => p.uid === uid);
    const me = players[rank];
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <p className="text-white/60">The winner is</p>
        <h1 className="font-display text-4xl font-bold">🏆 {players[0]?.name}</h1>
        {me && (
          <p className="rounded-2xl bg-white/10 px-5 py-4 text-lg">
            {rank === 0 ? "That's you! Musical genius." : `You came #${rank + 1}`} · {me.score > 0 ? `+${me.score}` : me.score}
          </p>
        )}
        <p className="text-white/50">Watch the TV for the full results.</p>
      </div>
    );
  }

  const song = play ? queue[play.index] : undefined;
  if (!play || !song) return <p className="text-white/70">Get ready…</p>;

  const mine = song.by === uid;
  const my = votes[String(play.index)]?.[uid] as Vote | undefined;
  const cast = (v: Vote) => {
    vote(code, play.index, uid, v);
    buzz();
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <p className="text-sm uppercase tracking-widest text-white/60">
        Song {play.index + 1} of {queue.length}
      </p>
      <h1 className="font-display text-2xl font-bold leading-tight">{song.title}</h1>

      {play.phase === "reveal" ? (
        <p className="rounded-2xl bg-white/10 px-5 py-4 text-xl">
          Picked by <span className="font-bold">{mine ? "you" : song.byName}</span>
        </p>
      ) : mine ? (
        <p className="rounded-2xl bg-white/10 px-5 py-6 text-xl">
          This is your pick! 🤫
          <span className="block text-base text-white/60">Keep a straight face.</span>
        </p>
      ) : (
        <div className="grid w-full grid-cols-2 gap-4">
          <button
            onClick={() => cast(-1)}
            aria-pressed={my === -1}
            className={`rounded-3xl py-12 text-6xl transition ${my === -1 ? "scale-105 bg-nope" : "bg-white/10"}`}
          >
            👎
          </button>
          <button
            onClick={() => cast(1)}
            aria-pressed={my === 1}
            className={`rounded-3xl py-12 text-6xl transition ${my === 1 ? "scale-105 bg-like" : "bg-white/10"}`}
          >
            👍
          </button>
        </div>
      )}
      {play.phase === "playing" && !mine && (
        <p className="text-white/50">{my ? "You can change your vote until the reveal." : "Do you like it?"}</p>
      )}
    </div>
  );
}
