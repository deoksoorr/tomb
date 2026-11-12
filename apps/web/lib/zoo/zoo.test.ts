import { nanoid } from "nanoid";
import { PERMANENT_UNTIL, petPrice, verifyGrant } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { ShopBuySchema } from "../validate";
import { ZooBuySchema } from "./schemas";
import { buyPet } from "./service";

// 동물원 사육사 펫 분양 (로컬 메모리 저장소 — Redis Lua는 같은 규칙으로 lib/store/style.ts PERMANENT_LUA)

describe("요청 검증", () => {
  it("동물원 펫만 받고, 상점은 펫을 팔지 않는다", () => {
    expect(ZooBuySchema.safeParse({ petId: "pet_deer" }).success).toBe(true);
    expect(ZooBuySchema.safeParse({ petId: "hat_crown" }).success).toBe(false);
    expect(ZooBuySchema.safeParse({ petId: "pet_deer", price: 1 }).data).toEqual({ petId: "pet_deer" }); // 가격은 서버 값
    expect(ShopBuySchema.safeParse({ itemId: "pet_cat" }).success).toBe(false);
    expect(ShopBuySchema.safeParse({ itemId: "hat_cat" }).success).toBe(true);
  });
});

describe.skipIf(!!env.redis())("동물원 펫 분양 (메모리)", () => {
  const accounts = getAccounts();
  async function account(points: number): Promise<string> {
    const id = nanoid();
    await accounts.enter(id, { name: "검수", color: "#9fc5a8", body: "hood" }, Date.now() - 60_000);
    await accounts.adjustPoints(id, points);
    return id;
  }

  it("영구로 사면 바로 데리고 다니고(착용 증서), 데리고 다니던 펫은 집(벗어 둔 꾸미기)으로 — 한 번에 한 마리", async () => {
    const id = await account(9_999);
    const now = Date.now();
    const r = await buyPet(id, "pet_cat", now);
    expect(r.me.points).toBe(9_999 - petPrice("pet_cat")!);
    expect(r.me.equipped.find((e) => e.itemId === "pet_cat")?.until).toBe(PERMANENT_UNTIL);
    const g = await verifyGrant(env.joinSecret(), r.lookGrant, Math.floor(now / 1000));
    expect(g?.kind === "look" && g.look).toContain("pet_cat");
    // 두 번째 펫: 고양이는 집으로, 새 펫을 데리고 다닌다
    await accounts.adjustPoints(id, 9_999);
    const r2 = await buyPet(id, "pet_slime", now);
    expect(r2.me.equipped.filter((e) => e.itemId.startsWith("pet_")).map((e) => e.itemId)).toEqual(["pet_slime"]);
    expect(r2.me.stash.find((e) => e.itemId === "pet_cat")?.until).toBe(PERMANENT_UNTIL);
    // 집에 두기 → 바꾸기 (입기·벗기는 다른 꾸미기와 같다)
    expect(await accounts.unequip(id, "pet", now)).toBe(true);
    expect(await accounts.wear(id, "pet_cat", "pet", now)).toBe(true);
    const later = await accounts.get(id, kstDay(), now + 400 * 86_400_000);
    expect(later.equipped.find((e) => e.itemId === "pet_cat")?.until).toBe(PERMANENT_UNTIL);
    expect(later.stash.find((e) => e.itemId === "pet_slime")?.until).toBe(PERMANENT_UNTIL);
  });

  it("이미 가족이면 다시 못 사고, 포인트가 모자라면 그대로 (차감 없음)", async () => {
    const id = await account(9_999);
    const now = Date.now();
    await buyPet(id, "pet_hound", now);
    const before = (await accounts.get(id, kstDay(), now)).points;
    await expect(buyPet(id, "pet_hound", now)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    await expect(buyPet(id, "pet_deer", now)).rejects.toMatchObject({ code: "NOT_ENOUGH_POINTS" });
    expect((await accounts.get(id, kstDay(), now)).points).toBe(before);
    await expect(buyPet(id, "hat_crown", now)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("예전에 산 기간제 펫: 입고 있으면 그대로 영구가 되고, 남은 기간제는 사기 전까지 그대로 남는다", async () => {
    const id = await account(9_999);
    const now = Date.now();
    await accounts.adjustPoints(id, 100);
    await accounts.buy(id, "pet_dog", 100);
    await accounts.equip(id, "pet_dog", "pet", now + 86_400_000, now);
    expect((await accounts.get(id, kstDay(), now)).equipped.find((e) => e.itemId === "pet_dog")?.until).toBe(now + 86_400_000);
    const r = await buyPet(id, "pet_dog", now);
    expect(r.me.equipped.find((e) => e.itemId === "pet_dog")?.until).toBe(PERMANENT_UNTIL);
  });
});
