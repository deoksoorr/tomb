import { describe, expect, it } from "vitest";
import { FISHING_SPOTS, HOUSE_LOTS, TILE } from "@tomb/protocol";
import type { Pt, Rect } from "../logic/pathfind";
import { OFFICE_CLERK_OFFSET, OFFICE_STALL_H, OFFICE_STALL_W } from "../sprites/officeSeller";
import { TOWER, towerColliders } from "../tower/towerLayout";
import { allFurnitureColliders, groundKind, houseCollider, inWater, interactables, LANDMARKS, staticColliders, standable } from "./layout";
import { ResidentSim, residentSpots, wanderPoints } from "./life/residentSim";
import { RESIDENTS } from "./life/residentData";
import { MAP_ICONS } from "./minimapIcons";
import { nearMungnyang } from "./mungnyangLayout";
import { nearOffice, OFFICE_CLERK, OFFICE_STALL, officeColliders, officeInteractables } from "./officeStallLayout";
import { nearStall } from "./seasonStallLayout";

// 11/20 총무팀 문대리 배치: 야근 빌딩 바로 오른쪽, 충돌이 길·빌딩·다른 노점에 걸치지 않고, E 자리에 설 수 있고,
// 까마귀 연못 서쪽 낚시 자리로 가는 길이 남고, 주민이 카트 그림에 붙어 서거나 지나가지 않는다

const PATH = ["dirt", "gravel", "cobble"];
const ROAD_TOP = 176;

describe("총무팀 문대리 배치", () => {
  it("문대리는 그림 쪽 오프셋대로 카트 뒤에 선다", () => {
    expect(OFFICE_CLERK).toEqual({ x: OFFICE_STALL.x + OFFICE_CLERK_OFFSET.x, y: OFFICE_STALL.y + OFFICE_CLERK_OFFSET.y });
    expect(OFFICE_CLERK.y).toBeLessThan(OFFICE_STALL.y);
  });

  it("야근 빌딩 바로 오른쪽 (빌딩 몸 충돌과 겹치지 않고 80px 안), 큰길 위 풀밭", () => {
    const left = OFFICE_STALL.x - OFFICE_STALL_W / 2;
    const tower = towerColliders()[0];
    expect(left).toBeGreaterThan(tower.x + tower.w);
    expect(OFFICE_STALL.x - TOWER.x).toBeLessThan(80);
    expect(OFFICE_STALL.y).toBeLessThan(ROAD_TOP);
    // 카트 발밑(아래 14줄)은 길이 아니다
    for (let y = OFFICE_STALL.y - 14; y <= OFFICE_STALL.y; y += 2)
      for (let x = left; x <= left + OFFICE_STALL_W; x += 2) expect(PATH.includes(groundKind(Math.floor(x / TILE), Math.floor(y / TILE))), `${x},${y}`).toBe(false);
  });

  it("E 자리 하나 (카트 앞), 서 있을 수 있는 자리이고 맵 상호작용 목록에 들어 있다", () => {
    const list = officeInteractables();
    expect(list.map((i) => i.portal)).toEqual(["office"]);
    for (const i of list) {
      expect(standable(i.x, i.y), i.id).toBe(true);
      expect(interactables().some((o) => o.id === i.id)).toBe(true);
    }
  });

  it("충돌은 카트·문대리 몸통 둘, 맵 충돌에 들어 있고 길 칸·물을 덮지 않는다", () => {
    const rs = officeColliders();
    expect(rs).toHaveLength(2);
    const all = staticColliders();
    for (const r of rs) {
      expect(all.some((c) => c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h)).toBe(true);
      expect(r.w).toBeLessThanOrEqual(OFFICE_STALL_W);
      for (let y = r.y; y < r.y + r.h; y += 2)
        for (let x = r.x; x < r.x + r.w; x += 2) {
          const k = groundKind(Math.floor(x / TILE), Math.floor(y / TILE));
          expect(PATH.includes(k), `${x},${y} ${k}`).toBe(false);
          expect(inWater(x, y), `${x},${y}`).toBe(false);
        }
    }
    // 카트 그림은 다른 노점·분양사 둘레와 멀다
    expect(nearStall(OFFICE_STALL.x, OFFICE_STALL.y)).toBe(false);
    expect(nearMungnyang(OFFICE_STALL.x, OFFICE_STALL.y)).toBe(false);
  });

  it("미니맵 장소와 사무 의자 그림", () => {
    expect(LANDMARKS.find((l) => l.kind === "office")?.label).toBe("총무팀 문대리");
    expect(MAP_ICONS.office).toBeDefined();
  });

  it("까마귀 연못 서쪽 낚시 자리 (1102,108)로 걸어가는 길이 남고, 카트가 없을 때보다 조금만 돌아간다 (빌딩과 카트 사이 → 카트 뒤)", () => {
    const spot = FISHING_SPOTS.find((f) => f.x === 1102 && f.y === 108)!;
    expect(spot).toBeDefined();
    const mine = officeColliders();
    const all = [...staticColliders(), ...allFurnitureColliders(), ...HOUSE_LOTS.map((l) => houseCollider(l, "manor"))];
    const without = all.filter((r) => !mine.some((m) => m.x === r.x && m.y === r.y && m.w === r.w && m.h === r.h));
    // 플레이어 발 상자(8×5, standable과 같다)로 2px 칸마다 걷는 가장 짧은 길 (물은 피한다). 자동 걷기 격자(8px)는 낚시 자리로 가지 않는다
    const steps = (rects: readonly Rect[]) => {
      const S = 2;
      const ok = (x: number, y: number) => !inWater(x, y) && !rects.some((r) => x - 4 < r.x + r.w && x + 4 > r.x && y - 5 < r.y + r.h && y > r.y);
      const key = (x: number, y: number) => x * 10_000 + y;
      const start: Pt = { x: 1100, y: 190 };
      const dist = new Map([[key(start.x, start.y), 0]]);
      const q: Pt[] = [start];
      for (let i = 0; i < q.length; i++) {
        const { x, y } = q[i];
        const d = dist.get(key(x, y))!;
        if (Math.abs(x - spot.x) <= 2 && Math.abs(y - spot.y) <= 2) return d * S;
        for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 1000 || nx > 1260 || ny < 60 || ny > 210 || dist.has(key(nx, ny)) || !ok(nx, ny)) continue;
          dist.set(key(nx, ny), d + 1);
          q.push({ x: nx, y: ny });
        }
      }
      return -1;
    };
    const before = steps(without);
    const after = steps(all);
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
    expect(after - before).toBeLessThanOrEqual(24);
  });

  it("주민의 쉼 자리·들르는 점이 카트 둘레에 없다", () => {
    expect(nearOffice(OFFICE_STALL.x, OFFICE_STALL.y - 10)).toBe(true);
    expect(nearOffice(OFFICE_CLERK.x, OFFICE_CLERK.y - 20)).toBe(true);
    for (const def of RESIDENTS) {
      for (const p of residentSpots(def)) expect(nearOffice(p.x, p.y), `${def.name} ${p.x},${p.y}`).toBe(false);
      for (const p of wanderPoints(def)) expect(nearOffice(p.x, p.y), `${def.name} ${p.x},${p.y}`).toBe(false);
    }
  });

  it("주민이 걷는 길도 카트 둘레를 지나지 않는다 (여러 채널 · 두 시간)", { timeout: 60_000 }, () => {
    const T0 = Date.UTC(2026, 10, 20, 3);
    RESIDENTS.forEach((def, i) => {
      for (const seed of [1, 2, 3]) {
        const sim = new ResidentSim(def, i, seed);
        for (let t = T0; t < T0 + 7_200_000; t += 1_000) {
          const p = sim.at(t);
          expect(nearOffice(p.x, p.y), `${def.name} ch${seed} ${Math.round(p.x)},${Math.round(p.y)}`).toBe(false);
        }
      }
    });
  });

  it("카트 그림 높이 (이름표가 차양 위에 뜬다)", () => {
    expect(OFFICE_STALL_H).toBe(48);
  });
});
