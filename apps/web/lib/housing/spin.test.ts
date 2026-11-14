import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { houseSpots, itemDepthY } from "@/game/housing/interact";
import { FURNITURE, furnitureById, tierById } from "./catalog";
import { footprint, nextRotation, SPIN_R0, spinDir, validateLayout } from "./layout";
import { LayoutSchema } from "./schemas";
import type { HouseLayout, Placed } from "./types";

// 4방향 가구(spin): 배치 r 4~7 = 방향. 예전에 저장된 r 0~3(앞모습, 홀수 = 좌우 뒤집기)은 그대로 읽힌다

const lay = (items: Placed[]): HouseLayout => ({ items, floor: "floor_grass", wall: "wall_fence" });
const F = { ox: 32, oy: 66 };
const small = tierById("small")!;

describe("4방향 가구: 방향 값과 칸", () => {
  it("대상 가구는 침대·의자·피아노·모니터 책상 등이고, 둥근 물건·벽에 붙는 물건은 빠진다", () => {
    const spin = FURNITURE.filter((f) => f.spin).map((f) => f.id);
    expect(spin).toEqual(expect.arrayContaining(["bed", "chair", "piano", "monitor_desk", "fridge", "radio"]));
    for (const id of ["pot", "stone_lantern", "bookshelf", "fireplace", "whiteboard", "pond", "desk"]) expect(spin).not.toContain(id);
    // 돌리기(turn)와 4방향(spin)을 같이 가진 물건은 없다
    expect(FURNITURE.filter((f) => f.turn && f.spin)).toEqual([]);
  });

  it("예전 값(0~3)은 앞모습 칸 그대로, 옆을 보는 방향(5·7)만 가로·세로가 바뀐다", () => {
    const piano = furnitureById("piano")!;
    for (const r of [0, 1, 2, 3, 4, 6]) expect(footprint(piano, r)).toEqual({ w: 2, h: 1 });
    for (const r of [5, 7]) expect(footprint(piano, r)).toEqual({ w: 1, h: 2 });
    expect([0, 1, 2, 3].map(spinDir)).toEqual([0, 0, 0, 0]);
    expect([4, 5, 6, 7].map(spinDir)).toEqual([0, 1, 2, 3]);
  });

  it("돌리기: 4방향 가구는 앞→왼쪽→뒤→오른쪽→앞, 예전 값(뒤집힌 앞모습)이면 왼쪽부터. 다른 물건은 예전대로", () => {
    const chair = furnitureById("chair")!;
    expect(nextRotation(chair, 0)).toBe(SPIN_R0 + 1);
    expect(nextRotation(chair, 1)).toBe(SPIN_R0 + 1);
    expect([4, 5, 6, 7].map((r) => nextRotation(chair, r))).toEqual([5, 6, 7, 4]);
    expect(nextRotation(furnitureById("desk")!, 3)).toBe(0);
    expect(nextRotation(furnitureById("bookshelf")!, 1)).toBe(2);
  });

  it("서버 검증: 옛 배치(r 0~3)는 그대로 통과, 4~7은 4방향 가구만", () => {
    // 예전에 저장된 배치 (뒤집은 의자·침대·피아노)
    const old = lay([
      { u: "c1", i: "chair", x: 0, y: 0, r: 1 },
      { u: "b1", i: "bed", x: 2, y: 0, r: 3 },
      { u: "p1", i: "piano", x: 5, y: 0, r: 1 },
    ]);
    expect(validateLayout(old, "small", null).ok).toBe(true);
    expect(LayoutSchema.safeParse({ ch: 1, tier: "small", layout: old }).success).toBe(true);
    // 옆을 보는 피아노는 1×2 칸
    const side = lay([{ u: "p1", i: "piano", x: 0, y: 0, r: 5 }]);
    expect(validateLayout(side, "small", null).ok).toBe(true);
    expect(LayoutSchema.safeParse({ ch: 1, tier: "small", layout: side }).success).toBe(true);
    // 4방향이 아닌 물건에 방향 값 → 거절
    const bad = validateLayout(lay([{ u: "s1", i: "bookshelf", x: 0, y: 0, r: 5 }]), "small", null);
    expect(bad.ok).toBe(false);
    expect(validateLayout(lay([{ u: "c1", i: "chair", x: 0, y: 0, r: 8 }]), "small", null).ok).toBe(false);
    expect(LayoutSchema.safeParse({ ch: 1, tier: "small", layout: lay([{ u: "c1", i: "chair", x: 0, y: 0, r: 8 }]) }).success).toBe(false);
    // 옆을 보면 칸이 바뀌어 겹침 판정도 바뀐다 (1×2 피아노 아래 칸에 의자)
    const clash = lay([
      { u: "p1", i: "piano", x: 0, y: 0, r: 5 },
      { u: "c1", i: "chair", x: 0, y: 1, r: 0 },
    ]);
    expect(validateLayout(clash, "small", null).ok).toBe(false);
  });
});

describe("4방향 가구: 앉기·눕기 방향", () => {
  it("옛 의자(r 0~3)는 예전처럼 아래를 보고 앉고, 돌린 의자는 그 방향을 본다", () => {
    for (const r of [0, 1]) expect(houseSpots([{ u: "c1", i: "chair", x: 3, y: 3, r }], small, F)[0].facing).toBe(DIR.down);
    const face = [4, 5, 6, 7].map((r) => houseSpots([{ u: "c1", i: "chair", x: 3, y: 3, r }], small, F)[0].facing);
    expect(face).toEqual([DIR.down, DIR.left, DIR.up, DIR.right]);
  });

  it("돌린 의자 바로 앞에 책상이 있으면 그 책상에서 일한다 (왼쪽을 보는 의자 + 왼쪽 책상)", () => {
    const items: Placed[] = [
      { u: "d1", i: "desk", x: 1, y: 3, r: 0 },
      { u: "c1", i: "chair", x: 3, y: 3, r: SPIN_R0 + 1 },
    ];
    const s = houseSpots(items, small, F).find((x) => x.u === "c1")!;
    expect(s.use).toBe("type");
    expect(s.facing).toBe(DIR.left);
  });

  it("뒤돌아 앉은 의자는 등받이가 사람 앞에 그려진다", () => {
    const p: Placed = { u: "c1", i: "chair", x: 3, y: 3, r: SPIN_R0 + 2 };
    const def = furnitureById("chair")!;
    const spots = houseSpots([p], small, F);
    expect(spots[0].behind).toBe(true);
    expect(itemDepthY(p, def, spots, F)).toBeGreaterThan(spots[0].y);
  });

  it("돌린 침대는 누운 자세를 침대 방향대로 기울이고, 발은 침대 안이다", () => {
    const tilts = [4, 5, 6, 7].map((r) => {
      const s = houseSpots([{ u: "b1", i: "bed", x: 2, y: 2, r }], small, F)[0];
      const L = F.ox + 2 * 16;
      const Tp = F.oy + 2 * 16;
      expect(s.x).toBeGreaterThanOrEqual(L);
      expect(s.x).toBeLessThanOrEqual(L + 32);
      expect(s.y).toBeGreaterThanOrEqual(Tp);
      expect(s.y).toBeLessThanOrEqual(Tp + 32);
      return s.tilt ?? 0;
    });
    expect(tilts).toEqual([0, 90, 180, -90]);
    // 옛 침대(r 1 = 뒤집기)는 예전 자리 그대로
    const old = houseSpots([{ u: "b1", i: "bed", x: 2, y: 2, r: 1 }], small, F)[0];
    expect(old.tilt ?? 0).toBe(0);
    expect(old.y).toBe(F.oy + 2 * 16 + 20);
  });

  it("피아노는 건반 쪽 앞에 앉는다 (왼쪽을 보면 피아노 왼쪽 칸에서 오른쪽을 보고)", () => {
    const s = houseSpots([{ u: "p1", i: "piano", x: 3, y: 2, r: SPIN_R0 + 1 }], small, F)[0];
    expect(s.use).toBe("piano");
    expect(s.facing).toBe(DIR.right);
    expect(s.x).toBeLessThan(F.ox + 3 * 16);
    const back = houseSpots([{ u: "p1", i: "piano", x: 3, y: 2, r: SPIN_R0 + 2 }], small, F)[0];
    expect(back.facing).toBe(DIR.down);
    expect(back.y).toBeLessThan(F.oy + 2 * 16);
  });
});
