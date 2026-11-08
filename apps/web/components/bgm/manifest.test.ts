import { describe, expect, it } from "vitest";
import tracksJson from "../../public/bgm/tracks.json";
import { needsAttribution, nextIndex, parseManifest, randomStart, type Playlist } from "./manifest";

describe("parseManifest", () => {
  it("저장소의 tracks.json은 모든 플레이리스트에 곡이 있다", () => {
    const lists = parseManifest(tracksJson);
    expect(lists.map((p) => p.id)).toEqual(["orgel", "lofi", "rain", "piano", "chiptune", "jazz"]);
    expect(lists.every((p) => p.tracks.length > 0)).toBe(true);
  });

  it("잘못된 항목과 외부 핫링크는 버린다", () => {
    const lists = parseManifest({
      playlists: [
        {
          id: "lofi",
          title: "로파이",
          tracks: [
            { file: "/bgm/lofi/a.mp3", title: "A", artist: "x", sourceUrl: "", license: "Pixabay", durationSec: 60 },
            { file: "https://cdn.example.com/b.mp3", title: "B" },
            { file: "/bgm/lofi/c.mp3" },
          ],
        },
        { title: "id 없음", tracks: [] },
      ],
    });
    expect(lists).toHaveLength(1);
    expect(lists[0].tracks.map((t) => t.title)).toEqual(["A"]);
  });

  it("형식이 아예 다르면 빈 목록", () => {
    expect(parseManifest(null)).toEqual([]);
    expect(parseManifest({ playlists: "nope" })).toEqual([]);
  });
});

describe("nextIndex", () => {
  it("마지막 다음은 처음, 곡이 없으면 0", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });
});

describe("needsAttribution", () => {
  it("CC BY 계열만", () => {
    expect(needsAttribution("CC BY 4.0")).toBe(true);
    expect(needsAttribution("CC-BY-SA 3.0")).toBe(true);
    expect(needsAttribution("CC0")).toBe(false);
    expect(needsAttribution("Pixabay Content License")).toBe(false);
  });
});

describe("randomStart", () => {
  const track = (n: number) => ({ file: `/bgm/x/${n}.mp3`, title: `${n}`, artist: "", sourceUrl: "", license: "", durationSec: 1 });
  const lists: Playlist[] = [
    { id: "orgel", title: "오르골", tracks: [track(0), track(1), track(2), track(3)] },
    { id: "lofi", title: "로파이", tracks: [track(0), track(1)] },
  ];

  it("저장한 플레이리스트가 있으면 그 안에서 아무 곡", () => {
    expect(randomStart(lists, "lofi", () => 0.99)).toEqual({ playlistId: "lofi", index: 1 });
  });

  it("없으면 아무 플레이리스트의 아무 곡", () => {
    const seq = [0.6, 0.3];
    expect(randomStart(lists, null, () => seq.shift() ?? 0)).toEqual({ playlistId: "lofi", index: 0 });
  });

  it("곡이 없으면 0번, 목록이 없으면 null", () => {
    expect(randomStart([{ id: "rain", title: "비", tracks: [] }], null, () => 0.5)).toEqual({ playlistId: "rain", index: 0 });
    expect(randomStart([], null)).toEqual({ playlistId: null, index: 0 });
  });
});
