import Link from "next/link";

// "/" — pick a role. The TV hosts (plays the music, shows the room code); phones
// join and act as controllers. The native app is always a phone, so it skips
// straight to joining.
export default function Home() {
  const native = process.env.NEXT_PUBLIC_NATIVE_BUILD === "1";
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 p-8 text-center">
      <h1 className="font-display text-5xl font-bold sm:text-7xl">Musical Genius</h1>
      <p className="max-w-md text-lg text-white/70">
        Nominate songs, vote as they play, and find out whose taste wins the party.
      </p>
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Link
          href="/play"
          className="rounded-2xl bg-white px-6 py-4 text-xl font-semibold text-stage"
        >
          Join a game
        </Link>
        {!native && (
          <Link
            href="/tv"
            className="rounded-2xl border-2 border-white/40 px-6 py-4 text-xl font-semibold"
          >
            Host on this screen
          </Link>
        )}
      </div>
    </main>
  );
}
