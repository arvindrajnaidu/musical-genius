import { Suspense } from "react";
import { JoinGame } from "@/components/JoinGame";

// "/play" — the phone controller (web, iOS and Android). JoinGame reads ?code=
// with useSearchParams, so it sits in a Suspense boundary for the static export.
export default function PlayPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <Suspense>
        <JoinGame />
      </Suspense>
    </main>
  );
}
