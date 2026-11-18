import { describe, expect, it } from "vitest";
import { snowballAt, SNOWBALL_RANGE, type SnowballPos } from "@tomb/protocol";
import { BODY_METRICS } from "../sprites/avatar";
import { SNOW_BODY_HALF, SNOW_DEPTH, snowBodyHit, snowBodyTop, type SnowBody } from "./snowHit";

// 11/18 눈싸움 맞음 판정 상자: 머리·몸에만 맞고 이름표 높이로 지나가는 눈뭉치는 안 맞는다

const top = snowBodyTop(BODY_METRICS.hood.top, BODY_METRICS.hood.top);
const body = (o: Partial<SnowBody> = {}): SnowBody => ({ x: 200, y: 300, lift: 0, top, half: SNOW_BODY_HALF, ...o });
/** 이름표는 그림 꼭대기 2px 위에 놓인다 (AvatarView labelGap = top + 2) — 글자 가운데쯤 */
const LABEL_H = top + 6;

describe("snowBodyHit", () => {
  it("머리·몸 높이는 맞고 이름표 높이는 안 맞는다", () => {
    expect(snowBodyHit(200, 300, 4, body())).toBeCloseTo(4);
    expect(snowBodyHit(200, 300, 12, body())).toBeCloseTo(12);
    expect(snowBodyHit(200, 300, top - 1, body())).toBeCloseTo(top - 1);
    expect(snowBodyHit(200, 300, LABEL_H, body())).toBeNull();
    expect(snowBodyHit(200, 300, top + 12, body())).toBeNull();
  });

  it("위아래로 던져 그림자는 발 근처여도 보이는 공이 이름표 높이면 안 맞는다", () => {
    // 위(북)에서 아래로: 그림자가 발 4px 위를 지나갈 때 공 높이 16 → 보이는 공은 발에서 20px 위 (hood 꼭대기 18 위)
    expect(snowBodyHit(200, 296, 16, body())).toBeNull();
    // 같은 높이라도 그림자가 발 앞(아래)이면 보이는 공은 몸에 닿는다
    expect(snowBodyHit(200, 304, 16, body())).toBeCloseTo(12);
  });

  it("몸 폭 밖·발 줄에서 멀리 지나가는 그림자는 안 맞는다", () => {
    expect(snowBodyHit(200 + SNOW_BODY_HALF + 1, 300, 10, body())).toBeNull();
    expect(snowBodyHit(200, 300 - SNOW_DEPTH - 1, 10, body())).toBeNull();
    expect(snowBodyHit(200, 300 + SNOW_DEPTH + 1, 10, body())).toBeNull();
  });

  it("점프로 띄운 만큼 상자도 올라간다", () => {
    expect(snowBodyHit(200, 300, 2, body({ lift: 8 }))).toBeNull();
    expect(snowBodyHit(200, 300, 20, body({ lift: 8 }))).toBeCloseTo(12);
  });

  it("바베큐로 커지면 배율대로 커진다, 머리 위 큰 장식은 조금만", () => {
    const big = snowBodyTop(BODY_METRICS.hood.top, BODY_METRICS.hood.top, 1.5);
    expect(snowBodyHit(200, 300, top + 6, body({ top: big, half: SNOW_BODY_HALF * 1.5 }))).not.toBeNull();
    expect(snowBodyHit(209, 300, 10, body({ top: big, half: SNOW_BODY_HALF * 1.5 }))).not.toBeNull();
    // 높은 모자(그림 꼭대기 30)라도 몸 머리 위 3px까지만
    expect(snowBodyTop(30, BODY_METRICS.hood.top)).toBe(BODY_METRICS.hood.top + 3);
  });

  it("옆으로 던진 공은 날아가는 내내 몸 높이라 길 위 사람은 맞는다", () => {
    const o: SnowballPos = { x: 0, y: 0, z: 0, done: false };
    let hit = false;
    for (let t = 0; t < 600 && !hit; t += 8) {
      snowballAt(100, 300, 100 + SNOWBALL_RANGE, 300, t, o);
      if (snowBodyHit(o.x, o.y, o.z, body({ x: 170 })) !== null) hit = true;
    }
    expect(hit).toBe(true);
  });
});
