import { describe, expect, it } from "vitest";
import { BBQ_MENU, BBQ_THUD_SCALE, bbqActive, bbqBig, bbqItem, bbqStand, bbqStands, soberOne, bbqSpeed, drinkOne, DRUNK_MAX, DRUNK_STEP_MS, drunkLevel, drunkUntil, isBbqEffect, isDrunkState } from "./bbq";
import { parseC2S } from "./events";
import { signGrant, verifyGrant } from "./grants";

// 11/15 캠핑장 야외 바베큐: 싸게 사 먹고 잠깐 커진다 (재미용)
describe("바베큐 메뉴 (먹거리·마실 거리)", () => {
  it("먹거리·마실 거리 두 칸, 값은 8~30P, 커지기 3~5분·빨라지기 3~10분, 메뉴마다 색이 다르다", () => {
    expect(BBQ_MENU.filter((m) => m.cat === "food").map((m) => m.id)).toEqual(["wholepork", "tomahawk", "pork", "sausage", "marsh", "hotteok", "zap", "squid", "hotdog", "tteokkochi", "cupramen", "clams", "sotteok", "bingsu", "watermelon"]);
    expect(BBQ_MENU.filter((m) => m.cat === "drink").map((m) => m.id)).toEqual(["coffee", "beer", "soju", "makgeolli", "hangover", "highball", "sunset", "sikhye", "cola", "slush"]);
    // 파는 곳: 캠핑장 먹거리는 그릴, 마실 거리는 자판기 (11/16 바닷가 매점 메뉴는 매점에서만)
    for (const m of BBQ_MENU) expect(bbqStand(m)).toBe(m.cat === "food" ? "grill" : "vending");
    const at = (s: string) => BBQ_MENU.filter((m) => bbqStands(m).includes(s as "kiosk")).map((m) => m.id);
    expect(at("grill")).toEqual(["wholepork", "tomahawk", "pork", "sausage", "marsh", "hotteok", "zap"]);
    expect(at("vending")).toEqual(["coffee", "beer", "soju", "makgeolli", "hangover"]);
    // 11/16 r12 바닷가: 매점은 먹거리만, 마실 거리는 바닷가 자판기
    expect(at("kiosk")).toEqual(["squid", "hotdog", "tteokkochi", "cupramen", "clams", "sotteok", "bingsu", "watermelon"]);
    expect(at("seaVend")).toEqual(["beer", "soju", "hangover", "highball", "sunset", "sikhye", "cola", "slush"]);
    for (const m of BBQ_MENU) if (bbqStands(m).includes("kiosk")) expect(m.cat, m.id).toBe("food");
    for (const m of BBQ_MENU) if (bbqStands(m).includes("seaVend")) expect(m.cat, m.id).toBe("drink");
    for (const m of BBQ_MENU) {
      expect(m.price).toBeGreaterThanOrEqual(8);
      expect(m.price).toBeLessThanOrEqual(30);
      if (m.kind === "grow") {
        expect(m.ms).toBeGreaterThanOrEqual(3 * 60_000);
        expect(m.ms).toBeLessThanOrEqual(5 * 60_000);
        expect(m.scale).toBeGreaterThan(1);
      }
      if (m.kind === "speed") {
        expect(m.ms).toBeGreaterThanOrEqual(3 * 60_000);
        expect(m.ms).toBeLessThanOrEqual(10 * 60_000);
        expect(m.speed).toBeGreaterThan(1);
        // 실시간 서버 속도 검증(달리기 × 1.5)과 웹 땅 위 배율 상한(1.48) 안
        expect(m.speed).toBeLessThanOrEqual(1.4);
      }
    }
    expect(bbqItem("coffee")?.speed).toBe(1.2);
    expect(bbqItem("hotteok")?.speed).toBe(1.12);
    expect(new Set(BBQ_MENU.map((m) => m.tint)).size).toBe(BBQ_MENU.length);
    // 극단 메뉴: 통삼겹은 3배(쿵), 도끼 스테이크는 2배. 잔상은 번개 닭꼬치만
    expect(bbqItem("wholepork")).toMatchObject({ scale: 3, price: 30 });
    expect(bbqItem("wholepork")!.scale).toBeGreaterThanOrEqual(BBQ_THUD_SCALE);
    expect(bbqItem("tomahawk")!.scale).toBe(2);
    expect(bbqItem("tomahawk")!.scale).toBeLessThan(BBQ_THUD_SCALE);
    expect(BBQ_MENU.filter((m) => m.trail).map((m) => m.id)).toEqual(["zap", "bingsu"]);
    expect(bbqItem("zap")).toMatchObject({ kind: "speed", speed: 1.35 });
    expect(bbqItem("steak")).toBeUndefined();
  });
  it("효과 모양·켜짐, 걸음 배율", () => {
    expect(isBbqEffect({ i: "pork", u: 5 })).toBe(true);
    expect(isBbqEffect({ i: "steak", u: 5 })).toBe(false);
    expect(bbqActive({ i: "pork", u: 5 }, 4)).toBe(true);
    expect(bbqActive({ i: "pork", u: 5 }, 5)).toBe(false);
    expect(bbqSpeed({ i: "coffee", u: 10 }, 5)).toBe(1.2);
    expect(bbqSpeed({ i: "coffee", u: 10 }, 10)).toBe(1);
    expect(bbqSpeed(undefined, 0)).toBe(1);
    expect(bbqSpeed({ i: "zap", u: 10 }, 5)).toBe(1.35);
    expect(bbqBig({ i: "wholepork", u: 10 }, 5)).toBe(3);
    expect(bbqBig({ i: "wholepork", u: 10 }, 10)).toBe(1);
    expect(bbqBig(undefined, 0)).toBe(1);
  });
  it("취기: 한 잔마다 +1 (최대 DRUNK_MAX), 10분에 1씩 깬다", () => {
    let s = drinkOne(null, 0);
    expect(s).toEqual({ lv: 1, at: 0 });
    s = drinkOne(s, 60_000);
    expect(s).toEqual({ lv: 2, at: 60_000 });
    expect(drunkLevel(s, 60_000 + DRUNK_STEP_MS - 1)).toBe(2);
    expect(drunkLevel(s, 60_000 + DRUNK_STEP_MS)).toBe(1);
    expect(drunkLevel(s, drunkUntil(s))).toBe(0);
    // 반쯤 깬 뒤 다시 마시면 지금 단계 + 1
    expect(drinkOne(s, 60_000 + DRUNK_STEP_MS)).toEqual({ lv: 2, at: 60_000 + DRUNK_STEP_MS });
    let t = s;
    for (let i = 0; i < 10; i++) t = drinkOne(t, 70_000);
    expect(t.lv).toBe(DRUNK_MAX);
    // 한도 없이 계속 마셔도 최대 단계에서 멈추고, 깨는 시계만 다시 시작한다
    const u = drinkOne(t, 80_000);
    expect(u).toEqual({ lv: DRUNK_MAX, at: 80_000 });
    expect(drunkLevel(u, 80_000 + DRUNK_STEP_MS)).toBe(DRUNK_MAX - 1);
    // 컨디숑: 한 단계 내리고 깨는 시계는 지금부터, 다 깼으면 null
    expect(soberOne({ lv: 3, at: 0 }, 1_000)).toEqual({ lv: 2, at: 1_000 });
    expect(soberOne({ lv: 1, at: 0 }, 1_000)).toEqual({ lv: 0, at: 1_000 });
    expect(soberOne({ lv: 1, at: 0 }, DRUNK_STEP_MS)).toBeNull();
    expect(soberOne(null, 0)).toBeNull();
    expect(isDrunkState({ lv: 0, at: 1 })).toBe(false);
    expect(isDrunkState({ lv: 3, at: 1 })).toBe(true);
  });
});

describe("바베큐 증서·메시지", () => {
  it("서명된 한 접시 증서만, 끝나는 시각은 그 메뉴 길이(+여유) 안", async () => {
    const now = 1_000_000;
    const ok = await signGrant("s", { kind: "bbq", visitorId: "v", item: "pork", until: now * 1000 + 90_000, nonce: "n1", exp: now + 60 });
    expect(await verifyGrant("s", ok, now)).toMatchObject({ kind: "bbq", item: "pork", until: now * 1000 + 90_000 });
    const tooLong = await signGrant("s", { kind: "bbq", visitorId: "v", item: "marsh", until: now * 1000 + 10 * 60_000, nonce: "n2", exp: now + 60 });
    expect(await verifyGrant("s", tooLong, now)).toBeNull();
    // 마실 거리: 단계·마신 시각이 있어야 하고 끝나는 시각 = 다 깨는 시각
    const at = now * 1000;
    const soju = await signGrant("s", { kind: "bbq", visitorId: "v", item: "soju", until: at + 2 * DRUNK_STEP_MS, lv: 2, at, nonce: "n3", exp: now + 60 });
    expect(await verifyGrant("s", soju, now)).toMatchObject({ item: "soju", lv: 2, at });
    const noLv = await signGrant("s", { kind: "bbq", visitorId: "v", item: "beer", until: at + DRUNK_STEP_MS, nonce: "n4", exp: now + 60 });
    expect(await verifyGrant("s", noLv, now)).toBeNull();
    const badUntil = await signGrant("s", { kind: "bbq", visitorId: "v", item: "beer", until: at + 9 * DRUNK_STEP_MS, lv: 1, at, nonce: "n5", exp: now + 60 });
    expect(await verifyGrant("s", badUntil, now)).toBeNull();
    const tooDrunk = await signGrant("s", { kind: "bbq", visitorId: "v", item: "beer", until: at + 9 * DRUNK_STEP_MS, lv: 9, at, nonce: "n6", exp: now + 60 });
    expect(await verifyGrant("s", tooDrunk, now)).toBeNull();
    // 컨디숑: 내린 단계 0~DRUNK_MAX-1, 끝 = 다 깨는 시각
    const cure = await signGrant("s", { kind: "bbq", visitorId: "v", item: "hangover", until: at, lv: 0, at, nonce: "n7", exp: now + 60 });
    expect(await verifyGrant("s", cure, now)).toMatchObject({ item: "hangover", lv: 0, at });
    const cureBad = await signGrant("s", { kind: "bbq", visitorId: "v", item: "hangover", until: at + 5 * DRUNK_STEP_MS, lv: 5, at, nonce: "n8", exp: now + 60 });
    expect(await verifyGrant("s", cureBad, now)).toBeNull();
    expect(await verifyGrant("other", ok, now)).toBeNull();
  });
  it("C2S bbq는 증서 문자열만 받는다", () => {
    expect(parseC2S(JSON.stringify({ t: "bbq", grant: "abc.def" }))).toEqual({ t: "bbq", grant: "abc.def" });
    expect(parseC2S(JSON.stringify({ t: "bbq", grant: 3 }))).toBeNull();
  });
});
