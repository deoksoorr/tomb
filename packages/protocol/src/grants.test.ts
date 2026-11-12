import { describe, expect, it } from "vitest";
import { ITEMS, sanitizeLook, signGrant, signJoinToken, verifyGrant, verifyJoinToken } from "./index";

describe("items", () => {
  it("ids are unique and prices positive", () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(ITEMS.every((i) => i.price > 0)).toBe(true);
  });
  it("sanitizeLook keeps one cosmetic per slot and drops unknown/non-cosmetic ids", () => {
    expect(sanitizeLook(["hat_cat", "hat_straw", "fw_small", "nope", "aura_firefly"])).toEqual(["hat_cat", "aura_firefly"]);
    expect(sanitizeLook("x")).toEqual([]);
  });
});

describe("grave styles", () => {
  it("every paid style has a matching graveStyle item and vice versa", async () => {
    const { GRAVE_STYLES, styleItemId, itemById, ITEMS: all } = await import("./index");
    for (const g of GRAVE_STYLES) {
      const item = styleItemId(g.id);
      if (g.free) expect(item).toBeNull();
      else expect(itemById(item!)?.kind).toBe("graveStyle");
    }
    expect(all.filter((i) => i.kind === "graveStyle").length).toBe(GRAVE_STYLES.filter((g) => !g.free).length);
  });
});

describe("grants", () => {
  const s = "secret";
  it("round-trips look and firework grants", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const look = await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v", look: ["hat_cat"], exp }));
    expect(look).toEqual({ kind: "look", visitorId: "v", look: ["hat_cat"], exp });
    const fw = await verifyGrant(s, await signGrant(s, { kind: "firework", visitorId: "v", item: "fw_small", nonce: "n1", exp }));
    expect(fw?.kind).toBe("firework");
  });
  it("rejects expired, wrong secret, and non-firework items", async () => {
    expect(await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v", look: [], exp: 10 }), 11)).toBeNull();
    const exp = Math.floor(Date.now() / 1000) + 60;
    expect(await verifyGrant("other", await signGrant(s, { kind: "look", visitorId: "v", look: [], exp }))).toBeNull();
    expect(await verifyGrant(s, await signGrant(s, { kind: "firework", visitorId: "v", item: "hat_cat", nonce: "n", exp }))).toBeNull();
  });
  it("grants and join tokens are not interchangeable", async () => {
    const join = await signJoinToken(s, { visitorId: "v", name: "n", color: "#fff", channel: 1 });
    expect(await verifyGrant(s, join)).toBeNull();
    const exp = Math.floor(Date.now() / 1000) + 60;
    expect(await verifyJoinToken(s, await signGrant(s, { kind: "look", visitorId: "v", look: [], exp }))).toBeNull();
  });
});

describe("23번 확성기 증서·이벤트", () => {
  const s = "secret";
  const exp = Math.floor(Date.now() / 1000) + 60;
  const text = "가".repeat(60);
  it("한글 60자 + 긴 닉네임 증서도 왕복하고, 소켓 메시지 한도 안에 든다", async () => {
    const { parseC2S, MAX_MEGAPHONE_MESSAGE_BYTES, encodeEvent } = await import("./index");
    const grant = await signGrant(s, { kind: "megaphone", visitorId: "V1StGXR8_Z5jdHi6B-myT", nonce: "abcdefghij", name: "열두글자닉네임입니다요", text, scope: "all", ch: 3, exp });
    expect(await verifyGrant(s, grant)).toEqual({ kind: "megaphone", visitorId: "V1StGXR8_Z5jdHi6B-myT", nonce: "abcdefghij", name: "열두글자닉네임입니다요", text, scope: "all", ch: 3, exp });
    const wire = encodeEvent({ t: "megaphone", grant });
    expect(wire.length).toBeLessThan(MAX_MEGAPHONE_MESSAGE_BYTES);
    expect(parseC2S(wire)).toEqual({ t: "megaphone", grant });
  });
  it("61자·빈 문장·모르는 범위는 거절, 다른 이벤트는 여전히 512자 한도", async () => {
    const { parseC2S } = await import("./index");
    expect(await verifyGrant(s, await signGrant(s, { kind: "megaphone", visitorId: "v", nonce: "n", name: "a", text: text + "가", scope: "channel", ch: 1, exp }))).toBeNull();
    expect(await verifyGrant(s, await signGrant(s, { kind: "megaphone", visitorId: "v", nonce: "n", name: "a", text: "", scope: "channel", ch: 1, exp }))).toBeNull();
    expect(
      await verifyGrant(s, await signGrant(s, { kind: "megaphone", visitorId: "v", nonce: "n", name: "a", text: "hi", scope: "world" as "all", ch: 1, exp })),
    ).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "look", grant: "x".repeat(600) }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "megaphone", grant: "x".repeat(1300) }))).toBeNull();
  });
  it("확성기 아이템과 범위", async () => {
    const { megaphoneScope, itemById, isShopListed } = await import("./index");
    expect(megaphoneScope("mega_ch")).toBe("channel");
    expect(megaphoneScope("mega_all")).toBe("all");
    expect(megaphoneScope("fw_small")).toBeNull();
    expect(isShopListed(itemById("mega_ch")!)).toBe(true);
  });
});
