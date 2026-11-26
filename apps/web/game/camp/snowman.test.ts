import { describe, expect, it } from "vitest";
import { CAMP_HOME_SEATS, campSnowSpotOk } from "@tomb/protocol";
import { CAMP_GATHER_NODES } from "@/lib/forage/catalog";
import { BALL_R, carriedBallSheet, carryFrameSize, snowmanArt, snowmanLook, SNOWMAN_H, SNOWMAN_W, stackArt, type BallSize } from "./snowmanArt";
import { ballFront, campSnowPiles, carryAt, PILE_NODE_GAP, PILE_SEAT_GAP, heldStep, meltStage, rectsOverlap, sizeForRoll, snowmanBlockRect, snowPlaceOk, stackBlockRect, stackCheck, stackDone, stackOpen, SNOWBALL_GROW_AT } from "./snowmanLogic";

// 11/17 캠핑장 눈사람 만들기: 굴린 거리 → 크기, 쌓기 순서, 눈더미 자리, 같은 씨앗 → 같은 모습
describe("snowman logic", () => {
  it("굴린 거리로 머리 → 배 → 몸통", () => {
    expect(sizeForRoll(0)).toBe(0);
    expect(sizeForRoll(SNOWBALL_GROW_AT[0])).toBe(1);
    expect(sizeForRoll(SNOWBALL_GROW_AT[1])).toBe(2);
  });
  it("11/18 안고 걸으면 안 커지고, 굴릴 때만 커진다 (몸통이 가장 크다)", () => {
    let h: { size: BallSize; dist: number } = { size: 0, dist: 0 };
    for (let i = 0; i < 200; i++) h = heldStep(h, 5, false, true);
    expect(h).toEqual({ size: 0, dist: 0 });
    // 흙길처럼 눈이 안 묻는 바닥에서 굴려도 그대로
    expect(heldStep(h, 50, true, false)).toEqual(h);
    const sizes: BallSize[] = [];
    for (let i = 0; i < 200; i++) {
      h = heldStep(h, 5, true, true);
      if (sizes[sizes.length - 1] !== h.size) sizes.push(h.size);
    }
    expect(sizes).toEqual([0, 1, 2]);
    // 몸통을 들고 다시 안았다가 굴려도 몸통 (더 커지지도 작아지지도 않는다)
    expect(heldStep({ size: 2, dist: 0 }, 5, true, true).size).toBe(2);
  });
  it("11/18 안은 덩이: 아래를 보면 몸 앞에 낮게, 옆이면 그쪽, 위를 보면 몸 뒤", () => {
    for (const s of [0, 1, 2] as const) {
      const r = BALL_R[s];
      const down = carryAt(100, 200, 0, r, r * 0.9, 10);
      expect(down.depth).toBeGreaterThan(200);
      expect(down.y + r * 0.9).toBeGreaterThan(200);
      expect(down.y + r * 0.9).toBeLessThanOrEqual(203);
      expect(carryAt(100, 200, 3, r, r * 0.9, 10).y).toBeLessThan(down.y);
      expect(carryAt(100, 200, 1, r, r * 0.9, 10).x).toBeLessThan(100);
      expect(carryAt(100, 200, 2, r, r * 0.9, 10).x).toBeGreaterThan(100);
      expect(carryAt(100, 200, 3, r, r * 0.9, 10).depth).toBeLessThan(200);
      // 커지면 더 높이 안는다
      expect(carryAt(100, 200, 0, r, r * 0.9, 10, 2).y).toBeLessThan(down.y);
      const sh = carriedBallSheet(s);
      const fr = carryFrameSize(s);
      expect([sh.frameW, sh.frameH]).toEqual([fr.w, fr.h]);
      expect(sh.grid.w).toBe(fr.w * 3);
    }
  });
  it("더 작은 덩이만 위에 올리고, 몸통·배·머리면 완성", () => {
    const st = { id: 1, x: 0, y: 0, sizes: [2 as const] as (0 | 1 | 2)[] };
    expect(stackCheck(st, 2)).toBe("bigger");
    expect(stackCheck(st, 1)).toBe("ok");
    st.sizes.push(1);
    expect(stackCheck(st, 1)).toBe("bigger");
    expect(stackDone(st)).toBe(false);
    st.sizes.push(0);
    expect(stackDone(st)).toBe(true);
    expect(stackCheck(st, 0)).toBe("full");
  });
  it("11/19 한 단씩만: 몸통 위에 머리를 바로 올리면 skip, 올릴 자리가 남은 덩이만 열림", () => {
    const st = { id: 1, x: 0, y: 0, sizes: [2 as const] as (0 | 1 | 2)[] };
    expect(stackCheck(st, 0)).toBe("skip");
    expect(stackOpen(st)).toBe(true);
    st.sizes.push(1);
    expect(stackOpen(st)).toBe(true);
    st.sizes.push(0);
    expect(stackOpen(st)).toBe(false);
    expect(stackOpen({ ...st, sizes: [2, 0] })).toBe(false);
  });
  it("눈더미는 여러 구역에 있고, 모두 서버도 받는 눈밭 자리", () => {
    const piles = campSnowPiles();
    expect(piles.length).toBeGreaterThanOrEqual(5);
    for (const p of piles) {
      expect(campSnowSpotOk(p.x, p.y)).toBe(true);
      expect(snowPlaceOk(p.x, p.y)).toBe(true);
    }
  });
  it("11/26 눈더미는 집 앞마당 자리·일어서는 자리와 44px 넘게 떨어져 있다 (E가 앉기 대신 눈 뭉치기로 가지 않게)", () => {
    for (const p of campSnowPiles())
      for (const q of CAMP_HOME_SEATS) {
        expect(Math.hypot(q.x - p.x, q.y - p.y), `${q.id} ${p.x},${p.y}`).toBeGreaterThanOrEqual(PILE_SEAT_GAP);
        expect(Math.hypot(q.x + (q.standDx ?? 0) - p.x, q.y + (q.standDy ?? 9) - p.y), `${q.id} 일어서는 자리 ${p.x},${p.y}`).toBeGreaterThanOrEqual(PILE_SEAT_GAP);
      }
  });

  it("눈더미는 채집 지점과 떨어져 있다 (E가 눈 뭉치기로 가로채지 않게)", () => {
    for (const p of campSnowPiles()) for (const n of CAMP_GATHER_NODES) expect(Math.hypot(n.x - p.x, n.y - p.y), `${n.id} ${p.x},${p.y}`).toBeGreaterThanOrEqual(PILE_NODE_GAP);
  });
  it("웹이 내려놓을 수 있는 자리는 서버도 받는다 (격자 훑기)", () => {
    for (let y = 40; y < 800; y += 12) for (let x = 20; x < 1280; x += 12) if (snowPlaceOk(x, y)) expect(campSnowSpotOk(x, y), `${x},${y}`).toBe(true);
  });
  it("녹는 단계: 0 → 1 → 2 → 3", () => {
    expect([0, 0.1, 0.5, 0.9].map(meltStage)).toEqual([0, 1, 2, 3]);
  });
  it("같은 씨앗이면 같은 모습, 그림은 틀 안에", () => {
    expect(snowmanLook(42, false)).toEqual(snowmanLook(42, false));
    const looks = new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(snowmanLook(i * 7919, true))));
    expect(looks.size).toBeGreaterThan(150);
    const xmasHats = Array.from({ length: 400 }, (_, i) => snowmanLook(i, true).hat).filter((h) => h === "santa" || h === "antlers").length;
    const winterHats = Array.from({ length: 400 }, (_, i) => snowmanLook(i, false).hat).filter((h) => h === "santa" || h === "antlers").length;
    expect(xmasHats).toBeGreaterThan(winterHats * 2);
    for (let m = 0; m < 4; m++) {
      const g = snowmanArt(snowmanLook(5, true), m);
      expect([g.w, g.h]).toEqual([SNOWMAN_W, SNOWMAN_H]);
    }
    expect(stackArt([2, 1, 0]).h).toBeLessThanOrEqual(SNOWMAN_H);
  });
});

// 11/18 눈사람·덩이는 못 지나간다 (밑동 충돌 상자) — 그래도 덩이 바로 앞에 서서 올릴 수는 있어야 한다
describe("snow walls", () => {
  const foot = (x: number, y: number) => ({ x: x - 4, y: y - 5, w: 8, h: 5 });
  it("덩이에 올리는 자리(발 앞)에 서면 내 발이 덩이 밑동과 겹치지 않는다 (네 방향·모든 크기)", () => {
    for (const s of [0, 1, 2] as const)
      for (const dir of [0, 1, 2, 3]) {
        const at = ballFront(0, 0, dir, BALL_R[s]);
        // 덩이가 (at)에 있을 때 그 앞에 선 내 발 (0,0)
        expect(rectsOverlap(foot(0, 0), stackBlockRect(at.x, at.y)), `${s}/${dir}`).toBe(false);
      }
  });
  it("눈사람 밑동은 가운데를 막고, 옆으로 비껴가면 지나간다", () => {
    const r = snowmanBlockRect(100, 100);
    expect(rectsOverlap(foot(100, 100), r)).toBe(true);
    expect(rectsOverlap(foot(100, 103), r)).toBe(true);
    expect(rectsOverlap(foot(111, 100), r)).toBe(false);
    expect(rectsOverlap(foot(100, 106), r)).toBe(false);
  });
});
