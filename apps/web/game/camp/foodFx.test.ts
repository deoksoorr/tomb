import { describe, expect, it } from "vitest";
import { bbqItem, DRUNK_STEP_MS, type PeerInfo } from "@tomb/protocol";
import { addFood, applyFoodView, DRUNK_NAMES, foodGauge, foodIdle, foodOfPeer, gaugeClock, RIDE_OBJECT_KINDS, swayFor, trailTint, type FoodView, bigSeatBlocked } from "./foodState";

// 11/15 바베큐장 먹거리·마실 거리 효과: 커지기·빨라지기·취기는 따로 겹친다
describe("foodFx", () => {
  it("갈래마다 따로 겹치고, 같은 갈래만 새 것이 덮어쓴다", () => {
    let f = addFood({}, "pork", 1000);
    f = addFood(f, "coffee", 2000);
    f = addFood(f, "beer", 3000, 1, 500);
    expect(f).toEqual({ grow: { i: "pork", u: 1000 }, spd: { i: "coffee", u: 2000 }, drunk: { lv: 1, at: 500 } });
    f = addFood(f, "marsh", 4000);
    expect(f.grow).toEqual({ i: "marsh", u: 4000 });
    expect(f.spd).toEqual({ i: "coffee", u: 2000 });
  });
  it("접속자 정보에서 효과를 읽는다 (모양이 틀리면 버린다)", () => {
    const p = { sid: 1, bbq: { i: "pork", u: 9 }, spd: { i: "nope", u: 9 }, drunk: { lv: 2, at: 1 } } as unknown as PeerInfo;
    expect(foodOfPeer(p)).toEqual({ grow: { i: "pork", u: 9 }, drunk: { lv: 2, at: 1 } });
  });
  it("취기 단계별 휘청 폭 (1은 홍조만), 다 끝났는지", () => {
    expect(swayFor(1)).toBe(0);
    expect(swayFor(2)).toBeGreaterThan(0);
    expect(swayFor(4)).toBeGreaterThan(swayFor(3));
    expect(foodIdle({ drunk: { lv: 1, at: 0 } }, DRUNK_STEP_MS - 1)).toBe(false);
    expect(foodIdle({ drunk: { lv: 1, at: 0 } }, DRUNK_STEP_MS)).toBe(true);
    expect(foodIdle({ grow: { i: "pork", u: 5 } }, 6)).toBe(true);
  });
  it("번개 닭꼬치만 잔상, 끝나면 꺼진다", () => {
    expect(trailTint(addFood({}, "zap", 100), 50)).toBe(bbqItem("zap")!.tint);
    expect(trailTint(addFood({}, "coffee", 100), 50)).toBeNull();
    expect(trailTint(addFood({}, "zap", 100), 100)).toBeNull();
  });
  it("아바타 그림에는 바뀐 것만 넣는다 (3배 커지기·잔상·취기)", () => {
    const calls: string[] = [];
    const view: FoodView = {
      setBig: (k, t) => calls.push(`big ${k} ${t}`),
      setDrunk: (lv) => calls.push(`drunk ${lv}`),
      setTrail: (t) => calls.push(`trail ${t}`),
    };
    // 아무 효과 없을 때 처음: 크기·취기는 원래대로 넣고 잔상은 건드리지 않는다
    let c = applyFoodView(view, {}, 0, null);
    expect(calls).toEqual(["big 1 null", "drunk 0"]);
    calls.length = 0;
    const f = addFood(addFood({}, "wholepork", 1000), "zap", 500);
    c = applyFoodView(view, f, 10, c);
    expect(calls).toEqual([`big 3 ${bbqItem("wholepork")!.tint}`, `trail ${bbqItem("zap")!.tint}`]);
    calls.length = 0;
    c = applyFoodView(view, f, 20, c);
    expect(calls).toEqual([]);
    applyFoodView(view, f, 600, c);
    expect(calls).toEqual(["trail null"]);
  });
  it("컨디숑은 취기를 내린 단계로 바꾸고, 0이면 취기를 지운다", () => {
    let f = addFood({}, "soju", 9, 2, 100);
    f = addFood(f, "hangover", 200, 1, 200);
    expect(f.drunk).toEqual({ lv: 1, at: 200 });
    f = addFood(f, "hangover", 300, 0, 300);
    expect(f.drunk).toBeUndefined();
  });
  it("효과 게이지: 커지기·빨라지기(잔상)·취기(단계 이름, 한 단계 깨기까지)", () => {
    const now = 1_000_000;
    let f = addFood({}, "wholepork", now + 90_000);
    f = addFood(f, "zap", now + 120_000);
    f = addFood(f, "beer", 0, 3, now - 4 * 60_000);
    const rows = foodGauge(f, now);
    expect(rows.map((r) => r.kind)).toEqual(["grow", "speed", "drunk"]);
    expect(rows[0]).toMatchObject({ item: "wholepork", text: "3배 커짐", left: 90_000, frac: 0.5 });
    expect(rows[1]).toMatchObject({ item: "zap", text: "걸음 +35%", trail: true });
    expect(rows[2]).toMatchObject({ level: 3, name: DRUNK_NAMES[3], next: DRUNK_STEP_MS - 4 * 60_000 });
    expect(foodGauge({}, now)).toEqual([]);
    expect(foodGauge(f, now + DRUNK_STEP_MS * 3)).toEqual([]);
    expect(gaugeClock(125_000)).toBe("2:05");
  });
  it("타는 상호작용 목록 (커진 동안 막는다)", () => {
    for (const k of ["swing", "bumper", "bus", "dock", "seesaw", "trampoline", "carousel", "ferris", "balloon"]) expect(RIDE_OBJECT_KINDS.has(k)).toBe(true);
    for (const k of ["tree", "hammock", "bell", "telescope"]) expect(RIDE_OBJECT_KINDS.has(k)).toBe(false);
  });
});

describe("11/16 2배 넘게 커지면 못 앉는 자리", () => {
  it("캠핑카 문간·정류장 녹슨 벤치만, 2배까지는 앉는다", () => {
    for (const id of ["qV1", "qV2", "qV3", "qB-0", "qB-1"]) {
      expect(bigSeatBlocked(id, 2.5)).toBe(true);
      expect(bigSeatBlocked(id, 2)).toBe(false);
      expect(bigSeatBlocked(id, 1)).toBe(false);
    }
    for (const id of ["qR1", "qO1-0", "qT1-1"]) expect(bigSeatBlocked(id, 3)).toBe(false);
  });
});
