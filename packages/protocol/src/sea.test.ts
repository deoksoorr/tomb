import { describe, expect, it } from "vitest";
import { CAMP_SEATS, MAP_TAG, SEATS, SEA_ARRIVE, SEA_BOARD, SEA_SEATS, inMapBounds, isAwayMap, mapAllowed, mapOf, mapSpawn, seaColliders, seatSlotIn, SEA_HEIGHT, SEA_WIDTH, SEA_LOTS, SEA_SPOTS, SPAWN, seaWet, tideLineY, SEA_GHOST_BERTH, SEA_PIER_END, SEA_FISHING_SPOTS, SEA_REST_SEATS, seaViewOfSeat, seaSeatGroup, seaSeatById, STATE, seaFishingSpotById, seaFishMinLevel, seaFishWet, seaFishWetAt, seaFishDryAt, seaFishBobber, SEA_FISH_WET_MARGIN, tideMinute, FISHING_SPOTS, CAMP_FISHING_SPOTS, anyFishingWaterOf, SEA_BUOYS, SEA_ROCKS, onSeaRoad, SEA_ROAD, SEA_BUS_STOP, TIDE_HIGH_Y, TIDE_LOW_Y, SEA_DEEP_Y, SEA_FLAT_Y0, SEA_DIG_HOLES, TIDE_OPEN_LEVEL } from "./index";

// 11/16 달물결 포구: 세 번째 맵 (protocol sea.ts). 맵 id·허락·좌석·충돌 기본 규칙

const hit = (x: number, y: number) => seaColliders().some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);

describe("sea map (protocol)", () => {
  it("맵 id·이름표·허락", () => {
    expect(mapOf("sea")).toBe("sea");
    expect(mapOf("ocean")).toBe("village");
    expect(isAwayMap("sea")).toBe(true);
    expect(MAP_TAG.sea).toBe("[바닷가]");
    expect(mapAllowed("sea", { sea: true })).toBe(true);
    expect(mapAllowed("sea", { camp: true })).toBe(false);
    expect(mapAllowed("village", {})).toBe(true);
    expect(mapSpawn("sea", SPAWN)).toEqual(SEA_ARRIVE);
    expect(inMapBounds("sea", SEA_WIDTH, SEA_HEIGHT)).toBe(true);
    expect(inMapBounds("sea", SEA_WIDTH + 1, 10)).toBe(false);
  });
  it("좌석 id는 마을·캠핑장과 겹치지 않고, 바닷가 좌석만 받는다", () => {
    const others = new Set([...SEATS, ...CAMP_SEATS].map((s) => s.id));
    for (const s of SEA_SEATS) {
      expect(s.id.startsWith("p")).toBe(true);
      expect(others.has(s.id)).toBe(false);
      expect(seatSlotIn("sea", s.id)?.kind).toBe("seat");
    }
    expect(seatSlotIn("sea", "qL1")).toBeUndefined();
    expect(seatSlotIn("sea", "lA-0")).toBeUndefined();
  });
  it("도착·타는 자리는 막히지 않고, 11/16 먼바다도 헤엄칠 수 있게 막지 않는다 (낚싯배만)", () => {
    expect(hit(SEA_ARRIVE.x, SEA_ARRIVE.y)).toBe(false);
    expect(hit(SEA_BOARD.x, SEA_BOARD.y)).toBe(false);
    expect(hit(300, SEA_DEEP_Y + 20)).toBe(false);
    expect(seaWet(300, SEA_DEEP_Y + 20, 0)).toBe(true);
    // 갯벌은 물때와 상관없이 막지 않는다
    for (let y = TIDE_HIGH_Y + 4; y < TIDE_LOW_Y; y += 16) expect(hit(420, y), `${y}`).toBe(false);
    expect(tideLineY(1)).toBeLessThan(tideLineY(0));
  });
  it("11/16 유령선 자리: 선착장 끝 서쪽 깊은 물이 비어 있고 건널판은 선착장 끝 데크 가장자리", () => {
    const B = SEA_GHOST_BERTH;
    const P = SEA_PIER_END;
    expect(B.clear.x + B.clear.w).toBeLessThanOrEqual(P.x);
    expect(B.clear.w).toBeGreaterThanOrEqual(B.w);
    expect(B.ship.y).toBeGreaterThan(SEA_DEEP_Y);
    for (const b of SEA_BUOYS) expect(b.x >= B.clear.x && b.x <= B.clear.x + B.clear.w && b.y >= B.clear.y && b.y <= B.clear.y + B.clear.h).toBe(false);
    for (const r of SEA_ROCKS) expect(r.x + r.rx < B.clear.x || r.y + r.ry < B.clear.y || r.x - r.rx > B.clear.x + B.clear.w).toBe(true);
    expect(B.gangway.x).toBeGreaterThanOrEqual(P.x);
    expect(B.gangway.y).toBeGreaterThanOrEqual(P.y);
    expect(B.gangway.y).toBeLessThanOrEqual(P.y + P.h);
  });
  it("11/16 갯바위 낚시 자리: 마을·캠핑장 자리와 id가 겹치지 않고, 바닷가 좌석(낚시 자리)으로 받아요", () => {
    const others = new Set([...FISHING_SPOTS, ...CAMP_FISHING_SPOTS].map((s) => s.id));
    const ids = new Set<string>();
    for (const f of SEA_FISHING_SPOTS) {
      expect(f.id.startsWith("f_"), f.id).toBe(true);
      expect(others.has(f.id), f.id).toBe(false);
      expect(ids.has(f.id), f.id).toBe(false);
      ids.add(f.id);
      expect(seatSlotIn("sea", f.id)).toMatchObject({ kind: "fish", x: f.x, y: f.y });
      expect(seatSlotIn("village", f.id)).toBeUndefined();
      expect(anyFishingWaterOf(f.id)).toBe(f.water);
      expect(inMapBounds("sea", f.x, f.y)).toBe(true);
      // 만조에도 발판(데크) 위라 헤엄치지 않고 앉아요
      expect(seaWet(f.x, f.y, 1)).toBe(false);
    }
    expect(SEA_FISHING_SPOTS.length).toBeGreaterThanOrEqual(6);
  });
  it("11/16 간조에도 바다가 넉넉히: 갯벌 아래 35% 넘게는 늘 물, 갯벌 캐기 구멍은 갯벌이 열린 동안 늘 드러나요", () => {
    expect((SEA_DEEP_Y - TIDE_LOW_Y) / (SEA_DEEP_Y - SEA_FLAT_Y0)).toBeGreaterThanOrEqual(0.35);
    expect(TIDE_HIGH_Y).toBeGreaterThan(SEA_FLAT_Y0);
    // 갯벌이 열린 동안 물 높이는 TIDE_OPEN_LEVEL 아래 → 물가는 그보다 아래
    const openLine = tideLineY(TIDE_OPEN_LEVEL);
    for (const h of SEA_DIG_HOLES) {
      expect(h.y, `${h.x},${h.y}`).toBeLessThan(openLine - 6);
      expect(h.y, `${h.x},${h.y}`).toBeGreaterThan(SEA_FLAT_Y0);
    }
    // 유령선 자리는 간조에도 깊은 물
    expect(SEA_GHOST_BERTH.clear.y + 20).toBeGreaterThan(TIDE_LOW_Y);
  });
  it("11/16 갯바위 낚시 물때: 만조엔 물속, 썰물 중 정해진 분에 마르고, 밀물에 다시 물속. 선착장 끝은 늘 물속", () => {
    // 한국 자정 = 물때 0분 (만조)
    const base = Date.UTC(2026, 10, 15, 15, 0, 0);
    const at = (min: number) => base + min * 60_000;
    expect(tideMinute(at(0))).toBeCloseTo(0);
    const rock = seaFishingSpotById("f_1084_528")!;
    expect(rock).toBeDefined();
    // 11/16 r11 맵을 줄여 물가 만조 538 · 간조 620. 찌 자리 y 552, 여유 6 → 물 높이 0.902 이상이어야 물속 → 썰물 18.2분째에 말라요
    expect(TIDE_HIGH_Y).toBe(SEA_FLAT_Y0 + 50);
    expect(TIDE_LOW_Y).toBe(SEA_FLAT_Y0 + 132);
    expect(seaFishMinLevel(rock)).toBeCloseTo(0.9024, 3);
    expect(seaFishWet(rock, at(0))).toBe(true);
    expect(seaFishWet(rock, at(18))).toBe(true);
    expect(seaFishWet(rock, at(19))).toBe(false);
    expect(seaFishWet(rock, at(90))).toBe(false);
    expect(seaFishWet(rock, at(161))).toBe(false);
    expect(seaFishWet(rock, at(162))).toBe(true);
    expect((seaFishDryAt(rock, at(10)) - at(0)) / 60_000).toBeCloseTo(18.23, 1);
    expect(seaFishDryAt(rock, at(60))).toBe(at(60));
    // 밀물로 다시 물속이 된 뒤에는 다음 썰물에 말라요 (한 바퀴 180분 + 18.2분)
    expect((seaFishDryAt(rock, at(170)) - at(0)) / 60_000).toBeCloseTo(198.23, 1);
    // 갯바위 자리는 모두 만조엔 물속. 간조엔 찌 자리가 간조 물가보다 위인 자리만 말라요 (깊은 바위 앞과 선착장 끝은 늘 물속)
    for (const f of SEA_FISHING_SPOTS) {
      expect(seaFishWetAt(f, 1), f.id).toBe(true);
      const pier = f.y > SEA_PIER_END.y;
      expect(seaFishWetAt(f, 0), f.id).toBe(pier || seaFishBobber(f).y - SEA_FISH_WET_MARGIN >= TIDE_LOW_Y);
      if (pier) for (let m = 0; m < 180; m += 7) expect(seaFishWet(f, at(m))).toBe(true);
      if (pier) expect(seaFishDryAt(f, at(50))).toBe(Infinity);
    }
  });
  it("11/16 쉴거리 자리: 선베드는 눕기(lie), 돗자리·파라솔은 바닥 앉기, 벤치·끝 걸터앉기는 의자 — 모두 바닷가 좌석이에요", () => {
    // 11/16 리조트 해변: 선베드·파라솔·선베드 한 벌 여섯 → 선베드 12, 파라솔 돗자리는 없어요, 돗자리 둘 (자리 넷)
    // 11/16 돗자리도 빼고 앞줄 선베드 10 → 선베드 22
    expect(SEA_REST_SEATS.filter((r) => r.kind === "lounger")).toHaveLength(22);
    expect(SEA_REST_SEATS.filter((r) => r.kind === "parasol")).toHaveLength(0);
    expect(SEA_REST_SEATS.filter((r) => r.kind === "mat")).toHaveLength(0);
    for (const r of SEA_REST_SEATS) {
      expect(seatSlotIn("sea", r.id)).toMatchObject({ kind: "seat", state: r.kind === "lounger" ? STATE.lie : r.kind === "hammock" ? STATE.hammock : STATE.sitGround, furnitureId: r.group });
      expect(seatSlotIn("village", r.id)).toBeUndefined();
      // 해먹은 누워서 바다를 봐요 (선베드 장면)
      expect(seaViewOfSeat(r.id)).toBe(r.kind === "hammock" ? "lounger" : r.kind);
    }
    // r12 끝 걸터앉기는 끝마다 셋 · 피크닉 탁자 넷 · 모닥불 통나무 · 정원 벤치
    for (const id of ["pS1-0", "pS4-1", "pE1-0", "pE1-2", "pE2-1", "pT1n-0", "pT2s-1", "pF1", "pF4", "pG1-0"]) expect(seatSlotIn("sea", id), id).toMatchObject({ state: STATE.sitChair });
    expect(seaViewOfSeat("pT1n-0")).toBeNull();
    expect(seaViewOfSeat("pF2")).toBeNull();
    expect(seaViewOfSeat("pG1-1")).toBeNull();
    expect(seaViewOfSeat("pH")).toBe("lounger");
    expect(seaViewOfSeat("pS2-0")).toBe("beach");
    expect(seaViewOfSeat("pE1-1")).toBe("pier");
    expect(seaViewOfSeat("pE2-0")).toBe("breakwater");
    expect(seaViewOfSeat("pB-0")).toBeNull();
    expect(seaViewOfSeat("pL-1")).toBeNull();
    expect(seaSeatGroup("pZ13")).toBe("pZ13");
    expect(seaSeatGroup("pS3-1")).toBe("pS3");
    // 끝 걸터앉기는 일어서면 데크 쪽(뒤)으로
    expect(seaSeatById("pE1-1")?.standDy).toBeLessThan(0);
    expect(seaSeatById("pT1n-0")?.standDy).toBeLessThan(0);
    expect(seaSeatById("pT1s-0")?.standDy).toBeUndefined();
    // id가 겹치지 않아요
    const ids = [...SEA_SEATS.map((s) => s.id), ...SEA_REST_SEATS.map((r) => r.id), ...SEA_FISHING_SPOTS.map((f) => f.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("11/16 버스 길은 오른쪽 끝에서 정류장을 지난 돌림 마당까지만", () => {
    expect(onSeaRoad(SEA_WIDTH - 2, SEA_ROAD.y + 20)).toBe(true);
    expect(onSeaRoad(SEA_BUS_STOP.x, SEA_ROAD.y + 20)).toBe(true);
    expect(onSeaRoad(200, SEA_ROAD.y + 20)).toBe(false);
    expect(SEA_ROAD.x).toBeLessThan(SEA_BUS_STOP.x - 60);
  });
  it("다음 차수 자리: 오두막 터 6, 모래성 자리 3, 바다 보기 벤치 4", () => {
    expect(SEA_LOTS).toHaveLength(6);
    expect(SEA_SPOTS.sandcastles).toHaveLength(3);
    expect(SEA_SPOTS.benches).toHaveLength(4);
    expect(SEA_SPOTS.loungers).toHaveLength(22); // 11/16 선베드 한 벌 여섯 (12) + 앞줄 10
  });
});
