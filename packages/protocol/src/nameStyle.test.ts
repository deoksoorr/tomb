import { describe, expect, it } from "vitest";
import {
  AVATAR_BODIES,
  CHAMP_ALL,
  CHAMP_AURA_OFF,
  COSMETIC_DURATION_MS,
  encodeEvent,
  isNameSlot,
  isShopListed,
  ITEMS,
  LOOK_MAX_PARTS,
  MAX_MESSAGE_BYTES,
  nameStyleOfLook,
  parseC2S,
  PERMANENT_MULTIPLIER,
  permanentPrice,
  sanitizeLook,
  signGrant,
  signJoinToken,
  staffGateLook,
  verifyGrant,
  verifyJoinToken,
  type ItemDef,
} from "./index";

// 닉네임 꾸미기: 이름 글자(nameColor)·이름표 바탕판(namePlate) 두 부위. 상점(24시간·영구), 착용 증서·입장 토큰으로 다른 사람에게 보인다.

const names = ITEMS.filter((i) => isNameSlot(i.slot));
const byPrefix = (p: string) => names.filter((i) => i.id.startsWith(p));
const prices = (list: readonly ItemDef[]) => list.map((i) => i.price);

describe("닉네임 꾸미기 아이템", () => {
  it("단색 8 · 그라데이션 6 · 빛나고 움직이는 4 (이름 글자) + 바탕판 6 (이름표)", () => {
    expect(byPrefix("nc_").map((i) => i.id)).toEqual(["nc_sakura", "nc_sky", "nc_mint", "nc_lemon", "nc_lilac", "nc_orange", "nc_silver", "nc_dawn"]);
    expect(byPrefix("ng_").map((i) => i.id)).toEqual(["ng_sunset", "ng_sea", "ng_aurora", "ng_peach", "ng_forest", "ng_grape"]);
    expect(byPrefix("nf_").map((i) => i.id)).toEqual(["nf_glow", "nf_rainbow", "nf_stars", "nf_flame"]);
    expect(byPrefix("np_").map((i) => i.id)).toEqual(["np_wood", "np_ribbon", "np_cloud", "np_wreath", "np_tomb", "np_star"]);
    expect(names.length).toBe(24);
    for (const i of names) {
      expect(i.slot).toBe(i.id.startsWith("np_") ? "namePlate" : "nameColor");
      // 다른 캐릭터 꾸미기처럼 24시간 이용권으로 상점에 나오고, 운영자·1위 전용이 아니다
      expect(i.kind).toBe("cosmetic");
      expect(i.durationMs).toBe(COSMETIC_DURATION_MS);
      expect(isShopListed(i)).toBe(true);
      expect(i.staff ?? i.champ).toBeUndefined();
      expect(i.name.length).toBeGreaterThan(0);
      expect(i.desc.length).toBeGreaterThan(0);
    }
  });

  it("값: 단색 < 그라데이션 < 빛나는 이름, 모두 다른 캐릭터 꾸미기 값 범위 안", () => {
    const solid = prices(byPrefix("nc_"));
    const grad = prices(byPrefix("ng_"));
    const fx = prices(byPrefix("nf_"));
    const plate = prices(byPrefix("np_"));
    expect(Math.max(...solid)).toBeLessThan(Math.min(...grad));
    expect(Math.max(...grad)).toBeLessThan(Math.min(...fx));
    const others = ITEMS.filter((i) => i.kind === "cosmetic" && isShopListed(i) && !isNameSlot(i.slot)).map((i) => i.price);
    for (const p of [...solid, ...grad, ...fx, ...plate]) {
      expect(p).toBeGreaterThanOrEqual(Math.min(...others));
      expect(p).toBeLessThanOrEqual(Math.max(...others));
      expect(p % 10).toBe(0);
    }
    expect(solid.every((p) => p <= 100)).toBe(true);
    expect(fx.every((p) => p >= 300 && p <= 480)).toBe(true);
    expect(plate.every((p) => p >= 100 && p <= 240)).toBe(true);
  });

  it("영구 소장 = 24시간 이용권 × PERMANENT_MULTIPLIER (10P 단위)", () => {
    expect(PERMANENT_MULTIPLIER).toBe(4);
    for (const i of names) expect(permanentPrice(i.id)).toBe(Math.round((i.price * PERMANENT_MULTIPLIER) / 10) * 10);
    expect(permanentPrice("nc_sky")).toBe(320);
    expect(permanentPrice("nf_rainbow")).toBe(1680);
    expect(permanentPrice("np_star")).toBe(960);
  });
});

describe("착용 목록 (look)", () => {
  const body = ["hat_cat", "neck_scarf", "back_wings", "hand_lantern", "aura_firefly", "feet_flowers", "pet_ghost"];

  it("몸 7부위 + 이름 글자 + 이름표 = 9개까지, 부위마다 하나", () => {
    expect(LOOK_MAX_PARTS).toBe(9);
    const full = [...body, "nf_rainbow", "np_cloud"];
    expect(sanitizeLook(full)).toEqual(full);
    // 같은 부위 두 번째는 버린다 (이름 글자 둘, 바탕판 둘)
    expect(sanitizeLook([...full, "nc_sky", "np_wood"])).toEqual(full);
    expect(nameStyleOfLook(full)).toEqual({ color: "nf_rainbow", plate: "np_cloud" });
    expect(nameStyleOfLook(["hat_cat"])).toEqual({ color: null, plate: null });
    expect(nameStyleOfLook(["np_star", "nope"])).toEqual({ color: null, plate: "np_star" });
    // 운영자가 아니어도 닉네임 꾸미기는 그대로 (운영자 전용이 아니다)
    expect(staffGateLook(full, false)).toEqual(full);
  });

  it("모르는 꾸미기 id(옛 실시간 서버가 보는 새 닉네임 꾸미기와 같은 처지)는 버리고 나머지는 그대로 받는다", async () => {
    const s = "secret";
    const exp = Math.floor(Date.now() / 1000) + 60;
    // 이 빌드가 모르는 미래 id를 섞어도 증서 전체가 거절되지 않고 그 id만 빠진다
    const g = await verifyGrant(s, await signGrant(s, { kind: "look", visitorId: "v", look: ["hat_cat", "nc_future_glitter", "np_sky_castle", "np_wood"], exp }));
    expect(g).toMatchObject({ kind: "look", look: ["hat_cat", "np_wood"] });
    // 옛 서버(닉네임 꾸미기를 모르는 빌드)의 거르기: 모르는 id를 먼저 버리고 나서 7개로 자르므로 몸 꾸미기는 하나도 잃지 않는다
    const known = new Set(ITEMS.filter((i) => !isNameSlot(i.slot)).map((i) => i.id));
    const oldSanitize = (raw: string[]) => sanitizeLook(raw.filter((id) => known.has(id))).slice(0, 7);
    expect(oldSanitize([...body, "nf_rainbow", "np_cloud"])).toEqual(body);
    expect(oldSanitize(["nc_sky", "np_wood", ...body])).toEqual(body);
  });

  it("가장 긴 착용 증서도 새 실시간 서버 한도(소켓 메시지 512바이트) 안, 닉네임 꾸미기를 빼면 옛 한도(400자) 안", async () => {
    const s = "secret";
    // 부위마다 가장 긴 id + 가장 긴 몸 + 특수 색 세 부위 + 1위 값 전부 = 가장 긴 증서
    const longest = new Map<string, string>();
    for (const i of ITEMS) if (i.kind === "cosmetic" && i.slot && (longest.get(i.slot)?.length ?? 0) < i.id.length) longest.set(i.slot, i.id);
    const look = [...longest.values()];
    expect(look.length).toBe(LOOK_MAX_PARTS);
    const bodyId = [...AVATAR_BODIES].map((b) => b.id).sort((a, b) => b.length - a.length)[0];
    const dye = { head: "#aabbcc~g", body: "#aabbcc~s", accent: "#aabbcc~r" };
    const exp = 1_999_999_999;
    const sign = (l: string[]) => signGrant(s, { kind: "look", visitorId: "V1StGXR8_Z5jdHi6B-myT", look: l, exp, dye, body: bodyId, champ: CHAMP_ALL | CHAMP_AURA_OFF });

    const withNames = await sign(look);
    const wire = encodeEvent({ t: "look", grant: withNames });
    expect(withNames.length).toBeLessThanOrEqual(600);
    expect(wire.length).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(parseC2S(wire)).toEqual({ t: "look", grant: withNames });
    expect(await verifyGrant(s, withNames, exp - 10)).toMatchObject({ look });

    // 닉네임 꾸미기가 없는 사람(옛 화면 포함)은 지금처럼 옛 실시간 서버 한도 안 → 웹을 먼저 올려도 그대로 보인다
    const without = await sign(look.filter((id) => !isNameSlot(ITEMS.find((i) => i.id === id)?.slot)));
    expect(without.length).toBeLessThanOrEqual(400);
  });

  it("가장 긴 입장 토큰(12자 이름·운영자·도감·1위·9부위)도 600자 안, 실시간 서버가 닉네임 꾸미기를 그대로 받는다", async () => {
    const s = "secret";
    const longest = new Map<string, string>();
    for (const i of ITEMS) if (i.kind === "cosmetic" && i.slot && (longest.get(i.slot)?.length ?? 0) < i.id.length) longest.set(i.slot, i.id);
    const look = [...longest.values()];
    const bodyId = [...AVATAR_BODIES].map((b) => b.id).sort((a, b) => b.length - a.length)[0];
    const token = await signJoinToken(s, {
      visitorId: "V1StGXR8_Z5jdHi6B-myT",
      name: "가나다라마바사아자차카타",
      color: "#aabbcc",
      channel: 12,
      look,
      body: bodyId,
      dye: { head: "#aabbcc~g", body: "#aabbcc~s", accent: "#aabbcc~r" },
      staff: true,
      dex: 31,
      champ: 7,
    });
    expect(token.length).toBeLessThanOrEqual(600);
    const claims = await verifyJoinToken(s, token);
    expect(nameStyleOfLook(claims?.look)).toEqual(nameStyleOfLook(look));
    expect(nameStyleOfLook(look).color).not.toBeNull();
  });
});
