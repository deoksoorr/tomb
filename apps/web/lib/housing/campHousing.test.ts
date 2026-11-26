import { CAMP_LOTS } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { forgetFriendCard, friendCard } from "../friendCard";
import { getAccounts, getGifts } from "../store";
import { kstDay } from "../store/accounts";
import {
  CAMP_FIXTURES,
  CAMP_FLOOR,
  CAMP_STARTER,
  CAMP_WALL,
  campBasePrice,
  campBuyCost,
  campHomeLabel,
  campLotByNo,
  campSizeBonus,
  campStagePrice,
  campYardCost,
  CAMP_HOME_ROOM,
  CAMP_HOME_STARTER,
  CARAVAN_PRICE,
  CARAVAN_ROOM,
  CARAVAN_STARTER,
  CARAVAN_STARTER_OLD,
  DEFAULT_FLOOR,
  DEFAULT_WALL,
  FURNITURE,
  furnitureById,
  houseLabel,
  houseShape,
  houseShortLabel,
  HOUSING_CHANNELS,
  houseSizeBonus,
  isExclusiveFurniture,
  PLOT_TIERS,
  plotCost,
  seaPlotCost,
  seaUpgradeCost,
  skinName,
  villagePlotCost,
  villageUpgradeCost,
  type CampHomeKind,
} from "./catalog";
import { campFixturesForYard, itemCount, layoutCounts, validateLayout } from "./layout";
import { roomPlan } from "./rooms";
import { deliverReclaim, RECLAIM_MS, sweepReclaim } from "./reclaim";
import {
  buyCampHome,
  buyCottage,
  buyFurniture,
  buyPlot,
  campStarterLayout,
  furnitureZone,
  getHouseStore,
  houseIdFor,
  houseRank,
  myHouse,
  saveLayout,
  sellFurniture,
  upgradePlot,
  upgradeYard,
  village,
} from "./service";
import { MemoryHouseStore } from "./store";
import type { HouseLayout, Placed } from "./types";

// 11/26 캠핑장 집 (zone "camp") · 별장 규칙(두 번째로 산 집부터 별장) · 기본 가구(fixture). 메모리 저장소에서만 — 실제 Redis는 sharedBag.contract·campHousing.redis

const conn = env.redis();
const lotOf = (kind: CampHomeKind, grade?: string) => CAMP_LOTS.find((l) => l.kind === kind && (!grade || l.grade === grade))!.lot;
const FALLS = lotOf("caravan", "falls");
const RIVER = lotOf("caravan", "river");
const FOREST = lotOf("caravan", "forest");
const PENSION = lotOf("pension");
const RURAL = lotOf("rural");

describe("캠핑장 값표 (카탈로그)", () => {
  it("분양가: 무주택 / 1주택(별장 × 4/3)", () => {
    const want: [number, number, number][] = [
      [FALLS, 13_500, 18_000],
      [RIVER, 11_250, 15_000],
      [FOREST, 9_000, 12_000],
      [PENSION, 9_000, 12_000],
      [RURAL, 9_000, 12_000],
    ];
    for (const [lot, first, villa] of want) {
      expect(campBuyCost(lot, false), `${lot}`).toBe(first);
      expect(campBuyCost(lot, true), `${lot}`).toBe(villa);
    }
    // 16터 모두 값이 있다 (등급별로 같은 값)
    for (const l of CAMP_LOTS) expect(campBasePrice(l.lot)).toBeGreaterThan(0);
    expect(CAMP_LOTS.filter((l) => l.grade === "falls").map((l) => campBasePrice(l.lot))).toEqual([13_500, 13_500, 13_500, 13_500]);
    expect(CAMP_LOTS.filter((l) => l.kind === "caravan").map((l) => campBasePrice(l.lot))).toEqual(CAMP_LOTS.filter((l) => l.kind === "caravan").map((l) => CARAVAN_PRICE[l.grade!]));
    expect(campBasePrice(0)).toBe(0);
    expect(campBasePrice(17)).toBe(0);
  });

  it("11/26 「바닷가와 같게」 값표 전체: 단계마다 첫 집 / 별장(× 4/3, 10P 올림) · 끝까지 합", () => {
    // [터, [분양, 앞마당 2, 앞마당 3] 첫 집, 같은 순서 별장, 끝까지 첫 집, 끝까지 별장]
    const table: [number, number[], number[], number, number][] = [
      [PENSION, [9_000, 13_500, 22_500], [12_000, 18_000, 30_000], 45_000, 60_000],
      [RURAL, [9_000, 13_500, 22_500], [12_000, 18_000, 30_000], 45_000, 60_000],
      [FOREST, [9_000, 13_500, 22_500], [12_000, 18_000, 30_000], 45_000, 60_000],
      [RIVER, [11_250, 16_880, 28_130], [15_000, 22_510, 37_510], 56_260, 75_020],
      [FALLS, [13_500, 20_250, 33_750], [18_000, 27_000, 45_000], 67_500, 90_000],
    ];
    for (const [lot, first, villa, sumFirst, sumVilla] of table)
      for (const v of [false, true]) {
        const row = [campBuyCost(lot, v), campYardCost(lot, 2, v), campYardCost(lot, 3, v)];
        expect(row, `${lot} ${v ? "별장" : "첫 집"}`).toEqual(v ? villa : first);
        expect(row.reduce((a, b) => a + b, 0)).toBe(v ? sumVilla : sumFirst);
      }
    // 같은 등급 터는 모두 같은 값, 기본값(villa 없음)은 첫 집 값
    for (const l of CAMP_LOTS) {
      const same = table.find(([lot]) => campLotByNo(lot)!.kind === l.kind && campLotByNo(lot)!.grade === l.grade)!;
      expect([campBuyCost(l.lot, false), campYardCost(l.lot, 2), campYardCost(l.lot, 3)], `${l.lot}`).toEqual(same[1]);
    }
    // 포구 오두막(작은 터 → 넓은 터 → 대저택)과 같은 값
    expect([seaPlotCost("small", false), seaUpgradeCost(9_000, false), seaUpgradeCost(15_000, false)]).toEqual([9_000, 13_500, 22_500]);
    expect([seaPlotCost("small", true), seaUpgradeCost(9_000, true), seaUpgradeCost(15_000, true)]).toEqual([12_000, 18_000, 30_000]);
    expect(campStagePrice(0, 1)).toBe(0);
  });

  it("마을·포구 별장 값: 마을 × 4/3, 포구는 예전과 같은 2배 (1.5 × 4/3)", () => {
    expect([villagePlotCost("small", false), villagePlotCost("wide", false), villagePlotCost("manor", false)]).toEqual([6_000, 15_000, 30_000]);
    expect([villagePlotCost("small", true), villagePlotCost("wide", true), villagePlotCost("manor", true)]).toEqual([8_000, 20_000, 40_000]);
    expect([villageUpgradeCost(9_000, true), villageUpgradeCost(15_000, true), villageUpgradeCost(9_000, false)]).toEqual([12_000, 20_000, 9_000]);
    for (const t of PLOT_TIERS) {
      expect(seaPlotCost(t.id, false)).toBe(plotCost(t.id) * 1.5);
      expect(seaPlotCost(t.id, true)).toBe(plotCost(t.id) * 2);
    }
    expect([seaUpgradeCost(9_000, false), seaUpgradeCost(9_000, true)]).toEqual([13_500, 18_000]);
  });

  it("11/26 크기 점수는 방 크기로: 펜션·촌캉스 +0 · +30 · +80 (마을·포구 터와 같다), 카라반 +0 · +15 · +30 — 자리 등급·별장과 상관없다", () => {
    for (const lot of [PENSION, RURAL]) expect([1, 2, 3].map((y) => campSizeBonus(lot, "small", y))).toEqual([0, 30, 80]);
    for (const lot of [FALLS, RIVER, FOREST]) expect([1, 2, 3].map((y) => campSizeBonus(lot, "small", y))).toEqual([0, 15, 30]);
    expect([1, 2, 3].map((y) => campSizeBonus(PENSION, "small", y))).toEqual(PLOT_TIERS.map((t) => houseSizeBonus({ tier: t.id, lot: 1 })));
    // 옛 「넓힌 집」 기록은 3단계 방이라 점수도 3단계
    expect(campSizeBonus(PENSION, "wide", 1)).toBe(80);
    expect(campSizeBonus(FALLS, "wide", 1)).toBe(0);
    expect(campSizeBonus(0, "small", 3)).toBe(0);
    expect(houseSizeBonus({ tier: "wide", lot: 3 })).toBe(30);
    expect(houseSizeBonus({ zone: "sea", tier: "manor", lot: 3 })).toBe(80);
    expect(houseSizeBonus({ zone: "camp", tier: "small", lot: FALLS, camp: { yard: 3 } })).toBe(30);
  });

  it("방 크기: 앞마당 단계로 방 하나가 커진다 — 카라반 10×6(22) → 12×7(30) → 14×8(40), 펜션·촌캉스 10×8(30) → 14×10(50) → 18×12(80) (포구·마을 터와 같다)", () => {
    for (const y of [1, 2, 3] as const) expect(houseShape({ zone: "camp", tier: "small", camp: { kind: "caravan", yard: y } })).toMatchObject({ ...CARAVAN_ROOM[y], id: "small", camp: "caravan" });
    expect(CARAVAN_ROOM).toEqual({ 1: { w: 10, h: 6, maxItems: 22 }, 2: { w: 12, h: 7, maxItems: 30 }, 3: { w: 14, h: 8, maxItems: 40 } });
    expect(CAMP_HOME_ROOM).toEqual({ 1: { w: 10, h: 8, maxItems: 30 }, 2: { w: 14, h: 10, maxItems: 50 }, 3: { w: 18, h: 12, maxItems: 80 } });
    for (const y of [1, 2, 3] as const) expect(CAMP_HOME_ROOM[y]).toMatchObject({ w: PLOT_TIERS[y - 1].w, h: PLOT_TIERS[y - 1].h, maxItems: PLOT_TIERS[y - 1].maxItems });
    for (const kind of ["pension", "rural"] as const)
      for (const y of [1, 2, 3] as const)
        expect(houseShape({ zone: "camp", tier: "small", camp: { kind, yard: y } })).toMatchObject({ ...CAMP_HOME_ROOM[y], id: "small", camp: kind, name: kind === "pension" ? "펜션" : "촌캉스" });
    // 옛 「넓힌 집」 기록은 3단계 방 (방 하나 — 칸막이 없음)
    expect(houseShape({ zone: "camp", tier: "wide", camp: { kind: "rural", yard: 1 } })).toMatchObject({ w: 18, h: 12, maxItems: 80, id: "small", name: "촌캉스" });
    expect(houseShape({ tier: "manor" })).toMatchObject({ w: 18, h: 12, maxItems: 80 });
  });

  it("이름: 긴 이름(houseLabel)·짧은 이름(친구 창 버튼)", () => {
    expect(houseLabel({ ch: 3, lot: 2, zone: "camp" })).toBe("3채널 언젠가 캠핑장 강가 2번 카라반");
    expect(houseLabel({ ch: 3, lot: 1, zone: "camp" })).toBe("3채널 언젠가 캠핑장 폭포 앞 1번 카라반");
    expect(campHomeLabel(5, 13)).toBe("5채널 언젠가 캠핑장 솔바람채 펜션");
    expect(houseLabel({ ch: 3, lot: 2, zone: "sea" })).toBe("3채널 포구 2번 오두막");
    expect(houseLabel({ ch: 3, lot: 12 })).toBe("3채널 기억숲 마을 12번지");
    expect(houseShortLabel({ lot: 12 })).toBe("마을 12번지");
    expect(houseShortLabel({ lot: 2, zone: "sea" })).toBe("포구 2번");
    expect(houseShortLabel({ lot: 2, zone: "camp" })).toBe("캠핑장 카라반 2번");
    expect(houseShortLabel({ lot: 13, zone: "camp" })).toBe("캠핑장 솔바람채");
    expect(houseShortLabel({ lot: 16, zone: "camp" })).toBe("캠핑장 감나무집");
  });
});

describe("기본 가구 (fixture)", () => {
  const p = (u: string, i: string, x: number, y: number, r = 4): Placed => ({ u, i, x, y, r });
  const starter = (kind: CampHomeKind): HouseLayout => campStarterLayout(kind);
  const caravan1 = houseShape({ zone: "camp", tier: "small", camp: { kind: "caravan", yard: 1 } });
  const pension = houseShape({ zone: "camp", tier: "small", camp: { kind: "pension", yard: 1 } });

  it("종류별 id·크기 (CAMP_PLAN), 가구점·보따리상 목록에서 빠진다", () => {
    const size = (id: string) => [furnitureById(id)!.w, furnitureById(id)!.h];
    expect(CAMP_FIXTURES.caravan).toEqual(["fx_cv_bed", "fx_cv_dinette", "fx_cv_kitchen", "fx_cv_toilet"]);
    expect(CAMP_FIXTURES.pension).toEqual(["fx_pn_tv", "fx_pn_sofa", "fx_pn_kitchen", "fx_pn_bed"]);
    expect(CAMP_FIXTURES.rural).toEqual(["fx_rr_jagae", "fx_rr_ibul", "fx_rr_bapsang"]);
    expect([size("fx_cv_bed"), size("fx_cv_dinette"), size("fx_cv_kitchen"), size("fx_cv_toilet")]).toEqual([[2, 2], [2, 2], [2, 1], [2, 2]]);
    expect([size("fx_pn_tv"), size("fx_pn_sofa"), size("fx_pn_kitchen"), size("fx_pn_bed")]).toEqual([[2, 1], [2, 1], [3, 1], [2, 2]]);
    expect([size("fx_rr_jagae"), size("fx_rr_ibul"), size("fx_rr_bapsang")]).toEqual([[2, 1], [2, 1], [2, 1]]);
    for (const f of FURNITURE.filter((d) => d.fixture)) {
      expect(f.category).toBe("fixture");
      expect(isExclusiveFurniture(f)).toBe(true);
      expect(f.spin).toBe(true);
      expect([f.price, f.score]).toEqual([0, 0]);
    }
    expect(skinName(CAMP_FLOOR.caravan)).toBe("카라반 바닥");
    expect(skinName(CAMP_WALL.rural)).toBe("한지 벽");
  });

  it("기본 자리는 가장 작은 방부터 앞마당 3단계 방(옛 넓힌 집 포함)까지 그대로 맞는다 (가진 것 없이도 — 가방에서 쓰지 않는다)", () => {
    for (const y of [1, 2, 3] as const) expect(validateLayout(starter("caravan"), houseShape({ zone: "camp", tier: "small", camp: { kind: "caravan", yard: y } }), {})).toMatchObject({ ok: true, counts: {}, placedScore: 0 });
    for (const kind of ["pension", "rural"] as const)
      for (const tier of ["small", "wide"] as const)
        for (const y of [1, 2, 3] as const)
          expect(validateLayout(starter(kind), houseShape({ zone: "camp", tier, camp: { kind, yard: y } }), {}), `${kind} ${tier} ${y}`).toMatchObject({ ok: true, counts: {} });
    expect(layoutCounts(starter("pension"))).toEqual({});
    expect(itemCount(starter("caravan"))).toBe(0);
    expect(CAMP_STARTER.caravan.map((s) => s.i).sort()).toEqual([...CAMP_FIXTURES.caravan].sort());
  });

  it("11/26 카라반 단계마다 시작 자리: 문·방 안·겹침 규칙에 맞고, 화장실 칸은 오른쪽 위 구석 · 침대는 왼쪽 위 구석 · 키 큰 부엌은 창을 안 가린다", () => {
    for (const y of [1, 2, 3] as const) {
      const shape = houseShape({ zone: "camp", tier: "small", camp: { kind: "caravan", yard: y } });
      const layout = { ...starter("caravan"), items: CARAVAN_STARTER[y].map((q) => ({ ...q })) };
      expect(validateLayout(layout, shape, {}), `${y}단계`).toMatchObject({ ok: true });
      const at = (i: string) => CARAVAN_STARTER[y].find((q) => q.i === i)!;
      expect(at("fx_cv_bed")).toMatchObject({ x: 0, y: 0 });
      expect(at("fx_cv_toilet")).toMatchObject({ x: shape.w - 2, y: 0 });
      const k = at("fx_cv_kitchen");
      for (const w of roomPlan(shape).windows) expect(k.x + 2 <= w.x || k.x >= w.x + w.w, `${y}단계 부엌·창`).toBe(true);
      // 문 앞 줄·가운데 바닥은 비어 있다 (기본 가구는 모두 안쪽 벽 두 줄 안)
      for (const q of CARAVAN_STARTER[y]) expect(q.y).toBe(0);
    }
  });

  it("11/26 앞마당 단계를 올려도 놓인 물건은 그대로 방 안 (방은 오른쪽·아래로만 커지고 새 문 칸은 전 단계 방 밖)", () => {
    const shapes = ([1, 2, 3] as const).map((y) => houseShape({ zone: "camp", tier: "small", camp: { kind: "caravan", yard: y } }));
    for (const base of [CARAVAN_STARTER[1], CARAVAN_STARTER_OLD])
      for (let y = 0; y < shapes[0].h; y++)
        for (let x = 0; x < shapes[0].w; x++) {
          const items = [...base.map((q) => ({ ...q })), p("a1", "pot", x, y, 0)];
          const l = { ...starter("caravan"), items };
          if (!validateLayout(l, shapes[0], null).ok) continue;
          expect(validateLayout(l, shapes[1], null).ok, `${x},${y} → 2단계`).toBe(true);
          expect(validateLayout(l, shapes[2], null).ok, `${x},${y} → 3단계`).toBe(true);
        }
  });

  it("11/26 펜션·촌캉스도 앞마당 단계를 올리면 놓아 둔 물건(큰 가구·러그 포함)이 그대로 방 안 — 1→2→3단계, 칸막이 없이", () => {
    for (const kind of ["pension", "rural"] as const) {
      const shapes = ([1, 2, 3] as const).map((y) => houseShape({ zone: "camp", tier: "small", camp: { kind, yard: y } }));
      for (let i = 0; i < 2; i++) {
        const from = shapes[i];
        // 그 단계 방 가장자리에 붙인 물건들 (오른쪽 아래 구석·오른쪽 벽·아래 줄)
        for (const [it, w, h] of [["pot", 1, 1], ["bed", 2, 2], ["rug", 3, 2]] as const)
          for (const [x, y] of [[from.w - w, from.h - h], [from.w - w, 0], [0, from.h - h], [Math.floor(from.w / 2), Math.floor(from.h / 2)]]) {
            const l = { ...starter(kind), items: [...starter(kind).items, p("a1", it, x, y, 0)] };
            if (!validateLayout(l, from, null).ok) continue;
            for (const to of shapes.slice(i + 1)) expect(validateLayout(l, to, null).ok, `${kind} ${it} ${x},${y} ${from.w}×${from.h} → ${to.w}×${to.h}`).toBe(true);
          }
      }
      for (const s of shapes) expect(roomPlan(s).partitions).toEqual([]);
    }
  });

  it("그 종류 기본 가구가 정확히 하나씩: 빼거나 둘 놓거나 다른 종류를 놓으면 거절, 옮기고 돌리면 된다", () => {
    const base = starter("caravan");
    expect(validateLayout({ ...base, items: base.items.slice(1) }, caravan1, {})).toMatchObject({ ok: false, code: "FIXTURE" });
    expect(validateLayout({ ...base, items: [...base.items, p("f9", "fx_cv_bed", 6, 3)] }, caravan1, {})).toMatchObject({ ok: false, code: "FIXTURE" });
    expect(validateLayout({ ...base, items: [...base.items, p("f9", "fx_pn_tv", 6, 3)] }, caravan1, {})).toMatchObject({ ok: false, code: "BAD_ITEM" });
    // 마을 집에는 기본 가구를 못 놓는다
    expect(validateLayout({ items: [p("a", "fx_cv_bed", 0, 0)], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL }, "small", {})).toMatchObject({ ok: false, code: "BAD_ITEM" });
    // 옮기고 돌리기 (r 4~7 네 방향)
    const moved = { ...base, items: base.items.map((it) => (it.i === "fx_cv_kitchen" ? { ...it, x: 6, y: 3, r: 5 } : it)) };
    expect(validateLayout(moved, caravan1, {})).toMatchObject({ ok: true });
    // 겹치면 안 된다
    const clash = { ...base, items: base.items.map((it) => (it.i === "fx_cv_kitchen" ? { ...it, x: 0, y: 0 } : it)) };
    expect(validateLayout(clash, caravan1, {})).toMatchObject({ ok: false, code: "BAD_PLACE" });
  });

  it("가구 수(maxItems)에 기본 가구는 세지 않는다 (카라반 1단계 22개 + 기본 4개)", () => {
    const base = starter("caravan");
    const free: { x: number; y: number }[] = [];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) free.push({ x, y });
    const taken = new Set(["0,0", "1,0", "0,1", "1,1", "3,0", "4,0", "3,1", "4,1", "5,0", "6,0", "8,0", "9,0", "8,1", "9,1", "4,5", "5,5"]);
    const spots = free.filter((c) => !taken.has(`${c.x},${c.y}`));
    const pots = (n: number) => spots.slice(0, n).map((c, i) => ({ u: `p${i}`, i: "pot", x: c.x, y: c.y, r: 0 }));
    expect(validateLayout({ ...base, items: [...base.items, ...pots(22)] }, caravan1, { pot: 22 })).toMatchObject({ ok: true, counts: { pot: 22 } });
    expect(validateLayout({ ...base, items: [...base.items, ...pots(23)] }, caravan1, { pot: 23 })).toMatchObject({ ok: false, code: "TOO_MANY" });
  });

  it("전용 바닥·벽은 그 종류 집에서만 (가방에서 쓰지 않음), 다른 바닥으로 바꿀 수 있다", () => {
    const base = starter("pension");
    expect(validateLayout({ ...base, floor: CAMP_FLOOR.caravan }, pension, {})).toMatchObject({ ok: false, code: "BAD_SKIN" });
    expect(validateLayout({ ...base, wall: CAMP_WALL.rural }, pension, {})).toMatchObject({ ok: false, code: "BAD_SKIN" });
    expect(validateLayout({ items: [], floor: CAMP_FLOOR.pension, wall: DEFAULT_WALL }, "small", {})).toMatchObject({ ok: false, code: "BAD_SKIN" });
    expect(validateLayout({ ...base, floor: DEFAULT_FLOOR }, pension, {})).toMatchObject({ ok: true });
    expect(validateLayout({ ...base, floor: "floor_wood" }, pension, { floor_wood: 1 })).toMatchObject({ ok: true, counts: { floor_wood: 1 } });
    expect(validateLayout({ ...base, floor: "floor_wood" }, pension, {})).toMatchObject({ ok: false, code: "NOT_OWNED" });
  });
});

describe.skipIf(!!conn)("캠핑장 집 (서비스)", () => {
  const accounts = getAccounts();
  const T = Date.now();
  async function account(pts: number, seenAt = T): Promise<string> {
    const id = nanoid();
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, pts - now);
    await accounts.visit(id, seenAt, true);
    return id;
  }
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;
  let chSeq = 0;
  const nextCh = () => (chSeq++ % HOUSING_CHANNELS) + 1;

  it("무주택: 카라반 폭포 앞 13,500 — 첫 집(별장 아님), 기본 가구·전용 바닥·벽이 깔리고 가방엔 없다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    const ch = nextCh();
    const before = await points(a);
    const r = await buyCampHome(store, a, "", "", "주인", FALLS, ch);
    expect(before - (await points(a))).toBe(13_500);
    expect(r.house).toMatchObject({ zone: "camp", lot: FALLS, ch, tier: "small", camp: { kind: "caravan", yard: 1 }, name: "카라반 1번" });
    expect(r.house?.villa).toBeUndefined();
    expect(r.house?.layout.floor).toBe(CAMP_FLOOR.caravan);
    expect(r.house?.layout.items.map((i) => i.i).sort()).toEqual([...CAMP_FIXTURES.caravan].sort());
    expect(r.inventory).toEqual({});
    expect((await store.get(houseIdFor(a, "camp")))?.paid).toBe(13_500);
    // 값표: 이제 다른 구역 집은 별장 값
    expect(r.prices?.villa).toEqual({ village: true, sea: true, camp: false });
    expect(r.prices?.village.small).toBe(8_000);
    expect(r.prices?.sea.small).toBe(seaPlotCost("small", true));
    expect(r.prices?.upgrade).toBeNull();
    expect(r.prices?.yard).toEqual({ to: 2, price: 20_250 });
    expect(r.prices?.camp.find((c) => c.lot === PENSION)).toEqual({ lot: PENSION, kind: "pension", buy: 9_000, yard2: 13_500, yard3: 22_500 });
  });

  it("1주택(마을 집 보유): 펜션 12,000 별장 → 앞마당 18,000 → 30,000 (별장 값 — 넓히기 없음, 방도 커진다) → 더는 없음. villa 표시는 남고 안 바뀐다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000);
    const ch = nextCh();
    await buyPlot(store, a, "마을 집", "", "주인", null, ch);
    let p = await points(a);
    const r = await buyCampHome(store, a, "솔바람", "", "주인", PENSION, ch);
    expect(p - (p = await points(a))).toBe(12_000);
    expect(r.house?.villa).toBe(true);
    expect(r.prices?.upgrade).toBeNull();
    expect(r.prices?.yard).toEqual({ to: 2, price: 18_000 });
    expect(r.prices?.camp.find((c) => c.lot === RIVER)).toMatchObject({ buy: 15_000, yard2: 22_510, yard3: 37_510 });
    // 11/26 캠핑장 넓히기는 없다 (돈은 안 나간다)
    await expect(upgradePlot(store, a, "wide", ch, "camp")).rejects.toMatchObject({ code: "BAD_TIER", message: expect.stringContaining("앞마당") });
    await expect(upgradePlot(store, a, "manor", ch, "camp")).rejects.toMatchObject({ code: "BAD_TIER" });
    expect(await points(a)).toBe(p);
    expect(houseShape(r.house!)).toMatchObject({ w: 10, h: 8, maxItems: 30 });
    const y2 = await upgradeYard(store, a, ch);
    expect(p - (p = await points(a))).toBe(18_000);
    expect(y2.house?.camp?.yard).toBe(2);
    expect(y2.house?.tier).toBe("small");
    expect(houseShape(y2.house!)).toMatchObject({ w: 14, h: 10, maxItems: 50 });
    expect(y2.prices?.yard).toEqual({ to: 3, price: 30_000 });
    const y3 = await upgradeYard(store, a, ch);
    expect(p - (p = await points(a))).toBe(30_000);
    expect(y3.house?.camp?.yard).toBe(3);
    expect(houseShape(y3.house!)).toMatchObject({ w: 18, h: 12, maxItems: 80 });
    expect(y3.prices?.yard).toBeNull();
    await expect(upgradeYard(store, a, ch)).rejects.toMatchObject({ code: "MAX_YARD" });
    expect(await points(a)).toBe(p);
    // 낸 값이 모두 집에 남는다 (철거 때 돌려준다) — 별장은 앞마당도 별장 값 (끝까지 60,000)
    expect((await store.get(houseIdFor(a, "camp")))?.paid).toBe(12_000 + 18_000 + 30_000);
    // 크기 점수 = 3단계 방(18×12) +80 (별장이어도 같은 점수)
    expect(y3.house?.score).toBe(80);
    // 다른 채널에서는 거절
    await expect(upgradeYard(store, a, ch === 1 ? 2 : 1)).rejects.toMatchObject({ code: "WRONG_CHANNEL" });
  });

  it("무주택 촌캉스 9,000 → 앞마당 13,500 → 22,500 (끝까지 45,000) · 카라반도 넓히기 없이 앞마당 (방도 커진다)", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    const b = await account(100_000);
    const ch = nextCh();
    let p = await points(a);
    await buyCampHome(store, a, "", "", "주인", RURAL, ch);
    expect(p - (p = await points(a))).toBe(9_000);
    await expect(upgradePlot(store, a, "wide", ch, "camp")).rejects.toMatchObject({ code: "BAD_TIER" });
    await upgradeYard(store, a, ch);
    await upgradeYard(store, a, ch);
    expect(p - (p = await points(a))).toBe(36_000);
    expect((await store.get(houseIdFor(a, "camp")))?.paid).toBe(45_000);
    await buyCampHome(store, b, "", "", "주인", FOREST, ch);
    await expect(upgradePlot(store, b, "wide", ch, "camp")).rejects.toMatchObject({ code: "BAD_TIER" });
    const y = await upgradeYard(store, b, ch);
    expect(houseShape(y.house!)).toMatchObject({ w: 12, h: 7, maxItems: 30 });
  });

  it("분양 NPC마다 자기 종류만: kind가 터 종류와 다르면 400 WRONG_KIND (돈은 안 나간다), 같으면 그대로 분양", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    const ch = nextCh();
    const p = await points(a);
    await expect(buyCampHome(store, a, "", "", "a", FALLS, ch, "pension")).rejects.toMatchObject({ code: "WRONG_KIND", status: 400 });
    await expect(buyCampHome(store, a, "", "", "a", PENSION, ch, "caravan")).rejects.toMatchObject({ code: "WRONG_KIND" });
    await expect(buyCampHome(store, a, "", "", "a", RURAL, ch, "pension")).rejects.toMatchObject({ code: "WRONG_KIND", message: expect.stringContaining("순이 할머니") });
    expect(await points(a)).toBe(p);
    expect((await store.village(ch, "camp")).length).toBe(0);
    const r = await buyCampHome(store, a, "", "", "a", RURAL, ch, "rural");
    expect(r.house).toMatchObject({ lot: RURAL, camp: { kind: "rural", yard: 1 } });
  });

  it("한 사람 한 채 (종류 상관없이 두 번째 캠핑장 집 거절, 돈은 안 나간다) · 터 중복 거절 · 다른 채널은 따로 · 없는 터는 400", async () => {
    const store = new MemoryHouseStore();
    const [a, b] = await Promise.all([account(100_000), account(100_000)]);
    const ch = nextCh();
    await buyCampHome(store, a, "", "", "a", RIVER, ch);
    const p = await points(a);
    await expect(buyCampHome(store, a, "", "", "a", PENSION, ch)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    await expect(buyCampHome(store, a, "", "", "a", FALLS, ch === 1 ? 2 : 1)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    expect(await points(a)).toBe(p);
    const pb = await points(b);
    await expect(buyCampHome(store, b, "", "", "b", RIVER, ch)).rejects.toMatchObject({ code: "LOT_TAKEN" });
    await expect(buyCampHome(store, b, "", "", "b", 0, ch)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(buyCampHome(store, b, "", "", "b", 17, ch)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(buyCampHome(store, b, "", "", "b", null, ch)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await points(b)).toBe(pb);
    await buyCampHome(store, b, "", "", "b", RIVER, ch === 1 ? 2 : 1);
    // 같은 번호라도 마을 번지·포구 터와는 따로
    await buyPlot(store, b, "마을", "", "b", RIVER, ch);
    await buyCottage(store, b, "오두막", "", "b", RIVER, ch);
    const v = await village(store, ch, T, "camp");
    expect(v).toMatchObject({ zone: "camp", lots: 16 });
    expect(v.houses.map((h) => [h.lot, h.camp?.kind])).toEqual([[RIVER, "caravan"]]);
    expect((await village(store, ch, T)).houses.map((h) => h.lot)).toEqual([RIVER]);
    expect((await village(store, ch, T, "sea")).houses.map((h) => h.lot)).toEqual([RIVER]);
  });

  it("두 번째로 산 집부터 별장: 마을·포구·캠핑장 어느 순서든, 세 번째도 별장", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000);
    const ch = nextCh();
    let p = await points(a);
    await buyCottage(store, a, "오두막", "", "a", null, ch);
    expect(p - (p = await points(a))).toBe(seaPlotCost("small", false));
    await buyCampHome(store, a, "", "", "a", FOREST, ch);
    expect(p - (p = await points(a))).toBe(12_000);
    // 별장 캠핑장 집은 앞마당도 별장 값
    expect((await myHouse(store, a, undefined, "camp")).prices?.yard).toEqual({ to: 2, price: 18_000 });
    await upgradeYard(store, a, ch);
    expect(p - (p = await points(a))).toBe(18_000);
    await buyPlot(store, a, "마을", "", "a", null, ch, "wide");
    expect(p - (p = await points(a))).toBe(20_000);
    const [v, s, c] = await Promise.all([myHouse(store, a), myHouse(store, a, undefined, "sea"), myHouse(store, a, undefined, "camp")]);
    expect([v.house?.villa, s.house?.villa, c.house?.villa]).toEqual([true, undefined, true]);
    // 첫 집(오두막) 넓히기는 1.5배, 별장(마을) 넓히기는 × 4/3
    expect(s.prices?.upgrade).toEqual({ to: "wide", price: seaUpgradeCost(9_000, false) });
    expect(v.prices?.upgrade).toEqual({ to: "manor", price: 20_000 });
    await upgradePlot(store, a, "manor", ch);
    expect(p - (p = await points(a))).toBe(20_000);
  });

  it("villa 표시는 산 때 그대로: 먼저 산 집이 철거돼도 별장 값 그대로", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000, T);
    const ch = nextCh();
    await buyPlot(store, a, "마을", "", "a", null, ch);
    await buyCampHome(store, a, "", "", "a", PENSION, ch);
    await store.remove(houseIdFor(a));
    const r = await myHouse(store, a, undefined, "camp");
    expect(r.house?.villa).toBe(true);
    expect(r.prices?.upgrade).toBeNull();
    // 마을 집을 다시 사면 그건 별장 (캠핑장 집이 있으니까)
    expect(r.prices?.villa.village).toBe(true);
  });

  it("옛 기록(villa 칸 없음) 이전: 마을+오두막 둘 다면 순서 무관 오두막이 별장(지금 값과 같다), 마을 집은 첫 집", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000);
    const ch = nextCh();
    // 오두막을 먼저 사고 마을 집을 나중에 산 옛 기록 (villa 칸 없음)
    await store.create({ id: houseIdFor(a, "sea"), owner: a, name: "옛 오두막", intro: "", ownerName: "a", tier: "small", ch, lot: null, now: 1, zone: "sea", paid: 9_000 });
    await store.create({ id: houseIdFor(a), owner: a, name: "옛 마을", intro: "", ownerName: "a", tier: "small", ch, lot: null, now: 2, paid: 9_000 });
    const s = await myHouse(store, a, undefined, "sea");
    expect(s.house?.villa).toBe(true);
    expect(s.prices?.upgrade).toEqual({ to: "wide", price: seaUpgradeCost(9_000, true) });
    expect((await myHouse(store, a)).house?.villa).toBeUndefined();
    // 한 번 남긴 표시는 그대로 (기록에 남았다)
    expect((await store.get(houseIdFor(a, "sea")))?.villa).toBe(true);
    expect((await store.get(houseIdFor(a)))?.villa).toBe(false);
    const p = await points(a);
    await upgradePlot(store, a, "wide", ch, "sea");
    expect(p - (await points(a))).toBe(18_000);

    // 오두막만 있던 옛 기록: 먼저 첫 집으로 남기고, 그 뒤 산 마을 집이 별장
    const b = await account(200_000);
    await store.create({ id: houseIdFor(b, "sea"), owner: b, name: "옛 오두막", intro: "", ownerName: "b", tier: "small", ch, lot: null, now: 1, zone: "sea", paid: 9_000 });
    const pb = await points(b);
    await buyPlot(store, b, "마을", "", "b", null, ch);
    expect(pb - (await points(b))).toBe(8_000);
    expect((await store.get(houseIdFor(b, "sea")))?.villa).toBe(false);
    expect((await store.get(houseIdFor(b)))?.villa).toBe(true);
  });

  it("동시에 두 집을 사도 둘 다 첫 집 값이 되지 않는다 (하나는 VILLA_CHANGED로 돌려준다)", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    const ch = nextCh();
    const p = await points(a);
    const r = await Promise.allSettled([buyPlot(store, a, "마을", "", "a", null, ch), buyCampHome(store, a, "", "", "a", FOREST, ch)]);
    const ok = r.filter((x) => x.status === "fulfilled");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const firstHouses = [await store.get(houseIdFor(a)), await store.get(houseIdFor(a, "camp"))].filter((h) => h && !h.villa);
    expect(firstHouses.length).toBe(1);
    for (const x of r) if (x.status === "rejected") expect(x.reason).toMatchObject({ code: "VILLA_CHANGED", message: expect.stringContaining("다주택자 가격") });
    const paid = [await store.get(houseIdFor(a)), await store.get(houseIdFor(a, "camp"))].reduce((s, h) => s + (h?.paid ?? 0), 0);
    expect(p - (await points(a))).toBe(paid);
  });

  it("기본 가구는 사지도 팔지도 못한다 · 배치 저장은 그 종류 기본 가구가 하나씩 있어야 · 가구 수는 앞마당 단계로", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000);
    const ch = nextCh();
    const r = await buyCampHome(store, a, "", "", "a", FOREST, ch);
    await expect(buyFurniture(store, a, "fx_cv_bed", 0, "camp")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(buyFurniture(store, a, "fx_cv_bed", 0, "camp", true)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(sellFurniture(store, a, "fx_cv_bed", "camp")).rejects.toMatchObject({ code: "FIXTURE" });
    await expect(buyFurniture(store, a, "roof_red", 0, "camp")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const base = r.house!.layout;
    await expect(saveLayout(store, a, "small", { ...base, items: base.items.slice(1) }, ch, "camp")).rejects.toMatchObject({ code: "FIXTURE" });
    // 옮기고 돌린 기본 가구 + 산 가구
    for (let i = 0; i < 20; i++) await buyFurniture(store, a, "pot", 0, "camp");
    for (let i = 0; i < 10; i++) await buyFurniture(store, a, "bush", 0, "camp");
    const kind = (n: number) => (n < 20 ? "pot" : "bush");
    const free: Placed[] = [];
    const used = new Set(["0,0", "1,0", "0,1", "1,1", "3,0", "4,0", "3,1", "4,1", "5,0", "6,0", "8,0", "9,0", "8,1", "9,1", "4,5", "5,5"]);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) if (!used.has(`${x},${y}`)) free.push({ u: `p${free.length}`, i: kind(free.length), x, y, r: 0 });
    const turned = base.items.map((it) => (it.i === "fx_cv_bed" ? { ...it, r: 6 } : it));
    const saved = await saveLayout(store, a, "small", { ...base, items: [...turned, ...free.slice(0, 22)] }, ch, "camp");
    expect(saved.house?.layout.items.length).toBe(4 + 22);
    expect(saved.inventory).toMatchObject({ pot: 20, bush: 10 });
    await expect(saveLayout(store, a, "small", { ...base, items: [...turned, ...free.slice(0, 23)] }, ch, "camp")).rejects.toMatchObject({ code: "TOO_MANY" });
    // 앞마당 2단계면 30개까지 (방 12×7)
    await upgradeYard(store, a, ch);
    const wider: Placed[] = [...free.slice(0, 23)];
    for (let y = 0; y < 7 && wider.length < 30; y++) for (let x = 10; x < 12 && wider.length < 30; x++) wider.push({ u: `q${wider.length}`, i: kind(wider.length), x, y, r: 0 });
    expect((await saveLayout(store, a, "small", { ...base, items: [...turned, ...wider] }, ch, "camp")).house?.layout.items.length).toBe(34);
    // 관리 기록: 놓은 물건 수는 기본 가구를 빼고
    expect((await store.get(houseIdFor(a, "camp")))?.items).toBe(30);
  });

  it("11/26 카라반 단계를 올리면 안 옮긴 기본 가구는 커진 방 시작 자리로, 옮긴 집·자리가 막힌 집은 그대로 (놓인 물건은 늘 방 안)", async () => {
    const store = new MemoryHouseStore();
    const fixtures = (l: HouseLayout) => l.items.filter((q) => furnitureById(q.i)?.fixture).map(({ i, x, y, r }) => ({ i, x, y, r }));
    const spots = (y: 1 | 2 | 3) => CARAVAN_STARTER[y].map(({ i, x, y: yy, r }) => ({ i, x, y: yy, r }));
    // ① 안 옮긴 집: 1 → 2 → 3단계마다 시작 자리로 (점수·놓은 개수는 그대로)
    const a = await account(200_000);
    const ch = nextCh();
    const r1 = await buyCampHome(store, a, "", "", "a", FALLS, ch);
    expect(fixtures(r1.house!.layout)).toEqual(expect.arrayContaining(spots(1)));
    const r2 = await upgradeYard(store, a, ch);
    expect(fixtures(r2.house!.layout)).toEqual(expect.arrayContaining(spots(2)));
    const r3 = await upgradeYard(store, a, ch);
    expect(fixtures(r3.house!.layout)).toEqual(expect.arrayContaining(spots(3)));
    expect(validateLayout(r3.house!.layout, houseShape(r3.house!), {})).toMatchObject({ ok: true });
    expect(r3.house!.score).toBe(r1.house!.score + campSizeBonus(FALLS, "small", 3));
    // ② 주인이 화장실 칸을 옮긴 집: 그대로
    const b = await account(200_000);
    const bb = await buyCampHome(store, b, "", "", "b", RIVER, ch);
    const moved = { ...bb.house!.layout, items: bb.house!.layout.items.map((q) => (q.i === "fx_cv_toilet" ? { ...q, y: 3 } : q)) };
    await saveLayout(store, b, "small", moved, ch, "camp");
    expect(fixtures((await upgradeYard(store, b, ch)).house!.layout)).toEqual(fixtures(moved));
    // ③ 새 자리에 주인 화분이 있으면: 그대로 (화분 자리도 그대로)
    const c = await account(200_000);
    const cc = await buyCampHome(store, c, "", "", "c", FOREST, ch);
    await buyFurniture(store, c, "pot", 0, "camp");
    const potted = { ...cc.house!.layout, items: [...cc.house!.layout.items, { u: "a1", i: "pot", x: 7, y: 0, r: 0 }] };
    await saveLayout(store, c, "small", potted, ch, "camp");
    const c2 = await upgradeYard(store, c, ch);
    expect(c2.house!.layout.items).toEqual(potted.items);
    // ④ 첫 판 시작 자리(침대·부엌·식탁이 왼쪽에 몰린) 집도 「안 옮긴 집」 — 기록을 옛 자리로 돌려 놓고 올려 본다
    const d = await account(200_000);
    const other = CAMP_LOTS.find((l) => l.kind === "caravan" && ![FALLS, RIVER, FOREST].includes(l.lot))!.lot;
    await buyCampHome(store, d, "", "", "d", other, ch);
    const old = { ...campStarterLayout("caravan"), items: CARAVAN_STARTER_OLD.map((q) => ({ ...q })) };
    await saveLayout(store, d, "small", old, ch, "camp");
    expect(fixtures((await upgradeYard(store, d, ch)).house!.layout)).toEqual(expect.arrayContaining(spots(2)));
  });

  it("공용 가방: 캠핑장 집에 놓은 가구는 마을·포구에서 다른 집에 있다고 나오고, 세 집 합쳐 가진 것까지", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000);
    const ch = nextCh();
    await buyPlot(store, a, "마을", "", "a", null, ch);
    await buyCottage(store, a, "오두막", "", "a", null, ch);
    const c = await buyCampHome(store, a, "", "", "a", RURAL, ch);
    await buyFurniture(store, a, "stone_lantern", 0, "camp");
    await buyFurniture(store, a, "stone_lantern", 0, "sea");
    const lantern = { u: "l1", i: "stone_lantern", x: 8, y: 6, r: 0 };
    await saveLayout(store, a, "small", { ...c.house!.layout, items: [...c.house!.layout.items, lantern] }, ch, "camp");
    expect((await myHouse(store, a)).inventory.stone_lantern).toBe(1);
    expect((await myHouse(store, a)).away?.stone_lantern).toBe(1);
    await saveLayout(store, a, "small", { items: [{ ...lantern, x: 1, y: 1 }], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL }, ch);
    expect((await myHouse(store, a, undefined, "sea")).inventory.stone_lantern ?? 0).toBe(0);
    await expect(saveLayout(store, a, "small", { items: [{ ...lantern, x: 1, y: 1 }], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL }, ch, "sea")).rejects.toMatchObject({ code: "NOT_OWNED" });
    await expect(sellFurniture(store, a, "stone_lantern", "sea")).rejects.toMatchObject({ code: "PLACED" });
  });

  it("눈꽃 창가(창문 모양)는 가진 집 수만큼: 집 한 채면 1장, 두 채면 2장, 세 채면 3장", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000);
    const ch = nextCh();
    await buyPlot(store, a, "마을", "", "a", null, ch);
    await buyFurniture(store, a, "frost_window", 0, "village", true);
    await expect(buyFurniture(store, a, "frost_window", 0, "village", true)).rejects.toMatchObject({ code: "MAX_OWNED" });
    await buyCampHome(store, a, "", "", "a", FOREST, ch);
    await buyFurniture(store, a, "frost_window", 0, "camp", true);
    await expect(buyFurniture(store, a, "frost_window", 0, "village", true)).rejects.toMatchObject({ code: "MAX_OWNED" });
    await buyCottage(store, a, "오두막", "", "a", null, ch);
    const r = await buyFurniture(store, a, "frost_window", 0, "sea", true);
    expect((r.inventory.frost_window ?? 0) + (r.away?.frost_window ?? 0)).toBe(3);
    // 두 집이 각자 창문으로 쓴다
    const camp = (await myHouse(store, a, undefined, "camp")).house!.layout;
    await saveLayout(store, a, "small", { ...camp, window: "frost_window" }, ch, "camp");
    await saveLayout(store, a, "small", { items: [], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL, window: "frost_window" }, ch);
    expect((await myHouse(store, a, undefined, "sea")).inventory.frost_window).toBe(1);
  });

  it("가구점 밖 판매처가 넣을 집: 캠핑장 집만 있어도 camp", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    expect(await furnitureZone(store, a)).toBeNull();
    await buyCampHome(store, a, "", "", "a", FOREST, nextCh());
    expect(await furnitureZone(store, a)).toBe("camp");
  });

  it("7일 철거: 캠핑장 집도 낸 값(분양+앞마당) 100%를 선물로, 터가 비어 다시 분양된다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000, T);
    const ch = nextCh();
    await buyCampHome(store, a, "", "", "a", PENSION, ch);
    await upgradeYard(store, a, ch);
    await upgradeYard(store, a, ch);
    const rep = await sweepReclaim(store, T + RECLAIM_MS + 1, { force: true, since: 0 });
    const done = rep.reclaimed.find((d) => d.id === houseIdFor(a, "camp"));
    expect(done).toMatchObject({ points: 9_000 + 13_500 + 22_500, label: `${ch}채널 언젠가 캠핑장 솔바람채 펜션` });
    expect(await store.get(houseIdFor(a, "camp"))).toBeNull();
    const b = await account(100_000);
    await buyCampHome(store, b, "", "", "b", PENSION, ch);
    const before = await points(a);
    expect(await deliverReclaim(store, a, T + RECLAIM_MS + 2)).toContain("45,000P");
    const inbox = await getGifts().inbox(a, 1, T + RECLAIM_MS + 3);
    expect(inbox.some((g) => g.points === 45_000)).toBe(true);
    // 선물함으로 가므로 지갑은 받을 때까지 그대로
    expect(await points(a)).toBe(before);
  });

  it("꾸밈 점수 순위에 캠핑장 집도 (이름 = 언젠가 캠핑장 …), 내 집 표시", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    const ch = nextCh();
    await buyCampHome(store, a, "", "", "a", RURAL, ch);
    await upgradeYard(store, a, ch);
    const r = await houseRank(store, "all", a, 10);
    // 크기 점수 = 2단계 방(14×10) +30
    expect(r.rows[0]).toMatchObject({ value: 30, me: true, sub: `${ch}채널 언젠가 캠핑장 싸리울집 촌캉스 · a` });
  });

  it("친구 창 자랑거리: 캠핑장 집도 (긴 이름·짧은 이름·채널)", async () => {
    const store = getHouseStore();
    const a = await account(200_000);
    await buyPlot(store, a, "마을", "", "a", 5, 7);
    await buyCampHome(store, a, "", "", "a", 13, 7);
    forgetFriendCard(a);
    const card = await friendCard(a);
    expect(card?.house).toMatchObject({ id: houseIdFor(a), label: "7채널 기억숲 마을 5번지", short: "마을 5번지", ch: 7 });
    expect(card?.campHouse).toMatchObject({ id: houseIdFor(a, "camp"), label: "7채널 언젠가 캠핑장 솔바람채 펜션", short: "캠핑장 솔바람채", ch: 7 });
    expect(card?.seaHouse).toBeNull();
  });
});

describe("11/26 펜션·촌캉스 기본 가구 단계별 자리", () => {
  it("단계마다 시작 자리가 그 방에 맞고(문·창 비움), 안 옮긴 집은 단계를 올리면 새 자리로 · 옮긴 집은 그대로 · 놓은 물건과 겹치면 그대로", () => {
    for (const kind of ["pension", "rural"] as const) {
      const shapes = ([1, 2, 3] as const).map((y) => houseShape({ zone: "camp", tier: "small", camp: { kind, yard: y } }));
      ([1, 2, 3] as const).forEach((y, i) => {
        const layout = { ...campStarterLayout(kind), items: CAMP_HOME_STARTER[kind][y].map((q) => ({ ...q })) };
        expect(validateLayout(layout, shapes[i], {}), `${kind} ${y}단계`).toMatchObject({ ok: true });
        // 위 벽 창 칸에는 기본 가구를 두지 않는다 (2·3단계 — 1단계는 예전 자리 그대로)
        if (y > 1) for (const q of CAMP_HOME_STARTER[kind][y]) for (const w of roomPlan(shapes[i]).windows) if (q.y === 0) expect(q.x + 2 <= w.x || q.x >= w.x + w.w || q.i === "fx_pn_tv" || q.i === "fx_rr_jagae", `${kind} ${y} ${q.i}`).toBe(true);
      });
      const start = campStarterLayout(kind);
      const to2 = campFixturesForYard(start, 2, shapes[1])!;
      expect(to2.items.map((p) => [p.i, p.x, p.y])).toEqual(CAMP_HOME_STARTER[kind][2].map((q) => [q.i, q.x, q.y]));
      const to3 = campFixturesForYard(to2, 3, shapes[2])!;
      expect(to3.items.map((p) => [p.i, p.x, p.y])).toEqual(CAMP_HOME_STARTER[kind][3].map((q) => [q.i, q.x, q.y]));
      // 하나라도 옮겼으면 그대로
      const moved = { ...start, items: start.items.map((p, i) => (i === 0 ? { ...p, x: p.x + 1, y: 6 } : p)) };
      expect(campFixturesForYard(moved, 2, shapes[1])).toBeNull();
    }
  });

  it("11/26 3단계 18×12: 기본 가구는 방 안·문(8~9칸 아래 줄)·창(3~4·13~14칸) 밖, 2→3단계로 올려도 2단계 방 어느 칸에 둔 물건이든 그대로 방 안", () => {
    for (const kind of ["pension", "rural"] as const) {
      const [s1, s2, s3] = ([1, 2, 3] as const).map((y) => houseShape({ zone: "camp", tier: "small", camp: { kind, yard: y } }));
      expect([s2.w, s2.h, s3.w, s3.h]).toEqual([14, 10, 18, 12]);
      expect(roomPlan(s3).windows).toEqual([{ x: 3, w: 2 }, { x: 13, w: 2 }]);
      for (const q of CAMP_HOME_STARTER[kind][3]) {
        const d = furnitureById(q.i)!;
        expect(q.x + d.w <= s3.w && q.y + d.h <= s3.h, `${kind} ${q.i} 방 안`).toBe(true);
        expect(q.y + d.h <= s3.h - 1 || q.x + d.w <= 8 || q.x >= 10, `${kind} ${q.i} 문`).toBe(true);
        if (q.y === 0) for (const w of roomPlan(s3).windows) expect(q.x + d.w <= w.x || q.x >= w.x + w.w, `${kind} ${q.i} 창`).toBe(true);
      }
      // 2단계 시작 자리 + 화분·침대·러그를 2단계 방 모든 칸에 하나씩 → 놓을 수 있던 배치는 3단계에서도 된다
      const base2 = { ...campStarterLayout(kind), items: CAMP_HOME_STARTER[kind][2].map((q) => ({ ...q })) };
      let tried = 0;
      for (const [it, r] of [["pot", 0], ["bed", 0], ["rug", 0]] as const)
        for (let y = 0; y < s2.h; y++)
          for (let x = 0; x < s2.w; x++) {
            const l = { ...base2, items: [...base2.items, { u: "a1", i: it, x, y, r }] };
            if (!validateLayout(l, s2, null).ok) continue;
            tried++;
            expect(validateLayout(l, s3, null).ok, `${kind} ${it} ${x},${y} → 3단계`).toBe(true);
            // 안 옮긴 기본 가구는 3단계 자리로 옮기거나(겹치면) 그대로 — 어느 쪽이든 방 안
            const up = campFixturesForYard(l, 3, s3) ?? l;
            expect(validateLayout(up, s3, null).ok).toBe(true);
          }
      expect(tried).toBeGreaterThan(100);
      // 1단계 배치도 3단계로 바로 (옛 넓힌 집 기록)
      expect(validateLayout(campStarterLayout(kind), s3, {}).ok).toBe(true);
      expect(s1.w).toBe(10);
    }
  });
});
