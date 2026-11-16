import { describe, expect, it } from "vitest";
import {
  SEA_ARRIVE,
  SEA_BOARD,
  SEA_BOAT,
  SEA_BREAKWATER,
  SEA_BREAKWATER_TIP,
  SEA_FLAT_Y0,
  SEA_FOOTBATH,
  SEA_LIGHTHOUSE_DOOR,
  SEA_LOTS,
  SEA_DIG_HOLES,
  seaLotFront,
  seaLotGate,
  SEA_MARKET_STALLS,
  SEA_PIER,
  SEA_PIER_END,
  SEA_ROCKS,
  SEA_SEATS,
  TIDE_LOW_Y,
  seaWet,
} from "@tomb/protocol";
import { SEA_FUTURE_SPOTS, SEA_INTERACTABLES, SEA_LIGHTS, SEA_PIER_POSTS, seaGroundKind, seaStandable, seaWalkGrid } from "./seaLayout";
import { SEA_LANDMARKS, SEA_MINIMAP_H, SEA_MINIMAP_W, seaMinimapPixels, toSeaMinimap } from "./seaMinimap";

// 11/16 달물결 포구 배치: 내리는 자리에서 걸어서 갈 곳에 다 닿는지, 갯벌은 물때와 상관없이 늘 걷는지, 먼바다는 막히는지

const grid = seaWalkGrid(8);
/** 정류장 앞(버스에서 내리는 자리)에서 걸어 닿는 칸 */
const reach = (() => {
  const { cols, rows, cells, cell } = grid;
  const seen = new Uint8Array(cols * rows);
  const start = Math.floor(SEA_ARRIVE.y / cell) * cols + Math.floor(SEA_ARRIVE.x / cell);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % cols;
    const y = (i / cols) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (seen[j] || cells[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
})();
function reachableNear(x: number, y: number, r: number): boolean {
  const { cell, cols, rows } = grid;
  for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++)
    for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      const px = cx * cell + cell / 2;
      const py = cy * cell + cell / 2;
      if (Math.hypot(px - x, py - y) <= r && reach[cy * cols + cx]) return true;
    }
  return false;
}

describe("seaLayout — 걷기", () => {
  it("버스에서 내리는 자리·타는 자리에 설 수 있다", () => {
    expect(seaStandable(SEA_ARRIVE.x, SEA_ARRIVE.y)).toBe(true);
    expect(seaStandable(SEA_BOARD.x, SEA_BOARD.y)).toBe(true);
  });
  it("상호작용마다 걸어서 닿는 자리가 가까이 있다", () => {
    for (const o of SEA_INTERACTABLES) expect(reachableNear(o.x, o.y, o.r), o.id).toBe(true);
  });
  it("시장 앞·오두막 터 출입구·선착장 끝·등대 문·족욕 바위까지 걸어서 가요", () => {
    for (const s of SEA_MARKET_STALLS) expect(reachableNear(s.x, s.y, 10)).toBe(true);
    // 11/16 터마다 출입구 쪽이 달라요 (seaLotFront)
    for (const l of SEA_LOTS) {
      const f = seaLotFront(l);
      expect(reachableNear(f.x, f.y, 8), `lot ${l.n} gate`).toBe(true);
      expect(reachableNear(l.x + l.w / 2, l.y + l.h / 2, 8), `lot ${l.n} inside`).toBe(true);
    }
    // 11/16 갯벌 캐기 구멍은 바위가 늘어도 다 걸어서 닿아요
    for (const h of SEA_DIG_HOLES) expect(reachableNear(h.x, h.y, 10), `hole ${h.x},${h.y}`).toBe(true);
    expect(reachableNear(SEA_PIER_END.x + SEA_PIER_END.w / 2, SEA_PIER_END.y + SEA_PIER_END.h - 6, 8)).toBe(true);
    expect(reachableNear(SEA_LIGHTHOUSE_DOOR.x, SEA_LIGHTHOUSE_DOOR.y + 6, 8)).toBe(true);
    expect(reachableNear(SEA_FOOTBATH.x, SEA_FOOTBATH.y, 12)).toBe(true);
  });
  it("오두막 터 출입구는 열려 있다", () => {
    for (const l of SEA_LOTS) {
      const g = seaLotGate(l);
      expect(seaStandable(g.x, g.y + (l.gate === "s" ? -1 : 6)), `lot ${l.n}`).toBe(true);
    }
    // 11/16 터는 서로 겹치지 않고 조금씩 크기가 달라요 (바둑판이 아니에요)
    for (const a of SEA_LOTS) for (const b of SEA_LOTS) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.n}/${b.n}`).toBe(true);
    expect(new Set(SEA_LOTS.map((l) => `${l.w}x${l.h}`)).size).toBeGreaterThan(3);
  });
  it("선착장 머리·가운데·끝, 방파제 몸통·끝 데크에 설 수 있다", () => {
    const px = SEA_PIER.x + SEA_PIER.w / 2;
    for (const y of [SEA_PIER.y + 10, 700, SEA_PIER_END.y + 30]) expect(seaStandable(px, y), `pier ${y}`).toBe(true);
    const bx = SEA_BREAKWATER.x + SEA_BREAKWATER.w / 2;
    for (const y of [SEA_BREAKWATER.y + 10, 700]) expect(seaStandable(bx, y), `breakwater ${y}`).toBe(true);
    expect(seaStandable(SEA_BREAKWATER_TIP.x + 14, SEA_BREAKWATER_TIP.y + SEA_BREAKWATER_TIP.h - 4)).toBe(true);
  });
  it("갯벌은 물때와 상관없이 늘 걷는다 (바위만 빼고)", () => {
    const inRock = (x: number, y: number) => SEA_ROCKS.some((r) => Math.abs(x - r.x) < r.rx + 6 && Math.abs(y - r.y) < r.ry + 8);
    for (const x of [300, 420, 520, 760, 900, 1040, 1100])
      for (let y = SEA_FLAT_Y0 + 2; y <= TIDE_LOW_Y; y += 6) {
        if (inRock(x, y)) continue;
        expect(seaStandable(x, y), `${x},${y}`).toBe(true);
      }
  });
  // 11/16 먼바다에서도 헤엄·잠수할 수 있게 막지 않아요 (늘 물속). 맵 아래 끝·묶인 낚싯배만 막아요
  it("먼바다는 헤엄칠 수 있고 늘 물속, 낚싯배와 맵 아래 끝은 막혀 있다", () => {
    for (const [x, y] of [
      [300, 920],
      [900, 930],
      [560, 940],
    ]) {
      expect(seaStandable(x, y), `${x},${y}`).toBe(true);
      expect(seaWet(x, y, 0), `${x},${y}`).toBe(true);
    }
    expect(seaStandable(SEA_BOAT.x, SEA_BOAT.y)).toBe(false);
    expect(seaStandable(300, 955)).toBe(false);
  });
  it("다음 차수 쉴거리 자리·좌석은 비어 있다", () => {
    for (const p of SEA_FUTURE_SPOTS) expect(seaStandable(p.x, p.y), `${p.x},${p.y}`).toBe(true);
    for (const s of SEA_SEATS) expect(reachableNear(s.x, s.y + 9, 10), s.id).toBe(true);
  });
});

describe("seaLayout — 물·바닥", () => {
  it("만조엔 선착장 위는 마르고 갯벌은 잠긴다, 간조엔 갯벌이 드러난다", () => {
    expect(seaWet(SEA_PIER.x + 20, 700, 1)).toBe(false);
    expect(seaWet(400, 700, 1)).toBe(true);
    expect(seaWet(400, 700, 0)).toBe(false);
    expect(seaWet(SEA_BREAKWATER.x + 20, 700, 1)).toBe(false);
  });
  it("바닥 종류가 띠 순서대로다", () => {
    // 11/16 버스 길은 오른쪽 끝 ~ 돌림 마당까지만, 그 왼쪽 띠는 풀밭
    expect(seaGroundKind(1200, 125)).toBe("road");
    expect(seaGroundKind(600, 125)).toBe("grass");
    expect(seaGroundKind(600, 401)).toBe("boardwalk");
    expect(seaGroundKind(300, 480)).toBe("sand");
    expect(seaGroundKind(560, 720)).toBe("flat");
    expect(seaGroundKind(400, 950)).toBe("deep");
    expect(seaGroundKind(400, 20)).toBe("hill");
  });
  it("선착장 말뚝에 갈매기 자리가 있다, 밤 빛은 맵 안", () => {
    expect(SEA_PIER_POSTS.length).toBeGreaterThan(6);
    for (const l of SEA_LIGHTS) expect(l.y).toBeGreaterThan(0);
  });
  it("미니맵 바탕 크기와 주요 장소", () => {
    expect(seaMinimapPixels().length).toBe(SEA_MINIMAP_W * SEA_MINIMAP_H * 4);
    for (const l of SEA_LANDMARKS) {
      const m = toSeaMinimap(l.x, l.y);
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThan(SEA_MINIMAP_W);
      expect(m.y).toBeLessThan(SEA_MINIMAP_H);
    }
  });
});
