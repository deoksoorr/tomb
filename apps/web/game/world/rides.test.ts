import { describe, expect, it } from "vitest";
import { BOAT_SEATS, BOATS, FERRY_DOCK, FURNITURE, LAKE, seatSlot, spotSeatId, SPOT_KINDS } from "@tomb/protocol";
import { boatWater, pickBoatSeat, shorePoint, stepBoat, ROW_SPEED, type BoatPresence } from "../logic/boat";
import { furnitureCollider, houseCollider, inWater, interactables, standable, staticColliders, walkableGrid, WALK, waterCurrent, type Rect } from "./layout";
import {
  CAROUSELS,
  carouselSeats,
  horseAngle,
  rideInteractables,
  rideSpotIds,
  ringPoint,
  seesawEndHeight,
  seesawSeats,
  seesawTilt,
  SEESAWS,
  trampolineHeight,
  TRAMPOLINE_HEIGHT,
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
    expect(Math.hypot(WISH_FOUNTAIN.x - 1024, WISH_FOUNTAIN.y - 304)).toBe(0);
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
    expect(boatWater(1024, 880)).toBe(false); // 가운데 다리 밑으로는 못 지나간다
    expect(boatWater(LAKE.x, LAKE.y)).toBe(true);
    expect(boatWater(1100, 700)).toBe(false); // 뭍
  });

  it("노 젓기: 입력 쪽으로 가속(최고 ROW_SPEED), 물 밖으로는 나가지 않고, 가만히 있으면 물살에 떠내려간다", () => {
    const b = { x: 1338, y: 884 }; // 나루터 앞 강 가운데
    const m = { x: b.x, y: b.y, vx: 0, vy: 0 };
    for (let i = 0; i < 120; i++) stepBoat(m, 1, 0, 16, { vx: 0, vy: 0 });
    expect(m.x).toBeGreaterThan(b.x + 40);
    expect(Math.hypot(m.vx, m.vy)).toBeLessThanOrEqual(ROW_SPEED + 0.01);
    // 북쪽 둑으로 계속 저어도 물 안에 남는다
    for (let i = 0; i < 300; i++) stepBoat(m, 0, -1, 16, { vx: 0, vy: 0 });
    expect(boatWater(m.x, m.y)).toBe(true);
    expect(inWater(m.x, m.y)).toBe(true);
    // 물살
    const d = { x: 1200, y: 884, vx: 0, vy: 0 };
    const cur = waterCurrent(d.x, d.y);
    expect(cur.vx).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) stepBoat(d, 0, 0, 16, waterCurrent(d.x, d.y));
    expect(d.x).toBeGreaterThan(1200);
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
