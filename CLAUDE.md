# CLAUDE.md

Musical Genius is a Kahoot-style party game. The host opens the web app on a TV
browser (`/tv`); that screen shows the room code and is the only device that
plays music (YouTube IFrame Player). Guests join from phones (`/play`, or the
iOS/Android app) to nominate songs and vote 👍/👎 while each one plays. After the
set number of rounds, the song with the most votes wins.

## Commands

- `npm run dev` — Next.js dev server on port 3000
- `npm run build` — web build (deployed to Vercel)
- `npm run build:native` — static export into `out/` for Capacitor
- `npm run ios` / `npm run android` — native build, sync, open in Xcode / Android Studio
- `npm run lint`

## Setup

Same structure as Birthday Scroll (Next.js + Tailwind + Capacitor, two build
targets from one codebase, see `next.config.ts`). Multiplayer follows irummy:
anonymous Firebase auth plus Realtime Database rooms (`database.rules.json`),
not Firestore, because live voting needs low latency and `onDisconnect` presence.

Copy `.env.example` to `.env.local` and fill in the Firebase web config.

Rooms are addressed by query string (`/play?code=ABCD`), never a dynamic route
segment, so the static native export keeps working.

This Next.js version has breaking changes from older releases. Read the guide in
`node_modules/next/dist/docs/` before writing Next.js code.
