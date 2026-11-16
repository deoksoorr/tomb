import { describe, expect, it } from "vitest";
import { BUMPER_GATE, BUMPER_RIM, BUMPER_RINK, BUMPER_SEATS, BUMPER_YARD, CAMPFIRE_STUMP_DX, CAMPFIRES, DIR, SPOT_KINDS, type Sid } from "@tomb/protocol";
import { BUMPER_BOOTH, BUMPER_DOOR, BUMPER_EXIT_AT, BUMPER_POSTS, bumperColliders, bumperGround, inBumperYardTiles, RINK_INNER } from "../bumper/bumperLayout";
import { inWater, inWaterBody, interactables, standable, staticColliders, walkableGrid, WALK } from "../world/layout";
import {
  BUMP_BIG_POWER,
  BUMP_COUNT_POWER,
  CAR_BOUNDS,
  CAR_MAX_SPEED,
  CAR_R,
  canExit,
  collideCar,
  dirAngle,
  EXIT_OUT,
  exitSpot,
  headingDir,
  headingFrame,
  newMotion,
  pickCar,
  remoteBumpPower,
  stepCar,
  touching,
  wallSide,
  wrapAngle,
} from "./bumper";

const drive = (m: ReturnType<typeof newMotion>, ax: number, ay: number, ms: number) => {
  for (let t = 0; t < ms; t += 16) stepCar(m, ax, ay, 16);
  return m;
};

describe("범퍼카 운전 (stepCar)", () => {
  it("가리키는 쪽으로 차머리를 돌리며 가속하고, 최고 속도를 넘지 않는다", () => {
    const m = newMotion(720, 900, Math.PI / 2); // 아래를 보고 서 있다
    drive(m, 1, 0, 2000); // 오른쪽으로
    expect(Math.abs(wrapAngle(m.h))).toBeLessThan(0.05);
    expect(m.vx).toBeGreaterThan(60);
    expect(Math.hypot(m.vx, m.vy)).toBeLessThanOrEqual(CAR_MAX_SPEED + 1e-6);
    drive(m, 1, 0, 3000);
    expect(Math.hypot(m.vx, m.vy)).toBeLessThanOrEqual(CAR_MAX_SPEED + 1e-6);
  });

  it("차머리는 한 번에 돌지 않는다 (회전 빠르기 제한) — 반대쪽을 가리켜도 한 프레임엔 조금만", () => {
    const m = newMotion(720, 900, 0);
    stepCar(m, -1, 0, 16);
    expect(Math.abs(m.h)).toBeLessThan(0.1);
    drive(m, -1, 0, 1200);
    expect(Math.abs(Math.abs(m.h) - Math.PI)).toBeLessThan(0.05);
  });

  it("미끄러진다: 빨리 달리다 꺾으면 속도 방향이 차머리보다 늦게 따라온다", () => {
    const m = drive(newMotion(720, 900, 0), 1, 0, 2000);
    drive(m, 0, 1, 250);
    const velAngle = Math.atan2(m.vy, m.vx);
    expect(m.h - velAngle).toBeGreaterThan(0.15);
  });

  it("손을 떼면 천천히 미끄러지다 선다", () => {
    const m = drive(newMotion(720, 900, 0), 1, 0, 1500);
    const v0 = m.vx;
    drive(m, 0, 0, 300);
    expect(m.vx).toBeGreaterThan(v0 * 0.5); // 바로 서지 않는다
    drive(m, 0, 0, 6000);
    expect(m.vx).toBe(0);
    expect(m.vy).toBe(0);
  });
});

describe("범퍼카 부딪힘 (collideCar)", () => {
  it("고무 테두리에 부딪히면 링크 안으로 밀려나고 튕기며, 세기를 알려 준다", () => {
    const m = { ...newMotion(CAR_BOUNDS.x1 + 3, 900, 0), vx: 80 };
    const b = collideCar(m, [], []);
    expect(m.x).toBe(CAR_BOUNDS.x1);
    expect(m.vx).toBeLessThan(0);
    expect(Math.abs(m.vx)).toBeLessThan(80);
    expect(b).toMatchObject({ with: "wall" });
    expect(b!.power).toBeCloseTo(80);
    expect(m.spin).not.toBe(0); // 살짝 돈다
    // 위·아래·왼쪽도
    for (const [x, y, vx, vy] of [
      [CAR_BOUNDS.x0 - 2, 900, -50, 0],
      [720, CAR_BOUNDS.y0 - 2, 0, -50],
      [720, CAR_BOUNDS.y1 + 2, 0, 50],
    ]) {
      const q = { ...newMotion(x, y, 0), vx, vy };
      expect(collideCar(q, [], [])?.with).toBe("wall");
      expect(q.x).toBeGreaterThanOrEqual(CAR_BOUNDS.x0);
      expect(q.y).toBeGreaterThanOrEqual(CAR_BOUNDS.y0);
      expect(q.y).toBeLessThanOrEqual(CAR_BOUNDS.y1);
    }
  });

  it("벽에서 멀어지는 중이면 부딪힘이 아니다 (붙어 있어도 세지 않는다)", () => {
    const m = { ...newMotion(CAR_BOUNDS.x1, 900, 0), vx: -30 };
    expect(collideCar(m, [], [])).toBeNull();
  });

  it("가운데 기둥·타이어에서 밀려나 튕긴다", () => {
    const p = BUMPER_POSTS[0];
    const m = { ...newMotion(p.x - p.r - CAR_R + 3, p.y, 0), vx: 60 };
    const b = collideCar(m, [], BUMPER_POSTS);
    expect(b?.with).toBe("post");
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeCloseTo(p.r + CAR_R);
    expect(m.vx).toBeLessThan(0);
  });

  it("다른 차: 서 있는 차에 박으면 내가 튕겨 나오고, 달려오는 차에 받히면 서 있던 나도 세게 밀린다", () => {
    const a = { ...newMotion(700, 900, 0), vx: 70 };
    const b = collideCar(a, [{ x: 712, y: 900, vx: 0, vy: 0 }], []);
    expect(b?.with).toBe("car");
    expect(a.vx).toBeLessThan(0);
    expect(Math.hypot(a.x - 712, a.y - 900)).toBeCloseTo(CAR_R * 2);
    // 나는 서 있고 상대가 70으로 달려와 받는다 → 나는 오른쪽으로 밀려난다
    const me = newMotion(712, 900, Math.PI / 2);
    const hit = collideCar(me, [{ x: 700, y: 900, vx: 70, vy: 0 }], []);
    expect(hit?.power).toBeCloseTo(70);
    expect(me.vx).toBeGreaterThan(50);
    expect(hit!.power).toBeGreaterThanOrEqual(BUMP_BIG_POWER);
  });

  it("차끼리 겹쳐 있으면 떨어지는 쪽으로 조금은 밀어낸다 (붙어 비비지 않게)", () => {
    const a = newMotion(700, 900, 0);
    collideCar(a, [{ x: 708, y: 900, vx: 0, vy: 0 }], []);
    expect(a.vx).toBeLessThan(0);
  });

  it("오래 부딪히며 달려도 링크 밖으로 나가지 않는다", () => {
    const m = newMotion(720, 880, 0);
    const others = BUMPER_SEATS.slice(0, 4).map((s) => ({ x: s.x, y: s.y, vx: 0, vy: 0 }));
    let bumps = 0;
    for (let i = 0; i < 2000; i++) {
      const a = (i / 90) * Math.PI;
      stepCar(m, Math.cos(a), Math.sin(a * 0.7), 16);
      if (collideCar(m, others)) bumps++;
      expect(m.x).toBeGreaterThanOrEqual(CAR_BOUNDS.x0);
      expect(m.x).toBeLessThanOrEqual(CAR_BOUNDS.x1);
      expect(m.y).toBeGreaterThanOrEqual(CAR_BOUNDS.y0);
      expect(m.y).toBeLessThanOrEqual(CAR_BOUNDS.y1);
    }
    expect(bumps).toBeGreaterThan(3);
  });
});

describe("범퍼카 방향·고르기·내리기", () => {
  it("차머리 → 4방향, 16방향 그림 갈래", () => {
    expect(headingDir(0)).toBe(DIR.right);
    expect(headingDir(Math.PI / 2)).toBe(DIR.down);
    expect(headingDir(Math.PI)).toBe(DIR.left);
    expect(headingDir(-Math.PI / 2)).toBe(DIR.up);
    for (const d of [DIR.down, DIR.left, DIR.right, DIR.up]) expect(headingDir(dirAngle(d))).toBe(d);
    expect(headingFrame(0, 16)).toBe(0);
    expect(headingFrame(Math.PI / 2, 16)).toBe(4);
    expect(headingFrame(-Math.PI / 8, 16)).toBe(15);
    expect(headingFrame(Math.PI, 16)).toBe(8);
  });

  it("빈 차 중 무작위 (남이 탄 차·돌아오는 중인 차는 빼고), 없으면 null", () => {
    const occ = new Map<string, Sid>([[BUMPER_SEATS[0].id, 7]]);
    const parked = (c: number) => c !== 1;
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add(pickCar(occ, 3, parked, () => (i % 8) / 8)!.car);
    expect(seen.has(0)).toBe(false);
    expect(seen.has(1)).toBe(false);
    expect(seen.size).toBe(6);
    // 내 자리로 되어 있는 차는 고를 수 있다 (재요청)
    expect(pickCar(new Map([[BUMPER_SEATS[2].id, 3]]), 3, () => true, () => 0.3)?.car).toBe(2);
    const full = new Map<string, Sid>(BUMPER_SEATS.map((s, i) => [s.id, 10 + i]));
    expect(pickCar(full, 3, () => true)).toBeNull();
    expect(pickCar(new Map(), 3, () => false)).toBeNull();
  });

  it("테두리 어디든 닿아 있거나 입구 안쪽이면 내린다 (한가운데는 아니다)", () => {
    expect(canExit(BUMPER_EXIT_AT.x, BUMPER_EXIT_AT.y)).toBe(true);
    expect(canExit(BUMPER_SEATS[0].x, BUMPER_SEATS[0].y)).toBe(false); // 왼쪽 끝 차 자리 (벽에서 조금 떨어져 있다)
    expect(canExit(720, CAR_BOUNDS.y1)).toBe(true); // 아래 벽
    expect(canExit(CAR_BOUNDS.x0, 930)).toBe(true); // 왼쪽 벽
    expect(canExit(CAR_BOUNDS.x1 - 3, 930)).toBe(true); // 오른쪽 벽 바로 앞
    expect(canExit(700, 930)).toBe(false);
    expect(canExit(CAR_BOUNDS.x0 + 10, 930)).toBe(false);
  });

  it("벽에 닿았는지: 닿은 변 (모서리면 더 가까운 변), 아니면 null", () => {
    expect(wallSide(CAR_BOUNDS.x0, 930)).toBe("left");
    expect(wallSide(CAR_BOUNDS.x1, 930)).toBe("right");
    expect(wallSide(700, CAR_BOUNDS.y0 + 2)).toBe("top");
    expect(wallSide(700, CAR_BOUNDS.y1)).toBe("bottom");
    expect(wallSide(CAR_BOUNDS.x0 + 1, CAR_BOUNDS.y1)).toBe("bottom");
    expect(wallSide(700, 930)).toBeNull();
    expect(wallSide(CAR_BOUNDS.x0 + 5, 930)).toBeNull();
  });

  it("내려설 자리: 닿은 벽 바로 바깥, 막혀 있으면 가까운 빈 곳, 입구 안쪽은 입구 앞", () => {
    const R = BUMPER_RINK;
    const all = () => true;
    expect(exitSpot(CAR_BOUNDS.x0, 920, all)).toEqual({ x: R.x - EXIT_OUT, y: 920, dir: DIR.left });
    expect(exitSpot(CAR_BOUNDS.x1, 920, all)).toEqual({ x: R.x + R.w + EXIT_OUT, y: 920, dir: DIR.right });
    expect(exitSpot(700, CAR_BOUNDS.y1, all)).toEqual({ x: 700, y: R.y + R.h + EXIT_OUT, dir: DIR.down });
    expect(exitSpot(660, CAR_BOUNDS.y0, all)).toEqual({ x: 660, y: R.y - EXIT_OUT, dir: DIR.up });
    // 입구 안쪽 둘레(벽에 닿지 않음)는 예전처럼 입구 앞
    expect(exitSpot(BUMPER_EXIT_AT.x, BUMPER_EXIT_AT.y + 6, all)).toEqual({ x: BUMPER_DOOR.x, y: BUMPER_DOOR.y, dir: DIR.down });
    // 바로 바깥이 막혔다 → 같은 변에서 가장 가까운 빈 곳
    const leftBlocked = (x: number, y: number) => !(x === R.x - EXIT_OUT && y > 900 && y < 940);
    const s = exitSpot(CAR_BOUNDS.x0, 920, leftBlocked);
    expect(s.x).toBe(R.x - EXIT_OUT);
    expect(Math.abs(s.y - 920)).toBeGreaterThanOrEqual(20);
    expect(Math.abs(s.y - 920)).toBeLessThanOrEqual(24);
    // 왼쪽 변이 통째로 막혔다 → 다른 변 (차에서 가까운 쪽)
    const noLeft = (x: number) => x !== R.x - EXIT_OUT;
    const t = exitSpot(CAR_BOUNDS.x0, CAR_BOUNDS.y1, noLeft);
    expect(t.dir).toBe(DIR.down);
    expect(t.y).toBe(R.y + R.h + EXIT_OUT);
    // 아무 데도 없다 → 입구 앞
    expect(exitSpot(CAR_BOUNDS.x0, 920, () => false)).toEqual({ x: BUMPER_DOOR.x, y: BUMPER_DOOR.y, dir: DIR.down });
  });

  it("닿아 있는지: 테두리·기둥·다른 차 바로 옆만 (한가운데 빈 곳은 아니다)", () => {
    expect(touching(CAR_BOUNDS.x0 + 1, 930, [])).toBe(true);
    expect(touching(BUMPER_POSTS[0].x + BUMPER_POSTS[0].r + CAR_R + 2, BUMPER_POSTS[0].y, [])).toBe(true);
    expect(touching(764, 970, [{ x: 780, y: 970 }])).toBe(true);
    expect(touching(764, 970, [{ x: 824, y: 970 }])).toBe(false);
  });

  it("다른 사람 차의 부딪힘: 속도가 확 꺾이면 알아채고, 부드럽게 도는 건 아니다", () => {
    expect(remoteBumpPower({ vx: 70, vy: 0 }, { vx: -40, vy: 5 })).toBeGreaterThan(BUMP_COUNT_POWER);
    expect(remoteBumpPower({ vx: 70, vy: 0 }, { vx: 66, vy: 18 })).toBe(0);
    expect(remoteBumpPower({ vx: 8, vy: 0 }, { vx: -8, vy: 0 })).toBe(0); // 거의 서 있었다
    expect(remoteBumpPower({ vx: 60, vy: 0 }, { vx: 0, vy: 0 })).toBeGreaterThan(0); // 정면으로 박고 섰다
  });
});

describe("범퍼카장 배치", () => {
  it("링크·장애물·차 자리가 서로 겹치지 않고 링크 안에 있다", () => {
    for (const p of BUMPER_POSTS) {
      expect(p.x - p.r).toBeGreaterThan(RINK_INNER.x + 2 * CAR_R);
      expect(p.x + p.r).toBeLessThan(RINK_INNER.x + RINK_INNER.w - 2 * CAR_R);
      expect(p.y - p.r).toBeGreaterThan(RINK_INNER.y + 2 * CAR_R);
      expect(p.y + p.r).toBeLessThan(RINK_INNER.y + RINK_INNER.h - 2 * CAR_R);
      for (const s of BUMPER_SEATS) expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThan(p.r + CAR_R * 2);
    }
    for (const s of BUMPER_SEATS) {
      expect(s.x).toBeGreaterThanOrEqual(CAR_BOUNDS.x0);
      expect(s.x).toBeLessThanOrEqual(CAR_BOUNDS.x1);
      expect(s.y).toBeGreaterThanOrEqual(CAR_BOUNDS.y0);
    }
    for (let i = 1; i < BUMPER_SEATS.length; i++) expect(BUMPER_SEATS[i].x - BUMPER_SEATS[i - 1].x).toBeGreaterThanOrEqual(2 * CAR_R + 4);
  });

  it("입구 앞은 서 있을 수 있고 차 자리까지 서버 탑승 거리 안, 걸어서는 링크 안에 못 들어간다", () => {
    expect(standable(BUMPER_DOOR.x, BUMPER_DOOR.y)).toBe(true);
    for (const s of BUMPER_SEATS) expect(Math.hypot(s.x - BUMPER_DOOR.x, s.y - BUMPER_DOOR.y)).toBeLessThanOrEqual(SPOT_KINDS.bumper.radius!);
    const cs = staticColliders();
    for (const c of bumperColliders()) expect(cs).toContainEqual(c);
    expect(interactables().some((i) => i.kind === "bumper" && i.ax === BUMPER_DOOR.x && i.ay === BUMPER_DOOR.y)).toBe(true);
    // 링크 안(걷기 격자)은 스폰에서 이어지지 않는다: 테두리·입구 막대가 빙 둘러 막는다
    const g = walkableGrid(8);
    const cell = (x: number, y: number) => g.cells[Math.floor(y / 8) * g.cols + Math.floor(x / 8)];
    for (let x = BUMPER_RINK.x; x < BUMPER_RINK.x + BUMPER_RINK.w; x += 4) expect(cell(x, BUMPER_RINK.y + 2), `top ${x}`).toBe(WALK.blocked);
    for (let y = BUMPER_RINK.y; y < BUMPER_RINK.y + BUMPER_RINK.h; y += 4) {
      expect(cell(BUMPER_RINK.x + 2, y), `left ${y}`).toBe(WALK.blocked);
      expect(cell(BUMPER_RINK.x + BUMPER_RINK.w - 2, y), `right ${y}`).toBe(WALK.blocked);
    }
    expect(BUMPER_GATE.x0).toBeLessThan(BUMPER_DOOR.x);
    expect(BUMPER_GATE.x1).toBeGreaterThan(BUMPER_DOOR.x);
  });

  it("벽 어디서 내려도 링크 바깥 걸을 수 있는 땅에 서고, 입구 앞까지 걸어서 이어진다 (매표소 앞은 옆으로 비킨다)", () => {
    const R = BUMPER_RINK;
    const ok = (x: number, y: number) => standable(x, y) && !inWater(x, y);
    const g = walkableGrid(8);
    // 입구 앞에서 걸어서 닿는 칸 (물은 피한다)
    const seen = new Uint8Array(g.cols * g.rows);
    const start = Math.floor(BUMPER_DOOR.y / 8) * g.cols + Math.floor(BUMPER_DOOR.x / 8);
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const i = q.pop()!;
      const cx = i % g.cols;
      for (const j of [i - 1, i + 1, i - g.cols, i + g.cols]) {
        if (j < 0 || j >= seen.length || seen[j] || g.cells[j] !== WALK.open) continue;
        if ((j === i - 1 && cx === 0) || (j === i + 1 && cx === g.cols - 1)) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    // 걷기 격자는 8px 칸이라 벽·매표소 바로 옆 칸은 막힘으로 굽힌다 → 이웃 칸까지 본다
    const reach = (x: number, y: number) => {
      const c = Math.floor(x / 8);
      const r = Math.floor(y / 8);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (seen[(r + dy) * g.cols + c + dx] === 1) return true;
      return false;
    };
    const cars: [number, number][] = [];
    for (let y = CAR_BOUNDS.y0; y <= CAR_BOUNDS.y1; y += 6) cars.push([CAR_BOUNDS.x0, y], [CAR_BOUNDS.x1, y]);
    for (let x = CAR_BOUNDS.x0; x <= CAR_BOUNDS.x1; x += 6) cars.push([x, CAR_BOUNDS.y0], [x, CAR_BOUNDS.y1]);
    let moved = 0;
    for (const [x, y] of cars) {
      const s = exitSpot(x, y, ok);
      const at = `${x},${y} → ${s.x},${s.y}`;
      expect(ok(s.x, s.y), at).toBe(true);
      expect(reach(s.x, s.y), at).toBe(true);
      const inside = s.x > R.x - 4 && s.x < R.x + R.w + 4 && s.y > R.y && s.y < R.y + R.h + 5;
      expect(inside, at).toBe(false);
      // 바로 바깥(EXIT_OUT + 테두리 + 차 반지름 남짓)이거나, 막혀서 옆으로 조금 비킨 자리
      const d = Math.hypot(s.x - x, s.y - y);
      expect(d, at).toBeLessThan(48);
      const side = wallSide(x, y);
      const straight = side === "left" || side === "right" ? s.y === Math.round(y) : s.x === Math.round(x);
      if (!straight) moved++;
      else expect(d, at).toBeLessThanOrEqual(EXIT_OUT + BUMPER_RIM + CAR_R + 2);
    }
    // 매표소 앞(위 테두리 오른쪽)은 막혀 있어 옆으로 비킨다
    expect(moved).toBeGreaterThan(0);
    const booth = exitSpot(BUMPER_BOOTH.x, CAR_BOUNDS.y0, ok);
    expect(booth.y).toBe(R.y - EXIT_OUT);
    expect(Math.abs(booth.x - BUMPER_BOOTH.x)).toBeGreaterThanOrEqual(14);
  });

  it("11/16 넓어진 링크: 달리는 바닥이 예전(180×136)의 1.8배 넘고, 마당 안·물 밖이며, 귀퉁이와 강둑 사이로 호박밭까지 걸어간다", () => {
    expect(RINK_INNER.w * RINK_INNER.h).toBeGreaterThan(180 * 136 * 1.8);
    expect(RINK_INNER.w).toBeGreaterThanOrEqual(260);
    expect(RINK_INNER.h).toBeGreaterThanOrEqual(160);
    expect(BUMPER_POSTS.length).toBeGreaterThanOrEqual(5);
    const R = BUMPER_RINK;
    expect(R.x).toBeGreaterThanOrEqual(BUMPER_YARD.x);
    expect(R.x + R.w).toBeLessThanOrEqual(BUMPER_YARD.x + BUMPER_YARD.w);
    expect(R.y).toBeGreaterThanOrEqual(BUMPER_YARD.y);
    // 아래 테두리 밖에도 내려설 한 줄이 남는다
    expect(standable(R.x + R.w / 2, R.y + R.h + EXIT_OUT)).toBe(true);
    // 링크 둘레 어디에도 물(연못·강)이 걸치지 않는다
    for (let x = R.x; x <= R.x + R.w; x += 4)
      for (const y of [R.y, R.y + R.h]) expect(inWaterBody(x, y, 2), `${x},${y}`).toBe(false);
    for (let y = R.y; y <= R.y + R.h; y += 4) for (const x of [R.x, R.x + R.w]) expect(inWaterBody(x, y, 2), `${x},${y}`).toBe(false);
    // 입구 앞에서 마당 오른쪽 위 틈(링크 귀퉁이 ↔ 강 남쪽 둑)으로 호박밭 모닥불까지 — 호수 쪽으로 돌아가지 않고 (x < 1010 안에서만)
    const g = walkableGrid(8);
    const seen = new Uint8Array(g.cols * g.rows);
    const start = Math.floor(BUMPER_DOOR.y / 8) * g.cols + Math.floor(BUMPER_DOOR.x / 8);
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const i = q.pop()!;
      const cx = i % g.cols;
      const cy = (i - cx) / g.cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx * 8 > 1010 || ny < 0 || ny >= g.rows) continue;
        const j = ny * g.cols + nx;
        if (seen[j] || g.cells[j] !== WALK.open) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    const fire = CAMPFIRES.find((c) => c.id === "fireS")!;
    const near = (x: number, y: number) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => seen[(Math.floor(y / 8) + dy) * g.cols + Math.floor(x / 8) + dx] === 1));
    expect(near(fire.x - CAMPFIRE_STUMP_DX - 12, fire.y + 3)).toBe(true);
  });

  it("마당 바닥은 예전 다리 건너 묘역과 같은 타일 (돌 포장)", () => {
    expect(inBumperYardTiles(Math.floor(BUMPER_YARD.x / 16), Math.floor(BUMPER_YARD.y / 16))).toBe(true);
    expect(inBumperYardTiles(Math.floor((BUMPER_YARD.x + BUMPER_YARD.w) / 16), 55)).toBe(false);
    expect(bumperGround()).toBe("stone");
  });
});
