import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { CAMP_FIXTURES, CAMP_FLOOR, CAMP_STARTER, CAMP_WALL, FURNITURE, houseShape, isFixtureId } from "@/lib/housing/catalog";
import { footprint, SPIN_R0 } from "@/lib/housing/layout";
import { roomPlan } from "@/lib/housing/rooms";
import type { Placed } from "@/lib/housing/types";
import { EMOTE_ICONS } from "../sprites/emotes";
import { indoorPoseSheet } from "../sprites/indoorPose";
import { artUp, floorGrid, furnitureGrid, itemVariant, shownItemGrid, wallCapColor, wallGrid, WALL_H, windowGrid, WINDOW_H, WINDOW_W } from "./art";
import { CAMP_DRAW, CAMP_GLINT, CAMP_WINDOW_STYLE, PENSION_WINDOW_W } from "./campFurnitureArt";
import { houseSpots, houseTargets, USE_LABEL } from "./interact";
import { CAMP_STAND_IDS, SEASON_FX } from "./seasonUse";

// 11/26 캠핑장 집 실내: 종류별 기본 가구 11종(네 방향 그림·쓰기), 전용 바닥·벽·창문, 방 크기

const FIX = FURNITURE.filter((f) => f.fixture);
const F = { ox: 32, oy: 66 };
const caravan = (yard: 1 | 2 | 3) => houseShape({ zone: "camp", tier: "small", camp: { kind: "caravan", yard } });
const at = (id: string, r: number, x = 3, y = 2): Placed => ({ u: "a", i: id, x, y, r });
const px = (id: string, v: string) => [...furnitureGrid(id, v)!.px].join(",");
const alphaAt = (g: { px: Uint32Array; w: number }, x: number, y: number) => g.px[y * g.w + x] & 255;

describe("캠핑장 기본 가구 그림", () => {
  it("11종 모두 그림이 있고 네 방향 가구다", () => {
    expect(FIX.map((f) => f.id).sort()).toEqual(Object.keys(CAMP_DRAW).sort());
    expect(FIX.length).toBe(11);
    for (const f of FIX) expect(f.spin, f.id).toBe(true);
  });

  it("앞·옆·뒤 그림 크기가 차지 칸 + 솟는 높이와 같고, 비어 있지 않고, 테가 잘리지 않는다", () => {
    for (const f of FIX) {
      const up = artUp(f.id);
      expect(up, f.id).toBeGreaterThan(0);
      for (let r = SPIN_R0; r < SPIN_R0 + 4; r++) {
        const v = itemVariant(f.id, "", { r });
        const g = furnitureGrid(f.id, v)!;
        expect(g, `${f.id} r${r}`).not.toBeNull();
        const fp = footprint(f, r);
        expect(g.w, `${f.id} r${r} 너비`).toBe(fp.w * 16);
        expect(g.h, `${f.id} r${r} 높이`).toBe(fp.h * 16 + up);
        let filled = 0;
        for (let i = 0; i < g.px.length; i++) if ((g.px[i] & 255) > 0) filled++;
        expect(filled, `${f.id} r${r}`).toBeGreaterThan(g.w * g.h * 0.25);
        // 맨 왼쪽 열·맨 오른쪽 열·맨 윗줄에는 몸통이 없다 (테만 — 테가 캔버스 밖으로 잘리지 않게)
        for (let y = 0; y < g.h; y++) {
          expect(alphaAt(g, 0, y), `${f.id} r${r} 왼쪽 끝 ${y}`).toBeLessThan(255);
          expect(alphaAt(g, g.w - 1, y), `${f.id} r${r} 오른쪽 끝 ${y}`).toBeLessThan(255);
        }
        for (let x = 0; x < g.w; x++) expect(alphaAt(g, x, 0), `${f.id} r${r} 윗줄 ${x}`).toBeLessThan(255);
      }
      expect(px(f.id, "d2"), `${f.id} 뒷모습`).not.toBe(px(f.id, ""));
      expect(px(f.id, "d1"), `${f.id} 옆모습`).not.toBe(px(f.id, ""));
    }
  });

  it("써 보기 그림(부엌 요리·문 열림·TV 켜짐)은 평소와 다르다 — 네 방향 모두", () => {
    for (const id of CAMP_STAND_IDS) {
      const fx = SEASON_FX[id];
      expect(fx?.v, id).toBeTruthy();
      expect(fx.lines?.length, id).toBeGreaterThan(0);
      if (fx.emote) expect(EMOTE_ICONS).toContain(fx.emote);
      expect(px(id, fx.v!), `${id} 앞`).not.toBe(px(id, ""));
      // 옆·뒤에서도 그림이 바뀌거나(문·화면이 보이는 쪽) 적어도 그림이 그려진다
      for (const d of ["d1", "d2"]) expect(furnitureGrid(id, `${fx.v}-${d}`), `${id} ${d}`).not.toBeNull();
    }
  });

  it("펜션 TV는 켜짐(on) 그림이 꺼짐과 다르다 — 네 방향 모두 (켜기·끄기, 켜짐 저장)", () => {
    for (const d of ["", "d1", "d2"]) expect(px("fx_pn_tv", ["on", d].filter(Boolean).join("-")), d).not.toBe(px("fx_pn_tv", d));
  });

  it("자개장은 장면 g0~g3마다 자개가 반짝인다", () => {
    expect(CAMP_GLINT.has("fx_rr_jagae")).toBe(true);
    const frames = [0, 1, 2, 3].map((i) => px("fx_rr_jagae", `g${i}`));
    expect(new Set(frames).size).toBe(4);
  });
});

describe("캠핑장 기본 가구 쓰기", () => {
  it("모든 가구·모든 방향에서 쓸 대상과 안내가 있다 (작은 방 가운데)", () => {
    const shape = houseShape({ zone: "camp", tier: "small", camp: { kind: "pension", yard: 1 } });
    const plan = roomPlan(shape);
    for (const f of FIX)
      for (let r = SPIN_R0; r < SPIN_R0 + 4; r++) {
        const t = houseTargets([at(f.id, r)], shape, plan, F).filter((x) => x.item === f.id);
        expect(t.length, `${f.id} r${r}`).toBeGreaterThan(0);
        for (const x of t) expect(USE_LABEL[x.use], `${f.id} ${x.use}`).toBeTruthy();
      }
  });

  it("침대 둘은 눕기, 소파는 두 자리, 식탁은 마주 보는 두 자리, 밥상은 앞뒤 네 자리", () => {
    const shape = caravan(1);
    const spots = (id: string, r = SPIN_R0) => houseSpots([at(id, r)], shape, F);
    for (const id of ["fx_cv_bed", "fx_pn_bed"]) {
      const s = spots(id);
      expect(s.map((x) => x.use), id).toEqual(["lie"]);
      expect(s[0].kind).toBe("bed");
    }
    expect(spots("fx_pn_sofa").map((s) => s.use)).toEqual(["sit", "sit"]);
    expect(houseTargets([at("fx_pn_tv", SPIN_R0)], shape, roomPlan(shape), F).filter((t) => t.item === "fx_pn_tv").map((t) => t.use)).toEqual(["lamp"]);
    const din = spots("fx_cv_dinette");
    expect(din.map((s) => s.facing).sort()).toEqual([DIR.down, DIR.up].sort());
    const dinSide = spots("fx_cv_dinette", SPIN_R0 + 1);
    expect(dinSide.map((s) => s.facing).sort()).toEqual([DIR.left, DIR.right].sort());
    const bap = spots("fx_rr_bapsang");
    expect(bap.length).toBe(4);
    expect(bap.filter((s) => s.facing === DIR.up).length).toBe(2);
    // 밥상 앞이 벽(방 아래 끝)에 붙으면 앞자리는 없다
    const low = houseSpots([at("fx_rr_bapsang", SPIN_R0, 3, shape.h - 1)], shape, F);
    expect(low.every((s) => s.facing === DIR.down)).toBe(true);
  });
});

describe("캠핑장 침대 누운 사람 덮개 (침대마다 따로)", () => {
  // 게임과 같은 규칙으로 겹쳐 본다: 침대 그림은 칸 왼쪽 아래 기준, 자세 그림은 발 원점(10, 27)을 축으로 tilt만큼 돌려 자리 앵커에
  const shape = caravan(1);
  const compose = (id: string, sd: number, body: string) => {
    const r = SPIN_R0 + sd;
    const p = at(id, r);
    const spot = houseSpots([p], shape, F).find((s) => s.kind === "bed")!;
    const bed = shownItemGrid(id, r, itemVariant(id, "", { r }))!;
    const left = F.ox + p.x * 16;
    const top = F.oy + (p.y + 2) * 16 - bed.h;
    const sheet = indoorPoseSheet("lie", body, "#c8a060", [], spot.cover);
    const t = spot.tilt ?? 0;
    const pts: { fy: number; sprite: number; under: number }[] = [];
    for (let fy = 0; fy < 28; fy++)
      for (let fx = 0; fx < 20; fx++) {
        const v = sheet.px[fy * sheet.w + fx];
        if (!(v & 255)) continue;
        const ox = fx - 10;
        const oy = fy - 27;
        const [sx, sy] = t === 90 ? [spot.x - oy - 1, spot.y + ox] : t === -90 ? [spot.x + oy, spot.y - ox - 1] : t === 180 ? [spot.x - ox - 1, spot.y - oy - 1] : [spot.x + ox, spot.y + oy];
        pts.push({ fy, sprite: v, under: bed.get(sx - left, sy - top) });
      }
    return { spot, pts };
  };

  it("카라반·펜션 침대는 네 방향 모두 자기 덮개, 마을 침대는 예전 보라 이불", () => {
    for (const [id, k] of [["fx_cv_bed", "cv"], ["fx_pn_bed", "pn"]] as const)
      for (let sd = 0; sd < 4; sd++) expect(compose(id, sd, "hood").spot.cover).toBe(`${k}bed${sd}`);
    expect(houseSpots([at("bed", 0)], { w: 10, h: 8 }, F)[0].cover).toBeUndefined();
  });

  it("어깨 아래 덮개는 침대 그림과 한 픽셀도 다르지 않게 이어진다 (깃 줄도 같은 자리)", () => {
    for (const id of ["fx_cv_bed", "fx_pn_bed"])
      for (let sd = 0; sd < 4; sd++) {
        // 기본 몸(어깨 7px → 덮개 윗줄 19): 깃 두 줄부터 아래가 모두 침대 그림 그대로
        const bad = compose(id, sd, "hood").pts.filter((q) => q.fy >= 19 && q.sprite !== q.under);
        expect(bad.slice(0, 4).map((q) => `${q.fy}:${(q.sprite >>> 8).toString(16)}/${(q.under >>> 8).toString(16)}:${q.under & 255}`), `${id} sd${sd}`).toEqual([]);
        // 어깨가 높은 몸도 이불 무늬 줄은 침대와 같은 무늬로 이어진다
        for (const body of ["round", "tall"]) {
          const off = compose(id, sd, body).pts.filter((q) => q.fy >= 21 && (q.under & 255) && q.sprite !== q.under);
          expect(off.length, `${id} sd${sd} ${body}`).toBe(0);
        }
      }
  });

  it("마을 침대 보라 이불색은 캠핑장 침대 덮개에 없다", () => {
    for (const id of ["fx_cv_bed", "fx_pn_bed"])
      for (let sd = 0; sd < 4; sd++) expect(compose(id, sd, "hood").pts.some((q) => q.sprite >>> 8 === 0x6a4a7a), `${id} sd${sd}`).toBe(false);
  });
});

describe("캠핑장 집 방·바닥·벽·창문", () => {
  it("방은 앞마당 단계로 커진다: 카라반 10×6 → 12×7 → 14×8, 펜션·촌캉스 10×8 → 14×10 → 18×12 (옛 넓힌 집 = 3단계 방)", () => {
    expect([1, 2, 3].map((y) => caravan(y as 1 | 2 | 3)).map((s) => `${s.w}x${s.h}/${s.maxItems}`)).toEqual(["10x6/22", "12x7/30", "14x8/40"]);
    for (const kind of ["pension", "rural"] as const) {
      expect([1, 2, 3].map((y) => houseShape({ zone: "camp", tier: "small", camp: { kind, yard: y } })).map((s) => `${s.w}x${s.h}/${s.maxItems}`)).toEqual(["10x8/30", "14x10/50", "18x12/80"]);
      expect(houseShape({ zone: "camp", tier: "wide", camp: { kind, yard: 1 } })).toMatchObject({ w: 18, h: 12, maxItems: 80 });
    }
  });

  it("처음 놓이는 기본 가구는 가장 작은 방에서 쓸 대상이 있다", () => {
    for (const kind of ["caravan", "pension", "rural"] as const) {
      const shape = houseShape({ zone: "camp", tier: "small", camp: { kind, yard: 1 } });
      const items = [...CAMP_STARTER[kind]];
      expect(items.map((p) => p.i).sort()).toEqual([...CAMP_FIXTURES[kind]].sort());
      for (const p of items) expect(isFixtureId(p.i)).toBe(true);
      const t = houseTargets(items, shape, roomPlan(shape), F);
      for (const p of items) expect(t.some((x) => x.u === p.u), `${kind} ${p.i}`).toBe(true);
    }
  });

  it("전용 바닥·벽은 제 그림이 있다 (기본 장판·판자 벽으로 떨어지지 않는다)", () => {
    const base = [...floorGrid("floor_grass", 0).px].join(",");
    const baseWall = [...wallGrid("wall_fence", 0).px].join(",");
    for (const kind of ["caravan", "pension", "rural"] as const) {
      expect([...floorGrid(CAMP_FLOOR[kind], 0).px].join(","), kind).not.toBe(base);
      expect([...wallGrid(CAMP_WALL[kind], 1).px].join(","), kind).not.toBe(baseWall);
      expect(wallGrid(CAMP_WALL[kind], 0).h).toBe(WALL_H);
      expect(wallCapColor(CAMP_WALL[kind])).not.toBe(wallCapColor("wall_fence"));
    }
    // 세 종류가 서로 다르다
    const floors = new Set((["caravan", "pension", "rural"] as const).map((k) => [...floorGrid(CAMP_FLOOR[k], 0).px].join(",")));
    expect(floors.size).toBe(3);
  });

  it("종류별 창문: 낮·밤 × 열림·닫힘 그림이 모두 다르고 창턱 높이는 기본 창문과 같다", () => {
    for (const style of Object.values(CAMP_WINDOW_STYLE)) {
      const pics = [false, true].flatMap((n) => [false, true].map((o) => [...windowGrid(n, o, style).px].join(",")));
      expect(new Set(pics).size, style).toBe(4);
      const g = windowGrid(false, false, style);
      expect(g.h, style).toBe(WINDOW_H);
      expect(g.w, style).toBe(style === CAMP_WINDOW_STYLE.pension ? PENSION_WINDOW_W : WINDOW_W);
    }
  });
});
