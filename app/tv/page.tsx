import { SetupNotice } from "@/components/SetupNotice";

// "/tv" — the host screen, opened in the TV's browser. It will create the room,
// show the join code, and play the queue through the YouTube IFrame Player.
export default function TvPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-12 text-center">
      <SetupNotice />
      <h1 className="font-display text-6xl font-bold">Host screen</h1>
      <p className="text-2xl text-white/70">Room codes arrive in the next step.</p>
    </main>
  );
}
