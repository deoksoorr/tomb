import { describe, expect, it } from "vitest";
import { autoPickIndex, cardOverlap, pickOrder, pickSummary } from "./cardAuto";
import { CARD_POOL_VER, cardOffer, replayPicks, startPicks, type CardCounts, type CardId, type CardPick, type MainBranch } from "./cards";

describe("시작 카드 자동 고르기", () => {
  it("등급 높은 카드가 먼저", () => {
    // raise 일반 · resubmit 매직 · oneshot 전설
    expect(autoPickIndex(["raise", "resubmit", "oneshot"], {})).toBe(2);
    expect(autoPickIndex(["direct", "raise", "quick"], {})).toBe(0);
  });

  it("같은 등급이면 이미 고른 카드와 겹치는 갈래", () => {
    // brEmber·brFrost·brSoul 모두 매직 갈래 카드 — 넋을 이미 골랐으면 넋
    expect(autoPickIndex(["brEmber", "brFrost", "brSoul"], { soulQuick: 1 })).toBe(2);
    expect(autoPickIndex(["brEmber", "brFrost", "brSoul"], { chill: 2 })).toBe(1);
    // 갈래가 없으면 물공·마공이 겹치는 쪽 (quick 물공 · health 공통 · mix 마공)
    expect(autoPickIndex(["quick", "health", "mix"], { brEmber: 1 })).toBe(2);
    expect(autoPickIndex(["quick", "health", "mix"], { sharp: 1 })).toBe(0);
  });

  it("그래도 같으면 무작위 (rnd로 고른다)", () => {
    const cards: CardId[] = ["raise", "health", "coffee"];
    expect(autoPickIndex(cards, {}, () => 0)).toBe(0);
    expect(autoPickIndex(cards, {}, () => 0.5)).toBe(1);
    expect(autoPickIndex(cards, {}, () => 0.999)).toBe(2);
    expect(autoPickIndex(cards, {}, () => 1)).toBe(2);
  });

  it("겹침 점수: 같은 갈래 2 · 같은 물공/마공 1 · 공통 0", () => {
    expect(cardOverlap("brSoul", { soulDrain: 2 })).toBe(2 * 2 + 2);
    expect(cardOverlap("health", { raise: 3 })).toBe(0);
    expect(cardOverlap("sharp", { quick: 1, mix: 1 })).toBe(1);
  });

  it("101층 시작 30장을 자동으로 고른 기록이 서버 검사(replayPicks)를 그대로 통과한다", () => {
    const mains: (MainBranch | null)[] = [null, "ember", "frost", "soul", "worker"];
    let rndSeed = 7;
    const rnd = () => ((rndSeed = (rndSeed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (const seed of [1, 42, 9001, 123456]) {
      for (const main of mains) {
        for (const start of [11, 51, 101]) {
          const owned: CardCounts = {};
          const picks: CardPick[] = [];
          const n = startPicks(start);
          for (let i = 0; i < n; i++) {
            const cards = cardOffer(seed, "s", i, 0, owned, start, CARD_POOL_VER, main);
            const c = cards[autoPickIndex(cards, owned, rnd)];
            expect(cards).toContain(c);
            picks.push({ k: "s", i, r: 0, c });
            owned[c] = (owned[c] ?? 0) + 1;
          }
          expect(picks).toHaveLength(n);
          const v = replayPicks(seed, picks, { levels: 0, starts: n, bossFloors: [], rerolls: 1, start, main });
          expect(v).toEqual({ ok: true, owned });
        }
      }
    }
  });

  it("직접 몇 장 고른 뒤 「남은 카드 자동으로」도 통과 (손으로 고른 것 + 자동)", () => {
    const seed = 555;
    const start = 61;
    const n = startPicks(start);
    const owned: CardCounts = {};
    const picks: CardPick[] = [];
    for (let i = 0; i < n; i++) {
      const cards = cardOffer(seed, "s", i, 0, owned, start, CARD_POOL_VER, "worker");
      const j = i < 4 ? cards.length - 1 : autoPickIndex(cards, owned, () => 0.3);
      picks.push({ k: "s", i, r: 0, c: cards[j] });
      owned[cards[j]] = (owned[cards[j]] ?? 0) + 1;
    }
    expect(replayPicks(seed, picks, { levels: 0, starts: n, bossFloors: [], rerolls: 1, start, main: "worker" }).ok).toBe(true);
  });

  it("요약: 등급 높은 순 → 많이 고른 순", () => {
    const s = pickSummary(["raise", "raise", "oneshot", "health", "resubmit", "raise", "health"]);
    expect(s.map((x) => x.id)).toEqual(["oneshot", "resubmit", "raise", "health"]);
    expect(s.find((x) => x.id === "raise")?.n).toBe(3);
  });

  it("자동 진행 목록: 처음 고른 순서 그대로, 겹치면 ×n만 는다", () => {
    const s = pickOrder(["raise", "health", "oneshot", "raise", "nope" as CardId, "health", "raise"]);
    expect(s).toEqual([
      { id: "raise", n: 3 },
      { id: "health", n: 2 },
      { id: "oneshot", n: 1 },
    ]);
  });
});
