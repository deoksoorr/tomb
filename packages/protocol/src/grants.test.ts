import { describe, expect, it } from "vitest";
import { ITEMS, sanitizeLook, signGrant, signJoinToken, verifyGrant, verifyJoinToken } from "./index";

describe("items", () => {
  it("ids are unique and prices positive", () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    // 31번 운영자 전용·주간 1위 전용 꾸미기만 값 0 (운영자만 영구로 받는다 / 1위만 빌려 입는다)
    expect(ITEMS.every((i) => i.price > 0 || i.staff || i.champ)).toBe(true);
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

describe("25번 프리미엄 외형 · 31번 운영자 외형", () => {
  it("처음 6종은 무료, 프리미엄은 등급마다 값이 오르고, 운영자 몸은 따로", async () => {
    const c = await import("./constants");
    expect(c.STARTER_BODIES).toHaveLength(6);
    expect(c.PREMIUM_BODIES.length).toBeGreaterThanOrEqual(6);
    const prices = c.BODY_TIERS.map((t) => c.BODY_TIER_INFO[t].price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    for (const t of c.BODY_TIERS) expect(c.PREMIUM_BODIES.some((b) => b.tier === t), t).toBe(true);
    for (const b of c.AVATAR_BODIES) expect(c.isAvatarBody(b.id)).toBe(true);
    expect(new Set(c.AVATAR_BODIES.map((b) => b.id)).size).toBe(c.AVATAR_BODIES.length);
    expect(c.isStarterBody("suit")).toBe(false);
    expect(c.bodyUnlockPrice("reaper")).toBeNull();
    expect(c.staffGateBody("reaper", false)).toBe("hood");
    expect(c.staffGateBody("reaper", true)).toBe("reaper");
    expect(c.staffGateBody("king", false)).toBe("king");
  });
  it("운영자 전용 꾸미기는 상점 목록에 없고, 운영자가 아니면 착용 목록에서 빠진다", async () => {
    const it2 = await import("./items");
    expect(it2.STAFF_ITEM_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of it2.STAFF_ITEM_IDS) expect(it2.isShopListed(it2.itemById(id)!)).toBe(false);
    expect(it2.staffGateLook(["staff_crown", "neck_tie"], false)).toEqual(["neck_tie"]);
    expect(it2.staffGateLook(["staff_crown", "neck_tie"], true)).toEqual(["staff_crown", "neck_tie"]);
  });
});

describe("주간 랭킹 1위", () => {
  it("1위 전용 꾸미기는 랭킹마다 하나, 머리 부위이고 상점·영구 소장에 없다", async () => {
    const c = await import("./constants");
    const it2 = await import("./items");
    for (const b of c.CHAMP_BOARDS) {
      const item = it2.itemById(c.CHAMP_HAT[b])!;
      expect(item.slot).toBe("head");
      expect(item.champ).toBe(true);
      expect(it2.isChampItem(item.id)).toBe(true);
      expect(it2.isShopListed(item)).toBe(false);
      expect(it2.permanentPrice(item.id)).toBeNull();
      // 운영자 전용이 아니라 누구나 입을 수 있다
      expect(it2.staffGateLook([item.id], false)).toEqual([item.id]);
    }
  });
  it("비트 묶음·오라 끔 표시·배지 글자", async () => {
    const c = await import("./constants");
    expect(c.champBitsOf([])).toBe(0);
    expect(c.champBitsOf(["fish"])).toBe(4);
    expect(c.champBitsOf(["points", "fish"], true)).toBe(5 | c.CHAMP_AURA_OFF);
    expect(c.champBitsOf([], true)).toBe(0);
    expect(c.champBoards(5)).toEqual(["points", "fish"]);
    expect(c.champBoards(c.CHAMP_AURA_OFF)).toEqual([]);
    expect(c.isChampBits(c.CHAMP_AURA_OFF)).toBe(false);
    expect(c.isChampBits(16)).toBe(false);
    expect(c.champAuraOn(1)).toBe(true);
    expect(c.champAuraOn(1 | c.CHAMP_AURA_OFF)).toBe(false);
    expect(c.champBadgeText(2)).toBe("이번 주 사냥왕");
    expect(c.champBadgeText(3)).toBe("이번 주 2관왕");
    expect(c.champBadgeText(7 | c.CHAMP_AURA_OFF)).toBe("이번 주 3관왕");
    expect(c.champBadgeText(0)).toBe("");
  });
  it("입장 토큰·착용 증서에 1위 값이 실리고, 틀린 값은 버린다", async () => {
    const s = "secret";
    const base = { visitorId: "v1", name: "n", color: "#9fc5a8", channel: 1 };
    expect((await verifyJoinToken(s, await signJoinToken(s, { ...base, champ: 3 })))?.champ).toBe(3);
    expect((await verifyJoinToken(s, await signJoinToken(s, { ...base, champ: 99 })))?.champ).toBeUndefined();
    expect((await verifyJoinToken(s, await signJoinToken(s, base)))?.champ).toBeUndefined();
    const exp = Math.floor(Date.now() / 1000) + 60;
    const g = await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v1", look: ["champ_crown"], exp, champ: 9 }));
    expect(g).toMatchObject({ kind: "look", look: ["champ_crown"], champ: 9 });
    // 0 = 1위가 끝남 (실시간 서버가 배지·오라를 끈다), 없으면 옛 웹 증서 (그대로 둔다)
    expect(await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v1", look: [], exp, champ: 0 }))).toMatchObject({ champ: 0 });
    expect(await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v1", look: [], exp }))).not.toHaveProperty("champ");
    expect(await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v1", look: [], exp, champ: 8 }))).not.toHaveProperty("champ");
  });
});
