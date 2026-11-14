import { describe, expect, it } from "vitest";
import { CHAMP_RECHECK_SPREAD_MS, champRecheckDelay, nextWeekReset } from "./champClock";

// 주간 1위: 접속 중인 화면이 월요일 새벽 5시(한국 시간) 직후 0~20초 안에 다시 확인한다

const kst = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => Date.UTC(y, m - 1, d, h, min, s) - 9 * 3_600_000;

describe("1위 다시 확인 시각", () => {
  it("다음 월요일 새벽 5시 (토요일·일요일 밤·월요일 0~5시·5시 직후)", () => {
    expect(nextWeekReset(kst(2026, 11, 14, 10))).toBe(kst(2026, 11, 16, 5));
    expect(nextWeekReset(kst(2026, 11, 15, 23, 59, 59))).toBe(kst(2026, 11, 16, 5));
    // 월요일 0시~새벽 4시 59분은 아직 지난주 → 그날 새벽 5시
    expect(nextWeekReset(kst(2026, 11, 16))).toBe(kst(2026, 11, 16, 5));
    expect(nextWeekReset(kst(2026, 11, 16, 4, 59, 59))).toBe(kst(2026, 11, 16, 5));
    // 월요일 새벽 5시 정각·직후면 다음 주 월요일
    expect(nextWeekReset(kst(2026, 11, 16, 5))).toBe(kst(2026, 11, 23, 5));
    expect(nextWeekReset(kst(2026, 11, 16, 5, 0, 5))).toBe(kst(2026, 11, 23, 5));
    // UTC로는 아직 일요일인 월요일 오전(한국 시간)도 한국 시간 기준
    expect(nextWeekReset(kst(2026, 11, 16, 8))).toBe(kst(2026, 11, 23, 5));
  });

  it("마감 직후 0~20초 안에 흩뜨려 확인한다", () => {
    const now = kst(2026, 11, 16, 4, 59, 50);
    expect(champRecheckDelay(now, 0)).toBe(10_000);
    expect(champRecheckDelay(now, 1)).toBe(10_000 + CHAMP_RECHECK_SPREAD_MS);
    expect(champRecheckDelay(now, 0.5)).toBe(10_000 + CHAMP_RECHECK_SPREAD_MS / 2);
    expect(CHAMP_RECHECK_SPREAD_MS).toBe(20_000);
  });
});
