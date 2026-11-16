import { describe, expect, it } from "vitest";
import { BOAT_SEATS, BOATS, boatKind, DIR, DUCK_DOCK, DUCK_POND, DUCK_SIDE_SEAT, FERRY_DOCK, FISHING_SPOTS, FURNITURE, LAKE, PONDS, seatSlot, spotSeatId, SPOT_KINDS, type DirId } from "@tomb/protocol";
import { BOAT_BACK_SEAT_Y } from "../sprites/rideProps";
import { boatFacing, boatWater, DUCK_SPEED, duckBump, duckWater, FACING_MIN_SPEED, joinSeat, JOIN_REACH, pickBoatSeat, seatDelta, shorePoint, stepBoat, ROW_SPEED, type BoatPresence } from "../logic/boat";
import { furnitureCollider, houseCollider, inWater, interactables, standable, staticColliders, walkableGrid, WALK, waterCurrent, type Rect } from "./layout";
import {
  bystanderGain,
  CAROUSEL_ROOF_DROP,
  CAROUSEL_RY,
  carouselOrganLevel,
  horseDepths,
  horseFacesLeft,
  horsePoleSpan,
  carouselPoleDepth,
  CAROUSELS,
  carouselSeats,
  horseAngle,
  RIDE_HEAR_FAR,
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
import { CAMPFIRES, HOUSE_LOTS, TILE } from "@tomb/protocol";

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
    for (const b of BOATS) expect(boatKind(b) === "duck" ? duckWater(b.x, b.y) : boatWater(b.x, b.y), b.id).toBe(true);
    const rowSeats = BOAT_SEATS.filter((s) => boatKind(BOATS.find((b) => b.id === s.boatId)!) === "row");
    expect(rowSeats.length).toBe(4);
    for (const s of rowSeats) expect(Math.hypot(s.x - FERRY_DOCK.x, s.y - FERRY_DOCK.y)).toBeLessThanOrEqual(SPOT_KINDS.boat.radius! - 14);
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

describe("11/15 오리배 (오리 연못)", () => {
  const ducks = BOATS.filter((b) => boatKind(b) === "duck");
  const docked = (): BoatPresence => ({ docked: true, rower: null, at: null });
  const empty = new Map<string, number>();

  it("오리배 3척 · 모두 2인승, 오리 연못 선착장 앞(서버 판정 거리 안)에 매여 있고 연못 안에 떠 있다", () => {
    expect(ducks.length).toBe(3);
    expect(PONDS.find((p) => p.id === "pondS")?.name).toBe("오리 연못");
    for (const b of ducks) {
      expect(b.seats).toBe(2);
      expect(duckWater(b.x, b.y), b.id).toBe(true);
      for (const s of BOAT_SEATS.filter((x) => x.boatId === b.id)) {
        expect(Math.hypot(s.x - DUCK_DOCK.x, s.y - DUCK_DOCK.y)).toBeLessThanOrEqual(SPOT_KINDS.boat.radius! - 14);
        expect(seatSlot(s.id)).toMatchObject({ kind: "boat", mobile: true, furnitureId: b.id });
        expect(spotSeatId("boat", s.x, s.y)).toBe(s.id);
      }
    }
    expect(new Set(BOAT_SEATS.map((s) => s.id)).size).toBe(BOAT_SEATS.length);
  });

  it("두 자리는 나란히: 옆자리는 뱃머리 방향과 상관없이 왼쪽 자리(조종)에서 화면 오른쪽으로 DUCK_SIDE_SEAT", () => {
    for (const b of ducks) {
      const [a, c] = BOAT_SEATS.filter((x) => x.boatId === b.id);
      expect(a.index).toBe(0);
      expect(c.index).toBe(1);
      expect(c.x - a.x).toBe(DUCK_SIDE_SEAT);
      expect(c.y).toBe(a.y);
    }
    const d = ducks[0];
    // 오리배 옆자리는 어느 방향(앞·뒷모습 포함)이든 화면 오른쪽으로 나란히
    for (const dir of [DIR.down, DIR.left, DIR.right, DIR.up]) expect(seatDelta(d, dir)).toEqual({ dx: DUCK_SIDE_SEAT, dy: 0 });
    // 조각배 뒷자리는 그대로 뱃머리 반대쪽 (11/16 앞모습 = 위, 뒷모습 = 아래)
    const row = BOATS.find((b) => b.seats === 2 && boatKind(b) === "row")!;
    expect(seatDelta(row, DIR.right).dx).toBeLessThan(0);
    expect(seatDelta(row, DIR.left).dx).toBeGreaterThan(0);
    expect(seatDelta(row, DIR.down)).toEqual({ dx: 0, dy: -BOAT_BACK_SEAT_Y });
    expect(seatDelta(row, DIR.up)).toEqual({ dx: 0, dy: BOAT_BACK_SEAT_Y });
    expect(ducks.some((b) => b.facing === DIR.left) && ducks.some((b) => b.facing === DIR.right)).toBe(true);
  });

  it("선착장마다 그 종류의 배만: 오리배 선착장 = 오리배 왼쪽 자리, 나루터 = 조각배", () => {
    const d = pickBoatSeat(DUCK_DOCK.x, DUCK_DOCK.y, empty, docked, "duck");
    expect(d && boatKind(BOATS.find((b) => b.id === d.boatId)!)).toBe("duck");
    expect(d?.index).toBe(0);
    const r = pickBoatSeat(FERRY_DOCK.x, FERRY_DOCK.y, empty, docked);
    expect(r && boatKind(BOATS.find((b) => b.id === r.boatId)!)).toBe("row");
    // 오리배가 모두 나가 있으면 (조각배가 남아 있어도) 없음
    const ducksOut = (id: string): BoatPresence => (id.startsWith("duck") ? { docked: false, rower: null, at: null } : docked());
    expect(pickBoatSeat(DUCK_DOCK.x, DUCK_DOCK.y, empty, ducksOut, "duck")).toBeNull();
  });

  it("오리 연못 안에서만: 호수·강·다른 연못·뭍·선착장 판자에는 못 가고, 오래 페달을 밟아도 연못 밖으로 나가지 않는다", () => {
    expect(duckWater(DUCK_POND.x, DUCK_POND.y)).toBe(true);
    expect(duckWater(LAKE.x, LAKE.y)).toBe(false);
    expect(duckWater(800, 716)).toBe(false); // 강
    for (const p of PONDS) if (p.id !== "pondS") expect(duckWater(p.x, p.y)).toBe(false);
    expect(duckWater(DUCK_DOCK.x - DUCK_SIDE_SEAT / 2, DUCK_DOCK.y)).toBe(false); // 판자 옆
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]]) {
      const m = { x: DUCK_POND.x - DUCK_SIDE_SEAT / 2, y: DUCK_POND.y, vx: 0, vy: 0 };
      for (let i = 0; i < 600; i++) {
        stepBoat(m, ax, ay, 16, { vx: 30, vy: 0 }, "duck");
        expect(duckWater(m.x, m.y)).toBe(true);
        expect(inWater(m.x + DUCK_SIDE_SEAT / 2, m.y)).toBe(true);
      }
    }
  });

  it("조각배보다 느리고 둥실: 최고 DUCK_SPEED, 가속·감속이 느리고 물살이 없다", () => {
    const m = { x: 480, y: 900, vx: 0, vy: 0 };
    const r = { x: 1180, y: 900, vx: 0, vy: 0 };
    for (let i = 0; i < 20; i++) {
      stepBoat(m, 1, 0, 16, { vx: 0, vy: 0 }, "duck");
      stepBoat(r, 1, 0, 16, { vx: 0, vy: 0 });
    }
    expect(m.vx).toBeLessThan(r.vx);
    expect(DUCK_SPEED).toBeLessThan(ROW_SPEED);
    // 손을 떼면 조금 더 미끄러진다
    const glide = { ...m };
    stepBoat(glide, 0, 0, 200, { vx: 0, vy: 0 }, "duck");
    expect(glide.vx).toBeGreaterThan(m.vx * 0.6);
    // 물살을 넘겨도 무시한다
    const still = { x: 480, y: 900, vx: 0, vy: 0 };
    for (let i = 0; i < 30; i++) stepBoat(still, 0, 0, 16, { vx: 20, vy: 10 }, "duck");
    expect(still.x).toBe(480);
    expect(still.y).toBe(900);
  });

  it("범퍼카: 닿은 두 오리배는 서로 반대쪽으로 튕기고 (각자 계산해도 대칭), 떨어져 있으면 그대로", () => {
    const a = { x: 480, y: 900, vx: 20, vy: 0 };
    const b = { x: 510, y: 902, vx: -20, vy: 0 };
    const pa = { x: a.x, y: a.y };
    const pb = { x: b.x, y: b.y };
    expect(duckBump(a, [pb])).toBe(true);
    expect(duckBump(b, [pa])).toBe(true);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    expect(a.vx).toBeCloseTo(-b.vx, 5);
    // 가만히 있다가 받혀도 밀려난다
    const c = { x: 480, y: 900, vx: 0, vy: 0 };
    expect(duckBump(c, [{ x: 470, y: 900 }])).toBe(true);
    expect(c.vx).toBeGreaterThan(0);
    // 멀면 아무 일 없다
    const d = { x: 480, y: 900, vx: 5, vy: 3 };
    expect(duckBump(d, [{ x: 560, y: 900 }, { x: 480, y: 940 }])).toBe(false);
    expect(d).toEqual({ x: 480, y: 900, vx: 5, vy: 3 });
    // 매여 있는 오리배끼리는 닿아 있지 않다
    const ducks2 = BOATS.filter((x) => boatKind(x) === "duck");
    for (const x of ducks2) expect(duckBump({ x: x.x, y: x.y, vx: 0, vy: 0 }, ducks2.filter((o) => o !== x))).toBe(false);
  });

  it("물가에서 옆자리에 같이 타기 (F13 규칙 그대로) · 오리 연못에는 낚시 자리가 없다", () => {
    const d = ducks[1];
    const [front, side] = BOAT_SEATS.filter((x) => x.boatId === d.id);
    const at = { x: 470, y: 930 };
    const pres = (id: string): BoatPresence => (id === d.id ? { docked: false, rower: 7, at, dir: DIR.left } : docked());
    // 옆자리(오른쪽) 곁에 서 있어도 닿는다
    expect(joinSeat(at.x + DUCK_SIDE_SEAT + 4, at.y + JOIN_REACH - 4, new Map([[front.id, 7]]), pres)?.id).toBe(side.id);
    expect(joinSeat(at.x, at.y + 10, new Map([[front.id, 7], [side.id, 8]]), pres)).toBeNull();
    for (const f of FISHING_SPOTS) {
      const dx = (f.x - DUCK_POND.x) / (DUCK_POND.rx + 40);
      const dy = (f.y - DUCK_POND.y) / (DUCK_POND.ry + 40);
      expect(dx * dx + dy * dy, f.id).toBeGreaterThan(1);
    }
    // 연못 둑 가까이면 내릴 뭍이 있다
    expect(shorePoint(DUCK_POND.x, DUCK_POND.y + DUCK_POND.ry - 14, standable)).not.toBeNull();
    expect(shorePoint(DUCK_POND.x, DUCK_POND.y, standable)).toBeNull();
  });
});

describe("F13 2인승: 물가에서 빈 뒷자리에 같이 타기", () => {
  const c = BOATS.find((b) => b.seats === 2)!;
  const front = BOAT_SEATS.find((s) => s.boatId === c.id && s.index === 0)!;
  const back = BOAT_SEATS.find((s) => s.boatId === c.id && s.index === 1)!;
  const docked = (): BoatPresence => ({ docked: true, rower: null, at: null });
  const at = { x: c.x - 240, y: c.y + 3 };
  const out = (left: boolean, dir: DirId = left ? DIR.left : DIR.right) => (id: string): BoatPresence => (id === c.id ? { docked: false, rower: 7, at, dir } : docked());

  it("다른 사람이 노 젓는 2인승이 물가 가까이 오면(나루터가 아니어도) 뒷자리, 멀면 없음", () => {
    const occ = new Map([[front.id, 7]]);
    expect(joinSeat(at.x, at.y - 20, occ, out(false))?.id).toBe(back.id);
    // 뒷자리 쪽(뱃머리 반대)에 서 있어도 닿는다
    expect(joinSeat(at.x - 11, at.y - JOIN_REACH + 2, occ, out(false))?.id).toBe(back.id);
    expect(joinSeat(at.x + 11, at.y - JOIN_REACH + 2, occ, out(true))?.id).toBe(back.id);
    expect(joinSeat(at.x, at.y - JOIN_REACH - 14, occ, out(false))).toBeNull();
    // 11/16 앞모습(뱃머리 아래)이면 뒷자리는 위로 BOAT_BACK_SEAT_Y — 그 위쪽에 서 있어도 닿는다
    const upper = { x: at.x, y: at.y - BOAT_BACK_SEAT_Y - JOIN_REACH + 2 };
    expect(joinSeat(upper.x, upper.y, occ, out(false, DIR.down))?.id).toBe(back.id);
    expect(joinSeat(upper.x, upper.y, occ, out(false, DIR.up))).toBeNull();
  });

  it("한 자리 한 명: 뒷자리가 찼거나, 앞자리가 비었거나(옮겨 앉는 중), 노 젓는 사람이 나면(내 배) 같이 타지 않는다", () => {
    expect(joinSeat(at.x, at.y - 10, new Map([[front.id, 7], [back.id, 8]]), out(false))).toBeNull();
    expect(joinSeat(at.x, at.y - 10, new Map([[back.id, 8]]), out(false))).toBeNull();
    const mine = (id: string): BoatPresence => (id === c.id ? { docked: false, rower: null, at, dir: DIR.right } : docked());
    expect(joinSeat(at.x, at.y - 10, new Map([[front.id, 1]]), mine)).toBeNull();
    // 1인승 곁에서는 같이 탈 자리가 없다
    const one = BOATS.find((b) => b.seats === 1)!;
    const onePres = (id: string): BoatPresence => (id === one.id ? { docked: false, rower: 7, at, dir: DIR.right } : docked());
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

describe("회전목마 옆모습·목마 기둥", () => {
  it("앞쪽 반원은 오른쪽, 뒤쪽 반원은 왼쪽을 본다 (가는 방향 = x가 커지는 쪽)", () => {
    const c = CAROUSELS[0];
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2 + 0.01;
      const dx = ringPoint(c, a + 0.001).x - ringPoint(c, a).x;
      expect(horseFacesLeft(a)).toBe(dx < 0);
    }
    expect(horseFacesLeft(0)).toBe(false);
    expect(horseFacesLeft(Math.PI)).toBe(true);
  });
  it("목마 기둥은 늘 지붕에서 그 자리 바닥까지 (목마가 오르내려도 같다)", () => {
    const c = CAROUSELS[0];
    for (let k = 0; k < 16; k++) {
      const p = ringPoint(c, (k / 16) * Math.PI * 2);
      const s = horsePoleSpan(c, p);
      expect(s.top).toBe(c.y - CAROUSEL_ROOF_DROP);
      expect(s.bottom).toBeGreaterThan(s.top + 20);
      expect(s.bottom).toBeLessThanOrEqual(Math.round(p.y));
    }
  });
  it("그리는 순서: 기둥 < 목마 < 탄 사람, 앞쪽 반원은 셋 다 가운데 기둥 앞, 뒤쪽은 뒤", () => {
    const c = CAROUSELS[0];
    for (const a of [0, Math.PI]) {
      const p = ringPoint(c, a);
      const d = horseDepths(p.y);
      expect(d.pole).toBeLessThan(d.horse);
      expect(d.horse).toBeLessThan(d.rider);
      const front = a === 0;
      for (const v of [d.pole, d.horse, d.rider]) expect(v > carouselPoleDepth(c)).toBe(front);
    }
  });
});

describe("놀거리 소리 범위", () => {
  it("회전목마 오르골은 목마에 탄 사람에게만 들린다", () => {
    expect(carouselOrganLevel(true)).toBeGreaterThan(0);
    expect(carouselOrganLevel(false)).toBe(0);
  });

  it("구경꾼에게는 바로 옆(2.5칸 안)에서만 작게, 그 밖은 0", () => {
    expect(RIDE_HEAR_FAR).toBeLessThanOrEqual(TILE * 2.5);
    expect(bystanderGain(0)).toBeGreaterThan(0);
    expect(bystanderGain(0)).toBeLessThanOrEqual(0.5);
    expect(bystanderGain(TILE * 2)).toBeLessThan(bystanderGain(TILE));
    expect(bystanderGain(RIDE_HEAR_FAR)).toBe(0);
    expect(bystanderGain(TILE * 5)).toBe(0);
    expect(bystanderGain(Number.NaN)).toBe(0);
  });

  it("어느 모닥불에 앉아 있어도 놀거리 효과음이 들리지 않는다", () => {
    const sources = [...CAROUSELS, ...SEESAWS, ...TRAMPOLINES];
    for (const f of CAMPFIRES) for (const r of sources) expect(bystanderGain(Math.hypot(f.x - r.x, f.y - r.y)), `${f.id}`).toBe(0);
  });
});

describe("11/16 배 앞·뒷모습: 보는 방향 고르기 (boatFacing)", () => {
  const S = 30;
  it("큰 축을 따른다: 위아래로 저으면 앞·뒷모습, 좌우면 옆모습", () => {
    expect(boatFacing(DIR.right, 0, -S)).toBe(DIR.up);
    expect(boatFacing(DIR.right, 0, S)).toBe(DIR.down);
    expect(boatFacing(DIR.up, -S, 0)).toBe(DIR.left);
    expect(boatFacing(DIR.down, S, 0)).toBe(DIR.right);
  });

  it("느리면(멈춰 가는 배) 그대로", () => {
    for (const d of [DIR.down, DIR.left, DIR.right, DIR.up]) {
      expect(boatFacing(d, 0, 0)).toBe(d);
      expect(boatFacing(d, FACING_MIN_SPEED - 0.5, -(FACING_MIN_SPEED - 0.5))).toBe(d);
    }
  });

  it("대각선에서는 지금 축을 지킨다 (히스테리시스) — 축은 다른 축이 넉넉히 클 때만 바뀐다", () => {
    // 정대각선: 옆이면 옆, 앞뒤면 앞뒤 (같은 축 안에서는 방향만 따라간다)
    expect(boatFacing(DIR.right, S, -S)).toBe(DIR.right);
    expect(boatFacing(DIR.left, S, -S)).toBe(DIR.right);
    expect(boatFacing(DIR.up, S, -S)).toBe(DIR.up);
    expect(boatFacing(DIR.down, S, -S)).toBe(DIR.up);
    // 조금 더 세로여도(1.2배) 옆모습 유지, 한참 세로면(2배) 바뀐다
    expect(boatFacing(DIR.right, S, -S * 1.2)).toBe(DIR.right);
    expect(boatFacing(DIR.right, S, -S * 2)).toBe(DIR.up);
    expect(boatFacing(DIR.up, S * 1.2, -S)).toBe(DIR.up);
    expect(boatFacing(DIR.up, S * 2, -S)).toBe(DIR.right);
  });

  it("대각선 근처에서 흔들려도 깜빡이지 않는다 (프레임마다 방향이 한 번도 바뀌지 않음)", () => {
    let d: DirId = DIR.right;
    let flips = 0;
    for (let i = 0; i < 200; i++) {
      const a = -Math.PI / 4 + Math.sin(i * 0.7) * 0.12; // 오른쪽 위 대각선 ± 7°
      const n = boatFacing(d, Math.cos(a) * S, Math.sin(a) * S);
      if (n !== d) flips++;
      d = n;
    }
    expect(flips).toBe(0);
    expect(d).toBe(DIR.right);
  });
});
