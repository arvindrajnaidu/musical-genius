import { SetupNotice } from "@/components/SetupNotice";

// "/play" — the phone controller (web, iOS and Android). It will join a room by
// code, then nominate songs and vote while they play on the TV.
export default function PlayPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <SetupNotice />
      <h1 className="font-display text-4xl font-bold">Join a game</h1>
      <p className="text-white/70">Room codes arrive in the next step.</p>
    </main>
  );
}
