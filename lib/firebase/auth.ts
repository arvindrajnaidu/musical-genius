import { signInAnonymously, updateProfile, type User } from "firebase/auth";
import { auth } from "./client";

// Anonymous-first, like irummy: guests type a nickname and they're in. No
// accounts, so no Sign in with Apple requirement on iOS.
export async function ensureSignedIn(nickname?: string): Promise<User> {
  if (!auth) throw new Error("firebase-not-configured");
  if (!auth.currentUser) await signInAnonymously(auth);
  const user = auth.currentUser!;
  if (nickname && user.displayName !== nickname) {
    await updateProfile(user, { displayName: nickname }).catch(() => {});
  }
  return user;
}
