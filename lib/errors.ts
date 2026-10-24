// Friendly copy for the error codes thrown by lib/room.ts and Firebase.
export function errorMessage(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e);
  if (code.includes("room-not-found")) return "No game with that code. Check the TV and try again.";
  if (code.includes("room-finished")) return "That game has finished. Ask the host for the new code.";
  if (code.includes("room-full")) return "That room is full.";
  if (code.includes("no-free-code")) return "Couldn't create a room. Please try again.";
  if (code.includes("admin-restricted-operation") || code.includes("configuration-not-found"))
    return "Sign-in isn't enabled for this game yet (turn on Anonymous auth in Firebase).";
  if (code.includes("PERMISSION_DENIED") || code.includes("permission_denied"))
    return "The server refused that request.";
  return "Something went wrong. Please try again.";
}
