import { describe, expect, it } from "vitest";
import { weekStartMs } from "./gameDay";
import { raceClock, raceLeftText, raceTickMs } from "./raceClock";

const W = "20261116"; // 월요일
const end = weekStartMs("20261123");

describe("raceClock", () => {
  it("남은 시간 글", () => {
    expect(raceLeftText((2 * 24 + 13) * 3_600_000 + 5 * 60_000)).toBe("2일 13시간");
    expect(raceLeftText(3 * 86_400_000)).toBe("3일");
    expect(raceLeftText(5 * 3_600_000 + 12 * 60_000 + 30_000)).toBe("5시간 12분");
    expect(raceLeftText(47 * 60_000 + 12_400)).toBe("47분 12초");
    expect(raceLeftText(9_000)).toBe("9초");
    expect(raceLeftText(-5)).toBe("0초");
  });

  it("이번 레이스 끝 · 다음 레이스 시작 (월요일 새벽 5시)", () => {
    const now = weekStartMs(W) + 4 * 86_400_000 + 15 * 3_600_000; // 금요일 저녁 8시
    const c = raceClock(now);
    expect(c.endsAt).toBe(end);
    expect(c.endLine).toBe("이번 레이스는 2일 9시간 뒤에 끝나요");
    expect(c.nextLine).toBe("다음 레이스는 11월 23일 월요일 새벽 5시에 시작해요");
    expect(raceClock(end - 1).endLine).toBe("이번 레이스는 0초 뒤에 끝나요");
    // 마감이 지나면 그다음 주
    expect(raceClock(end).nextLine).toBe("다음 레이스는 11월 30일 월요일 새벽 5시에 시작해요");
  });

  it("갱신 간격: 1시간 위는 분 경계, 아래는 1초", () => {
    expect(raceTickMs(end - 2 * 3_600_000 - 30_000)).toBe(30_020);
    expect(raceTickMs(end - 47 * 60_000)).toBe(1000);
  });
});
