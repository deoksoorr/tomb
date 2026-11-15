import { describe, expect, it } from "vitest";
import { BUMPER_GATE, BUMPER_RINK, BUMPER_SEATS, BUMPER_YARD, DIR, SPOT_KINDS, type Sid } from "@tomb/protocol";
import { BUMPER_DOOR, BUMPER_EXIT_AT, BUMPER_POSTS, bumperColliders, bumperGround, inBumperYardTiles, RINK_INNER } from "../bumper/bumperLayout";
import { interactables, standable, staticColliders, walkableGrid, WALK } from "../world/layout";
import {
  BUMP_BIG_POWER,
  BUMP_COUNT_POWER,
  CAR_BOUNDS,
  CAR_MAX_SPEED,
  CAR_R,
  canExit,
  collideCar,
  dirAngle,
  headingDir,
  headingFrame,
  newMotion,
  pickCar,
  remoteBumpPower,
  stepCar,
  touching,
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

  it("입구 안쪽에서만 내린다", () => {
    expect(canExit(BUMPER_EXIT_AT.x, BUMPER_EXIT_AT.y)).toBe(true);
    expect(canExit(BUMPER_SEATS[0].x, BUMPER_SEATS[0].y)).toBe(false); // 왼쪽 끝 차 자리
    expect(canExit(720, CAR_BOUNDS.y1)).toBe(false);
  });

  it("닿아 있는지: 테두리·기둥·다른 차 바로 옆만 (한가운데 빈 곳은 아니다)", () => {
    expect(touching(CAR_BOUNDS.x0 + 1, 930, [])).toBe(true);
    expect(touching(BUMPER_POSTS[0].x + BUMPER_POSTS[0].r + CAR_R + 2, BUMPER_POSTS[0].y, [])).toBe(true);
    expect(touching(700, 960, [{ x: 716, y: 960 }])).toBe(true);
    expect(touching(700, 960, [{ x: 760, y: 960 }])).toBe(false);
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

  it("마당 바닥은 예전 다리 건너 묘역과 같은 타일 (돌 포장)", () => {
    expect(inBumperYardTiles(Math.floor(BUMPER_YARD.x / 16), Math.floor(BUMPER_YARD.y / 16))).toBe(true);
    expect(inBumperYardTiles(Math.floor((BUMPER_YARD.x + BUMPER_YARD.w) / 16), 55)).toBe(false);
    expect(bumperGround()).toBe("stone");
  });
});
