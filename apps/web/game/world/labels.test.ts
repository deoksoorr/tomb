import { describe, expect, it } from "vitest";
import { declutter, stackLabels, unitBoxes, type LabelBox, type LabelUnit } from "./labels";

// 줌 2 (이름표 배율 0.5) 기준: 글자 줄 높이 ≈ 6, 바탕판 여백 위아래 1
const PX = 0.5;
const unit = (x: number, y: number, w: number, o: Partial<LabelUnit> = {}): LabelUnit => ({ x, y, w, h: 7, tw: 0, th: 0, pin: false, lift: 0, ...o });

/** 두 묶음이 실제 자리(lift 적용)에서 겹치는지 — 두 칸 모두 */
function overlapping(a: LabelUnit, b: LabelUnit): boolean {
  const ra: LabelBox[] = [];
  const rb: LabelBox[] = [];
  const na = unitBoxes(a, a.lift, ra, 0);
  const nb = unitBoxes(b, b.lift, rb, 0);
  for (let i = 0; i < na; i++)
    for (let j = 0; j < nb; j++) {
      const p = ra[i];
      const q = rb[j];
      if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 && p.y > q.y - q.h && p.y - p.h < q.y) return true;
    }
  return false;
}

describe("stackLabels (이름표 묶음 겹침 풀기)", () => {
  it("내 이름표는 제자리, 옆에 선 긴 이름 묶음이 내 묶음(칭호 포함) 위로 통째로 비킨다", () => {
    const me = unit(100, 200, 30, { pin: true, tw: 40, th: 8 });
    const long = unit(120, 200, 60);
    const units = [long, me];
    stackLabels(units, [], 2, PX);
    expect(me.lift).toBe(0);
    // 내 칭호 꼭대기(200-7-8 = 185) 위로 + 틈 1px
    expect(long.lift).toBeCloseTo(7 + 8 + PX);
    expect(overlapping(me, long)).toBe(false);
  });

  it("내가 뒤에(위쪽) 서 있어도 나는 움직이지 않는다", () => {
    const me = unit(100, 196, 30, { pin: true });
    const front = unit(105, 200, 30);
    stackLabels([front, me], [], 2, PX);
    expect(me.lift).toBe(0);
    expect(front.lift).toBeGreaterThan(0);
    expect(overlapping(me, front)).toBe(false);
  });

  it("다른 사람끼리는 앞(아래)에 선 사람이 제자리, 뒤 사람이 비킨다", () => {
    const a = unit(100, 200, 30);
    const b = unit(105, 198, 30);
    const c = unit(300, 198, 30);
    stackLabels([a, b, c], [], 3, PX);
    expect(a.lift).toBe(0);
    expect(b.lift).toBeGreaterThan(0);
    expect(c.lift).toBe(0); // 떨어져 있으면 그대로
  });

  it("가장자리가 살짝 스치는 정도(3 화면px 이하)는 비키지 않는다", () => {
    const me = unit(100, 200, 30, { pin: true });
    // 가로 겹침 1 월드px = 2 화면px
    const b = unit(100 + 30 - 1, 200, 30);
    stackLabels([me, b], [], 2, PX);
    expect(b.lift).toBe(0);
    // 가로 겹침 3 월드px = 6 화면px → 비킨다
    b.x = 100 + 30 - 3;
    stackLabels([me, b], [], 2, PX);
    expect(b.lift).toBeGreaterThan(0);
  });

  it("떨림 막기: 이미 비킨 묶음은 4 화면px 넘게 떨어질 때까지 그대로", () => {
    const me = unit(100, 200, 30, { pin: true });
    const b = unit(120, 200, 30);
    const units = [me, b];
    stackLabels(units, [], 2, PX);
    const up = b.lift;
    expect(up).toBeGreaterThan(0);
    // 가로로 1 월드px(2 화면px) 떨어짐 → 아직 그대로
    b.x = 131;
    stackLabels(units, [], 2, PX);
    expect(b.lift).toBe(up);
    // 처음부터 같은 자리였다면 비키지 않았을 거리
    const fresh = unit(131, 200, 30);
    stackLabels([me, fresh], [], 2, PX);
    expect(fresh.lift).toBe(0);
    // 3 월드px(6 화면px) 떨어지면 내려온다
    b.x = 133;
    stackLabels(units, [], 2, PX);
    expect(b.lift).toBe(0);
  });

  it("떨림 막기: 앞뒤가 엇비슷하면 이미 비킨 쪽이 계속 비킨다 (서로 자리를 바꾸며 출렁이지 않는다)", () => {
    const a = unit(100, 200, 30);
    const b = unit(105, 199, 30);
    stackLabels([a, b], [], 2, PX);
    expect(b.lift).toBeGreaterThan(0);
    // b가 a보다 1px 앞으로 와도 (3 화면px = 1.5 월드px 이내) 그대로
    b.y = 201;
    stackLabels([a, b], [], 2, PX);
    expect(a.lift).toBe(0);
    expect(b.lift).toBeGreaterThan(0);
    // 확실히 앞으로 오면 바뀐다
    b.y = 203;
    stackLabels([a, b], [], 2, PX);
    expect(b.lift).toBe(0);
    expect(a.lift).toBeGreaterThan(0);
  });

  it("긴 칭호(윗칸)는 옆 사람 이름 줄과 높이가 다르면 겹친 것으로 치지 않는다", () => {
    const me = unit(100, 200, 20, { pin: true, tw: 80, th: 8 });
    // 이름 줄끼리는 떨어져 있고, 내 칭호 아래(같은 높이의 이름 줄)에 선 사람
    const b = unit(130, 200, 20);
    stackLabels([me, b], [], 2, PX);
    expect(b.lift).toBe(0);
  });

  it("한번 비킨 묶음도 이름 줄이 내 칭호 아래로 빠지면(맞닿기만 하면) 내려온다 — 칭호에 걸려 계속 떠 있지 않는다", () => {
    const me = unit(100, 200, 12, { pin: true, tw: 40, th: 8 });
    // 이름 줄끼리는 안 겹치고 내 칭호 칸 바로 아래에 맞닿은 자리, 지난 프레임엔 비켜 있었다
    const b = unit(125, 200, 34, { lift: 15 });
    stackLabels([me, b], [], 2, PX);
    expect(b.lift).toBe(0);
    // 바탕판이 1px 더 두꺼워 이름 줄이 칭호 칸에 1px 걸쳐도 마찬가지
    const c = unit(125, 200 + PX, 34, { h: 7 + 2 * PX, lift: 15 });
    stackLabels([me, c], [], 2, PX);
    expect(c.lift).toBe(0);
  });

  it("40명이 몰려도 겹치지 않게 쌓이고 lift는 늘 0 이상", () => {
    const units: LabelUnit[] = Array.from({ length: 40 }, (_, i) => unit(100 + (i % 7) * 9, 200 - Math.floor(i / 7) * 3, 30 + (i % 3) * 20, { pin: i === 5, th: i % 4 === 0 ? 7 : 0, tw: i % 4 === 0 ? 50 : 0 }));
    const order: LabelUnit[] = [];
    stackLabels(units, order, units.length, PX);
    expect(units[5].lift).toBe(0);
    for (const u of units) expect(u.lift).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) expect(overlapping(units[i], units[j])).toBe(false);
    // 가만히 있으면 한 프레임 안에 자리가 굳고(떨림 막기 기준이 한 번 반영), 그 뒤로는 매 프레임 같은 답 — 출렁이지 않는다
    stackLabels(units, order, units.length, PX);
    const settled = units.map((u) => u.lift);
    for (let f = 0; f < 5; f++) {
      stackLabels(units, order, units.length, PX);
      expect(units.map((u) => u.lift)).toEqual(settled);
    }
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) expect(overlapping(units[i], units[j])).toBe(false);
  });
});

describe("declutter (말풍선)", () => {
  it("장애물(자리 잡은 이름표)은 그대로, 겹치는 말풍선만 그 위로", () => {
    const fixed: LabelBox[] = [{ x: 100, y: 180, w: 40, h: 8 }];
    const bubble: LabelBox = { x: 110, y: 185, w: 30, h: 12 };
    declutter([bubble], [], 1, fixed, 1);
    expect(fixed[0].y).toBe(180);
    expect(bubble.y).toBe(172);
  });
  it("높이가 다른 상자도 실제로 겹칠 때만 비킨다", () => {
    const fixed: LabelBox[] = [{ x: 100, y: 180, w: 40, h: 4 }];
    // 말풍선 아랫변이 장애물 윗변(176)보다 위 → 안 겹친다
    const bubble: LabelBox = { x: 100, y: 176, w: 30, h: 20 };
    declutter([bubble], [], 1, fixed, 1);
    expect(bubble.y).toBe(176);
  });
});
