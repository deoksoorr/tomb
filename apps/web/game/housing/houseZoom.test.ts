import { describe, expect, it } from "vitest";
import { ZOOM_MAX, ZOOM_MIN } from "../config";
import { stepZoom } from "../world/cameraMath";
import { wheelNotch, type WheelAcc } from "./houseZoom";

// 집 안 휠 줌: 마을(CameraRig)과 같은 규칙 — 한 칸 0.5 단계, 1.5~5, 잘게 오는 트랙패드 값은 모아서

const fresh = (): WheelAcc => ({ acc: 0, at: -Infinity, last: -Infinity });

describe("집 안 휠 줌", () => {
  it("마우스 휠 한 칸: 아래로 굴리면 축소, 위로 굴리면 확대", () => {
    expect(wheelNotch(fresh(), 100, 0, 1000)).toBe(-1);
    expect(wheelNotch(fresh(), -100, 0, 1000)).toBe(1);
    // 줄 단위(deltaMode 1)도 한 칸
    expect(wheelNotch(fresh(), 4, 1, 1000)).toBe(-1);
  });

  it("트랙패드처럼 잘게 오는 값은 모아서 한 칸, 80ms 안의 연타는 한 번만", () => {
    const s = fresh();
    expect(wheelNotch(s, 20, 0, 1000)).toBe(0);
    expect(wheelNotch(s, 20, 0, 1010)).toBe(0);
    expect(wheelNotch(s, 20, 0, 1020)).toBe(-1);
    expect(wheelNotch(s, 100, 0, 1050)).toBe(0);
    expect(wheelNotch(s, 10, 0, 1120)).toBe(-1);
  });

  it("한참 쉬었다 오면 모아 둔 값은 버린다", () => {
    const s = fresh();
    expect(wheelNotch(s, 40, 0, 1000)).toBe(0);
    expect(wheelNotch(s, 40, 0, 2000)).toBe(0);
  });

  it("한계는 마을과 같다 (1.5~5, 0.5 단계)", () => {
    expect(ZOOM_MIN).toBe(1.5);
    expect(ZOOM_MAX).toBe(5);
    expect(stepZoom(2, 1)).toBe(2.5);
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});
