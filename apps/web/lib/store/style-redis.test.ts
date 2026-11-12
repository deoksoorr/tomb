import { nanoid } from "nanoid";
import { PERMANENT_UNTIL } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "./index";
import { kstDay } from "./accounts";
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
    expect(await style.get(id)).toEqual({ dye: { body: "#112233" }, session: null });
    expect(await style.begin(id, "dye_basic", session("seedC3"))).toBeNull();
  });

  it("되돌리기·외형 바꾸기는 포인트와 한 번에", async () => {
    const id = await account(60);
    expect(await style.reset(id, "head", 50, "shop:t", Date.now())).toBe("same");
    await style.finish(id, "x", "#000000");
    expect(await style.reshape(id, "hood", 50, "shop:t", Date.now())).toBe("same");
    expect(await style.reshape(id, "cat", 50, "shop:t", Date.now())).toBe("ok");
    expect(await style.reshape(id, "bun", 50, "shop:t", Date.now())).toBe("insufficient");
    const a = await accounts.get(id, kstDay(), Date.now());
    expect(a.body).toBe("cat");
    expect(a.points).toBe(10);
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
});
