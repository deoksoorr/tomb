import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge } from "../bridge";
import { HOMES_JITTER_MS, onHomesChanged } from "./homesRefresh";

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
