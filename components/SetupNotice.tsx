import { firebaseConfigured } from "@/lib/firebase/client";

// Shown in place of a screen when the Firebase env vars aren't set yet, so a
// fresh clone renders instead of throwing.
export function SetupNotice() {
  if (firebaseConfigured) return null;
  return (
    <p className="rounded-xl bg-amber-400/20 px-4 py-3 text-amber-200">
      Firebase isn&apos;t configured. Copy <code>.env.example</code> to{" "}
      <code>.env.local</code> and fill in the web app config.
    </p>
  );
}
