import type { CosmeticSlot } from "@tomb/protocol";
import type { EarnSource } from "../economy";
import type { ReportLogEntry, ReportReason } from "../reports";
import { SHRINE_KEEP_DAYS, type Grave, type GraveDecor, type ReviveResponse } from "../types";

/**
 * 저장소 원본 + 카운트 + 채널(읽을 때 항상 채운다, 예전 묘비는 1).
 * ownerTokenHash·hidden이 들어 있으므로 그대로 내보내지 않는다 (toPublicGrave 사용)
 */
export type GraveRecord = Grave & { channel: number; flowers: number; revives: number };

export type ViewerState = { myRevive: boolean; myFlowerToday: boolean };

/** 성황당 보관 기간 */
export const SHRINE_KEEP_MS = SHRINE_KEEP_DAYS * 86_400_000;
export type ShrineRecord = { record: GraveRecord; removedAt: number; expiresAt: number };

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
/** 채널마다 묘지가 따로다. id로 부르는 연산은 저장소가 묘비의 채널을 스스로 찾는다 */
export interface GraveStore {
  /** 한 채널의 묘비 (숨김 포함). 순서는 보장하지 않는다 */
  list(channel: number): Promise<GraveRecord[]>;
  /** 모든 채널 (관리자 목록, 이미지 공유 확인용) */
  listAll(): Promise<GraveRecord[]>;
  get(id: string): Promise<GraveRecord | null>;
  /**
   * 생성과 수정 공용 (id 기준 덮어쓰기, grave.channel 채널에 둔다. 없으면 1).
   * grave.hidden·decor는 무시하고 기존 숨김·꾸미기를 유지한다
   */
  put(grave: Grave): Promise<void>;
  /** 메타·카운트·집합을 모두 지우고 지운 묘비를 돌려준다 (이미지는 호출자가 정리). 관리자 삭제용 */
  remove(id: string): Promise<Grave | null>;
  /**
   * 성황당으로 옮긴다 (주인의 이장). 목록·채널·랭킹에서 빠지고 accountId의 성황당에 SHRINE_KEEP_DAYS 동안 남는다.
   * 반응 수·숨김·디자인·꾸미기를 같이 보관한다. 없으면 null
   */
  toShrine(id: string, accountId: string, now: number): Promise<Grave | null>;
  /** 내 성황당 (만료 전만, 최근에 옮긴 것 먼저) */
  shrine(accountId: string, now: number): Promise<ShrineRecord[]>;
  /** 원래 채널의 맨 뒤 자리(createdAt = now)로 되돌린다. 성황당에 없거나 만료됐으면 null */
  restore(accountId: string, id: string, now: number): Promise<GraveRecord | null>;
  /** 만료된 성황당 묘비를 limit개까지 완전히 지우고 돌려준다 (이미지는 호출자가 정리) */
  purgeShrine(now: number, limit: number): Promise<Grave[]>;
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

/** 머무르기 포인트 최소 간격 (클라이언트 주기 10분보다 조금 짧게 → 타이머 오차로 빠지지 않게) */
export const PRESENCE_MIN_GAP_MS = 9.5 * 60_000;

/** 적립 선택값: amount(없으면 항목 기본 점수), ipHash(주면 같은 IP 합계도 항목 한도 × ATTEND_ACCOUNTS_PER_IP로 막는다) */
export type EarnOptions = { amount?: number; ipHash?: string };
export type Profile = { name?: string | null; color?: string | null; body?: string | null };
export type RankEntry = { accountId: string; name: string | null; points: number; rank: number };

export type AccountRecord = {
  points: number;
  /** 지금까지 모은 포인트 (써도 줄지 않는다, 포인트 랭킹 기준) */
  lifetimePoints: number;
  name: string | null;
  color: string | null;
  body: string | null;
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
  earn(id: string, source: EarnSource, day: string, opts?: EarnOptions): Promise<number>;
  /** 원자적 차감. 잔액이 모자라면 null, 아니면 남은 잔액. reason은 계정의 최근 사용 기록(최대 100개)에 남는다 */
  spend(id: string, amount: number, reason: string, now: number): Promise<number | null>;
  /**
   * 돌려주기 (되팔기·결제 뒤 실패 보상): 잔액만 늘린다 (지갑 상한에서 잘림). 적립이 아니므로
   * 하루 적립 한도·모은 포인트·랭킹과 무관하다. reason은 사용 기록에 남는다. 새 잔액을 돌려준다
   */
  refund(id: string, amount: number, reason: string, now: number): Promise<number>;
  /** 머무르기: 직전 지급 후 PRESENCE_MIN_GAP_MS가 지났으면 적립(한도 안에서). 너무 이르면 null */
  presence(id: string, day: string, now: number): Promise<number | null>;
  /** 모은 포인트 상위 limit명 + me의 순위(없으면 null) */
  pointRank(limit: number, me: string | null): Promise<{ rows: RankEntry[]; mine: RankEntry | null }>;
  /**
   * 출석. 오늘 처음이면 연속 일수를 갱신하고 출석(+7일째마다 보너스) 포인트를 준다.
   * 같은 IP에서 오늘 이미 ATTEND_ACCOUNTS_PER_IP개 계정이 받았으면 출석만 기록하고 포인트는 주지 않는다.
   * 이름·색·몸 모양은 계정에 아직 값이 없을 때만 저장한다 (코드로 시작·이어서 들어온 기기의 다른 값이 덮어쓰지 않게).
   */
  attend(id: string, ipHash: string, profile: Profile, day: string, yesterday: string): Promise<number>;
  /** 개인 코드 해시 교체 (이전 코드는 무효) */
  setCode(id: string, codeHash: string): Promise<void>;
  findByCode(codeHash: string): Promise<string | null>;
  /**
   * 구매. unique(캐릭터 꾸미기)면 가방에 있거나 지금 착용 중일 때 "owned"로 거절한다 (확인과 차감이 한 번에).
   */
  buy(id: string, itemId: string, price: number, opts?: { unique?: boolean; now?: number }): Promise<"ok" | "insufficient" | "owned">;
  /** 가방에서 1개 쓰기. 없으면 false */
  consume(id: string, itemId: string): Promise<boolean>;
  /** 가방에서 1개 쓰고 그 부위에 착용 (같은 부위는 교체). 없으면 false */
  equip(id: string, itemId: string, slot: CosmeticSlot, until: number): Promise<boolean>;
  /**
   * 가방에서 1개 쓰고 묘비에 꾸미기를 놓는다 (만료된 것 정리, 최대 개수를 넘으면 가장 오래된 것 교체).
   * 묘비가 없으면 null, 가방에 없으면 "no_item". 주인 확인은 호출자가 한다
   */
  placeDecor(
    id: string,
    graveId: string,
    channel: number,
    itemId: string,
    until: number,
    now: number,
  ): Promise<GraveDecor[] | "no_item" | null>;
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
