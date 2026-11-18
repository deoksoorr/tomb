import { describe, expect, it } from "vitest";
import { firstReviewId, MemoryReviewStore, REVIEW_MAX, towerReviewId } from "./reviewStore";
import { RunResultSchema } from "./schemas";

// 11/18 관리자 「기록 확인」 저장소: 같은 항목은 한 번만, 꺼내기(인정·거절)는 한 번만, 상한

describe("기록 확인 저장소", () => {
  it("같은 id는 한 번만 들어가고, 꺼내기는 처음 한 번만", async () => {
    const s = new MemoryReviewStore();
    const item = { id: firstReviewId("t_first30", "a"), kind: "first" as const, acct: "a", at: 1, titleId: "t_first30", text: "서버 최초로 30층에 올랐어요!" };
    expect(await s.add(item)).toBe(true);
    expect(await s.add({ ...item, at: 2 })).toBe(false);
    expect(await s.list()).toHaveLength(1);
    const [a, b] = await Promise.all([s.take(item.id), s.take(item.id)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await s.list()).toHaveLength(0);
  });

  it(`${REVIEW_MAX}개가 차면 더 넣지 않는다`, async () => {
    const s = new MemoryReviewStore();
    for (let i = 0; i < REVIEW_MAX; i++) await s.add({ id: firstReviewId("t", String(i)), kind: "first", acct: String(i), at: i, titleId: "t", text: "" });
    expect(await s.add({ id: firstReviewId("t", "x"), kind: "first", acct: "x", at: 0, titleId: "t", text: "" })).toBe(false);
  });

  it("야근 빌딩 판 id는 계정·시각으로", () => {
    expect(towerReviewId("acc", 123)).toBe("t:acc:123");
  });
});

describe("판 기록 형식 (11/18 log)", () => {
  const base = { game: "hunt", durationMs: 1000, kills: {}, wavesCleared: 0, died: true, potionsUsed: {} };
  it("층 시각·피해·스킬 횟수가 실리고, 없어도 된다", () => {
    expect(RunResultSchema.safeParse(base).success).toBe(true);
    const r = RunResultSchema.safeParse({ ...base, log: { ft: [10_000, 20_000], dmg: 12345, sk: { em_spark: 3 } } });
    expect(r.success && r.data.game === "hunt" && r.data.log).toEqual({ ft: [10_000, 20_000], dmg: 12345, sk: { em_spark: 3 } });
  });
  it("층 시각이 너무 많거나 음수면 거절", () => {
    expect(RunResultSchema.safeParse({ ...base, log: { ft: Array.from({ length: 401 }, () => 1) } }).success).toBe(false);
    expect(RunResultSchema.safeParse({ ...base, log: { dmg: -1 } }).success).toBe(false);
  });
});
