import { nanoid } from "nanoid";
import { PERMANENT_UNTIL } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "./index";
import { kstDay } from "./accounts";
import { RedisStaff } from "./staff";
import { getStyleStore, RedisStyle, type DyeSession } from "./style";

// 46·25·30번 Lua 계약: 실제 Redis(일회용 DB)에서만 (메모리 쪽은 lib/dye/dye.test.ts)
const conn = env.redis();

describe.skipIf(!conn)("꾸미기 저장소 (실제 Redis)", () => {
  const accounts = getAccounts();
  const style = getStyleStore(accounts);

  async function account(points: number, items: Record<string, number> = {}): Promise<string> {
    const id = nanoid();
    await accounts.enter(id, { name: "검수", color: "#9fc5a8", body: "hood" }, Date.now());
    await accounts.adjustPoints(id, points);
    for (const [itemId, n] of Object.entries(items))
      for (let i = 0; i < n; i++) {
        await accounts.adjustPoints(id, 1000);
        await accounts.buy(id, itemId, 1000);
      }
    return id;
  }
  const session = (seed: string): DyeSession => ({ seed, tier: 1, part: "body", itemId: "dye_basic", startedAt: 1, endsAt: 60_001 });

  it("판 열기·이어서·끝내기는 한 번만", async () => {
    expect(style).toBeInstanceOf(RedisStyle);
    const id = await account(0, { dye_basic: 1 });
    expect((await style.begin(id, "dye_basic", session("seedA1")))?.resumed).toBe(false);
    expect((await style.begin(id, "dye_basic", session("seedB2")))?.session.seed).toBe("seedA1");
    expect(await style.finish(id, "seedB2", "#112233")).toBe(false);
    expect(await style.finish(id, "seedA1", "#112233")).toBe(true);
    expect(await style.finish(id, "seedA1", "#445566")).toBe(false);
    expect(await style.get(id)).toEqual({ dye: { body: "#112233" }, session: null, bodies: [] });
    expect(await style.begin(id, "dye_basic", session("seedC3"))).toBeNull();
  });

  it("되돌리기·외형 바꾸기는 포인트와 한 번에", async () => {
    const id = await account(60);
    expect(await style.reset(id, "head", 50, "shop:t", Date.now())).toBe("same");
    await style.finish(id, "x", "#000000");
    const now = Date.now();
    const unlock = { price: 40, reason: "shop:외형 선택권(t)" };
    expect(await style.reshape(id, "hood", now)).toBe("same");
    // 처음 6종끼리는 무료
    expect(await style.reshape(id, "cat", now)).toBe("ok");
    expect(await style.reshape(id, "suit", now, { price: 100, reason: "shop:t" })).toBe("insufficient");
    expect(await style.reshape(id, "suit", now, unlock)).toBe("unlocked");
    // 소장한 프리미엄은 기본 외형과 오가도 무료 (다시 선택권 값을 받지 않는다)
    expect(await style.reshape(id, "hood", now)).toBe("ok");
    expect(await style.reshape(id, "suit", now, unlock)).toBe("ok");
    const a = await accounts.get(id, kstDay(), now);
    expect(a.body).toBe("suit");
    expect(a.points).toBe(20);
    expect((await style.get(id)).bodies).toEqual(["suit"]);
  });

  it("영구 꾸미기: 입은 하루권은 그대로 영구로, 이미 영구·가방 이용권은 거절", async () => {
    const id = await account(2000);
    const now = Date.now();
    await accounts.buy(id, "hat_crown", 120);
    await accounts.equip(id, "hat_crown", "head", now + 86_400_000, now);
    expect(await style.buyPermanent(id, "hat_crown", "head", 840, PERMANENT_UNTIL, "shop:t", now)).toBe("ok");
    expect(await style.buyPermanent(id, "hat_crown", "head", 840, PERMANENT_UNTIL, "shop:t", now)).toBe("owned");
    expect((await accounts.get(id, kstDay(), now)).equipped.find((e) => e.itemId === "hat_crown")?.until).toBe(PERMANENT_UNTIL);
    await accounts.buy(id, "hat_halo", 40);
    expect(await style.buyPermanent(id, "hat_halo", "head", 280, PERMANENT_UNTIL, "shop:t", now)).toBe("ticket");
    expect(await style.buyPermanent(id, "pet_ghost", "pet", 99_999, PERMANENT_UNTIL, "shop:t", now)).toBe("insufficient");
  });

  it("운영자 전용 꾸미기 채우기: 빠진 것만 영구로, 입은 것은 그 자리에서 영구로, 없는 계정은 -1", async () => {
    const staff = new RedisStaff(conn!);
    const id = await account(0);
    const now = Date.now();
    await accounts.adjustPoints(id, 1000);
    await accounts.buy(id, "hat_crown", 120);
    await accounts.equip(id, "hat_crown", "head", now + 86_400_000, now);
    const items = [
      { itemId: "hat_crown", slot: "head" },
      { itemId: "staff_robe", slot: "back" },
    ];
    expect(await staff.grant(accounts, id, items, PERMANENT_UNTIL)).toBe(2);
    expect(await staff.grant(accounts, id, items, PERMANENT_UNTIL)).toBe(0);
    const a = await accounts.get(id, kstDay(), now);
    expect(a.equipped.find((e) => e.itemId === "hat_crown")?.until).toBe(PERMANENT_UNTIL);
    expect(a.stash.find((e) => e.itemId === "staff_robe")?.until).toBe(PERMANENT_UNTIL);
    expect(await staff.grant(accounts, nanoid(), items, PERMANENT_UNTIL)).toBe(-1);
  });
});
