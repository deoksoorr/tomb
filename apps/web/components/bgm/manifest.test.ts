import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import tracksJson from "../../public/bgm/tracks.json";
import { ALL_PLAYLIST_ID, FIRST_PLAYLIST_ID, needsAttribution, nextShuffled, parseManifest, pickTrack, randomStart, shuffledOrder, trackSrc, withAllPlaylist, type Playlist } from "./manifest";

describe("parseManifest", () => {
  it("저장소의 tracks.json은 모든 플레이리스트에 곡이 있다", () => {
    const lists = parseManifest(tracksJson);
    // 11/17 목록 대격변: 로파이만 남기고, 직접 만든 눈꽃 캐럴·노을 시티팝 (50곡씩)
    // 11/17 r2 직접 만든 레트로 50곡을 맨 앞에 (처음엔 이 목록부터)
    expect(lists.map((p) => [p.id, p.title, p.tracks.length])).toEqual([
      ["retrowinter", "레트로", 50],
      ["carol", "눈꽃 캐럴", 50],
      ["citypop", "노을 시티팝", 50],
      // 11/18 직접 만든 판타지 마을 50곡을 네 번째에 (장르가 섞여 있어 다른 목록처럼 늘 섞어 튼다)
      ["fantasy", "판타지 마을", 50],
      ["lofi", "로파이", 15],
    ]);
    expect(lists.filter((p) => p.isNew).map((p) => p.id)).toEqual(["retrowinter", "carol", "citypop", "fantasy"]);
    // 처음엔 레트로부터
    expect(FIRST_PLAYLIST_ID).toBe("retrowinter");
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

  it("처음에는 아무 플레이리스트의 아무 곡 (로파이 고정 아님)", () => {
    expect(randomStart(lists, undefined, seq(0.1, 0.8))).toEqual({ playlistId: "jazz", index: 3 });
    expect(randomStart(lists, undefined, seq(0.6, 0.3))).toEqual({ playlistId: "lofi", index: 0 });
  });

  it("저장소의 tracks.json으로 시작하면 플레이리스트가 골고루 나온다", () => {
    const all = parseManifest(tracksJson);
    const seen = new Set(all.map((_, i) => randomStart(all, undefined, seq((i + 0.5) / all.length, 0.5)).playlistId));
    expect(seen.size).toBe(all.length);
  });

  it("firstId를 주면 그 플레이리스트의 아무 곡", () => {
    expect(randomStart(lists, "lofi", () => 0.99)).toEqual({ playlistId: "lofi", index: 1 });
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

describe("11/17 전곡 섞어 듣기", () => {
  const t = (file: string) => ({ file, title: file, artist: "", sourceUrl: "", license: "", durationSec: 60 });
  it("모든 목록의 곡을 맨 앞 「전곡」에 모으고, 같은 파일은 한 번만", () => {
    const lists: Playlist[] = [
      { id: "a", title: "A", tracks: [t("/bgm/a/1.mp3"), t("/bgm/a/2.mp3")] },
      { id: "b", title: "B", tracks: [t("/bgm/b/1.mp3"), t("/bgm/a/1.mp3")] },
    ];
    const out = withAllPlaylist(lists);
    expect(out.map((p) => p.id)).toEqual([ALL_PLAYLIST_ID, "a", "b"]);
    expect(out[0].tracks.map((x) => x.file)).toEqual(["/bgm/a/1.mp3", "/bgm/a/2.mp3", "/bgm/b/1.mp3"]);
    // 두 번 붙여도 하나만
    expect(withAllPlaylist(out).filter((p) => p.id === ALL_PLAYLIST_ID)).toHaveLength(1);
  });
  it("곡이 있는 목록이 하나뿐이면 붙이지 않아요", () => {
    expect(withAllPlaylist([{ id: "a", title: "A", tracks: [t("/bgm/a/1.mp3")] }, { id: "b", title: "B", tracks: [] }]).map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("지금 곡 목록이면 전곡이 모든 곡을 담아요", () => {
    const real = parseManifest(tracksJson);
    const all = withAllPlaylist(real)[0];
    expect(all.id).toBe(ALL_PLAYLIST_ID);
    expect(all.tracks.length).toBe(new Set(real.flatMap((p) => p.tracks.map((x) => x.file))).size);
  });
});
