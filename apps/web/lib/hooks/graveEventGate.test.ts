import { describe, expect, it } from "vitest";
import { GraveEventGate, isActionableGraveEvent, MAX_GRAVES_PER_WINDOW, PER_GRAVE_MS, WINDOW_MS } from "./graveEventGate";

describe("isActionableGraveEvent", () => {
  it("형식이 틀린 id, 모르는 묘비의 수정·이장 알림은 무시한다", () => {
    expect(isActionableGraveEvent("buried", "abc_123-X", false)).toBe(true);
    expect(isActionableGraveEvent("updated", "abc", true)).toBe(true);
    expect(isActionableGraveEvent("updated", "abc", false)).toBe(false);
    expect(isActionableGraveEvent("removed", "abc", false)).toBe(false);
    expect(isActionableGraveEvent("buried", "../admin", false)).toBe(false);
    expect(isActionableGraveEvent("buried", "x".repeat(41), false)).toBe(false);
  });
});

describe("GraveEventGate", () => {
  it("묘비마다 10초에 1회: 그 사이 알림은 한 번으로 모았다가 창이 끝나면 처리한다", () => {
    const gate = new GraveEventGate();
    expect(gate.offer("a", 0)).toBe("now");
    expect(gate.offer("a", 1_000)).toBe("later");
    expect(gate.offer("a", 2_000)).toBe("later");
    expect(gate.nextDueAt()).toBe(PER_GRAVE_MS);
    expect(gate.due(PER_GRAVE_MS - 1)).toEqual([]);
    expect(gate.due(PER_GRAVE_MS)).toEqual(["a"]);
    expect(gate.nextDueAt()).toBeNull();
    expect(gate.due(PER_GRAVE_MS + 1)).toEqual([]);
  });

  it("창이 지난 뒤 온 알림은 바로 처리한다", () => {
    const gate = new GraveEventGate();
    gate.offer("a", 0);
    expect(gate.offer("a", PER_GRAVE_MS)).toBe("now");
  });

  it("전체로 10초에 묘비 5개까지, 넘치면 버린다", () => {
    const gate = new GraveEventGate();
    const results = Array.from({ length: MAX_GRAVES_PER_WINDOW + 2 }, (_, i) => gate.offer(`g${i}`, i));
    expect(results.filter((r) => r === "now")).toHaveLength(MAX_GRAVES_PER_WINDOW);
    expect(results.slice(MAX_GRAVES_PER_WINDOW)).toEqual(["drop", "drop"]);
    expect(gate.nextDueAt()).toBeNull();
    expect(gate.offer("late", WINDOW_MS)).toBe("now");
  });

  it("보류했다 처리할 때도 전체 한도를 지킨다", () => {
    const gate = new GraveEventGate();
    gate.offer("a", 0);
    gate.offer("a", 1);
    // 새 창이 열리자마자 다른 묘비 5개가 한도를 채운다
    for (let i = 0; i < MAX_GRAVES_PER_WINDOW; i++) gate.offer(`g${i}`, WINDOW_MS);
    expect(gate.due(WINDOW_MS)).toEqual([]);
    expect(gate.nextDueAt()).toBeNull();
  });

  it("알림 폭주(같은 묘비 1000번)에도 10초에 상세 1회", () => {
    const gate = new GraveEventGate();
    let fetches = 0;
    for (let t = 0; t < 30_000; t += 30) {
      if (gate.offer("spam", t) === "now") fetches++;
      fetches += gate.due(t).length;
    }
    expect(fetches).toBe(3);
  });
});
