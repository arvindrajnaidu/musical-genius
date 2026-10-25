# CLAUDE.md

Musical Genius is a Kahoot-style party game. The host opens the web app on a TV
browser (`/tv`); that screen shows the room code and is the only device that
plays music (YouTube IFrame Player). Guests join from phones (`/play`, or the
iOS/Android app) to pick songs and vote. The host chooses an ordered list of
genres; each genre is one round, and every player picks one song per genre. A
round plays that genre's songs back to back, and each player has one vote per
round: voting on a later song moves it there (the last vote counts, no 👎, never
your own song). When every genre has played, the player whose songs collected
the most votes wins.

## Commands

- `npm run dev` — Next.js dev server on port 3000
- `npm run build` — web build (deployed to Vercel)
- `npm run build:native` — static export into `out/` for Capacitor
- `npm run ios` / `npm run android` — native build, sync, open in Xcode / Android Studio
- `npm run ios:testflight` — native build, sync, archive, upload to TestFlight (macOS only;
  uses the App Store Connect API key in `~/.appstoreconnect/private_keys/`, same as Birthday Scroll)
- `npm run cap:assets` — regenerate app icons/splashes from `assets/`
- `npm run lint`
- `npm test` — Vitest for the pure rules in `lib/game.ts` and link parsing in `lib/youtube.ts`
- `npm run rules:deploy` — deploy `database.rules.json` to Firebase
- `npm run rules:check` — run the app's reads/writes against the rules on a local
  Realtime Database emulator (start one on :9000 and PUT the rules to
  `/.settings/rules.json?ns=musical-genius-default-rtdb` first). Run it after any rules
  change: RTDB rules have no `numChildren()` and similar, and a rule that doesn't
  compile makes the whole deploy fail.

## Setup

Same structure as Birthday Scroll (Next.js + Tailwind + Capacitor, two build
targets from one codebase, see `next.config.ts`). Multiplayer follows irummy:
anonymous Firebase auth plus Realtime Database rooms (`database.rules.json`),
not Firestore, because live voting needs low latency and `onDisconnect` presence.

The Firebase web config is committed in `lib/firebase/client.ts` (it's public by
design); `.env.example` lists optional overrides. Deploy Realtime Database rules
with `npm run rules:deploy` after changing `database.rules.json`.

Room data lives at `rooms/<CODE>/{meta,settings,members,nominations,queue,play,votes}`;
see `lib/room.ts`. Status flow: lobby → nominating → playing → finished. The TV is
authoritative: it builds the queue, drives `play` (index + playing/reveal; songs play in full and only the host
moves on); phones only write their own nominations and votes.

Rounds live in `settings.genres` (`rounds` mirrors its length for older builds);
nominations and queue items carry `genre`/`round`. Votes stay one value per
song (`votes/<songIndex>/<uid>` = 1, writable only while that song plays), and
`lib/game.ts` (`roundVote`, `tally`) turns them into one vote per round: the
latest song in the round a player voted on holds it. That kept the database
rules unchanged.

Finding songs (`lib/songs.ts`): phones search Apple's iTunes Search API as they
type (free, no key) and browse themed shelves (`SHELVES`, named like the host's
theme chips, plus Apple's most-played chart). Tapping a song calls
`/api/song?artist=&title=` (`app/api/song/route.web.ts`, web build only), which
spends one YouTube Data API search with the server-side `YOUTUBE_API_KEY` (set in
Vercel) and is CDN-cached for a month. The native app calls the deployed site
(`lib/site.ts`, `NEXT_PUBLIC_SITE_URL`). Pasting a YouTube link still works without
any key. Videos whose uploader blocks embedding are rejected at paste time (oEmbed
401) and skipped on the TV (player errors 101/150).
Codes are 4 letters without I, L or O.

Rooms are addressed by query string (`/play?code=ABCD`), never a dynamic route
segment, so the static native export keeps working.

This Next.js version has breaking changes from older releases. Read the guide in
`node_modules/next/dist/docs/` before writing Next.js code.
