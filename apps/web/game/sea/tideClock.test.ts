import { describe, expect, it } from "vitest";
import { TIDE_HIGH_Y, TIDE_LOW_Y, tideLevel, tideLineY, tideMinute, tideOpen, tidePhase, nextTideOpenAt, seaWet, SEA_PIER, SEA_FLAT_Y0 } from "@tomb/protocol";
import { setTideMinute, tideText, tideWarnNow, tideNow } from "./tideClock";

// 11/16 물때: 3시간 한 바퀴, 한국 자정이 만조, 물 높이 0.25 아래 60분 동안 갯벌이 열려요

const KST_MIDNIGHT = Date.UTC(2026, 10, 15, 15, 0, 0); // 11/16 00:00 KST
const at = (min: number) => KST_MIDNIGHT + min * 60_000;

describe("tide (protocol)", () => {
  it("한국 자정과 3시간마다 만조, 90분이 간조", () => {
    expect(tideMinute(at(0))).toBeCloseTo(0);
    expect(tideLevel(at(0))).toBeCloseTo(1);
    expect(tideLevel(at(180))).toBeCloseTo(1);
    expect(tideLevel(at(90))).toBeCloseTo(0);
    expect(tideLevel(at(45))).toBeCloseTo(0.5 + 0.5 * Math.cos(Math.PI / 2));
  });
  it("갯벌은 60~120분, 한 바퀴에 60분만 열려요", () => {
    let open = 0;
    for (let m = 0; m < 180; m++) if (tideOpen(at(m + 0.5))) open++;
    expect(open).toBe(60);
    expect(tideOpen(at(59.5))).toBe(false);
    expect(tideOpen(at(60.5))).toBe(true);
    expect(tideOpen(at(119.5))).toBe(true);
    expect(tideOpen(at(120.5))).toBe(false);
  });
  it("물때 이름과 남은 분", () => {
    expect(tidePhase(at(5)).phase).toBe("high");
    expect(tidePhase(at(175)).phase).toBe("high");
    expect(tidePhase(at(30))).toMatchObject({ phase: "ebb", minutesLeft: 30 });
    expect(tidePhase(at(100))).toMatchObject({ phase: "low", minutesLeft: 20 });
    expect(tidePhase(at(150)).phase).toBe("flood");
    expect(nextTideOpenAt(at(30))).toBe(at(60));
    expect(nextTideOpenAt(at(90))).toBe(at(240));
  });
  it("물가 선은 만조면 백사장 끝, 간조면 먼바다 바로 위", () => {
    expect(tideLineY(1)).toBe(TIDE_HIGH_Y);
    expect(tideLineY(0)).toBe(TIDE_LOW_Y);
    expect(tideLineY(0.5)).toBe((TIDE_HIGH_Y + TIDE_LOW_Y) / 2);
  });
  it("만조엔 갯벌이 물속, 선착장 위는 젖지 않아요", () => {
    expect(seaWet(400, 700, 1)).toBe(true);
    expect(seaWet(400, 700, 0)).toBe(false);
    expect(seaWet(SEA_PIER.x + 20, 700, 1)).toBe(false);
    expect(seaWet(400, SEA_FLAT_Y0 - 20, 1)).toBe(false);
  });
});

describe("tide clock (HUD)", () => {
  it("시험용으로 물때를 옮기고 글을 만들어요", () => {
    const now = at(17);
    setTideMinute(0, now);
    expect(tideText(now).text).toBe("만조");
    setTideMinute(30, now);
    expect(tideText(now).text).toBe("물 빠지는 중 · 갯벌 열림까지 30분");
    setTideMinute(56, now);
    expect(tideWarnNow(now)).toBe(true);
    setTideMinute(90, now);
    expect(tideText(now).text).toBe("간조 · 갯벌 닫힘까지 30분");
    setTideMinute(140, now);
    expect(tideText(now).text).toBe("물 들어오는 중");
    setTideMinute(null, now);
    expect(tideNow(now)).toBe(now);
  });
});
