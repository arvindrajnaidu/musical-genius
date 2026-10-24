// Finding songs without leaving the app: typeahead against Apple's free iTunes
// Search API (no key, clean titles, album art), plus themed shelves. Only when a
// guest taps a song do we spend a YouTube lookup, through /api/song, to find the
// video the TV will play.
import { siteOrigin } from "./site";
import type { Song } from "./youtube";

export type Track = { artist: string; title: string; art?: string; year?: string };

type ItunesItem = {
  kind?: string;
  trackName?: string;
  trackCensoredName?: string;
  artistName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
};

export function fromItunes(results: ItunesItem[]): Track[] {
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const r of results) {
    if ((r.kind && r.kind !== "song") || !r.trackName || !r.artistName) continue;
    const key = `${r.artistName}|${r.trackName}`.toLowerCase();
    if (seen.has(key)) continue; // the same song on several albums
    seen.add(key);
    tracks.push({
      artist: r.artistName,
      title: r.trackName,
      art: r.artworkUrl100,
      year: r.releaseDate?.slice(0, 4),
    });
  }
  return tracks;
}

export async function searchTracks(term: string, signal?: AbortSignal): Promise<Track[]> {
  const params = new URLSearchParams({ term, media: "music", entity: "song", limit: "20" });
  const url = `https://itunes.apple.com/search?${params}`;
  let json: { results?: ItunesItem[] };
  try {
    json = await (await fetch(url, { signal })).json();
  } catch (e) {
    if (signal?.aborted) throw e;
    json = await jsonp(url); // older webviews without CORS for itunes.apple.com
  }
  return fromItunes(json.results || []).slice(0, 10);
}

let jsonpSeq = 0;
function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__mgItunes${++jsonpSeq}`;
    const script = document.createElement("script");
    const w = window as unknown as Record<string, unknown>;
    const done = () => {
      delete w[name];
      script.remove();
    };
    w[name] = (data: T) => {
      done();
      resolve(data);
    };
    script.onerror = () => {
      done();
      reject(new Error("search-failed"));
    };
    script.src = `${url}&callback=${name}`;
    document.head.appendChild(script);
  });
}

// Apple's current most-played chart, for the "Top right now" shelf.
export async function topTracks(): Promise<Track[]> {
  const r = await fetch("https://rss.applemarketingtools.com/api/v2/us/music/most-played/25/songs.json");
  const j = await r.json();
  return (j.feed?.results || []).map(
    (x: { artistName: string; name: string; artworkUrl100?: string; releaseDate?: string }) => ({
      artist: x.artistName,
      title: x.name,
      art: x.artworkUrl100,
      year: x.releaseDate?.slice(0, 4),
    }),
  );
}

// Tap → the YouTube video to play. The server keeps the key and the CDN caches
// each answer, so a song someone already picked costs nothing.
export async function resolveTrack(t: Track): Promise<Song> {
  const params = new URLSearchParams({ artist: t.artist, title: t.title });
  const r = await fetch(`${siteOrigin()}/api/song?${params}`);
  if (r.status === 503) throw new Error((await r.json().catch(() => ({}))).error || "search-off");
  if (r.status === 404) throw new Error("video-not-found");
  if (!r.ok) throw new Error("search-failed");
  const v: { videoId: string } = await r.json();
  return { videoId: v.videoId, title: t.title, channel: t.artist };
}

// Hand-picked crowd-pleasers. Shelf names match the host's theme chips
// (components/HostLobby.tsx) so the room's theme can open on its own shelf.
const T = (artist: string, title: string): Track => ({ artist, title });

export const TOP_SHELF = "Top right now";

export const SHELVES: Record<string, Track[]> = {
  "Party starters": [
    T("Earth, Wind & Fire", "September"),
    T("ABBA", "Dancing Queen"),
    T("Bee Gees", "Stayin' Alive"),
    T("Kool & The Gang", "Celebration"),
    T("Village People", "Y.M.C.A."),
    T("Gloria Gaynor", "I Will Survive"),
    T("House of Pain", "Jump Around"),
    T("LMFAO", "Party Rock Anthem"),
    T("Pitbull", "Timber"),
    T("Daft Punk", "Get Lucky"),
    T("Avicii", "Wake Me Up"),
    T("DJ Snake & Lil Jon", "Turn Down for What"),
  ],
  "80s": [
    T("Michael Jackson", "Billie Jean"),
    T("a-ha", "Take On Me"),
    T("Toto", "Africa"),
    T("Journey", "Don't Stop Believin'"),
    T("Whitney Houston", "I Wanna Dance with Somebody"),
    T("Bon Jovi", "Livin' on a Prayer"),
    T("Cyndi Lauper", "Girls Just Want to Have Fun"),
    T("Madonna", "Like a Prayer"),
    T("Wham!", "Wake Me Up Before You Go-Go"),
    T("Queen", "Another One Bites the Dust"),
    T("Tears for Fears", "Everybody Wants to Rule the World"),
    T("Rick Astley", "Never Gonna Give You Up"),
  ],
  "90s": [
    T("Spice Girls", "Wannabe"),
    T("Backstreet Boys", "I Want It That Way"),
    T("Britney Spears", "...Baby One More Time"),
    T("Nirvana", "Smells Like Teen Spirit"),
    T("Oasis", "Wonderwall"),
    T("TLC", "No Scrubs"),
    T("Coolio", "Gangsta's Paradise"),
    T("Los del Rio", "Macarena"),
    T("Ricky Martin", "Livin' la Vida Loca"),
    T("Haddaway", "What Is Love"),
    T("Alanis Morissette", "Ironic"),
    T("Whitney Houston", "I Will Always Love You"),
  ],
  "2000s": [
    T("OutKast", "Hey Ya!"),
    T("Beyoncé", "Crazy in Love"),
    T("The Killers", "Mr. Brightside"),
    T("Britney Spears", "Toxic"),
    T("Rihanna", "Umbrella"),
    T("Shakira", "Hips Don't Lie"),
    T("Usher", "Yeah!"),
    T("Kelly Clarkson", "Since U Been Gone"),
    T("The Black Eyed Peas", "I Gotta Feeling"),
    T("Lady Gaga", "Poker Face"),
    T("Gnarls Barkley", "Crazy"),
    T("Avril Lavigne", "Complicated"),
  ],
  Rock: [
    T("Queen", "Bohemian Rhapsody"),
    T("Guns N' Roses", "Sweet Child O' Mine"),
    T("AC/DC", "Back in Black"),
    T("Eagles", "Hotel California"),
    T("The White Stripes", "Seven Nation Army"),
    T("Linkin Park", "In the End"),
    T("Foo Fighters", "Everlong"),
    T("Bon Jovi", "It's My Life"),
    T("The Rolling Stones", "(I Can't Get No) Satisfaction"),
    T("Deep Purple", "Smoke on the Water"),
    T("Arctic Monkeys", "Do I Wanna Know?"),
    T("Led Zeppelin", "Stairway to Heaven"),
  ],
  "Hip-hop": [
    T("Eminem", "Lose Yourself"),
    T("Dr. Dre", "Still D.R.E."),
    T("2Pac", "California Love"),
    T("The Notorious B.I.G.", "Juicy"),
    T("OutKast", "Ms. Jackson"),
    T("50 Cent", "In da Club"),
    T("Jay-Z", "Empire State of Mind"),
    T("Kanye West", "Stronger"),
    T("Missy Elliott", "Get Ur Freak On"),
    T("Kendrick Lamar", "HUMBLE."),
    T("Drake", "God's Plan"),
    T("Run-DMC", "It's Tricky"),
  ],
  Pop: [
    T("The Weeknd", "Blinding Lights"),
    T("Dua Lipa", "Levitating"),
    T("Mark Ronson", "Uptown Funk"),
    T("Taylor Swift", "Shake It Off"),
    T("Ed Sheeran", "Shape of You"),
    T("Harry Styles", "As It Was"),
    T("Pharrell Williams", "Happy"),
    T("Adele", "Rolling in the Deep"),
    T("Katy Perry", "Firework"),
    T("Billie Eilish", "bad guy"),
    T("Olivia Rodrigo", "good 4 u"),
    T("Justin Timberlake", "Can't Stop the Feeling!"),
  ],
  EDM: [
    T("Avicii", "Levels"),
    T("Swedish House Mafia", "Don't You Worry Child"),
    T("Calvin Harris", "Summer"),
    T("David Guetta", "Titanium"),
    T("Zedd", "Clarity"),
    T("The Chainsmokers", "Don't Let Me Down"),
    T("Martin Garrix", "Animals"),
    T("Skrillex", "Bangarang"),
    T("Major Lazer", "Lean On"),
    T("Daft Punk", "One More Time"),
    T("deadmau5", "Ghosts 'n' Stuff"),
    T("Calvin Harris", "This Is What You Came For"),
  ],
  Bollywood: [
    T("Sukhwinder Singh", "Chaiyya Chaiyya"),
    T("A.R. Rahman", "Jai Ho"),
    T("Badshah", "Kala Chashma"),
    T("Benny Dayal", "Badtameez Dil"),
    T("Vishal Dadlani", "Malhari"),
    T("Akon", "Chammak Challo"),
    T("Sunidhi Chauhan", "Desi Girl"),
    T("Neha Kakkar", "London Thumakda"),
    T("Shankar Mahadevan", "Gallan Goodiyaan"),
    T("Vishal Dadlani", "Balam Pichkari"),
    T("Arijit Singh", "Tum Hi Ho"),
    T("Arijit Singh", "Kesariya"),
  ],
};

// Shelf order for a room: its theme first, then today's chart, then the rest.
export function shelvesFor(theme: string): string[] {
  const names = Object.keys(SHELVES);
  const first = SHELVES[theme] ? theme : "Party starters";
  return [first, TOP_SHELF, ...names.filter((n) => n !== first)];
}
