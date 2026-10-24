import { HostLobby } from "@/components/HostLobby";

// "/tv" — the host screen, opened in the TV's browser. Creates the room, shows
// the join code, and (next step) plays the queue through the YouTube player.
export default function TvPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-12">
      <HostLobby />
    </main>
  );
}
