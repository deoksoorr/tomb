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
