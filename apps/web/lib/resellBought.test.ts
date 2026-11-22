import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import { ITEMS, PERMANENT_UNTIL, type CosmeticSlot } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { buyPermanent } from "./dye/service";
import { RESELL_GIFT_BLOCK, resellBlock, resellKindBlock } from "./resell";
import { attendMonthsToCheck, boughtFromLedger, ensureBoughtFill, legacyBought, permanentSellables } from "./resellBought";
import { sellCosmetic } from "./resellService";
import { getStaffStore } from "./staff";
import { getAccounts, getGifts } from "./store";
import { kstDay, loadMe } from "./store/accounts";
import type { GiftTerm } from "./types";

// 11/22 되팔기 「산 기록」: 포인트를 내고 영구로 산 상점 꾸미기만 판다. 선물·보상으로 받은 건 못 판다.
// 저장소 API만 써서 메모리·실제 Redis(일회용 DB 환경변수가 있으면) 둘 다 같은 계약을 본다

/** 되팔 수 있는 종류의 상점 꾸미기 (부위별 하나씩 — 서로 칸이 겹치지 않게) */
const SELLABLE = (() => {
  const seen = new Set<string>();
  const out: { id: string; slot: CosmeticSlot }[] = [];
  for (const it of ITEMS)
    if (it.kind === "cosmetic" && it.slot && !resellKindBlock(it.id) && !seen.has(it.slot)) {
      seen.add(it.slot);
      out.push({ id: it.id, slot: it.slot });
    }
  return out;
})();
const DAY = 86_400_000;

describe("11/22 되팔기 산 기록 — 순수 규칙", () => {
  it("되팔 수 있는 종류가 부위마다 여러 개 있다 (아래 시험이 쓰는 꾸미기)", () => {
    expect(SELLABLE.length).toBeGreaterThanOrEqual(5);
    expect(SELLABLE.map((s) => s.slot)).toEqual(expect.arrayContaining(["head", "neck", "pack"]));
  });

  it("예전부터 가진 것: 산 근거가 있으면 산 것, 선물·보상 근거만 있으면 아님, 근거가 없으면 산 것", () => {
    const owned = ["a", "b", "c", "d"];
    const paid = new Set(["b"]);
    const gifted = new Set(["b", "c"]);
    expect(legacyBought(owned, paid, gifted)).toEqual(["a", "b", "d"]);
    expect(legacyBought([], paid, gifted)).toEqual([]);
  });

  it("구매 근거는 꾸미기 영구 구매 사유 (잡화점·유령선·계절) — 되팔기·동물원·붕어빵·이상한 id는 아님", () => {
    const got = boughtFromLedger(["shop:영구 hat_beanie", "shop:계절 영구 sc_padding", "shop:붕어빵 수레 al_x", "shop:유령선 hat_crown", "shop:동물원 pet_cat", "refund:꾸미기 되팔기(비니)", "shop:영구 Bad Id"]);
    expect([...got].sort()).toEqual(["hat_beanie", "hat_crown", "sc_padding"]);
  });

  it("후보: 영구로 가진(입었거나 벗어 둔) 되팔기 종류만 — 기간제·한정·보상은 뺀다", () => {
    const [a, b] = SELLABLE;
    const now = Date.now();
    const ids = permanentSellables({
      equipped: [{ itemId: a.id, until: PERMANENT_UNTIL }],
      stash: [
        { itemId: b.id, until: now + DAY },
        { itemId: "sc_padding", until: PERMANENT_UNTIL },
        { itemId: "xm_scarf", until: PERMANENT_UNTIL },
      ],
    });
    expect(ids).toEqual([a.id]);
  });

  it("「판매 불가」 까닭: 산 기록이 없으면 「선물로 받은 거라 팔 수 없어요」", () => {
    const [a] = SELLABLE;
    expect(resellBlock(a.id, "stash", PERMANENT_UNTIL, [a.id])).toBeNull();
    expect(resellBlock(a.id, "stash", PERMANENT_UNTIL, [])).toBe(RESELL_GIFT_BLOCK);
    expect(RESELL_GIFT_BLOCK).toBe("선물로 받은 거라 팔 수 없어요.");
  });
});

describe("11/22 되팔기 산 기록 — 서버 흐름", () => {
  const accounts = getAccounts();
  const gifts = getGifts();

  async function account(points = 0): Promise<string> {
    const id = nanoid();
    await accounts.enter(id, { name: "검수", color: "#9fc5a8", body: "hood" }, Date.now() - 60_000);
    if (points) await accounts.adjustPoints(id, points);
    return id;
  }
  /** 관리자 선물 보내고 받기 */
  async function gift(id: string, itemId: string, term: GiftTerm = "perm"): Promise<void> {
    const now = Date.now();
    const giftId = `g_${nanoid(8)}`;
    await gifts.send({ id: giftId, from: "운영자", note: "검수", points: 0, items: [{ itemId, count: 1, term }], createdAt: now - 1000, expiresAt: now + 7 * DAY, target: id, targetName: null });
    const r = await gifts.claim(id, giftId, now - 60_000, now);
    expect(r.ok).toBe(true);
  }
  const bought = async (id: string) => (await loadMe(accounts, id)).bought ?? [];
  const perm = async (id: string, itemId: string) => {
    const a = await accounts.get(id, kstDay(), Date.now());
    return [...a.stash, ...a.equipped].some((e) => e.itemId === itemId && e.until >= PERMANENT_UNTIL);
  };
  /** 출석 도장 28개 (그달 28일 구간 영구 보상을 받을 수 있게). 메모리 저장소만 — Redis면 false */
  function stamp28(id: string, month: string): boolean {
    const mem = accounts as unknown as { accts?: Map<string, { calInit?: boolean; lastAttend?: string | null; calendar?: Map<string, Map<string, number>> }> };
    const a = mem.accts?.get(id);
    if (!a) return false;
    a.calInit = true;
    // 28일을 찍었으면 마지막 출석도 그달 (11/22 채우기는 마지막 출석 달까지만 달력을 본다 — attendMonthsToCheck)
    a.lastAttend = `${month}28`;
    (a.calendar ??= new Map()).set(month, new Map(Array.from({ length: 28 }, (_, i) => [String(i + 1).padStart(2, "0"), 10] as [string, number])));
    return true;
  }
  const rich = (n = 3) => SELLABLE.slice(0, n).reduce((s, x) => s + 100_000 + 0 * x.id.length, 0);

  it("산 것 → 팔 수 있고, 팔면 산 기록도 지운다 → 같은 걸 선물로 다시 받으면 못 판다", async () => {
    const [a] = SELLABLE;
    const id = await account(rich());
    const r = await buyPermanent(id, a.id);
    expect(r.me.bought).toContain(a.id);
    await sellCosmetic(id, a.id);
    expect(await bought(id)).not.toContain(a.id);
    await gift(id, a.id);
    expect(await perm(id, a.id)).toBe(true);
    expect(await bought(id)).not.toContain(a.id);
    await expect(sellCosmetic(id, a.id)).rejects.toMatchObject({ code: "NOT_SELLABLE", message: RESELL_GIFT_BLOCK });
    expect(await perm(id, a.id)).toBe(true);
  });

  it("선물로 받은 상점 꾸미기는 못 판다 (가방 「판매 불가 · 선물로 받은 거라 팔 수 없어요」)", async () => {
    const [, b] = SELLABLE;
    const id = await account();
    await gift(id, b.id);
    const me = await loadMe(accounts, id);
    const e = me.stash.find((x) => x.itemId === b.id)!;
    expect(resellBlock(b.id, "stash", e.until, me.bought)).toBe(RESELL_GIFT_BLOCK);
    const p0 = me.points;
    await expect(sellCosmetic(id, b.id)).rejects.toMatchObject({ code: "NOT_SELLABLE", message: RESELL_GIFT_BLOCK });
    expect((await loadMe(accounts, id)).points).toBe(p0);
  });

  it("산 뒤 같은 걸 영구 선물로 또 받으면(중복) 산 기록은 그대로 — 팔 수 있다. 선물 먼저면 살 수 없고 계속 못 판다", async () => {
    const [, , c] = SELLABLE;
    const first = await account(rich());
    await buyPermanent(first, c.id);
    await gift(first, c.id);
    expect(await bought(first)).toContain(c.id);
    await expect(sellCosmetic(first, c.id)).resolves.toMatchObject({ paid: expect.any(Number) });

    const second = await account(rich());
    await gift(second, c.id);
    await expect(buyPermanent(second, c.id)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    expect(await bought(second)).not.toContain(c.id);
  });

  it("기간 선물을 입고 있다가 영구로 사면 산 것 (포인트를 냈다)", async () => {
    const [a] = SELLABLE;
    const id = await account(rich());
    await gift(id, a.id, "7d");
    expect(await bought(id)).not.toContain(a.id);
    await buyPermanent(id, a.id);
    expect(await bought(id)).toContain(a.id);
  });

  it("선물·보상 길은 산 기록을 남기지 않는다 (선물함·출석 구간·운영자 지급·주간 1위·지갑 대여·기간 상자·0P 드롭)", async () => {
    const id = await account();
    await loadMe(accounts, id); // 채우기 끝 (이제부터 받는 건 근거와 상관없이 산 기록이 없어야 한다)
    const now = Date.now();
    const [a, b, c, d, e, f] = SELLABLE;
    await gift(id, a.id);
    if (stamp28(id, kstDay(now).slice(0, 6))) expect(await accounts.grantAttendTier(id, kstDay(now).slice(0, 6), 28, b.id, b.slot, null, now)).toBe(true);
    else await gift(id, b.id);
    expect(await getStaffStore().grant(accounts, id, [{ itemId: c.id, slot: c.slot }], PERMANENT_UNTIL)).toBeGreaterThanOrEqual(0);
    expect(await accounts.grantChamp(id, `t:${nanoid(6)}`, d.id, d.slot, PERMANENT_UNTIL, 0, now)).toBe(true);
    await accounts.walletGrant(id, 0, "earn:test", now, [{ itemId: e.id, slot: e.slot, until: PERMANENT_UNTIL }]);
    expect(await accounts.grantTerm(id, f.id, 3 * DAY, now)).toBe("ok");
    const drop = SELLABLE[6] ?? SELLABLE[0];
    await accounts.buy(id, drop.id, 0, { unique: true, now });
    const me = await loadMe(accounts, id);
    expect(me.bought ?? []).toEqual([]);
    for (const x of [a, b, c, d, e]) {
      expect(await perm(id, x.id), x.id).toBe(true);
      await expect(sellCosmetic(id, x.id), x.id).rejects.toMatchObject({ code: "NOT_SELLABLE", message: RESELL_GIFT_BLOCK });
    }
  });

  it("영구로 가진 꾸미기의 이용권은 쓰지 않는다: 영구 그대로 입히고 이용권은 남는다 (벗어 둠·입는 중 둘 다), 산 기록·되팔기도 그대로", async () => {
    const [a] = SELLABLE;
    const id = await account(rich());
    await buyPermanent(id, a.id);
    const now = Date.now();
    await accounts.buy(id, a.id, 0, { now }); // 이용권 (첫 걸음·선물 이용권처럼 중복 검사 없이)
    const ticket = async () => (await accounts.get(id, kstDay(now), now)).inventory[a.id] ?? 0;
    const worn = async () => (await accounts.get(id, kstDay(now), now)).equipped.find((e) => e.itemId === a.id)?.until;
    expect(await ticket()).toBe(1);
    // 벗어 둔 영구 → 이용권으로 입어도 영구 그대로 입는다
    expect(await accounts.equip(id, a.id, a.slot, now + DAY, now)).toBe(true);
    expect(await worn()).toBe(PERMANENT_UNTIL);
    expect(await ticket()).toBe(1);
    // 입고 있는 영구 → 한 번 더 눌러도 그대로
    expect(await accounts.equip(id, a.id, a.slot, now + DAY, now)).toBe(true);
    expect(await worn()).toBe(PERMANENT_UNTIL);
    expect(await ticket()).toBe(1);
    expect(await bought(id)).toContain(a.id);
    await accounts.unequip(id, a.slot, now);
    expect(await perm(id, a.id)).toBe(true);
    await expect(sellCosmetic(id, a.id)).resolves.toMatchObject({ paid: expect.any(Number) });
    // 영구가 없으면 예전처럼 이용권을 써서 기간제로 입는다
    expect(await accounts.equip(id, a.id, a.slot, now + DAY, now)).toBe(true);
    expect(await worn()).toBe(now + DAY);
    expect(await ticket()).toBe(0);
    expect(await accounts.equip(id, a.id, a.slot, now + DAY, now)).toBe(false);
  });

  it("기간제로 가진 꾸미기를 이용권으로 입으면 남은 기간에 이용 기간이 더해진다 (벗어 둠·입는 중 둘 다, 줄지 않는다)", async () => {
    const [a, b] = SELLABLE;
    const id = await account();
    const now = Date.now();
    const until = async (itemId: string) => {
      const r = await accounts.get(id, kstDay(now), now);
      return [...r.equipped, ...r.stash].find((e) => e.itemId === itemId)?.until;
    };
    const ticket = async (itemId: string) => (await accounts.get(id, kstDay(now), now)).inventory[itemId] ?? 0;
    // 벗어 둔 30일짜리 + 이용권 → 30일 + 하루, 입은 채로
    await gift(id, a.id, "30d");
    const t0 = (await until(a.id))!;
    await accounts.buy(id, a.id, 0, { now });
    expect(await accounts.equip(id, a.id, a.slot, now + DAY, now)).toBe(true);
    expect(await until(a.id)).toBe(t0 + DAY);
    expect(await ticket(a.id)).toBe(0);
    expect((await accounts.get(id, kstDay(now), now)).equipped.some((e) => e.itemId === a.id)).toBe(true);
    // 입고 있는 기간제 + 이용권 → 또 하루
    await accounts.buy(id, a.id, 0, { now });
    expect(await accounts.equip(id, a.id, a.slot, now + DAY, now)).toBe(true);
    expect(await until(a.id)).toBe(t0 + 2 * DAY);
    // 처음 입는 이용권은 지금부터 하루
    await accounts.buy(id, b.id, 0, { now });
    expect(await accounts.equip(id, b.id, b.slot, now + DAY, now)).toBe(true);
    expect(await until(b.id)).toBe(now + DAY);
  });

  it("산 기록 원본은 상점 영구 구매 Lua 하나뿐 (K.bought를 쓰는 곳 — 선물·보상 코드가 넣지 않게)", () => {
    const root = join(__dirname);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !f.endsWith(".test.ts") && /K\.bought\(|bought \?\?= new Set|\.bought\.add\(/.test(readFileSync(p, "utf8"))) hits.push(p.slice(root.length + 1));
      }
    };
    walk(root);
    // style.ts = 영구 구매(PERMANENT_LUA), accounts-*.ts = 읽기·되팔기(SREM)·채우기·메모리 영구 구매(stylePermanent)
    expect(hits.sort()).toEqual(["store/accounts-memory.ts", "store/accounts-redis.ts", "store/style.ts"]);
  });

  it("예전부터 가진 것 채우기: 근거 없음·구매 기록 → 산 것, 선물·출석 영구 보상 → 아님. 한 번만, 동시에 불러도 같다, 그 뒤 선물은 아님", async () => {
    const id = await account(5000);
    const now = Date.now();
    const [a, b, c, d, e] = SELLABLE;
    // 되팔기 전 상태 흉내: 산 기록 없이 영구로 가진 것들 (채우기 전 — loadMe를 아직 안 불렀다)
    expect(await getStaffStore().grant(accounts, id, [{ itemId: a.id, slot: a.slot }], PERMANENT_UNTIL)).toBeGreaterThanOrEqual(0); // 근거 없음 (예전 잡화점 구매)
    await gift(id, b.id); // 관리자 영구 선물
    if (stamp28(id, kstDay(now).slice(0, 6))) expect(await accounts.grantAttendTier(id, kstDay(now).slice(0, 6), 28, c.id, c.slot, null, now)).toBe(true); // 출석 28일 영구
    else await gift(id, c.id);
    // 산 뒤 같은 걸 선물로 또 받은 경우: 구매 기록이 남아 있으면 산 것
    expect(await getStaffStore().grant(accounts, id, [{ itemId: d.id, slot: d.slot }], PERMANENT_UNTIL)).toBeGreaterThanOrEqual(0);
    expect(await accounts.spend(id, 100, `shop:영구 ${d.id}`, now)).not.toBeNull();
    await gift(id, d.id);
    // 기간제는 후보가 아니다
    await gift(id, e.id, "30d");
    const before = await accounts.get(id, kstDay(now), now, { bought: true });
    expect(before.boughtFilled).toBe(false);
    expect(before.bought ?? []).toEqual([]);
    const [m1, m2] = await Promise.all([loadMe(accounts, id), loadMe(accounts, id)]);
    const want = [a.id, d.id].sort();
    expect([...(m1.bought ?? [])].sort()).toEqual(want);
    expect([...(m2.bought ?? [])].sort()).toEqual(want);
    const after = await accounts.get(id, kstDay(now), now, { bought: true });
    expect(after.boughtFilled).toBe(true);
    expect([...(after.bought ?? [])].sort()).toEqual(want);
    // 11/22 산 기록은 원할 때만 읽는다 (이름·가방만 보는 읽기마다 SMEMBERS가 붙지 않게)
    expect((await accounts.get(id, kstDay(now), now)).bought).toBeUndefined();
    // 두 번째 채우기는 하지 않는다
    expect(await accounts.fillBought(id, [b.id])).toBe(false);
    expect(await ensureBoughtFill(accounts, id, after, now)).toEqual(after.bought);
    // 채운 뒤 받은 영구 선물은 산 것이 아니다
    const [, , , , , f] = SELLABLE;
    await gift(id, f.id);
    expect(await bought(id)).not.toContain(f.id);
    await expect(sellCosmetic(id, b.id)).rejects.toMatchObject({ message: RESELL_GIFT_BLOCK });
    await expect(sellCosmetic(id, c.id)).rejects.toMatchObject({ message: RESELL_GIFT_BLOCK });
    await expect(sellCosmetic(id, a.id)).resolves.toMatchObject({ paid: expect.any(Number) });
  });

  it("두 번 눌러도 한 번만 팔고, 파는 중에 같은 선물을 받아도 선물 몫은 못 판다", async () => {
    const [a] = SELLABLE;
    const id = await account(rich());
    await buyPermanent(id, a.id);
    const giftId = `g_${nanoid(8)}`;
    const now = Date.now();
    await gifts.send({ id: giftId, from: "운영자", note: "검수", points: 0, items: [{ itemId: a.id, count: 1, term: "perm" }], createdAt: now - 1000, expiresAt: now + DAY, target: id, targetName: null });
    const [s1, s2, g] = await Promise.allSettled([sellCosmetic(id, a.id), sellCosmetic(id, a.id), gifts.claim(id, giftId, now - 60_000, now)]);
    expect([s1, s2].filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(g.status).toBe("fulfilled");
    const me = await loadMe(accounts, id);
    expect(me.bought ?? []).not.toContain(a.id);
    // 선물이 판 뒤에 들어왔으면 영구로 남아 있고 못 판다, 먼저 들어왔으면(중복 — 그냥 사라짐) 아무것도 없다
    if (await perm(id, a.id)) await expect(sellCosmetic(id, a.id)).rejects.toMatchObject({ message: RESELL_GIFT_BLOCK });
    else await expect(sellCosmetic(id, a.id)).rejects.toMatchObject({ code: "NOT_OWNED" });
  });
});

describe("11/22 채우기가 볼 출석 달 (attendMonthsToCheck)", () => {
  it("출석한 적이 없으면 한 달도 안 보고, 마지막 출석 달보다 뒤 달은 뺀다", () => {
    expect(attendMonthsToCheck("20261122", null)).toEqual([]);
    expect(attendMonthsToCheck("20261122", "")).toEqual([]);
    expect(attendMonthsToCheck("20261122", "20261122")).toEqual(["202611", "202610", "202609", "202608", "202607"]);
    expect(attendMonthsToCheck("20261122", "20260915")).toEqual(["202609", "202608", "202607"]);
    expect(attendMonthsToCheck("20261122", "20250101")).toEqual([]);
  });
});
