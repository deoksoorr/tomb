import type { Me } from "../../types";
import type { BoxPrize, UrgentCos, UrgentKind, UrgentReward, UrgentStage } from "./urgent";

// 11/15: 긴급 의뢰 API 계약 (서버 ↔ UI)

/** 위쪽 막대·게시판이 같이 보는 서버 전체 상태 (누구에게나 같다 — CDN에 잠깐 캐시) */
export type UrgentLive = {
  id: string;
  kind: UrgentKind;
  goal: number;
  /** 지금까지 낸 수 (끝나면 멈춘다) */
  n: number;
  start: number;
  end: number;
  /** 축제가 끝나는 시각 (ms, 축제가 없으면 0) */
  festUntil: number;
  /** 100%에 처음 닿은 서버 시각 (ms, 아직이면 0) — 화면이 막 닿았을 때 축하 폭죽을 쏜다 */
  goalAt: number;
  /** 많이 낸 순 3명 */
  top: { name: string; n: number }[];
  /** 마지막 1분에 100%를 채운 사람 이름 (일찍 끝났으면 150%를 채워 끝낸 사람) */
  lastName: string | null;
  /** 11/15 150%를 채워 일찍 끝났다 (end가 그 시각) */
  early?: boolean;
  /** 11/15 lastName이 마지막 1분 100%가 아니라 150%를 채워 끝낸 사람이다 */
  lastFest?: boolean;
  /** 11/16 한 사람이 낼 수 있는 수 (없으면 상한 없음 — 그 전 의뢰). 내가 더 낼 수 있는 수는 UrgentMineRow.left */
  cap?: number;
  /** 11/16 상한까지 다 낸 사람 수 (공동 배달왕, 상한이 있을 때만) */
  kings?: number;
};
export type UrgentPublic = {
  /** 응답을 만든 서버 시각 (ms) */
  at: number;
  /** 지금 진행 중이거나 막 끝난(URGENT_SHOW_MS 안) 의뢰. 없으면 null */
  ev: UrgentLive | null;
};

/** 받은 보상 (저장된 기록 그대로) */
/** 받은 보상 (저장된 기록 그대로). pocket = 「수집가의 뒷주머니」를 가방에 넣었다 (box는 예전 기록 — 받을 때 바로 열던 때의 내용물) */
/** cos = 11/19 받은 무작위 꾸미기 (배달왕·행운의 배달부) · lucky = 행운의 배달부로 뽑혔다 */
/** 11/22 rank·rankStamps = 100%를 넘긴 판의 많이 낸 순위(1~3)와 보너스 도장 (stamps는 단계 도장 그대로) · kingCos = 배달왕이 꾸미기도 받았다 (150%) */
export type UrgentClaimed = {
  stage: UrgentStage;
  stamps: number;
  box: BoxPrize | null;
  pocket?: boolean;
  king: boolean;
  kingCos?: boolean;
  rank?: number;
  rankStamps?: number;
  lucky?: boolean;
  cos?: UrgentCos | null;
  last: boolean;
  at: number;
  fishKept?: boolean;
};

/** 나와 관련된 긴급 의뢰 한 줄 */
export type UrgentMineRow = {
  id: string;
  kind: UrgentKind;
  start: number;
  end: number;
  goal: number;
  n: number;
  /** 내가 낸 수 */
  mine: number;
  /** 11/16 한 사람이 낼 수 있는 수와 내가 앞으로 더 낼 수 있는 수 (상한이 없는 의뢰면 없다) */
  cap?: number;
  left?: number;
  /** 끝났는지 (서버 시각 기준) */
  done: boolean;
  /** 끝났고 받을 것이 있으면 미리 보기 (상자 내용은 받을 때 공개 — box는 상자가 있는지만) */
  reward: (Omit<UrgentReward, "box"> & { box: boolean }) | null;
  /** 이미 받았으면 그 기록 */
  claimed: UrgentClaimed | null;
};
export type UrgentMeResponse = {
  rows: UrgentMineRow[];
  /** 테스트 서버 운영자 (시험 버튼을 보인다) */
  sup: boolean;
};

export type UrgentDeliverResponse = {
  /** 막대 (방금 낸 것까지) */
  n: number;
  goal: number;
  /** 내가 지금까지 낸 수 */
  mine: number;
  /** 11/16 한 사람 상한 (없으면 상한 없음) */
  cap?: number;
  festUntil: number;
  /** 가방에서 빠진 것 */
  used: Record<string, number>;
};
export type UrgentClaimResponse = { claimed: UrgentClaimed; stamps: number };
/** 상자 열기: 나온 것, 물고기면 가방에 들어갔는지(가득이면 도장으로), 지금 도장 수, 남은 상자 수, 내 정보(가방) */
export type UrgentOpenResponse = { prize: BoxPrize; fishKept?: boolean; stamps: number; left: number; me: Me };

// ── 11/22 관리자 「긴급 의뢰 결과」 (끝난 의뢰마다 한 번 남기는 기록 — urgentStore saveResult, 최근 URGENT_RESULTS_KEEP개) ──

/** 낸 사람 한 줄 (많이 낸 순). stamps = 단계 + 순위 보너스 도장 (상자 도장은 열 때라 뺀다) */
export type UrgentResultRow = { acct: string; name: string; n: number; rank: number; stamps: number; box: boolean; king: boolean; kingCos: boolean; lucky: boolean; last: boolean };
export type UrgentResult = {
  id: string;
  kind: UrgentKind;
  start: number;
  /** 실제로 끝난 시각 (150%면 그 시각) */
  end: number;
  goal: number;
  n: number;
  pct: number;
  stage: UrgentStage;
  early: boolean;
  /** 기록한 시각 */
  at: number;
  /** 낸 사람 수 (rows는 앞 URGENT_RESULT_ROWS명까지) */
  count: number;
  rows: UrgentResultRow[];
  /** 행운의 배달부·아슬아슬 마감 (rows 밖일 수 있어 따로) */
  lucky: { acct: string; name: string } | null;
  last: { acct: string; name: string } | null;
};
/** 관리자 화면: 기록 + 받기 상태 (받은 기록이 남아 있는 동안 — 끝나고 약 4일) */
export type AdminUrgentResult = UrgentResult & { claimed: Record<string, { at: number; cos: UrgentCos | null }> };
export type AdminUrgentResultsResponse = { results: AdminUrgentResult[] };
