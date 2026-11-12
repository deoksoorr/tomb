import { describe, expect, it } from "vitest";
import { BOAT_SEATS, BOATS, FERRY_DOCK, FURNITURE, LAKE, seatSlot, spotSeatId, SPOT_KINDS } from "@tomb/protocol";
import { boatWater, joinSeat, JOIN_REACH, pickBoatSeat, shorePoint, stepBoat, ROW_SPEED, type BoatPresence } from "../logic/boat";
import { furnitureCollider, houseCollider, inWater, interactables, standable, staticColliders, walkableGrid, WALK, waterCurrent, type Rect } from "./layout";
import {
  CAROUSEL_RY,
  carouselPoleDepth,
  CAROUSELS,
  carouselSeats,
  horseAngle,
  rideInteractables,
  rideSpotIds,
  ringPoint,
  SEESAW_BLOCK_MS,
  seesawBlock,
  seesawEndHeight,
  seesawMotion,
  seesawSeats,
  seesawSeed,
  seesawTilt,
  SEESAWS,
  TRAMP_OFF_RX,
  trampolineHeight,
  TRAMPOLINE_HEIGHT,
  TRAMPOLINE_PERIOD_MS,
  trampolineLandings,
  trampolineLaunch,
  TRAMPOLINES,
  WISH_FOUNTAIN,
} from "./rides";
import { HOUSE_LOTS } from "@tomb/protocol";

// 50번 조각배·광장 놀거리: 자리·충돌·물 위 이동·연출 수식

const colliders: Rect[] = [...staticColliders(), ...FURNITURE.map(furnitureCollider), ...HOUSE_LOTS.map((l) => houseCollider(l))];
const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

describe("광장 놀거리 자리", () => {
  const rideSeats = [...SEESAWS.flatMap(seesawSeats), ...TRAMPOLINES, ...CAROUSELS.flatMap(carouselSeats)];

  it("앉는 자리(시소 양 끝·트램펄린·목마)는 충돌 밖·물 밖·설 수 있는 곳이고, 걸어서 닿는다", () => {
    const g = walkableGrid(8);
    for (const s of rideSeats) {
      for (const c of colliders) expect(inside(c, s.x, s.y), JSON.stringify([s, c])).toBe(false);
      expect(inWater(s.x, s.y)).toBe(false);
      expect(standable(s.x, s.y), JSON.stringify(s)).toBe(true);
      expect(g.cells[Math.floor(s.y / 8) * g.cols + Math.floor(s.x / 8)], JSON.stringify(s)).toBe(WALK.open);
    }
  });

  it("상호작용: 분수·시소 2·트램펄린·회전목마가 있고, 각 자리는 서버가 아는 1인 자리 id", () => {
    const items = rideInteractables();
    for (const k of ["wish", "seesaw", "trampoline", "carousel"]) expect(items.some((i) => i.kind === k), k).toBe(true);
    expect(items.filter((i) => i.kind === "seesaw").length).toBe(2 * SEESAWS.length);
    for (const i of items) {
      for (const id of rideSpotIds(i)) expect(seatSlot(id)?.kind).toBe(i.kind);
      expect(interactables().some((x) => x.id === i.id)).toBe(true);
    }
    const carousel = items.find((i) => i.kind === "carousel")!;
    expect(rideSpotIds(carousel).length).toBe(4);
    expect(new Set(rideSpotIds(carousel)).size).toBe(4);
    // 회전목마 탑승 자리(입구)에서 서버 판정 거리(40) 안에 모든 목마가 있다
    for (const p of carouselSeats(CAROUSELS[0])) expect(Math.hypot(p.x - carousel.x, p.y - carousel.y)).toBeLessThanOrEqual(40);
    expect(Math.hypot(WISH_FOUNTAIN.x - 720, WISH_FOUNTAIN.y - 300)).toBe(0); // 모닥불 광장 북쪽 입구
  });

  it("회전목마는 벽시계로 돌고(모두에게 같은 각), 각 0에서 목마는 앵커 자리", () => {
    const c = CAROUSELS[0];
    const seats = carouselSeats(c);
    const t0 = 12_000 * 10; // 한 바퀴의 배수
    for (let i = 0; i < seats.length; i++) {
      const p = ringPoint(c, horseAngle(i, t0));
      expect(Math.round(p.x)).toBe(seats[i].x);
      expect(Math.round(p.y)).toBe(seats[i].y);
    }
    expect(horseAngle(0, t0 + 3000)).toBeCloseTo(Math.PI / 2);
  });

  it("시소: 둘이 타면 번갈아, 한 명이면 그쪽이 내려앉는다. 트램펄린은 0~최고 높이", () => {
    expect(seesawTilt(true, false, 0)).toBe(-1);
    expect(seesawTilt(false, true, 0)).toBe(1);
    const a = seesawTilt(true, true, 600);
    const b = seesawTilt(true, true, 1800);
    expect(a).toBeGreaterThan(0.9);
    expect(b).toBeLessThan(-0.9);
    expect(seesawEndHeight(0, 1)).toBeGreaterThan(seesawEndHeight(1, 1));
    let max = 0;
    let min = 0;
    for (let t = 0; t < 1050; t += 5) {
      max = Math.max(max, trampolineHeight(t));
      min = Math.min(min, trampolineHeight(t));
    }
    expect(max).toBeGreaterThan(TRAMPOLINE_HEIGHT * 0.95);
    expect(max).toBeLessThanOrEqual(TRAMPOLINE_HEIGHT);
    expect(min).toBeLessThan(0);
  });
});

describe("조각배", () => {
  it("나루터 배 자리는 물 위(배가 뜰 수 있는 곳)이고, 나루터 앞에서 서버 판정 거리 안", () => {
    for (const b of BOATS) expect(boatWater(b.x, b.y), b.id).toBe(true);
    for (const s of BOAT_SEATS) expect(Math.hypot(s.x - FERRY_DOCK.x, s.y - FERRY_DOCK.y)).toBeLessThanOrEqual(SPOT_KINDS.boat.radius! - 14);
    expect(boatWater(FERRY_DOCK.x, FERRY_DOCK.y)).toBe(false); // 판자 위
    expect(boatWater(720, 706)).toBe(false); // 가운데 다리 밑으로는 못 지나간다
    expect(boatWater(LAKE.x, LAKE.y)).toBe(true);
    expect(boatWater(1100, 700)).toBe(false); // 뭍
  });

  it("노 젓기: 입력 쪽으로 가속(최고 ROW_SPEED), 물 밖으로는 나가지 않고, 가만히 있으면 물살에 떠내려간다", () => {
    const b = { x: 1180, y: 900 }; // 나루터 앞 호수
    const m = { x: b.x, y: b.y, vx: 0, vy: 0 };
    for (let i = 0; i < 120; i++) stepBoat(m, 1, 0, 16, { vx: 0, vy: 0 });
    expect(m.x).toBeGreaterThan(b.x + 40);
    expect(Math.hypot(m.vx, m.vy)).toBeLessThanOrEqual(ROW_SPEED + 0.01);
    // 북쪽 둑으로 계속 저어도 물 안에 남는다
    for (let i = 0; i < 300; i++) stepBoat(m, 0, -1, 16, { vx: 0, vy: 0 });
    expect(boatWater(m.x, m.y)).toBe(true);
    expect(inWater(m.x, m.y)).toBe(true);
    // 물살
    const d = { x: 800, y: 716, vx: 0, vy: 0 }; // 가운데 다리 하류 강 가운데
    const cur = waterCurrent(d.x, d.y);
    expect(cur.vx).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) stepBoat(d, 0, 0, 16, waterCurrent(d.x, d.y));
    expect(d.x).toBeGreaterThan(800);
  });

  it("강을 따라 호수까지 저어 갈 수 있다 (나루터 → 호수)", () => {
    const m = { x: BOATS[0].x, y: BOATS[0].y, vx: 0, vy: 0 };
    // 아주 단순한 키 조작: 동쪽으로, 막히면 남쪽으로
    for (let i = 0; i < 3000 && Math.hypot(m.x - LAKE.x, m.y - LAKE.y) > 60; i++) {
      const px = m.x;
      const py = m.y;
      stepBoat(m, 1, 0.35, 16, waterCurrent(m.x, m.y));
      if (Math.hypot(m.x - px, m.y - py) < 0.05) stepBoat(m, 0.3, 1, 16, waterCurrent(m.x, m.y));
    }
    expect(Math.hypot(m.x - LAKE.x, m.y - LAKE.y)).toBeLessThanOrEqual(60);
  });

  it("내릴 뭍: 둑·나루터 가까이면 설 자리, 호수 한가운데면 없음", () => {
    const p = shorePoint(BOATS[0].x, BOATS[0].y - 4, standable);
    expect(p).not.toBeNull();
    expect(inWater(p!.x, p!.y)).toBe(false);
    expect(standable(p!.x, p!.y)).toBe(true);
    expect(shorePoint(LAKE.x, LAKE.y, standable)).toBeNull();
  });

  it("나루터에서 탈 자리: 기다리는 2인승 뒷자리가 먼저, 아니면 가까운 빈 배, 모두 나가 있으면 없음", () => {
    const docked = (): BoatPresence => ({ docked: true, rower: null, at: null });
    const empty = new Map<string, number>();
    const first = pickBoatSeat(FERRY_DOCK.x, FERRY_DOCK.y, empty, docked);
    expect(first?.index).toBe(0);
    const c = BOATS.find((b) => b.seats === 2)!;
    const front = BOAT_SEATS.find((s) => s.boatId === c.id && s.index === 0)!;
    const back = BOAT_SEATS.find((s) => s.boatId === c.id && s.index === 1)!;
    const waiting = (id: string): BoatPresence => (id === c.id ? { docked: false, rower: 7, at: { x: c.x + 3, y: c.y } } : docked());
    expect(pickBoatSeat(FERRY_DOCK.x, FERRY_DOCK.y, new Map([[front.id, 7]]), waiting)?.id).toBe(back.id);
    // 노 젓는 사람이 멀리 나가 있으면 뒷자리에 못 탄다 → 다른 빈 배
    const away = (id: string): BoatPresence => (id === c.id ? { docked: false, rower: 7, at: { x: c.x + 200, y: c.y } } : docked());
    expect(pickBoatSeat(FERRY_DOCK.x, FERRY_DOCK.y, new Map([[front.id, 7]]), away)?.boatId).not.toBe(c.id);
    const allOut = (): BoatPresence => ({ docked: false, rower: null, at: null });
    expect(pickBoatSeat(FERRY_DOCK.x, FERRY_DOCK.y, empty, allOut)).toBeNull();
    expect(spotSeatId("boat", front.x, front.y)).toBe(front.id);
  });
});

describe("F13 2인승: 물가에서 빈 뒷자리에 같이 타기", () => {
  const c = BOATS.find((b) => b.seats === 2)!;
  const front = BOAT_SEATS.find((s) => s.boatId === c.id && s.index === 0)!;
  const back = BOAT_SEATS.find((s) => s.boatId === c.id && s.index === 1)!;
  const docked = (): BoatPresence => ({ docked: true, rower: null, at: null });
  const at = { x: c.x - 240, y: c.y + 3 };
  const out = (left: boolean) => (id: string): BoatPresence => (id === c.id ? { docked: false, rower: 7, at, left } : docked());

  it("다른 사람이 노 젓는 2인승이 물가 가까이 오면(나루터가 아니어도) 뒷자리, 멀면 없음", () => {
    const occ = new Map([[front.id, 7]]);
    expect(joinSeat(at.x, at.y - 20, occ, out(false))?.id).toBe(back.id);
    // 뒷자리 쪽(뱃머리 반대)에 서 있어도 닿는다
    expect(joinSeat(at.x - 11, at.y - JOIN_REACH + 2, occ, out(false))?.id).toBe(back.id);
    expect(joinSeat(at.x + 11, at.y - JOIN_REACH + 2, occ, out(true))?.id).toBe(back.id);
    expect(joinSeat(at.x, at.y - JOIN_REACH - 14, occ, out(false))).toBeNull();
  });

  it("한 자리 한 명: 뒷자리가 찼거나, 앞자리가 비었거나(옮겨 앉는 중), 노 젓는 사람이 나면(내 배) 같이 타지 않는다", () => {
    expect(joinSeat(at.x, at.y - 10, new Map([[front.id, 7], [back.id, 8]]), out(false))).toBeNull();
    expect(joinSeat(at.x, at.y - 10, new Map([[back.id, 8]]), out(false))).toBeNull();
    const mine = (id: string): BoatPresence => (id === c.id ? { docked: false, rower: null, at, left: false } : docked());
    expect(joinSeat(at.x, at.y - 10, new Map([[front.id, 1]]), mine)).toBeNull();
    // 1인승 곁에서는 같이 탈 자리가 없다
    const one = BOATS.find((b) => b.seats === 1)!;
    const onePres = (id: string): BoatPresence => (id === one.id ? { docked: false, rower: 7, at, left: false } : docked());
    const oneSeat = BOAT_SEATS.find((s) => s.boatId === one.id)!;
    expect(joinSeat(at.x, at.y - 10, new Map([[oneSeat.id, 7]]), onePres)).toBeNull();
  });
});

describe("F5 묶음: 시소 움직임 (불규칙하지만 모두에게 같게)", () => {
  const seed = seesawSeed(SEESAWS[0]);
  const T0 = 1_762_900_000_000; // 서버 시계 근처

  it("같은 시각이면 같은 모습 (결정적), 블록 경계에서도 끊기지 않고(16ms마다 작은 변화) −1..1 안", () => {
    let prev = seesawMotion(seed, true, true, T0).tilt;
    let maxStep = 0;
    for (let t = T0; t < T0 + SEESAW_BLOCK_MS * 4; t += 16) {
      const m = seesawMotion(seed, true, true, t);
      expect(m).toEqual(seesawMotion(seed, true, true, t));
      expect(Math.abs(m.tilt)).toBeLessThanOrEqual(1.0001);
      maxStep = Math.max(maxStep, Math.abs(m.tilt - prev));
      prev = m.tilt;
    }
    expect(maxStep).toBeLessThan(0.12); // 가장 빠른 넘어가기도 한 프레임에 판 끝이 1px 안쪽
  });

  it("블록은 왼쪽이 땅에 닿은 채 시작·끝나고, 박자(착지 간격)와 버티는 시간이 매번 다르다", () => {
    const gaps = new Set<number>();
    for (let b = 0; b < 6; b++) {
      const segs = seesawBlock(seed, 244_000 + b);
      expect(segs[0].from).toBe(0);
      expect(segs[segs.length - 1].to).toBe(0);
      const last = segs[segs.length - 1];
      expect(last.t0 + last.hold + last.travel).toBeCloseTo(SEESAW_BLOCK_MS, 6);
      for (const g of segs) gaps.add(Math.round(g.hold + g.travel));
    }
    expect(gaps.size).toBeGreaterThan(10);
    // 다른 시소는 다른 박자
    expect(seesawBlock(seed + 1, 244_000)).not.toEqual(seesawBlock(seed, 244_000));
  });

  it("착지 번호는 착지마다 한 번씩 바뀌고, 땅을 차는 쪽(push)·위에서 튀는 높이(pop)가 나온다", () => {
    const ids: number[] = [];
    let pushes = 0;
    let maxPop = 0;
    for (let t = T0; t < T0 + SEESAW_BLOCK_MS * 2; t += 10) {
      const m = seesawMotion(seed, true, true, t);
      if (ids[ids.length - 1] !== m.landId) ids.push(m.landId);
      if (m.push !== null) {
        pushes++;
        expect(Math.abs(m.tilt)).toBe(1); // 땅에 닿은 쪽이 찬다
        expect(m.tilt).toBe(m.push === 0 ? -1 : 1);
      }
      maxPop = Math.max(maxPop, m.pop[0], m.pop[1]);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(pushes).toBeGreaterThan(0);
    expect(maxPop).toBeGreaterThan(0.5);
    expect(maxPop).toBeLessThanOrEqual(2.3);
  });

  it("한 명이면 그쪽 끝이 땅에 앉아 살짝 들썩, 아무도 없으면 왼쪽이 내려앉아 있다", () => {
    for (let t = T0; t < T0 + 3000; t += 50) {
      const l = seesawMotion(seed, true, false, t);
      expect(l.tilt).toBeLessThanOrEqual(-0.85);
      const r = seesawMotion(seed, false, true, t);
      expect(r.tilt).toBeGreaterThanOrEqual(0.85);
    }
    expect(seesawMotion(seed, false, false, T0).tilt).toBe(-1);
    expect(seesawEndHeight(0, -1)).toBeLessThan(seesawEndHeight(1, -1));
  });
});

describe("F14 트램펄린에서 내리기", () => {
  it("뛰어내리는 순간은 매트를 밟고 차오를 때뿐 (높이가 매트 근처)", () => {
    let n = 0;
    for (let t = 0; t < TRAMPOLINE_PERIOD_MS * 3; t += 5) {
      if (!trampolineLaunch(t)) continue;
      n++;
      expect(Math.abs(trampolineHeight(t))).toBeLessThanOrEqual(2.01);
    }
    expect(n).toBeGreaterThan(10);
  });

  it("내릴 자리: 누른 방향이 먼저, 트램펄린 매트 밖 (옆 땅)이고 실제 맵에서 설 수 있는 곳이 있다", () => {
    for (const t of TRAMPOLINES) {
      const right = trampolineLandings(t, 1, 0);
      expect(right[0]).toEqual({ x: t.x + TRAMP_OFF_RX, y: t.y - 4 });
      const down = trampolineLandings(t, 0, 0)[0];
      expect(down.y).toBeGreaterThan(t.y + 4);
      expect(trampolineLandings(t, 0, 0).some((p) => standable(p.x, p.y) && !inWater(p.x, p.y))).toBe(true);
      for (const p of trampolineLandings(t, -0.7, 0.7)) expect(Math.hypot((p.x - t.x) / 19, (p.y - (t.y - 4)) / 6.5)).toBeGreaterThan(1);
    }
  });
});

describe("F15 회전목마 그리는 순서", () => {
  it("가운데 기둥은 앞쪽(아래)으로 돈 목마보다 뒤, 뒤쪽 목마보다 앞", () => {
    for (const c of CAROUSELS) {
      const pole = carouselPoleDepth(c);
      const frontHorse = ringPoint(c, 0);
      const backHorse = ringPoint(c, Math.PI);
      expect(frontHorse.y).toBeCloseTo(c.y + CAROUSEL_RY);
      expect(frontHorse.y).toBeGreaterThan(pole);
      expect(backHorse.y).toBeLessThan(pole);
    }
  });
});
