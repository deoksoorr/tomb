import { describe, expect, it } from "vitest";
import { CAMP_ARRIVE, CAMP_FIRE, CAMP_OFFICE, CAMP_ROAD, campStreamX } from "./camp";
import { encodeEvent, parseC2S } from "./events";
import { CAMP_FORAGE_SPOTS, SNOW_NODE_GAP, SNOWMAN_GAP, SNOWMAN_LIFE_MS, SNOWMAN_SHRINK_MS, SNOW_STACK_GAP, campSnowSpotOk, isSnowAct, isSnowmanDenyWhy, parseSnowHold, parseSnowStackInfo, parseSnowmanInfo, snowGapWhy, snowLoneBlocks, snowSizesOk, snowmanAlive, snowmanMelt } from "./snowman";

// 11/17 캠핑장 눈사람: 세우기 요청 모양·자리 검증·녹는 시각
describe("snowman wire", () => {
  it("11/18 C2S 내려놓기는 좌표를 반올림해 받고, 크기·id가 틀리면 버린다. 옛 snowman { x, y }는 버린다", () => {
    expect(parseC2S(encodeEvent({ t: "snowPut", x: 300.6, y: 500.2, s: 2 }))).toEqual({ t: "snowPut", x: 301, y: 500, s: 2 });
    expect(parseC2S(JSON.stringify({ t: "snowPut", x: 1, y: 2, s: 3 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "snowAdd", id: "k1", s: 1 }))).toEqual({ t: "snowAdd", id: "k1", s: 1 });
    expect(parseC2S(JSON.stringify({ t: "snowAdd", id: "K 1", s: 1 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "snowTake", id: "k1", x: 9 }))).toEqual({ t: "snowTake", id: "k1" });
    expect(parseC2S(JSON.stringify({ t: "snowman", x: 1, y: 2 }))).toBeNull();
  });
  it("11/26 허물기 snowBreak는 id만 받는다, 허문 덩이는 brk로 알린다", () => {
    expect(parseC2S(JSON.stringify({ t: "snowBreak", id: "k1", x: 3 }))).toEqual({ t: "snowBreak", id: "k1" });
    expect(parseC2S(JSON.stringify({ t: "snowBreak", id: "K 1" }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "snowBreak" }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "snowmanBreak", id: "m1", z: 1 }))).toEqual({ t: "snowmanBreak", id: "m1" });
    expect(parseC2S(JSON.stringify({ t: "snowmanBreak", id: 3 }))).toBeNull();
    expect(JSON.parse(encodeEvent({ t: "snowmanGone", id: "m1", brk: true }))).toEqual({ t: "snowmanGone", id: "m1", brk: true });
    expect(JSON.parse(encodeEvent({ t: "snowStackGone", id: "k1", sid: 2, brk: true }))).toEqual({ t: "snowStackGone", id: "k1", sid: 2, brk: true });
    expect(isSnowAct("break")).toBe(true);
    expect(isSnowAct("drop")).toBe(false);
    expect(isSnowmanDenyWhy("lone")).toBe(true);
  });
  it("11/26 몸통만 놓인 내 덩이가 있으면 새 덩이를 못 놓는다 (배를 올렸으면 된다)", () => {
    expect(snowLoneBlocks([])).toBe(false);
    expect(snowLoneBlocks([{ sizes: [2, 1] }])).toBe(false);
    expect(snowLoneBlocks([{ sizes: [2, 1] }, { sizes: [2] }])).toBe(true);
    expect(snowLoneBlocks([{ sizes: [1] }])).toBe(true);
  });
  it("11/18 들고 있는 상태: 크기만 받고 r은 true일 때만, null은 빈손", () => {
    expect(parseC2S(JSON.stringify({ t: "snowHold", h: { s: 1, r: true, z: 1 } }))).toEqual({ t: "snowHold", h: { s: 1, r: true } });
    expect(parseC2S(JSON.stringify({ t: "snowHold", h: { s: 0, r: 1 } }))).toEqual({ t: "snowHold", h: { s: 0 } });
    expect(parseC2S(JSON.stringify({ t: "snowHold", h: null }))).toEqual({ t: "snowHold", h: null });
    expect(parseC2S(JSON.stringify({ t: "snowHold", h: { s: 5 } }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "snowHold" }))).toBeNull();
    expect(parseSnowHold({ s: 2 })).toEqual({ s: 2 });
    expect(parseSnowHold(undefined)).toBeNull();
  });
  it("11/18 쌓인 크기는 1~3단, 위로 갈수록 작다. 받은 덩이 검증", () => {
    expect(snowSizesOk([2, 1, 0])).toBe(true);
    expect(snowSizesOk([1, 0])).toBe(true);
    expect(snowSizesOk([0, 1])).toBe(false);
    expect(snowSizesOk([2, 2])).toBe(false);
    expect(snowSizesOk([])).toBe(false);
    expect(parseSnowStackInfo({ id: "k1", sid: 3, x: 1, y: 2, sizes: [2, 0], at: 5 })).toEqual({ id: "k1", sid: 3, x: 1, y: 2, sizes: [2, 0], at: 5 });
    expect(parseSnowStackInfo({ id: "k1", sid: 3, x: 1, y: 2, sizes: [0, 2], at: 5 })).toBeNull();
  });
  it("11/18 간격: 다른 사람 것과 SNOW_STACK_GAP 안이면 near, 내 것과 SNOWMAN_GAP 안이면 spot", () => {
    const o = { x: 100, y: 100 };
    expect(snowGapWhy(100 + SNOW_STACK_GAP - 1, 100, [], [o])).toBe("near");
    expect(snowGapWhy(100 + SNOW_STACK_GAP, 100, [], [o])).toBeNull();
    expect(snowGapWhy(100 + SNOWMAN_GAP - 1, 100, [o], [])).toBe("spot");
    expect(snowGapWhy(100 + SNOWMAN_GAP, 100, [o], [])).toBeNull();
  });
  it("받은 눈사람 검증: id 모양·숫자, 이름은 잘라 받는다", () => {
    expect(parseSnowmanInfo({ id: "abc1", x: 1, y: 2, seed: 7, by: "눈", at: 5 })).toEqual({ id: "abc1", x: 1, y: 2, seed: 7, by: "눈", at: 5 });
    expect(parseSnowmanInfo({ id: "A B", x: 1, y: 2, seed: 7, by: "", at: 5 })).toBeNull();
    expect(parseSnowmanInfo({ id: "a", x: 1, y: Number.NaN, seed: 7, by: "", at: 5 })).toBeNull();
    expect(parseSnowmanInfo({ id: "a", x: 1, y: 2, seed: 7, by: "x".repeat(99), at: 5 })!.by.length).toBe(40);
  });
});

describe("snowman spot", () => {
  it("11/26 채집 지점 둘레 SNOW_NODE_GAP 안에는 못 놓는다 (안내가 겹치지 않게)", () => {
    const [nx, ny] = CAMP_FORAGE_SPOTS.find(([x, y]) => x === 714 && y === 624)!;
    expect(campSnowSpotOk(nx + 6, ny + 4)).toBe(false);
    expect(campSnowSpotOk(nx, ny + SNOW_NODE_GAP - 1)).toBe(false);
    for (const [x, y] of CAMP_FORAGE_SPOTS) expect(campSnowSpotOk(x, y)).toBe(false);
  });
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
