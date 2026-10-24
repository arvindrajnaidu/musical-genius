import { describe, expect, it } from "vitest";
import { buildQueue, roundVote, tally, type Nomination, type QueueItem } from "../lib/game";
import { parseVideoId } from "../lib/youtube";

const nom = (videoId: string, genre: string | undefined, at = 1): Nomination => ({
  videoId,
  title: videoId,
  channel: "",
  at,
  genre,
});

describe("buildQueue", () => {
  it("plays round by round in genre order, one pick per player per genre", () => {
    const q = buildQueue(
      {
        a: { x: nom("a90", "90s"), y: nom("a80", "80s") },
        b: { x: nom("b80", "80s"), y: nom("b90", "90s") },
      },
      { a: "Ann", b: "Bob" },
      ["80s", "90s"],
      () => 0.99,
    );
    expect(q.map((i) => [i.genre, i.round])).toEqual([
      ["80s", 0],
      ["80s", 0],
      ["90s", 1],
      ["90s", 1],
    ]);
    expect(q.slice(0, 2).map((i) => i.videoId).sort()).toEqual(["a80", "b80"]);
    expect(q.find((i) => i.by === "a")?.byName).toBe("Ann");
  });

  it("ignores picks without a genre, for other genres, and extra picks for a genre", () => {
    const q = buildQueue(
      { a: { 1: nom("first", "80s", 1), 2: nom("second", "80s", 2), 3: nom("old", undefined), 4: nom("edm", "EDM") } },
      { a: "Ann" },
      ["80s"],
    );
    expect(q.map((i) => i.videoId)).toEqual(["first"]);
  });

  it("leaves out players with no pick for a genre", () => {
    const q = buildQueue({ a: { 1: nom("a80", "80s") }, b: { 1: nom("b90", "90s") } }, {}, ["80s", "90s"]);
    expect(q.map((i) => [i.by, i.round])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("never plays the same player twice in a row across rounds", () => {
    for (let seed = 0; seed < 50; seed++) {
      let s = seed;
      const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const g = ["80s", "90s", "EDM"];
      const q = buildQueue(
        {
          a: { 1: nom("a1", g[0]), 2: nom("a2", g[1]), 3: nom("a3", g[2]) },
          b: { 1: nom("b1", g[0]), 2: nom("b2", g[1]), 3: nom("b3", g[2]) },
          c: { 1: nom("c1", g[0]) },
        },
        {},
        g,
        rand,
      );
      expect(q).toHaveLength(7);
      for (let i = 1; i < q.length; i++) expect(q[i].by).not.toBe(q[i - 1].by);
    }
  });

  it("handles no picks", () => {
    expect(buildQueue({}, {}, ["80s"])).toEqual([]);
  });
});

describe("tally", () => {
  const item = (by: string, round: number, genre: string): QueueItem => ({
    videoId: by + round,
    title: `${genre} by ${by}`,
    channel: "",
    by,
    byName: by.toUpperCase(),
    genre,
    round,
  });
  // Round 0 (80s): songs 0-2; round 1 (90s): songs 3-5.
  const queue = [
    item("a", 0, "80s"),
    item("b", 0, "80s"),
    item("c", 0, "80s"),
    item("a", 1, "90s"),
    item("b", 1, "90s"),
    item("c", 1, "90s"),
  ];

  it("counts only a voter's last vote in a round", () => {
    // c votes for a's song, then moves to b's.
    const votes = { "0": { c: 1 as const }, "1": { c: 1 as const } };
    expect(roundVote(queue, votes, 0, "c")).toBe(1);
    const { songs, players } = tally(queue, votes);
    expect(songs.map((s) => s.votes)).toEqual([0, 1, 0, 0, 0, 0]);
    expect(players[0]).toMatchObject({ uid: "b", score: 1 });
  });

  it("keeps rounds independent", () => {
    const votes = { "0": { b: 1 as const, c: 1 as const }, "4": { a: 1 as const }, "5": { a: 1 as const } };
    const { songs, rounds } = tally(queue, votes);
    expect(songs.map((s) => s.votes)).toEqual([2, 0, 0, 0, 0, 1]);
    expect(rounds.map((r) => [r.genre, r.winners.map((w) => w.index)])).toEqual([
      ["80s", [0]],
      ["90s", [5]],
    ]);
  });

  it("ignores votes for your own song and legacy thumbs down", () => {
    // a's own song (0) doesn't hold a's vote, so it stays on b's earlier song.
    const votes = { "1": { a: 1 as const }, "0": { a: 1 as const, b: -1 as const } };
    expect(roundVote(queue, votes, 0, "a")).toBe(1);
    expect(roundVote(queue, votes, 0, "b")).toBeUndefined();
    expect(tally(queue, votes).songs[0].votes).toBe(0);
  });

  it("shares a round win on a tie and has no winner without votes", () => {
    const votes = { "0": { b: 1 as const }, "1": { a: 1 as const } };
    const { rounds, players } = tally(queue, votes);
    expect(rounds[0].winners.map((w) => w.index)).toEqual([0, 1]);
    expect(rounds[1].winners).toEqual([]);
    expect(players.every((p) => p.score <= 1)).toBe(true);
  });

  it("works with no votes", () => {
    expect(tally(queue, {}).players.every((p) => p.score === 0)).toBe(true);
  });
});

describe("parseVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://example.com/watch?v=dQw4w9WgXcQ", null],
    ["never gonna give you up", null],
  ])("%s", (input, id) => {
    expect(parseVideoId(input)).toBe(id);
  });
});
