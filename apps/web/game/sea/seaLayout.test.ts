import { describe, expect, it } from "vitest";
import * as P from "@tomb/protocol";
import * as L from "./seaLayout";
import {
  SEA_ARRIVE,
  SEA_BOARD,
  SEA_BREAKWATER,
  SEA_BREAKWATER_TIP,
  SEA_FLAT_Y0,
  SEA_DEEP_Y,
  SEA_HEIGHT,
  SEA_BOARDWALK,
  SEA_SAND_Y0,
  SEA_FOOTBATH,
  SEA_LIGHTHOUSE_DOOR,
  SEA_LOTS,
  SEA_DIG_HOLES,
  SEA_FISHING_SPOTS,
  SEA_REST_SEATS,
  SEA_MATS,
  seaLotFront,
  seaLotGate,
  SEA_PIER,
  SEA_PIER_ARM,
  SEA_PONTOON,
  SEA_DECKS,
  SEA_RAIL_CELL,
  seaDeckFootprints,
  SEA_ROAD,
  SEA_JETSKIS,
  SEA_PONTOON_RAMP,
  seaJetDismount,
  onSeaDeck,
  SEA_PIER_END,
  SEA_ROCKS,
  SEA_SEATS,
  TIDE_LOW_Y,
  seaWet,
} from "@tomb/protocol";
import { SEA_FUTURE_SPOTS, SEA_INTERACTABLES, SEA_LIGHTS, SEA_PIER_POSTS, seaFurnitureColliders, seaGroundKind, seaStandable, seaStaticColliders, seaWalkGrid } from "./seaLayout";
import { seaPickSeat } from "./seaSit";
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
  it("별장 터 출입구·선착장 끝·등대 문·족욕 바위까지 걸어서 가요", () => {
    // 11/16 터마다 출입구 쪽이 달라요 (seaLotFront)
    for (const l of SEA_LOTS) {
      const f = seaLotFront(l);
      expect(reachableNear(f.x, f.y, 8), `lot ${l.n} gate`).toBe(true);
      expect(reachableNear(l.x + l.w / 2, l.y + l.h / 2, 8), `lot ${l.n} inside`).toBe(true);
    }
    // 11/16 갯바위 낚시 자리: 앞(바다 쪽)에서 걸어 닿고, 일어서는 자리(앞 9px)에 설 수 있어요
    for (const f of SEA_FISHING_SPOTS) {
      // r15 선착장 낚시 가지 위 자리는 그 자리에서 앉고 일어서요 (앞은 난간)
      const sy = onSeaDeck(f.x, f.y) ? f.y : f.y + 9;
      expect(reachableNear(f.x, sy, 14), `fish ${f.id}`).toBe(true);
      expect(seaStandable(f.x, sy), `fish stand ${f.id}`).toBe(true);
    }
    // 11/16 쉴거리 자리(선베드·돗자리·파라솔)와 바다 보기 벤치·끝 걸터앉기에 걸어서 닿아요
    for (const r of SEA_REST_SEATS) expect(reachableNear(r.x, r.y + 8, 12), r.id).toBe(true);
    for (const s of SEA_SEATS) expect(reachableNear(s.x, s.y + (s.standDy ?? 9), 10), s.id).toBe(true);
    // 쉴거리는 구덩이·길을 막지 않아요 (갯벌 캐기 구멍과 떨어져 있고, 돗자리 위는 걸을 수 있어요)
    for (const r of SEA_REST_SEATS) for (const h of SEA_DIG_HOLES) expect(Math.hypot(r.x - h.x, r.y - h.y), `${r.id}/${h.x}`).toBeGreaterThan(60);
    for (const m of SEA_MATS) for (const dx of [-16, 0, 16]) expect(seaStandable(m.x + dx, m.y), `mat ${m.x}`).toBe(true);
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
    // 11/16 r11 맵을 줄이며 선착장·방파제도 짧게
    for (const y of [SEA_PIER.y + 10, SEA_PIER.y + SEA_PIER.h / 2, SEA_PIER_END.y + 30]) expect(seaStandable(px, y), `pier ${y}`).toBe(true);
    const bx = SEA_BREAKWATER.x + SEA_BREAKWATER.w / 2;
    for (const y of [SEA_BREAKWATER.y + 10, SEA_BREAKWATER.y + SEA_BREAKWATER.h - 10]) expect(seaStandable(bx, y), `breakwater ${y}`).toBe(true);
    expect(seaStandable(SEA_BREAKWATER_TIP.x + 14, SEA_BREAKWATER_TIP.y + SEA_BREAKWATER_TIP.h - 4)).toBe(true);
  });
  it("갯벌은 물때와 상관없이 늘 걷는다 (바위만 빼고)", () => {
    const inRock = (x: number, y: number) => SEA_ROCKS.some((r) => Math.abs(x - r.x) < r.rx + 6 && Math.abs(y - r.y) < r.ry + 8);
    for (const x of [300, 420, 520, 760, 980, 1040, 1240])
      for (let y = SEA_FLAT_Y0 + 2; y <= TIDE_LOW_Y; y += 6) {
        if (inRock(x, y)) continue;
        expect(seaStandable(x, y), `${x},${y}`).toBe(true);
      }
  });
  // 11/16 먼바다에서도 헤엄·잠수할 수 있게 막지 않아요 (늘 물속). 맵 아래 끝·묶인 낚싯배만 막아요
  it("먼바다는 헤엄칠 수 있고 늘 물속, 낚싯배와 맵 아래 끝은 막혀 있다", () => {
    for (const [x, y] of [
      [300, SEA_DEEP_Y + 20],
      [1000, SEA_DEEP_Y + 30],
      [560, SEA_DEEP_Y + 40],
    ]) {
      expect(seaStandable(x, y), `${x},${y}`).toBe(true);
      expect(seaWet(x, y, 0), `${x},${y}`).toBe(true);
    }
    expect(seaStandable(300, SEA_HEIGHT - 5)).toBe(false);
  });
  // 11/16 r15 사용자: 데크(선착장·끝 데크·낚시 가지·부잔교·다리·방파제) 가장자리에서 물로 걸어 내려가지 못해요 — 둘레가 빈틈없이 막혀 있어요
  it("데크 가장자리 바로 바깥 물(갯벌 위 포함)은 걸을 수 없어요", () => {
    const C = SEA_RAIL_CELL;
    const inDeck = (x: number, y: number) => SEA_DECKS.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    let edges = 0;
    for (const r of SEA_DECKS)
      for (let y = r.y + C / 2; y < r.y + r.h; y += C)
        for (let x = r.x + C / 2; x < r.x + r.w; x += C)
          for (const [dx, dy] of [[C, 0], [-C, 0], [0, C], [0, -C]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (inDeck(nx, ny) || ny - C / 2 < SEA_FLAT_Y0) continue;
            edges++;
            expect(seaStandable(nx, ny + 2), `${nx},${ny} next to deck`).toBe(false);
          }
    expect(edges).toBeGreaterThan(100);
    // 데크 안쪽은 걸을 수 있어요 (선착장 몸통 · 낚시 가지 · 다리 · 부잔교 · 끝 데크)
    for (const [x, y] of [[SEA_PIER.x + 20, SEA_PIER.y + 60], [SEA_PIER_ARM.x + 30, SEA_PIER_ARM.y + 14], [SEA_PONTOON_RAMP.x + 26, SEA_PONTOON_RAMP.y + 20], [SEA_PONTOON.x + 16, SEA_PONTOON.y + 60], [SEA_PIER_END.x + 48, SEA_PIER_END.y + 22]])
      expect(seaStandable(x, y), `${x},${y}`).toBe(true);
  });
  // 11/16 r17 사용자 "난간을 스치며 움직이면 데크 안으로 튀어 들어가요" — 물·갯벌에서 데크 가장자리를 비스듬히 스치며 가도 데크 안으로 못 들어가요
  it("데크 바깥에서 가장자리를 스치며 움직여도 데크 안으로 들어가지 않아요 (여러 각도·속도)", () => {
    const rects = [...seaStaticColliders(), ...seaFurnitureColliders()];
    const foot = seaDeckFootprints();
    const hit = (x: number, y: number, list: readonly { x: number; y: number; w: number; h: number }[]) => list.find((r) => x - 4 < r.x + r.w && x + 4 > r.x && y - 5 < r.y + r.h && y > r.y);
    const active = (x: number, y: number) => (onSeaDeck(x, y) ? rects : [...rects, ...foot]);
    const step = (p: { x: number; y: number }, dx: number, dy: number) => {
      const list = active(p.x, p.y);
      let nx = p.x + dx;
      let r = hit(nx, p.y, list);
      if (r) nx = dx > 0 ? r.x - 4.01 : r.x + r.w + 4.01;
      if (hit(nx, p.y, list)) nx = p.x;
      let ny = p.y + dy;
      r = hit(nx, ny, list);
      if (r) ny = dy > 0 ? r.y - 0.01 : r.y + r.h + 5.01;
      if (hit(nx, ny, list)) ny = p.y;
      p.x = nx;
      p.y = ny;
    };
    let runs = 0;
    for (const d of SEA_DECKS) {
      if (d.y + d.h < SEA_FLAT_Y0 + 20) continue;
      const y0 = Math.max(d.y, SEA_FLAT_Y0 + 24);
      // 네 변 바깥 20px에서 출발, 변을 따라 비스듬히(데크 쪽으로) 스쳐 가요
      const starts = [
        { x: d.x - 20, y: (y0 + d.y + d.h) / 2, dirs: [[1, 0.6], [1, -0.6], [1, 0.1], [0.3, 1]] },
        { x: d.x + d.w + 20, y: (y0 + d.y + d.h) / 2, dirs: [[-1, 0.6], [-1, -0.6], [-1, 0.1], [-0.3, 1]] },
        { x: d.x + d.w / 2, y: d.y + d.h + 20, dirs: [[0.6, -1], [-0.6, -1], [0.1, -1], [1, -0.3]] },
      ];
      for (const st of starts)
        for (const [vx, vy] of st.dirs)
          for (const speed of [34, 60, 120]) {
            const p = { x: st.x, y: st.y };
            if (onSeaDeck(p.x, p.y) || p.y > SEA_HEIGHT - 20) continue;
            runs++;
            const m = Math.hypot(vx, vy);
            for (let i = 0; i < 240; i++) {
              step(p, (vx / m) * speed * 0.016, (vy / m) * speed * 0.016);
              // 데크 몸(난간 안쪽) 안에 들어가면 안 돼요 (갯바위 낚시 발판은 데크가 아니라 괜찮아요)
              expect(foot.some((r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h), `deck ${d.x},${d.y} from ${st.x},${st.y} dir ${vx},${vy} @${speed} at ${p.x.toFixed(1)},${p.y.toFixed(1)} step ${i}`).toBe(false);
            }
          }
    }
    expect(runs).toBeGreaterThan(40);
  });
  // 11/16 r18 사용자 "끝 걸터앉기가 잘 안 잡혀요" — 데크 위 여러 자리(옆·비스듬히)에서 가장 가까운 빈 방석을 골라요, 일어서는 자리는 데크 안
  it("끝 걸터앉기: 데크 위 어디서든 가까운 빈 방석, 일어서는 자리는 데크 안·앉는 자리는 가장자리", () => {
    const empty = new Map<string, number>();
    for (const fid of ["pE1", "pE2"]) {
      const seats = SEA_SEATS.filter((q) => q.furnitureId === fid);
      for (const q of seats) {
        const stand = { x: q.x, y: q.y + (q.standDy ?? 0) };
        expect(seaStandable(stand.x, stand.y), `${q.id} stand`).toBe(true);
        expect(onSeaDeck(stand.x, stand.y), `${q.id} stand on deck`).toBe(true);
        expect(onSeaDeck(q.x, q.y), `${q.id} sits on the rim`).toBe(false);
        // 옆·비스듬히·바로 위에서 다가가도 그 방석이 골라져요
        for (const [dx, dy] of [[0, -6], [-8, -10], [8, -10], [-14, 0], [14, 0], [0, -18]]) {
          const p = { x: stand.x + dx, y: stand.y + dy };
          if (!seaStandable(p.x, p.y)) continue;
          const got = seaPickSeat(p.x, p.y, empty, null);
          expect(got?.furnitureId, `${q.id} from ${dx},${dy}`).toBe(fid);
        }
      }
      // 가운데 방석에 누가 있으면 옆 방석을 골라요
      const mid = seats[1];
      const taken = new Map([[mid.id, 99]]);
      const got = seaPickSeat(mid.x, mid.y + (mid.standDy ?? 0), taken, null);
      expect(got && got.id !== mid.id && got.furnitureId === fid).toBe(true);
    }
  });
  // 11/16 r14 제트스키 부잔교: 내려서는 자리·다리는 막히지 않고, 다리로 선착장 몸통(→ 백사장)과 이어져요
  it("제트스키 부잔교에서 내려 선착장으로 걸어 나가요", () => {
    for (const j of SEA_JETSKIS) {
      const d = seaJetDismount(j);
      expect(seaStandable(d.x, d.y), `${d.x},${d.y}`).toBe(true);
      expect(onSeaDeck(d.x, d.y)).toBe(true);
    }
    const r = SEA_PONTOON_RAMP;
    for (let x = r.x - 6; x <= r.x + r.w + 6; x += 4) expect(seaStandable(x, r.y + r.h / 2 + 2), `ramp ${x}`).toBe(true);
    expect(seaStandable(SEA_PIER.x + SEA_PIER.w / 2, SEA_PIER.y + 20)).toBe(true);
  });
  it("다음 차수 쉴거리 자리·좌석은 비어 있다", () => {
    for (const p of SEA_FUTURE_SPOTS) expect(seaStandable(p.x, p.y), `${p.x},${p.y}`).toBe(true);
    // r12 뒤로 일어서는 자리(피크닉 탁자 북쪽·모닥불 북쪽 통나무·끝 걸터앉기)는 일어서는 쪽에서
    for (const s of SEA_SEATS) expect(reachableNear(s.x, s.y + (s.standDy ?? 9), 10), s.id).toBe(true);
  });
});

describe("seaLayout — 물·바닥", () => {
  it("만조엔 선착장 위는 마르고 갯벌은 잠긴다, 간조엔 갯벌이 드러난다", () => {
    const py = SEA_PIER.y + SEA_PIER.h / 2;
    expect(seaWet(SEA_PIER.x + 20, py, 1)).toBe(false);
    expect(seaWet(400, 580, 1)).toBe(true);
    expect(seaWet(400, 580, 0)).toBe(false);
    expect(seaWet(SEA_BREAKWATER.x + 20, SEA_BREAKWATER.y + 60, 1)).toBe(false);
  });
  it("바닥 종류가 띠 순서대로다", () => {
    // 11/16 버스 길은 오른쪽 끝 ~ 돌림 마당까지만, 그 왼쪽 띠는 풀밭
    expect(seaGroundKind(SEA_ROAD.x + 60, 125)).toBe("road");
    expect(seaGroundKind(SEA_ROAD.x - 80, 125)).toBe("grass"); // r15 정류장을 동쪽 끝으로 옮기며 비운 자리
    expect(seaGroundKind(600, 125)).toBe("grass");
    expect(seaGroundKind(600, SEA_BOARDWALK.y + 13)).toBe("boardwalk");
    expect(seaGroundKind(300, SEA_SAND_Y0 + 60)).toBe("sand");
    expect(seaGroundKind(560, SEA_FLAT_Y0 + 100)).toBe("flat");
    expect(seaGroundKind(400, SEA_DEEP_Y + 30)).toBe("deep");
    expect(seaGroundKind(400, 20)).toBe("hill");
  });
  it("선착장 말뚝에 갈매기 자리가 있다, 밤 빛은 맵 안", () => {
    expect(SEA_PIER_POSTS.length).toBeGreaterThanOrEqual(5); // 11/16 r11 선착장이 짧아졌어요
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

// 11/17 r2 과자 자판기 (선착장 길목) · 과자를 던질 수 있는 곳
describe("과자 자판기 · 과자 던지는 곳", () => {
  it("자판기는 선착장 머리 옆 모래밭이고 다른 막힌 것·자리와 겹치지 않아요. 앞에 서서 E를 눌러요", () => {
    const V = L.SEA_SNACK_VEND;
    const B = L.SEA_SNACK_VEND_BOX;
    // 선착장 들어가는 길목 (선착장 머리 서쪽, 머리보다 조금 위)
    expect(V.x).toBeLessThan(P.SEA_PIER.x);
    expect(P.SEA_PIER.x - V.x).toBeLessThan(30);
    expect(Math.abs(V.y - P.SEA_PIER.y)).toBeLessThan(16);
    expect(V.y).toBeGreaterThan(P.SEA_SAND_Y0);
    expect(V.y).toBeLessThan(P.SEA_FLAT_Y0);
    // 다른 막는 상자와 겹치지 않아요 (자기 상자 빼고)
    const others = [...L.seaStaticColliders(), ...L.seaFurnitureColliders()].filter((r) => !(r.x === B.x && r.y === B.y && r.w === B.w));
    for (const r of others) expect(r.x < B.x + B.w && r.x + r.w > B.x && r.y < B.y + B.h && r.y + r.h > B.y, JSON.stringify(r)).toBe(false);
    // 선착장 머리 길(선착장 폭)을 막지 않아요
    expect(B.x + B.w).toBeLessThanOrEqual(P.SEA_PIER.x);
    // E 자리: 서 있을 수 있고, 매점·음료 자판기·망원경 E 자리와 떨어져 있어요
    const o = L.SEA_INTERACTABLES.find((i) => i.kind === "snackVend")!;
    expect(o).toBeDefined();
    expect(L.seaStandable(o.x, o.y)).toBe(true);
    for (const i of L.SEA_INTERACTABLES) if (i !== o) expect(Math.hypot(i.x - o.x, i.y - o.y), i.id).toBeGreaterThan(i.r + o.r);
    for (const sc of P.SEA_SCOPES) expect(Math.hypot(sc.x - o.x, sc.y - o.y)).toBeGreaterThan(40);
    // 선착장 머리 가운데로 걸어 들어가는 사람은 자판기 E 판정에 걸리지 않아요
    expect(Math.hypot(P.SEA_PIER.x + P.SEA_PIER.w / 2 - o.x, P.SEA_PIER.y - o.y)).toBeGreaterThan(o.r);
  });
  it("과자는 백사장·갯벌·선착장·방파제·산책로 어디서든 던져요 (위쪽 별장·정류장은 아니에요)", () => {
    const at = (x: number, y: number) => L.seaSnackZone(x, y);
    expect(at(600, 400)).toBe(true); // 백사장
    expect(at(500, 560)).toBe(true); // 갯벌
    expect(at(P.SEA_PIER.x + 20, P.SEA_PIER.y + 120)).toBe(true); // 선착장
    expect(at(P.SEA_PIER_END.x + 40, P.SEA_PIER_END.y + 20)).toBe(true); // 선착장 끝
    expect(at(P.SEA_BREAKWATER.x + 20, P.SEA_BREAKWATER.y + 60)).toBe(true); // 방파제
    expect(at(P.SEA_BREAKWATER_TIP.x + 40, P.SEA_BREAKWATER_TIP.y + 40)).toBe(true); // 방파제 끝
    expect(at(800, P.SEA_BOARDWALK.y + 10)).toBe(true); // 산책로
    for (const l of P.SEA_LOTS) expect(at(l.x + l.w / 2, l.y + l.h / 2), `별장 ${l.n}`).toBe(false);
    expect(at(P.SEA_BUS_STOP.x, P.SEA_BUS_STOP.y)).toBe(false);
  });
});
