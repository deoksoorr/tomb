import { describe, expect, it } from "vitest";
import {
  BALLOON_BOARD_MS,
  BALLOON_CYCLE_MS,
  BALLOON_FLIGHT_MS,
  BALLOON_PAD,
  BALLOON_SEATS,
  FERRIS,
  FERRIS_CARS,
  FERRIS_PERIOD_MS,
  FERRIS_SEATS,
  MAP_HEIGHT,
  MAP_WIDTH,
} from "@tomb/protocol";
import { inWater, standable } from "./layout";
import { CAROUSELS, SEESAWS, SEESAW_HALF } from "./rides";
import {
  BALLOON_ROUTE,
  balloonPose,
  balloonSeatsOf,
  balloonState,
  boardingBalloon,
  carAngle,
  ferrisPose,
  ferrisRideEnd,
  groundHit,
  nextBoardingIn,
  pickFerrisSeat,
  placeName,
  rimPoint,
  routeLength,
  skyFootprint,
  WHEEL_R,
} from "./skyMath";

describe("놀이기구 2: 관람차", () => {
  it("자리 앵커(내려서는 곳)는 서 있을 수 있고 물이 아니다", () => {
    for (const s of FERRIS_SEATS) {
      expect(standable(s.x, s.y), s.id).toBe(true);
      expect(inWater(s.x, s.y)).toBe(false);
    }
  });

  it("바퀴는 회전목마·시소·다리로 가는 길(x 704~736)과 겹치지 않는다", () => {
    const left = FERRIS.x - WHEEL_R - 10;
    const right = FERRIS.x + WHEEL_R + 10;
    expect(left).toBeGreaterThan(736);
    for (const s of SEESAWS) expect(right).toBeLessThan(s.x - SEESAW_HALF);
    for (const c of CAROUSELS) expect(left).toBeGreaterThan(c.x + 40);
  });

  it("칸은 서버 시계로 고르게 돈다: 0 = 맨 아래, 한 바퀴 = FERRIS_PERIOD_MS", () => {
    expect(carAngle(0, 0)).toBeCloseTo(0);
    expect(carAngle(0, FERRIS_PERIOD_MS / 2)).toBeCloseTo(Math.PI);
    expect(carAngle(1, 0)).toBeCloseTo((Math.PI * 2) / FERRIS_CARS);
    const bottom = rimPoint(0);
    const top = rimPoint(Math.PI);
    expect(bottom.y).toBeGreaterThan(top.y);
    expect(bottom.y).toBeLessThan(FERRIS.y);
  });

  it("맨 아래 가까운 칸의 빈자리부터 타고, 한 바퀴쯤 돌아 내려오면 내린다", () => {
    const s = pickFerrisSeat(0, () => false);
    expect(s?.car).toBe(0);
    // 칸 0이 다 찼으면 이웃 칸이 가까울 때만
    const busy = new Set(FERRIS_SEATS.filter((x) => x.car === 0).map((x) => x.id));
    expect(pickFerrisSeat(0, (id) => busy.has(id))).toBeNull();
    const half = FERRIS_PERIOD_MS / FERRIS_CARS / 2;
    expect(pickFerrisSeat(half, (id) => busy.has(id))?.car).toBe(FERRIS_CARS - 1);
    for (const t0 of [0, 1_000, 30_000, FERRIS_PERIOD_MS - 500]) {
      const c = pickFerrisSeat(t0, () => false)!.car;
      const ride = ferrisRideEnd(c, t0) - t0;
      expect(ride).toBeGreaterThanOrEqual(FERRIS_PERIOD_MS * 0.8);
      expect(ride).toBeLessThanOrEqual(FERRIS_PERIOD_MS * 1.2);
      expect(carAngle(c, ferrisRideEnd(c, t0)) % (Math.PI * 2)).toBeLessThan(0.01 + 0 * ride);
    }
  });

  it("하늘 시점: 꼭대기에서 높고 더 아래를 본다, 보이는 땅은 맵 안", () => {
    const low = ferrisPose(0, 0);
    const high = ferrisPose(0, FERRIS_PERIOD_MS / 2);
    expect(high.h).toBeGreaterThan(low.h + 200);
    expect(high.pitch).toBeLessThan(low.pitch);
    for (const p of [low, high]) {
      const r = skyFootprint(p, 16 / 9, 820);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(MAP_WIDTH);
      expect(r.y + r.h).toBeLessThanOrEqual(MAP_HEIGHT);
      // 북쪽(광장·마을)을 본다: 화면 가운데 시선은 관람차보다 위쪽 땅에 닿는다
      expect(groundHit(p, 0, 0, 16 / 9, 820).y).toBeLessThan(FERRIS.y);
    }
  });
});

describe("놀이기구 2: 열기구", () => {
  it("자리 앵커는 출발장 바구니 앞, 서 있을 수 있다. 기구마다 4자리", () => {
    for (const b of [0, 1]) expect(balloonSeatsOf(b)).toHaveLength(4);
    for (const s of BALLOON_SEATS) {
      expect(standable(s.x, s.y), s.id).toBe(true);
      expect(Math.hypot(s.x - BALLOON_PAD.x, s.y - BALLOON_PAD.y)).toBeLessThan(20);
    }
  });

  it("항로는 맵 안이고 출발장에서 떠나 출발장으로 돌아온다", () => {
    expect(BALLOON_ROUTE[0]).toEqual({ x: BALLOON_PAD.x, y: BALLOON_PAD.y });
    expect(BALLOON_ROUTE[BALLOON_ROUTE.length - 1]).toEqual({ x: BALLOON_PAD.x, y: BALLOON_PAD.y });
    for (const p of BALLOON_ROUTE) {
      expect(p.x).toBeGreaterThan(32);
      expect(p.x).toBeLessThan(MAP_WIDTH - 32);
      expect(p.y).toBeGreaterThan(32);
      expect(p.y).toBeLessThan(MAP_HEIGHT - 32);
    }
    // 2분 남짓에 날 수 있는 길이 (너무 빠르지 않게)
    expect(routeLength() / (BALLOON_FLIGHT_MS / 1000)).toBeLessThan(45);
  });

  it("지나가는 곳: 묘역 → 광장 → 강 → 호수 → 동물원 → 언덕", () => {
    const seen: string[] = [];
    for (let ms = 0; ms <= BALLOON_FLIGHT_MS; ms += 500) {
      const s = balloonState(0, BALLOON_BOARD_MS + ms);
      const n = placeName(s.x, s.y);
      if (n && seen[seen.length - 1] !== n) seen.push(n);
    }
    const order = ["옛 묘역", "모닥불 광장", "강", "호수", "동물원", "별 보기 언덕"].map((n) => seen.indexOf(n));
    for (const i of order) expect(i).toBeGreaterThanOrEqual(0);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[3]);
    expect(order[3]).toBeLessThan(order[4]);
  });

  it("출발장에서는 땅에 있고, 날다가 내려앉으면 다시 출발장 (뛰지 않고 이어진다)", () => {
    const board = balloonState(0, 5_000);
    expect(board).toMatchObject({ boarding: true, alt: 0, x: BALLOON_PAD.x, y: BALLOON_PAD.y });
    const start = balloonState(0, BALLOON_BOARD_MS + 1);
    expect(Math.hypot(start.x - BALLOON_PAD.x, start.y - BALLOON_PAD.y)).toBeLessThan(2);
    expect(start.alt).toBeLessThan(1);
    const mid = balloonState(0, BALLOON_BOARD_MS + BALLOON_FLIGHT_MS / 2);
    expect(mid.alt).toBeGreaterThan(50);
    expect(mid.h).toBeGreaterThan(200);
    const land = balloonState(0, BALLOON_CYCLE_MS - 1);
    expect(Math.hypot(land.x - BALLOON_PAD.x, land.y - BALLOON_PAD.y)).toBeLessThan(2);
    expect(land.alt).toBeLessThan(1);
    // 한 프레임(1/60초)에 크게 뛰지 않는다
    let prev = balloonState(0, BALLOON_BOARD_MS);
    for (let ms = 16; ms < BALLOON_FLIGHT_MS; ms += 16) {
      const s = balloonState(0, BALLOON_BOARD_MS + ms);
      expect(Math.hypot(s.x - prev.x, s.y - prev.y)).toBeLessThan(2);
      prev = s;
    }
  });

  it("두 대가 번갈아 내려온다: 기다리는 시간은 반 주기 남짓", () => {
    let maxWait = 0;
    for (let t = 0; t < BALLOON_CYCLE_MS * 2; t += 500) {
      const b = boardingBalloon(t);
      if (b < 0) maxWait = Math.max(maxWait, nextBoardingIn(t));
      else expect(nextBoardingIn(t)).toBe(0);
    }
    expect(maxWait).toBeLessThanOrEqual(BALLOON_CYCLE_MS / 2 - BALLOON_BOARD_MS + 1);
  });

  it("하늘 시점: 주로 아래를 내려다보고, 보이는 땅은 맵 안", () => {
    const s = balloonState(0, BALLOON_BOARD_MS + 40_000);
    const p = balloonPose(s, 40_000);
    expect(p.pitch).toBeLessThan(-0.3);
    const r = skyFootprint(p, 16 / 9, 980);
    expect(r.w).toBeGreaterThan(100);
    expect(r.x + r.w).toBeLessThanOrEqual(MAP_WIDTH);
  });
});
