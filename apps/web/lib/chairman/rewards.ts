import type { ChairMode } from "./rules";

// 11/20 회장님 독대 주간 보상 (정의는 다른 곳 — 칭호 lib/titles, 꾸미기 @tomb/protocol 아이템. 여기는 id만 참조한다)
//  - 모드마다 이번 주 한 판 최고 피해 순위 1·2·3위 → 5,000 / 3,000 / 2,000P (지갑 전용)
//  - 같은 사람이 그 모드 1위를 3주 연속(2주 넘게) 하면 1위 포인트는 절반 + 연속 표시
//  - 두 모드 보상을 함께 받으면 포인트는 큰 쪽 하나만 (꾸미기·칭호는 둘 다)
//  - 1위: 칭호 + 모자 + 오라 대여 (다음 정리 + 여유까지 — 주간 1위 대여와 같은 길이). 1위 포인트는 관리자 「기록 확인」 인정 뒤에

export const CHAIR_RANK_POINTS = [5_000, 3_000, 2_000] as const;
/** 1위를 이만큼 넘게 연속하면 1위 포인트 절반 */
export const CHAIR_STREAK_FREE = 2;

export type ChairRewardIds = { title: string; titleName: string; hat: string; aura: string };
export const CHAIR_REWARD: Record<ChairMode, ChairRewardIds> = {
  normal: { title: "t_chairNormal", titleName: "연봉 협상의 신", hat: "chair_crown", aura: "chair_aura_gold" },
  hell: { title: "t_chairHell", titleName: "맨주먹 협상가", hat: "chair_band", aura: "chair_aura_ember" },
};
export const CHAIR_TITLE_IDS: readonly string[] = [CHAIR_REWARD.normal.title, CHAIR_REWARD.hell.title];
export const CHAIR_ITEM_IDS: readonly string[] = [CHAIR_REWARD.normal.hat, CHAIR_REWARD.normal.aura, CHAIR_REWARD.hell.hat, CHAIR_REWARD.hell.aura];

/** 순위(1..3)와 연속 1위 주 수(이번 주 포함)로 그 모드 포인트 */
export function chairRankPoints(rank: number, streak: number): number {
  const base = CHAIR_RANK_POINTS[rank - 1] ?? 0;
  return rank === 1 && streak > CHAIR_STREAK_FREE ? Math.floor(base / 2) : base;
}

/** 한 계정의 그 주 보상 줄 (두 모드를 합친 것) */
export type ChairPay = {
  accountId: string;
  /** 모드마다 순위 (보상권 안만) */
  ranks: Partial<Record<ChairMode, number>>;
  /** 바로 주는 포인트 (2·3위 — 두 모드 중 큰 쪽) */
  now: number;
  /** 관리자 인정 뒤 더 주는 포인트 (1위가 큰 쪽일 때: 1위 포인트 − now). 0이면 없음 */
  pending: number;
  /** 연속 1위로 절반이 된 모드 */
  streak?: ChairMode[];
};

/**
 * 순위 → 계정별 지급 (두 모드 중 큰 포인트 하나만). 1위 포인트는 인정 뒤라, 바로 줄 것(2·3위 중 큰 쪽)을 먼저 주고 1위가 더 크면 차이만 인정 뒤에 준다
 * (거절돼도 2·3위 몫은 남는다). streakOf = 그 모드에서 이번 주까지 연속 1위 주 수
 */
export function chairPayouts(ranks: Record<ChairMode, readonly string[]>, streakOf: (mode: ChairMode, accountId: string) => number): ChairPay[] {
  const by = new Map<string, { ranks: Partial<Record<ChairMode, number>>; first: number; other: number; streak: ChairMode[] }>();
  for (const mode of ["normal", "hell"] as const)
    ranks[mode].slice(0, CHAIR_RANK_POINTS.length).forEach((id, i) => {
      const e = by.get(id) ?? { ranks: {}, first: 0, other: 0, streak: [] };
      const rank = i + 1;
      e.ranks[mode] = rank;
      if (rank === 1) {
        const s = streakOf(mode, id);
        if (s > CHAIR_STREAK_FREE) e.streak.push(mode);
        e.first = Math.max(e.first, chairRankPoints(1, s));
      } else e.other = Math.max(e.other, chairRankPoints(rank, 0));
      by.set(id, e);
    });
  return [...by].map(([accountId, e]) => ({
    accountId,
    ranks: e.ranks,
    now: e.other,
    pending: Math.max(0, e.first - e.other),
    ...(e.streak.length ? { streak: e.streak } : {}),
  }));
}
