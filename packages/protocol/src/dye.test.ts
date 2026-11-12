import { describe, expect, it } from "vitest";
import {
  hasDye,
  isPermanentUntil,
  ITEMS,
  itemById,
  packDye,
  PERMANENT_MULTIPLIER,
  PERMANENT_UNTIL,
  permanentPrice,
  sanitizeDye,
  signGrant,
  signJoinToken,
  unpackDye,
  verifyGrant,
  verifyJoinToken,
} from "./index";

describe("46번 염색 형식", () => {
  it("짧은 형식으로 왕복하고, 기본색 부위는 비운다", () => {
    expect(packDye({})).toBe("");
    expect(packDye({ head: "#aabbcc", accent: "#f4a7b9" })).toBe("aabbcc..f4a7b9");
    expect(unpackDye("aabbcc..f4a7b9")).toEqual({ head: "#aabbcc", accent: "#f4a7b9" });
    expect(unpackDye("zzzzzz.112233")).toEqual({ body: "#112233" });
    expect(hasDye({})).toBe(false);
    expect(hasDye({ body: "#000000" })).toBe(true);
  });
  it("틀린 색·모르는 부위는 버린다 (대문자·# 없는 값도 받지 않는다)", () => {
    expect(sanitizeDye({ head: "#AABBCC", body: "red", accent: "#123456", hat: "#ffffff" })).toEqual({ accent: "#123456" });
    expect(sanitizeDye(null)).toEqual({});
    expect(sanitizeDye("123456")).toEqual({ head: "#123456" });
  });
  it("입장 토큰과 look 증서가 염색·몸 모양을 싣는다 (염색 안 했으면 토큰에 없다)", async () => {
    const s = "secret";
    const plain = await verifyJoinToken(s, await signJoinToken(s, { visitorId: "v", name: "n", color: "#e8d9b0", channel: 1 }));
    expect(plain?.dye).toBeUndefined();
    const dyed = await verifyJoinToken(s, await signJoinToken(s, { visitorId: "v", name: "n", color: "#e8d9b0", channel: 1, dye: { body: "#334455" } }));
    expect(dyed?.dye).toEqual({ body: "#334455" });
    const exp = Math.floor(Date.now() / 1000) + 60;
    const g = await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v", look: ["hat_cat"], exp, dye: { accent: "#f4a7b9" }, body: "bun" }));
    expect(g).toEqual({ kind: "look", visitorId: "v", look: ["hat_cat"], exp, dye: { accent: "#f4a7b9" }, body: "bun" });
    // 되돌린 염색(빈 값)도 "바뀜"으로 실린다 — 실시간 서버가 기본색으로 돌린다
    const reset = await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v", look: [], exp, dye: {}, body: "nope" }));
    expect(reset).toEqual({ kind: "look", visitorId: "v", look: [], exp, dye: {} });
    // 옛 웹이 낸 증서엔 dye·body가 없다
    const old = await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v", look: [], exp }));
    expect(old).toEqual({ kind: "look", visitorId: "v", look: [], exp });
  });
});

describe("46번 염색권·30번 영구 코디 카탈로그", () => {
  it("무작위 염색권 세 등급, 비쌀수록 등급이 높다", () => {
    const dyes = ITEMS.filter((i) => i.kind === "dye");
    expect(dyes.map((i) => i.dye)).toEqual([
      { mode: "random", tier: 1 },
      { mode: "random", tier: 2 },
      { mode: "random", tier: 3 },
    ]);
    expect(dyes[0].price).toBeLessThan(dyes[1].price);
    expect(dyes[1].price).toBeLessThan(dyes[2].price);
  });
  it("영구 가격은 기간제의 7배(10 단위), 꾸미기만", () => {
    const perm = (id: string) => Math.round((itemById(id)!.price * PERMANENT_MULTIPLIER) / 10) * 10;
    expect(PERMANENT_MULTIPLIER).toBe(7);
    expect(permanentPrice("hat_crown")).toBe(perm("hat_crown"));
    expect(permanentPrice("neck_scarf")).toBe(perm("neck_scarf"));
    expect(permanentPrice("fw_small")).toBeNull();
    expect(permanentPrice("hat_straw")).toBeNull();
    for (const it of ITEMS) {
      const p = permanentPrice(it.id);
      if (p !== null) {
        expect(itemById(it.id)?.kind).toBe("cosmetic");
        expect(p / it.price).toBeGreaterThanOrEqual(6);
        expect(p / it.price).toBeLessThanOrEqual(8);
      }
    }
    expect(isPermanentUntil(PERMANENT_UNTIL)).toBe(true);
    expect(isPermanentUntil(Date.now() + 86_400_000)).toBe(false);
  });
});
