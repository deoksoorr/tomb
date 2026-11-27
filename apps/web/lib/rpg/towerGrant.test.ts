import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";
import { WALLET_MAX } from "../economy";
import { getAccounts, refundPoints } from "../store";
import { kstDay } from "../store/accounts";
import { potionSaleValue } from "./character";
import { grantTowerRun } from "./service";
import { isChestFloor, splitChestPotions, TOWER_CHEST_FROM, towerChestDrops, towerRunPoints } from "./tower";
import { getRpgStore } from "./store";

// 11/15 관리자 대신 정산: 서버가 잘못 거절한 판을 판 끝과 같은 정산으로 (최고 층·초월 판·우두머리 상자)

describe("야근 빌딩 대신 정산 (관리자)", () => {
  it(`1층부터 30층을 깬 판: 최고 층 30, 우두머리 상자는 ${TOWER_CHEST_FROM}층부터라 그 위 우두머리 층만(11/19), 초월 EXP`, async () => {
    const a = `towergrant-${nanoid(8)}`;
    await getRpgStore().update(a, (s) => ({ state: { ...s, level: 50, exp: 0 }, result: null }));
    const r = await grantTowerRun(a, { start: 1, floors: 30, floorMs: 950_000 });
    expect(r.reward.tower?.best).toBe(30);
    expect(r.reward.tower?.newBest).toBe(true);
    expect(r.reward.tower?.chests).toEqual(Array.from({ length: 30 }, (_, i) => i + 1).filter(isChestFloor));
    expect(r.reward.transcend?.exp ?? 0).toBeGreaterThan(0);
    const s = await getRpgStore().get(a);
    expect(s.fBest).toBe(30);
  });

  it("11/27 51층부터 20층(상자 55·60·65·70층): 55층 물약만 가방에, 60층부터 물약은 되팔기 값으로 바로 (두 번 세지 않는다)", async () => {
    const a = `towergrant-${nanoid(8)}`;
    await getRpgStore().update(a, (s) => ({ state: { ...s, level: 50, exp: 0 }, result: null }));
    const bag0 = Object.values((await getRpgStore().get(a)).potions).reduce((x, n) => x + n, 0);
    // 대신 정산은 상자 시드를 Math.random으로 굴린다 → 고정해서 같은 굴림을 다시 계산한다
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.37);
    let r: Awaited<ReturnType<typeof grantTowerRun>>;
    try {
      r = await grantTowerRun(a, { start: 51, floors: 20, floorMs: 900_000 });
    } finally {
      spy.mockRestore();
    }
    const seed = Math.floor(0.37 * 2 ** 31);
    expect(r.reward.tower?.chests).toEqual([55, 60, 65, 70]);
    const sold: Record<string, number> = {};
    for (const f of [60, 65, 70]) for (const [id, n] of Object.entries(splitChestPotions(f, towerChestDrops(seed, f, 51)).sold)) sold[id] = (sold[id] ?? 0) + n;
    const nSold = Object.values(sold).reduce((x, n) => x + n, 0);
    expect(nSold).toBeGreaterThanOrEqual(3);
    expect(r.reward.potionSale).toEqual({ count: nSold, points: potionSaleValue(sold) });
    // 가방에 들어간 물약 = 결과 화면 「주운 것」의 물약 = 55층 상자 물약
    const p55 = towerChestDrops(seed, 55, 51).filter((d) => d.kind === "potion").reduce((x, d) => x + d.qty, 0);
    const shown = r.reward.drops.filter((d) => d.kind === "potion").reduce((x, d) => x + d.qty, 0);
    expect(shown).toBe(p55);
    const bag = Object.values((await getRpgStore().get(a)).potions).reduce((x, n) => x + n, 0);
    expect(bag - bag0).toBe(p55);
    // 지갑: 층 포인트 + 물약 값 (한 번씩)
    const wallet = (await getAccounts().get(a, kstDay(), Date.now())).points;
    expect(wallet).toBe(r.reward.points + r.reward.potionSale!.points);
    expect((await getRpgStore().daily(a, kstDay())).points).toBe(wallet);
  });

  it("11/27 60층 아래만 오른 판은 물약을 그대로 가방에 (바로 팔기 없음)", async () => {
    const a = `towergrant-${nanoid(8)}`;
    await getRpgStore().update(a, (s) => ({ state: { ...s, level: 50, exp: 0 }, result: null }));
    const r = await grantTowerRun(a, { start: 51, floors: 9, floorMs: 400_000 });
    expect(r.reward.tower?.chests).toEqual([55]);
    expect(r.reward.potionSale).toBeUndefined();
    expect(r.reward.drops.some((d) => d.kind === "potion")).toBe(true);
  });

  it("11/27 지갑 한도에 막힌 물약 값은 받지 않고 그 물약은 가방에 되돌린다", async () => {
    const a = `towergrant-${nanoid(8)}`;
    await getRpgStore().update(a, (s) => ({ state: { ...s, level: 50, exp: 0, potions: {} }, result: null }));
    const floorPts = towerRunPoints(51, 20, 0).points;
    // 층 포인트까지만 들어갈 자리
    await refundPoints(a, WALLET_MAX - floorPts, "시험");
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.37);
    let r: Awaited<ReturnType<typeof grantTowerRun>>;
    try {
      r = await grantTowerRun(a, { start: 51, floors: 20, floorMs: 900_000 });
    } finally {
      spy.mockRestore();
    }
    expect(r.reward.points).toBe(floorPts);
    const sale = r.reward.potionSale!;
    expect(sale.points).toBe(0);
    expect(sale.count).toBe(0);
    expect(sale.back).toBeGreaterThanOrEqual(3);
    const p55 = r.reward.drops.filter((d) => d.kind === "potion").reduce((x, d) => x + d.qty, 0);
    const bag = Object.values((await getRpgStore().get(a)).potions).reduce((x, n) => x + n, 0);
    expect(bag).toBe(p55 + sale.back!);
    expect((await getAccounts().get(a, kstDay(), Date.now())).points).toBe(WALLET_MAX);
  });
});
