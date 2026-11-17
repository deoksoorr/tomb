import { describe, expect, it } from "vitest";
import { PERMANENT_UNTIL, XMAS_BOX_ID, XMAS_SET_IDS } from "@tomb/protocol";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import type { MemoryAccounts } from "../store/accounts-memory";
import { XMAS_BOX_FALLBACK } from "./box";
import { openXmasBox } from "./service";

// 크리스마스 선물상자 열기 (메모리 저장소): 상자 1개씩 빠지고, 같은 꾸미기는 두 번 나오지 않고, 다 모으면 별 폭죽

const NOW = Date.UTC(2026, 11, 24, 12);

async function freshAccount(boxes: number): Promise<string> {
  const id = `xmas${Math.random().toString(36).slice(2)}`.padEnd(21, "x").slice(0, 21);
  const accounts = getAccounts() as unknown as MemoryAccounts;
  await accounts.enter(id, {}, NOW);
  accounts.deposit(id, 0, [{ itemId: XMAS_BOX_ID, count: boxes }], NOW);
  return id;
}

async function owned(id: string): Promise<Set<string>> {
  const a = await getAccounts().get(id, kstDay(NOW), NOW);
  return new Set([...a.equipped, ...a.stash].filter((e) => e.until >= PERMANENT_UNTIL).map((e) => e.itemId));
}

describe("크리스마스 선물상자 열기", () => {
  it("열 때마다 상자가 하나씩 줄고, 같은 꾸미기는 다시 나오지 않는다 (같은 roll이어도)", async () => {
    const id = await freshAccount(XMAS_SET_IDS.length + 1);
    const got: string[] = [];
    for (let i = 0; i < XMAS_SET_IDS.length; i++) {
      const r = await openXmasBox(id, NOW, 0);
      expect(r.prize.kind).toBe("cosmetic");
      if (r.prize.kind === "cosmetic") got.push(r.prize.id);
      expect(r.left).toBe(XMAS_SET_IDS.length - i);
      expect(r.me.inventory[XMAS_BOX_ID] ?? 0).toBe(r.left);
    }
    expect([...got].sort()).toEqual([...XMAS_SET_IDS].sort());
    expect([...(await owned(id))].filter((x) => XMAS_SET_IDS.includes(x)).sort()).toEqual([...XMAS_SET_IDS].sort());
    // 다 모은 뒤 마지막 상자 = 별 폭죽 3개
    const last = await openXmasBox(id, NOW, 0.5);
    expect(last.prize).toEqual({ kind: "fallback", ...XMAS_BOX_FALLBACK });
    expect(last.me.inventory[XMAS_BOX_FALLBACK.itemId]).toBe(XMAS_BOX_FALLBACK.count);
    expect(last.left).toBe(0);
    await expect(openXmasBox(id, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it("상자가 없으면 409", async () => {
    const id = await freshAccount(0);
    await expect(openXmasBox(id, NOW)).rejects.toMatchObject({ status: 409 });
  });
});
