// Pure game rules: queue order and scoring. No Firebase, no DOM, so it is unit
// tested in test/game.test.ts.

export type Nomination = { videoId: string; title: string; channel: string; at: number };
export type QueueItem = { videoId: string; title: string; channel: string; by: string; byName: string };
export type Vote = 1 | -1;
// votes[songIndex][voterUid]
export type Votes = Record<string, Record<string, Vote>>;

// Round-robin across players so nobody gets two songs in a row: every player's
// first pick, then every player's second pick, and so on. Player order is
// shuffled each round so the same person doesn't always open.
export function buildQueue(
  nominations: Record<string, Record<string, Nomination>>,
  names: Record<string, string>,
  random: () => number = Math.random,
  maxPerPlayer = Infinity,
): QueueItem[] {
  const lists = Object.entries(nominations).map(([uid, picks]) => ({
    uid,
    picks: Object.values(picks || {})
      .sort((a, b) => (a.at || 0) - (b.at || 0))
      .slice(0, maxPerPlayer),
  }));
  const longest = Math.max(0, ...lists.map((l) => l.picks.length));
  const queue: QueueItem[] = [];
  let last: string | null = null;
  for (let round = 0; round < longest; round++) {
    const players = shuffle(lists.filter((l) => l.picks[round]), random);
    // Avoid back-to-back songs from one player across a round boundary.
    if (players.length > 1 && players[0].uid === last) players.push(players.shift()!);
    for (const { uid, picks } of players) {
      const p = picks[round];
      queue.push({ videoId: p.videoId, title: p.title, channel: p.channel, by: uid, byName: names[uid] || "Someone" });
      last = uid;
    }
  }
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

export type SongResult = { index: number; item: QueueItem; likes: number; dislikes: number; score: number };
export type PlayerResult = { uid: string; name: string; score: number; likes: number; dislikes: number; songs: number };

// Votes on your own song don't count. A song scores likes minus dislikes; a
// player's score is the sum over their songs. Ties share a rank (by score,
// then likes).
export function tally(queue: QueueItem[], votes: Votes) {
  const songs: SongResult[] = queue.map((item, index) => {
    let likes = 0;
    let dislikes = 0;
    for (const [voter, v] of Object.entries(votes[String(index)] || {})) {
      if (voter === item.by) continue;
      if (v === 1) likes++;
      else if (v === -1) dislikes++;
    }
    return { index, item, likes, dislikes, score: likes - dislikes };
  });
  const byPlayer = new Map<string, PlayerResult>();
  for (const s of songs) {
    const p = byPlayer.get(s.item.by) || {
      uid: s.item.by,
      name: s.item.byName,
      score: 0,
      likes: 0,
      dislikes: 0,
      songs: 0,
    };
    p.score += s.score;
    p.likes += s.likes;
    p.dislikes += s.dislikes;
    p.songs++;
    byPlayer.set(s.item.by, p);
  }
  const players = [...byPlayer.values()].sort((a, b) => b.score - a.score || b.likes - a.likes);
  const topSongs = songs.slice().sort((a, b) => b.score - a.score || b.likes - a.likes);
  return { songs, players, topSongs };
}
