import { describe, expect, it } from "vitest";
import { parseC2S, encodeEvent } from "./events";
import { STATE } from "./types";
import {
  SNOWBALL_HAND_Z,
  SNOWBALL_RANGE,
  SNOWBALL_RANGE_MAX,
  parseSnowballMsg,
  snowballAt,
  snowballFlightMs,
  snowFightMap,
  snowFightState,
  snowSegDist,
  type SnowballPos,
} from "./snowfight";

// 11/18 마을·캠핑장 눈싸움: 모두가 같은 식으로 그리는 길, 맞음 판정 거리, 메시지 모양

describe("snowfight", () => {
  it("공은 손 높이에서 출발해 떨어질 곳 땅에 닿는다 (몸 높이 안에서 난다)", () => {
    const o: SnowballPos = { x: 0, y: 0, z: 0, done: false };
    const T = snowballFlightMs(SNOWBALL_RANGE);
    expect(T).toBeGreaterThan(400);
    expect(T).toBeLessThan(700);
    snowballAt(100, 200, 240, 200, 0, o);
    expect(o).toEqual({ x: 100, y: 200, z: SNOWBALL_HAND_Z, done: false });
    let top = 0;
    for (let t = 0; t <= T; t += 10) top = Math.max(top, snowballAt(100, 200, 240, 200, t, o).z);
    expect(top).toBeGreaterThan(SNOWBALL_HAND_Z);
    expect(top).toBeLessThan(22);
    snowballAt(100, 200, 240, 200, T, o);
    expect(o.x).toBeCloseTo(240);
    expect(o.z).toBeCloseTo(0);
    expect(o.done).toBe(true);
  });

  it("발 둘레 거리: 길 위·옆·끝 너머", () => {
    expect(snowSegDist(150, 200, 100, 200, 240, 200)).toBe(0);
    expect(snowSegDist(150, 205, 100, 200, 240, 200, 1.6)).toBeCloseTo(8);
    expect(snowSegDist(260, 200, 100, 200, 240, 200)).toBeCloseTo(20);
    expect(snowSegDist(5, 5, 0, 0, 0, 0)).toBeCloseTo(Math.hypot(5, 5));
  });

  it("마을·캠핑장만, 서기·걷기·뛰기·점프만", () => {
    expect(snowFightMap("village")).toBe(true);
    expect(snowFightMap("camp")).toBe(true);
    expect(snowFightMap("sea")).toBe(false);
    for (const s of [STATE.idle, STATE.walk, STATE.run, STATE.jump]) expect(snowFightState(s)).toBe(true);
    for (const s of [STATE.sitGround, STATE.sitChair, STATE.swim, STATE.dive, STATE.swing, STATE.hammock, STATE.boat, STATE.carousel, STATE.bumper, STATE.hang]) expect(snowFightState(s)).toBe(false);
  });

  it("C2S 검증: snowball은 정수로, snowHit은 번호가 있어야", () => {
    expect(parseC2S(encodeEvent({ t: "snowball", x: 10.4, y: 20.6, tx: 150, ty: 20 }))).toEqual({ t: "snowball", x: 10, y: 21, tx: 150, ty: 20 });
    expect(parseC2S(JSON.stringify({ t: "snowball", x: 1, y: 2, tx: "a", ty: 3 }))).toBeNull();
    expect(parseC2S(encodeEvent({ t: "snowHit", by: 3, n: 7 }))).toEqual({ t: "snowHit", by: 3, n: 7 });
    // 맞은 높이는 정수로, 범위 밖이면 잘라 낸다 (모양이 틀리면 높이만 뺀다)
    expect(parseC2S(encodeEvent({ t: "snowHit", by: 3, n: 7, h: 12.4 }))).toEqual({ t: "snowHit", by: 3, n: 7, h: 12 });
    expect(parseC2S(encodeEvent({ t: "snowHit", by: 3, n: 7, h: 500 }))).toEqual({ t: "snowHit", by: 3, n: 7, h: 64 });
    expect(parseC2S(JSON.stringify({ t: "snowHit", by: 3, n: 7, h: "x" }))).toEqual({ t: "snowHit", by: 3, n: 7 });
    expect(parseC2S(JSON.stringify({ t: "snowHit", by: 3, n: 0 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "snowHit", by: -1, n: 2 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "snowHit", by: 1.5, n: 2 }))).toBeNull();
  });

  it("받은 중계 검증: 너무 먼 던지기는 버린다", () => {
    expect(parseSnowballMsg({ sid: 2, n: 1, x: 0, y: 0, tx: 100, ty: 0 })).toEqual({ sid: 2, n: 1, x: 0, y: 0, tx: 100, ty: 0 });
    expect(parseSnowballMsg({ sid: 2, n: 1, x: 0, y: 0, tx: SNOWBALL_RANGE_MAX + 40, ty: 0 })).toBeNull();
    expect(parseSnowballMsg({ sid: 2, n: 1, x: 0, y: 0, tx: 100 })).toBeNull();
  });
});
