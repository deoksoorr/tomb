import { describe, expect, it } from "vitest";
import { BOATS, boatKind, BUMPER_RINK, DUCK_DOCK, DUCK_POND, DUCK_SIDE_SEAT, ZOO } from "@tomb/protocol";
import {
  DUCK_HULL_HALF,
  DUCK_RING_N,
  DUCK_SHORE_REACH,
  duckLandNear,
  duckShoreRing,
  duckWater,
  nearestDuckLanding,
  steerToward,
  stepBoat,
} from "../logic/boat";
import { inWater, standable } from "./layout";
import { nearestSafeGround, safeGround, walkReachable } from "./walkReach";
import { resumeSpot } from "../logic/restore";
import { CRITTERS, restSpots } from "./life/critterSim";
import { DOGS, dogSpots } from "./life/dogSim";
import { RESIDENTS } from "./life/residentData";
import { residentSpots } from "./life/residentSim";

// 11/16 오리배는 아무 둑에서나 내린다 (logic/boat duckShoreRing · world/BoatRide) — 내려설 뭍은 world/walkReach가 다시 본다

const ring = duckShoreRing(safeGround);
const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number, pad = 0) =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** 왼쪽 자리(조종) 기준, 연못 가운데에서 각도 a로 몰았을 때 닿는 가장 바깥 물 위 자리 */
function edgeAt(a: number): { x: number; y: number } | null {
  const p = DUCK_POND;
  let last: { x: number; y: number } | null = null;
  for (let t = 0; t < 1.2; t += 0.005) {
    const x = Math.round(p.x - DUCK_SIDE_SEAT / 2 + Math.cos(a) * p.rx * t);
    const y = Math.round(p.y + Math.sin(a) * p.ry * t);
    if (duckWater(x, y)) last = { x, y };
    else if (last) break;
  }
  return last;
}

describe("11/16 오리배 아무 둑에서나 내리기", () => {
  it("연못 둘레 내려설 자리: 거의 한 바퀴, 모두 충돌·물 밖이고 걸어서 이어지는 땅, 배 자리는 물 위에서 손 닿는 거리", () => {
    expect(ring.length).toBeGreaterThanOrEqual(DUCK_RING_N * 0.75);
    for (const r of ring) {
      const at = JSON.stringify(r);
      expect(standable(r.land.x, r.land.y), at).toBe(true);
      expect(inWater(r.land.x, r.land.y), at).toBe(false);
      expect(walkReachable(r.land.x, r.land.y), at).toBe(true);
      expect(duckWater(r.boat.x, r.boat.y), at).toBe(true);
      expect(Math.hypot(r.land.x - r.boat.x, r.land.y - r.boat.y), at).toBeLessThanOrEqual(DUCK_SHORE_REACH);
      // 범퍼카 링크 안·동물원 안에는 내리지 않는다
      expect(inRect(BUMPER_RINK, r.land.x, r.land.y), at).toBe(false);
      expect(inRect(ZOO, r.land.x, r.land.y), at).toBe(false);
    }
    // 빈 각도(둑이 막힌 곳)가 길게 이어지지 않는다: 45° 넘게 비는 곳이 없다
    const angles = ring.map((r) => Math.atan2((r.land.y - DUCK_POND.y) / DUCK_POND.ry, (r.land.x - DUCK_POND.x) / DUCK_POND.rx)).sort((a, b) => a - b);
    let gap = angles[0] + Math.PI * 2 - angles[angles.length - 1];
    for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
    expect(gap).toBeLessThan(Math.PI / 4);
  });

  it("둑까지 몰고 가면 어디서든 바로 내린다 (「E 내리기」) — 연못 둘레 72방향 모두", () => {
    const miss: string[] = [];
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const e = edgeAt(a);
      if (!e) continue;
      // 조종하는 사람(왼쪽 자리)도, 옆자리 사람도
      for (const dx of [0, DUCK_SIDE_SEAT]) {
        const land = duckLandNear(e.x + dx, e.y, ring);
        if (!land) miss.push(`${k * 5}° ${e.x + dx},${e.y}`);
        else expect(safeGround(land.x, land.y)).toBe(true);
      }
    }
    expect(miss).toEqual([]);
  });

  it("연못 한가운데에서는 바로 못 내리고, 가장 가까운 둑으로 저절로 저어 가면 내릴 거리에 든다", () => {
    const c = { x: DUCK_POND.x - DUCK_SIDE_SEAT / 2, y: DUCK_POND.y };
    expect(duckLandNear(c.x, c.y, ring)).toBeNull();
    for (const start of [c, { x: c.x - 60, y: c.y + 30 }, { x: c.x + 70, y: c.y - 20 }, { x: c.x + 10, y: c.y + 60 }]) {
      const to = nearestDuckLanding(start.x, start.y, ring)!;
      expect(to).not.toBeNull();
      const m = { ...start, vx: 0, vy: 0 };
      let landed = false;
      for (let i = 0; i < 60 * 12 && !landed; i++) {
        const go = steerToward(m.x, m.y, to.boat.x, to.boat.y);
        stepBoat(m, go.ax, go.ay, 16, { vx: 0, vy: 0 }, "duck");
        expect(duckWater(m.x, m.y)).toBe(true);
        landed = duckLandNear(m.x, m.y, ring) !== null;
      }
      expect(landed, JSON.stringify(start)).toBe(true);
    }
  });

  it("매여 있는 오리배 자리는 선착장 둑에서 바로 내릴 수 있고 (타자마자 E로도 내린다), 배는 판자에 닿지 않는다", () => {
    for (const b of BOATS.filter((x) => boatKind(x) === "duck")) {
      expect(duckWater(b.x, b.y), b.id).toBe(true);
      expect(Math.hypot(b.x + DUCK_SIDE_SEAT / 2 - DUCK_DOCK.x, b.y - DUCK_DOCK.y)).toBeGreaterThan(DUCK_HULL_HALF - 2);
    }
    expect(duckLandNear(DUCK_DOCK.x - 40, DUCK_DOCK.y + 6, ring)).not.toBeNull();
  });
});

describe("11/16 걸어서 이어지는 땅 (world/walkReach)", () => {
  it("범퍼카 링크 안·연못 물속은 갇힌 곳, 입구 앞·연못 둑은 이어진 땅", () => {
    const R = BUMPER_RINK;
    expect(walkReachable(R.x + R.w / 2, R.y + R.h / 2)).toBe(false);
    expect(safeGround(R.x + 40, R.y + 60)).toBe(false);
    expect(safeGround(DUCK_POND.x, DUCK_POND.y)).toBe(false);
    expect(safeGround(DUCK_DOCK.x, DUCK_DOCK.y - 30)).toBe(true);
  });

  it("갇힌 곳에서 가장 가까운 안전한 땅은 링크 바로 바깥 (걸어서 이어진다)", () => {
    const R = BUMPER_RINK;
    for (const [x, y] of [
      [R.x + 30, R.y + 40],
      [R.x + R.w - 20, R.y + R.h - 20],
      [R.x + R.w / 2, R.y + 20],
    ]) {
      const s = nearestSafeGround(x, y);
      expect(s, `${x},${y}`).not.toBeNull();
      expect(inRect(R, s!.x, s!.y), `${x},${y} → ${s!.x},${s!.y}`).toBe(false);
      expect(safeGround(s!.x, s!.y)).toBe(true);
    }
    // 링크 한가운데는 둘레(96px) 안에 바깥 땅이 없을 수도 있다 → 더 넓게 찾으면 있다
    expect(nearestSafeGround(R.x + R.w / 2, R.y + R.h / 2, 160)).not.toBeNull();
  });

  it("새로고침 복원: 넓어진 링크 안에 서 있던 기록은 링크 바로 바깥으로, 넓어진 연못 물속은 그대로(헤엄쳐 나온다), 둑은 그대로", () => {
    const R = BUMPER_RINK;
    const ground = { standable, inWater, reachable: walkReachable, nearest: nearestSafeGround };
    const inRink = resumeSpot({ x: R.x + 24, y: R.y + R.h - 24 }, "idle", ground)!;
    expect(inRink).not.toBeNull();
    expect(inRect(R, inRink.x, inRink.y)).toBe(false);
    expect(safeGround(inRink.x, inRink.y)).toBe(true);
    const pond = { x: DUCK_POND.x + 40, y: DUCK_POND.y + 60 };
    expect(resumeSpot(pond, "idle", ground)).toBe(pond);
    const bank = { x: DUCK_DOCK.x, y: DUCK_DOCK.y - 30 };
    expect(resumeSpot(bank, "idle", ground)).toBe(bank);
  });
});

describe("11/16 넓어진 범퍼카 링크·오리 연못 둘레의 마을 생물", () => {
  it("고양이·유령·개·주민의 쉼 자리는 링크 안(갇힌 곳)이나 연못 물속에 없다", () => {
    const R = BUMPER_RINK;
    const all = [
      ...CRITTERS.flatMap((d) => restSpots(d).map((s) => ({ id: d.id, ...s }))),
      ...DOGS.flatMap((d) => dogSpots(d).map((s) => ({ id: d.id, ...s }))),
      ...RESIDENTS.flatMap((d) => residentSpots(d).map((s) => ({ id: d.id, ...s }))),
    ];
    for (const s of all) {
      expect(inRect(R, s.x, s.y), `${s.id} ${s.x},${s.y}`).toBe(false);
      expect(inWater(s.x, s.y), `${s.id} ${s.x},${s.y}`).toBe(false);
    }
  });
});
