import { describe, expect, it } from "vitest";
import { CAMP_ARRIVE, CAMP_FIRE, CAMP_OFFICE, CAMP_ROAD, campStreamX } from "./camp";
import { encodeEvent, parseC2S } from "./events";
import { SNOWMAN_LIFE_MS, SNOWMAN_SHRINK_MS, campSnowSpotOk, parseSnowmanInfo, snowmanAlive, snowmanMelt } from "./snowman";

// 11/17 캠핑장 눈사람: 세우기 요청 모양·자리 검증·녹는 시각
describe("snowman wire", () => {
  it("C2S snowman은 좌표를 반올림해 받고, 숫자가 아니면 버린다", () => {
    expect(parseC2S(encodeEvent({ t: "snowman", x: 300.6, y: 500.2 }))).toEqual({ t: "snowman", x: 301, y: 500 });
    expect(parseC2S(JSON.stringify({ t: "snowman", x: "1", y: 2 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "snowman", x: 1 }))).toBeNull();
  });
  it("받은 눈사람 검증: id 모양·숫자, 이름은 잘라 받는다", () => {
    expect(parseSnowmanInfo({ id: "abc1", x: 1, y: 2, seed: 7, by: "눈", at: 5 })).toEqual({ id: "abc1", x: 1, y: 2, seed: 7, by: "눈", at: 5 });
    expect(parseSnowmanInfo({ id: "A B", x: 1, y: 2, seed: 7, by: "", at: 5 })).toBeNull();
    expect(parseSnowmanInfo({ id: "a", x: 1, y: Number.NaN, seed: 7, by: "", at: 5 })).toBeNull();
    expect(parseSnowmanInfo({ id: "a", x: 1, y: 2, seed: 7, by: "x".repeat(99), at: 5 })!.by.length).toBe(40);
  });
});

describe("snowman spot", () => {
  it("눈밭은 되고, 물·버스 길·모닥불 자리·관리소·맵 밖은 안 된다 (11/18 모닥불 근처는 돼요)", () => {
    expect(campSnowSpotOk(330, 540)).toBe(true);
    expect(campSnowSpotOk(campStreamX(400), 400)).toBe(false);
    expect(campSnowSpotOk(CAMP_ROAD.x + 60, CAMP_ROAD.y + 20)).toBe(false);
    expect(campSnowSpotOk(CAMP_FIRE.x + 10, CAMP_FIRE.y)).toBe(false);
    expect(campSnowSpotOk(CAMP_FIRE.x + 40, CAMP_FIRE.y)).toBe(true);
    expect(campSnowSpotOk(CAMP_OFFICE.x, CAMP_OFFICE.y - 20)).toBe(false);
    expect(campSnowSpotOk(-5, 300)).toBe(false);
    expect(campSnowSpotOk(CAMP_ARRIVE.x, CAMP_ARRIVE.y)).toBe(false);
  });
});

describe("snowman melt", () => {
  it("마지막 10분 동안만 0→1, 1시간이면 다 녹는다", () => {
    expect(snowmanMelt(0, 0)).toBe(0);
    expect(snowmanMelt(0, SNOWMAN_LIFE_MS - SNOWMAN_SHRINK_MS)).toBe(0);
    expect(snowmanMelt(0, SNOWMAN_LIFE_MS - SNOWMAN_SHRINK_MS / 2)).toBeCloseTo(0.5);
    expect(snowmanMelt(0, SNOWMAN_LIFE_MS)).toBe(1);
    expect(snowmanAlive(0, SNOWMAN_LIFE_MS - 1)).toBe(true);
    expect(snowmanAlive(0, SNOWMAN_LIFE_MS)).toBe(false);
  });
});
