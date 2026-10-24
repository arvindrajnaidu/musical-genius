// GET /api/song?artist=…&title=… → { videoId, title, channel }
//
// Turns a catalog song into an embeddable YouTube video for the TV. Web build
// only (`.web.ts`); the native app calls the deployed site. The Data API key
// stays here (YOUTUBE_API_KEY), and each answer is CDN-cached for a month, so a
// popular song costs one 100-unit search however many parties pick it.
import type { NextRequest } from "next/server";
import { decodeEntities, pickVideo, type Candidate } from "@/lib/match";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const CACHED = { ...CORS, "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400" };

const memo = new Map<string, Candidate>();

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: CORS });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const artist = (sp.get("artist") || "").trim().slice(0, 120);
  const title = (sp.get("title") || "").trim().slice(0, 160);
  if (!title) return fail(400, "missing-title");

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return fail(503, "search-off");

  const memoKey = `${artist}|${title}`.toLowerCase();
  const hit = memo.get(memoKey);
  if (hit) return Response.json(hit, { headers: CACHED });

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    maxResults: "6",
    q: `${artist} ${title}`.trim(),
    key,
  });
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (r.status === 403) return fail(503, "search-quota");
  if (!r.ok) return fail(502, "search-failed");
  const j = await r.json();
  const candidates: Candidate[] = (j.items || []).map(
    (it: { id: { videoId: string }; snippet: { title: string; channelTitle: string } }) => ({
      videoId: it.id.videoId,
      title: decodeEntities(it.snippet.title),
      channel: decodeEntities(it.snippet.channelTitle),
    }),
  );
  const best = pickVideo(candidates, artist, title);
  if (!best) return fail(404, "video-not-found");
  if (memo.size > 5000) memo.clear();
  memo.set(memoKey, best);
  return Response.json(best, { headers: CACHED });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
