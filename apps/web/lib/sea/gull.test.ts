import { describe, expect, it } from "vitest";
import { speciesById, npcBuys, NPCS } from "../forage/catalog";
import { candidates } from "../forage/rules";
import { FEATHER_CHANCE, FEATHER_ID, hotLevel, HOT_MS, RED_FEATHER_ID, rollFeather, SNACK, SNACK_DAY_LIMIT } from "./gull";
import { MemoryGullStore } from "./gullStore";

// 11/17 포구 갈매기 과자 순수 규칙 · 저장소
describe("갈매기 과자 (gull)", () => {
  it("값은 작고 매운 과자가 조금 더 비싸요 · 하루 10개", () => {
    expect(SNACK.plain.price).toBe(5);
    expect(SNACK.spicy.price).toBeGreaterThan(SNACK.plain.price);
    expect(SNACK.spicy.price).toBeLessThanOrEqual(10);
    expect(SNACK_DAY_LIMIT).toBe(10);
  });

  it("깃털은 10%로만, 매운 과자는 그중 일부가 붉은 깃털", () => {
    expect(rollFeather("plain", FEATHER_CHANCE, 0)).toBeNull();
    expect(rollFeather("plain", 0.05, 0)).toBe(FEATHER_ID);
    expect(rollFeather("spicy", 0.05, 0.1)).toBe(RED_FEATHER_ID);
    expect(rollFeather("spicy", 0.05, 0.9)).toBe(FEATHER_ID);
    // 붉은 깃털은 매운 과자에서만
    for (let i = 0; i < 100; i++) expect(rollFeather("plain", 0.01, i / 100)).toBe(FEATHER_ID);
  });

  it("깃털은 발굴품 칸 · 수집가가 사요 · 값은 작게 (붉은 쪽이 조금 더) · 채집·낚시로는 안 나와요", () => {
    const a = speciesById(FEATHER_ID)!;
    const b = speciesById(RED_FEATHER_ID)!;
    expect([a.cat, b.cat]).toEqual(["dig", "dig"]);
    expect(b.price).toBeGreaterThan(a.price);
    expect(b.rarity).toBeGreaterThan(a.rarity);
    expect(a.price).toBeLessThanOrEqual(3);
    expect(b.price).toBeLessThanOrEqual(10);
    expect(NPCS.some((n) => npcBuys(n, a) && npcBuys(n, b))).toBe(true);
    const cond = { phase: "day", weather: "clear", season: "autumn" } as const;
    for (const w of ["flat", "lakeside", "meadow", "forest", "hill", "sea"] as const) {
      expect(candidates("dig", w === "sea" ? "flat" : w, cond as never).map((s) => s.id)).not.toContain(FEATHER_ID);
      expect(candidates("fish", w, cond as never).map((s) => s.id)).not.toContain(FEATHER_ID);
    }
  });

  it("빨간 갈매기는 30초 빨갛고 서서히 돌아와요", () => {
    expect(hotLevel(-1)).toBe(0);
    expect(hotLevel(5_000)).toBe(1);
    expect(hotLevel(HOT_MS - 2_000)).toBeGreaterThan(0);
    expect(hotLevel(HOT_MS - 2_000)).toBeLessThan(1);
    expect(hotLevel(HOT_MS)).toBe(0);
  });

  it("저장소: 하루 둘 합쳐 10개, 물리기, 쓰기", async () => {
    const s = new MemoryGullStore();
    for (let i = 0; i < 6; i++) expect((await s.buy("a", "20261117", "plain")).status).toBe("ok");
    for (let i = 0; i < 4; i++) expect((await s.buy("a", "20261117", "spicy")).status).toBe("ok");
    expect((await s.buy("a", "20261117", "plain")).status).toBe("limit");
    expect((await s.buy("a", "20261118", "plain")).status).toBe("ok"); // 다음 날
    await s.unbuy("a", "20261118", "plain");
    expect(await s.get("a", "20261118")).toEqual({ plain: 6, spicy: 4, bought: 0 });
    expect(await s.take("a", "spicy")).toBe(true);
    expect(await s.get("a", "20261117")).toMatchObject({ spicy: 3, bought: 10 });
    const e = new MemoryGullStore();
    expect(await e.take("b", "plain")).toBe(false);
  });
});
