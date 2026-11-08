import type { CosmeticSlot } from "@tomb/protocol";
import type { EarnSource } from "../economy";
import type { ReportLogEntry, ReportReason } from "../reports";
import type { Grave, GraveDecor, ReviveResponse } from "../types";

/** 저장소 원본 + 카운트. ownerTokenHash·hidden이 들어 있으므로 그대로 내보내지 않는다 (toPublicGrave 사용) */
export type GraveRecord = Grave & { flowers: number; revives: number };

export type ViewerState = { myRevive: boolean; myFlowerToday: boolean };

/** 관리자용 신고 요약: 지금 세고 있는 신고 IP 수 + 최근 기록(최신 먼저) */
export type ReportSummary = { count: number; log: ReportLogEntry[] };

/** 헌화 하루 1회 판정 기간 (spec: `SET NX EX 86400`) */
export const FLOWER_TTL_SEC = 86_400;
/** 서로 다른 IP의 신고가 이만큼 모이면 숨긴다 */
export const REPORT_HIDE_THRESHOLD = 5;

/**
 * 반응 연산은 모두 묘비 존재 확인과 한 덩어리로 원자적이다 (삭제와 경합해 고아 키가 생기지 않는다).
 * 숨김 여부는 메타와 따로 저장한다 → 주인의 수정(put)이 신고·관리자의 숨김을 덮어쓰지 못한다.
 */
export interface GraveStore {
  /** 숨김 포함 전체. 순서는 보장하지 않는다 */
  list(): Promise<GraveRecord[]>;
  get(id: string): Promise<GraveRecord | null>;
  /** 생성과 수정 공용 (id 기준 덮어쓰기). grave.hidden·decor는 무시하고 기존 숨김·꾸미기를 유지한다 */
  put(grave: Grave): Promise<void>;
  /** 메타·카운트·집합을 모두 지우고 지운 묘비를 돌려준다 (이미지는 호출자가 정리) */
  remove(id: string): Promise<Grave | null>;
  /**
   * 숨김 해제 시 신고 수(IP·방문자 집합)를 0으로 되돌린다 (다음 신고 한 번에 바로 다시 숨지 않게).
   * 신고 기록(로그)은 남긴다. 묘비가 없으면 false
   */
  setHidden(id: string, hidden: boolean): Promise<boolean>;
  /** 신고 수와 기록을 모두 비운다. 숨김 상태는 건드리지 않는다. 묘비가 없으면 false */
  resetReports(id: string): Promise<boolean>;
  /** 신고 기록이 있는 묘비들의 요약 (초기화했거나 신고가 없던 묘비는 빠진다) */
  reportSummary(): Promise<Map<string, ReportSummary>>;
  viewer(id: string, visitorId: string): Promise<ViewerState>;
  /** 새 헌화 수. 24시간 안에 이미 헌화했으면 "already", 묘비가 없으면 null */
  flower(id: string, visitorId: string): Promise<number | "already" | null>;
  /** 원자적 토글. 묘비가 없으면 null */
  toggleRevive(id: string, visitorId: string): Promise<ReviveResponse | null>;
  /** 이 방문자가 이 묘비에서 살려주세요 포인트를 처음 받는 차례면 true (취소했다 다시 눌러도 다시 받지 않는다) */
  firstRevive(id: string, visitorId: string): Promise<boolean>;
  /**
   * 신고는 IP 해시 단위로 센다 (쿠키를 새로 받아도 같은 IP는 1건). 같은 방문자나 같은 IP의 재신고는 "duplicate".
   * 서로 다른 IP가 REPORT_HIDE_THRESHOLD개 모이면 숨긴다. 받아들인 신고는 사유와 시각을 기록에 남긴다
   * (최근 REPORT_LOG_MAX개). 묘비가 없으면 null
   */
  report(
    id: string,
    visitorId: string,
    ipHash: string,
    reason: ReportReason,
    at?: number,
  ): Promise<"added" | "duplicate" | null>;
}

// ── 계정·포인트·가방 (계정 id = 방문자 쿠키 vid) ──

export type EquippedItem = { itemId: string; until: number };

export type AccountRecord = {
  points: number;
  name: string | null;
  streak: number;
  /** 마지막 출석일 (KST, YYYYMMDD) */
  lastAttend: string | null;
  hasCode: boolean;
  inventory: Record<string, number>;
  /** 만료 전 착용품 */
  equipped: EquippedItem[];
  graves: string[];
  /** 오늘 쌓은 포인트 */
  todayEarned: number;
};

/** 날짜 인자는 모두 KST 기준 `YYYYMMDD` (lib/store/accounts.ts의 kstDay). 포인트·가방 변화는 모두 원자적이다 */
export interface AccountStore {
  get(id: string, day: string, now: number): Promise<AccountRecord>;
  /** 항목별 하루 한도·하루 전체 한도·지갑 한도 안에서 적립하고 실제 쌓인 점수를 돌려준다 (0 = 한도) */
  earn(id: string, source: EarnSource, day: string): Promise<number>;
  /**
   * 출석. 오늘 처음이면 연속 일수를 갱신하고 출석(+7일째마다 보너스) 포인트를 준다.
   * 같은 IP에서 오늘 이미 ATTEND_ACCOUNTS_PER_IP개 계정이 받았으면 출석만 기록하고 포인트는 주지 않는다.
   * name이 있으면 계정 이름도 저장한다.
   */
  attend(id: string, ipHash: string, name: string | null, day: string, yesterday: string): Promise<number>;
  /** 개인 코드 해시 교체 (이전 코드는 무효) */
  setCode(id: string, codeHash: string): Promise<void>;
  findByCode(codeHash: string): Promise<string | null>;
  /** 잔액이 모자라면 false */
  buy(id: string, itemId: string, price: number): Promise<boolean>;
  /** 가방에서 1개 쓰기. 없으면 false */
  consume(id: string, itemId: string): Promise<boolean>;
  /** 가방에서 1개 쓰고 그 부위에 착용 (같은 부위는 교체). 없으면 false */
  equip(id: string, itemId: string, slot: CosmeticSlot, until: number): Promise<boolean>;
  /**
   * 가방에서 1개 쓰고 묘비에 꾸미기를 놓는다 (만료된 것 정리, 최대 개수를 넘으면 가장 오래된 것 교체).
   * 묘비가 없으면 null, 가방에 없으면 "no_item". 주인 확인은 호출자가 한다
   */
  placeDecor(id: string, graveId: string, itemId: string, until: number, now: number): Promise<GraveDecor[] | "no_item" | null>;
  /**
   * 가방에서 itemId 1개를 쓰면서 묘비를 저장한다 (유료 묘비 디자인). 둘이 한 번에 일어나므로
   * 디자인권 1개로 묘비 2개를 동시에 세울 수 없다. 가방에 없으면 저장하지 않고 false
   */
  putGraveUsing(id: string, itemId: string, grave: Grave): Promise<boolean>;
  /** 관리자 포인트 조정. 0~BALANCE_CAP으로 자르고 하루 적립 한도와는 무관. 없는 계정이면 null */
  adjustPoints(id: string, delta: number): Promise<number | null>;
  addGrave(id: string, graveId: string): Promise<void>;
  removeGrave(id: string, graveId: string): Promise<void>;
}
