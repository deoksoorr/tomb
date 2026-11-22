import { describe, expect, it } from "vitest";
import {
  DYE_PART_NAMES,
  DYE_PARTS,
  DYE_SPECIAL_NAMES,
  DYE_SPECIALS,
  GEAR_DYE_SEPARATE,
  DYE_COLOR_SLOT_PRICES,
  DYE_COLOR_SLOTS_MAX,
  dyeOfTarget,
  isCharDyePart,
  isDyeableCosmetic,
  packItemDye,
  sanitizeLook,
  b64urlDecode,
  unpackItemDye,
  withDyeTarget,
  wornDye,
  wornDyeItems,
  dyeHex,
  dyeSpecialOf,
  hasDye,
  isDyeColor,
  normalizeDyeColor,
  withDyeSpecial,
  isPermanentUntil,
  isShopListed,
  ITEMS,
  itemById,
  packDye,
  PERMANENT_MULTIPLIER,
  PERMANENT_UNTIL,
  permanentPrice,
  sanitizeDye,
  signGrant,
  signJoinToken,
  sameDye,
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
    expect(sanitizeDye({ head: "#AABBCC", body: "red", accent: "#123456", wing: "#ffffff" })).toEqual({ accent: "#123456" });
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

describe("11/22 입은 꾸미기 염색 (아이템마다 색)", () => {
  const OLD_PARTS = ["head", "body", "accent"];
  // 옛 클라이언트·옛 실시간 서버의 unpackDye (32자 넘으면 통째로 버리고, 앞 세 칸만 읽는다)
  const oldUnpack = (s: unknown) => {
    if (typeof s !== "string" || !s || s.length > 32) return {};
    return Object.fromEntries(s.split(".").flatMap((v, i) => (i < 3 && /^[0-9a-f]{6}$/.test(v) ? [[OLD_PARTS[i], `#${v}`]] : [])));
  };
  // 옛 sanitizeDye(객체): 아는 세 부위만
  const oldSanitize = (o: Record<string, unknown>) => Object.fromEntries(OLD_PARTS.flatMap((p) => (typeof o[p] === "string" && /^#[0-9a-f]{6}$/.test(o[p] as string) ? [[p, o[p]]] : [])));
  const payload = (t: string) => JSON.parse(new TextDecoder().decode(b64urlDecode(t.slice(0, t.indexOf(".")))!)) as Record<string, unknown>;

  it("캐릭터 3부위 형식은 예전 그대로, 아이템 색은 따로 왕복한다", () => {
    expect(DYE_PARTS).toEqual(["head", "body", "accent"]);
    expect(packDye({ head: "#aabbcc", accent: "#f4a7b9", items: { hat_beanie: "#112233" } })).toBe("aabbcc..f4a7b9");
    const items = { sc_padding: "#3050e0~s", hat_beanie: "#e03030" };
    expect(packItemDye(items)).toBe("hat_beanie:e03030,sc_padding:3050e0~s");
    expect(unpackItemDye(packItemDye(items))).toEqual(items);
    expect(unpackItemDye(packItemDye(items), ["hat_beanie"])).toEqual({ hat_beanie: "#e03030" });
    expect(unpackItemDye("Bad-Id:112233,hat_cap:zz,neck_knit:aabbcc")).toEqual({ neck_knit: "#aabbcc" });
    expect(hasDye({ items: { hat_cap: "#000000" } })).toBe(true);
    expect(hasDye({ items: {} })).toBe(false);
    expect(sameDye({ items: { hat_cap: "#111111" } }, { items: { hat_cap: "#111111" } })).toBe(true);
    expect(sameDye({ items: { hat_cap: "#111111" } }, {})).toBe(false);
    expect(sanitizeDye({ head: "#aabbcc", items: { hat_cap: "#112233", "x y": "#112233", neck_knit: "red" } })).toEqual({ head: "#aabbcc", items: { hat_cap: "#112233" } });
    expect(wornDye({ body: "#123456", items: { hat_cap: "#112233", sc_padding: "#445566" } }, ["sc_padding"])).toEqual({ body: "#123456", items: { sc_padding: "#445566" } });
    expect(withDyeTarget({ items: { hat_cap: "#112233" } }, "hat_cap", null)).toEqual({});
    expect(withDyeTarget({}, "head", "#010203")).toEqual({ head: "#010203" });
    expect(dyeOfTarget({ items: { hat_cap: "#112233" } }, "hat_cap")).toBe("#112233");
    expect(isCharDyePart("hat_cap")).toBe(false);
  });

  it("토큰·증서: 캐릭터는 dye(옛 형식), 입은 아이템 색은 idye — 옛 실시간 서버는 캐릭터 색을 그대로 읽고, 착용 목록에 없는 아이템 색은 버린다", async () => {
    const s = "secret";
    const dye = { body: "#112233", items: { hat_beanie: "#e03030", sc_padding: "#3050e0~s", hat_cap: "#000000" } };
    const tok = await signJoinToken(s, { visitorId: "v", name: "n", color: "#e8d9b0", channel: 1, look: ["hat_beanie", "sc_padding"], dye });
    expect(payload(tok)).toMatchObject({ dye: ".112233.", idye: "hat_beanie:e03030,sc_padding:3050e0~s" });
    expect(oldUnpack(payload(tok).dye)).toEqual({ body: "#112233" });
    expect((await verifyJoinToken(s, tok))?.dye).toEqual({ body: "#112233", items: { hat_beanie: "#e03030", sc_padding: "#3050e0~s" } });
    const onlyItem = await signJoinToken(s, { visitorId: "v", name: "n", color: "#e8d9b0", channel: 1, look: ["back_jacket"], dye: { items: { back_jacket: "#3050e0" } } });
    expect(payload(onlyItem)).not.toHaveProperty("dye");
    expect((await verifyJoinToken(s, onlyItem))?.dye).toEqual({ items: { back_jacket: "#3050e0" } });

    const exp = Math.floor(Date.now() / 1000) + 60;
    const g = await signGrant(s, { kind: "look", visitorId: "v", look: ["hat_beanie", "sc_padding", "back_wings_butterfly"], exp, dye });
    const wire = payload(g);
    expect(wire.dye).toBe(".112233.");
    expect(wire.idye).toBe("hat_beanie:e03030,sc_padding:3050e0~s");
    expect(await verifyGrant(s, g)).toEqual({ kind: "look", visitorId: "v", look: ["hat_beanie", "sc_padding", "back_wings_butterfly"], exp, dye: { body: "#112233", items: { hat_beanie: "#e03030", sc_padding: "#3050e0~s" } } });
    // 길이: 입은 4칸 모두 긴 id + 특수 색이어도 짧다 (11/22 날개도 실린다 — 가장 긴 날개 id)
    expect(packItemDye({ hat_headphones: "#aabbcc~g", neck_bandana: "#aabbcc~g", back_milkcape: "#aabbcc~g", back_camppack: "#aabbcc~g" }).length).toBeLessThan(130);
    const wingWire = packItemDye({ hat_headphones: "#aabbcc~g", neck_bandana: "#aabbcc~g", back_milkcape: "#aabbcc~g", back_wings_butterfly: "#aabbcc~g" });
    expect(wingWire.length).toBeLessThan(130);
    expect(unpackItemDye(wingWire, ["hat_headphones", "neck_bandana", "back_milkcape", "back_wings_butterfly"])).toMatchObject({ back_wings_butterfly: "#aabbcc~g" });
    // 11/22 날개 색은 착용 증서 idye로 다른 사람에게 간다
    const wg = await signGrant(s, { kind: "look", visitorId: "v", look: ["back_wings_angel"], exp, dye: { items: { back_wings_angel: "#e03030~r" } } });
    expect(payload(wg).idye).toBe("back_wings_angel:e03030~r");
    expect((await verifyGrant(s, wg))).toMatchObject({ dye: { items: { back_wings_angel: "#e03030~r" } } });
    // 되돌림(빈 염색)은 dye ""만, idye 없음
    const reset = await signGrant(s, { kind: "look", visitorId: "v", look: [], exp, dye: {} });
    expect(payload(reset)).toMatchObject({ dye: "" });
    expect(payload(reset)).not.toHaveProperty("idye");
    // 실시간 서버가 보낸 염색 객체에 items가 있어도 옛 클라이언트는 아는 세 부위만 본다
    expect(oldSanitize({ head: "#aabbcc", items: { hat_cap: "#112233" } })).toEqual({ head: "#aabbcc" });
  });

  it("머리·목·옷·등 꾸미기는 한정·운영자 것까지 기본으로 모두 염색된다 (noDye 표시·시트 밖 연·순위·수집 의뢰 보상만 빠진다 — 11/22 날개는 된다)", () => {
    for (const it of ITEMS) {
      if (it.kind !== "cosmetic") continue;
      const gear = it.slot === "head" || it.slot === "neck" || it.slot === "back" || it.slot === "pack";
      expect(isDyeableCosmetic(it.id), it.id).toBe(gear && !it.noDye && !it.champ && !it.chair && !it.urgent && !it.quest && !GEAR_DYE_SEPARATE.has(it.id));
    }
    expect(ITEMS.filter((i) => i.noDye)).toEqual([]);
    for (const id of ["hat_crown", "hat_cat", "kd_coat", "sc_padding", "staff_robe", "back_cape", "back_backpack", "si_sack", "neck_medal", "back_wings", "back_wings_bat", "back_wings_butterfly", "back_wings_angel", "back_wings_dragon", "of_a4wings"]) expect(isDyeableCosmetic(id), id).toBe(true);
    expect([...GEAR_DYE_SEPARATE]).toEqual(["q_back_kite"]);
    for (const id of ["q_back_kite", "champ_crown", "champ_duo_ph", "chair_crown", "chair_band", "u_hat_siren", "q_back_cape", "hand_coffee", "aura_firefly", "pet_ghost", "dye_basic", "nope", null]) expect(isDyeableCosmetic(id), String(id)).toBe(false);
    for (const id of GEAR_DYE_SEPARATE) expect(itemById(id)?.slot, id).toBe("pack");
  });

  it("옷(back)·등(pack) 칸: 몸에 입는 옷과 등에 메는 것은 같이 입는다", () => {
    expect(itemById("sc_padding")?.slot).toBe("back");
    expect(itemById("back_wings_butterfly")?.slot).toBe("pack");
    expect(itemById("back_backpack")?.slot).toBe("pack");
    expect(sanitizeLook(["sc_padding", "back_wings_butterfly", "back_backpack"])).toEqual(["sc_padding", "back_wings_butterfly"]);
    expect(wornDyeItems(["sc_padding", "back_wings_butterfly", "hat_beanie"])).toEqual([
      { slot: "head", id: "hat_beanie", dyeable: true },
      { slot: "back", id: "sc_padding", dyeable: true },
      { slot: "pack", id: "back_wings_butterfly", dyeable: true },
    ]);
    expect(DYE_COLOR_SLOTS_MAX).toBe(3);
    expect(DYE_COLOR_SLOT_PRICES).toEqual([0, 500, 1500]);
  });
});

describe("46번 염색권·30번 영구 코디 카탈로그", () => {
  it("무작위 염색권 여덟 종류, 값 순으로 놓이고 처음 세 등급은 비쌀수록 높다", () => {
    // 11/15 수집 의뢰 보상(색 확정·특수색 확정)은 상점 염색권이 아니다 (판·조준 없음, 값 0)
    const dyes = ITEMS.filter((i) => i.kind === "dye" && !i.quest);
    expect(dyes.map((i) => i.dye?.mode === "random" && i.dye.tier)).toEqual([1, 4, 5, 6, 2, 7, 3, 8]);
    for (let i = 1; i < dyes.length; i++) expect(dyes[i].price).toBeGreaterThanOrEqual(dyes[i - 1].price);
    const price = (t: number) => dyes.find((d) => d.dye?.mode === "random" && d.dye.tier === t)!.price;
    expect(price(1)).toBeLessThan(price(2));
    expect(price(2)).toBeLessThan(price(3));
    // 경제 표: 100 ~ 600P 안 (입문 허들 낮춤)
    expect(Math.min(...dyes.map((d) => d.price))).toBe(100);
    expect(Math.max(...dyes.map((d) => d.price))).toBeLessThanOrEqual(600);
  });
  it("영구 가격은 24시간 이용권의 4배(10 단위 반올림), 상점에서 파는 코디는 모두 영구로 살 수 있다", () => {
    const perm = (id: string) => Math.round((itemById(id)!.price * 4) / 10) * 10;
    expect(PERMANENT_MULTIPLIER).toBe(4);
    expect(permanentPrice("hat_crown")).toBe(perm("hat_crown"));
    expect(permanentPrice("neck_scarf")).toBe(perm("neck_scarf"));
    expect(permanentPrice("hat_straw")).toBe(perm("hat_straw"));
    expect(permanentPrice("fw_small")).toBeNull();
    for (const it of ITEMS) {
      const p = permanentPrice(it.id);
      if (it.staff) expect(p, it.id).toBe(0);
      else if (it.kind === "cosmetic" && it.slot && isShopListed(it)) expect(p, it.id).toBe(perm(it.id));
      // 펫(동물원 전용)·폭죽·묘비 꾸미기·디자인권·확성기·염색권은 영구로 팔지 않는다
      else expect(p, it.id).toBeNull();
    }
    for (const it of ITEMS) if (it.kind === "decor") expect(permanentPrice(it.id), it.id).toBeNull();
    expect(isPermanentUntil(PERMANENT_UNTIL)).toBe(true);
    expect(isPermanentUntil(Date.now() + 86_400_000)).toBe(false);
  });
});
