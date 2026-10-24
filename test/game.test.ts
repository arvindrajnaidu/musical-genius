import { describe, expect, it } from "vitest";
import { buildQueue, tally, type Nomination } from "../lib/game";
import { parseVideoId } from "../lib/youtube";

const nom = (videoId: string, at: number): Nomination => ({ videoId, title: videoId, channel: "", at });

describe("buildQueue", () => {
  it("interleaves players round by round in nomination order", () => {
    const q = buildQueue(
      {
        a: { x: nom("a2aaaaaaaaa", 2), y: nom("a1aaaaaaaaa", 1) },
        b: { x: nom("b1bbbbbbbbb", 1), y: nom("b2bbbbbbbbb", 2) },
      },
      { a: "Ann", b: "Bob" },
      () => 0.99,
    );
    expect(q.map((i) => i.videoId)).toEqual(["a1aaaaaaaaa", "b1bbbbbbbbb", "a2aaaaaaaaa", "b2bbbbbbbbb"]);
    expect(q[0].byName).toBe("Ann");
  });

  it("never plays the same player twice in a row across rounds", () => {
    for (let seed = 0; seed < 50; seed++) {
      let s = seed;
      const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const q = buildQueue(
        {
          a: { 1: nom("a1aaaaaaaaa", 1), 2: nom("a2aaaaaaaaa", 2), 3: nom("a3aaaaaaaaa", 3) },
          b: { 1: nom("b1bbbbbbbbb", 1), 2: nom("b2bbbbbbbbb", 2), 3: nom("b3bbbbbbbbb", 3) },
          c: { 1: nom("c1ccccccccc", 1) },
        },
        {},
        rand,
      );
      expect(q).toHaveLength(7);
      for (let i = 1; i < q.length; i++) expect(q[i].by).not.toBe(q[i - 1].by);
    }
  });

  it("handles players with no picks", () => {
    expect(buildQueue({}, {})).toEqual([]);
  });
});

describe("tally", () => {
  const queue = [
    { videoId: "1", title: "", channel: "", by: "a", byName: "Ann" },
    { videoId: "2", title: "", channel: "", by: "b", byName: "Bob" },
    { videoId: "3", title: "", channel: "", by: "a", byName: "Ann" },
  ];

  it("sums likes minus dislikes per player and ignores self-votes", () => {
    const { players, topSongs } = tally(queue, {
      "0": { a: 1, b: 1, c: 1 },
      "1": { a: -1, b: 1, c: 1 },
      "2": { b: -1, c: -1 },
    });
    expect(players.map((p) => [p.name, p.score])).toEqual([
      ["Ann", 0],
      ["Bob", 0],
    ]);
    // Ann: song0 +2, song2 -2. Bob: song1 1-1 = 0 (own vote ignored). Tie on score → more likes first.
    expect(players[0].likes).toBe(2);
    expect(topSongs[0].index).toBe(0);
  });

  it("works with no votes", () => {
    const { players } = tally(queue, {});
    expect(players.every((p) => p.score === 0)).toBe(true);
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

describe("buildQueue maxPerPlayer", () => {
  it("only takes each player's earliest picks up to the limit", () => {
    const q = buildQueue(
      { a: { x: nom("a1aaaaaaaaa", 1), y: nom("a2aaaaaaaaa", 2), z: nom("a3aaaaaaaaa", 3) } },
      { a: "Ann" },
      Math.random,
      2,
    );
    expect(q.map((i) => i.videoId)).toEqual(["a1aaaaaaaaa", "a2aaaaaaaaa"]);
  });
});
