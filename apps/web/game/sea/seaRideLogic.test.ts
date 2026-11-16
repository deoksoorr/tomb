import { describe, expect, it } from "vitest";
import { DIR, MAX_VALID_SPEED, SEA_JET_MIN_Y, SEA_JETSKI_SPEED, SEA_JETSKIS, SEA_KAYAK_SPEED, SEA_PIER, SEA_PIER_END, SEA_TUBE_SPEED, seaJetWater, tideLineY } from "@tomb/protocol";
import { ROW_SPEED } from "../logic/boat";
import { kayakSeatOffset, rideFacing, stepJet, stepKayak, stepTube, tubeReturnK, type RideMotion } from "./seaRideLogic";

const at = (x: number, y: number): RideMotion => ({ x, y, vx: 0, vy: 0, dir: DIR.down });

describe("seaRideLogic (11/16 r13)", () => {
  it("제트스키는 조각배의 두 배, 서버 속도 검증 안", () => {
    expect(SEA_JETSKI_SPEED).toBe(ROW_SPEED * 2);
    const m = at(400, 820);
    let max = 0;
    for (let i = 0; i < 200; i++) {
      const x0 = m.x;
      stepJet(m, { ax: 1, ay: 0 }, 16);
      max = Math.max(max, ((m.x - x0) / 16) * 1000);
    }
    expect(max).toBeGreaterThan(SEA_JETSKI_SPEED * 0.9);
    expect(max).toBeLessThanOrEqual(SEA_JETSKI_SPEED + 0.01);
    expect(max).toBeLessThan(MAX_VALID_SPEED);
    expect(m.dir).toBe(DIR.right);
  });
  it("제트스키는 얕은 쪽으로 못 가요 (멈추고 shallow)", () => {
    const m = at(400, SEA_JET_MIN_Y + 6);
    let shallow = false;
    for (let i = 0; i < 120; i++) shallow = stepJet(m, { ax: 0, ay: -1 }, 16).shallow || shallow;
    expect(shallow).toBe(true);
    expect(m.y).toBeGreaterThanOrEqual(SEA_JET_MIN_Y);
    expect(seaJetWater(m.x, m.y)).toBe(true);
  });
  it("제트스키는 선착장 끝 데크에 막혀요 (매어 둔 자리에서 서쪽으로 못 들어가요)", () => {
    const j = SEA_JETSKIS[0];
    const m = at(j.x, j.y);
    for (let i = 0; i < 120; i++) stepJet(m, { ax: -1, ay: 0 }, 16);
    expect(seaJetWater(m.x, m.y)).toBe(true);
    expect(m.x).toBeGreaterThan(SEA_PIER_END.x + SEA_PIER_END.w);
  });
  it("튜브는 헤엄보다 느리고, 물가로 저어 가면 모래에 내려요", () => {
    const level = 1;
    const m = at(SEA_PIER.x - 240, tideLineY(level) + 60);
    let land: { x: number; y: number } | null = null;
    let max = 0;
    for (let i = 0; i < 1000 && !land; i++) {
      const y0 = m.y;
      land = stepTube(m, { ax: 0, ay: -1 }, 16, level, 0).land;
      max = Math.max(max, ((y0 - m.y) / 16) * 1000);
    }
    expect(land).not.toBeNull();
    expect(land!.y).toBeLessThan(tideLineY(level) + 4);
    expect(max).toBeLessThanOrEqual(SEA_TUBE_SPEED + 4);
  });
  it("튜브는 바위·선착장에서 멈추고 내리지 않아요", () => {
    // 선착장 기둥 왼쪽에서 오른쪽으로 (만조, 선착장 머리 아래)
    const m = at(SEA_PIER.x - 20, 600);
    let land = null;
    for (let i = 0; i < 400; i++) land = stepTube(m, { ax: 1, ay: 0 }, 16, 1, 0).land ?? land;
    expect(land).toBeNull();
    expect(m.x).toBeLessThan(SEA_PIER.x);
  });
  it("가만히 탄 튜브도 물결 따라 천천히 떠다니고, 물 밖으로는 안 나가요", () => {
    const m = at(SEA_PIER.x - 200, 760);
    const x0 = m.x;
    const y0 = m.y;
    let moved = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const px = m.x;
      const py = m.y;
      const r = stepTube(m, { ax: 0, ay: 0 }, 16, 0.5, i * 16, 1.7);
      expect(r.land).toBeNull();
      moved = Math.max(moved, Math.hypot(m.x - x0, m.y - y0));
      expect(Math.hypot(m.x - px, m.y - py) / 0.016).toBeLessThan(SEA_TUBE_SPEED);
    }
    expect(moved).toBeGreaterThan(8);
  });
  it("방향 · 돌아가기 비율", () => {
    expect(rideFacing(30, 2, DIR.down)).toBe(DIR.right);
    expect(rideFacing(-1, 1, DIR.up)).toBe(DIR.up);
    expect(tubeReturnK(100, 0)).toBe(0);
    expect(tubeReturnK(100, 60_000)).toBe(1);
    expect(tubeReturnK(100, 2_500)).toBeGreaterThan(0.2);
  });
  // 11/16 r18 카약
  it("카약: 얕은 물은 다니고, 마른 갯벌 쪽으로 저으면 모래에 대며 내려요, 선착장 몸통은 못 지나가요", () => {
    const level = 0.5;
    const line = tideLineY(level);
    const m = at(1300, line + 40);
    let land: { x: number; y: number } | null = null;
    for (let i = 0; i < 600 && !land; i++) land = stepKayak(m, { ax: 0, ay: -1 }, 16, level, 0).land;
    expect(land).not.toBeNull();
    expect(land!.y).toBeLessThan(line + 4);
    // 선착장 몸통 서쪽에서 동쪽으로 → 막혀요
    const k = at(SEA_PIER.x - 20, 700);
    for (let i = 0; i < 300; i++) stepKayak(k, { ax: 1, ay: 0 }, 16, 1, 0);
    expect(k.x).toBeLessThan(SEA_PIER.x);
    // 가만히 있어도 물결 따라 떠다녀요 (속도는 카약 속도보다 작아요)
    const d = at(500, 820);
    for (let i = 0; i < 2000; i++) stepKayak(d, { ax: 0, ay: 0 }, 16, 0.5, i * 16, 2.3);
    expect(Math.hypot(d.x - 500, d.y - 820)).toBeGreaterThan(6);
    expect(SEA_KAYAK_SPEED).toBe(36);
    // 먼저 탄 사람(자리 0)은 앞에서 조종, 같이 탄 사람(자리 1)은 뒤
    expect(kayakSeatOffset(DIR.right, 0).dx).toBeGreaterThan(0);
    expect(kayakSeatOffset(DIR.right, 1).dx).toBeLessThan(0);
  });
});
