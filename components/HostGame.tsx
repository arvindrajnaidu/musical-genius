"use client";

import { useEffect, useMemo, useState } from "react";
import { buildQueue, roundSongs, tally, type Nomination, type QueueItem, type Votes } from "@/lib/game";
import {
  resetGame,
  setPlay,
  setStatus,
  startMusic,
  watchAllNominations,
  watchPlay,
  watchQueue,
  watchVotes,
  genresOf,
  type Member,
  type Play,
  type RoomMeta,
  type RoomSettings,
} from "@/lib/room";
import { enterFullscreen, toggleFullscreen } from "@/lib/fullscreen";
import { YouTubePlayer } from "./YouTubePlayer";

type Props = {
  code: string;
  meta: RoomMeta;
  settings: RoomSettings;
  members: Record<string, Member>;
  onNewRoom: () => void;
};

// Everything on the TV after "Start game": picking progress, the player with
// live votes and per-song reveals (plus a round winner after each genre), and
// the final leaderboard.
export function HostGame({ code, meta, settings, members, onNewRoom }: Props) {
  const [nominations, setNominations] = useState<Record<string, Record<string, Nomination>>>({});
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [play, setPlayState] = useState<Play | null>(null);
  const [votes, setVotes] = useState<Votes>({});

  useEffect(() => {
    const offs = [
      watchAllNominations(code, setNominations),
      watchQueue(code, setQueue),
      watchPlay(code, setPlayState),
      watchVotes(code, setVotes),
    ];
    return () => offs.forEach((off) => off());
  }, [code]);

  if (meta.status === "nominating") {
    return <Nominating code={code} settings={settings} members={members} nominations={nominations} />;
  }
  if (meta.status === "playing" && play && queue[play.index]) {
    return <Playing code={code} queue={queue} play={play} votes={votes} members={members} />;
  }
  if (meta.status === "finished") {
    return <Results code={code} queue={queue} votes={votes} onNewRoom={onNewRoom} />;
  }
  return <p className="text-3xl text-white/70">Loading…</p>;
}

function Nominating({
  code,
  settings,
  members,
  nominations,
}: {
  code: string;
  settings: RoomSettings;
  members: Record<string, Member>;
  nominations: Record<string, Record<string, Nomination>>;
}) {
  const [starting, setStarting] = useState(false);
  // Offline usually means a locked phone, not a player who left, so everyone
  // who joined is listed and counted.
  const genres = genresOf(settings);
  const players = Object.entries(members);
  const count = (uid: string) => {
    const mine = Object.values(nominations[uid] || {});
    return genres.filter((g) => mine.some((n) => n.genre === g)).length;
  };
  const pickers = players.filter(([uid]) => count(uid) > 0).length;
  const total = players.reduce((n, [uid]) => n + count(uid), 0);
  const allDone = players.length > 0 && players.every(([uid]) => count(uid) >= genres.length);

  async function start() {
    enterFullscreen();
    setStarting(true);
    const names = Object.fromEntries(Object.entries(members).map(([uid, m]) => [uid, m.name]));
    await startMusic(code, buildQueue(nominations, names, genres));
  }

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-10 text-center">
      <p className="text-2xl uppercase tracking-widest text-white/60">Room {code}</p>
      <h1 className="font-display text-7xl font-bold">Pick your songs!</h1>
      <p className="text-3xl text-white/70">
        One song for each genre, on your phone: {genres.join(" → ")}
      </p>
      <ul className="flex flex-wrap justify-center gap-4">
        {players.map(([uid, m]) => {
          const n = count(uid);
          const done = n >= genres.length;
          return (
            <li
              key={uid}
              className={`rounded-2xl px-6 py-4 text-2xl font-semibold ${done ? "bg-like text-stage" : "bg-white/10"}`}
            >
              {m.name} <span className="opacity-70">{done ? "✓" : `${n}/${genres.length}`}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-6">
        <button
          disabled={starting || pickers < 2}
          onClick={start}
          className={`rounded-2xl px-10 py-5 text-3xl font-bold text-stage disabled:opacity-40 ${allDone ? "animate-pulse bg-like" : "bg-white"}`}
        >
          {allDone ? "Everyone's ready! Start the music" : `Start the music (${total} songs)`}
        </button>
        <button onClick={() => setStatus(code, "lobby")} className="text-xl text-white/50 underline">
          Back to lobby
        </button>
      </div>
      {pickers < 2 && <p className="text-xl text-white/50">Waiting for at least two people to pick a song</p>}
    </div>
  );
}

function Playing({
  code,
  queue,
  play,
  votes,
  members,
}: {
  code: string;
  queue: QueueItem[];
  play: Play;
  votes: Votes;
  members: Record<string, Member>;
}) {
  const { index, phase } = play;
  const song = queue[index];
  const [failed, setFailed] = useState<number | null>(null);
  const round = song.round ?? 0;
  const inRound = roundSongs(queue, round);
  const rounds = new Set(queue.map((q) => q.round ?? 0)).size;
  const roundOver = inRound[inRound.length - 1] === index;
  // Live: a vote that moves on to a later song leaves this one.
  const scores = tally(queue, votes);
  const here = scores.songs[index];
  const winners = scores.rounds.find((r) => r.round === round)?.winners ?? [];
  const last = index + 1 >= queue.length;

  const next = useMemo(
    () => () => (last ? setStatus(code, "finished") : setPlay(code, { index: index + 1, phase: "playing" })),
    [code, index, last],
  );
  const reveal = useMemo(() => () => setPlay(code, { index, phase: "reveal" }), [code, index]);

  // Songs always play in full and nothing moves on by itself: the host decides
  // when to reveal and when the next song starts, however many have voted.

  // A video the uploader won't let us embed: say so briefly and move on.
  useEffect(() => {
    if (failed !== index) return;
    const t = setTimeout(next, 3000);
    return () => clearTimeout(t);
  }, [failed, index, next]);

  const voted = new Set(here.voters);
  const voterNames = Object.entries(members).filter(([uid]) => uid !== song.by);

  // Full-bleed video with the game drawn over it, Kahoot-on-a-music-video style.
  return (
    <div className="fixed inset-0 z-10 cursor-none overflow-hidden bg-black">
      <YouTubePlayer
        className="absolute inset-0"
        videoId={song.videoId}
        onEnded={() => phase === "playing" && reveal()}
        onError={() => setFailed(index)}
      />
      {/* Clicks go to our buttons, never to YouTube's own UI. */}
      <div className="absolute inset-0" />

      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between bg-gradient-to-b from-black/70 to-transparent p-8 pb-24">
        <p className="rounded-full bg-black/50 px-6 py-3 text-2xl font-semibold backdrop-blur">
          {song.genre ? `${song.genre} · ` : ""}Round {round + 1} of {rounds} · Song {inRound.indexOf(index) + 1} of{" "}
          {inRound.length} in this round
          <span className="text-white/60"> · Room {code}</span>
        </p>
        <div className="flex cursor-auto gap-3">
          <button onClick={toggleFullscreen} aria-label="Full screen" className="rounded-full bg-black/50 px-5 py-3 text-2xl backdrop-blur">
            ⛶
          </button>
          {phase === "playing" && (
            <button onClick={reveal} className="rounded-full bg-black/50 px-6 py-3 text-2xl font-semibold backdrop-blur">
              Reveal
            </button>
          )}
          <button onClick={next} className="rounded-full bg-white/90 px-6 py-3 text-2xl font-semibold text-stage">
            {last ? "Show results" : roundOver ? "Next round" : "Next song"}
          </button>
        </div>
      </div>

      {failed === index && (
        <div className="absolute inset-0 flex items-center justify-center bg-stage/90 text-5xl">
          This one can&apos;t play here. Skipping…
        </div>
      )}

      {phase === "reveal" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 rounded-[2.5rem] bg-stage/85 px-20 py-14 text-center shadow-2xl">
            <p className="text-3xl text-white/70">Picked by</p>
            <p className="font-display text-8xl font-bold">{song.byName}</p>
            <p className="text-6xl font-bold">
              ❤️ {here.votes} <span className="text-3xl font-semibold text-white/60">{roundOver ? "votes" : "so far"}</span>
            </p>
            {roundOver && (
              <div className="mt-4 flex flex-col items-center gap-2 border-t border-white/20 pt-6">
                <p className="text-2xl uppercase tracking-widest text-white/60">
                  {song.genre || `Round ${round + 1}`} round winner
                </p>
                {winners.length === 0 ? (
                  <p className="text-4xl font-semibold">No votes this round</p>
                ) : (
                  winners.map((w) => (
                    <p key={w.index} className="text-4xl font-semibold">
                      🏆 {w.item.title} <span className="text-white/60">by {w.item.byName}</span>
                      <span className="ml-3 text-like">❤️ {w.votes}</span>
                    </p>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-10 pb-10 pt-32">
        <div className="flex items-end justify-between gap-10">
          <div className="min-w-0">
            <h2 className="truncate font-display text-6xl font-bold leading-tight drop-shadow-lg">{song.title}</h2>
            {song.channel && <p className="truncate text-3xl text-white/70">{song.channel}</p>}
          </div>
          {phase === "playing" && (
            <div className="flex shrink-0 flex-col items-end gap-3">
              <p className="text-5xl font-bold drop-shadow-lg">❤️ {here.votes}</p>
              <ul className="flex max-w-[40vw] flex-wrap justify-end gap-2">
                {voterNames.map(([uid, m]) => (
                  <li
                    key={uid}
                    className={`rounded-full px-4 py-1 text-xl font-semibold transition-all ${
                      voted.has(uid) ? "scale-105 bg-white text-stage" : "bg-white/15 text-white/50"
                    }`}
                  >
                    {voted.has(uid) && "✓ "}
                    {m.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {phase === "playing" && (
          <p className="mt-3 text-xl text-white/50">
            One vote per round on your phone · your last vote counts · who picked it? Find out after the song
          </p>
        )}
      </div>
    </div>
  );
}

function Results({
  code,
  queue,
  votes,
  onNewRoom,
}: {
  code: string;
  queue: QueueItem[];
  votes: Votes;
  onNewRoom: () => void;
}) {
  const { players, rounds } = tally(queue, votes);
  const winner = players[0];
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-10 text-center">
      <p className="text-2xl uppercase tracking-widest text-white/60">And the Musical Genius is…</p>
      {winner && <h1 className="font-display text-8xl font-bold">🏆 {winner.name}</h1>}
      <ol className="flex w-full flex-col gap-3">
        {players.map((p, i) => (
          <li
            key={p.uid}
            className={`flex items-center justify-between rounded-2xl px-8 py-4 text-3xl ${i === 0 ? "bg-like text-stage" : "bg-white/10"}`}
          >
            <span className="font-semibold">
              {i + 1}. {p.name}
            </span>
            <span>❤️ {p.score}</span>
          </li>
        ))}
      </ol>
      <ul className="flex w-full flex-col gap-2 text-2xl">
        {rounds.map((r) => (
          <li key={r.round} className="flex items-baseline justify-between gap-6 rounded-2xl bg-white/5 px-8 py-3">
            <span className="shrink-0 text-white/60">{r.genre || `Round ${r.round + 1}`}</span>
            <span className="truncate text-right">
              {r.winners.length === 0
                ? "No votes"
                : r.winners.map((w) => `${w.item.title} (${w.item.byName}, ❤️ ${w.votes})`).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-6">
        <button onClick={() => resetGame(code)} className="rounded-2xl bg-white px-10 py-5 text-3xl font-bold text-stage">
          Play again
        </button>
        <button onClick={onNewRoom} className="text-xl text-white/50 underline">
          New room
        </button>
      </div>
    </div>
  );
}
