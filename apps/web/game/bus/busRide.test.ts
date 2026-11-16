import { describe, expect, it } from "vitest";
import { BUS_RIDE_MS } from "./busTypes";
import { BLEND, captionAlpha, skyColors, captionAt, distanceAt, lightsOn, RIDE_ORDER, rideOrder, SEA_RIDE_ORDER, segmentAt, segmentsFor, shakeAt, speedAt, starsOn, strapAngle } from "./busRideMath";

describe("버스 창밖 연출 계산", () => {
  it("가는 길은 마을 → 고속도로 → 단풍 국도 → 숲길, 돌아오는 길은 반대", () => {
    expect(segmentsFor("toCamp")).toEqual(["village", "highway", "maple", "forest"]);
    expect(segmentsFor("toVillage")).toEqual(["forest", "maple", "highway", "village"]);
    expect(RIDE_ORDER).toEqual(["village", "highway", "maple", "forest"]); // 원본은 그대로
  });

  // 11/16 바닷가 노선: 마을 → 고속도로 → 해송 숲 길 → 바닷길, 돌아오는 길은 반대. 노선을 안 주면 캠핑장 그대로
  it("바닷가 노선은 해송 숲 길과 바닷길로 간다", () => {
    expect(segmentsFor("toCamp", "sea")).toEqual(["village", "highway", "coast", "sea"]);
    expect(segmentsFor("toVillage", "sea")).toEqual(["sea", "coast", "highway", "village"]);
    expect(SEA_RIDE_ORDER).toEqual(["village", "highway", "coast", "sea"]);
    expect(rideOrder("camp")).toBe(RIDE_ORDER);
    expect(segmentsFor("toCamp", "camp")).toEqual(segmentsFor("toCamp"));
  });

  it("바닷가 노선 자막", () => {
    expect(captionAt(500, BUS_RIDE_MS, "toCamp", "sea")).toBe("달물결 포구행 버스가 출발해요.");
    expect(captionAt(BUS_RIDE_MS - 500, BUS_RIDE_MS, "toCamp", "sea")).toBe("다음 정류장은 달물결 포구예요.");
    expect(captionAt(500, BUS_RIDE_MS, "toVillage", "sea")).toBe("마을로 돌아가는 버스예요.");
    expect(captionAt(BUS_RIDE_MS - 500, BUS_RIDE_MS, "toVillage", "sea")).toBe("다음 정류장은 마을이에요.");
    expect(captionAt(4000, BUS_RIDE_MS, "toCamp", "sea")).toBeNull();
    expect(captionAt(500, BUS_RIDE_MS, "toCamp")).toBe("언젠가 캠핑장행 버스가 출발해요.");
  });

  it("속도: 멈춘 채 출발해 달리다 정류장에서 멈춘다", () => {
    expect(speedAt(0)).toBe(0);
    expect(speedAt(0.5)).toBe(1);
    expect(speedAt(1)).toBe(0);
    expect(speedAt(0.05)).toBeGreaterThan(0);
    expect(speedAt(0.05)).toBeLessThan(1);
  });

  it("거리: 0에서 1까지 줄지 않고 늘어난다, 끝에 다가갈수록 천천히", () => {
    expect(distanceAt(0)).toBe(0);
    expect(distanceAt(1)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const d = distanceAt(i / 100);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    const mid = distanceAt(0.51) - distanceAt(0.5);
    const end = distanceAt(0.995) - distanceAt(0.985);
    expect(end).toBeLessThan(mid);
  });

  it("구간: 거리 4등분, 경계 근처에서만 다음 구간으로 섞인다", () => {
    expect(segmentAt(0)).toEqual({ index: 0, local: 0, blend: 0 });
    expect(segmentAt(0.1).index).toBe(0);
    expect(segmentAt(0.1).blend).toBe(0);
    expect(segmentAt(0.3).index).toBe(1);
    expect(segmentAt(0.6).index).toBe(2);
    expect(segmentAt(0.9).index).toBe(3);
    expect(segmentAt(1).index).toBe(3);
    // 경계(0.25) 바로 앞은 섞이는 중
    const b = segmentAt(0.25 - BLEND / 4);
    expect(b.index).toBe(0);
    expect(b.blend).toBeGreaterThan(0);
    expect(b.blend).toBeLessThan(1);
    // 마지막 구간은 섞지 않는다
    expect(segmentAt(0.999).blend).toBe(0);
  });

  it("흔들림: 2px 안쪽, 멈춰 있거나 reduced면 0", () => {
    for (let ms = 0; ms < BUS_RIDE_MS; ms += 37) {
      const s = shakeAt(ms, ms / BUS_RIDE_MS, false);
      expect(Math.abs(s)).toBeLessThanOrEqual(2);
      expect(shakeAt(ms, ms / BUS_RIDE_MS, true)).toBe(0);
    }
    expect(shakeAt(1234, 0, false)).toBe(0);
    expect(strapAngle(1234, 0.5, true)).toBe(0);
  });

  it("불빛·별: 노을부터 새벽까지 불빛, 한밤에만 별", () => {
    expect(lightsOn(12)).toBe(false);
    expect(lightsOn(18)).toBe(true);
    expect(lightsOn(23)).toBe(true);
    expect(lightsOn(3)).toBe(true);
    expect(lightsOn(7)).toBe(false);
    expect(starsOn(18)).toBe(false);
    expect(starsOn(22)).toBe(true);
    expect(starsOn(4)).toBe(true);
  });

  it("자막: 처음엔 출발 안내, 끝엔 다음 정류장, 가운데는 없다", () => {
    expect(captionAt(500, BUS_RIDE_MS, "toCamp")).toContain("출발");
    expect(captionAt(4000, BUS_RIDE_MS, "toCamp")).toBeNull();
    expect(captionAt(BUS_RIDE_MS - 500, BUS_RIDE_MS, "toCamp")).toBe("다음 정류장은 언젠가 캠핑장이에요.");
    expect(captionAt(BUS_RIDE_MS - 500, BUS_RIDE_MS, "toVillage")).toBe("다음 정류장은 마을이에요.");
    expect(captionAlpha(0, BUS_RIDE_MS)).toBe(0);
    expect(captionAlpha(1200, BUS_RIDE_MS)).toBe(1);
    expect(captionAlpha(4000, BUS_RIDE_MS)).toBe(0);
    expect(captionAlpha(BUS_RIDE_MS - 10, BUS_RIDE_MS)).toBe(1);
  });

  it("하늘: 낮은 밝은 파랑, 밤은 어둡고, 흐리면 회색 쪽으로", () => {
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    const day = skyColors(12);
    const night = skyColors(23);
    expect(lum(day.top)).toBeGreaterThan(lum(night.top) * 3);
    expect(day.top & 255).toBeGreaterThan((day.top >> 16) & 255); // 파랑이 빨강보다
    const dusk = skyColors(18.2);
    expect((dusk.bottom >> 16) & 255).toBeGreaterThan(dusk.bottom & 255); // 노을 아래쪽은 주황
    expect(skyColors(0)).toEqual(skyColors(24));
    const gray = skyColors(12, 1);
    const sat = (c: number) => Math.max((c >> 16) & 255, (c >> 8) & 255, c & 255) - Math.min((c >> 16) & 255, (c >> 8) & 255, c & 255);
    expect(sat(gray.top)).toBeLessThan(sat(day.top));
  });
});

