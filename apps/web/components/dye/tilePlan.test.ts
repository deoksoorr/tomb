import { describe, expect, it } from "vitest";
import { boardColor, buildBoard, cellOf, DYE_BOARD_H, DYE_BOARD_W } from "@/lib/dye/palette";
import { judgeColor } from "@/lib/dye/service";
import { aimAt, clampView, easeVelocity, KEY_PAN_FAST, KEY_PAN_PX, keyTarget, minScale, startScale, TILE_LOW, tileKeep, tilePlan, visibleChunks, zoomAt, type BoardView } from "./board";

// 11/22 판 끊김·검은 칸 개선: 타일 미리 그리기 순서 · 키 이동 부드럽게 · 조준점 색 = 서버 판정 색

const W = 800;
const H = 500;

describe("46번 염색 판 타일 순서", () => {
  it("보이는 구역 거친 그림 → 보이는 구역 선명 그림 → 둘레 순서이고, 보이는 구역은 빠짐없이 든다", () => {
    const v = clampView({ cx: 330, cy: 190, scale: startScale(W, H) }, W, H);
    const plan = tilePlan(v, W, H);
    const vis = visibleChunks(v, W, H);
    const nVis = (vis.i1 - vis.i0 + 1) * (vis.j1 - vis.j0 + 1);
    expect(plan.slice(0, nVis).every((t) => t.step === TILE_LOW)).toBe(true);
    expect(plan.slice(nVis, 2 * nVis).every((t) => t.step === 1)).toBe(true);
    for (let j = vis.j0; j <= vis.j1; j++)
      for (let i = vis.i0; i <= vis.i1; i++) {
        expect(plan.some((t) => t.i === i && t.j === j && t.step === 1)).toBe(true);
        expect(plan.some((t) => t.i === i && t.j === j && t.step === TILE_LOW)).toBe(true);
      }
    // 둘레도 미리: 화면 가장자리에서 반 구역 안쪽에 걸치는 구역은 선명하게, 한 구역 안쪽은 거칠게라도
    const hw = W / 2 / v.scale;
    const hh = H / 2 / v.scale;
    const has = (x: number, y: number, step: number) => plan.some((t) => t.step === step && t.i === Math.floor(x / DYE_BOARD_W) && t.j === Math.floor(y / DYE_BOARD_H));
    expect(has(v.cx + hw + DYE_BOARD_W / 2 - 1, v.cy, 1)).toBe(true);
    expect(has(v.cx, v.cy - hh - DYE_BOARD_H / 2 + 1, 1)).toBe(true);
    expect(has(v.cx - hw - DYE_BOARD_W + 1, v.cy + hh + DYE_BOARD_H - 1, TILE_LOW)).toBe(true);
    // 같은 일은 한 번만
    expect(new Set(plan.map((t) => `${t.i},${t.j},${t.step}`)).size).toBe(plan.length);
  });

  it("움직이는 쪽 둘레를 먼저 그린다", () => {
    const v = clampView({ cx: DYE_BOARD_W / 2, cy: DYE_BOARD_H / 2, scale: startScale(W, H) }, W, H);
    const right = tilePlan(v, W, H, { x: 1, y: 0 }).filter((t) => t.step === 1);
    const left = tilePlan(v, W, H, { x: -1, y: 0 }).filter((t) => t.step === 1);
    const at = (p: typeof right, i: number) => p.findIndex((t) => t.i === i && t.j === 0);
    expect(at(right, 1)).toBeLessThan(at(right, -1));
    expect(at(left, -1)).toBeLessThan(at(left, 1));
  });

  it("가장 멀리 봐도 순서 길이가 한도 안이다 (일꾼이 따라잡을 수 있게)", () => {
    const v = clampView({ cx: 0, cy: 0, scale: minScale(W, H) }, W, H);
    const plan = tilePlan(v, W, H, { x: 1, y: 1 });
    expect(plan.filter((t) => t.step === 1).length).toBeLessThanOrEqual(96);
    expect(plan.length).toBeLessThan(400);
  });
});

describe("46번 염색 판 키 이동", () => {
  it("목표 속도: 화면 px/초 = KEY_PAN_PX (Shift는 FAST배, 대각선도 같은 빠르기)", () => {
    expect(keyTarget(["KeyD"], false)).toEqual({ x: KEY_PAN_PX, y: 0 });
    expect(keyTarget(["KeyA"], true).x).toBeCloseTo(-KEY_PAN_PX * KEY_PAN_FAST);
    const d = keyTarget(["KeyW", "KeyD"], false);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(KEY_PAN_PX);
    expect(keyTarget(["KeyA", "KeyD"], false)).toEqual({ x: 0, y: 0 });
  });

  it("누르면 짧게(~0.3초 안에) 목표 속도에 닿고, 떼면 더 짧게(~0.15초) 멈추며 뗀 뒤 미끄러짐은 10px 남짓", () => {
    let v = { x: 0, y: 0 };
    const t = keyTarget(["KeyD"], false);
    for (let n = 0; n < 18; n++) v = easeVelocity(v, t, 16.7);
    expect(v.x).toBeGreaterThan(KEY_PAN_PX * 0.98);
    let slide = 0;
    for (let n = 0; n < 9; n++) {
      v = easeVelocity(v, { x: 0, y: 0 }, 16.7);
      slide += (v.x * 16.7) / 1000;
    }
    expect(v.x).toBe(0);
    expect(slide).toBeLessThan(12);
  });

  it("프레임 시간이 고르지 않아도 같은 움직임 (8ms 두 번 ≈ 16ms 한 번)", () => {
    const t = { x: KEY_PAN_PX, y: 0 };
    const a = easeVelocity(easeVelocity({ x: 0, y: 0 }, t, 8), t, 8);
    const b = easeVelocity({ x: 0, y: 0 }, t, 16);
    expect(a.x).toBeCloseTo(b.x, 6);
    // NaN·아주 긴 프레임에도 유한
    expect(Number.isFinite(easeVelocity({ x: 0, y: 0 }, t, NaN).x)).toBe(true);
    expect(easeVelocity({ x: 0, y: 0 }, t, 1e9).x).toBeLessThanOrEqual(KEY_PAN_PX);
  });
});

describe("46번 조준점 색 = 서버 판정 색", () => {
  it("여러 화면·흔들림·포인터 자리에서 화면이 보이는 조준점 색과 서버가 같은 좌표로 판정한 색이 같다", () => {
    const seed = "aim-judge";
    for (const tier of [1, 3, 8] as const) {
      const b = buildBoard(seed, tier);
      let v: BoardView = clampView({ cx: DYE_BOARD_W / 2, cy: DYE_BOARD_H / 2, scale: startScale(W, H) }, W, H);
      for (let n = 0; n < 300; n++) {
        v = clampView({ cx: v.cx + ((n * 97) % 41) - 20, cy: v.cy + ((n * 53) % 29) - 14, scale: v.scale }, W, H);
        if (n % 37 === 0) v = zoomAt(v, W, H, W / 2, H / 2, n % 2 ? 1.7 : 0.6);
        const at = n % 3 === 0 ? null : { x: (n * 13) % W, y: (n * 7) % H };
        const a = aimAt(v, W, H, at, 9, n * 0.137);
        const c = cellOf(a.x, a.y);
        // 화면(DyeBoard aimNow)과 서버(finish/timeout → judgeColor)는 같은 좌표를 보고 같은 색
        expect(boardColor(b, c.cx, c.cy)).toBe(judgeColor({ seed, tier }, a.x, a.y));
      }
    }
  });
});

describe("46번 염색 판 타일 기억 수 (11/22 기기 맞춤)", () => {
  it("메모리·화면 크기로 상한을 정한다 (폰은 48장, 메모리 적으면 32장)", () => {
    expect(tileKeep(8, 1920, 1080)).toBe(96);
    expect(tileKeep(undefined, 1440, 900)).toBe(96);
    expect(tileKeep(undefined, 390, 844)).toBe(48);
    expect(tileKeep(4, 1920, 1080)).toBe(48);
    expect(tileKeep(2, 390, 844)).toBe(32);
    expect(tileKeep(NaN, 0, 0)).toBe(96);
  });

  it("상한을 주면 둘레 선명 그림은 가까운 것부터 그만큼만, 보이는 구역은 늘 든다", () => {
    for (const keep of [32, 48]) {
      const v = clampView({ cx: 0, cy: 0, scale: minScale(390, 420) }, 390, 420);
      const plan = tilePlan(v, 390, 420, { x: 0, y: 0 }, keep);
      const vis = visibleChunks(v, 390, 420);
      const full = plan.filter((t) => t.step === 1);
      expect(full.length).toBeLessThanOrEqual(keep);
      for (let j = vis.j0; j <= vis.j1; j++) for (let i = vis.i0; i <= vis.i1; i++) expect(full.some((t) => t.i === i && t.j === j)).toBe(true);
    }
  });
});
