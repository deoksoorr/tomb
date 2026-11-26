import { describe, expect, it } from "vitest";
import { campLotByNo, houseLot, inMapBounds, SEA_LOTS, seaLotFront } from "@tomb/protocol";
import { doorOnEnter, houseDoorSpot, houseExitTo, houseMapOf, type HouseExitInput } from "./housePlace";

const base: HouseExitInput = { from: "world", hasVillage: false, host: "village", zone: undefined, lot: 3, houseCh: 1, ch: 1 };

describe("housePlace", () => {
  it("그 집 맵에 있으면 들어갈 때 미리 문 앞, 나올 때 문 앞 (문·[내 집 가기] 모두)", () => {
    expect(doorOnEnter("world", true)).toBe(true);
    expect(houseExitTo(base)).toEqual({ to: "door" });
    expect(houseExitTo({ ...base, host: "sea", zone: "sea", lot: 2 })).toEqual({ to: "door" });
    expect(houseExitTo({ ...base, host: "camp", zone: "camp", lot: 5 })).toEqual({ to: "door" });
  });

  it("다른 맵에서 바로 들어간 집은 나올 때 그 집 맵의 문 앞으로 옮긴다", () => {
    expect(doorOnEnter("world", false)).toBe(false);
    // 마을에서 → 바닷가 오두막
    const sea = houseExitTo({ ...base, host: "village", zone: "sea", lot: 4 });
    const f = seaLotFront(SEA_LOTS.find((l) => l.n === 4)!, 14);
    expect(sea).toEqual({ to: "warp", map: "sea", x: f.x, y: f.y });
    // 바닷가에서 → 캠핑장 집
    const camp = houseExitTo({ ...base, host: "sea", zone: "camp", lot: 13 });
    expect(camp).toEqual({ to: "warp", map: "camp", ...campLotByNo(13)!.door });
    // 캠핑장에서 → 마을 집
    const vil = houseExitTo({ ...base, host: "camp", zone: undefined, lot: 3 });
    const d = houseLot(3)!.door;
    expect(vil).toEqual({ to: "warp", map: "village", x: d.x, y: d.y + 14 });
  });

  it("분양 마을에서 들어간 집은 분양 마을로 돌아간다", () => {
    expect(doorOnEnter("village", true)).toBe(false);
    expect(houseExitTo({ ...base, from: "village", hasVillage: true })).toEqual({ to: "village" });
    expect(houseExitTo({ ...base, from: "village", hasVillage: false })).toEqual({ to: "door" });
  });

  it("메인 맵에 없는 마을 번지·없는 터면 그 자리 그대로", () => {
    expect(houseExitTo({ ...base, lot: 0 })).toEqual({ to: "stay" });
    expect(houseExitTo({ ...base, host: "sea", lot: 999 })).toEqual({ to: "stay" });
    expect(houseExitTo({ ...base, zone: "sea", lot: 99 })).toEqual({ to: "stay" });
    expect(houseExitTo({ ...base, zone: "camp", lot: 99 })).toEqual({ to: "stay" });
  });

  it("집이 다른 채널이면(집 안에서 다른 채널 집으로 옮겨 갔다) 옮기지 않는다", () => {
    expect(houseExitTo({ ...base, houseCh: 2, ch: 1 })).toEqual({ to: "stay" });
    expect(houseExitTo({ ...base, host: "camp", houseCh: 2, ch: 1 })).toEqual({ to: "stay" });
    // 지금 채널을 모르면 같다고 본다
    expect(houseExitTo({ ...base, host: "camp", houseCh: 2, ch: null }).to).toBe("warp");
  });

  it("문 앞 자리는 모든 터에서 그 맵 범위 안 (실시간 서버가 맵 옮기기를 받는다)", () => {
    for (const l of SEA_LOTS) {
      const s = houseDoorSpot("sea", l.n)!;
      expect(inMapBounds(s.map, s.x, s.y)).toBe(true);
    }
    for (let lot = 1; lot <= 16; lot++) {
      const s = houseDoorSpot("camp", lot)!;
      expect(s.map).toBe("camp");
      expect(inMapBounds(s.map, s.x, s.y)).toBe(true);
    }
    for (let lot = 1; lot <= 30; lot++) {
      const s = houseDoorSpot(undefined, lot);
      if (s) expect(inMapBounds(s.map, s.x, s.y)).toBe(true);
    }
    expect(houseMapOf(undefined)).toBe("village");
    expect(houseMapOf("camp")).toBe("camp");
  });
});
