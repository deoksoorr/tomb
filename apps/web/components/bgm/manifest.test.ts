import { describe, expect, it } from "vitest";
import tracksJson from "../../public/bgm/tracks.json";
import { needsAttribution, nextIndex, parseManifest } from "./manifest";

describe("parseManifest", () => {
  it("저장소의 tracks.json은 세 플레이리스트를 가진다", () => {
    expect(parseManifest(tracksJson).map((p) => p.id)).toEqual(["orgel", "lofi", "rain"]);
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
