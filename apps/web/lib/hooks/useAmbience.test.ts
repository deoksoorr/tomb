import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridge } from "@/game/bridge";
import { recheckDelay } from "@/game/world/ambienceMix";
import { ambienceAt, WEATHER_BLOCK_MS } from "@/lib/ambience";
import { ambienceStoreForTest as store } from "./useAmbience";

// 11/17 화면 위 시간대·날씨 글이 장면 날씨보다 늦게 바뀌던 것: 장면이 알린 값을 그대로 쓴다

describe("화면 위 날씨 글", () => {
  let off: () => void = () => {};
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 17, 3, 10));
    vi.stubGlobal("window", { location: { search: "" } });
    store.reset();
  });
  afterEach(() => {
    off();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("장면이 없으면 시계로 계산한다", () => {
    expect(store.getSnapshot().weather).toBe(ambienceAt(Date.now()).weather);
  });

  it("장면이 날씨를 알리면 그 순간 바뀌고, 시계가 1분마다 다시 봐도 되돌리지 않는다", () => {
    const seen = vi.fn();
    off = store.subscribe(seen);
    const clock = store.getSnapshot();
    const other = clock.weather === "snow" ? "rain" : "snow";
    bridge.emit("ambience:now", ambienceAt(Date.now(), { weather: other }));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().weather).toBe(other);
    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot().weather).toBe(other);
  });

  it("장면 소식이 끊기면(장면이 닫힘) 다시 시계를 따른다", () => {
    off = store.subscribe(() => {});
    const clockWeather = store.getSnapshot().weather;
    const other = clockWeather === "snow" ? "rain" : "snow";
    bridge.emit("ambience:now", ambienceAt(Date.now(), { weather: other }));
    vi.advanceTimersByTime(3 * 60_000);
    expect(store.getSnapshot().weather).toBe(ambienceAt(Date.now()).weather);
  });
});

describe("장면이 하늘·날씨를 다시 보는 때", () => {
  it("평소엔 1분마다, 날씨 경계가 가까우면 경계 바로 뒤에", () => {
    const now = Date.UTC(2026, 10, 17, 3, 10);
    const next = ambienceAt(now).nextWeatherAt;
    expect(next - now).toBeLessThanOrEqual(WEATHER_BLOCK_MS);
    expect(recheckDelay(now, next, 60_000)).toBe(60_000);
    expect(recheckDelay(next - 5_000, next, 60_000)).toBe(5_050);
    // 경계를 넘긴 뒤 다시 보면 새 블록의 날씨
    expect(ambienceAt(next - 5_000 + 5_050).nextWeatherAt).toBe(next + WEATHER_BLOCK_MS);
    // 이미 지난 경계라도 바로(50ms 뒤) 다시 본다
    expect(recheckDelay(next + 10, next, 60_000)).toBe(50);
  });
});
