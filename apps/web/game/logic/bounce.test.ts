import { describe, expect, it } from "vitest";
import { BOATS, boatKind, DIR, SEA_JETSKIS, SEA_KAYAK_DOCK, SEA_KAYAKS, SEA_PONTOON, onSeaDeck, seaJetWater, seaKayakWater } from "@tomb/protocol";
import { boatHull } from "./boat";
import {
  Bounce,
  BOUNCE_CONTROL,
  BOUNCE_DAMP_MS,
  BOUNCE_GAIN,
  bounceSpeed,
  hullContact,
  knockMove,
  NUDGE_MS,
  nudgeOffset,
  resolveHulls,
  touchContact,
  type Box,
} from "./bounce";
import { kayakBox, rideBox } from "../sea/seaRideLogic";

// 11/16 r19 배·놀거리에 부딪히면 튕겨 나가기 (방향·세기·조종 무뎌짐·데크로 밀지 않기)

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("hullContact — 밀어낼 방향", () => {
  it("덜 겹친 축으로, 나를 상대 바깥쪽으로 밀어요", () => {
    const o = { x: 100, y: 100, w: 30, h: 8 };
    // 왼쪽에서 들이받음 (x로 2px 겹침) → 왼쪽으로
    expect(hullContact({ x: 72, y: 100, w: 30, h: 8 }, o)).toEqual({ nx: -1, ny: 0, depth: 2 });
    // 아래에서 (y로 1px 겹침) → 아래로
    expect(hullContact({ x: 110, y: 107, w: 10, h: 10 }, o)).toEqual({ nx: 0, ny: 1, depth: 1 });
    expect(hullContact({ x: 0, y: 0, w: 10, h: 10 }, o)).toBeNull();
  });
  it("물리 충돌이 떼어 놓은 맞닿음도 잡아요 (헤엄)", () => {
    const c = touchContact({ x: 90, y: 100, w: 10, h: 6 }, { x: 100, y: 98, w: 14, h: 10 });
    expect(c).toMatchObject({ nx: -1, ny: 0 });
  });
});

describe("bounceSpeed · Bounce — 세기와 조종", () => {
  it("들이받은 속도에 비례하고, 제트스키 > 카약 > 튜브·헤엄 (위로는 상한)", () => {
    const n = { nx: -1, ny: 0 };
    const jet = bounceSpeed("jetski", 100, 0, n);
    const kayak = bounceSpeed("kayak", 36, 0, n);
    const tube = bounceSpeed("tube", 22, 0, n);
    const swim = bounceSpeed("swim", 40, 0, n);
    expect(jet).toBeGreaterThan(kayak);
    expect(kayak).toBeGreaterThan(tube);
    expect(swim).toBeLessThan(kayak);
    expect(bounceSpeed("jetski", 400, 0, n)).toBe(BOUNCE_GAIN.jetski.max);
    // 멀어지는 중이면 base만
    expect(bounceSpeed("kayak", -30, 0, n)).toBe(BOUNCE_GAIN.kayak.base);
  });
  it("튕기는 방향은 법선 쪽, 0.3초 동안 조종이 무뎌지고, 곧 멈춰요. 같은 부딪힘을 바로 또 세지 않아요", () => {
    const b = new Bounce();
    const sp = b.hit(1000, { nx: 0, ny: 1 }, "jetski", 0, -90);
    expect(sp).toBeGreaterThan(0);
    expect(b.vx).toBe(0);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.control(1000 + BOUNCE_DAMP_MS - 1)).toBe(BOUNCE_CONTROL);
    expect(b.control(1000 + BOUNCE_DAMP_MS)).toBe(1);
    expect(b.hit(1100, { nx: 0, ny: 1 }, "jetski", 0, -90)).toBe(0);
    let total = 0;
    for (let i = 0; i < 60; i++) total += b.take(16).dy;
    expect(b.active).toBe(false);
    // 짧게 밀려나요 (딱 멈춤도, 멀리 날아감도 아님)
    expect(total).toBeGreaterThan(4);
    expect(total).toBeLessThan(24);
  });
  it("거의 서서 닿으면 튕기지 않아요 (매어 둔 옆 카약에 스치기)", () => {
    expect(new Bounce().hit(0, { nx: 1, ny: 0 }, "kayak", -5, 0)).toBe(0);
  });
});

describe("데크·난간으로는 밀지 않아요", () => {
  it("제트스키가 부잔교 쪽으로 튕겨도 데크에 들어가지 않고 그 축은 멈춰요", () => {
    const p = { x: SEA_PONTOON.x + SEA_PONTOON.w + 16, y: SEA_PONTOON.y + 100 };
    expect(seaJetWater(p.x, p.y)).toBe(true);
    const b = new Bounce();
    b.hit(0, { nx: -1, ny: 0 }, "jetski", 120, 0);
    for (let i = 0; i < 30; i++) {
      knockMove(p, b.take(16), seaJetWater, b);
      expect(onSeaDeck(p.x, p.y)).toBe(false);
    }
    expect(seaJetWater(p.x, p.y)).toBe(true);
    expect(b.vx).toBe(0);
  });
  it("카약 선착장 아래에서 위로 밀려도 데크로 올라가지 않아요 (겹친 것을 떼어 낼 때도)", () => {
    const level = 1;
    const m = { x: SEA_KAYAK_DOCK.x + 40, y: SEA_KAYAK_DOCK.y + SEA_KAYAK_DOCK.h + 8, vx: 0, vy: 30 };
    const ok = (x: number, y: number) => seaKayakWater(x, y, level);
    expect(ok(m.x, m.y)).toBe(true);
    // 아래에서 다른 카약이 받쳐 올라옴 → 위로 밀어야 하지만 데크라 그대로
    const other = kayakBox(DIR.right, m.x, m.y + 6);
    const hit = resolveHulls(m, (x, y) => kayakBox(DIR.right, x, y), [other], ok);
    expect(hit?.contact).toMatchObject({ nx: 0, ny: -1 });
    expect(ok(m.x, m.y)).toBe(true);
    expect(onSeaDeck(m.x, m.y)).toBe(false);
    // 들이받던 속도는 버려요 (다음 프레임에 또 파고들지 않게)
    expect(m.vy).toBe(0);
  });
  it("물 한가운데에서는 겹친 만큼 떼어 놓아요 (뚫고 지나가지 않아요)", () => {
    const ok = () => true;
    const m = { x: 500, y: 800, vx: 40, vy: 0 };
    const other = rideBox("jetski", DIR.right, 525, 800);
    const hit = resolveHulls(m, (x, y) => rideBox("jetski", DIR.right, x, y), [other], ok);
    expect(hit?.contact.nx).toBe(-1);
    expect(hit?.vx).toBe(40);
    expect(overlap(rideBox("jetski", DIR.right, m.x, m.y), other)).toBe(false);
    expect(m.vx).toBe(0);
  });
});

describe("매어 둔 것끼리는 닿지 않아요 (타자마자 덜컥이지 않게)", () => {
  it("카약 셋 · 제트스키 둘", () => {
    const ks = SEA_KAYAKS.map((k) => kayakBox(DIR.right, k.x, k.y));
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) expect(overlap(ks[i], ks[j]), `kayak ${i}-${j}`).toBe(false);
    const js = SEA_JETSKIS.map((j) => rideBox("jetski", DIR.right, j.x, j.y));
    expect(overlap(js[0], js[1])).toBe(false);
  });
  it("마을 조각배·오리배 (같은 물에 매인 것끼리)", () => {
    for (let i = 0; i < BOATS.length; i++)
      for (let j = i + 1; j < BOATS.length; j++) {
        const a = BOATS[i];
        const b = BOATS[j];
        if (boatKind(a) !== boatKind(b)) continue;
        expect(overlap(boatHull(a, a.facing, a.x, a.y), boatHull(b, b.facing, b.x, b.y)), `${a.id}-${b.id}`).toBe(false);
      }
  });
});

describe("nudgeOffset — 받힌 빈 놀거리", () => {
  it("0에서 시작해 잠깐 밀렸다가 0으로 돌아와요", () => {
    expect(nudgeOffset(4, 0)).toBe(0);
    expect(nudgeOffset(4, 90)).toBeCloseTo(4, 5);
    expect(nudgeOffset(4, NUDGE_MS)).toBe(0);
    for (let t = 0; t < NUDGE_MS; t += 20) expect(nudgeOffset(4, t)).toBeLessThanOrEqual(4);
  });
});
