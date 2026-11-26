import { CARD_BRANCH, CARDS, RARITIES, type CardCounts, type CardId } from "./cards";

// 11/26 야근 빌딩 위층 시작 카드 자동 고르기 (화면 CardPick이 쓴다).
// 매번 나온 세 장 안에서만 고른다 → 게임에 보내는 것은 손으로 고를 때와 똑같은 {slot} 하나라 서버 검사(replayPicks)는 그대로.
// 추천 순: 등급 높은 것 → 이미 고른 카드와 겹치는 갈래 → 무작위.

/** 이미 고른 카드와 얼마나 겹치나: 같은 갈래(모닥불·서리·넋·일꾼) 한 장마다 2, 같은 물공·마공 한 장마다 1 (공통 카드는 0) */
export function cardOverlap(id: CardId, owned: CardCounts): number {
  const def = CARDS[id];
  const branch = CARD_BRANCH[id];
  let score = 0;
  for (const [k, n] of Object.entries(owned) as [CardId, number][]) {
    const other = CARDS[k];
    if (!other || !n || n <= 0) continue;
    if (branch && CARD_BRANCH[k] === branch) score += 2 * n;
    if (def.type !== "all" && other.type === def.type) score += n;
  }
  return score;
}

/** 세 장 중 추천 순으로 첫째인 카드의 자리 (같은 점수가 여럿이면 rnd로 하나) */
export function autoPickIndex(cards: readonly CardId[], owned: CardCounts, rnd: () => number = Math.random): number {
  let best: number[] = [];
  let bestRank = -1;
  let bestOverlap = -1;
  cards.forEach((id, i) => {
    if (!CARDS[id]) return;
    const rank = RARITIES.indexOf(CARDS[id].rarity);
    const overlap = cardOverlap(id, owned);
    if (rank > bestRank || (rank === bestRank && overlap > bestOverlap)) {
      best = [i];
      bestRank = rank;
      bestOverlap = overlap;
    } else if (rank === bestRank && overlap === bestOverlap) best.push(i);
  });
  if (!best.length) return 0;
  return best[Math.min(best.length - 1, Math.floor(Math.max(0, rnd()) * best.length))];
}

/** 고른 카드 요약 (등급 높은 순 → 많이 고른 순 → 이름): 한 화면 요약용 */
export function pickSummary(ids: readonly CardId[]): { id: CardId; n: number }[] {
  const count = new Map<CardId, number>();
  for (const id of ids) if (CARDS[id]) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count.entries()]
    .map(([id, n]) => ({ id, n }))
    .sort(
      (a, b) =>
        RARITIES.indexOf(CARDS[b.id].rarity) - RARITIES.indexOf(CARDS[a.id].rarity) || b.n - a.n || CARDS[a.id].name.localeCompare(CARDS[b.id].name, "ko"),
    );
}

/** 11/26 자동으로 고르는 중에 보이는 목록: 처음 고른 순서 그대로 (새 카드는 뒤에 붙고, 이미 있는 칸은 ×n만 늘어난다 — 칸이 이리저리 옮겨 다니지 않게) */
export function pickOrder(ids: readonly CardId[]): { id: CardId; n: number }[] {
  const count = new Map<CardId, number>();
  for (const id of ids) if (CARDS[id]) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count.entries()].map(([id, n]) => ({ id, n }));
}
