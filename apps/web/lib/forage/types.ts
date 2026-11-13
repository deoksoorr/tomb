import type { Me } from "../types";
import type { DexTier, LifeCat, NodeKind, NpcId } from "./catalog";

// 낚시·채집·도감 API 계약 (서버 ↔ UI)

/** 도감 한 칸: 잡은 수, 가장 큰 크기(cm×10, 크기 없는 것은 0), 처음 잡은 날(KST YYYYMMDD) */
export type DexEntry = { n: number; max: number; first: string };

/** 오늘(KST) 기록: 판 포인트(항목별)와 잡은·캔 수. auto = 그중 자동 낚시로 낚은 수 (fish에도 들어 있다) */
export type LifeDay = { fishP: number; gatherP: number; dexP: number; fish: number; gather: number; auto: number };

export type ForageState = {
  /** 가방의 물고기·채집물 (id → 개수) */
  bag: Record<string, number>;
  dex: Record<string, DexEntry>;
  /** 받은 도감 보상 (`${cat}:${tier}` → 받은 날) */
  claims: Record<string, string>;
  /** 받은 칭호 */
  titles: string[];
  today: LifeDay & { fishCap: number; gatherCap: number; dexCap: number; autoCap: number };
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

/**
 * 물에 빠진 꾸미기 (아주 드물게 물고기 대신, 영구 소장). id = 꾸미기 아이템 id.
 * kept=false면 이미 모두 가지고 있어서 instead(물고기 id)를 대신 가방에 넣었다 (그때 id·name은 빈 문자열일 수 있다)
 */
export type SunkenCatch = { id: string; name: string; kept: boolean; instead?: string };

/** 자동 낚시 상태 (켜져 있을 때) */
export type AutoFishStatus = {
  spot: string;
  water: "lake" | "river";
  startedAt: number;
  /** 이 시각이 지나면 더 낚지 않는다 (한 세션 최대 길이) */
  endsAt: number;
  /** 다음 한 마리까지 남은 접속 시간 (ms). 세션이 끝났으면 null */
  nextInMs: number | null;
  /** 오늘 자동으로 낚은 수 / 자동 낚시 하루 한도 */
  today: number;
  cap: number;
  /** 오늘 자동 한도나 하루 전체 낚시 한도에 닿음 */
  limited: boolean;
};

/** 자동 낚시 켜기·정산·끄기 응답. items = 이번에 새로 받은 것 (크기는 내 도감 최대 기록에 반영해 record가 설 수 있다. 최대어 순위에는 넣지 않는다) */
export type AutoFishResponse = {
  auto: AutoFishStatus | null;
  items: CatchResult[];
  /** 한도에 막혀 못 받은 수 */
  dropped: number;
  /** 이번에 건진 물에 빠진 꾸미기 (items와 따로, 한도에는 같이 센다) */
  gear: SunkenCatch[];
  /** 세션이 끝난 까닭 (끄기·시간 다 됨). 켜져 있으면 없음 */
  ended?: "stop" | "time";
  state: ForageState;
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

/** gear가 있으면 물고기 대신 꾸미기를 건졌다 (다 가졌으면 result에 대신 받은 물고기) */
export type ReelResponse = { result: CatchResult | null; gear?: SunkenCatch; state: ForageState };

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
