import type { Me } from "../types";
import type { DexTier, LifeCat, NodeKind, NpcId } from "./catalog";

// 낚시·채집·도감 API 계약 (서버 ↔ UI)

/** 도감 한 칸: 잡은 수, 가장 큰 크기(cm×10, 크기 없는 것은 0), 처음 잡은 날(KST YYYYMMDD) */
export type DexEntry = { n: number; max: number; first: string };

/** 오늘(KST) 기록: 판 포인트(항목별)와 잡은·캔 수 */
export type LifeDay = { fishP: number; gatherP: number; dexP: number; fish: number; gather: number };

export type ForageState = {
  /** 가방의 물고기·채집물 (id → 개수) */
  bag: Record<string, number>;
  dex: Record<string, DexEntry>;
  /** 받은 도감 보상 (`${cat}:${tier}` → 받은 날) */
  claims: Record<string, string>;
  /** 받은 칭호 */
  titles: string[];
  today: LifeDay & { fishCap: number; gatherCap: number; dexCap: number };
  /** 지금 나에게 피어 있는 채집 지점 id와 다음에 다시 피는 시각 */
  nodes: { ids: string[]; refreshAt: number };
};

export type CatchResult = {
  id: string;
  /** cm×10 (크기 없는 것은 0) */
  size: number;
  /** 가방이 가득 차서 못 넣었으면 false (도감에는 등록된다) */
  kept: boolean;
  /** 처음 잡아 도감에 새로 등록 */
  isNew: boolean;
  /** 가장 큰 기록을 새로 세움 */
  record: boolean;
};

export type CastResponse = {
  ticket: string;
  /** 찌를 던지고 입질까지 (ms) */
  biteInMs: number;
  /** 손맛 1~5 (줄다리기 세기) */
  power: number;
  /** 줄다리기 최소 시간 (ms, 클라이언트 감기 속도 기준) */
  reelMs: number;
  hookMs: number;
};

export type ReelResponse = { result: CatchResult | null; state: ForageState };

export type GatherStartResponse =
  | { ticket: string; mode: "gauge"; kind: Exclude<NodeKind, "bug">; durationMs: number }
  | { ticket: string; mode: "bugs"; kind: "bug"; seed: number; timeLimitSec: number; night: boolean };

export type GatherFinishResponse = { items: CatchResult[]; state: ForageState; message?: string };

export type SellResponse = {
  /** 실제로 판 것 (id → 개수) */
  sold: Record<string, number>;
  earned: number;
  /** 오늘 한도(항목·하루 전체·지갑)에 닿아 덜 팔았으면 true. 못 판 것은 가방에 그대로 */
  capped: boolean;
  state: ForageState;
  me: Me;
};

export type DexClaimResponse = { earned: number; title: string | null; state: ForageState; me: Me };

export type PublicDex = {
  accountId: string;
  name: string | null;
  dex: Record<string, DexEntry>;
  titles: string[];
};

export type { DexTier, LifeCat, NpcId };
