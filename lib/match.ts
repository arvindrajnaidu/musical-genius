// Picking the YouTube video for a catalog song ("artist – title"). Pure, so the
// API route and the tests share it.

export type Candidate = { videoId: string; title: string; channel: string };

// Uploads that are rarely what a guest meant, unless the song title says so.
const UNWANTED = /\b(cover|karaoke|reaction|instrumental|8d|slowed|reverb|nightcore|sped up|tutorial|lesson|live)\b/i;

export function pickVideo(candidates: Candidate[], artist: string, title: string): Candidate | null {
  const wanted = `${artist} ${title}`.toLowerCase();
  const artistKey = artist.toLowerCase().split(/[,&]| feat\.? | x /)[0].trim();
  let best: Candidate | null = null;
  let bestScore = -Infinity;
  candidates.forEach((c, i) => {
    const t = c.title.toLowerCase();
    const ch = c.channel.toLowerCase();
    let score = -i; // YouTube's own ranking breaks ties
    const bad = t.match(UNWANTED);
    if (bad && !wanted.includes(bad[0].toLowerCase())) score -= 20;
    if (/official (music )?(video|audio)|official lyric/.test(t)) score += 5;
    if (ch.endsWith(" - topic") || ch.endsWith("vevo")) score += 4;
    if (artistKey && (ch.includes(artistKey) || t.includes(artistKey))) score += 3;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  });
  return best;
}

// The Data API returns HTML-escaped titles ("Guns N&#39; Roses").
export function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
