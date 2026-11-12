import { describe, expect, it } from "vitest";
import { roomPlan } from "./rooms";
import { defaultExterior, tierById } from "./catalog";
import { houseStates, setHouseState, waterPlant } from "./service";
import { keepState, liveStates, placedSig, stateSigs, stateTarget, WINDOW_SIG } from "./states";
import { MemoryHouseStore } from "./store";
import type { HouseLayout, Placed } from "./types";

// 3번 가구 상태 저장: 나갔다 와도·나중에 온 사람도 그대로, 치우거나 옮기면 정리

const lay = (items: Placed[]): HouseLayout => ({ items, floor: "floor_grass", wall: "wall_fence" });
const ID = "abcdefghijkl";
const FIRE: Placed = { u: "f1", i: "fireplace", x: 1, y: 1, r: 0 };
const LAMP: Placed = { u: "l1", i: "floor_lamp", x: 5, y: 1, r: 0 };
const RADIO: Placed = { u: "r1", i: "radio", x: 3, y: 4, r: 0 };
const POT: Placed = { u: "p1", i: "pot", x: 6, y: 4, r: 0 };

async function setup(items: Placed[] = [FIRE, LAMP, RADIO, POT]) {
  const store = new MemoryHouseStore();
  await store.create({ id: ID, owner: "own", name: "집", intro: "", ownerName: "주인", tier: "small", lot: null, now: 1 });
  for (const p of items) await store.addItem(ID, p.i, 20);
  await store.saveDesign(ID, "small", lay(items), null, {}, 1, 2);
  return store;
}

describe("가구 상태 규칙 (states.ts)", () => {
  it("상태가 남는 가구·창문만 대상이고, 값 범위가 정해져 있다", () => {
    const l = lay([FIRE, RADIO, POT]);
    expect(stateTarget(l, "small", "f1")).toEqual({ s: placedSig(FIRE), max: 1 });
    expect(stateTarget(l, "small", "r1")?.max).toBe(4);
    expect(stateTarget(l, "small", "p1")).toBeNull();
    expect(stateTarget(l, "small", "zz")).toBeNull();
    const wins = roomPlan(tierById("small")!).windows.length;
    expect(stateTarget(l, "small", "w0")).toEqual({ s: WINDOW_SIG, max: 1 });
    expect(stateTarget(l, "small", `w${wins}`)).toBeNull();
  });

  it("서명이 다르거나 범위 밖이면 읽을 때 빠지고, 배치 저장 때 남길 것만 고른다", () => {
    const l = lay([FIRE, RADIO]);
    const raw = { f1: { a: 1, s: placedSig(FIRE) }, r1: { a: 9, s: placedSig(RADIO) }, w0: { a: 1, s: WINDOW_SIG }, old: { a: 1, s: "x" } };
    expect(liveStates(l, "small", raw)).toEqual({ f1: 1, w0: 1 });
    const moved = lay([{ ...FIRE, x: 2 }]);
    const sigs = stateSigs(moved);
    expect(keepState(sigs, "f1", raw.f1)).toBe(false);
    expect(keepState(sigs, "w0", raw.w0)).toBe(true);
    expect(keepState(sigs, "old", raw.old)).toBe(false);
  });
});

describe("가구 상태 저장 (메모리 저장소 + 서비스)", () => {
  it("켜 둔 불·라디오 채널·창문이 다시 읽어도 그대로이고, 0이면 지워진다", async () => {
    const store = await setup();
    await setHouseState(store, ID, "f1", 1);
    await setHouseState(store, ID, "r1", 3);
    await setHouseState(store, ID, "w0", 1);
    expect((await houseStates(store, ID)).states).toEqual({ f1: 1, r1: 3, w0: 1 });
    await setHouseState(store, ID, "f1", 0);
    expect((await houseStates(store, ID)).states).toEqual({ r1: 3, w0: 1 });
    expect(await store.states(ID)).not.toHaveProperty("f1");
  });

  it("없는 가구·상태 없는 가구는 404, 범위 밖 값은 400", async () => {
    const store = await setup();
    await expect(setHouseState(store, ID, "nope", 1)).rejects.toMatchObject({ status: 404 });
    await expect(setHouseState(store, ID, "p1", 1)).rejects.toMatchObject({ status: 404 });
    await expect(setHouseState(store, ID, "f1", 2)).rejects.toMatchObject({ status: 400 });
    await expect(setHouseState(store, ID, "r1", 5)).rejects.toMatchObject({ status: 400 });
    await expect(setHouseState(store, ID, "f1", -1)).rejects.toMatchObject({ status: 400 });
    await expect(setHouseState(store, "zzzzzzzzzzzz", "f1", 1)).rejects.toMatchObject({ status: 404 });
  });

  it("배치 저장: 치운 가구·옮긴 가구의 상태와 없어진 화분 기록은 지우고, 그대로인 가구·창문은 남긴다", async () => {
    const store = await setup();
    await setHouseState(store, ID, "f1", 1);
    await setHouseState(store, ID, "l1", 1);
    await setHouseState(store, ID, "r1", 2);
    await setHouseState(store, ID, "w0", 1);
    await waterPlant(store, ID, "p1", 10);
    // 벽난로는 그대로, 스탠드는 옮기고, 라디오·화분은 치운다
    await store.saveDesign(ID, "small", lay([FIRE, { ...LAMP, x: 6 }]), null, {}, 1, 3);
    expect(await store.states(ID)).toEqual({ f1: { a: 1, s: placedSig(FIRE) }, w0: { a: 1, s: WINDOW_SIG } });
    expect(await store.plants(ID)).toEqual({});
    expect((await houseStates(store, ID)).states).toEqual({ f1: 1, w0: 1 });
    // 외관만 저장하면 그대로
    await store.saveDesign(ID, "small", null, defaultExterior(), {}, 1, 4);
    expect((await houseStates(store, ID)).states).toEqual({ f1: 1, w0: 1 });
  });

  it("같은 배치 id에 다른 가구를 놓으면 예전 상태는 쓰이지 않는다", async () => {
    const store = await setup();
    await setHouseState(store, ID, "f1", 1);
    await store.addItem(ID, "floor_lamp", 20);
    await store.saveDesign(ID, "small", lay([{ ...LAMP, u: "f1", x: FIRE.x, y: FIRE.y }]), null, {}, 1, 3);
    expect((await houseStates(store, ID)).states).toEqual({});
  });
});
