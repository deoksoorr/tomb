import { HUNT_ROOM_STALE_MS, HUNT_ROOMS_MAX } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { applyHuntReport, huntRoomsInfo, pruneHunt, type HuntRoomsState } from "./huntRooms";

describe("11/12 사냥터 방 인원 (로비)", () => {
  it("보고를 반영하고, 0명이면 지우고, 늦게 온 옛 보고는 버린다", () => {
    const s: HuntRoomsState = {};
    expect(applyHuntReport(s, "hunt:subway:easy", 3, 10, 1000)).toBe(true);
    expect(applyHuntReport(s, "hunt:subway:easy", 1, 5, 1100)).toBe(false);
    expect(huntRoomsInfo(s, 2000).rooms).toEqual({ "hunt:subway:easy": 3 });
    expect(applyHuntReport(s, "hunt:subway:easy", 0, 11, 1200)).toBe(true);
    expect(huntRoomsInfo(s, 2000).rooms).toEqual({});
  });

  it("사냥터 방이 아니거나 이상한 값은 무시", () => {
    const s: HuntRoomsState = {};
    expect(applyHuntReport(s, "village", 3, 1, 0)).toBe(false);
    expect(applyHuntReport(s, "house:abcd", 3, 1, 0)).toBe(false);
    expect(applyHuntReport(s, "hunt:gym:easy", -1, 1, 0)).toBe(false);
    expect(applyHuntReport(s, "hunt:gym:easy", 1.5, 1, 0)).toBe(false);
    expect(Object.keys(s)).toHaveLength(0);
  });

  it("보고가 끊긴 지 오래된 방은 빈 것으로 보고 정리한다", () => {
    const s: HuntRoomsState = {};
    applyHuntReport(s, "hunt:gym:easy", 2, 1, 0);
    expect(huntRoomsInfo(s, HUNT_ROOM_STALE_MS + 1).rooms).toEqual({});
    expect(pruneHunt(s, HUNT_ROOM_STALE_MS + 1)).toBe(true);
    expect(s).toEqual({});
  });

  it("기억하는 방 수에는 상한이 있다", () => {
    const s: HuntRoomsState = {};
    for (let i = 0; i < HUNT_ROOMS_MAX + 5; i++) applyHuntReport(s, `hunt:z${i}:easy`, 1, 1, 0);
    expect(Object.keys(s)).toHaveLength(HUNT_ROOMS_MAX);
  });
});
