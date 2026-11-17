import { describe, expect, it } from "vitest";
import { speciesById, npcBuys, NPCS } from "../forage/catalog";
import { candidates } from "../forage/rules";
import { eatSpicy, FEATHER_CHANCE, FEATHER_ID, gullHotLevel, gullHotOver, heldHot, holdHot, hotLevel, HOT_FADE_MS, HOT_MS, HOT_RAMP_MS, RED_FEATHER_ID, rollFeather, SNACK, SNACK_DAY_LIMIT, type GullHot, SNACK_NO_LIMIT, SNACK_HOLD_MAX, RED_FEATHER_SHARE } from "./gull";
import { MemoryGullStore } from "./gullStore";

// 11/17 포구 갈매기 과자 순수 규칙 · 저장소
describe("갈매기 과자 (gull)", () => {
  // 11/17 하루 한도는 풀었다 (사용자 요청) — 과자 값이 깃털 기대값보다 훨씬 커서 사도 포인트를 버는 길이 안 생겨야 한다
  it("값은 작고 매운 과자가 조금 더 비싸요 · 하루 한도는 사실상 없어요 · 사서 던져도 포인트가 늘지 않아요", () => {
    expect(SNACK.plain.price).toBe(5);
    expect(SNACK.spicy.price).toBeGreaterThan(SNACK.plain.price);
    expect(SNACK.spicy.price).toBeLessThanOrEqual(10);
    expect(SNACK_DAY_LIMIT).toBeGreaterThanOrEqual(SNACK_NO_LIMIT);
    const red = speciesById(RED_FEATHER_ID)!.price;
    const plain = speciesById(FEATHER_ID)!.price;
    expect(FEATHER_CHANCE * plain).toBeLessThan(SNACK.plain.price);
    expect(FEATHER_CHANCE * ((1 - RED_FEATHER_SHARE) * plain + RED_FEATHER_SHARE * red)).toBeLessThan(SNACK.spicy.price);
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

  it("저장소: 하루 10개를 넘어도 사져요 · 들고 있는 상한에서 멈춰요 · 물리기, 쓰기", async () => {
    const s = new MemoryGullStore();
    for (let i = 0; i < 12; i++) expect((await s.buy("a", "20261117", "plain")).status).toBe("ok");
    for (let i = 0; i < 4; i++) expect((await s.buy("a", "20261117", "spicy")).status).toBe("ok");
    for (let i = 12; i < SNACK_HOLD_MAX; i++) await s.buy("a", "20261117", "plain");
    expect((await s.buy("a", "20261117", "plain")).status).toBe("full");
    expect((await s.buy("a", "20261118", "spicy")).status).toBe("ok"); // 다음 날
    await s.unbuy("a", "20261118", "spicy");
    expect(await s.get("a", "20261118")).toEqual({ plain: SNACK_HOLD_MAX, spicy: 4, bought: 0 });
    expect(await s.take("a", "20261117", "spicy")).toEqual({ plain: SNACK_HOLD_MAX, spicy: 3, bought: SNACK_HOLD_MAX + 4 });
    expect(await s.get("a", "20261117")).toMatchObject({ spicy: 3, bought: SNACK_HOLD_MAX + 4 });
    const e = new MemoryGullStore();
    expect(await e.take("b", "20261117", "plain")).toBeNull();
  });

  // 11/17 r2 사용자 "빨간 갈매기가 매운 과자를 또 먹으러 오다 하얘진 뒤 먹었어요"
  it("빨간 갈매기가 매운 과자를 또 먹으면 하얘지지 않고 빨간 채로 30초를 다시 세요", () => {
    let h: GullHot | null = eatSpicy(null, 0);
    // 처음엔 하얀 데서 0.6초에 걸쳐 빨개져요
    expect(gullHotLevel(h, 0)).toBe(0);
    expect(gullHotLevel(h, HOT_RAMP_MS)).toBe(1);
    // 20초 뒤 다시 매운 과자: 먹는 순간에도 꽉 찬 빨강 · 거기서 30초
    h = eatSpicy(h, 20_000);
    for (let t = 20_000; t <= 20_000 + HOT_MS - HOT_FADE_MS; t += 50) expect(gullHotLevel(h, t), `${t}`).toBe(1);
    expect(gullHotOver(h, 20_000 + HOT_MS - 1)).toBe(false);
    expect(gullHotOver(h, 20_000 + HOT_MS)).toBe(true);
    // 빠지는 중(마지막 4초)에 먹어도 바로 꽉 찬 빨강
    const fading = eatSpicy(null, 0);
    const t1 = HOT_MS - 1000;
    expect(gullHotLevel(fading, t1)).toBeLessThan(1);
    expect(gullHotLevel(eatSpicy(fading, t1), t1)).toBe(1);
    // 다 하얘진 뒤엔 다시 0.6초에 걸쳐
    expect(gullHotLevel(eatSpicy(fading, HOT_MS + 10), HOT_MS + 10)).toBe(0);
  });

  it("매운 과자를 먹으러 오는 동안 빨간 갈매기는 빨간 채로 (시간이 끝나거나 빠지지 않아요)", () => {
    const h = eatSpicy(null, 0);
    // 29초째(빠지는 중)에 불려 와서 3초 동안 날아와요 → 오는 동안 내내 꽉 찬 빨강, 먹으면 또 30초
    const call = HOT_MS - 1000;
    const held = holdHot(h, call, true);
    expect(held).not.toBeNull();
    for (let t = call; t <= call + 3000; t += 50) expect(gullHotLevel(heldHot(held!, t), t), `${t}`).toBe(1);
    const ate = eatSpicy(heldHot(held!, call + 3000), call + 3000);
    expect(gullHotLevel(ate, call + 3000 + HOT_MS - HOT_FADE_MS - 1)).toBe(1);
    // 받아먹지 못하고 떠나면 멈췄던 데서 다시 흘러요 (곧 빠지기 시작해요 — 30초가 다시 늘지는 않아요)
    const left = heldHot(held!, call + 3000);
    expect(gullHotOver(left, call + 3000 + HOT_FADE_MS + 2)).toBe(true);
    // 일반 과자를 먹으러 오면 붙잡지 않아요 (빨간 시간이 끝날 때까지 빨강)
    expect(holdHot(h, call, false)).toBeNull();
    // 하얀 갈매기는 매운 과자를 먹으러 와도 하얀 채로 (먹고 나서 빨개져요)
    expect(holdHot(null, call, true)).toBeNull();
    expect(holdHot(h, HOT_MS + 5, true)).toBeNull();
  });

  it("빨간 정도: 0.6초에 빨개지고 마지막 4초에 돌아와요 (예전 값 그대로)", () => {
    expect(hotLevel(300)).toBeCloseTo(0.5);
    expect(hotLevel(300, false)).toBe(1);
    expect(hotLevel(HOT_MS - HOT_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(hotLevel(HOT_MS)).toBe(0);
  });
});
