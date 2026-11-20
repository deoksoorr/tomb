import { describe, expect, it } from "vitest";
import { TILE } from "@tomb/protocol";
import { MUNGNYANG_CUSHION_AT, MUNGNYANG_CUSHION_W, MUNGNYANG_STAND_AT, MUNGNYANG_STAND_W, MUNGNYANG_YARD_PETS } from "../sprites/mungnyangSeller";
import { groundKind, interactables, LANDMARKS, staticColliders, standable } from "./layout";
import { ResidentSim, residentSpots, wanderPoints } from "./life/residentSim";
import { RESIDENTS } from "./life/residentData";
import { MAP_ICONS } from "./minimapIcons";
import { MUNGNYANG_CUSHION, MUNGNYANG_SELLER, MUNGNYANG_STAND, mungnyangColliders, mungnyangInteractables, nearMungnyang } from "./mungnyangLayout";

// 11/19 분양사 보리 배치: 충돌이 길(흙길·자갈길)에 걸치지 않고, E 자리에 설 수 있고, 주민이 분양사·펫·소품 그림에 붙어 서거나 지나가지 않는다

const PATH = ["dirt", "gravel", "cobble"];

describe("분양사 보리 배치", () => {
  it("그림 쪽 배치 값과 같은 자리 (간식 상자·방석)", () => {
    expect(MUNGNYANG_STAND).toEqual({ x: MUNGNYANG_SELLER.x + MUNGNYANG_STAND_AT.dx, y: MUNGNYANG_SELLER.y + MUNGNYANG_STAND_AT.dy });
    expect(MUNGNYANG_CUSHION).toEqual({ x: MUNGNYANG_SELLER.x + MUNGNYANG_CUSHION_AT.dx, y: MUNGNYANG_SELLER.y + MUNGNYANG_CUSHION_AT.dy });
    for (const r of mungnyangColliders()) expect(r.w).toBeLessThanOrEqual(Math.max(MUNGNYANG_STAND_W, MUNGNYANG_CUSHION_W));
  });

  it("E 자리 하나 (분양사 앞), 서 있을 수 있는 자리이고 맵 상호작용 목록에 들어 있다", () => {
    const list = mungnyangInteractables();
    expect(list.map((i) => i.portal)).toEqual(["mungnyang"]);
    for (const i of list) {
      expect(standable(i.x, i.y), i.id).toBe(true);
      expect(interactables().some((o) => o.id === i.id)).toBe(true);
    }
  });

  it("충돌은 몸통·간식 상자·방석 셋, 맵 충돌에 들어 있고 길 칸을 덮지 않는다", () => {
    const rs = mungnyangColliders();
    expect(rs).toHaveLength(3);
    const all = staticColliders();
    for (const r of rs) expect(all.some((c) => c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h)).toBe(true);
    for (const r of rs)
      for (let y = r.y; y < r.y + r.h; y += 2)
        for (let x = r.x; x < r.x + r.w; x += 2) {
          const k = groundKind(Math.floor(x / TILE), Math.floor(y / TILE));
          expect(PATH.includes(k), `${x},${y} ${k}`).toBe(false);
        }
  });

  it("발치 펫이 다니는 자리도 풀밭 (길 위로 나오지 않는다)", () => {
    for (const p of MUNGNYANG_YARD_PETS) {
      const xs = p.wander ? [p.wander.x0, p.wander.x1] : [p.dx];
      for (const dx of xs) {
        const x = MUNGNYANG_SELLER.x + dx;
        const y = MUNGNYANG_SELLER.y + p.dy;
        expect(PATH.includes(groundKind(Math.floor(x / TILE), Math.floor(y / TILE))), `${p.art} ${x},${y}`).toBe(false);
        expect(nearMungnyang(x, y - 2), `${p.art} ${x},${y}`).toBe(true);
      }
    }
  });

  it("미니맵 장소와 발바닥 그림", () => {
    expect(LANDMARKS.find((l) => l.kind === "mungnyang")?.label).toBe("분양사 보리");
    expect(MAP_ICONS.mungnyang).toBeDefined();
  });

  it("주민(멍냥이 포함)의 쉼 자리·들르는 점이 분양사 둘레에 없다", () => {
    const mn = RESIDENTS.find((r) => r.name === "멍냥이");
    expect(mn).toBeDefined();
    // 예전에 들르던 점 (132,754)은 방석·치즈냥 위였다
    expect(nearMungnyang(132, 754)).toBe(true);
    expect(wanderPoints(mn!).some((p) => p.x === 132 && p.y === 754)).toBe(false);
    for (const def of RESIDENTS) {
      for (const p of residentSpots(def)) expect(nearMungnyang(p.x, p.y), `${def.name} ${p.x},${p.y}`).toBe(false);
      for (const p of wanderPoints(def)) expect(nearMungnyang(p.x, p.y), `${def.name} ${p.x},${p.y}`).toBe(false);
    }
  });

  it("주민이 걷는 길도 분양사 둘레를 지나지 않는다 (여러 채널 · 두 시간)", { timeout: 60_000 }, () => {
    const T0 = Date.UTC(2026, 10, 19, 3);
    RESIDENTS.forEach((def, i) => {
      for (const seed of [1, 2, 3]) {
        const sim = new ResidentSim(def, i, seed);
        for (let t = T0; t < T0 + 7_200_000; t += 1_000) {
          const p = sim.at(t);
          expect(nearMungnyang(p.x, p.y), `${def.name} ch${seed} ${Math.round(p.x)},${Math.round(p.y)}`).toBe(false);
        }
      }
    });
  });
});
