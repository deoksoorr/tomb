import type { Me } from "../../types";
import type { Quest } from "./gen";

// 11/15: 수집 의뢰 API 계약 (서버 ↔ UI)

export type QuestCard = Quest & { done: boolean };

export type QuestBoard = {
  /** 게임 날짜 YYYYMMDD · 그 주 월요일 */
  day: string;
  week: string;
  daily: QuestCard[];
  weekly: QuestCard;
  /** 오늘 남은 바꾸기 (0·1) */
  rerollLeft: number;
  /** 의뢰 도장 */
  stamps: number;
  /** 지금까지 끝낸 의뢰 수 */
  total: number;
  /** 교환소에서 받은 한 번짜리 (id) */
  owned: string[];
  /** 교환소에서 받은 염색권 수 (id → 장) */
  bought: Record<string, number>;
  /** 오늘의 의뢰·이번 주 큰 의뢰가 새로 나오는 시각 (ms) */
  dayResetAt: number;
  weekResetAt: number;
};

/** 납품: used = 가방에서 빠진 것 (화면이 가방 사본에서 뺀다 — 낚시 상태를 다시 읽지 않게), earned = 받은 도장, title = 새로 닿은 칭호 단계 */
export type QuestDeliverResponse = { board: QuestBoard; used: Record<string, number>; earned: number };
export type QuestRerollResponse = { board: QuestBoard };
export type QuestExchangeResponse = { board: QuestBoard; me: Me; name: string };
