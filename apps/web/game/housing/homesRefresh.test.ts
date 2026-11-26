import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge } from "../bridge";
import { HOMES_JITTER_MS, isOlderHomes, noteHomes, onHomesChanged, staleHomesV } from "./homesRefresh";

// 11/26 집 바뀜 알림 → 그 구역만, 같은 v는 한 번, 조금 흩어서 다시 받기
describe("onHomesChanged", () => {
  afterEach(() => vi.useRealTimers());

  it("그 구역 알림만 흩은 뒤 한 번 부르고, 같은·옛 v는 버린다", () => {
    vi.useFakeTimers();
    const got: number[] = [];
    const off = onHomesChanged("camp", (v) => got.push(v), () => 0.5);
    bridge.emit("homes:changed", { t: "homes", zone: "sea", v: 10 });
    bridge.emit("homes:changed", { t: "homes", zone: "camp", v: 10 });
    vi.advanceTimersByTime(HOMES_JITTER_MS[0] - 1);
    expect(got).toEqual([]);
    vi.advanceTimersByTime(HOMES_JITTER_MS[1]);
    expect(got).toEqual([10]);
    bridge.emit("homes:changed", { t: "homes", zone: "camp", v: 10 });
    bridge.emit("homes:changed", { t: "homes", zone: "camp", v: 9 });
    vi.advanceTimersByTime(HOMES_JITTER_MS[1]);
    expect(got).toEqual([10]);
    off();
  });

  it("기다리는 사이 새 알림이 오면 마지막 v로 한 번, 끄면 기다리던 것도 지운다", () => {
    vi.useFakeTimers();
    const got: number[] = [];
    const off = onHomesChanged("village", (v) => got.push(v), () => 0);
    bridge.emit("homes:changed", { t: "homes", zone: "village", v: 1 });
    bridge.emit("homes:changed", { t: "homes", zone: "village", v: 2 });
    vi.advanceTimersByTime(HOMES_JITTER_MS[1]);
    expect(got).toEqual([2]);
    bridge.emit("homes:changed", { t: "homes", zone: "village", v: 3 });
    off();
    vi.advanceTimersByTime(HOMES_JITTER_MS[1]);
    expect(got).toEqual([2]);
  });
});

// 11/26 실시간 서버가 입장 때 이 채널 마지막 v를 다시 보낸다 — 이미 그 뒤에 만든 목록을 그리고 있으면 다시 받지 않는다
describe("onHomesChanged covered", () => {
  afterEach(() => vi.useRealTimers());

  it("지금 그린 목록이 v 뒤에 만든 것이면 건너뛰고, 아니면 다시 받는다 (흩는 시간이 끝난 때 본다)", () => {
    vi.useFakeTimers();
    const got: number[] = [];
    let shownAt = 500;
    const off = onHomesChanged("sea", (v) => got.push(v), () => 0, (v) => shownAt >= v);
    bridge.emit("homes:changed", { t: "homes", zone: "sea", v: 400 });
    vi.advanceTimersByTime(HOMES_JITTER_MS[1]);
    expect(got).toEqual([]);
    bridge.emit("homes:changed", { t: "homes", zone: "sea", v: 600 });
    vi.advanceTimersByTime(HOMES_JITTER_MS[1]);
    expect(got).toEqual([600]);
    shownAt = 800;
    bridge.emit("homes:changed", { t: "homes", zone: "sea", v: 700 });
    vi.advanceTimersByTime(HOMES_JITTER_MS[1]);
    expect(got).toEqual([600]);
    off();
  });
});

// 11/26 늦게 들어온 화면: CDN이 stale-while-revalidate로 준 옛 목록(분양 전)을 그대로 5분 들고 있던 것 (운영 「새로고침하니까 나오더라고」)
describe("staleHomesV", () => {
  it("이 채널에서 들은 집 바뀜(v)보다 먼저 만든 목록이면 그 v, 아니면 null (구역마다 따로, 가장 새 v)", () => {
    noteHomes({ t: "homes", zone: "camp", v: 5_000 });
    noteHomes({ t: "homes", zone: "camp", v: 4_000 });
    expect(staleHomesV("camp", 4_999)).toBe(5_000);
    expect(staleHomesV("camp", 5_000)).toBeNull();
    expect(staleHomesV("camp", 9_000)).toBeNull();
    expect(staleHomesV("sea", 1)).toBeNull();
  });

  it("맵에 없을 때 온 알림도 기억한다 (WorldScene이 받은 homes를 모두 noteHomes로)", () => {
    bridge.emit("homes:changed", { t: "homes", zone: "sea", v: 7_000 });
    noteHomes({ t: "homes", zone: "sea", v: 7_000 });
    expect(staleHomesV("sea", 6_000)).toBe(7_000);
  });
});

describe("isOlderHomes", () => {
  it("지금 그린 목록보다 먼저 만든 응답(늦게 온 CDN 옛 응답)은 버린다", () => {
    expect(isOlderHomes(100, 99)).toBe(true);
    expect(isOlderHomes(100, 100)).toBe(false);
    expect(isOlderHomes(0, 1)).toBe(false);
  });
});
