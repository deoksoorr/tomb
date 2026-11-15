import { describe, expect, it } from "vitest";
import {
  CAMP_ARRIVE,
  CAMP_BOARD,
  CAMP_BUS_STOP,
  CAMP_CAMPFIRE,
  campCampfireOfSeat,
  CAMP_DECKS,
  CAMP_FURNITURE,
  CAMP_HEIGHT,
  CAMP_SEATS,
  CAMP_WIDTH,
  campStreamX,
  inMapBounds,
  isMapId,
  MAP_NAME,
  mapHasSpotState,
  mapOf,
  seatSlotIn,
} from "./camp";
import { parseC2S } from "./events";
import { signJoinToken, verifyJoinToken } from "./token";
import { BOAT_SEATS, FERRIS_SEATS, FISHING_SPOTS, SEATS, spotSeatId } from "./world";
import { DIR, STATE } from "./types";

describe("맵 목록 (11/15 캠핑장)", () => {
  it("마을·캠핑장 두 맵, 이름, 모르는 값은 마을", () => {
    expect(isMapId("camp")).toBe(true);
    expect(isMapId("forest")).toBe(false);
    expect(mapOf(undefined)).toBe("village");
    expect(mapOf("camp")).toBe("camp");
    expect(MAP_NAME.camp).toBe("캠핑장");
  });
  it("맵마다 범위가 따로", () => {
    expect(inMapBounds("camp", CAMP_WIDTH, CAMP_HEIGHT)).toBe(true);
    expect(inMapBounds("camp", 1400, 900)).toBe(false);
    expect(inMapBounds("village", 1400, 900)).toBe(true);
  });
  it("데크 24자리, 번호 1~24, 맵 안", () => {
    expect(CAMP_DECKS.map((d) => d.n)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    for (const d of CAMP_DECKS) expect(inMapBounds("camp", d.x, d.y)).toBe(true);
  });
  it("계곡은 맵 위에서 아래까지 이어지고 오른쪽에 있다", () => {
    for (let y = 0; y <= CAMP_HEIGHT; y += 50) expect(campStreamX(y)).toBeGreaterThan(960);
  });
});

describe("맵별 좌석 판정", () => {
  it("캠핑장 좌석 id는 모두 q로 시작하고 마을 좌석과 겹치지 않는다", () => {
    const village = new Set(SEATS.map((s) => s.id));
    for (const s of CAMP_SEATS) {
      expect(s.id.startsWith("q")).toBe(true);
      expect(village.has(s.id)).toBe(false);
    }
    expect(new Set(CAMP_SEATS.map((s) => s.id)).size).toBe(CAMP_SEATS.length);
    expect(CAMP_FURNITURE.filter((f) => f.id.startsWith("qL"))).toHaveLength(12);
  });
  it("캠핑장은 캠핑장 좌석만 (마을 의자·배·관람차·낚시 자리는 없다), 마을은 그대로", () => {
    expect(seatSlotIn("camp", "qL1")?.kind).toBe("seat");
    expect(seatSlotIn("camp", "lA-0")).toBeUndefined();
    expect(seatSlotIn("camp", BOAT_SEATS[0].id)).toBeUndefined();
    expect(seatSlotIn("camp", FERRIS_SEATS[0].id)).toBeUndefined();
    expect(seatSlotIn("camp", FISHING_SPOTS[0].id)).toBeUndefined();
    expect(seatSlotIn("village", "lA-0")?.kind).toBe("seat");
    expect(seatSlotIn("village", "qL1")).toBeUndefined();
    // 형식만 보는 소품 자리(나무 매달리기)는 두 맵 다
    expect(seatSlotIn("camp", spotSeatId("hang", 100, 200))?.kind).toBe("hang");
  });
  it("캠핑장엔 배·관람차·열기구 자세가 없다", () => {
    expect(mapHasSpotState("camp", STATE.boat)).toBe(false);
    expect(mapHasSpotState("camp", STATE.ferris)).toBe(false);
    expect(mapHasSpotState("camp", STATE.sitChair)).toBe(true);
    expect(mapHasSpotState("village", STATE.boat)).toBe(true);
  });
});

describe("맵 옮기기 메시지·입장 토큰", () => {
  it("C2S map: 맵 id·좌표가 맞아야 받는다", () => {
    expect(parseC2S(JSON.stringify({ t: "map", m: "camp", x: 156.4, y: 758 }))).toEqual({ t: "map", m: "camp", x: 156, y: 758 });
    expect(parseC2S(JSON.stringify({ t: "map", m: "moon", x: 1, y: 1 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "map", m: "camp", x: "1", y: 1 }))).toBeNull();
  });
  it("토큰의 캠핑장 허락(camp)은 서명된 그대로만 (없으면 없음)", async () => {
    const base = { visitorId: "v1", name: "가람", color: "#e8d9b0", channel: 3 };
    const yes = await verifyJoinToken("s", await signJoinToken("s", { ...base, camp: true }));
    const no = await verifyJoinToken("s", await signJoinToken("s", base));
    expect(yes?.camp).toBe(true);
    expect(no?.camp).toBeUndefined();
  });
});

describe("11/15 캠핑장 2차 다듬기", () => {
  it("모닥불 둘레 통나무 의자는 큰 모닥불 불멍 (마을 모닥불과 같은 연출)", () => {
    expect(campCampfireOfSeat("qL1")).toEqual(CAMP_CAMPFIRE);
    expect(campCampfireOfSeat("qL12")?.big).toBe(true);
    expect(campCampfireOfSeat("qB-0")).toBeNull();
  });
  it("전망대 벤치는 경치(아래 캠핑장) 쪽을 본다", () => {
    for (const id of ["qO1", "qO2"]) expect(CAMP_FURNITURE.find((f) => f.id === id)?.facing).toBe(DIR.down);
  });
  it("정류장은 맵 맨 아래가 아니다 (화면 아래 채팅창에 가리지 않게) — 정류장·타는 자리·내리는 자리가 아래 150px 밖", () => {
    for (const p of [CAMP_BUS_STOP, CAMP_BOARD, CAMP_ARRIVE]) expect(p.y).toBeLessThan(CAMP_HEIGHT - 150);
  });
  it("캠핑카 앞 캠핑 의자 9개 (캠핑카마다 셋)", () => {
    expect(CAMP_SEATS.filter((s) => s.id.startsWith("qC"))).toHaveLength(9);
    expect(seatSlotIn("camp", "qC11")?.kind).toBe("seat");
  });
});
