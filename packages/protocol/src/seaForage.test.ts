import { describe, expect, it } from "vitest";
import { SEA_DIG_HOLES, seaDigOpen, seaDigOpenAt, seaDigOpenMinutes, TIDE_OPEN_LEVEL, tideLevel, tideLineY } from "./index";

// 11/16 갯벌 캐기 물때 규칙: 갯벌이 열린 동안(물 높이 0.25 아래) 구멍이 물가 선보다 뭍 쪽일 때만
const HIGH = Date.UTC(2026, 10, 15, 15, 0); // 11/16 0시 KST = 만조
const at = (min: number) => HIGH + min * 60_000;

describe("갯벌 구멍 물때", () => {
  it("만조·물 빠지는 중·물 들어오는 중엔 모든 구멍이 닫혀 있어요", () => {
    for (const m of [0, 10, 40, 59, 121, 150, 179]) for (const h of SEA_DIG_HOLES) expect(seaDigOpen(h, at(m)), `${m}분 ${h.x},${h.y}`).toBe(false);
  });

  it("간조 한가운데(90분)엔 모든 구멍이 열려요, 한 물때에 모든 구멍이 언젠가 열려요", () => {
    for (const h of SEA_DIG_HOLES) {
      expect(seaDigOpen(h, at(90)), `${h.x},${h.y}`).toBe(true);
      expect(seaDigOpenMinutes(h), `${h.x},${h.y}`).toBeGreaterThan(0);
    }
  });

  it("물 높이 0.25 이상이면 닫혀요, 물가 선 아래 구멍도 닫혀요", () => {
    const h = SEA_DIG_HOLES[0];
    expect(seaDigOpenAt(h, TIDE_OPEN_LEVEL)).toBe(false);
    expect(seaDigOpenAt({ x: h.x, y: tideLineY(0.1) + 1 }, 0.1)).toBe(false);
    expect(seaDigOpenAt({ x: h.x, y: tideLineY(0.1) - 20 }, 0.1)).toBe(true);
  });

  it("바다 쪽 깊은 구멍일수록 열리는 시간이 같거나 짧아요 (서버 시각 판정 = 물 높이 판정)", () => {
    const sorted = [...SEA_DIG_HOLES].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) expect(seaDigOpenMinutes(sorted[i])).toBeLessThanOrEqual(seaDigOpenMinutes(sorted[i - 1]));
    for (let m = 0; m < 180; m += 7) for (const h of SEA_DIG_HOLES) expect(seaDigOpen(h, at(m))).toBe(seaDigOpenAt(h, tideLevel(at(m))));
  });
});
