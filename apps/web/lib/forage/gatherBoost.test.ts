import { describe, expect, it } from "vitest";
import {
  SEA_ARRIVE,
  SEA_DECKS,
  SEA_DIG_HOLES,
  SEA_FISHING_SPOTS,
  SEA_LOTS,
  SEA_REST_SEATS,
  SEA_SEATS,
  seaDigOpenMinutes,
  seaWet,
} from "@tomb/protocol";
import { walkReachable } from "@/game/world/walkReach";
import { SEA_FUTURE_SPOTS, SEA_INTERACTABLES, seaStandable, seaWalkGrid } from "@/game/sea/seaLayout";
import { earnRule } from "../economy";
import { DAILY_CATCH_MAX, GATHER_NODES, NODE_CAT, nodeOnMap, SEA_GATHER_NODES, type GatherNode, type NodeKind } from "./catalog";
import { activeNodes, INSECT_POINTS_MAX, NODE_DENSITY, NODE_SYNC_WINDOWS, NODE_WINDOW_MS, nodeIdsAt, nodeSeed, nodeWindow, candidates } from "./rules";
import { GatherStartSchema } from "./schemas";
import { SEA_LAND_NODES } from "./seaNodes";
import { FORAGE_STARTS_PER_HOUR } from "./service";
import { lk, TOOK_BUCKET, TOOK_TTL_SEC } from "./store";
import { GATHER_TTL_SEC, BUG_TTL_SEC } from "./rules";

// 11/16 사용자 "곤충 채집·채집이 너무 적고 늦게 다시 펴요" → 창 15분 → 10분 + 맵마다 지점 반쯤 더.
// 하루 한도·포인트 한도는 그대로, 채집 한 번의 Redis 명령도 그대로, 창이 짧아져도 키·상태 읽기가 늘지 않게.

type Map3 = "village" | "camp" | "sea";
const KINDS: readonly NodeKind[] = ["herb", "ore", "dig", "bug", "clam"];
const countOf = (map: Map3) => Object.fromEntries(KINDS.map((k) => [k, GATHER_NODES.filter((n) => nodeOnMap(n, map) && n.kind === k).length]));

/** 늘리기 전 (11/16 아침) 지점 수와 창 */
const BEFORE: Record<Map3, Record<NodeKind, number>> = {
  village: { herb: 14, ore: 8, dig: 8, bug: 9, clam: 0 },
  camp: { herb: 7, ore: 5, dig: 4, bug: 7, clam: 0 },
  sea: { herb: 0, ore: 0, dig: 0, bug: 0, clam: 12 },
};
const BEFORE_WINDOW_MS = 15 * 60_000;
const BEFORE_DENSITY: Record<NodeKind, number> = { herb: 0.6, ore: 0.5, dig: 0.4, bug: 0.55, clam: 0.6 };

/** 한 사람에게 한 창에 피어 있을 것으로 기대하는 지점 수, 한 시간에 새로 피는 수 */
const openPerWindow = (c: Record<NodeKind, number>, d: Record<NodeKind, number>) => KINDS.reduce((s, k) => s + c[k] * d[k], 0);
const perHour = (c: Record<NodeKind, number>, d: Record<NodeKind, number>, win: number) => openPerWindow(c, d) * (3_600_000 / win);

describe("지점 수 (맵마다·종류마다)", () => {
  it("마을·캠핑장은 종류마다 반쯤 더, 바닷가는 곤충·약초·모래·갯바위가 새로 생기고 갯벌 구멍도 더", () => {
    expect(countOf("village")).toEqual({ herb: 20, ore: 12, dig: 12, bug: 15, clam: 0 });
    expect(countOf("camp")).toEqual({ herb: 10, ore: 8, dig: 6, bug: 11, clam: 0 });
    expect(countOf("sea")).toEqual({ herb: 5, ore: 4, dig: 4, bug: 8, clam: 16 });
    for (const map of ["village", "camp"] as const)
      for (const k of KINDS) {
        const b = BEFORE[map][k];
        if (b) expect(countOf(map)[k] / b, `${map} ${k}`).toBeGreaterThanOrEqual(1.4);
      }
  });

  it("id는 모두 다르고 맵마다 접두어가 다르며, 서버 입력 검증이 받는다", () => {
    expect(new Set(GATHER_NODES.map((n) => n.id)).size).toBe(GATHER_NODES.length);
    for (const n of GATHER_NODES) {
      expect(GatherStartSchema.safeParse({ node: n.id }).success, n.id).toBe(true);
      if (n.map === "camp") expect(n.id.startsWith("q"), n.id).toBe(true);
      else if (n.map === "sea") expect(n.id.startsWith("s"), n.id).toBe(true);
      else expect(/^[hodb]\d/.test(n.id), n.id).toBe(true);
    }
    // 예전 갯벌 구멍 12곳(그림이 있는 구멍)은 그대로
    expect(SEA_GATHER_NODES).toHaveLength(12);
    for (const n of SEA_LAND_NODES) expect(n.map).toBe("sea");
  });
});

describe("얼마나 자주 피나 (기대값)", () => {
  it("창 10분, 밀도는 그대로", () => {
    expect(NODE_WINDOW_MS).toBe(10 * 60_000);
    expect(NODE_DENSITY).toEqual(BEFORE_DENSITY);
  });

  it("한 시간에 피는 지점이 맵마다 두 배쯤 (마을·캠핑장 약 2.3배, 바닷가는 뭍 지점이 새로 4배 남짓)", () => {
    const after = (map: Map3) => perHour(countOf(map) as Record<NodeKind, number>, NODE_DENSITY, NODE_WINDOW_MS);
    const before = (map: Map3) => perHour(BEFORE[map], BEFORE_DENSITY, BEFORE_WINDOW_MS);
    for (const map of ["village", "camp"] as const) {
      const r = after(map) / before(map);
      expect(r, map).toBeGreaterThan(1.9);
      expect(r, map).toBeLessThan(2.6);
    }
    expect(after("sea") / before("sea")).toBeGreaterThan(2.5);
    // 한 창에 피어 있는 수 (마을: 20.55 → 31.05, 캠핑장: 12.15 → 18.45, 바닷가: 7.2 → 20.6). 한 시간에: 마을 82 → 186, 캠핑장 49 → 111, 바닷가 29 → 124
    expect(openPerWindow(countOf("village") as Record<NodeKind, number>, NODE_DENSITY)).toBeCloseTo(31.05, 2);
    expect(openPerWindow(countOf("camp") as Record<NodeKind, number>, NODE_DENSITY)).toBeCloseTo(18.45, 2);
    expect(openPerWindow(countOf("sea") as Record<NodeKind, number>, NODE_DENSITY)).toBeCloseTo(20.6, 2);
  });

  it("실제로 굴려도 기대값 근처 (사람 200 × 창 30)", () => {
    const expected = openPerWindow(countOf("village") as Record<NodeKind, number>, NODE_DENSITY);
    let sum = 0;
    let n = 0;
    for (let a = 0; a < 200; a++)
      for (let w = 0; w < 30; w++) {
        const t = (2_960_000 + w) * NODE_WINDOW_MS;
        sum += activeNodes(`acct-${a}`, t, new Set()).filter((x) => nodeOnMap(x, "village")).length;
        n++;
      }
    expect(Math.abs(sum / n - expected)).toBeLessThan(1);
  });

  it("다시 피기까지: 캔 자리는 다음 창(최대 10분 뒤)에 다시 굴린다", () => {
    const t = Date.UTC(2026, 10, 16, 3, 4);
    expect(nodeWindow(t + NODE_WINDOW_MS)).toBe(nodeWindow(t) + 1);
    const all = activeNodes("acct-r", t, new Set());
    const taken = new Set([all[0].id]);
    expect(activeNodes("acct-r", t, taken).map((x) => x.id)).not.toContain(all[0].id);
  });
});

describe("한도는 그대로 (포인트 수도꼭지 없음)", () => {
  it("하루 채집 개수·판매·곤충 포인트·시간당 시작 한도", () => {
    expect(DAILY_CATCH_MAX).toEqual({ fish: 150, gather: 200 });
    expect(earnRule("gather").dailyMax).toBe(300);
    expect(earnRule("fish").dailyMax).toBe(300);
    expect(earnRule("bugs").dailyMax).toBe(300);
    expect(INSECT_POINTS_MAX).toBe(15);
    expect(FORAGE_STARTS_PER_HOUR).toBe(300);
  });

  it("새 바닷가 지점은 새 종 없이 기존 종이 나온다 (가을 낮·밤)", () => {
    for (const phase of ["day", "night"] as const)
      for (const n of SEA_LAND_NODES) expect(candidates(NODE_CAT[n.kind], n.where, { phase, weather: "clear", season: "autumn" }).length, `${n.id} ${phase}`).toBeGreaterThan(0);
  });
});

describe("Redis: 창이 짧아져도 늘지 않게", () => {
  it("캔 지점 키는 창 셋(30분)을 한 키로 → 하루 키 수가 예전(15분 창마다 하나)보다 적다", () => {
    expect(TOOK_BUCKET).toBe(3);
    const keysPerDayAfter = 86_400_000 / (NODE_WINDOW_MS * TOOK_BUCKET);
    const keysPerDayBefore = 86_400_000 / BEFORE_WINDOW_MS;
    expect(keysPerDayAfter).toBeLessThanOrEqual(keysPerDayBefore / 2);
    expect(lk.took("A", 30)).toBe(lk.took("A", 32));
    expect(lk.took("A", 30)).not.toBe(lk.took("A", 33));
    expect(lk.took("A", 29)).not.toBe(lk.took("A", 30));
    // 보관은 묶음 길이 + 진행 중인 채집(티켓) 시간보다 길고, 예전 2시간보다 짧다 → 한꺼번에 살아 있는 키는 둘 이하
    expect(TOOK_TTL_SEC * 1000).toBeGreaterThan(NODE_WINDOW_MS * TOOK_BUCKET + Math.max(GATHER_TTL_SEC, BUG_TTL_SEC) * 1000);
    expect(TOOK_TTL_SEC).toBeLessThan(2 * 3_600);
    expect(Math.ceil((TOOK_TTL_SEC * 1000) / (NODE_WINDOW_MS * TOOK_BUCKET))).toBeLessThanOrEqual(2);
  });

  it("화면의 창 바뀜: 씨앗으로 계산한 다음 창 목록 = 서버 목록, 서버에서 다시 받는 건 30분마다 (예전 15분마다)", () => {
    for (const a of ["acct-1", "acct-2", "t-x"]) {
      const t = Date.UTC(2026, 10, 16, 5, 0);
      for (let k = 0; k < 6; k++) {
        const now = t + k * NODE_WINDOW_MS;
        expect(nodeIdsAt(nodeSeed(a), nodeWindow(now))).toEqual(activeNodes(a, now, new Set()).map((n) => n.id));
      }
    }
    // 씨앗은 계정 id를 드러내지 않는다
    expect(nodeSeed("acct-1")).not.toContain("acct");
    expect(NODE_WINDOW_MS * NODE_SYNC_WINDOWS).toBeGreaterThanOrEqual(2 * BEFORE_WINDOW_MS);
  });
});

describe("자리: 서 있고 걸어서 닿고 다른 것과 떨어져 있다", () => {
  it("마을 지점은 모두 스폰에서 걸어서 닿는다", () => {
    for (const n of GATHER_NODES.filter((x) => nodeOnMap(x, "village"))) expect(walkReachable(n.x, n.y), n.id).toBe(true);
  });

  const grid = seaWalkGrid(8);
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
  const reachableNear = (x: number, y: number, r: number) => {
    const { cell, cols, rows } = grid;
    for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++)
      for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        if (Math.hypot(cx * cell + cell / 2 - x, cy * cell + cell / 2 - y) <= r && reach[cy * cols + cx]) return true;
      }
    return false;
  };
  const far = (pts: readonly { x: number; y: number }[], n: GatherNode, d: number) => pts.every((p) => Math.hypot(p.x - n.x, p.y - n.y) >= d);

  it("바닷가 새 지점: 서 있고 정류장에서 닿고, 데크·별장 터·자리·낚시 자리·안내·구멍·서로와 떨어져 있다", () => {
    const sea = GATHER_NODES.filter((n) => nodeOnMap(n, "sea"));
    for (const n of SEA_LAND_NODES) {
      expect(seaStandable(n.x, n.y), n.id).toBe(true);
      expect(reachableNear(n.x, n.y, 10), `${n.id} 닿기`).toBe(true);
      expect(SEA_DECKS.some((r) => n.x > r.x - 16 && n.x < r.x + r.w + 16 && n.y > r.y - 16 && n.y < r.y + r.h + 16), `${n.id} 데크`).toBe(false);
      expect(SEA_LOTS.some((l) => n.x > l.x - 12 && n.x < l.x + l.w + 12 && n.y > l.y - 12 && n.y < l.y + l.h + 18), `${n.id} 별장 터`).toBe(false);
      expect(far(SEA_SEATS, n, 24), `${n.id} 자리`).toBe(true);
      expect(far(SEA_REST_SEATS, n, 28), `${n.id} 선베드`).toBe(true);
      expect(far(SEA_FISHING_SPOTS, n, 28), `${n.id} 낚시 자리`).toBe(true);
      expect(far(SEA_FUTURE_SPOTS, n, 24), `${n.id} 모래성·그네`).toBe(true);
      expect(far(SEA_DIG_HOLES, n, 30), `${n.id} 갯벌 구멍`).toBe(true);
      expect(SEA_INTERACTABLES.every((o) => Math.hypot(o.x - n.x, o.y - n.y) >= o.r + 12), `${n.id} 안내`).toBe(true);
      expect(far(sea.filter((o) => o !== n), n, 28), `${n.id} 다른 지점`).toBe(true);
      // 갯벌 구멍은 물이 빠진 동안 내내 드러나고, 뭍 지점은 만조에도 물에 잠기지 않는다
      if (n.kind === "clam") expect(seaDigOpenMinutes(n), n.id).toBeGreaterThanOrEqual(60);
      else expect(seaWet(n.x, n.y, 1), `${n.id} 만조`).toBe(false);
    }
  });
});
