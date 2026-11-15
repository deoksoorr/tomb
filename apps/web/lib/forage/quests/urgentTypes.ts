import type { BoxPrize, UrgentKind, UrgentReward, UrgentStage } from "./urgent";

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
  /** 많이 낸 순 3명 */
  top: { name: string; n: number }[];
  /** 마지막 1분에 100%를 채운 사람 이름 */
  lastName: string | null;
};
export type UrgentPublic = {
  /** 응답을 만든 서버 시각 (ms) */
  at: number;
  /** 지금 진행 중이거나 막 끝난(URGENT_SHOW_MS 안) 의뢰. 없으면 null */
  ev: UrgentLive | null;
};

/** 받은 보상 (저장된 기록 그대로) */
export type UrgentClaimed = { stage: UrgentStage; stamps: number; box: BoxPrize | null; king: boolean; last: boolean; at: number; fishKept?: boolean };

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
  festUntil: number;
  /** 가방에서 빠진 것 */
  used: Record<string, number>;
};
export type UrgentClaimResponse = { claimed: UrgentClaimed; stamps: number };
