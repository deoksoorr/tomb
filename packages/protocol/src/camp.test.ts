import { describe, expect, it } from "vitest";
import {
  CAMP_ARRIVE,
  CAMP_BOARD,
  CAMP_BUS_STOP,
  CAMP_CAMPFIRE,
  campCampfireOfSeat,
  CAMP_CAMPFIRES,
  CAMP_FISHING_SPOTS,
  CAMP_FURNITURE,
  CAMP_NPCS,
  CAMP_POOL,
  CAMP_RAFTS,
  CAMP_PIER,
  CAMP_BUOY_LINE,
  campRaftDeck,
  campRaftWalks,
  CAMP_RAFT_ART_H,
  CAMP_RAFT_DEPTH,
  CAMP_RAFT_HALF_W,
  campResEdge,
  CAMP_RES,
  CAMP_ROWBOAT_SEATS,
  CAMP_SLIDE,
  CAMP_SLIDE_SEAT,
  CAMP_TRAMP_AREA,
  CAMP_TRAMP_GATE,
  CAMP_TRAMP_IN,
  CAMP_TRAMP_RADIUS,
  CAMP_TRAMP_SEATS,
  CAMP_TRAMPOLINE,
  campTrampPhase,
  campTrampSeatId,
  CAMP_VIEW_BRIDGE,
  CAMP_VIEW_BRIDGE_X,
  campFallsViewSeat,
  campWet,
  inCampPlunge,
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
  campSeatById,
  CAMP_HAMMOCKS,
  CAMP_HAMMOCK_LIFT,
} from "./camp";
import { parseC2S } from "./events";
import { signJoinToken, verifyJoinToken } from "./token";
import { BOAT_SEATS, clampToArea, FERRIS_SEATS, FISHING_SPOTS, SEATS, spotSeatId } from "./world";
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
  it("11/26 옛길 계곡은 달그늘 소 아래에서 맵 아래 끝까지 가운데를 굽이친다", () => {
    for (let y = 340; y <= CAMP_HEIGHT; y += 50) {
      expect(campStreamX(y)).toBeGreaterThan(580);
      expect(campStreamX(y)).toBeLessThan(700);
    }
  });
  it("11/26 물: 소·계곡·저수지는 헤엄, 다리·잔교·좌대 위는 마른 땅", () => {
    expect(campWet(CAMP_POOL.x, CAMP_POOL.y + 20)).toBe(true);
    expect(campWet(campStreamX(500), 500)).toBe(true);
    expect(campWet(1100, 420)).toBe(true);
    expect(campWet(CAMP_VIEW_BRIDGE_X, CAMP_VIEW_BRIDGE.y + 4)).toBe(false);
    expect(campWet(1100, 260)).toBe(false); // 잔교
    for (const r of CAMP_RAFTS) expect(campWet(r.x, r.y - 14)).toBe(false);
    expect(campWet(300, 400)).toBe(false);
    // 폭포 밑은 물살 (낚시 바위·소 앞쪽은 아니다)
    expect(inCampPlunge(640, 220)).toBe(true);
    expect(inCampPlunge(640, 330)).toBe(false);
    expect(inCampPlunge(488, 246)).toBe(false);
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
  it("11/26 캠핑장 해먹 넷은 한 사람 해먹 자리 (상태 hammock, 눕는 자리 = 받침 위 5) · 마을엔 없다", () => {
    expect(CAMP_HAMMOCKS.map((h) => h.id)).toEqual(["qM1", "qM2", "qM3", "qM4"]);
    for (const h of CAMP_HAMMOCKS) {
      const s = seatSlotIn("camp", h.id);
      expect(s).toMatchObject({ kind: "hammock", state: STATE.hammock, x: h.x, y: h.y - CAMP_HAMMOCK_LIFT });
      expect(seatSlotIn("village", h.id)).toBeUndefined();
      expect(campWet(h.x, h.y)).toBe(false);
    }
    expect(CAMP_SEATS.some((s) => s.id.startsWith("qM"))).toBe(false);
    // 아무 좌표의 해먹 자리(m_x_y)는 캠핑장에서 받지 않는다 (정해진 넷만)
    expect(seatSlotIn("camp", spotSeatId("hammock", CAMP_HAMMOCKS[0].x, CAMP_HAMMOCKS[0].y - CAMP_HAMMOCK_LIFT))).toBeUndefined();
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
  it("11/26 윤슬 낚시터 2인 나룻배 셋은 움직이는 배 자리 (바닷가 카약처럼)", () => {
    expect(CAMP_ROWBOAT_SEATS).toHaveLength(6);
    const s = seatSlotIn("camp", "qN1-0");
    expect(s?.kind).toBe("boat");
    expect(s?.mobile).toBe(true);
    expect(seatSlotIn("camp", "qN1-1")?.furnitureId).toBe(s?.furnitureId);
  });
  it("11/26 놀이터 트램펄린: 여덟 자리(qJ)는 입구 앞 앵커의 움직이는 자리, 매트 밖 위치는 안으로 당긴다, 아무 좌표 트램펄린 자리는 받지 않는다", () => {
    const ids = Array.from({ length: CAMP_TRAMP_SEATS }, (_, i) => campTrampSeatId(i));
    expect(new Set(ids).size).toBe(8);
    for (const id of ids) {
      const s = seatSlotIn("camp", id);
      expect(s?.kind).toBe("trampoline");
      expect(s?.state).toBe(STATE.trampoline);
      expect(s?.mobile).toBe(true);
      expect(s?.area).toEqual(CAMP_TRAMP_AREA);
      expect(Math.hypot(s!.x - CAMP_TRAMP_IN.x, s!.y - CAMP_TRAMP_IN.y)).toBe(0);
      // 사다리 밖 E 자리에서 서버 거리 안
      expect(Math.hypot(CAMP_TRAMP_GATE.x - s!.x, CAMP_TRAMP_GATE.y - s!.y)).toBeLessThan(CAMP_TRAMP_RADIUS);
    }
    // 매트 안은 매트 그림(CAMP_TRAMPOLINE) 안쪽
    const A = CAMP_TRAMP_AREA;
    const T = CAMP_TRAMPOLINE;
    expect(A.rx).toBeLessThan(T.rx);
    expect(A.ry).toBeLessThan(T.ry);
    expect(clampToArea(A, A.x, A.y)).toEqual({ x: A.x, y: A.y });
    const out = clampToArea(A, A.x + 200, A.y);
    expect(out.x).toBeCloseTo(A.x + A.rx);
    expect(new Set(ids.map(campTrampPhase)).size).toBe(8);
    expect(seatSlotIn("camp", spotSeatId("trampoline", CAMP_TRAMPOLINE.x, CAMP_TRAMPOLINE.y))).toBeUndefined();
    expect(seatSlotIn("village", spotSeatId("trampoline", 872, 300))?.kind).toBe("trampoline");
  });
  it("11/26 워터 슬라이드는 한 자리(qZ) — 타는 동안 움직이는 자리 (나룻배처럼)", () => {
    const s = seatSlotIn("camp", CAMP_SLIDE_SEAT.id);
    expect(s?.kind).toBe("boat");
    expect(s?.mobile).toBe(true);
    expect(s?.drift).toBe(true);
    expect(s?.state).toBe(STATE.boat);
    expect(Math.hypot(s!.x - CAMP_SLIDE.x, s!.y - CAMP_SLIDE.y)).toBeLessThan(60);
    // 좌석 id는 캠핑장 다른 자리와 겹치지 않는다
    expect(CAMP_SEATS.some((q) => q.id === CAMP_SLIDE_SEAT.id || q.id.startsWith("qJ"))).toBe(false);
  });
  it("11/26 좌대 1~3은 잔교에서 판자 다리 둘로 걸어 들어가고(다리 칸만 마른 판), 4~6은 물 건너 (헤엄쳐 가서 사다리로)", () => {
    for (const r of CAMP_RAFTS) {
      const d = campRaftDeck(r);
      expect(d.y, `좌대 ${r.n} 마루 뒤 끝`).toBe(r.y - CAMP_RAFT_DEPTH);
      if (r.n <= 3) {
        expect(r.link, `좌대 ${r.n}`).toBe(true);
        const walks = campRaftWalks(r);
        // 잔교 위에서 시작하는 다리만 (1·2 = 양옆 둘, 3 = 잔교 끝 밖인 오른쪽은 없다)
        expect(walks).toHaveLength(r.n === 3 ? 1 : 2);
        for (const w of walks) expect(w.x >= CAMP_PIER.x0 && w.x + w.w <= CAMP_PIER.x1, `좌대 ${r.n} 다리 ${w.x}`).toBe(true);
        for (const w of walks) {
          // 잔교 아래 끝 → 마루 뒤 끝까지 빈틈없이 이어진다
          expect(w.y).toBe(CAMP_PIER.y + CAMP_PIER.w / 2);
          expect(w.y + w.h).toBe(d.y);
          // 다리 가운데 줄은 잔교 위 → 좌대 마루까지 마른 판 (물에 빠지지 않는다)
          const cx = w.x + w.w / 2;
          for (let y = CAMP_PIER.y; y <= r.y - 10; y += 1) expect(campWet(cx, y), `좌대 ${r.n} 다리 x ${cx} y ${y}`).toBe(false);
        }
        // 다리 사이(오두막 뒤)와 다리 바깥은 물 — 잔교와 마루 사이를 아무 데로나 걸어 내려가지 않는다
        const mid = (d.y + CAMP_PIER.y + CAMP_PIER.w / 2) / 2;
        expect(campWet(r.x, mid)).toBe(true);
        expect(campWet(walks[0].x - 2, mid)).toBe(true);
        expect(campWet(walks[walks.length - 1].x + walks[walks.length - 1].w + 2, mid)).toBe(true);
        expect(campWet(r.x + 25, mid), `좌대 ${r.n} 오른쪽`).toBe(r.n !== 3 ? false : true);
      } else {
        expect(campRaftWalks(r)).toHaveLength(0);
        expect(r.link, `좌대 ${r.n}`).toBe(false);
        // 둘레는 물 (좌대 마루 위만 마른 판)
        expect(campWet(r.x, d.y - 4)).toBe(true);
        expect(campWet(r.x, d.y + d.h + 4)).toBe(true);
        expect(campWet(r.x, d.y + 4)).toBe(false);
      }
    }
    expect(CAMP_PIER.y).toBeLessThan(CAMP_BUOY_LINE.y);
  });
  it("11/26 족욕탕: 양옆 자리는 벤치 물가 끝(탕 쪽), 앞 짧은 벤치는 데크 안쪽에서 일어선다", () => {
    for (const id of ["qT1", "qT3"]) expect(campSeatById(id)?.facing).toBe(DIR.right);
    for (const id of ["qT2", "qT4"]) expect(campSeatById(id)?.facing).toBe(DIR.left);
    // 돌 테에 걸터앉고 일어서면 탕 반대쪽 데크로
    expect(campSeatById("qT1")?.standDx).toBeLessThan(0);
    expect(campSeatById("qT2")?.standDx).toBeGreaterThan(0);
  });
  it("캠핑장 소품 자세에는 관람차·열기구가 없다", () => {
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
    // 11/26 작은 불 넷 (폭포 다리 앞·불멍 쉼터 둘·펜션 정원)
    expect(CAMP_CAMPFIRES).toHaveLength(5);
    expect(campCampfireOfSeat("qS1")?.id).toBe("fireS");
    expect(campCampfireOfSeat("qG2")?.id).toBe("fireG");
    expect(campCampfireOfSeat("qP3-0")?.id).toBe("fireP1");
  });
  it("11/26 폭포 다리 의자는 폭포(위)를 보고 「폭포 멍」 자리", () => {
    for (const id of ["qW1", "qW2"]) expect(CAMP_FURNITURE.find((f) => f.id === id)?.facing).toBe(DIR.up);
    expect(campFallsViewSeat("qW1-0")).toBe(true);
    expect(campFallsViewSeat("qL1")).toBe(false);
  });
  it("11/26 낚시 자리: 소 바위 6 · 계곡 둑 8 · 저수지 둑 6 · 좌대 6×4, id는 마을 낚시 자리와 안 겹친다", () => {
    const by = (w: string) => CAMP_FISHING_SPOTS.filter((f) => f.water === w).length;
    expect(by("pool")).toBe(6);
    expect(by("valley")).toBe(8);
    expect(by("reservoir")).toBe(6 + 24);
    // 운영자 「중간 좌대 기준 저수지 양옆 낚시 자리는 다 빼」: 좌대 줄 높이(위 좌대 지붕 ~ 아래 좌대 앞 + 24)의 왼쪽·오른쪽 둑에는 자리가 없다
    const top = Math.min(...CAMP_RAFTS.map((r) => r.y)) - CAMP_RAFT_ART_H - 8;
    const bottom = Math.max(...CAMP_RAFTS.map((r) => r.y)) + 24;
    for (const f of CAMP_FISHING_SPOTS.filter((s) => s.water === "reservoir" && campResEdge(s.x, s.y) > 0))
      if (f.x < CAMP_RES.x0 || f.x > CAMP_RES.x1) expect(f.y < top || f.y > bottom, f.id).toBe(true);
    // 둑 자리에서 물 쪽 24px 안에 좌대 그림(마루·다리·오두막)이 없다
    for (const f of CAMP_FISHING_SPOTS.filter((s) => s.water === "reservoir" && campResEdge(s.x, s.y) > 0)) {
      const d = [[0, 1], [-1, 0], [1, 0], [0, -1]][f.facing];
      for (let k = 0; k <= 24; k += 2)
        for (const r of CAMP_RAFTS) {
          const px = f.x + d[0] * k;
          const py = f.y + d[1] * k;
          const inArt = Math.abs(px - r.x) <= CAMP_RAFT_HALF_W + 3 && py >= r.y - CAMP_RAFT_ART_H && py <= r.y + 4;
          expect(inArt, `${f.id} → 좌대 ${r.n}`).toBe(false);
        }
    }
    const village = new Set(FISHING_SPOTS.map((f) => f.id));
    for (const f of CAMP_FISHING_SPOTS) expect(village.has(f.id)).toBe(false);
    expect(new Set(CAMP_FISHING_SPOTS.map((f) => f.id)).size).toBe(CAMP_FISHING_SPOTS.length);
    for (const f of CAMP_FISHING_SPOTS) expect(seatSlotIn("camp", f.id)?.kind).toBe("fish");
  });
  it("11/26 NPC: 언젠가 씨·소슬댁·순이 할머니 (분양 셋)", () => {
    const ids = CAMP_NPCS.map((n) => n.id);
    for (const id of ["keeper", "sosul", "suni"] as const) expect(ids).toContain(id);
    expect(CAMP_NPCS.find((n) => n.id === "sosul")?.name).toBe("소슬댁");
    expect(CAMP_NPCS.find((n) => n.id === "suni")?.name).toBe("순이 할머니");
  });
  it("정류장은 맵 맨 아래가 아니다 (화면 아래 채팅창에 가리지 않게) — 정류장·타는 자리·내리는 자리가 아래 150px 밖", () => {
    for (const p of [CAMP_BUS_STOP, CAMP_BOARD, CAMP_ARRIVE]) expect(p.y).toBeLessThan(CAMP_HEIGHT - 150);
  });
});
