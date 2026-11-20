import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { FURNITURE, furnitureById, tierById } from "@/lib/housing/catalog";
import { buildOccupancy, footprint, nextRotation, SPIN_R0 } from "@/lib/housing/layout";
import { roomPlan } from "@/lib/housing/rooms";
import { buyFurniture } from "@/lib/housing/service";
import { MemoryHouseStore } from "@/lib/housing/store";
import type { Placed } from "@/lib/housing/types";
import { artUp, furnitureGrid, itemVariant, shownItemGrid } from "./art";
import { BREED_FURN_IDS, BREED_FURN_UP, isBreedFurniture, isCatFurniture } from "./breedFurnitureArt";
import { BODY_HALF_W, houseTargets, seasonStandSpot, USE_LABEL } from "./interact";

// 11/19 멍냥 분양소 품종 펫 가구 12종 + 기존 고양이 쿠션·잠자는 강아지·잠든 유령 고양이:
// 네 방향으로 돌고, 쓰다듬을 때 캐릭터가 돌린 앞쪽(위쪽은 마지막)에 서서 펫을 바라보며, 몸이 펫 그림을 가로 25% 넘게 덮지 않는다.

const BREED = FURNITURE.filter((f) => f.petShop);
const OLD = ["cat_cushion", "sleepy_dog", "ghost_cat"];
const F = { ox: 32, oy: 66 };
const T = 16;
const small = tierById("small")!;
const plan = roomPlan(small);
const at = (id: string, r: number, x = 3, y = 3, u = "a"): Placed => ({ u, i: id, x, y, r });
const px = (id: string, v: string) => [...furnitureGrid(id, v)!.px].join(",");
const boxOf = (p: Placed) => {
  const fp = footprint(furnitureById(p.i)!, p.r);
  const L = F.ox + p.x * T;
  const Tp = F.oy + p.y * T;
  return { L, Tp, R: L + fp.w * T, B: Tp + fp.h * T };
};

describe("품종 펫 가구 카탈로그", () => {
  it("12종, 값·점수는 시안 표 그대로 (점수 = 값 ÷ 20), 1×1 네 방향, 생활 갈래, 분양소 전용", () => {
    const want: Record<string, [number, string]> = {
      nap_cheese: [200, "쓰다듬기"],
      nap_godeung: [200, "쓰다듬기"],
      nap_tuxedo: [220, "쓰다듬기"],
      nap_calico: [260, "쓰다듬기"],
      nap_russian: [260, "쓰다듬기"],
      nap_siamese: [260, "말 걸기"],
      nap_shiba: [240, "쓰다듬기"],
      nap_jindo: [240, "손!"],
      nap_corgi: [260, "쓰다듬기"],
      nap_pom: [220, "쓰다듬기"],
      nap_bichon: [240, "쓰다듬기"],
      nap_dachs: [220, "쓰다듬기"],
    };
    expect(BREED.map((f) => f.id).sort()).toEqual(Object.keys(want).sort());
    expect([...BREED_FURN_IDS].sort()).toEqual(Object.keys(want).sort());
    for (const f of BREED) {
      expect([f.price, f.use], f.id).toEqual(want[f.id]);
      expect(f.score, f.id).toBe(f.price / 20);
      expect([f.w, f.h, f.spin, f.category, f.petShop], f.id).toEqual([1, 1, true, "living", "mungnyang"]);
      expect(artUp(f.id), f.id).toBe(BREED_FURN_UP);
    }
    expect(BREED.filter((f) => isCatFurniture(f.id)).length).toBe(6);
  });

  it("가구점에서는 못 사고 분양소(한정 판매 인자)로만 산다", async () => {
    const store = new MemoryHouseStore();
    await expect(buyFurniture(store, "acc", "nap_corgi")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    // 한정 판매 인자 true면 판매 규칙 검사를 지나 집 확인으로 넘어간다 (집이 없어서 막힘 = 분양소 전용 검사는 통과)
    await expect(buyFurniture(store, "acc", "nap_corgi", 0, "village", true)).rejects.not.toMatchObject({ message: expect.stringContaining("멍냥 분양소") });
  });
});

describe("네 방향 그림", () => {
  it("품종 가구: 앞·옆·뒤가 서로 다르고, 오른쪽은 옆을 뒤집은 그림, 숨·하품·쓰다듬기 장면이 기본과 다르다", () => {
    for (const f of BREED) {
      const front = px(f.id, itemVariant(f.id, "", { r: SPIN_R0 }));
      const side = px(f.id, itemVariant(f.id, "", { r: SPIN_R0 + 1 }));
      const back = px(f.id, itemVariant(f.id, "", { r: SPIN_R0 + 2 }));
      expect(new Set([front, side, back]).size, f.id).toBe(3);
      expect([...shownItemGrid(f.id, SPIN_R0 + 3, itemVariant(f.id, "", { r: SPIN_R0 + 3 }))!.px].join(","), f.id).toBe([...furnitureGrid(f.id, "d1")!.mirrored().px].join(","));
      for (const r of [0, 1, 2, 3]) {
        const v = (base: string) => itemVariant(f.id, base, { r: SPIN_R0 + r });
        for (const base of ["b1", "p1", "p2"]) expect(px(f.id, v(base)), `${f.id} r${r} ${base}`).not.toBe(px(f.id, v("")));
        if (r !== 2) expect(px(f.id, v("y1")), `${f.id} r${r} y1`).not.toBe(px(f.id, v("")));
      }
      expect(furnitureGrid(f.id, "")!.h).toBe(16 + BREED_FURN_UP);
    }
  });

  it("기존 잠자는 강아지·유령 고양이도 네 방향 (예전 회전값 0~3은 앞모습 그대로 · 0은 뒤집지 않음), 강아지는 옆·뒤도 숨·꼬리", () => {
    for (const id of OLD) {
      const def = furnitureById(id)!;
      expect(def.spin, id).toBe(true);
      const front = px(id, itemVariant(id, "", { r: 0 }));
      expect(px(id, itemVariant(id, "", { r: SPIN_R0 })), id).toBe(front);
      expect([...shownItemGrid(id, 0)!.px].join(","), id).toBe(front);
      const side = px(id, itemVariant(id, "", { r: SPIN_R0 + 1 }));
      const back = px(id, itemVariant(id, "", { r: SPIN_R0 + 2 }));
      expect(new Set([front, side, back]).size, id).toBe(3);
      // R 한 번 = 다음 방향 (예전 값이면 앞에서 시작)
      expect(nextRotation(def, 0), id).toBe(SPIN_R0 + 1);
    }
    for (const r of [1, 2]) {
      const v = (b: string) => itemVariant("sleepy_dog", b, { r: SPIN_R0 + r });
      expect(px("sleepy_dog", v("b1")), `r${r}`).not.toBe(px("sleepy_dog", v("")));
      expect(px("sleepy_dog", v("wag")), `r${r}`).not.toBe(px("sleepy_dog", v("")));
    }
  });
});

describe("쓰다듬을 때 서는 자리 (시즌 가구와 같은 규칙)", () => {
  const want = [
    { facing: DIR.up, side: 0 },
    { facing: DIR.right, side: 1 },
    { facing: DIR.right, side: 1 }, // 뒤(위)를 보면 위쪽은 마지막 수단 → 옆
    { facing: DIR.left, side: 3 },
  ];
  it("모든 방향: 펫을 바라보고, 몸이 펫 그림을 가로 25% 넘게 덮지 않고, 쓸 수 있는 거리 안", () => {
    for (const id of [...BREED.map((f) => f.id), ...OLD]) {
      expect(USE_LABEL[houseTargets([at(id, SPIN_R0)], small, plan, F)[0].use], id).toBeTruthy();
      for (let d = 0; d < 4; d++) {
        const p = at(id, SPIN_R0 + d);
        const t = houseTargets([p], small, plan, F).find((x) => x.u === "a")!;
        expect(t.use, id).toBe(isBreedFurniture(id) ? "breed" : id === "sleepy_dog" ? "dog" : "pet");
        const s = t.stand!;
        expect(s, `${id} d${d}`).toBeTruthy();
        expect([s.facing, s.side], `${id} d${d}`).toEqual([want[d].facing, want[d].side]);
        const b = boxOf(p);
        if (d === 0) expect(s.y).toBeGreaterThan(b.B);
        if (d === 1 || d === 2) expect(s.x).toBeLessThan(b.L);
        if (d === 3) expect(s.x).toBeGreaterThan(b.R);
        // 바라보는 쪽에 펫이 있다
        const cx = (b.L + b.R) / 2;
        const cy = (b.Tp + b.B) / 2;
        if (s.facing === DIR.up) expect(cy).toBeLessThan(s.y);
        if (s.facing === DIR.right) expect(cx).toBeGreaterThan(s.x);
        if (s.facing === DIR.left) expect(cx).toBeLessThan(s.x);
        const cover = Math.max(0, Math.min(s.x + BODY_HALF_W, b.R) - Math.max(s.x - BODY_HALF_W, b.L));
        expect(cover / (b.R - b.L), `${id} d${d} 겹침`).toBeLessThanOrEqual(0.25);
        const dx = Math.max(b.L - s.x, s.x - b.R, 0);
        const dy = Math.max(b.Tp - s.y, s.y - b.B, 0);
        expect(Math.hypot(dx, dy), `${id} d${d}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("예전 회전값(0) 고양이 쿠션·강아지도 앞에 선다, 앞이 막히면 옆, 위쪽은 다 막혔을 때만, 네 쪽 다 막히면 제자리(null)", () => {
    for (const id of OLD) expect(houseTargets([at(id, 0)], small, plan, F)[0].stand?.side, id).toBe(0);
    const pet = at("nap_shiba", SPIN_R0);
    const pot = (x: number, y: number, u: string) => at("pot", 0, x, y, u);
    // 앞(아래) 칸이 막힘 → 옆
    expect(seasonStandSpot(pet, buildOccupancy([pet, pot(3, 4, "b")], small), small, F)!.side).toBe(1);
    // 앞·왼쪽·오른쪽 막힘 → 위쪽 (마지막 수단, 아래를 본다)
    const s = seasonStandSpot(pet, buildOccupancy([pet, pot(3, 4, "b"), pot(2, 3, "c"), pot(4, 3, "d")], small), small, F)!;
    expect([s.side, s.facing]).toEqual([2, DIR.down]);
    expect(seasonStandSpot(pet, buildOccupancy([pet, pot(3, 4, "b"), pot(2, 3, "c"), pot(4, 3, "d"), pot(3, 2, "e")], small), small, F)).toBeNull();
  });
});

describe("11/20 옆모습이 칸 끝에 붙어 잘려 보이지 않는다 (사용자 「가구를 옆으로 돌리면 잘린다」)", () => {
  // 방석·바구니(위에서 내려다본 모양)는 어느 방향이든 같은 자리라, 앞모습에서 양끝 열이 처음 칠해지는 줄 = 잠자리 윗줄.
  // 그보다 위(펫만 있는 줄)에서는 옆모습도 양끝 열이 비어 있어야 한다 (예전엔 개 코끝·앞발이 x 0, 꼬리가 x 15에 닿았다)
  const solid = (g: { px: Uint32Array; w: number }, x: number, y: number) => (g.px[y * g.w + x] & 255) === 255;
  it("품종 가구 12종: 옆모습(숨·하품 장면 포함)은 잠자리 위로 양끝 열이 비어 있다", () => {
    for (const f of BREED)
      for (const extra of ["", "b1", "y1"]) {
        const front = furnitureGrid(f.id, itemVariant(f.id, extra, { r: SPIN_R0 }))!;
        const side = furnitureGrid(f.id, itemVariant(f.id, extra, { r: SPIN_R0 + 1 }))!;
        let bedTop = front.h;
        for (let y = 0; y < front.h && bedTop === front.h; y++) if (solid(front, 0, y) || solid(front, front.w - 1, y)) bedTop = y;
        for (let y = 0; y < bedTop; y++) for (const x of [0, side.w - 1]) expect(solid(side, x, y), `${f.id} ${extra} ${x},${y}`).toBe(false);
      }
  });
});
