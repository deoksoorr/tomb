import { describe, expect, it } from "vitest";
import { COSMETIC_FX, FX_ART, fxIconGrid, riderLift, type FxArtId } from "./cosmeticFx";
import { MOUNT_H, MOUNT_W, mountLift, mountSheet } from "./mountArt";

// 11/26 운영자 「월척 잉어 데리고 다닐 때 좌우 쪽 보면 꼬리가 잘린다」 — 프레임 끝 열까지 칠한 그림은 테가 프레임 밖으로 나가 잘린 면이 보였다.
// 모든 펫 × 모든 프레임에서 왼쪽·오른쪽 끝 열과 맨 윗줄에 테 없이 칠한 픽셀이 2칸 넘게 이어져 닿으면 잘린 것으로 본다
// (아랫줄은 발바닥 줄이라 제외. 부리·꼬리 끝 같은 한 칸 끝점과 반투명 물보라·반짝이는 그대로 둔다)

/** 일부러 끝까지 그린 것: 눈오리가 폭 앉은 눈 무더기(테 위에 얹은 땅), 꼬마 펭귄 배 미끄럼(테 없는 한 장 — 뒤로 뻗은 발) */
const ALLOWED: Record<string, readonly number[]> = { sc_snowduck: [4, 5], q_pet_penguin: [2] };

type Frame = { at: (x: number, y: number) => number; w: number; h: number };

function frameOf(art: FxArtId, f: number): Frame {
  const a = FX_ART[art];
  const g = a.build();
  return { at: (x, y) => g.px[y * g.w + f * a.w + x], w: a.w, h: a.h };
}

/** 그림의 테 색 = 투명과 맞닿은 불투명 픽셀 가운데 가장 흔한 색 */
function lineColor(art: FxArtId): number | null {
  const a = FX_ART[art];
  const count = new Map<number, number>();
  for (let f = 0; f < a.frames; f++) {
    const fr = frameOf(art, f);
    const clear = (x: number, y: number) => x >= 0 && y >= 0 && x < fr.w && y < fr.h && (fr.at(x, y) & 255) === 0;
    for (let y = 0; y < fr.h; y++)
      for (let x = 0; x < fr.w; x++) {
        const v = fr.at(x, y);
        if ((v & 255) < 128) continue;
        if (clear(x - 1, y) || clear(x + 1, y) || clear(x, y - 1) || clear(x, y + 1)) count.set(v >>> 8, (count.get(v >>> 8) ?? 0) + 1);
      }
  }
  let best: number | null = null;
  let n = 0;
  for (const [c, k] of count) if (k > n) [best, n] = [c, k];
  return best;
}

/** 끝 열·윗줄에 테 없이 칠한 픽셀이 가장 길게 이어진 칸 수 */
function openRuns(art: FxArtId, f: number, line: number | null): { left: number; right: number; top: number } {
  const fr = frameOf(art, f);
  const open = (x: number, y: number) => {
    const v = fr.at(x, y);
    if ((v & 255) !== 255) return false;
    if (line === null) return true;
    const c = v >>> 8;
    const d = (s: number) => Math.abs(((c >> s) & 255) - ((line >> s) & 255));
    return Math.max(d(16), d(8), d(0)) > 40;
  };
  const run = (pts: [number, number][]) => {
    let best = 0;
    let cur = 0;
    for (const [x, y] of pts) {
      cur = open(x, y) ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best;
  };
  const col = (x: number) => Array.from({ length: fr.h }, (_, y) => [x, y] as [number, number]);
  return { left: run(col(0)), right: run(col(fr.w - 1)), top: run(Array.from({ length: fr.w }, (_, x) => [x, 0] as [number, number])) };
}

const PETS = Object.entries(COSMETIC_FX).flatMap(([id, s]) => (s.kind === "pet" ? [[id, s.art as FxArtId] as const] : []));

describe("펫 그림이 프레임 끝에서 잘리지 않는다", () => {
  it("펫이 하나 이상 있다 (검사가 비지 않게)", () => {
    expect(PETS.length).toBeGreaterThan(30);
  });

  for (const [id, art] of PETS) {
    it(`${id} (${art}) — 왼쪽·오른쪽 끝 열·맨 윗줄에 테 없는 면이 닿지 않는다`, () => {
      const a = FX_ART[art];
      const line = lineColor(art);
      const bad: string[] = [];
      for (let f = 0; f < a.frames; f++) {
        if (ALLOWED[id]?.includes(f)) continue;
        const r = openRuns(art, f, line);
        if (r.left >= 2 || r.right >= 2 || r.top >= 2) bad.push(`f${f} L${r.left} R${r.right} T${r.top}`);
      }
      expect(bad, `${id}: ${bad.join(", ")}`).toEqual([]);
    });
  }

  it("월척 잉어: 옆모습(→·←) 꼬리지느러미 끝이 테로 닫히고, 위치·발밑·탄 사람 높이는 그대로", () => {
    const a = FX_ART.mountCarp;
    expect([a.w, a.h, a.pad]).toEqual([MOUNT_W + 2, MOUNT_H, { x: 1, top: 0 }]);
    const g = a.build();
    const raw = mountSheet("carp");
    for (let f = 0; f < a.frames; f++) {
      // 원래 그림은 한 칸 오른쪽으로 그대로 (가운데 기준 그리기라 화면 위치는 같다)
      for (let y = 0; y < MOUNT_H; y++)
        for (let x = 0; x < MOUNT_W; x++) expect(g.px[y * g.w + f * a.w + x + 1]).toBe(raw.px[y * raw.w + f * MOUNT_W + x]);
      // 옆모습은 꼬리 끝(왼쪽 끝 열)에 칠한 픽셀이 없고, 새로 생긴 바깥 칸은 테 색
      const r = openRuns("mountCarp", f, 0x5a2a1a);
      expect([r.left, r.right], `f${f}`).toEqual([0, 0]);
    }
    for (const f of [0, 1]) {
      const caps = Array.from({ length: MOUNT_H }, (_, y) => g.px[y * g.w + f * a.w]).filter((v) => v & 255);
      expect(caps.length, `f${f} 꼬리 테`).toBeGreaterThanOrEqual(4);
      for (const v of caps) expect(v >>> 8).toBe(0x5a2a1a);
    }
    expect(riderLift("q_ride_carp")).toBe(mountLift("carp"));
    // 상점 아이콘에도 꼬리가 다 들어간다 (왼쪽 끝 열은 테 색뿐)
    const icon = fxIconGrid("q_ride_carp")!;
    const edge = Array.from({ length: 16 }, (_, y) => icon.px[y * 16]).filter((v) => v & 255);
    for (const v of edge) expect(v >>> 8).toBe(0x5a2a1a);
  });

  it("위 여백을 둔 타는 펫(사슴·알파카·썰매)은 발밑 기준이라 원래 그림이 한 줄 아래로 그대로 옮겨진다", () => {
    for (const [art, kind] of [["mountDeer", "deer"], ["mountAlpaca", "alpaca"], ["mountSleigh", "sleigh"]] as const) {
      const a = FX_ART[art];
      const g = a.build();
      const raw = mountSheet(kind);
      expect(a.pad.top, art).toBe(1);
      expect(a.h, art).toBe(MOUNT_H + 1);
      const W = a.w;
      for (let f = 0; f < a.frames; f++)
        for (let y = 0; y < MOUNT_H; y++)
          for (let x = 0; x < W; x++) if (g.px[(y + 1) * g.w + f * W + x] !== raw.px[y * raw.w + f * W + x]) throw new Error(`${art} f${f} (${x},${y})`);
    }
  });
});
