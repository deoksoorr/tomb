import { describe, expect, it } from "vitest";
import { coverGame, isGameCovered, onGameCoverChange } from "./gameCover";

// 11/22 창이 마을을 덮은 동안 그리기 줄이기 — 덮는 창이 여럿이어도 마지막 창이 닫힐 때 한 번만 풀린다

describe("마을 덮기 (gameCover)", () => {
  it("처음 덮을 때·마지막이 풀릴 때만 알리고, 같은 해제를 두 번 불러도 한 번만 풀린다", () => {
    const log: boolean[] = [];
    const off = onGameCoverChange((on) => log.push(on));
    expect(isGameCovered()).toBe(false);
    const a = coverGame();
    const b = coverGame();
    expect(isGameCovered()).toBe(true);
    a();
    a();
    expect(isGameCovered()).toBe(true);
    b();
    expect(isGameCovered()).toBe(false);
    expect(log).toEqual([true, false]);
    off();
    coverGame()();
    expect(log).toEqual([true, false]);
  });
});
