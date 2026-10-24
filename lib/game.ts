// Pure game rules: queue order and scoring. No Firebase, no DOM, so it is unit
// tested in test/game.test.ts.
//
// A game is a list of genres, one round each. Every player picks one song per
// genre; a round plays that genre's songs back to back. Each player has one
// vote per round: voting on a later song in the round moves it there (the last
// vote counts). Most votes over all rounds wins.

export type Nomination = { videoId: string; title: string; channel: string; at: number; genre?: string };
export type QueueItem = {
  videoId: string;
  title: string;
  channel: string;
  by: string;
  byName: string;
  genre?: string;
  round?: number;
};
// Phones write 1 for "my vote is on this song". -1 only exists in rooms from
// before rounds and is ignored.
export type Vote = 1 | -1;
// votes[songIndex][voterUid]. The rules only let a phone vote on the song that
// is playing, so a vote can't be taken back from an earlier song; instead the
// latest song a voter voted on in a round is where their vote sits.
export type Votes = Record<string, Record<string, Vote>>;

// Round by round in genre order. Within a round, player order is shuffled so the
// same person doesn't always open, and nobody gets two songs in a row across a
// round boundary. Picks without a genre, or for a genre not in the game, are
// ignored; so is anything past a player's first pick for a genre.
export function buildQueue(
  nominations: Record<string, Record<string, Nomination>>,
  names: Record<string, string>,
  genres: string[],
  random: () => number = Math.random,
): QueueItem[] {
  const queue: QueueItem[] = [];
  let last: string | null = null;
  genres.forEach((genre, round) => {
    const picks = Object.entries(nominations).flatMap(([uid, mine]) => {
      const p = Object.values(mine || {})
        .filter((n) => n.genre === genre)
        .sort((a, b) => (a.at || 0) - (b.at || 0))[0];
      return p ? [{ uid, p }] : [];
    });
    const players = shuffle(picks, random);
    if (players.length > 1 && players[0].uid === last) players.push(players.shift()!);
    for (const { uid, p } of players) {
      queue.push({
        videoId: p.videoId,
        title: p.title,
        channel: p.channel,
        by: uid,
        byName: names[uid] || "Someone",
        genre,
        round,
      });
      last = uid;
    }
  });
  return queue;
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const roundOf = (item: QueueItem) => item.round ?? 0;

// Queue indexes of one round's songs, in play order.
export const roundSongs = (queue: QueueItem[], round: number) =>
  queue.flatMap((item, index) => (roundOf(item) === round ? [index] : []));

// Where a voter's vote for a round currently sits: the latest song in that
// round they voted on, never their own. undefined if they haven't voted.
export function roundVote(queue: QueueItem[], votes: Votes, round: number, uid: string): number | undefined {
  const songs = roundSongs(queue, round);
  for (let i = songs.length - 1; i >= 0; i--) {
    const index = songs[i];
    if (queue[index].by !== uid && votes[String(index)]?.[uid] === 1) return index;
  }
  return undefined;
}

export type SongResult = { index: number; item: QueueItem; votes: number; voters: string[] };
export type PlayerResult = { uid: string; name: string; score: number; songs: number };
export type RoundResult = { round: number; genre: string; winners: SongResult[] };

// Each voter's vote per round lands on one song (see roundVote). A player's
// score is the votes their songs hold; a round's winners are its top songs
// (ties share, and a round nobody voted in has none).
export function tally(queue: QueueItem[], votes: Votes) {
  const voters: string[][] = queue.map(() => []);
  const rounds = [...new Set(queue.map(roundOf))].sort((a, b) => a - b);
  const everyone = new Set(Object.values(votes || {}).flatMap((v) => Object.keys(v || {})));
  for (const round of rounds) {
    for (const uid of everyone) {
      const index = roundVote(queue, votes || {}, round, uid);
      if (index !== undefined) voters[index].push(uid);
    }
  }
  const songs: SongResult[] = queue.map((item, index) => ({
    index,
    item,
    votes: voters[index].length,
    voters: voters[index],
  }));

  const byPlayer = new Map<string, PlayerResult>();
  for (const s of songs) {
    const p = byPlayer.get(s.item.by) || { uid: s.item.by, name: s.item.byName, score: 0, songs: 0 };
    p.score += s.votes;
    p.songs++;
    byPlayer.set(s.item.by, p);
  }
  const players = [...byPlayer.values()].sort((a, b) => b.score - a.score);
  const topSongs = songs.slice().sort((a, b) => b.votes - a.votes);

  const roundResults: RoundResult[] = rounds.map((round) => {
    const inRound = songs.filter((s) => roundOf(s.item) === round);
    const best = Math.max(0, ...inRound.map((s) => s.votes));
    return {
      round,
      genre: inRound[0]?.item.genre || "",
      winners: best > 0 ? inRound.filter((s) => s.votes === best) : [],
    };
  });
  return { songs, players, topSongs, rounds: roundResults };
}
