import { SPOT_KINDS, STATE } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { FURNITURE, furnitureById, tierById } from "@/lib/housing/catalog";
import { footprint, SPIN_R0, validateLayout } from "@/lib/housing/layout";
import { roomPlan } from "@/lib/housing/rooms";
import { STATE_MAX, stateTarget } from "@/lib/housing/states";
import type { HouseLayout, Placed } from "@/lib/housing/types";
import { artUp, floorGrid, furnitureGrid, itemVariant, wallCapColor, wallGrid, WALL_H } from "./art";
import { houseSpots, houseTargets, USE_LABEL } from "./interact";

// 11/16 바닷가 세트: 모든 가구가 네 방향 그림을 갖고, 어느 방향으로 놓아도 쓸 수 있다 (사용자 요구)

const SEA = FURNITURE.filter((f) => f.category === "sea");
const F = { ox: 32, oy: 66 };
const small = tierById("small")!;
const plan = roomPlan(small);
/** 장식만 하는 바닷가 가구 (없어야 한다 — 생기면 여기에 이유와 함께 적는다) */
const DECORATIVE: readonly string[] = [];

/** 작은 방 가운데 (현관·벽에서 떨어진 곳) */
const at = (id: string, r: number): Placed => ({ u: "a", i: id, x: 3, y: 2, r });
const lay = (items: Placed[]): HouseLayout => ({ items, floor: "floor_deck", wall: "wall_sea" });

describe("바닷가 세트 그림", () => {
  it("여덟 가지이고 모두 네 방향 가구다", () => {
    expect(SEA.map((f) => f.id).sort()).toEqual(["life_ring", "rattan_bench", "rattan_chair", "sea_hammock", "sea_lantern", "shell_decor", "ship_wheel", "surfboard"]);
    for (const f of SEA) expect(f.spin, f.id).toBe(true);
  });

  it("앞·옆·뒤 그림이 있고 옆모습은 가로·세로 칸이 바뀐다", () => {
    for (const f of SEA) {
      const up = artUp(f.id);
      for (let r = SPIN_R0; r < SPIN_R0 + 4; r++) {
        const v = itemVariant(f.id, "", { r });
        const g = furnitureGrid(f.id, v);
        expect(g, `${f.id} r${r}`).not.toBeNull();
        const fp = footprint(f, r);
        expect(g!.w, `${f.id} r${r} 너비`).toBe(fp.w * 16);
        expect(g!.h, `${f.id} r${r} 높이`).toBe(fp.h * 16 + up);
        // 빈 그림이 아니다
        let filled = 0;
        for (let i = 0; i < g!.px.length; i++) if ((g!.px[i] & 255) > 0) filled++;
        expect(filled, `${f.id} r${r}`).toBeGreaterThan(20);
      }
      // 옆모습·뒷모습은 앞모습과 다르게 그린다
      const front = furnitureGrid(f.id, "")!;
      const back = furnitureGrid(f.id, "d2")!;
      expect([...back.px].join(",") === [...front.px].join(","), `${f.id} 뒷모습`).toBe(false);
    }
  });

  it("뱃등은 켜짐·꺼짐 그림이 다르고, 구명 튜브는 낀 동안 빈 말뚝, 조타륜은 돌아간 장면이 있다", () => {
    const diff = (id: string, a: string, b: string) => [...furnitureGrid(id, a)!.px].join(",") !== [...furnitureGrid(id, b)!.px].join(",");
    expect(diff("sea_lantern", "", "off")).toBe(true);
    expect(diff("sea_lantern", "d1", "off-d1")).toBe(true);
    expect(diff("life_ring", "", "empty")).toBe(true);
    expect(diff("life_ring", "d2", "empty-d2")).toBe(true);
    expect(diff("ship_wheel", "", "turn")).toBe(true);
  });

  it("갑판 마루·하늘색 판자 벽은 제 그림이 있다 (기본 그림으로 떨어지지 않는다)", () => {
    expect([...floorGrid("floor_deck", 0).px].join(",")).not.toBe([...floorGrid("floor_grass", 0).px].join(","));
    expect([...wallGrid("wall_sea", 0).px].join(",")).not.toBe([...wallGrid("wall_fence", 0).px].join(","));
    expect(wallGrid("wall_sea", 1).h).toBe(WALL_H);
    expect(wallCapColor("wall_sea")).not.toBe(wallCapColor("wall_fence"));
  });
});

describe("바닷가 세트 쓰기 (네 방향 모두)", () => {
  it("모든 방향에서 쓸 대상이 있고 안내 문구가 있다", () => {
    for (const f of SEA) {
      if (DECORATIVE.includes(f.id)) continue;
      for (let r = SPIN_R0; r < SPIN_R0 + 4; r++) {
        const t = houseTargets([at(f.id, r)], small, plan, F).filter((x) => x.item === f.id);
        expect(t.length, `${f.id} r${r}`).toBeGreaterThan(0);
        for (const x of t) expect(USE_LABEL[x.use]).toBeTruthy();
      }
    }
  });

  it("해먹은 눕는 자리(집 안 해먹 hammockIn), 라탄 의자는 한 자리, 라탄 벤치는 두 자리 — 어느 방향이든 가구 칸 안", () => {
    for (let r = SPIN_R0; r < SPIN_R0 + 4; r++) {
      const cases: [string, string, number, string][] = [
        ["sea_hammock", "hammockIn", 1, "lie"],
        ["rattan_chair", "chair", 1, "sit"],
        ["rattan_bench", "chair", 2, "sit"],
      ];
      for (const [id, kind, n, use] of cases) {
        const p = at(id, r);
        const s = houseSpots([p], small, F);
        expect(s.length, `${id} r${r}`).toBe(n);
        const fp = footprint(furnitureById(id)!, r);
        for (const x of s) {
          expect(x.kind).toBe(kind);
          expect(x.use).toBe(use);
          expect(x.x).toBeGreaterThanOrEqual(F.ox + p.x * 16);
          expect(x.x).toBeLessThanOrEqual(F.ox + (p.x + fp.w) * 16);
          expect(x.y).toBeGreaterThanOrEqual(F.oy + p.y * 16);
          expect(x.y).toBeLessThanOrEqual(F.oy + (p.y + fp.h) * 16);
        }
        // 두 자리는 서로 다른 id
        expect(new Set(s.map((x) => x.id)).size).toBe(n);
      }
    }
  });

  it("해먹은 마을 해먹 자세: 가로로 걸린 해먹(앞·뒤)은 그대로, 세로(옆모습)는 누운 그림을 90° 돌린다", () => {
    const tilt = (r: number) => houseSpots([at("sea_hammock", r)], small, F)[0].tilt ?? 0;
    expect(tilt(SPIN_R0)).toBe(0);
    expect(tilt(SPIN_R0 + 2)).toBe(0);
    expect(tilt(SPIN_R0 + 1)).toBe(90);
    expect(tilt(SPIN_R0 + 3)).toBe(-90);
    // 집 안 해먹 자리는 방 서버가 해먹 자세(hammock)로 받는 자리
    const s = houseSpots([at("sea_hammock", SPIN_R0)], small, F)[0];
    expect(s.id.startsWith(`${SPOT_KINDS.hammockIn.code}_`)).toBe(true);
    expect(SPOT_KINDS.hammockIn).toMatchObject({ state: STATE.hammock, indoor: true });
  });

  it("서서 쓰는 가구: 서핑보드·소라·구명 튜브·조타륜·뱃등", () => {
    const use = (id: string) => houseTargets([at(id, SPIN_R0)], small, plan, F).find((x) => x.item === id)?.use;
    expect(use("surfboard")).toBe("surf");
    expect(use("shell_decor")).toBe("shell");
    expect(use("life_ring")).toBe("ring");
    expect(use("ship_wheel")).toBe("wheel");
    expect(use("sea_lantern")).toBe("light");
  });

  it("뱃등 켜고 끈 상태는 석등처럼 저장된다 (배치 서명)", () => {
    expect(STATE_MAX.sea_lantern).toBe(1);
    const p = at("sea_lantern", SPIN_R0 + 1);
    expect(stateTarget(lay([p]), "small", "a")).toEqual({ s: `sea_lantern:${p.x}:${p.y}:${p.r}`, max: 1 });
  });

  it("작은 방에 어느 방향으로 놓아도 배치 검사를 통과한다", () => {
    for (const f of SEA)
      for (let r = SPIN_R0; r < SPIN_R0 + 4; r++) {
        const owned = { [f.id]: 1, floor_deck: 1, wall_sea: 1 };
        const v = validateLayout(lay([at(f.id, r)]), "small", owned);
        expect(v.ok, `${f.id} r${r} ${v.ok ? "" : v.message}`).toBe(true);
      }
  });
});
