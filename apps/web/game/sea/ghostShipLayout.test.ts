import { describe, expect, it } from "vitest";
import { SEA_GHOST_BERTH, SEA_KAYAK_DOCK, SEA_KAYAKS, SEA_PIER_END, TIDE_LOW_Y, seaColliders, seaWet } from "@tomb/protocol";
import { clampGhostDeck, GHOST_BLOCKS, GHOST_DECK, GHOST_HULL, GHOST_LADDER, GHOST_MERCHANT, GHOST_PLANK, onGhostDeck } from "./ghostShipLayout";

// 11/17 유령선 자리: 비워 둔 깊은 물에 대고, 널빤지는 선착장 끝 데크에 닿고, 갑판은 걸을 수 있어요
describe("유령선 자리 (ghostShipLayout)", () => {
  it("배 몸은 카약 선착장 남쪽 깊은 물 (y 722 아래)이고 간조에도 물이에요", () => {
    expect(GHOST_HULL.y).toBeGreaterThanOrEqual(SEA_GHOST_BERTH.clear.y);
    expect(GHOST_HULL.y).toBeGreaterThan(SEA_KAYAK_DOCK.y + SEA_KAYAK_DOCK.h + 40);
    expect(GHOST_HULL.y).toBeGreaterThan(TIDE_LOW_Y);
    // 매어 둔 카약과 겹치지 않아요
    for (const k of SEA_KAYAKS) expect(k.y + 10).toBeLessThan(GHOST_HULL.y);
    // 막는 바위·난간이 배 몸 안에 없어요
    const H = GHOST_HULL;
    const inside = seaColliders().filter((r) => r.x < H.x + H.w && r.x + r.w > H.x && r.y < H.y + H.h && r.y + r.h > H.y);
    expect(inside).toEqual([]);
    for (const y of [H.y + 4, H.y + H.h - 4]) expect(seaWet(H.x + H.w / 2, y, 0)).toBe(true);
  });

  it("널빤지는 선착장 끝 데크 서쪽 가장자리에서 갑판 고물까지 이어져요", () => {
    const E = SEA_PIER_END;
    expect(GHOST_PLANK.x1).toBeGreaterThan(E.x);
    expect(GHOST_PLANK.y).toBeGreaterThan(E.y);
    expect(GHOST_PLANK.y).toBeLessThan(E.y + E.h);
    expect(GHOST_PLANK.to.x).toBeGreaterThan(E.x);
    expect(onGhostDeck(GHOST_PLANK.from.x, GHOST_PLANK.from.y)).toBe(true);
    // 널빤지 서쪽 끝 바로 아래가 갑판이에요 (걸어 내려서요)
    expect(onGhostDeck(GHOST_PLANK.x0 + 4, GHOST_DECK.y + 3)).toBe(true);
  });

  it("상인 앞·사다리 위 갑판은 걸을 수 있고, 좌판·상인 자리는 막혀요", () => {
    expect(onGhostDeck(GHOST_MERCHANT.x, GHOST_MERCHANT.y + 8)).toBe(true);
    expect(onGhostDeck(GHOST_LADDER.x, GHOST_LADDER.deck)).toBe(true);
    for (const b of GHOST_BLOCKS) if (b.y + b.h > GHOST_DECK.y + 2) expect(onGhostDeck(b.x + b.w / 2, Math.max(GHOST_DECK.y + 1, b.y + 1))).toBe(false);
    expect(seaWet(GHOST_LADDER.x, GHOST_LADDER.water, 1)).toBe(true);
  });

  it("갑판 밖으로 나가면 갑판 안으로 되돌려요", () => {
    const d = GHOST_DECK;
    expect(clampGhostDeck(d.x - 30, d.y + 10, d.x + 2, d.y + 10)).toEqual({ x: d.x + 1, y: d.y + 10 });
    expect(clampGhostDeck(d.x + 20, d.y + d.h + 30, d.x + 20, d.y + d.h - 2).y).toBe(d.y + d.h - 1);
    const p = clampGhostDeck(GHOST_MERCHANT.x, GHOST_MERCHANT.y - 2, GHOST_MERCHANT.x, GHOST_MERCHANT.y + 6);
    expect(onGhostDeck(p.x, p.y)).toBe(true);
  });
});
