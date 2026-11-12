import type { CosmeticSlot } from "@tomb/protocol";
import type { AttendClaim, CalendarMonthRecord } from "../calendar";
import type { EarnSource } from "../economy";
import type { ReportLogEntry, ReportReason } from "../reports";
import { SHRINE_KEEP_DAYS, type ActivityItem, type Grave, type GraveDecor, type PassReason } from "../types";

/**
 * 저장소 원본 + 카운트 + 채널(읽을 때 항상 채운다, 예전 묘비는 1).
 * ownerTokenHash·hidden이 들어 있으므로 그대로 내보내지 않는다 (toPublicGrave 사용)
 */
export type GraveRecord = Grave & { channel: number; flowers: number; revives: number };

export type ViewerState = { myFlowerToday: boolean };

/** 성불한 묘비 (반응 수·숨김·꾸미기를 같이 보관한다) */
export type PassedRecord = { record: GraveRecord; passedAt: number; reason: PassReason };
/** 묘지 설정. passEpoch = 성불 규칙을 처음 켠 시각 (그 전에 세운 묘비의 기간은 이때부터 센다) */
export type GraveSettings = { passDays: number; passEpoch: number };

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

  // ── 49번 성불 ──
  /**
   * 성불: 묘역(목록·채널)에서 빼고 성불 리스트로 옮긴다 (원자적, 데이터는 지우지 않는다).
   * 반응 수·숨김·디자인·꾸미기를 같이 보관한다. 이미 성불했거나 없는 묘비면 null (여러 번 불러도 한 번만 옮겨진다)
   */
  passOn(id: string, passedAt: number, reason: PassReason): Promise<PassedRecord | null>;
  /** 성불한 묘비 전부 (숨김 포함, 순서는 보장하지 않는다) */
  passedAll(): Promise<PassedRecord[]>;
  /** since(ms) 이후에 성불한 것 (최근 것 먼저, 최대 limit개) — 목록의 빛 연출용 */
  passedSince(since: number, limit: number): Promise<PassedRecord[]>;
  /** 성불한 묘비를 완전히 지운다 (관리자). 없으면 null. 이미지는 호출자가 정리 */
  removePassed(id: string): Promise<Grave | null>;
  /** 묘지 설정. 처음 부르면 passEpoch를 now로 저장한다 */
  settings(now: number): Promise<GraveSettings>;
  setPassDays(days: number): Promise<void>;
  /** 성불 정리 잠금: ttlMs 동안 한 번만 true (여러 요청이 같은 정리를 겹쳐 하지 않게). Redis는 서버 시계로 잰다 */
  lockSweep(ttlMs: number, now: number): Promise<boolean>;
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
  /** 마지막 출석일 (KST, YYYYMMDD) = 출석 달력에서 마지막으로 도장을 받은 날 */
  lastAttend: string | null;
  /** 10번: 오늘 머무르기 기록 수 (1번 = 10분, 출석 도장 조건) */
  stayTicks: number;
  /** 접속 시간 보너스: 오늘 받은 구간 수 (lib/stayBonus.ts) */
  bonusClaimed: number;
  /** 처음 입장한 시각 (0 = 모름: 기록을 남기기 전에 만든 옛 계정). 전체 선물 대상 판정에 쓴다 */
  createdAt: number;
  hasCode: boolean;
  inventory: Record<string, number>;
  /** 만료 전 착용품 (부위마다 하나) */
  equipped: EquippedItem[];
  /** 벗어 둔 꾸미기 (만료 전). 남은 시간은 벗어 둔 동안에도 흐른다. 다시 입을 수 있고, 산 것으로 친다(중복 구매 불가) */
  stash: EquippedItem[];
  graves: string[];
  /** 오늘 쌓은 포인트 */
  todayEarned: number;
  /** 안 읽은 내 소식 수 (보관 중인 최근 50개 안에서) */
  activityUnread: number;
  /** 마지막 닉네임 변경 시각 (0 = 바꾼 적 없음)과 지금까지 바꾼 횟수 */
  nameChangedAt: number;
  nameChanges: number;
  tutorialDone: boolean;
};

/** 내 소식 보관 개수 */
export const ACTIVITY_KEEP = 50;
/** 경제 통계 보관 기간 */
export const ECON_TTL_SEC = 90 * 86_400;
/** 닉네임 변경 결과. cooldown이면 다음 가능 시각, points면 포인트 부족 */
export type NameChangeResult = { ok: true; cost: number } | { ok: false; reason: "cooldown"; nextAllowedAt: number } | { ok: false; reason: "points" };

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
  /**
   * 접속 시간 보너스 받기 (원자적): 오늘 머문 기록으로 열린 구간 중 아직 안 받은 구간을 한꺼번에 받는다.
   * 받을 구간이 없으면 null. 받은 구간은 하루 상한(DAILY_EARN_CAP)에 막혀 덜 들어와도 받은 것으로 친다
   */
  claimStayBonus(id: string, day: string): Promise<{ earned: number; count: number } | null>;
  /**
   * 모은 포인트 상위 limit명 + me의 순위(없으면 null). week(그 주 월요일 YYYYMMDD)를 주면 그 주에 모은 포인트 순위.
   * RankEntry.points = 순위 값
   */
  pointRank(limit: number, me: string | null, week?: string): Promise<{ rows: RankEntry[]; mine: RankEntry | null }>;
  /**
   * 사냥터 한 판 기록 (49번 랭킹): 처치 수 합계(전체·그 주)를 올리고, 클리어했으면(clearMs) 그 사냥터의
   * 최단 기록(전체·그 주)을 더 짧을 때만 바꾼다. 원자적
   */
  recordHunt(id: string, zone: string, run: { kills: number; clearMs: number | null }, week: string): Promise<void>;
  /** 사냥 랭킹: kills = 처치 수 많은 순, best = 그 사냥터 최단 클리어 순(ms, 작을수록 위). week가 없으면 전체 */
  huntRank(
    board: "kills" | "best",
    limit: number,
    me: string | null,
    opts: { zone?: string; week?: string },
  ): Promise<{ rows: RankEntry[]; mine: RankEntry | null }>;
  /**
   * 입장 기록: 이름·색·몸 모양은 계정에 아직 값이 없을 때만 저장한다 (코드로 시작·이어서 들어온 기기의 다른 값이
   * 덮어쓰지 않게). 처음 입장한 시각도 한 번만 남긴다. 포인트는 주지 않는다 (10번: 출석은 달력에서 받는다)
   */
  enter(id: string, profile: Profile, now: number): Promise<void>;
  /**
   * 10번 출석 달력 한 달 (month = YYYYMM). 처음 부르면 달력 개편 전 출석(마지막 출석일·연속 일수)을
   * 도장으로 옮겨 둔다 (legacyAttendDays, 한 번만)
   */
  attendCalendar(id: string, month: string): Promise<CalendarMonthRecord>;
  /**
   * 오늘 칸 받기 (원자적): 오늘 이미 받았으면 "already"(달력 개편 전 자동 출석 포함), 머문 기록이 needTicks보다
   * 적으면 "stay". 받으면 연속 일수를 갱신하고 도장을 찍은 뒤 출석·7일 연속·한 달 개근(그달 monthDays일을 모두
   * 찍었을 때 한 번) 포인트를 준다. 달력 보상은 하루 전체 한도(DAILY_EARN_CAP)에 막히지 않는다 (항목 한도·지갑 한도는 지킨다).
   * 같은 IP에서 오늘 이미 ATTEND_ACCOUNTS_PER_IP개 계정이 받았으면 도장만 찍고 포인트는 주지 않는다
   */
  claimAttend(id: string, ipHash: string, day: string, yesterday: string, monthDays: number, needTicks: number): Promise<AttendClaim>;
  /** 개인 코드 해시 교체 (이전 코드는 무효) */
  setCode(id: string, codeHash: string): Promise<void>;
  findByCode(codeHash: string): Promise<string | null>;
  /**
   * 구매. unique(캐릭터 꾸미기)면 가방에 있거나 지금 착용 중이거나 벗어 둔 것(stash, 만료 전)이 있을 때
   * "owned"로 거절한다 (확인과 차감이 한 번에).
   */
  buy(id: string, itemId: string, price: number, opts?: { unique?: boolean; now?: number }): Promise<"ok" | "insufficient" | "owned">;
  /** 가방에서 1개 쓰기. 없으면 false */
  consume(id: string, itemId: string): Promise<boolean>;
  /**
   * 가방에서 1개 쓰고 그 부위에 착용. 같은 부위에 입던 것은 사라지지 않고 벗어 둔 꾸미기(stash)로 옮긴다
   * (이미 만료됐으면 버린다). 같은 아이템이 stash에 있으면 지운다 (새로 입는 쪽이 더 오래 간다 → 한 아이템은
   * 입은 곳과 stash 중 한 곳에만 있다). now는 만료 판정 기준 (만료된 착용품·stash는 이때 정리한다). 가방에 없으면 false
   */
  equip(id: string, itemId: string, slot: CosmeticSlot, until: number, now: number): Promise<boolean>;
  /**
   * 벗어 둔 꾸미기를 다시 입는다 (남은 시간 그대로). 같은 부위에 입던 것은 stash로 옮긴다.
   * stash에 없거나 만료됐으면 false. 이미 입고 있는 아이템은 stash에 없으므로 false다 (멱등 true가 아니다).
   * slot은 그 아이템의 부위여야 한다 (호출자가 카탈로그에서 넘긴다)
   */
  wear(id: string, itemId: string, slot: CosmeticSlot, now: number): Promise<boolean>;
  /** 그 부위에 입은 것을 벗어 stash로 옮긴다 (남은 시간 그대로). 입은 게 없으면 false */
  unequip(id: string, slot: CosmeticSlot, now: number): Promise<boolean>;
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

  // ── v4: 소식·닉네임·안내·경제 ──
  /** 내 소식 하나 (최신 ACTIVITY_KEEP개만 남긴다) */
  pushActivity(id: string, item: ActivityItem): Promise<void>;
  /** 최신 순 + 여기까지 읽음 시각 */
  activity(id: string): Promise<{ items: ActivityItem[]; lastSeenAt: number }>;
  /** 읽음 시각을 at으로 (되돌리지는 않는다). 새 읽음 시각 */
  seeActivity(id: string, at: number): Promise<number>;
  /**
   * 닉네임 변경 (원자적): 쿨다운 확인 → 첫 변경은 무료, 이후 price 차감 → 이름·시각·횟수 갱신.
   * 묘비의 상주 이름은 그대로 두고, 계정 이름(랭킹 표시명)만 바뀐다
   */
  changeName(id: string, name: string, now: number, price: number, cooldownMs: number): Promise<NameChangeResult>;
  setTutorialDone(id: string): Promise<void>;
  /** 날짜(YYYYMMDD)별 경제 통계 필드: `earn:{source}`, `spend:{분류}`, `refund` */
  economy(days: string[]): Promise<{ date: string; fields: Record<string, number> }[]>;
  /** 포인트를 가진 적 있는 계정 수와 지갑 잔액 합계 */
  walletTotals(): Promise<{ wallets: number; accounts: number }>;
}

/** 포인트 사용 사유 → 경제 통계 분류 (사유 앞부분으로 나눈다) */
export function spendCategory(reason: string): string {
  if (reason.startsWith("housing")) return "housing";
  if (reason.startsWith("사냥터") || reason.startsWith("rpg")) return "rpg";
  if (reason.startsWith("name")) return "name";
  if (reason.startsWith("shop")) return "shop";
  if (reason.startsWith("admin")) return "admin";
  return "other";
}
