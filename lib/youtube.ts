// YouTube helpers for the phone side: turn a pasted link into a video id and
// look up its title. Finding songs by name lives in lib/songs.ts. Playback itself
// only happens on the TV (components/YouTubePlayer.tsx).

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

export const thumbUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
