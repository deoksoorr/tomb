import { describe, expect, it } from "vitest";
import { TILE, WHARF_YARD } from "@tomb/protocol";
import { groundKind, interactables, standable } from "./layout";
import { ResidentSim, residentSpots, wanderPoints } from "./life/residentSim";
import { RESIDENTS } from "./life/residentData";
import { nearStall, seasonStallColliders, seasonStallInteractables, STALL_SITES } from "./seasonStallLayout";

// 11/19 기간 한정 노점 배치: 충돌이 길(흙길·자갈길)에 걸치지 않고, E 자리에 설 수 있고, 주민이 노점 그림에 붙어 서지 않는다

describe("기간 한정 노점 배치", () => {
  it("노점마다 E 자리 둘 (NPC 앞·노점 앞), 서 있을 수 있는 자리", () => {
    const list = seasonStallInteractables();
    expect(list.map((i) => i.portal)).toEqual(["seasonCos", "seasonCos", "seasonFurn", "seasonFurn"]);
    for (const i of list) expect(standable(i.x, i.y), i.id).toBe(true);
    for (const i of list) expect(interactables().some((o) => o.id === i.id)).toBe(true);
  });

  it("충돌 상자가 길 칸을 덮지 않는다 (가구 보따리상 의자 다리 옆 행운권 흙길)", () => {
    for (const r of seasonStallColliders())
      for (let y = r.y; y < r.y + r.h; y += 2)
        for (let x = r.x; x < r.x + r.w; x += 2) {
          // 11/21 가구 보따리상은 버스 정류장 자갈 마당(예전 의뢰 게시판 자리) — 마당은 길이 아니라 광장이라 뺀다
          const Y = WHARF_YARD;
          if (x >= Y.x && x < Y.x + Y.w && y >= Y.y && y < Y.y + Y.h) continue;
          const k = groundKind(Math.floor(x / TILE), Math.floor(y / TILE));
          expect(["dirt", "gravel", "cobble"].includes(k), `${x},${y} ${k}`).toBe(false);
        }
  });

  it("주민(칼돌이 포함)의 쉼 자리·들르는 점이 노점 그림 둘레에 없다", () => {
    const kal = RESIDENTS.find((r) => r.name === "칼돌이");
    expect(kal).toBeDefined();
    for (const def of RESIDENTS) {
      for (const p of residentSpots(def)) expect(nearStall(p.x, p.y), `${def.name} ${p.x},${p.y}`).toBe(false);
      for (const p of wanderPoints(def)) expect(nearStall(p.x, p.y), `${def.name} ${p.x},${p.y}`).toBe(false);
    }
    for (const s of STALL_SITES) expect(nearStall(s.stall.x, s.stall.y - 10)).toBe(true);
  });

  it("주민이 걷는 길도 노점 그림 둘레를 지나지 않는다 (여러 채널 · 한 시간)", { timeout: 60_000 }, () => {
    const T0 = Date.UTC(2026, 10, 19, 3);
    RESIDENTS.forEach((def, i) => {
      for (const seed of [1, 2, 3]) {
        const sim = new ResidentSim(def, i, seed);
        for (let t = T0; t < T0 + 3_600_000; t += 1_000) {
          const p = sim.at(t);
          expect(nearStall(p.x, p.y), `${def.name} ch${seed} ${Math.round(p.x)},${Math.round(p.y)}`).toBe(false);
        }
      }
    });
  });
});
