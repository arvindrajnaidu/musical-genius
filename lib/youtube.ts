// YouTube helpers for the phone side: turn a pasted link into a video id, look
// up its title, and (when an API key is configured) search. Playback itself only
// happens on the TV (components/YouTubePlayer.tsx).

export type Song = {
  videoId: string;
  title: string;
  channel: string;
};

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Accepts watch?v=, youtu.be/, /shorts/, /embed/, music.youtube.com links and
// bare 11-character ids.
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] || null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v");
    const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
    if (!id && m) id = m[2];
  }
  return id && ID_RE.test(id) ? id : null;
}

// Title lookup without an API key. YouTube's oEmbed answers 401/403 for videos
// that can't be embedded, which is exactly the check we want before a song is
// queued. If oEmbed is unreachable (CORS, network), fall back to noembed and
// finally accept the id untitled: the TV still skips anything that won't play.
export async function lookupVideo(videoId: string): Promise<Song> {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`);
    if (r.status === 401 || r.status === 403) throw new Error("not-embeddable");
    if (r.status === 404 || r.status === 400) throw new Error("video-not-found");
    if (r.ok) {
      const j = await r.json();
      return { videoId, title: j.title || "Untitled", channel: j.author_name || "" };
    }
  } catch (e) {
    if (e instanceof Error && (e.message === "not-embeddable" || e.message === "video-not-found")) throw e;
  }
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(watch)}`);
    const j = await r.json();
    if (j.title) return { videoId, title: j.title, channel: j.author_name || "" };
  } catch {
    /* fall through */
  }
  return { videoId, title: "YouTube video", channel: "" };
}

const API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
export const searchAvailable = Boolean(API_KEY);

// YouTube Data API search, limited to embeddable music videos. Each call costs
// 100 of the default 10,000 daily quota units, so the UI only searches on submit.
export async function searchSongs(query: string): Promise<Song[]> {
  if (!API_KEY) return [];
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    videoCategoryId: "10",
    maxResults: "8",
    q: query,
    key: API_KEY,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!r.ok) throw new Error(r.status === 403 ? "search-quota" : "search-failed");
  const j = await r.json();
  return (j.items || []).map(
    (it: { id: { videoId: string }; snippet: { title: string; channelTitle: string } }) => ({
      videoId: it.id.videoId,
      title: decodeEntities(it.snippet.title),
      channel: decodeEntities(it.snippet.channelTitle),
    }),
  );
}

// The Data API returns HTML-escaped titles ("Guns N&#39; Roses").
function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export const thumbUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
