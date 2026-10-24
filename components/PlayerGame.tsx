"use client";

import { useEffect, useState } from "react";
import { roundSongs, roundVote, tally, type Nomination, type QueueItem, type Votes } from "@/lib/game";
import {
  genresOf,
  nominateForGenre,
  vote,
  watchMyNominations,
  watchPlay,
  watchQueue,
  watchVotes,
  type Play,
  type RoomMeta,
  type RoomSettings,
} from "@/lib/room";
import { resolveTrack, searchTracks, SHELVES, shelvesFor, TOP_SHELF, topTracks, type Track } from "@/lib/songs";
import { lookupVideo, parseVideoId, thumbUrl, type Song } from "@/lib/youtube";

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
  const genres = genresOf(settings);
  const [mine, setMine] = useState<Record<string, Nomination>>({});
  // undefined: follow the first genre still missing a pick; null: done picking.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[] | null>(null);
  const [shelfChoice, setShelfChoice] = useState<string | null>(null);
  const [top, setTop] = useState<Track[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => watchMyNominations(code, uid, setMine), [code, uid]);

  // Each genre's pick (the earliest, if an old build left more than one).
  const all = Object.entries(mine).sort(([, a], [, b]) => (a.at || 0) - (b.at || 0));
  const pickFor = (g: string) => all.find(([, n]) => n.genre === g);
  const missing = genres.filter((g) => !pickFor(g));
  const active =
    chosen === undefined || (chosen !== null && !genres.includes(chosen)) ? (missing[0] ?? null) : chosen;

  const shelves = active ? shelvesFor(active) : [];
  const shelf = shelfChoice && shelves.includes(shelfChoice) ? shelfChoice : shelves[0];

  // Typeahead: search the catalog a moment after typing stops.
  const term = query.trim();
  const isLink = Boolean(parseVideoId(term));
  useEffect(() => {
    if (term.length < 2 || isLink) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchTracks(term, ctrl.signal)
        .then(setResults)
        .catch((e) => !ctrl.signal.aborted && (console.error(e), setResults([])));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term, isLink]);

  useEffect(() => {
    if (shelf !== TOP_SHELF || top) return;
    topTracks()
      .then(setTop)
      .catch(() => setTop([]));
  }, [shelf, top]);

  function open(g: string | null) {
    setChosen(g);
    setShelfChoice(null);
    setQuery("");
    setResults(null);
    setError(null);
  }

  function fail(err: unknown) {
    console.error(err);
    const m = err instanceof Error ? err.message : "";
    setError(
      m === "not-embeddable"
        ? "That video can't be played outside YouTube. Try another upload of the song."
        : m === "video-not-found"
          ? "Couldn't find a playable video for that one. Try another song."
          : m === "search-quota"
            ? "Song lookup is out of juice for today. Paste a YouTube link instead."
            : m === "search-off"
              ? "Song lookup isn't switched on yet. Paste a YouTube link instead."
              : /permission/i.test(m)
                ? "The game server refused that song. (Host: make sure the latest database rules are deployed.)"
                : "Something went wrong. Try again.",
    );
  }

  async function add(song: Song) {
    if (!active) return;
    const other = all.find(([, n]) => n.videoId === song.videoId && n.genre !== active);
    if (other) return setError(`You already picked that for ${other[1].genre}. Choose another song.`);
    const replace = all.filter(([, n]) => n.genre === active).map(([id]) => id);
    await nominateForGenre(code, uid, song, active, replace);
    buzz();
    // On to the next genre still missing a pick, or done.
    const rest = missing.filter((g) => g !== active);
    open(rest.find((g) => genres.indexOf(g) > genres.indexOf(active)) ?? rest[0] ?? null);
  }

  async function pick(t: Track) {
    const key = trackKey(t);
    if (pending) return;
    setPending(key);
    setError(null);
    try {
      await add(await resolveTrack(t));
    } catch (err) {
      fail(err);
    } finally {
      setPending(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = parseVideoId(term);
    if (!id) return (document.activeElement as HTMLElement | null)?.blur();
    setPending(id);
    setError(null);
    try {
      await add(await lookupVideo(id));
    } catch (err) {
      fail(err);
    } finally {
      setPending(null);
    }
  }

  const current = active ? pickFor(active)?.[1] : undefined;
  const isCurrent = (t: Track) =>
    Boolean(current && `${current.channel}|${current.title}`.toLowerCase() === `${t.artist}|${t.title}`.toLowerCase());
  const list = term.length >= 2 && !isLink ? results : shelf === TOP_SHELF ? top : SHELVES[shelf];

  if (genres.length === 0) {
    return (
      <div className="flex w-full max-w-md flex-col gap-3 text-center">
        <h1 className="font-display text-3xl font-bold">You&apos;re in!</h1>
        <p className="text-white/70">Waiting for the host to choose the genres…</p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold">Pick your songs</h1>
        <p className="text-white/70">
          One song for each genre · {genres.length - missing.length}/{genres.length} picked
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {genres.map((g, i) => {
          const p = pickFor(g)?.[1];
          const on = g === active;
          return (
            <li key={g}>
              <button
                onClick={() => open(on ? null : g)}
                aria-expanded={on}
                className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left ${on ? "bg-white text-stage" : "bg-white/10"}`}
              >
                {p ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, static export
                  <img src={thumbUrl(p.videoId)} alt="" className="h-12 w-20 rounded-lg object-cover" />
                ) : (
                  <span className={`flex h-12 w-20 items-center justify-center rounded-lg text-xl ${on ? "bg-stage/10" : "bg-white/10"}`}>
                    🎵
                  </span>
                )}
                <span className="flex-1 text-sm leading-tight">
                  <span className="block font-semibold">
                    Round {i + 1} · {g} {p ? "✓" : ""}
                  </span>
                  <span className={on ? "text-stage/60" : "text-white/60"}>
                    {p ? p.title : on ? "Choose a song below" : "Tap to pick"}
                  </span>
                </span>
                {p && <span className={`px-2 text-sm ${on ? "text-stage/60" : "text-white/50"}`}>{on ? "Close" : "Change"}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {!active ? (
        <p className="rounded-2xl bg-like/20 p-4 text-center text-lg">
          You&apos;re all set! Keep your picks secret 🤫 and watch the TV.
        </p>
      ) : (
        <>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
                if (e.target.value.trim().length < 2) setResults(null);
              }}
              placeholder={`Search a ${active} song, or paste a YouTube link`}
              autoComplete="off"
              enterKeyHint={isLink ? "done" : "search"}
              className="rounded-2xl bg-white px-4 py-4 text-lg text-stage placeholder:text-stage/40"
            />
            {isLink && (
              <button
                type="submit"
                disabled={Boolean(pending)}
                className="rounded-2xl bg-like px-6 py-3 text-lg font-bold text-stage disabled:opacity-40"
              >
                {pending ? "…" : `Pick for ${active}`}
              </button>
            )}
            {error && <p className="text-center text-nope">{error}</p>}
          </form>

          {!term && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {shelves.map((s) => (
                <button
                  key={s}
                  onClick={() => setShelfChoice(s)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                    s === shelf ? "bg-white text-stage" : "border-2 border-white/30"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {!isLink && (
            <ul className="flex flex-col gap-2">
              {list === null ? (
                <li className="py-4 text-center text-white/50">Looking…</li>
              ) : list.length === 0 ? (
                <li className="py-4 text-center text-white/50">
                  {term ? "No songs found. Try another spelling." : "Nothing here right now."}
                </li>
              ) : (
                list.map((t) => {
                  const key = trackKey(t);
                  const done = isCurrent(t);
                  return (
                    <li key={key}>
                      <button
                        onClick={() => pick(t)}
                        disabled={done || Boolean(pending)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white/10 p-2 text-left disabled:opacity-50"
                      >
                        {t.art ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote album art, static export
                          <img src={t.art} alt="" className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-xl">🎵</span>
                        )}
                        <span className="flex-1 text-sm leading-tight">
                          {t.title}
                          <span className="block text-white/50">
                            {t.artist}
                            {t.year && ` · ${t.year}`}
                          </span>
                        </span>
                        <span className="px-2 text-2xl">{pending === key ? "…" : done ? "✓" : "＋"}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

const trackKey = (t: Track) => `${t.artist}|${t.title}`;

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
            {rank === 0 ? "That's you! Musical genius." : `You came #${rank + 1}`} · ❤️ {me.score} {me.score === 1 ? "vote" : "votes"}
          </p>
        )}
        <p className="text-white/50">Watch the TV for the full results.</p>
      </div>
    );
  }

  const song = play ? queue[play.index] : undefined;
  if (!play || !song) return <p className="text-white/70">Get ready…</p>;

  const round = song.round ?? 0;
  const inRound = roundSongs(queue, round);
  const rounds = new Set(queue.map((q) => q.round ?? 0)).size;
  const mine = song.by === uid;
  const at = roundVote(queue, votes, round, uid);
  const here = at === play.index;
  const cast = () => {
    vote(code, play.index, uid);
    buzz();
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <p className="text-sm uppercase tracking-widest text-white/60">
        {song.genre ? `${song.genre} · ` : ""}Round {round + 1} of {rounds} · Song {inRound.indexOf(play.index) + 1} of{" "}
        {inRound.length}
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
        <button
          onClick={cast}
          disabled={here}
          aria-pressed={here}
          className={`w-full rounded-3xl px-6 py-10 text-3xl font-bold transition ${here ? "scale-105 bg-like text-stage" : "bg-white/10"}`}
        >
          ❤️ {here ? "Your vote is here" : at !== undefined ? "Move my vote here" : "Vote for this song"}
        </button>
      )}
      {play.phase === "playing" && !mine && (
        <p className="text-white/60">
          {here
            ? "A later song in this round can still take it."
            : at !== undefined
              ? `Your vote is on “${queue[at].title}”. Tap to move it here.`
              : `One vote per round. Your last vote in ${song.genre || "this round"} counts.`}
        </p>
      )}
      {play.phase === "playing" && mine && at !== undefined && (
        <p className="text-white/60">Your vote this round is on “{queue[at].title}”.</p>
      )}
    </div>
  );
}
