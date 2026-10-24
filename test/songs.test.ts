import { describe, expect, it } from "vitest";
import { pickVideo } from "../lib/match";
import { fromItunes, SHELVES, shelvesFor, TOP_SHELF } from "../lib/songs";

const c = (videoId: string, title: string, channel = "") => ({ videoId, title, channel });

describe("pickVideo", () => {
  it("skips covers and karaoke in favour of the official upload", () => {
    const best = pickVideo(
      [c("aaaaaaaaaaa", "Toto - Africa (Karaoke Version)"), c("bbbbbbbbbbb", "Africa cover"), c("ccccccccccc", "Toto - Africa (Official HD Video)", "TotoVEVO")],
      "Toto",
      "Africa",
    );
    expect(best?.videoId).toBe("ccccccccccc");
  });

  it("keeps a live version when the song title asks for one", () => {
    const best = pickVideo([c("aaaaaaaaaaa", "Queen - Live Aid 1985 (Live)", "Queen Official")], "Queen", "Live Aid 1985 (Live)");
    expect(best?.videoId).toBe("aaaaaaaaaaa");
  });

  it("returns null with nothing to pick", () => {
    expect(pickVideo([], "a", "b")).toBeNull();
  });
});

describe("fromItunes", () => {
  it("keeps songs only and drops the same song from other albums", () => {
    const tracks = fromItunes([
      { kind: "song", trackName: "Wannabe", artistName: "Spice Girls", releaseDate: "1996-07-08T07:00:00Z" },
      { kind: "song", trackName: "Wannabe", artistName: "Spice Girls" },
      { kind: "music-video", trackName: "Wannabe", artistName: "Spice Girls" },
    ]);
    expect(tracks).toEqual([{ artist: "Spice Girls", title: "Wannabe", art: undefined, year: "1996" }]);
  });
});

describe("shelvesFor", () => {
  it("opens on the room's theme, then the chart", () => {
    expect(shelvesFor("90s").slice(0, 2)).toEqual(["90s", TOP_SHELF]);
    expect(shelvesFor("EDM").slice(0, 2)).toEqual(["EDM", TOP_SHELF]);
    expect(shelvesFor("").slice(0, 2)).toEqual(["Party starters", TOP_SHELF]);
    expect(new Set(shelvesFor("Rock")).size).toBe(Object.keys(SHELVES).length + 1);
  });

  it("lists each song once per shelf", () => {
    for (const tracks of Object.values(SHELVES)) {
      const keys = tracks.map((t) => `${t.artist}|${t.title}`.toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
