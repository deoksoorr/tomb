import { describe, expect, it } from "vitest";
import { BBQ_DAILY, BBQ_MENU, bbqActive, bbqItem, isBbqEffect } from "./bbq";
import { parseC2S } from "./events";
import { signGrant, verifyGrant } from "./grants";

// 11/15 캠핑장 야외 바베큐: 싸게 사 먹고 잠깐 커진다 (재미용)
describe("바베큐 메뉴", () => {
  it("메뉴 셋, 10~20P, 60~90초, 메뉴마다 크기·색이 다르다", () => {
    expect(BBQ_MENU.map((m) => m.id)).toEqual(["pork", "sausage", "marsh"]);
    for (const m of BBQ_MENU) {
      expect(m.price).toBeGreaterThanOrEqual(10);
      expect(m.price).toBeLessThanOrEqual(20);
      expect(m.ms).toBeGreaterThanOrEqual(60_000);
      expect(m.ms).toBeLessThanOrEqual(90_000);
      expect(m.scale).toBeGreaterThan(1);
    }
    expect(new Set(BBQ_MENU.map((m) => m.scale)).size).toBe(3);
    expect(new Set(BBQ_MENU.map((m) => m.tint)).size).toBe(3);
    expect(BBQ_DAILY).toBeGreaterThan(0);
    expect(bbqItem("steak")).toBeUndefined();
  });
  it("효과 모양·켜짐", () => {
    expect(isBbqEffect({ i: "pork", u: 5 })).toBe(true);
    expect(isBbqEffect({ i: "steak", u: 5 })).toBe(false);
    expect(bbqActive({ i: "pork", u: 5 }, 4)).toBe(true);
    expect(bbqActive({ i: "pork", u: 5 }, 5)).toBe(false);
  });
});

describe("바베큐 증서·메시지", () => {
  it("서명된 한 접시 증서만, 끝나는 시각은 그 메뉴 길이(+여유) 안", async () => {
    const now = 1_000_000;
    const ok = await signGrant("s", { kind: "bbq", visitorId: "v", item: "pork", until: now * 1000 + 90_000, nonce: "n1", exp: now + 60 });
    expect(await verifyGrant("s", ok, now)).toMatchObject({ kind: "bbq", item: "pork", until: now * 1000 + 90_000 });
    const tooLong = await signGrant("s", { kind: "bbq", visitorId: "v", item: "marsh", until: now * 1000 + 10 * 60_000, nonce: "n2", exp: now + 60 });
    expect(await verifyGrant("s", tooLong, now)).toBeNull();
    expect(await verifyGrant("other", ok, now)).toBeNull();
  });
  it("C2S bbq는 증서 문자열만 받는다", () => {
    expect(parseC2S(JSON.stringify({ t: "bbq", grant: "abc.def" }))).toEqual({ t: "bbq", grant: "abc.def" });
    expect(parseC2S(JSON.stringify({ t: "bbq", grant: 3 }))).toBeNull();
  });
});
