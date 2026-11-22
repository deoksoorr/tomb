import { nanoid } from "nanoid";
import { DYE_COLOR_SLOT_PRICES, isShopListed, ITEMS, PERMANENT_UNTIL, permanentPrice, verifyGrant, type CosmeticSlot } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { CHAIR_SHOP_DISCOUNT } from "../chairPerks";
import { CHAMP_SHOP_DISCOUNT } from "../champPerks";
import { env } from "../env";
import { resellBlock, resellBuyNote, resellKindBlock, resellPrice } from "../resell";
import { sellCosmetic } from "../resellService";
import { getAccounts } from "../store";
import { kstDay, loadMe } from "../store/accounts";
import { discountedPrice } from "../titles";
import { DYE_CENTER } from "./palette";
import { dyeTargetBlock, dyeTargetName } from "./rules";
import { DyePickSchema, DyeResetSchema, DyeSelectSchema, DyeStartSchema } from "./schemas";
import { applyPickDye, applySpecialDye, buyColorSlot, buyPermanent, finishDye, selectItemColor, startDye } from "./service";

// 11/22 입은 꾸미기 염색 (아이템마다 색 + 색 보관함) · 옷·등 칸 나눔 · 꾸미기 되팔기

describe("11/22 아이템 염색 규칙", () => {
  it("대상: 캐릭터 부위는 늘 되고, 아이템은 가진 염색 가능 꾸미기만 (11/22 날개는 되고, 연은 「못 바꿔요」)", () => {
    const owns = (id: string) => id !== "hat_cap";
    expect(dyeTargetBlock("head", owns)).toBeNull();
    expect(dyeTargetBlock("hat_beanie", owns)).toBeNull();
    expect(dyeTargetBlock("hat_cap", owns)).toBe("가진 꾸미기만 염색할 수 있어요.");
    expect(dyeTargetBlock("back_wings_angel", owns)).toBeNull();
    expect(dyeTargetBlock("q_back_kite", owns)).toBe("이 꾸미기는 색을 바꿀 수 없어요.");
    expect(dyeTargetBlock("hand_coffee", owns)).toBe("염색할 수 없는 꾸미기예요.");
    expect(dyeTargetName("body")).toBe("몸");
    expect(dyeTargetName("sc_padding")).toBe("무릎까지 롱패딩");
  });

  it("요청 검증: 아이템 id·칸 번호를 받고, 되돌리기(150P)는 캐릭터 부위만", () => {
    expect(DyeStartSchema.safeParse({ itemId: "dye_basic", part: "sc_padding", slot: 2 }).success).toBe(true);
    expect(DyeStartSchema.safeParse({ itemId: "dye_basic", part: "sc_padding", slot: 3 }).success).toBe(false);
    expect(DyeStartSchema.safeParse({ itemId: "dye_basic", part: "Bad Id" }).success).toBe(false);
    expect(DyePickSchema.safeParse({ itemId: "q_dye_pick", part: "hat_beanie", color: "#112233" }).success).toBe(true);
    expect(DyeResetSchema.safeParse({ part: "hat_beanie" }).success).toBe(false);
    expect(DyeSelectSchema.safeParse({ item: "hat_beanie", sel: -1 }).success).toBe(true);
    expect(DyeSelectSchema.safeParse({ item: "hat_beanie", sel: 3 }).success).toBe(false);
  });
});

describe("11/22 꾸미기 되팔기 규칙", () => {
  it("정가(영구 값)의 30% 내림, 칭호·포인트왕·회장님 할인이 가장 커도 판 값 < 낸 값", () => {
    const maxDiscount = Math.max(CHAMP_SHOP_DISCOUNT, CHAIR_SHOP_DISCOUNT, 0.3);
    for (const it of ITEMS) {
      if (resellKindBlock(it.id)) continue;
      const perm = permanentPrice(it.id)!;
      expect(resellPrice(it.id), it.id).toBe(Math.floor(perm * 0.3));
      expect(resellPrice(it.id), it.id).toBeLessThan(discountedPrice(perm, maxDiscount));
    }
    expect(resellPrice("hat_crown")).toBe(Math.floor(permanentPrice("hat_crown")! * 0.3));
  });

  it("상점 꾸미기 영구만: 기간 한정·보상·기간제·입는 중은 「판매 불가」와 까닭", () => {
    const OWN = ["hat_beanie", "sc_padding", "kd_coat", "gh_capt", "xm_scarf", "q_back_cape", "champ_crown", "u_hat_siren", "staff_robe"];
    expect(resellBlock("hat_beanie", "stash", PERMANENT_UNTIL, OWN)).toBeNull();
    expect(resellBlock("hat_beanie", "worn", PERMANENT_UNTIL, OWN)).toBe("입고 있어서 팔 수 없어요. 먼저 벗어 주세요.");
    expect(resellBlock("hat_beanie", "stash", Date.now() + 3_600_000, OWN)).toBe("기간제라 팔 수 없어요.");
    expect(resellBlock("hat_beanie", "new", null, OWN)).toBe("기간제라 팔 수 없어요.");
    expect(resellBlock("sc_padding", "stash", PERMANENT_UNTIL, OWN)).toBe("기간 한정이라 팔 수 없어요.");
    expect(resellBlock("kd_coat", "stash", PERMANENT_UNTIL, OWN)).toBe("기간 한정이라 팔 수 없어요.");
    expect(resellBlock("gh_capt", "stash", PERMANENT_UNTIL, OWN)).toBe("기간 한정이라 팔 수 없어요.");
    for (const id of ["xm_scarf", "q_back_cape", "champ_crown", "u_hat_siren", "staff_robe"]) expect(resellBlock(id, "stash", PERMANENT_UNTIL, OWN), id).toBe("보상으로 받은 거라 팔 수 없어요.");
    // 11/22 산 기록이 없으면(선물·보상으로 받은 상점 꾸미기) 「선물로 받은 거라」
    expect(resellBlock("hat_beanie", "stash", PERMANENT_UNTIL, [])).toBe("선물로 받은 거라 팔 수 없어요.");
    expect(resellBlock("hat_beanie", "worn", PERMANENT_UNTIL, undefined)).toBe("선물로 받은 거라 팔 수 없어요.");
    expect(resellBlock("hat_beanie", "stash", Date.now() + 3_600_000, [])).toBe("기간제라 팔 수 없어요.");
    expect(resellBlock("sc_padding", "stash", PERMANENT_UNTIL, [])).toBe("기간 한정이라 팔 수 없어요.");
    // 11/22 되팔기는 상점 자세히 보기에서만: 산 영구 꾸미기는 벗어 두면 팔고, 입고 있으면 「입고 있어서」 (선물은 위 「선물로 받은」)
    expect(resellBlock("hat_beanie", "stash", PERMANENT_UNTIL, ["hat_beanie"])).toBeNull();
    expect(resellBlock("hat_beanie", "worn", PERMANENT_UNTIL, ["hat_beanie"])).toBe("입고 있어서 팔 수 없어요. 먼저 벗어 주세요.");
    expect(resellBuyNote("hat_beanie")).toBe("영구로 사면 나중에 정가의 30%로 팔 수 있어요.");
    expect(resellBuyNote("sc_padding")).toBe("한정 판매라 나중에 팔 수 없어요.");
    // 팔 수 있는 꾸미기는 모두 잡화점에서 파는 것
    for (const it of ITEMS) if (it.kind === "cosmetic" && !resellKindBlock(it.id)) expect(isShopListed(it), it.id).toBe(true);
  });
});

describe.skipIf(!!env.redis())("11/22 아이템 염색·색 보관함·옷/등·되팔기 서버 흐름 (메모리)", () => {
  const accounts = getAccounts();
  const DAY = 86_400_000;
  async function account(items: Record<string, number> = {}, points = 0): Promise<string> {
    const id = nanoid();
    await accounts.enter(id, { name: "검수", color: "#9fc5a8", body: "hood" }, Date.now() - 60_000);
    for (const [itemId, n] of Object.entries(items))
      for (let i = 0; i < n; i++) {
        await accounts.adjustPoints(id, 1000);
        await accounts.buy(id, itemId, 1000);
      }
    if (points) await accounts.adjustPoints(id, points);
    return id;
  }
  async function wear(id: string, itemId: string, slot: CosmeticSlot) {
    const now = Date.now();
    await accounts.adjustPoints(id, 1000);
    await accounts.buy(id, itemId, 1000);
    expect(await accounts.equip(id, itemId, slot, now + DAY, now)).toBe(true);
  }
  const count = async (id: string, itemId: string) => (await accounts.get(id, kstDay(), Date.now())).inventory[itemId] ?? 0;
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;

  it("색 확정: 안 가진 꾸미기·연은 거절하고 염색권을 쓰지 않는다 → 가진 비니는 1장만 쓰고 그 아이템 색 (입었을 때만 증서에 실린다)", async () => {
    const id = await account({ q_dye_pick: 2 });
    await expect(applyPickDye(id, "q_dye_pick", "hat_beanie", "#e03030")).rejects.toMatchObject({ code: "NOT_DYEABLE", message: "가진 꾸미기만 염색할 수 있어요." });
    await wear(id, "q_back_kite", "pack");
    await expect(applyPickDye(id, "q_dye_pick", "q_back_kite", "#e03030")).rejects.toMatchObject({ code: "NOT_DYEABLE", message: "이 꾸미기는 색을 바꿀 수 없어요." });
    expect(await count(id, "q_dye_pick")).toBe(2);
    // 가방에 새것으로만 있어도 가진 것 → 칠할 수 있다 (입지 않았으니 다른 사람에게는 아직 안 보낸다)
    await accounts.adjustPoints(id, 1000);
    await accounts.buy(id, "hat_beanie", 1000);
    const r = await applyPickDye(id, "q_dye_pick", "hat_beanie", "#e03030");
    expect(r).toMatchObject({ color: "#e03030", part: "hat_beanie" });
    expect(r.me.dye).toEqual({ items: { hat_beanie: "#e03030" } });
    expect(r.me.itemDyes).toEqual({ hat_beanie: { colors: ["#e03030"], sel: 0 } });
    expect(r.me.inventory.q_dye_pick).toBe(1);
    const g0 = await verifyGrant(env.joinSecret(), r.lookGrant);
    expect(g0?.kind === "look" && g0.dye).toEqual({});
    await accounts.equip(id, "hat_beanie", "head", Date.now() + DAY, Date.now());
    const me = await loadMe(accounts, id);
    const { lookGrant } = await import("../store/accounts");
    const g = await verifyGrant(env.joinSecret(), await lookGrant(env.joinSecret(), id, me.equipped.map((e) => e.itemId), Date.now(), me));
    expect(g?.kind === "look" && g.dye).toEqual({ items: { hat_beanie: "#e03030" } });
  });

  it("아이템마다 색이 남는다: 롱패딩 파랑 → 코트로 갈아입었다가 다시 롱패딩이면 파랑 그대로", async () => {
    const id = await account({ q_dye_pick: 1 });
    await wear(id, "sc_padding", "back");
    await applyPickDye(id, "q_dye_pick", "sc_padding", "#3050e0");
    await wear(id, "kd_coat", "back");
    expect((await loadMe(accounts, id)).dye).toEqual({ items: { sc_padding: "#3050e0" } });
    expect(await accounts.wear(id, "sc_padding", "back", Date.now())).toBe(true);
    const me = await loadMe(accounts, id);
    expect(me.equipped.map((e) => e.itemId)).toContain("sc_padding");
    expect(me.dye?.items?.sc_padding).toBe("#3050e0");
  });

  it("색 보관함: 처음 칠하면 커스텀 1, 2번째 500P·3번째 1,500P, 빈 칸은 못 입고, 원래 색은 공짜로 오간다", async () => {
    const id = await account({ q_dye_pick: 3 }, 8000);
    await wear(id, "hat_beanie", "head");
    await applyPickDye(id, "q_dye_pick", "hat_beanie", "#e03030");
    // 원래 색 ↔ 커스텀 1 (무료)
    const p0 = await points(id);
    const orig = await selectItemColor(id, "hat_beanie", -1);
    expect(orig.me.dye?.items).toBeUndefined();
    expect(orig.me.itemDyes?.hat_beanie).toEqual({ colors: ["#e03030"], sel: -1 });
    expect((await selectItemColor(id, "hat_beanie", 0)).me.dye?.items).toEqual({ hat_beanie: "#e03030" });
    expect(await points(id)).toBe(p0);
    // 칸 사기 (500P) → 빈 칸은 고를 수 없다
    expect(DYE_COLOR_SLOT_PRICES).toEqual([0, 500, 1500]);
    const b2 = await buyColorSlot(id, "hat_beanie");
    expect(b2.me.itemDyes?.hat_beanie).toEqual({ colors: ["#e03030", null], sel: 0 });
    expect(await points(id)).toBe(p0 - 500);
    await expect(selectItemColor(id, "hat_beanie", 1)).rejects.toMatchObject({ code: "EMPTY_SLOT" });
    // 2번 칸에 칠하면 그 칸을 입는다, 1번 칸 색은 그대로
    const d2 = await applyPickDye(id, "q_dye_pick", "hat_beanie", "#20a040", Date.now(), 1);
    expect(d2.me.itemDyes?.hat_beanie).toEqual({ colors: ["#e03030", "#20a040"], sel: 1 });
    expect(d2.me.dye?.items).toEqual({ hat_beanie: "#20a040" });
    // 열지 않은 칸에는 칠할 수 없다 (염색권은 그대로)
    await expect(applyPickDye(id, "q_dye_pick", "hat_beanie", "#000000", Date.now(), 2)).rejects.toMatchObject({ code: "NO_SLOT" });
    expect(await count(id, "q_dye_pick")).toBe(1);
    await buyColorSlot(id, "hat_beanie");
    expect(await points(id)).toBe(p0 - 2000);
    await expect(buyColorSlot(id, "hat_beanie")).rejects.toMatchObject({ code: "MAX_SLOTS" });
    // 포인트가 모자라면 칸을 못 산다
    const poor = await account({ q_dye_pick: 1 });
    await wear(poor, "neck_knit", "neck");
    await accounts.adjustPoints(poor, -(await points(poor)));
    await expect(buyColorSlot(poor, "neck_knit")).rejects.toMatchObject({ code: "NOT_ENOUGH_POINTS" });
  });

  it("무작위·특수색 염색권도 아이템에: 1장만 쓰고 칸에 칠한다", async () => {
    const id = await account({ dye_basic: 1, q_dye_special: 1 });
    await wear(id, "back_jacket", "back");
    await expect(startDye(id, "dye_basic", "q_back_kite")).rejects.toMatchObject({ code: "NOT_DYEABLE" });
    expect(await count(id, "dye_basic")).toBe(1);
    const t0 = Date.now();
    const s = await startDye(id, "dye_basic", "back_jacket", t0);
    expect(s.session).toMatchObject({ part: "back_jacket", slot: 0 });
    expect(s.me.inventory.dye_basic ?? 0).toBe(0);
    const done = await finishDye(id, s.session.seed, DYE_CENTER.x, DYE_CENTER.y, t0 + 1000);
    expect(done.me.itemDyes?.back_jacket).toEqual({ colors: [done.color], sel: 0 });
    const sp = await applySpecialDye(id, "q_dye_special", "back_jacket", "s");
    expect(sp.color).toBe(`${done.color!.slice(0, 7)}~s`);
  });

  it("옷(back)과 등(pack)을 같이 입는다 · 예전 back 칸에 입혀 둔 등 꾸미기는 읽을 때 pack 칸으로 옮겨진다", async () => {
    const id = await account();
    await wear(id, "sc_padding", "back");
    await wear(id, "back_wings_butterfly", "pack");
    const worn = (await loadMe(accounts, id)).equipped.map((e) => e.itemId);
    expect(worn).toEqual(expect.arrayContaining(["sc_padding", "back_wings_butterfly"]));
    // 옛 저장: back 칸에 배낭 (pack 칸 없음)
    const old = await account();
    const mem = accounts as unknown as { accts: Map<string, { look: Map<string, { itemId: string; until: number }> }> };
    mem.accts.get(old)!.look.set("back", { itemId: "back_backpack", until: Date.now() + DAY });
    const before = await accounts.get(old, kstDay(), Date.now());
    expect(before.equipped.map((e) => e.itemId)).toEqual(["back_backpack"]);
    expect(mem.accts.get(old)!.look.get("pack")?.itemId).toBe("back_backpack");
    expect(mem.accts.get(old)!.look.has("back")).toBe(false);
    // 이제 옷을 입어도 배낭은 그대로
    await wear(old, "kd_coat", "back");
    expect((await loadMe(accounts, old)).equipped.map((e) => e.itemId)).toEqual(expect.arrayContaining(["back_backpack", "kd_coat"]));
  });

  it("되팔기: 영구 소장만 정가의 30%, 입고 있으면 거절, 두 번 눌러도 한 번만, 염색 기록·색 보관함도 사라진다", async () => {
    const id = await account({ q_dye_pick: 1 }, permanentPrice("hat_beanie")! + 1000);
    const bought = await buyPermanent(id, "hat_beanie");
    expect(bought.me.stash.some((e) => e.itemId === "hat_beanie" && e.until === PERMANENT_UNTIL)).toBe(true);
    await applyPickDye(id, "q_dye_pick", "hat_beanie", "#e03030");
    expect(await accounts.wear(id, "hat_beanie", "head", Date.now())).toBe(true);
    await expect(sellCosmetic(id, "hat_beanie")).rejects.toMatchObject({ code: "WORN" });
    await accounts.unequip(id, "head", Date.now());
    const p0 = await points(id);
    const [a, b] = await Promise.allSettled([sellCosmetic(id, "hat_beanie"), sellCosmetic(id, "hat_beanie")]);
    const ok = [a, b].filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    expect([a, b].find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "NOT_OWNED" } });
    expect(await points(id)).toBe(p0 + resellPrice("hat_beanie"));
    const me = await loadMe(accounts, id);
    expect(me.stash.some((e) => e.itemId === "hat_beanie")).toBe(false);
    expect(me.itemDyes?.hat_beanie).toBeUndefined();
    expect(me.dye?.items).toBeUndefined();
    // 기간제·한정은 못 판다
    const term = await account();
    await wear(term, "hat_cap", "head");
    await accounts.unequip(term, "head", Date.now());
    await expect(sellCosmetic(term, "hat_cap")).rejects.toMatchObject({ code: "NOT_OWNED" });
    await expect(sellCosmetic(term, "sc_padding")).rejects.toMatchObject({ code: "NOT_SELLABLE", message: "기간 한정이라 팔 수 없어요." });
  });
});
