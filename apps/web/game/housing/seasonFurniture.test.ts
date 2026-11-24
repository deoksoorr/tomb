import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { FURNITURE, furnitureById, SPECIAL_FURNITURE_PRICE_MUL, tierById } from "@/lib/housing/catalog";
import { buildOccupancy, footprint, nextRotation, SPIN_R0, validateLayout } from "@/lib/housing/layout";
import { roomPlan } from "@/lib/housing/rooms";
import { buyFurniture } from "@/lib/housing/service";
import { STATE_MAX } from "@/lib/housing/states";
import { MemoryHouseStore } from "@/lib/housing/store";
import type { HouseLayout, Placed } from "@/lib/housing/types";
import { EMOTE_ICONS } from "../sprites/emotes";
import { artUp, furnitureGrid, itemVariant } from "./art";
import { BODY_HALF_W, houseSpots, houseTargets, rugSeat, seasonStandSpot, USE_LABEL } from "./interact";
import { SEASON_FX, SEASON_LIGHTS } from "./seasonUse";

// 11/19 시즌 가구 (가구 보따리상 한정 24점): 모두 네 방향으로 돌고(러그는 90°씩), 어느 방향이든 쓸 때 캐릭터가
// 가구 앞(돌린 앞쪽)에 서서 가구를 바라보거나 맞는 자리에 앉는다 (사용자 요구)

const SEASON = FURNITURE.filter((f) => f.category === "season");
const F = { ox: 32, oy: 66 };
const T = 16;
const small = tierById("small")!;
const wide = tierById("wide")!;
const plan = roomPlan(small);
const at = (id: string, r: number, x = 3, y = 3): Placed => ({ u: "a", i: id, x, y, r });
const lay = (items: Placed[]): HouseLayout => ({ items, floor: "floor_grass", wall: "wall_fence" });
const px = (id: string, v: string) => [...furnitureGrid(id, v)!.px].join(",");
/** 이 방향 r의 가구 상자 (월드 px) */
const boxOf = (p: Placed) => {
  const fp = footprint(furnitureById(p.i)!, p.r);
  const L = F.ox + p.x * T;
  const Tp = F.oy + p.y * T;
  return { L, Tp, R: L + fp.w * T, B: Tp + fp.h * T };
};

describe("시즌 가구 카탈로그", () => {
  it("네 묶음 × 여섯 점, 값·점수·크기는 시안 표 그대로 (점수 = 값 ÷ 20)", () => {
    expect(SEASON.length).toBe(24);
    for (const w of ["w1", "w2", "w3", "w4"]) expect(SEASON.filter((f) => f.seasonWeek === w).length, w).toBe(6);
    for (const f of SEASON) {
      // 11/20 시즌 가구는 시안 표 값의 2배 (SPECIAL_FURNITURE_PRICE_MUL), 점수는 표 값 ÷ 20 그대로
      expect(f.price, f.id).toBeGreaterThanOrEqual(120 * SPECIAL_FURNITURE_PRICE_MUL);
      expect(f.price, f.id).toBeLessThanOrEqual(420 * SPECIAL_FURNITURE_PRICE_MUL);
      expect(f.score, f.id).toBe(f.price / SPECIAL_FURNITURE_PRICE_MUL / 20);
      expect(f.use, f.id).toBeTruthy();
    }
    expect(furnitureById("stocking_fireplace")).toMatchObject({ w: 2, h: 1, price: 840, score: 21 });
    expect(furnitureById("knit_rug")).toMatchObject({ w: 3, h: 2, floor: true, turn: true });
  });

  it("러그·눈꽃 창가만 빼고 모두 네 방향 가구(spin), 러그는 90°씩 돌리는 바닥 물건, 눈꽃 창가는 벽 창문 모양 (11/24)", () => {
    for (const f of SEASON) {
      if (f.id === "knit_rug" || f.id === "frost_window") expect(f.spin).toBeUndefined();
      else expect(f.spin, f.id).toBe(true);
    }
    expect(furnitureById("frost_window")!.skin).toBe("window");
  });

  it("다른 갈래에는 seasonWeek가 없고, 가구점에서는 살 수 없다 (보따리상 판매만)", async () => {
    expect(FURNITURE.filter((f) => f.seasonWeek && f.category !== "season")).toEqual([]);
    const store = new MemoryHouseStore();
    await expect(buyFurniture(store, "acc1", "xmas_tree")).rejects.toMatchObject({ message: expect.stringContaining("보따리상") });
    // 한정 장터 판매(보따리상 — lib/seasonShop이 ghostSale = true로 부른다)면 이 막음은 지나간다 (집이 없어 다음 단계에서 막힌다)
    await expect(buyFurniture(store, "acc1", "xmas_tree", 0, "village", true)).rejects.not.toMatchObject({ message: expect.stringContaining("보따리상") });
  });

  it("불빛 가구는 처음부터 켜져 있고 꺼짐이 저장된다 (석등과 같은 규칙)", () => {
    const lights = SEASON.filter((f) => f.light).map((f) => f.id);
    expect(lights.sort()).toEqual(["cake_table", "cheongsa_lantern", "disco_ball", "karaoke", "stocking_fireplace", "winter_stove", "xmas_tree"]);
    // 노래방 기계는 화면이 늘 켜져 있고 E는 노래 부르기
    for (const id of lights.filter((x) => x !== "karaoke")) {
      expect(STATE_MAX[id], id).toBe(1);
      expect(SEASON_LIGHTS.has(id), id).toBe(true);
    }
  });
});

describe("시즌 가구 그림: 네 방향", () => {
  it.each(SEASON.map((f) => [f.id]))("%s: 네 방향 모두 칸 크기에 맞는 그림이고, 서로 다른 모습", (id) => {
    const f = furnitureById(id)!;
    const up = artUp(id);
    const looks = new Set<string>();
    let r = 0;
    for (let i = 0; i < 4; i++) {
      r = nextRotation(f, r);
      const v = itemVariant(id, "", { r });
      const g = furnitureGrid(id, v)!;
      const fp = footprint(f, r);
      if (!f.turn) {
        // 4방향 가구: 그림 크기 = 돌린 칸 + 솟는 높이 (옆을 보면 가로·세로가 바뀐다)
        expect(g.w, `${id} r${r}`).toBe(fp.w * T);
        expect(g.h, `${id} r${r}`).toBe(fp.h * T + up);
      }
      let filled = 0;
      for (let k = 0; k < g.px.length; k++) if ((g.px[k] & 255) > 0) filled++;
      expect(filled, `${id} r${r}`).toBeGreaterThan(40);
      // 오른쪽을 보는 모습은 옆모습을 뒤집어 쓴다 (집 장면 placeView) — 그 뒤집힌 그림까지 넣어 비교
      looks.add(r === SPIN_R0 + 3 ? [...g.mirrored().px].join(",") : [...g.px].join(","));
    }
    if (f.spin) expect(looks.size, id).toBe(4);
  });

  it("불빛 가구는 네 방향 모두 켜짐·꺼짐 그림이 다르다", () => {
    for (const id of ["winter_stove", "xmas_tree", "stocking_fireplace", "cake_table", "disco_ball", "cheongsa_lantern"])
      for (const d of ["", "d1"]) expect(px(id, d) !== px(id, ["off", d].filter(Boolean).join("-")), `${id} ${d}`).toBe(true);
  });

  it("써 보기 그림(잠깐 바뀌는 그림)은 앞모습과 다르고, 연출 이모티콘이 모두 있다", () => {
    for (const [id, fx] of Object.entries(SEASON_FX)) {
      expect(furnitureById(id), id).toBeTruthy();
      if (fx.v) expect(px(id, fx.v) !== px(id, ""), `${id} ${fx.v}`).toBe(true);
      if (fx.emote) expect(EMOTE_ICONS, id).toContain(fx.emote);
      expect(fx.lines?.length ?? 0, id).toBeGreaterThan(0);
    }
  });
});

describe("시즌 가구 쓰기: 서서 쓰는 가구는 돌린 앞쪽에 서서 바라본다", () => {
  // 11/24 눈꽃 창가는 바닥에 놓지 않는다 (벽 창문 모양)
  const placeable = SEASON.filter((f) => f.skin !== "window");
  const standers = placeable.filter((f) => !f.floor && f.id !== "party_sofa");

  it("모든 가구·모든 방향에서 쓸 대상과 안내가 있다", () => {
    for (const f of placeable)
      for (let r = SPIN_R0; r < SPIN_R0 + 4; r++) {
        const rr = f.turn ? r - SPIN_R0 : r;
        const t = houseTargets([at(f.id, rr)], small, plan, F).filter((x) => x.item === f.id);
        expect(t.length, `${f.id} r${rr}`).toBeGreaterThan(0);
        for (const x of t) expect(USE_LABEL[x.use], `${f.id}`).toBeTruthy();
      }
  });

  it.each(standers.map((f) => [f.id]))("%s: 방이 비어 있으면 네 방향 모두 가구 옆·비스듬한 앞에서 가구를 바라본다 (위쪽 뒤에는 서지 않는다)", (id) => {
    // 뒤(위)를 보는 가구는 위에 서면 몸이 가구에 가려지므로 왼쪽 옆에서 오른쪽(가구)을 본다
    const want = [
      { facing: DIR.up, where: "아래" },
      { facing: DIR.right, where: "왼쪽" },
      { facing: DIR.right, where: "왼쪽" },
      { facing: DIR.left, where: "오른쪽" },
    ];
    for (let d = 0; d < 4; d++) {
      const p = at(id, SPIN_R0 + d);
      const t = houseTargets([p], small, plan, F).find((x) => x.u === "a")!;
      const s = t.stand!;
      expect(s, `${id} d${d}`).toBeTruthy();
      expect(s.facing, `${id} d${d}`).toBe(want[d].facing);
      const b = boxOf(p);
      // 발이 가구 칸 밖 (앞은 아래, 옆은 그 옆)
      if (d === 0) expect(s.y).toBeGreaterThan(b.B);
      if (d === 1 || d === 2) expect(s.x).toBeLessThan(b.L);
      if (d === 3) expect(s.x).toBeGreaterThan(b.R);
      if (d !== 0) {
        expect(s.y).toBeGreaterThan(b.Tp);
        expect(s.y).toBeLessThan(b.B);
      }
      // 캐릭터 몸 그림이 가구 그림을 가로로 25% 넘게 덮지 않는다 (가구가 거의 다 보인다)
      const cover = Math.max(0, Math.min(s.x + BODY_HALF_W, b.R) - Math.max(s.x - BODY_HALF_W, b.L));
      expect(cover / (b.R - b.L), `${id} d${d} 겹침`).toBeLessThanOrEqual(0.25);
      // 쓸 수 있는 거리 안 (E를 누른 자리에서 크게 순간이동하지 않는다)
      const dx = Math.max(b.L - s.x, s.x - b.R, 0);
      const dy = Math.max(b.Tp - s.y, s.y - b.B, 0);
      expect(Math.hypot(dx, dy), `${id} d${d}`).toBeLessThanOrEqual(8);
    }
  });

  it("앞이 막히면(벽·다른 가구) 옆, 옆도 막히면 뒤 — 설 자리는 늘 빈 칸이고 집 안", () => {
    // 맨 위 줄에서 위(벽)를 보는 트리: 위는 벽 → 왼쪽·오른쪽 옆 중 하나
    const top = at("xmas_tree", SPIN_R0 + 2, 3, 0);
    const s1 = seasonStandSpot(top, buildOccupancy([top], small), small, F)!;
    expect([DIR.right, DIR.left]).toContain(s1.facing);
    expect(s1.y).toBeGreaterThanOrEqual(F.oy);
    // 비스듬한 앞자리: 왼쪽 앞 칸이 막혔으면 오른쪽 앞
    const n0 = at("nutcracker", SPIN_R0, 3, 2);
    const lpot: Placed = { u: "lp", i: "pot", x: 2, y: 3, r: 0 };
    const s0 = seasonStandSpot(n0, buildOccupancy([n0, lpot], small), small, F)!;
    expect(s0.side).toBe(0);
    expect(s0.x).toBeGreaterThan(F.ox + 4 * T);
    // 비스듬한 앞자리 두 칸이 다 막혔으면 앞은 건너뛰고 옆
    const rpot: Placed = { u: "rp", i: "pot", x: 4, y: 3, r: 0 };
    expect(seasonStandSpot(n0, buildOccupancy([n0, lpot, rpot], small), small, F)!.side).toBe(1);
    // 앞에 의자 → 옆으로
    const tree = at("nutcracker", SPIN_R0, 3, 2);
    const chair: Placed = { u: "c", i: "chair", x: 3, y: 3, r: 0 };
    const s2 = seasonStandSpot(tree, buildOccupancy([tree, chair], small), small, F)!;
    expect(s2.side).not.toBe(0);
    // 앞·왼쪽·오른쪽 모두 막히면 뒤
    const l: Placed = { u: "l", i: "pot", x: 2, y: 2, r: 0 };
    const rr: Placed = { u: "r", i: "pot", x: 4, y: 2, r: 0 };
    const s3 = seasonStandSpot(tree, buildOccupancy([tree, chair, l, rr], small), small, F)!;
    expect(s3.side).toBe(2);
    expect(s3.facing).toBe(DIR.down);
    // 네 쪽 다 막히면 설 자리 없음 (선 자리에서 바라보기만)
    const b: Placed = { u: "b", i: "pot", x: 3, y: 1, r: 0 };
    expect(seasonStandSpot(tree, buildOccupancy([tree, chair, l, rr, b], small), small, F)).toBeNull();
    // 앞 칸에 러그(바닥 물건)만 있으면 그 위에 서도 된다
    const rug: Placed = { u: "g", i: "rug", x: 2, y: 3, r: 0 };
    expect(seasonStandSpot(tree, buildOccupancy([tree, rug], small), small, F)!.side).toBe(0);
  });

  it("2칸 가구가 옆을 보면 1×2 칸 옆 가운데에 선다, 앞쪽 두 칸 중 하나라도 막히면 다른 쪽", () => {
    const fp = at("stocking_fireplace", SPIN_R0 + 1, 3, 2);
    const s = seasonStandSpot(fp, buildOccupancy([fp], small), small, F)!;
    expect(s.facing).toBe(DIR.right);
    expect(s.y).toBe(F.oy + 2 * T + T + 4);
    const front = at("stocking_fireplace", SPIN_R0, 3, 2);
    const pot: Placed = { u: "p", i: "pot", x: 4, y: 3, r: 0 };
    expect(seasonStandSpot(front, buildOccupancy([front, pot], small), small, F)!.side).not.toBe(0);
  });

  it("칸막이 벽 너머 칸에는 서지 않는다 (넓은 터)", () => {
    const wp = roomPlan(wide);
    const px0 = wp.partitions[0]?.x;
    if (px0 === undefined) return;
    // 벽 바로 왼쪽 칸에서 오른쪽을 보는 초롱: 오른쪽(벽 너머)이 아니라 다른 쪽
    const lan = at("cheongsa_lantern", SPIN_R0 + 3, px0 - 1, 4);
    const s = seasonStandSpot(lan, buildOccupancy([lan], wide), wide, F)!;
    expect(s.side).not.toBe(3);
    expect(s.x).toBeLessThan(F.ox + px0 * T);
  });

  it("옛 배치 값(r 0~3, 앞모습)은 앞에 선다", () => {
    for (const r of [0, 1]) expect(houseTargets([at("karaoke", r)], small, plan, F)[0].stand?.facing).toBe(DIR.up);
  });
});

describe("시즌 가구 앉기: 파티 소파 두 자리 · 니트 러그", () => {
  it("파티 소파: 네 방향 모두 두 자리, 소파가 보는 쪽을 보고 소파 칸 안에 앉는다. 뒤를 보면 등받이가 사람 앞", () => {
    const face = [DIR.down, DIR.left, DIR.up, DIR.right];
    for (let d = 0; d < 4; d++) {
      const p = at("party_sofa", SPIN_R0 + d);
      const spots = houseSpots([p], small, F);
      expect(spots.length, `d${d}`).toBe(2);
      const b = boxOf(p);
      for (const s of spots) {
        expect(s.facing, `d${d}`).toBe(face[d]);
        expect(s.inside).toBe(true);
        expect(s.x).toBeGreaterThan(b.L);
        expect(s.x).toBeLessThan(b.R);
        expect(s.y).toBeGreaterThan(b.Tp);
        expect(s.y).toBeLessThanOrEqual(b.B);
        expect(!!s.behind, `d${d}`).toBe(d === 2);
      }
      // 옆을 보면 앉는 판이 보는 쪽 절반 (왼쪽을 보면 왼쪽)
      if (d === 1) for (const s of spots) expect(s.x).toBeLessThan((b.L + b.R) / 2 + 1);
      if (d === 3) for (const s of spots) expect(s.x).toBeGreaterThan((b.L + b.R) / 2 - 1);
    }
  });

  it("니트 러그: 네 방향 모두 러그 칸 안에 앉고, 가구가 놓인 칸은 피하며 그 가구를 바라본다", () => {
    for (let r = 0; r < 4; r++) {
      const rug: Placed = { u: "g", i: "knit_rug", x: 2, y: 2, r };
      const fp = footprint(furnitureById("knit_rug")!, r);
      expect(validateLayout(lay([rug]), "small", null).ok, `r${r}`).toBe(true);
      const s = rugSeat(rug, [rug], small, F, F.ox + 2 * T, F.oy + 2 * T)!;
      expect(s.x).toBeGreaterThan(F.ox + 2 * T);
      expect(s.x).toBeLessThan(F.ox + (2 + fp.w) * T);
      expect(s.y).toBeGreaterThan(F.oy + 2 * T);
      expect(s.y).toBeLessThan(F.oy + (2 + fp.h) * T);
      expect(s.facing).toBe(DIR.down);
    }
    // 왼쪽 위 칸에 코코아 탁자: 그 칸을 피해 바로 오른쪽 칸에 앉아 탁자(왼쪽)를 본다
    const rug: Placed = { u: "g", i: "knit_rug", x: 2, y: 2, r: 0 };
    const table: Placed = { u: "t", i: "cocoa_table", x: 2, y: 2, r: SPIN_R0 };
    const s = rugSeat(rug, [rug, table], small, F, F.ox + 2 * T + 4, F.oy + 2 * T + 8)!;
    expect(Math.floor((s.x - F.ox) / T)).toBe(3);
    expect(Math.floor((s.y - F.oy) / T)).toBe(2);
    expect(s.facing).toBe(DIR.left);
    // 러그 위가 가구로 꽉 차면 앉을 자리 없음
    const all = [rug, ...[0, 1, 2].flatMap((i) => [0, 1].map((j) => ({ u: `p${i}${j}`, i: "pot", x: 2 + i, y: 2 + j, r: 0 })))];
    expect(rugSeat(rug, all, small, F, F.ox, F.oy)).toBeNull();
  });
});
