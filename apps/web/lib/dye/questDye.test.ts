import { nanoid } from "nanoid";
import { DYE_SPECIALS, dyeSpecialOf, isShopListed, itemById, verifyGrant } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { loadMe } from "../store/accounts";
import { directDyeMode, DYE_PICK_SWATCHES, isDyeTicketId, randomTier, SPECIAL_DYE_BASE, specialDyeColor } from "./rules";
import { DyeFixedSchema, DyePickSchema, DyeSpecialSchema, DyeStartSchema } from "./schemas";
import { applyFixedDye, applyPickDye, applySpecialDye, startDye } from "./service";

// 11/15 수집 의뢰 염색권: 색 확정(q_dye_pick) · 특수색 확정(q_dye_special) — 판·조준 없이 고른 색 그대로, 1장 소모

describe("11/15 수집 의뢰 염색권 규칙", () => {
  it("카탈로그: 둘 다 염색권(가방 개수)이고 상점에 없으며, 판·고정 색 흐름에 들어가지 않는다", () => {
    for (const id of ["q_dye_pick", "q_dye_special"]) {
      const it = itemById(id)!;
      expect(it.kind).toBe("dye");
      expect(it.quest).toBe(true);
      expect(isShopListed(it)).toBe(false);
      expect(isDyeTicketId(id)).toBe(true);
      expect(randomTier(id)).toBeNull();
      expect(DyeStartSchema.safeParse({ itemId: id, part: "head" }).success).toBe(false);
      expect(DyeFixedSchema.safeParse({ itemId: id, part: "head" }).success).toBe(false);
    }
    expect(directDyeMode("q_dye_pick")).toBe("pick");
    expect(directDyeMode("q_dye_special")).toBe("special");
    expect(directDyeMode("dye_basic")).toBeNull();
  });

  it("색 확정 요청: 보통 색만 (대소문자 맞춤), 특수 색·형식 틀림·다른 염색권은 거절", () => {
    expect(DyePickSchema.parse({ itemId: "q_dye_pick", part: "body", color: "#A1B2C3" }).color).toBe("#a1b2c3");
    expect(DyePickSchema.safeParse({ itemId: "q_dye_pick", part: "body", color: "#a1b2c3~g" }).success).toBe(false);
    expect(DyePickSchema.safeParse({ itemId: "q_dye_pick", part: "body", color: "a1b2c3" }).success).toBe(false);
    expect(DyePickSchema.safeParse({ itemId: "q_dye_pick", part: "body", color: "#fff" }).success).toBe(false);
    expect(DyePickSchema.safeParse({ itemId: "q_dye_pick", part: "Feet!", color: "#a1b2c3" }).success).toBe(false);
    expect(DyePickSchema.safeParse({ itemId: "dye_basic", part: "body", color: "#a1b2c3" }).success).toBe(false);
    expect(DyePickSchema.safeParse({ itemId: "q_dye_special", part: "body", color: "#a1b2c3" }).success).toBe(false);
    for (const c of DYE_PICK_SWATCHES) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("특수색 확정 요청: 특수 색 4종만, 바탕 색은 같은 값이면 늘 같다 (금빛 광택은 늘 금빛)", () => {
    for (const k of DYE_SPECIALS) expect(DyeSpecialSchema.safeParse({ itemId: "q_dye_special", part: "head", kind: k }).success).toBe(true);
    expect(DyeSpecialSchema.safeParse({ itemId: "q_dye_special", part: "head", kind: "x" }).success).toBe(false);
    expect(DyeSpecialSchema.safeParse({ itemId: "q_dye_pick", part: "head", kind: "g" }).success).toBe(false);
    expect(specialDyeColor("g", "#123456")).toBe(`${SPECIAL_DYE_BASE.g}~g`);
    expect(specialDyeColor("s", "#123456")).toBe("#123456~s");
    expect(specialDyeColor("n", "#123456~r")).toBe("#123456~n");
    expect(specialDyeColor("r", undefined)).toBe(`${SPECIAL_DYE_BASE.r}~r`);
    expect(specialDyeColor("s", "bogus")).toBe(`${SPECIAL_DYE_BASE.s}~s`);
    for (const k of DYE_SPECIALS) expect(dyeSpecialOf(specialDyeColor(k, null))).toBe(k);
  });
});

describe.skipIf(!!env.redis())("11/15 수집 의뢰 염색권 서버 흐름 (메모리)", () => {
  const accounts = getAccounts();
  async function account(items: Record<string, number> = {}): Promise<string> {
    const id = nanoid();
    await accounts.enter(id, { name: "검수", color: "#9fc5a8", body: "hood" }, Date.now() - 60_000);
    for (const [itemId, n] of Object.entries(items)) for (let i = 0; i < n; i++) {
      await accounts.adjustPoints(id, 10);
      await accounts.buy(id, itemId, 10);
    }
    return id;
  }

  it("색 확정: 가방에 없으면 NO_ITEM, 있으면 정확히 1장 쓰고 그 색 (증서에도 실린다)", async () => {
    const none = await account();
    await expect(applyPickDye(none, "q_dye_pick", "head", "#336699")).rejects.toMatchObject({ code: "NO_ITEM" });
    const id = await account({ q_dye_pick: 2 });
    // 다른 염색권 id · 특수 표시 색은 서버에서도 거절 (염색권은 그대로)
    await expect(applyPickDye(id, "dye_basic", "head", "#336699")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(applyPickDye(id, "q_dye_pick", "head", "#336699~g")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect((await loadMe(accounts, id)).inventory.q_dye_pick).toBe(2);
    const r = await applyPickDye(id, "q_dye_pick", "head", "#336699");
    expect(r).toMatchObject({ color: "#336699", part: "head" });
    expect(r.me.dye).toEqual({ head: "#336699" });
    expect(r.me.inventory.q_dye_pick).toBe(1);
    const g = await verifyGrant(env.joinSecret(), r.lookGrant);
    expect(g?.kind === "look" && g.dye).toEqual({ head: "#336699" });
    await applyPickDye(id, "q_dye_pick", "body", "#ffeeaa");
    await expect(applyPickDye(id, "q_dye_pick", "accent", "#000000")).rejects.toMatchObject({ code: "NO_ITEM" });
    expect((await loadMe(accounts, id)).inventory.q_dye_pick ?? 0).toBe(0);
    // 다른 흐름(판·고정 색)으로는 쓸 수 없다
    const other = await account({ q_dye_pick: 1, q_dye_special: 1 });
    await expect(startDye(other, "q_dye_pick", "head")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(applyFixedDye(other, "q_dye_special", "head")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("특수색 확정: 1장 쓰고 '#바탕~종류' — 염색한 부위는 그 바탕 색을 이어받고, 금빛 광택은 늘 금빛", async () => {
    const none = await account();
    await expect(applySpecialDye(none, "q_dye_special", "body", "s")).rejects.toMatchObject({ code: "NO_ITEM" });
    const id = await account({ q_dye_pick: 1, q_dye_special: 3 });
    await expect(applySpecialDye(id, "q_dye_special", "body", "x" as "s")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(applySpecialDye(id, "q_dye_pick", "body", "s")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await applyPickDye(id, "q_dye_pick", "body", "#2266cc");
    const a = await applySpecialDye(id, "q_dye_special", "body", "s");
    expect(a.color).toBe("#2266cc~s");
    expect(a.me.inventory.q_dye_special).toBe(2);
    const b = await applySpecialDye(id, "q_dye_special", "head", "n");
    expect(b.color).toBe(`${SPECIAL_DYE_BASE.n}~n`);
    const c = await applySpecialDye(id, "q_dye_special", "body", "g");
    expect(c.color).toBe(`${SPECIAL_DYE_BASE.g}~g`);
    expect(c.me.dye).toEqual({ body: `${SPECIAL_DYE_BASE.g}~g`, head: `${SPECIAL_DYE_BASE.n}~n` });
    expect(c.me.inventory.q_dye_special ?? 0).toBe(0);
    await expect(applySpecialDye(id, "q_dye_special", "accent", "r")).rejects.toMatchObject({ code: "NO_ITEM" });
  });
});
