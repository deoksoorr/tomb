import { describe, expect, it } from "vitest";
import { campSnowSpotOk } from "@tomb/protocol";
import { snowmanArt, snowmanLook, SNOWMAN_H, SNOWMAN_W, stackArt } from "./snowmanArt";
import { campSnowPiles, meltStage, sizeForRoll, snowPlaceOk, stackCheck, stackDone, SNOWBALL_GROW_AT } from "./snowmanLogic";

// 11/17 캠핑장 눈사람 만들기: 굴린 거리 → 크기, 쌓기 순서, 눈더미 자리, 같은 씨앗 → 같은 모습
describe("snowman logic", () => {
  it("굴린 거리로 머리 → 배 → 몸통", () => {
    expect(sizeForRoll(0)).toBe(0);
    expect(sizeForRoll(SNOWBALL_GROW_AT[0])).toBe(1);
    expect(sizeForRoll(SNOWBALL_GROW_AT[1])).toBe(2);
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
  it("눈더미는 여러 구역에 있고, 모두 서버도 받는 눈밭 자리", () => {
    const piles = campSnowPiles();
    expect(piles.length).toBeGreaterThanOrEqual(5);
    for (const p of piles) {
      expect(campSnowSpotOk(p.x, p.y)).toBe(true);
      expect(snowPlaceOk(p.x, p.y)).toBe(true);
    }
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
