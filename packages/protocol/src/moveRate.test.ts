import { describe, expect, it } from "vitest";
import { LOBBY_CACHE_SEC, LOBBY_POLL_MS, MOVE_STEADY_MS, RATE_LIMIT_PER_SEC, ROOM_SOLO_STEADY_MS, SEND_INTERVAL_MS, TELEPORT_DIST, WALK_SPEED } from "./constants";

// 11/17 DO 요청 줄이기: MOVE 간격·로비 폴링 상수의 관계

describe("MOVE 간격", () => {
  it("꾸준한 걷기 간격은 최소 간격보다 길고, 상태가 바뀔 때의 10Hz 상한은 그대로", () => {
    expect(SEND_INTERVAL_MS).toBe(100);
    expect(MOVE_STEADY_MS).toBeGreaterThan(SEND_INTERVAL_MS);
    // 받는 쪽 보간 버퍼(최대 320ms)가 도착 간격을 감당할 수 있어야 한다
    expect(MOVE_STEADY_MS).toBeLessThanOrEqual(200);
    expect(1000 / SEND_INTERVAL_MS).toBeLessThanOrEqual(RATE_LIMIT_PER_SEC);
  });

  it("방에 혼자일 때 걷기 한 번 간격의 거리는 순간이동 거리보다 짧다 (들어온 사람 화면에서 미끄러져 맞는다)", () => {
    expect(ROOM_SOLO_STEADY_MS).toBeGreaterThanOrEqual(MOVE_STEADY_MS);
    expect((WALK_SPEED * ROOM_SOLO_STEADY_MS) / 1000).toBeLessThan(TELEPORT_DIST);
  });
});

describe("로비 폴링", () => {
  it("폴링 간격은 캐시보다 길다 (폴링마다 새 값을 볼 수 있게)", () => {
    expect(LOBBY_POLL_MS).toBeGreaterThan(LOBBY_CACHE_SEC * 1000);
  });
});
