import { describe, expect, it } from "vitest";
import { SEA_GHOST_BERTH, SEA_KAYAK_DOCK, SEA_KAYAKS, SEA_PIER_END, SEA_TUBE_DRIFT, SEA_TUBES, TIDE_LOW_Y, seaColliders, seaWet } from "@tomb/protocol";
import { ghostBackArt } from "./ghostShipArt";
import {
  clampGhostDeck,
  deckBack,
  deckFront,
  G_DECK_X0,
  G_DECK_X1,
  GHOST_BLOCKS,
  GHOST_DECK,
  GHOST_HULL,
  GHOST_LADDER,
  GHOST_MERCHANT,
  GHOST_ORIGIN,
  GHOST_PLANK,
  GHOST_PLANK_WALK,
  GHOST_STALLS,
  onGhostDeck,
  onGhostDeckArt,
  onGhostWalk,
  PLANK_WALK_W,
} from "./ghostShipLayout";

/** 11/17 첫 유령선 갑판에서 걸을 수 있던 칸 수 (좌판 앞 띠 146×26에서 막힌 곳을 뺀 것 — 1px 칸) · 그때 널빤지 걷는 폭 */
const OLD_DECK_AREA = 3460;
const OLD_PLANK_W = 10;

/** 배 둘레 1px 칸을 세요 */
function countCells(f: (x: number, y: number) => boolean): number {
  let n = 0;
  for (let y = GHOST_HULL.y - 20; y < GHOST_HULL.y + GHOST_HULL.h + 20; y++) for (let x = GHOST_HULL.x - 20; x < SEA_PIER_END.x + 20; x++) if (f(x + 0.5, y + 0.5)) n++;
  return n;
}

// 11/17 유령선 자리: 비워 둔 깊은 물에 대고, 널빤지는 선착장 끝 데크에 닿고, 갑판은 걸을 수 있어요
describe("유령선 자리 (ghostShipLayout)", () => {
  it("배 몸은 카약 선착장 남쪽 깊은 물 (y 722 아래)이고 간조에도 물이에요", () => {
    expect(GHOST_HULL.y).toBeGreaterThanOrEqual(SEA_GHOST_BERTH.clear.y);
    expect(GHOST_HULL.y).toBeGreaterThan(SEA_KAYAK_DOCK.y + SEA_KAYAK_DOCK.h + 40);
    expect(GHOST_HULL.y).toBeGreaterThan(TIDE_LOW_Y);
    // 매어 둔 카약과 겹치지 않아요
    for (const k of SEA_KAYAKS) expect(k.y + 10).toBeLessThan(GHOST_HULL.y);
    // 막는 바위·난간이 배 몸 안에 없어요 (선착장 끝 서쪽 난간과도 떨어져요)
    const H = GHOST_HULL;
    const inside = seaColliders().filter((r) => r.x < H.x + H.w && r.x + r.w > H.x && r.y < H.y + H.h && r.y + r.h > H.y);
    expect(inside).toEqual([]);
    expect(H.x + H.w).toBeLessThan(SEA_PIER_END.x - 12);
    for (const y of [H.y + 4, H.y + H.h - 4]) for (const x of [H.x + 4, H.x + H.w / 2, H.x + H.w - 4]) expect(seaWet(x, y, 0)).toBe(true);
    // r2 커진 배: 떠다니는 튜브 폭과 겹치지 않아요 (튜브 반지름 12 넉넉히)
    for (const t of SEA_TUBES) {
      const near = t.y + SEA_TUBE_DRIFT.ay + 12 > H.y && t.y - SEA_TUBE_DRIFT.ay - 12 < H.y + H.h;
      if (near) expect(t.x + SEA_TUBE_DRIFT.ax + 4 + 12 <= GHOST_ORIGIN.x || t.x - SEA_TUBE_DRIFT.ax - 4 - 12 > SEA_PIER_END.x + SEA_PIER_END.w).toBe(true);
    }
  });

  it("r2 걸을 수 있는 갑판이 처음보다 두 배 넘게 넓어요", () => {
    const area = countCells(onGhostDeck);
    expect(area).toBeGreaterThanOrEqual(OLD_DECK_AREA * 2);
    // 갑판 깊이(남북)도 처음 띠(26px)의 1.5배 넘게
    expect(GHOST_DECK.h).toBeGreaterThan(26 * 1.5);
  });

  it("널빤지는 선착장 끝 데크 서쪽 가장자리에서 고물 층계참까지, 처음보다 넓게 이어져요", () => {
    const E = SEA_PIER_END;
    expect(PLANK_WALK_W).toBeGreaterThanOrEqual(OLD_PLANK_W * 1.6);
    expect(GHOST_PLANK.x1).toBeGreaterThan(E.x);
    expect(GHOST_PLANK.y0).toBeGreaterThan(E.y);
    expect(GHOST_PLANK.y1).toBeLessThan(E.y + E.h);
    expect(GHOST_PLANK.to.x).toBeGreaterThan(E.x);
    expect(onGhostDeck(GHOST_PLANK.from.x, GHOST_PLANK.from.y)).toBe(true);
    // 널빤지 띠의 위·아래 끝 줄 모두 서쪽 끝이 갑판, 동쪽 끝이 선착장 끝 데크와 겹쳐요 (폭 그대로 이어져요)
    for (let y = GHOST_PLANK.y0 + 1; y < GHOST_PLANK.y1; y += 2) {
      expect(onGhostDeck(GHOST_PLANK_WALK.x + 1, y), `갑판 쪽 ${y}`).toBe(true);
      const ex = GHOST_PLANK_WALK.x + GHOST_PLANK_WALK.w - 1;
      expect(ex > E.x && y > E.y && y < E.y + E.h, `선착장 쪽 ${y}`).toBe(true);
    }
  });

  it("선착장 끝에서 다리를 건너 갑판 마당 어디든 끊김 없이 걸어가요 (상인 앞·좌판 앞·사다리 위)", () => {
    // 선착장 끝 데크 + 배 위 걸을 수 있는 칸을 2px 격자로 이어 채워 봐요
    const S = 2;
    const E = SEA_PIER_END;
    const ok = (x: number, y: number) => onGhostWalk(x, y) || (x > E.x + 1 && x < E.x + E.w - 1 && y > E.y + 1 && y < E.y + E.h - 1);
    const key = (x: number, y: number) => `${x},${y}`;
    const start = { x: E.x + 40, y: E.y + 30 };
    const seen = new Set<string>([key(start.x, start.y)]);
    const q = [start];
    while (q.length) {
      const p = q.pop()!;
      for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]] as const) {
        const n = { x: p.x + dx, y: p.y + dy };
        const k = key(n.x, n.y);
        if (seen.has(k) || !ok(n.x, n.y) || n.x < GHOST_HULL.x - 10 || n.x > E.x + E.w) continue;
        seen.add(k);
        q.push(n);
      }
    }
    const reach = (x: number, y: number) => {
      const gx = start.x + Math.round((x - start.x) / S) * S;
      const gy = start.y + Math.round((y - start.y) / S) * S;
      for (let ddy = -4; ddy <= 4; ddy += S) for (let ddx = -4; ddx <= 4; ddx += S) if (seen.has(key(gx + ddx, gy + ddy)) && onGhostWalk(gx + ddx, gy + ddy)) return true;
      return false;
    };
    // 마당의 걸을 수 있는 칸은 모두 이어져 있어요 (따로 떨어진 섬이 없어요)
    let deckCells = 0;
    let reached = 0;
    for (let y = GHOST_DECK.y; y <= GHOST_DECK.y + GHOST_DECK.h; y += S)
      for (let x = GHOST_DECK.x; x <= GHOST_DECK.x + GHOST_DECK.w; x += S) {
        const gx = start.x + Math.round((x - start.x) / S) * S;
        const gy = start.y + Math.round((y - start.y) / S) * S;
        if (!onGhostDeck(gx, gy)) continue;
        deckCells++;
        if (seen.has(key(gx, gy))) reached++;
      }
    expect(deckCells).toBeGreaterThan(1000);
    expect(reached).toBe(deckCells);
    // 상인 앞 (거래 판정 안) · 좌판 둘 앞 · 사다리 위
    expect(reach(GHOST_MERCHANT.x, GHOST_MERCHANT.y + 6)).toBe(true);
    expect(Math.hypot(0, 6)).toBeLessThan(GHOST_MERCHANT.r);
    for (const s of GHOST_STALLS) expect(reach(s.x, s.y + 2), `좌판 ${s.x}`).toBe(true);
    expect(reach(GHOST_LADDER.x, GHOST_LADDER.deck)).toBe(true);
  });

  it("좌판 뒤·상인 자리·뱃전 밖은 막히고, 사다리 물 쪽 끝은 물이에요", () => {
    expect(onGhostDeck(GHOST_MERCHANT.x, GHOST_MERCHANT.y - 1)).toBe(false);
    for (const b of GHOST_BLOCKS) expect(onGhostDeck(b.x + b.w / 2, b.y + b.h - 1)).toBe(false);
    for (const s of GHOST_STALLS) expect(onGhostDeck(s.x, s.y - 8)).toBe(false);
    // 뒤 뱃전 · 앞 뱃전 바깥
    for (const gx of [80, 140, 200]) {
      expect(onGhostDeck(GHOST_ORIGIN.x + gx, GHOST_ORIGIN.y + deckBack(gx) - 1)).toBe(false);
      expect(onGhostDeck(GHOST_ORIGIN.x + gx, GHOST_ORIGIN.y + deckFront(gx) - 1)).toBe(false);
    }
    expect(seaWet(GHOST_LADDER.x, GHOST_LADDER.water, 1)).toBe(true);
  });

  it("그림과 충돌이 맞아요: 걷는 칸은 밝은 판자, 갑판의 막힌 칸은 어두워요", () => {
    const g = ghostBackArt();
    const lum = (v: number) => ((v >>> 24) & 255) * 0.3 + ((v >>> 16) & 255) * 0.55 + ((v >>> 8) & 255) * 0.15;
    let walk = 0;
    let walkBright = 0;
    let dim = 0;
    let dimBright = 0;
    for (let gx = G_DECK_X0 + 2; gx < G_DECK_X1 - 2; gx++)
      for (let gy = Math.ceil(deckBack(gx)) + 1; gy < deckFront(gx) - 1; gy++) {
        const v = g.get(gx, gy);
        if ((v & 255) === 0) continue;
        const bright = lum(v) > 150;
        if (onGhostDeckArt(gx, gy)) {
          walk++;
          if (bright) walkBright++;
        } else {
          dim++;
          if (bright) dimBright++;
        }
      }
    expect(walk).toBeGreaterThan(5000);
    expect(walkBright / walk).toBeGreaterThan(0.85);
    expect(dimBright / Math.max(1, dim)).toBeLessThan(0.1);
  });

  it("갑판 밖으로 나가면 넘어간 축만 되돌려 가장자리를 따라 미끄러져요", () => {
    const d = GHOST_DECK;
    const mid = { x: d.x + d.w / 2, y: d.y + d.h / 2 + 8 };
    expect(onGhostDeck(mid.x, mid.y)).toBe(true);
    // 앞 뱃전으로 비스듬히 → y만 되돌리고 x는 그대로 가요
    const gx = mid.x - GHOST_ORIGIN.x;
    const edge = GHOST_ORIGIN.y + deckFront(gx) - 5;
    const p = clampGhostDeck(mid.x + 3, edge + 4, mid.x, edge);
    expect(p).toEqual({ x: mid.x + 3, y: edge });
    // 상인 자리로 들어가면 되돌려요
    const q = clampGhostDeck(GHOST_MERCHANT.x, GHOST_MERCHANT.y - 2, GHOST_MERCHANT.x, GHOST_MERCHANT.y + 6);
    expect(onGhostDeck(q.x, q.y)).toBe(true);
    // 널빤지에서 위로 벗어나면 널빤지 띠로
    const r = clampGhostDeck(GHOST_PLANK.x0 + 20, GHOST_PLANK.y0 - 3, GHOST_PLANK.x0 + 18, GHOST_PLANK.y0 + 1);
    expect(onGhostWalk(r.x, r.y)).toBe(true);
    expect(r.x).toBe(GHOST_PLANK.x0 + 20);
  });
});
