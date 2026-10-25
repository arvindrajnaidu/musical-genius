// Exercises database.rules.json against the local Realtime Database emulator
// with the same reads/writes the app makes. Run: node scripts/rules-check.mjs
// (expects an emulator on 127.0.0.1:9000 with the rules loaded).
import { initializeApp } from "firebase/app";
import {
  getDatabase, connectDatabaseEmulator, ref, set, update, get, push, runTransaction, serverTimestamp, onDisconnect,
} from "firebase/database";

const NS = "musical-genius-default-rtdb";
function client(uid) {
  const app = initializeApp({ projectId: "musical-genius", databaseURL: `http://127.0.0.1:9000?ns=${NS}` }, uid);
  const db = getDatabase(app);
  connectDatabaseEmulator(db, "127.0.0.1", 9000, { mockUserToken: { sub: uid, user_id: uid } });
  return db;
}
const host = client("host1"), ann = client("ann1"), bob = client("bob1"), eve = client("eve1");
const code = "QWER", b = `rooms/${code}`;
let failures = 0;
async function expectOk(label, p) {
  try { await p; console.log("ok   ", label); } catch (e) { failures++; console.log("FAIL ", label, "-", e.message); }
}
async function expectDenied(label, p) {
  try { await p; failures++; console.log("FAIL ", label, "- was allowed"); } catch { console.log("ok   ", label, "(denied)"); }
}

await expectOk("host claims code", runTransaction(ref(host, `${b}/meta`), (cur) => cur ? undefined : { hostUid: "host1", status: "lobby", createdAt: Date.now() }));
await expectOk("host writes settings", update(ref(host), { [`${b}/settings`]: { genres: [], rounds: 1, theme: "", clipSeconds: 60 }, [`${b}/members`]: null }));
await expectOk("host picks genres", update(ref(host, `${b}/settings`), { genres: ["80s", "90s"], rounds: 2 }));
await expectDenied("other TV can't take the room", runTransaction(ref(eve, `${b}/meta`), () => ({ hostUid: "eve1", status: "lobby", createdAt: Date.now() })));
for (const [db, uid, name] of [[ann, "ann1", "Ann"], [bob, "bob1", "Bob"]]) {
  await expectOk(`${name} reads meta`, get(ref(db, `${b}/meta`)));
  await expectOk(`${name} reads members`, get(ref(db, `${b}/members`)));
  await expectOk(`${name} joins`, set(ref(db, `${b}/members/${uid}`), { name, online: true, joinedAt: serverTimestamp() }));
  await expectOk(`${name} presence`, onDisconnect(ref(db, `${b}/members/${uid}/online`)).set(false));
  await expectOk(`${name} re-marks online`, set(ref(db, `${b}/members/${uid}/online`), true));
}
await expectDenied("Ann can't rename Bob", set(ref(ann, `${b}/members/bob1/name`), "Bobo"));
const song = (id, genre = "80s") => ({ videoId: id, title: "Song " + id, channel: "Ch", genre, at: serverTimestamp() });
await expectOk("Ann picks in lobby", push(ref(ann, `${b}/nominations/ann1`), song("dQw4w9WgXcQ")));
await expectOk("Ann reads own picks", get(ref(ann, `${b}/nominations/ann1`)));
await expectDenied("Bob can't read Ann's picks", get(ref(bob, `${b}/nominations/ann1`)));
await expectDenied("Bob can't pick for Ann", push(ref(bob, `${b}/nominations/ann1`), song("dQw4w9WgXcQ")));
await expectDenied("Eve (not joined) can't pick", push(ref(eve, `${b}/nominations/eve1`), song("dQw4w9WgXcQ")));
await expectDenied("bad video id rejected", push(ref(ann, `${b}/nominations/ann1`), song("not-an-id")));
await expectOk("host starts picking", update(ref(host, `${b}/meta`), { status: "nominating" }));
await expectOk("Bob picks while nominating", push(ref(bob, `${b}/nominations/bob1`), song("9bZkp7q19f0")));
const removable = push(ref(bob, `${b}/nominations/bob1`), song("kJQP7kiw5Fk"));
await expectOk("Bob picks again", removable);
await expectOk("Bob removes a pick", set(ref(bob, `${b}/nominations/bob1/${removable.key}`), null));
const swapped = push(ref(bob, `${b}/nominations/bob1`)).key;
await expectOk("Bob swaps his 80s pick in one update", update(ref(bob), {
  [`${b}/nominations/bob1/${removable.key}`]: null, [`${b}/nominations/bob1/${swapped}`]: song("kJQP7kiw5Fk", "90s"),
}));
await expectOk("host reads all picks", get(ref(host, `${b}/nominations`)));
const queue = [
  { videoId: "dQw4w9WgXcQ", title: "A", channel: "", by: "ann1", byName: "Ann", genre: "80s", round: 0 },
  { videoId: "9bZkp7q19f0", title: "B", channel: "", by: "bob1", byName: "Bob", genre: "80s", round: 0 },
];
await expectOk("host starts music", update(ref(host), {
  [`${b}/queue`]: queue, [`${b}/votes`]: null,
  [`${b}/play`]: { index: 0, phase: "playing", startedAt: serverTimestamp() }, [`${b}/meta/status`]: "playing",
}));
await expectDenied("picks closed while playing", push(ref(ann, `${b}/nominations/ann1`), song("kJQP7kiw5Fk")));
await expectOk("Bob reads queue", get(ref(bob, `${b}/queue`)));
await expectOk("Bob votes on song 0", set(ref(bob, `${b}/votes/0/bob1`), 1));
await expectOk("Bob changes vote", set(ref(bob, `${b}/votes/0/bob1`), -1));
await expectDenied("Bob can't vote on song 1 yet", set(ref(bob, `${b}/votes/1/bob1`), 1));
await expectDenied("vote must be ±1", set(ref(ann, `${b}/votes/0/ann1`), 5));
await expectDenied("Bob can't vote as Ann", set(ref(bob, `${b}/votes/0/ann1`), 1));
await expectOk("host reveals", set(ref(host, `${b}/play`), { index: 0, phase: "reveal", startedAt: serverTimestamp() }));
await expectDenied("votes closed at reveal", set(ref(ann, `${b}/votes/0/ann1`), 1));
await expectOk("host next song", set(ref(host, `${b}/play`), { index: 1, phase: "playing", startedAt: serverTimestamp() }));
await expectOk("Ann votes on song 1", set(ref(ann, `${b}/votes/1/ann1`), 1));
await expectOk("everyone reads votes", get(ref(ann, `${b}/votes`)));
await expectDenied("no recap vote while a song plays", set(ref(ann, `${b}/roundVotes/0/ann1`), 1));
await expectOk("host opens the round recap", set(ref(host, `${b}/play`), { index: 1, phase: "recap", round: 0, endsAt: Date.now() + 15000, startedAt: serverTimestamp() }));
await expectOk("Ann moves her vote in the recap", set(ref(ann, `${b}/roundVotes/0/ann1`), 1));
await expectDenied("Ann can't recap-vote her own song", set(ref(ann, `${b}/roundVotes/0/ann1`), 0));
await expectDenied("recap vote must be a song in the queue", set(ref(ann, `${b}/roundVotes/0/ann1`), 7));
await expectDenied("recap vote must be a number", set(ref(ann, `${b}/roundVotes/0/ann1`), "1"));
await expectDenied("Bob can't recap-vote as Ann", set(ref(bob, `${b}/roundVotes/0/ann1`), 1));
await expectDenied("no recap vote for another round", set(ref(bob, `${b}/roundVotes/1/bob1`), 0));
await expectDenied("Eve (not joined) can't recap-vote", set(ref(eve, `${b}/roundVotes/0/eve1`), 1));
await expectDenied("per-song votes closed during recap", set(ref(bob, `${b}/votes/1/bob1`), 1));
await expectOk("everyone reads round votes", get(ref(bob, `${b}/roundVotes`)));
await expectOk("host announces the round winner", set(ref(host, `${b}/play`), { index: 1, phase: "winner", round: 0, startedAt: serverTimestamp() }));
await expectDenied("recap votes closed after the countdown", set(ref(bob, `${b}/roundVotes/0/bob1`), 0));
await expectOk("host finishes", update(ref(host, `${b}/meta`), { status: "finished" }));
await expectOk("host resets", update(ref(host), {
  [`${b}/nominations`]: null, [`${b}/queue`]: null, [`${b}/votes`]: null, [`${b}/roundVotes`]: null, [`${b}/play`]: null, [`${b}/meta/status`]: "lobby",
}));
await expectOk("Ann leaves", onDisconnect(ref(ann, `${b}/members/ann1/online`)).cancel().then(() => set(ref(ann, `${b}/members/ann1`), null)));
await expectDenied("nameless member entry rejected", set(ref(ann, `${b}/members/ann1/online`), false));

console.log(failures ? `\n${failures} failure(s)` : "\nAll rule checks passed");
process.exit(failures ? 1 : 0);
