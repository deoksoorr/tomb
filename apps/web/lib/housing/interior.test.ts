import { DIR, seatSlot, STATE } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { houseSpots, houseTargets, itemDepthY, pickTarget, pianoFreq, clockText, T } from "@/game/housing/interact";
import { FURNITURE, furnitureById, PLOT_TIERS, tierById } from "./catalog";
import { findFreeSpot, validateLayout } from "./layout";
import { GROW_MS, plantStage, WATER_COOLDOWN_MS, waterWait, watered } from "./plants";
import { doorwayTiles, partitionViolation, roomPlan } from "./rooms";
import { MemoryHouseStore } from "./store";
import { housePlants, waterPlant } from "./service";
import type { HouseLayout, Placed } from "./types";

// 3번 집 안 개편: 방 구조·칸막이 규칙·가구 자리·화분 자람

const lay = (items: Placed[]): HouseLayout => ({ items, floor: "floor_grass", wall: "wall_fence" });
const F = { ox: 32, oy: 66 };

describe("방 구조 (터 크기별)", () => {
  it("작은 터는 방 하나, 넓은 터는 둘, 대저택은 셋이고 방마다 창문이 있다", () => {
    const n = PLOT_TIERS.map((t) => roomPlan(t).rooms.length);
    expect(n).toEqual([1, 2, 3]);
    for (const t of PLOT_TIERS) {
      const plan = roomPlan(t);
      expect(plan.partitions.length).toBe(plan.rooms.length - 1);
      for (const r of plan.rooms) expect(plan.windows.some((w) => w.x >= r.x0 && w.x + w.w <= r.x1)).toBe(true);
      // 칸막이 문은 집 안 줄이고, 현관(아래 가운데 2칸)은 칸막이에 걸리지 않는다
      for (const p of plan.partitions) {
        expect(p.door[0]).toBeGreaterThan(0);
        expect(p.door[1]).toBeLessThan(t.h - 1);
        expect(p.x === t.w / 2 || p.x === t.w / 2 - 1 + 1).toBe(false);
      }
    }
  });

  it("물건은 칸막이 벽을 가로지를 수 없고, 칸막이 문 앞에는 서 있는 물건을 둘 수 없다 (러그는 된다)", () => {
    const wide = tierById("wide")!;
    const plan = roomPlan(wide);
    const px = plan.partitions[0].x;
    expect(partitionViolation(plan, px - 1, 0, 2, 1, true)).toMatch(/가로질러/);
    expect(partitionViolation(plan, px, 0, 2, 1, true)).toBeNull();
    const d = doorwayTiles(plan)[0];
    expect(partitionViolation(plan, d.x, d.y, 1, 1, true)).toMatch(/문 앞/);
    expect(partitionViolation(plan, d.x, d.y, 1, 1, false)).toBeNull();
    // 서버 검증도 같은 규칙
    const bad = validateLayout(lay([{ u: "a1", i: "desk", x: px - 1, y: 1, r: 0 }]), "wide", null);
    expect(bad.ok).toBe(false);
    expect(validateLayout(lay([{ u: "a1", i: "desk", x: px, y: 1, r: 0 }]), "wide", null).ok).toBe(true);
    // 작은 터는 칸막이가 없다
    expect(validateLayout(lay([{ u: "a1", i: "desk", x: 4, y: 1, r: 0 }]), "small", null).ok).toBe(true);
    // 빈자리 찾기도 칸막이를 피한다
    const spot = findFreeSpot([], wide, furnitureById("bed")!, 0, px, 2);
    expect(spot && partitionViolation(plan, spot.x, spot.y, 2, 2, true)).toBeNull();
  });
});

describe("집 안 가구 자리 (한 자리 한 명)", () => {
  const small = tierById("small")!;

  it("침대·책장·욕조·소파·의자·책상·피아노가 자리를 만들고, 자리 id는 서버가 아는 집 안 자리다", () => {
    const items: Placed[] = [
      { u: "bed1", i: "bed", x: 0, y: 0, r: 0 },
      { u: "bs1", i: "bookshelf", x: 3, y: 0, r: 0 },
      { u: "tub1", i: "bathtub", x: 6, y: 0, r: 0 },
      { u: "so1", i: "sofa", x: 0, y: 4, r: 0 },
      { u: "dk1", i: "desk", x: 6, y: 3, r: 0 },
      { u: "ch1", i: "chair", x: 6, y: 4, r: 0 },
      { u: "pi1", i: "piano", x: 3, y: 4, r: 0 },
    ];
    const spots = houseSpots(items, small, F);
    const by = (u: string) => spots.filter((s) => s.u === u);
    expect(by("bed1")).toHaveLength(1);
    expect(by("bed1")[0]).toMatchObject({ kind: "bed", use: "lie" });
    expect(seatSlot(by("bed1")[0].id)).toMatchObject({ state: STATE.lie });
    expect(by("bs1")[0]).toMatchObject({ kind: "book", use: "read", inside: false });
    expect(by("tub1")[0]).toMatchObject({ kind: "tub", use: "bath" });
    expect(by("so1")).toHaveLength(2);
    // 책상 바로 앞에 의자가 있으면 그 의자가 "앉아서 일하기" 자리이고, 책상 앞자리는 따로 생기지 않는다
    expect(by("dk1")).toHaveLength(0);
    expect(by("ch1")[0]).toMatchObject({ use: "type", facing: DIR.up });
    expect(by("pi1")[0]).toMatchObject({ use: "piano", facing: DIR.up, inside: false });
    // 같은 배치면 누구 화면에서든 같은 id (서버가 한 자리 한 명을 판정할 수 있게)
    expect(houseSpots(structuredClone(items), small, F).map((s) => s.id)).toEqual(spots.map((s) => s.id));
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
  });

  it("앉거나 누운 사람이 가구 위에 그려지도록 가구 depth가 자리 앵커보다 낮다", () => {
    const items: Placed[] = [{ u: "bed1", i: "bed", x: 2, y: 2, r: 0 }];
    const spots = houseSpots(items, small, F);
    expect(itemDepthY(items[0], furnitureById("bed")!, spots, F)).toBeLessThan(spots[0].y);
  });

  it("가까운 대상 고르기: 다른 사람이 앉은 소파 자리 대신 빈자리", () => {
    const items: Placed[] = [{ u: "so1", i: "sofa", x: 2, y: 2, r: 0 }];
    const plan = roomPlan(small);
    const targets = houseTargets(items, small, plan, F);
    const sofa = targets.filter((t) => t.spot);
    const px = F.ox + 2 * T + 8;
    const py = F.oy + 3 * T + 6;
    const first = pickTarget(targets, px, py)!;
    expect(first.spot?.x).toBe(F.ox + 2 * T + 8);
    const other = pickTarget(targets, px, py, (id) => id === first.spot!.id)!;
    expect(other.key).toBe(sofa.find((s) => s.key !== first.key)!.key);
    // 창문도 대상이다 (방마다)
    expect(targets.filter((t) => t.use === "window")).toHaveLength(plan.windows.length);
    // 멀면 없음
    expect(pickTarget(targets, px + 200, py + 200)).toBeNull();
  });

  it("피아노 음·시계 문구", () => {
    expect(pianoFreq(0)).toBeCloseTo(261.63, 1);
    expect(pianoFreq(7)).toBeCloseTo(523.26, 0);
    expect(clockText(Date.UTC(2026, 0, 1, 6, 5))).toBe("지금은 오후 3시 5분이에요.");
  });
});

describe("새 가구 카탈로그", () => {
  it("생활 가구 8종이 상점에 있고, 가격·점수가 기존 가구 범위와 어울린다", () => {
    const living = FURNITURE.filter((f) => f.category === "living");
    expect(living.map((f) => f.id).sort()).toEqual(["bathtub", "cat_cushion", "fireplace", "floor_lamp", "fridge", "grand_clock", "piano", "radio"]);
    for (const f of living) {
      // I0c: 가구값은 4배로 올렸고 점수는 그대로라, 점수/가격 하한도 1/4
      expect(f.price).toBeGreaterThanOrEqual(120);
      expect(f.price).toBeLessThanOrEqual(520);
      expect(f.score / f.price).toBeGreaterThan(0.15 / 4);
      expect(f.use).toBeTruthy();
    }
    // 써 볼 수 있는 가구 10종 이상
    expect(FURNITURE.filter((f) => f.use).length).toBeGreaterThanOrEqual(10);
  });
});

describe("화분 물 주기 → 자람", () => {
  it("물을 주면 GROW_MS 뒤 한 단계 자라고, 쿨다운 동안은 다시 줄 수 없다", () => {
    const t0 = 1_000_000;
    let s = watered(undefined, t0);
    expect(plantStage(s, t0)).toBe(0);
    expect(plantStage(s, t0 + GROW_MS)).toBe(1);
    expect(waterWait(s, t0 + 1000)).toBe(WATER_COOLDOWN_MS - 1000);
    s = watered(s, t0 + WATER_COOLDOWN_MS);
    s = watered(s, t0 + 2 * WATER_COOLDOWN_MS);
    s = watered(s, t0 + 3 * WATER_COOLDOWN_MS);
    s = watered(s, t0 + 4 * WATER_COOLDOWN_MS);
    expect(plantStage(s, t0 + 5 * WATER_COOLDOWN_MS)).toBe(3);
  });

  it("서비스: 놓인 화분에만, 누구든, 쿨다운 안이면 409", async () => {
    const store = new MemoryHouseStore();
    const id = "abcdefghijkl";
    await store.create({ id, owner: "own", name: "집", intro: "", ownerName: "주인", tier: "small", lot: null, now: 1 });
    await store.addItem(id, "pot", 20);
    const layout = lay([{ u: "p1", i: "pot", x: 1, y: 1, r: 0 }]);
    await store.saveDesign(id, "small", layout, null, { pot: 1 }, 2, 2);
    await expect(waterPlant(store, id, "nope", 10)).rejects.toMatchObject({ status: 404 });
    const r = await waterPlant(store, id, "p1", 10);
    expect(r.plants.p1).toEqual({ n: 1, at: 10 });
    await expect(waterPlant(store, id, "p1", 20)).rejects.toMatchObject({ status: 409 });
    expect((await housePlants(store, id, 30)).plants.p1.n).toBe(1);
  });
});
