import { describe, expect, it } from "vitest";
import {
  DYE_SPECIAL_NAMES,
  DYE_SPECIALS,
  dyeHex,
  dyeSpecialOf,
  hasDye,
  isDyeColor,
  normalizeDyeColor,
  withDyeSpecial,
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
  it("특수 색은 \"#rrggbb~종류\"로 왕복하고, 모르는 종류 글자는 바탕 색만 쓴다", () => {
    expect(isDyeColor("#e8b84a~g")).toBe(true);
    expect(isDyeColor("#e8b84a~")).toBe(false);
    expect(isDyeColor("#e8b84a~gg")).toBe(false);
    expect(isDyeColor("#E8B84A~g")).toBe(false);
    const d = { head: "#e8b84a~g", body: "#112233", accent: "#ff00aa~r" };
    expect(packDye(d)).toBe("e8b84a~g.112233.ff00aa~r");
    expect(unpackDye(packDye(d))).toEqual(d);
    expect(sanitizeDye(d)).toEqual(d);
    expect(dyeSpecialOf("#e8b84a~g")).toBe("g");
    expect(dyeSpecialOf("#e8b84a~z")).toBeNull();
    expect(dyeSpecialOf("#e8b84a")).toBeNull();
    expect(dyeHex("#e8b84a~s")).toBe("#e8b84a");
    expect(withDyeSpecial("#e8b84a", "n")).toBe("#e8b84a~n");
    expect(withDyeSpecial("#e8b84a", null)).toBe("#e8b84a");
    for (const k of DYE_SPECIALS) expect(DYE_SPECIAL_NAMES[k]).toBeTruthy();
    // 관리자 고정 색 입력은 바탕 색만
    expect(normalizeDyeColor("#e8b84a~g")).toBeNull();
    // 옛 클라이언트의 검사(6자리 hex만)는 특수 부위를 버리고 기본 색으로 본다 — 나머지 부위는 그대로
    const oldUnpack = (s: string) => Object.fromEntries(s.split(".").flatMap((v, i) => (/^[0-9a-f]{6}$/.test(v) ? [[["head", "body", "accent"][i], `#${v}`]] : [])));
    expect(oldUnpack(packDye(d))).toEqual({ body: "#112233" });
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
  it("무작위 염색권 여덟 종류, 값 순으로 놓이고 처음 세 등급은 비쌀수록 높다", () => {
    const dyes = ITEMS.filter((i) => i.kind === "dye");
    expect(dyes.map((i) => i.dye?.mode === "random" && i.dye.tier)).toEqual([1, 4, 5, 6, 2, 7, 3, 8]);
    for (let i = 1; i < dyes.length; i++) expect(dyes[i].price).toBeGreaterThanOrEqual(dyes[i - 1].price);
    const price = (t: number) => dyes.find((d) => d.dye?.mode === "random" && d.dye.tier === t)!.price;
    expect(price(1)).toBeLessThan(price(2));
    expect(price(2)).toBeLessThan(price(3));
    // 경제 표: 450 ~ 1,800P 안
    expect(Math.min(...dyes.map((d) => d.price))).toBe(450);
    expect(Math.max(...dyes.map((d) => d.price))).toBeLessThanOrEqual(1800);
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
      if (it.staff) expect(p).toBe(0);
      else if (p !== null) {
        expect(itemById(it.id)?.kind).toBe("cosmetic");
        expect(p / it.price).toBeGreaterThanOrEqual(6);
        expect(p / it.price).toBeLessThanOrEqual(8);
      }
    }
    expect(isPermanentUntil(PERMANENT_UNTIL)).toBe(true);
    expect(isPermanentUntil(Date.now() + 86_400_000)).toBe(false);
  });
});
