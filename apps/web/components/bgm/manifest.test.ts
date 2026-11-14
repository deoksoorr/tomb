import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import tracksJson from "../../public/bgm/tracks.json";
import { FIRST_PLAYLIST_ID, needsAttribution, nextShuffled, parseManifest, pickTrack, randomStart, shuffledOrder, trackSrc, type Playlist } from "./manifest";

describe("parseManifest", () => {
  it("저장소의 tracks.json은 모든 플레이리스트에 곡이 있다", () => {
    const lists = parseManifest(tracksJson);
    // 로파이·재즈·어쿠스틱 기타는 픽사베이 곡으로 바꾸고, 나머지 6개는 예전 그대로
    expect(lists.map((p) => [p.id, p.title])).toEqual([
      ["lofi", "로파이"],
      ["acoustic", "어쿠스틱 기타"],
      ["jazz", "재즈"],
      ["orgel", "오르골"],
      ["rain", "빗소리"],
      ["piano", "피아노"],
      ["chiptune", "8비트"],
      ["ambient", "앰비언트"],
      ["retro", "레트로 RPG"],
    ]);
    // 새로 바꾼 세 목록에만 NEW 딱지
    expect(lists.filter((p) => p.isNew).map((p) => p.id)).toEqual(["lofi", "acoustic", "jazz"]);
    expect(lists.some((p) => p.id === FIRST_PLAYLIST_ID)).toBe(true);
    expect(lists.every((p) => p.tracks.length > 0)).toBe(true);
  });

  it("플레이리스트마다 15곡 이상이고, 파일·제목이 겹치지 않으며 실제 파일이 그 목록 폴더에 있다", () => {
    const lists = parseManifest(tracksJson);
    for (const p of lists) {
      expect(p.tracks.length, p.id).toBeGreaterThanOrEqual(15);
      for (const t of p.tracks) expect(t.file.startsWith(`/bgm/${p.id}/`), t.file).toBe(true);
    }
    const all = lists.flatMap((p) => p.tracks);
    expect(new Set(all.map((t) => t.file)).size).toBe(all.length);
    expect(new Set(all.map((t) => t.title)).size).toBe(all.length);
    const pub = fileURLToPath(new URL("../../public", import.meta.url));
    for (const t of all) {
      expect(existsSync(pub + t.file), t.file).toBe(true);
      expect(t.durationSec, t.file).toBeGreaterThan(30);
    }
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

/** 정해 둔 값을 차례로 내놓는 rand (다 쓰면 0) */
const seq = (...values: number[]) => () => values.shift() ?? 0;

describe("pickTrack", () => {
  it("곡 수 안에서 고르고, 곡이 없으면 0", () => {
    expect(pickTrack(5, null, () => 0)).toBe(0);
    expect(pickTrack(5, null, () => 0.999)).toBe(4);
    expect(pickTrack(0, null, () => 0.5)).toBe(0);
  });

  it("지금 곡(avoid)은 다시 고르지 않는다", () => {
    for (let r = 0; r < 1; r += 0.01) expect(pickTrack(4, 2, () => r)).not.toBe(2);
    expect(pickTrack(4, 0, () => 0)).toBe(1);
    expect(pickTrack(4, 3, () => 0.999)).toBe(2);
  });

  it("1곡뿐이면 그 곡", () => {
    expect(pickTrack(1, 0, () => 0.7)).toBe(0);
  });

  it("여러 번 누르면 고르게 여러 곡이 나온다", () => {
    const seen = new Set<number>();
    for (let r = 0; r < 1; r += 0.05) seen.add(pickTrack(16, null, () => r));
    expect(seen.size).toBe(16);
  });
});

describe("shuffledOrder", () => {
  it("first가 맨 앞이고 모든 곡이 한 번씩", () => {
    for (const r of [0, 0.3, 0.999]) {
      const order = shuffledOrder(10, 7, () => r);
      expect(order[0]).toBe(7);
      expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
    expect(shuffledOrder(0, 0)).toEqual([]);
  });
});

describe("nextShuffled", () => {
  it("섞은 순서를 따라간다", () => {
    expect(nextShuffled([2, 0, 1], 2, 3)).toEqual({ order: [2, 0, 1], index: 0 });
    expect(nextShuffled([2, 0, 1], 0, 3)).toEqual({ order: [2, 0, 1], index: 1 });
  });

  it("한 바퀴 돌면 다시 섞고, 방금 곡이 연달아 나오지 않는다", () => {
    for (let r = 0; r < 1; r += 0.05) {
      const next = nextShuffled([2, 0, 1], 1, 3, () => r);
      expect(next.index).not.toBe(1);
      expect(next.order[0]).toBe(next.index);
      expect([...next.order].sort()).toEqual([0, 1, 2]);
    }
  });

  it("다른 목록의 순서면 지금 곡부터 새로 섞어 다음 곡으로", () => {
    const next = nextShuffled([0, 1], 3, 5, () => 0);
    expect(next.order).toHaveLength(5);
    expect(next.order[0]).toBe(3);
    expect(next.index).not.toBe(3);
  });

  it("1곡이면 그 곡 반복, 곡이 없으면 0", () => {
    expect(nextShuffled([0], 0, 1).index).toBe(0);
    expect(nextShuffled([], 0, 0)).toEqual({ order: [], index: 0 });
  });

  it("오래 돌려도 같은 곡이 연달아 나오지 않는다", () => {
    let state = { order: shuffledOrder(16, 0), index: 0 };
    for (let i = 0; i < 500; i++) {
      const next = nextShuffled(state.order, state.index, 16);
      expect(next.index).not.toBe(state.index);
      state = next;
    }
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
    { id: "jazz", title: "재즈", tracks: [track(0), track(1), track(2), track(3)] },
    { id: "lofi", title: "로파이", tracks: [track(0), track(1)] },
  ];

  it("처음에는 무조건 로파이(기본값)의 아무 곡", () => {
    expect(randomStart(lists, undefined, () => 0.99)).toEqual({ playlistId: "lofi", index: 1 });
    expect(randomStart(lists, undefined, () => 0)).toEqual({ playlistId: "lofi", index: 0 });
  });

  it("저장소의 tracks.json으로도 첫 곡은 로파이", () => {
    for (const r of [0, 0.5, 0.999]) expect(randomStart(parseManifest(tracksJson), FIRST_PLAYLIST_ID, () => r).playlistId).toBe("lofi");
  });

  it("그 목록이 없으면 아무 플레이리스트의 아무 곡", () => {
    expect(randomStart(lists, "nope", seq(0.1, 0.8))).toEqual({ playlistId: "jazz", index: 3 });
    expect(randomStart(lists, null, seq(0.6, 0.3))).toEqual({ playlistId: "lofi", index: 0 });
  });

  it("곡이 없으면 0번, 목록이 없으면 null", () => {
    expect(randomStart([{ id: "rain", title: "비", tracks: [] }], null, () => 0.5)).toEqual({ playlistId: "rain", index: 0 });
    expect(randomStart([], null)).toEqual({ playlistId: null, index: 0 });
  });
});

describe("trackSrc", () => {
  it("base가 없거나 틀리면 /bgm/ 경로 그대로", () => {
    expect(trackSrc("/bgm/lofi/a.mp3", undefined)).toBe("/bgm/lofi/a.mp3");
    expect(trackSrc("/bgm/lofi/a.mp3", "")).toBe("/bgm/lofi/a.mp3");
    expect(trackSrc("/bgm/lofi/a.mp3", "  ")).toBe("/bgm/lofi/a.mp3");
    expect(trackSrc("/bgm/lofi/a.mp3", "bgm.myproject.rip")).toBe("/bgm/lofi/a.mp3");
  });
  it("base가 있으면 /bgm 대신 그 주소 아래 같은 경로 (끝 / 는 무시)", () => {
    expect(trackSrc("/bgm/lofi/a.mp3", "https://bgm.myproject.rip")).toBe("https://bgm.myproject.rip/lofi/a.mp3");
    expect(trackSrc("/bgm/jazz/b.mp3", "https://bgm.myproject.rip/")).toBe("https://bgm.myproject.rip/jazz/b.mp3");
  });
  it("/bgm/ 밖의 파일은 바꾸지 않는다", () => {
    expect(trackSrc("/sfx/rain.mp3", "https://bgm.myproject.rip")).toBe("/sfx/rain.mp3");
  });
});
