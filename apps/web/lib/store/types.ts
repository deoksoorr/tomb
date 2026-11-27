import type { RetainRecord } from "../retain";
import type { CosmeticSlot } from "@tomb/protocol";
import type { AttendClaim, CalendarMonthRecord } from "../calendar";
import type { EarnSource } from "../economy";
import type { EarnBoost } from "../pointEvent";
import { msUntilDayReset } from "../gameDay";
import type { ReportBy, ReportLogEntry, ReportReason } from "../reports";
import { PRESENCE_HIDDEN_INTERVAL_MS, SHRINE_KEEP_DAYS, type ActivityItem, type Grave, type GraveDecor, type PassReason } from "../types";

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

/** 헌화 하루 1회 판정 기간: 다음 새벽 5시(한국 시간, lib/gameDay)까지 — 그때 다시 놓을 수 있다 (예전: 놓은 때부터 24시간) */
export const flowerTtlSec = (now: number) => Math.max(1, Math.ceil(msUntilDayReset(now) / 1000));
/** 서로 다른 계정의 신고가 이만큼 모이면 숨긴다 (11/18 IP가 아니라 계정 단위 — 만든 지 3일 지난 계정만 센다) */
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
  /**
   * 11/18 수정 전용: 묘비가 아직 묘역에 있을 때만 덮어쓴다 (없으면 false — 이장·삭제와 동시에 온 수정이 묘비를 되살리지 못하게)
   */
  update(grave: Grave): Promise<boolean>;
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
   * 신고는 계정 단위로 센다 (11/18 — 예전엔 IP 단위라 같은 회사·집에서 여럿이 신고하면 1건이었다). 같은 계정의 재신고는 "duplicate".
   * 서로 다른 계정이 REPORT_HIDE_THRESHOLD명 모이면 숨긴다. 받아들인 신고는 사유·시각·신고한 사람(by)을 기록에 남긴다
   * (최근 REPORT_LOG_MAX개). 묘비가 없으면 null.
   * weak(갓 만든 계정)면 기록·관리자 신고함에만 남기고 숨김 수에는 넣지 않는다 (계정을 새로 만들어 남의 묘비를 숨기지 못하게)
   */
  report(
    id: string,
    visitorId: string,
    reason: ReportReason,
    at?: number,
    weak?: boolean,
    by?: ReportBy | null,
  ): Promise<"added" | "duplicate" | null>;
}

// ── 계정·포인트·가방 (계정 id = 방문자 쿠키 vid) ──

export type EquippedItem = { itemId: string; until: number };

/** 머무르기 포인트 최소 간격 (클라이언트 주기 10분보다 조금 짧게 → 타이머 오차로 빠지지 않게) */
export const PRESENCE_MIN_GAP_MS = 9.5 * 60_000;
/** 머무르기 기록 1번의 길이 (10분) */
export const PRESENCE_TICK_MS = 10 * 60_000;
/**
 * 몰아서 정산 (숨긴 탭은 Redis를 아끼려고 PRESENCE_HIDDEN_INTERVAL_MS마다 한 번만 보낸다):
 * 같은 화면(sid)에서 온 연달은 기록이고 직전 기록 뒤 PRESENCE_CATCHUP_WINDOW_MS 안이면, 흐른 시간만큼(10분 단위, 30초 여유)
 * 최대 PRESENCE_CATCHUP_MAX_TICKS번을 한 번에 센다. 그 밖(새 화면·오래 끊김·sid 없는 옛 화면)은 지금처럼 1번만.
 *  - 시각은 서버 시각만 쓴다. 다음 기준 시각은 센 만큼만 앞으로 (남은 몇 분은 다음 기록으로 넘어간다, 지금보다 앞서지 않는다)
 *  - 지갑 상한은 그대로. 머문 기록(출석 도장·접속 보너스)도 같은 수만큼
 *  - 창을 닫았다 다시 열면 sid가 바뀌어 그 사이는 세지 않는다. sid를 꾸며 보내도 10분마다 부르는 것과 같은 몫 이상은 못 받는다
 */
export const PRESENCE_CATCHUP_MAX_TICKS = 3;
/** 몰아서 정산을 인정하는 직전 기록과의 최대 간격 (숨은 탭 30분 주기 + 타이머 지연 여유) */
export const PRESENCE_CATCHUP_WINDOW_MS = PRESENCE_HIDDEN_INTERVAL_MS + 10 * 60_000;
/** 기록 수 셈의 여유 (10분에서 이만큼 모자라도 1번으로 센다 = PRESENCE_TICK_MS - PRESENCE_MIN_GAP_MS) */
export const PRESENCE_TICK_SLACK_MS = PRESENCE_TICK_MS - PRESENCE_MIN_GAP_MS;

/**
 * 몰아서 정산할 기록 수와 다음 기준 시각 (Redis Lua·메모리 저장소와 같은 규칙). 너무 이르면 null.
 * sameSid = 직전 기록과 같은 화면에서 왔는지
 */
export function presenceCatchup(last: number, now: number, sameSid: boolean): { ticks: number; nextAt: number } | null {
  const elapsed = now - last;
  if (elapsed < PRESENCE_MIN_GAP_MS) return null;
  if (!sameSid || last <= 0 || elapsed > PRESENCE_CATCHUP_WINDOW_MS) return { ticks: 1, nextAt: now };
  const ticks = Math.max(1, Math.min(PRESENCE_CATCHUP_MAX_TICKS, Math.floor((elapsed + PRESENCE_TICK_SLACK_MS) / PRESENCE_TICK_MS)));
  return { ticks, nextAt: Math.min(now, last + ticks * PRESENCE_TICK_MS) };
}

/**
 * 적립 선택값: amount(없으면 항목 기본 점수), ipHash(11/18부터 쓰지 않는다 — 같은 IP 합계 한도 없음),
 * boost(포인트 배수 이벤트 — 고른 항목이면 적립이 배수, 횟수 규칙이 남은 항목은 하루 최대도 배수. 없으면 저장소가 지금 설정을 읽는다, lib/pointEvent earnTerms)
 */
export type EarnOptions = { amount?: number; ipHash?: string; boost?: EarnBoost; quest?: QuestHook | null };

/**
 * 11/18 오늘의 할 일 진행 한 칸 올리기 (lib/retainQuest questHook). 행동을 처리하는 저장소 명령(Lua·파이프라인)이 같은 왕복에서
 * 오늘 적립 해시 key의 field를 1 올린다 (추가 왕복 없음, 명령 +1 — 그날 할 일에 든 행동만). 올린 뒤 값은 have에 적는다.
 * 메모리 저장소는 local로 계정 메모리의 같은 칸을 올린다
 */
export type QuestHook = { key: string; field: string; ttlSec: number; local: (n: number) => number; have?: number };
export type Profile = { name?: string | null; color?: string | null; body?: string | null };
export type RankEntry = { accountId: string; name: string | null; points: number; rank: number };
/** 입장 토큰용 계정 모습 (AccountStore.appearance). stayMin = 총 접속 시간(분, 11/16부터 쌓임), createdAt = 처음 입장 시각 (0 = 모름) */
export type AccountAppearance = Pick<AccountRecord, "name" | "color" | "body" | "equipped" | "createdAt"> & { stayMin: number };

export type AccountRecord = {
  points: number;
  /** 지금까지 모은 포인트 (써도 줄지 않는다, 포인트 랭킹 기준) */
  lifetimePoints: number;
  name: string | null;
  color: string | null;
  body: string | null;
  streak: number;
  /** 마지막 출석일 (게임 날짜 YYYYMMDD) = 출석 달력에서 마지막으로 도장을 받은 날 */
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
  /** 11/22 포인트를 내고 영구로 산 꾸미기 id (되팔기는 이것만). 선물·보상으로 받은 건 없다. get(…, { bought: true })로 읽었을 때만 있다 */
  bought?: string[];
  /** 11/22 되팔기 전에 가진 꾸미기의 산 기록 채우기를 끝냈는지 (lib/resellBought) */
  boughtFilled?: boolean;
  graves: string[];
  /** 오늘 쌓은 포인트 */
  todayEarned: number;
  /** 안 읽은 내 소식 수 (보관 중인 최근 50개 안에서) */
  activityUnread: number;
  /** 마지막 닉네임 변경 시각 (0 = 바꾼 적 없음)과 지금까지 바꾼 횟수 */
  nameChangedAt: number;
  nameChanges: number;
  tutorialDone: boolean;
  /** 휴면(DORMANT_DAYS일 넘게 안 들어옴)에서 돌아왔다 → 닉네임을 다시 정해야 마을에 들어갈 수 있다 */
  renameRequired: boolean;
  /** 11/18 리텐션 (새 이웃 꾸러미·첫 걸음·오늘의 할 일 — lib/retain.ts). 계정·오늘 적립 해시에서 같이 읽는다 */
  retain: RetainRecord;
};

/** 11/18 새 이웃 꾸러미 받기에 넣는 것 (lib/retain PATH 여러 칸을 합친 계정 저장소 몫 — 물약·강화 재료는 사냥 저장소가 따로) */
export type PathGrant = {
  /** 한꺼번에 받는 꾸러미 수 (밀린 것까지) */
  count: number;
  items: readonly { itemId: string; count: number }[];
  /** 11/19 기간제 꾸미기 [아이템 id, 부위] — until까지 (입고 있으면 그 자리, 아니면 벗어 둔 꾸미기) */
  wear: readonly (readonly [string, CosmeticSlot])[];
  until: number;
  /** 사냥 가방 몫이 있는 꾸러미 번호들 (계정 해시 gpPot에 쉼표로 — 넣고 나면 지운다) */
  pend: readonly number[];
};
/** ok = 받음 · today = 오늘 이미 받음 · stale = 받은 수가 달라졌다(다른 탭이 먼저) */
export type PathClaim = { ok: true } | { ok: false; reason: "today" | "stale" };

/** 내 소식 보관 개수 */
export const ACTIVITY_KEEP = 50;
/** 경제 통계 보관 기간 */
export const ECON_TTL_SEC = 90 * 86_400;
/** 닉네임 변경 결과. cooldown이면 다음 가능 시각, points면 포인트 부족 */
export type NameChangeResult =
  | { ok: true; cost: number }
  | { ok: false; reason: "cooldown"; nextAllowedAt: number }
  | { ok: false; reason: "points" }
  | { ok: false; reason: "taken" };

/**
 * 휴면 기준: 마지막 접속(입장 seenAt·머무르기 presenceAt·처음 입장 createdAt 중 가장 늦은 것)에서 이만큼 넘게 지나면
 * 그 계정이 차지한 이름을 다른 사람이 가져갈 수 있고, 돌아오면 닉네임을 다시 정한다. 접속 기록이 전혀 없는 옛 계정은 휴면으로 보지 않는다
 */
export const DORMANT_DAYS = 90;
export const DORMANT_MS = DORMANT_DAYS * 86_400_000;
/** 이름 등록 결과: ok = 이 계정 이름이 됐다, taken = 다른 계정이 쓰는 이름, has = 이미 이름이 있다(휴면 재설정 대상도 아님) */
export type NameClaimResult = "ok" | "taken" | "has";
/** 입장·확인 때 계정 상태: renameRequired = 휴면에서 돌아와 닉네임을 다시 정해야 한다 */
export type VisitResult = { renameRequired: boolean };

/** 날짜 인자는 모두 게임 날짜 `YYYYMMDD` (한국 시간 새벽 5시에 바뀐다 — lib/store/accounts.ts의 kstDay = lib/gameDay). 포인트·가방 변화는 모두 원자적이다 */
/** 머무르기 한 번의 결과 (AccountStore.presenceTick) */
export type PresenceTick = {
  earned: number;
  /** 이번에 센 머문 기록 수 (몰아서 정산하면 2~3) */
  ticks: number;
  points: number;
  lifetimePoints: number;
  todayEarned: number;
  stayTicks: number;
};

/** 11/22 get이 더 읽을 것 — bought = 산 기록(SMEMBERS 하나 더. 내 정보·되팔기만 — 나머지 30곳 넘는 읽기는 이름·가방만 본다) */
export type AccountReadOpts = { bought?: boolean };

export interface AccountStore {
  get(id: string, day: string, now: number, opts?: AccountReadOpts): Promise<AccountRecord>;
  /** 횟수 규칙이 남은 항목의 하루 최대·지갑 상한 안에서 적립하고 실제 쌓인 점수를 돌려준다 (0 = 막힘). 포인트 배수 이벤트로 고른 항목이면 늘어난 점수로 */
  earn(id: string, source: EarnSource, day: string, opts?: EarnOptions): Promise<number>;
  /** 원자적 차감. 잔액이 모자라면 null, 아니면 남은 잔액. reason은 계정의 최근 사용 기록(최대 100개)에 남는다 */
  spend(id: string, amount: number, reason: string, now: number): Promise<number | null>;
  /**
   * 돌려주기 (되팔기·결제 뒤 실패 보상): 잔액만 늘린다 (지갑 상한에서 잘림). 적립이 아니므로
   * 횟수 규칙·모은 포인트·랭킹과 무관하다. reason은 사용 기록에 남는다. 새 잔액을 돌려준다
   */
  refund(id: string, amount: number, reason: string, now: number): Promise<number>;
  /**
   * 11/22 꾸미기 되팔기: 영구로 벗어 둔 꾸미기 itemId를 빼고 amount를 돌려준다 (지갑 상한에서 잘림, 경제 통계 resell — 관리자 경제 탭 「꾸미기 되팔기」). 한 번에 (두 번 눌러도 한 번만).
   * worn = 입고 있다, none = 영구로 벗어 둔 게 없다 (기간제·이미 팜), gift = 산 기록(bought)이 없다 (선물·보상으로 받음). 되면 새 잔액.
   * 팔면 산 기록도 같이 지운다 → 나중에 같은 꾸미기를 선물로 다시 받아도 팔 수 없다
   */
  sellPermanent(id: string, itemId: string, amount: number, reason: string, now: number): Promise<number | "worn" | "none" | "gift">;
  /**
   * 11/22 되팔기 전부터 가진 꾸미기의 산 기록 채우기 (계정마다 한 번 — lib/resellBought). 이미 채웠으면 아무것도 안 하고 false.
   * items를 산 기록에 넣고 채움 표시를 남긴다 (한 번에)
   */
  fillBought(id: string, items: readonly string[]): Promise<boolean>;
  /** 11/22 최근 포인트 사용 기록 (최신 먼저, 최대 100개 — 산 기록 채우기의 구매 근거) */
  ledger(id: string): Promise<{ at: number; amount: number; reason: string }[]>;
  /** 머무르기: 직전 지급 후 PRESENCE_MIN_GAP_MS가 지났으면 적립. 너무 이르면 null */
  presence(id: string, day: string, now: number): Promise<number | null>;
  /**
   * presence와 같은 적립 + 화면이 바로 쓸 값(적립 뒤 잔액·오늘 쌓은 포인트·오늘 머문 기록 수)을 같은 명령 하나로.
   * 머무르기 응답이 계정 전체(loadMe)를 다시 읽지 않게. sid(화면마다 하나)를 주면 presenceCatchup 규칙으로 몰아서 정산. 너무 이르면 null
   */
  presenceTick(id: string, day: string, now: number, sid?: string): Promise<PresenceTick | null>;
  /**
   * 입장 토큰용: 이름·색·몸 모양·지금 입은 꾸미기만 (계정 전체 get = 명령 9개 대신 2개).
   * 11/22 새싹 판정용 처음 입장 시각(createdAt)·총 접속 시간(stayMin, 분)도 같은 HMGET에서 (명령 수 그대로)
   */
  appearance(id: string, now: number): Promise<AccountAppearance>;
  /**
   * 접속 시간 보너스 받기 (원자적): 오늘 머문 기록으로 열린 구간 중 아직 안 받은 구간을 한꺼번에 받는다.
   * 받을 구간이 없으면 null. 받은 구간은 지갑이 가득 차 덜 들어와도 받은 것으로 친다
   */
  /** bonus = 11/16 단 칭호의 머무르기 보상 비율 (구간 보너스 × (1 + bonus) — lib/stayBonus stayBonusAmounts) */
  claimStayBonus(id: string, day: string, bonus?: number): Promise<{ earned: number; count: number } | null>;
  /**
   * 모은 포인트 상위 limit명 + me의 순위(없으면 null). week(그 주 월요일 YYYYMMDD)를 주면 그 주에 모은 포인트 순위.
   * RankEntry.points = 순위 값
   */
  pointRank(limit: number, me: string | null, week?: string): Promise<{ rows: RankEntry[]; mine: RankEntry | null }>;
  /** 총 접속 시간 상위 limit명 + me의 순위. RankEntry.points = 분 (머무르기 기록이 쌓일 때 presenceTick이 같이 올린다) */
  stayRank(limit: number, me: string | null): Promise<{ rows: RankEntry[]; mine: RankEntry | null }>;
  /**
   * 관리자 일괄: 총 접속 시간 기록 전의 머문 시간 채우기. cursor부터 계정 몇 개를 훑어 아직 남은 날짜별 머무르기 기록(오늘 적립 해시 `_stay`,
   * 2일 TTL이라 now 기준 최근 3일치까지)을 더한 값이 지금 총 접속 시간보다 크면 그 값으로 올린다 (더하지 않고 큰 쪽 → 두 번 돌려도 그대로,
   * 배포 뒤 이미 센 기록도 남은 기록 안에 있으니 두 번 세지 않는다). raised = 올린 계정 수, minutes = 올린 분 합계. next = "0"이면 끝
   */
  backfillStay(cursor: string, count: number, now: number): Promise<{ next: string; raised: number; minutes: number }>;
  /** 계정마다 날짜별 머무르기 기록 수 (오늘 적립 해시 `_stay`, 2일 TTL이라 남은 날짜만). [계정][날짜] 순서. 유저 활동 기록 채우기용 */
  stayTicksOn(ids: readonly string[], days: readonly string[]): Promise<number[][]>;
  /**
   * 사냥터 한 판 기록 (49번 랭킹): 처치 수 합계(전체·그 주)를 올리고, 클리어했으면(clearMs) 그 사냥터의
   * 최단 기록(전체·그 주)을 더 짧을 때만 바꾼다. 원자적.
   * weekly = false: 그 주 기록(주간 레이스 사냥 처치·주간 최단)은 건너뛰고 전체 기록만 (자기 레벨보다 한참 쉬운 사냥터)
   * 11/16 zone = 사냥터 id (ZONE_IDS). 깬 기록은 그 난이도 칭호용 판(rank:hunt:clear:{난이도})에도 남긴다.
   * 처치 수만 올릴 때(clearMs = null)는 zone이 최단 기록에 쓰이지 않는다 (야근 빌딩은 "hell")
   */
  recordHunt(id: string, zone: string, run: { kills: number; clearMs: number | null }, week: string, weekly?: boolean): Promise<void>;
  /**
   * 사냥 랭킹: kills = 처치 수 많은 순, best = 그 사냥터 최단 클리어 순(ms, 작을수록 위). week가 없으면 전체.
   * 11/16 zone = 사냥터 id (없으면 쉬움 첫 사냥터). 난이도 첫 사냥터면 옛 난이도 판 기록도 합쳐 보인다 (lib/store/huntBoards)
   */
  huntRank(
    board: "kills" | "best",
    limit: number,
    me: string | null,
    opts: { zone?: string; week?: string },
  ): Promise<{ rows: RankEntry[]; mine: RankEntry | null }>;
  /** 11/16 그 난이도의 사냥터를 하나라도 끝까지 깬 적이 있는지 (옛 난이도 판 포함 — 칭호 「어려움·지옥 완주」) */
  huntCleared(id: string, difficulty: string): Promise<boolean>;
  /**
   * 입장 기록: 이름·색·몸 모양은 계정에 아직 값이 없을 때만 저장한다 (코드로 시작·이어서 들어온 기기의 다른 값이
   * 덮어쓰지 않게). 이름은 이름 색인과 함께 등록하고, 다른 계정이 쓰는 이름이면 저장하지 않는다.
   * 처음 입장한 시각도 한 번만 남긴다. 포인트는 주지 않는다 (10번: 출석은 달력에서 받는다)
   * 11/26 처음 입장한 시각을 이번에 처음 남겼으면(= 새 계정) true (가입 유입을 이때만 저장한다)
   */
  enter(id: string, profile: Profile, now: number): Promise<boolean>;
  /**
   * 10번 출석 달력 한 달 (month = YYYYMM). 처음 부르면 달력 개편 전 출석(마지막 출석일·연속 일수)을
   * 도장으로 옮겨 둔다 (legacyAttendDays, 한 번만)
   */
  attendCalendar(id: string, month: string): Promise<CalendarMonthRecord>;
  /**
   * 오늘 칸 받기 (원자적): 오늘 이미 받았으면 "already"(달력 개편 전 자동 출석 포함), 머문 기록이 needTicks보다
   * 적으면 "stay". 받으면 연속 일수를 갱신하고 도장을 찍은 뒤 출석·7일 연속·한 달 개근(그달 monthDays일을 모두
   * 찍었을 때 한 번) 포인트를 준다. 달력 보상은 항목 하루 최대·지갑 상한을 지킨다.
   */
  claimAttend(id: string, ipHash: string, day: string, yesterday: string, monthDays: number, needTicks: number): Promise<AttendClaim>;
  /**
   * 출석 구간 코디 보상 지급 (원자적, 그달 구간마다 한 번): 그달(month = YYYYMM) 도장 수가 tierDays 이상이고 그 구간을
   * 아직 받지 않았으면 받은 꾸미기를 달력 기록에 남기고 꾸미기를 준다. 기간제(termMs)는 입고 있으면 그 자리, 아니면 벗어 둔
   * 꾸미기의 만료 시각을 늘린다(선물 기간과 같은 규칙 — lib/attendTiers.ts tierUntil). termMs = null이면 영구 소장.
   * 줬으면 true, 이미 받았거나 도장이 모자라면 false
   */
  grantAttendTier(id: string, month: string, tierDays: number, itemId: string, slot: CosmeticSlot, termMs: number | null, now: number): Promise<boolean>;
  /**
   * 주간 랭킹 1위 보상 지급 (원자적, mark마다 한 번 — mark = `${주}:${랭킹}`, 지급 표시는 계정 밖 공용 해시 champ:paid에 남는다).
   * 꾸미기(itemId)는 until까지 빌려 준다: 입고 있으면 그 자리, 아니면 벗어 둔 꾸미기의 만료 시각을 until로 늘린다 (이미 더 길면 그대로 →
   * 같은 사람이 또 1위면 이어진다). 전용 모자는 늘 하나만: 다른 전용 꾸미기(CHAMP_ITEM_IDS)는 가방·벗어 둔 꾸미기·착용 칸에서 거두고,
   * 그걸 입고 있었으면 새 모자를 그 칸에 입힌다. 포인트는 지갑에만 넣고 모은 포인트·전체/주간 포인트 랭킹에는 넣지 않는다 (경제 통계 earn:champ).
   * 실제로 지갑에 들어간 포인트는 champ:wallet(mark → 포인트)에 남긴다 (랭킹 정리 때 이전 지급과 구분). 줬으면 true, 이미 줬으면 false
   */
  grantChamp(id: string, mark: string, itemId: string, slot: CosmeticSlot, until: number, points: number, now: number): Promise<boolean>;
  /**
   * 11/20 지갑 전용 지급 (회장님 독대 판·주간 보상 — lib/chairman): 포인트는 지갑에만 (모은 포인트·전체/주간 포인트 랭킹엔 넣지 않는다, 경제 통계 stat),
   * rent 꾸미기는 until까지 빌려 준다 (입고 있으면 그 자리, 아니면 벗어 둔 꾸미기 — 이미 더 길면 그대로). 원자적. 한 번만은 부르는 쪽 표시가 지킨다.
   * 실제로 지갑에 들어간 포인트
   */
  walletGrant(id: string, points: number, stat: string, now: number, rent?: readonly WalletRent[]): Promise<number>;
  /** 전용 꾸미기 거두기 (시험 해제): 가방·벗어 둔 꾸미기에서 지우고, 착용 중이면 벗긴다 (원자적) */
  revokeChamp(id: string, itemIds: readonly string[]): Promise<void>;
  /** 주간 1위 보상 지급 표시 (mark → 받은 계정, 없으면 null) */
  champPaid(marks: readonly string[]): Promise<(string | null)[]>;
  /** 랭킹 정리용: 보상 포인트가 모은 포인트·전체 랭킹에도 들어가던 때(지갑 전용 표시 champ:wallet가 없는) 지급 표시 전부 */
  legacyChampMarks(): Promise<{ mark: string; accountId: string }[]>;
  /**
   * 한 번짜리 정리(tag)로 모은 포인트(lifetime)·전체 포인트 랭킹에서 amount를 뺀다 (0 아래로는 안 내려간다, 0이 되면 랭킹에서 빠진다).
   * 계정마다 한 번만 (원자적 — 이미 한 계정이면 null). before/after = 뺀 앞뒤 모은 포인트
   */
  unrankOnce(tag: string, id: string, amount: number): Promise<{ before: number; after: number } | null>;
  /** 한 번짜리 작업 표시: 지금 값 (없으면 null). "running" = 진행 중, 그 밖 = 끝난 결과 JSON */
  onceGet(tag: string): Promise<string | null>;
  /** 한 번짜리 작업 시작: 아무도 안 했으면 "running"(ttlSec 뒤 저절로 풀림)으로 잡고 null, 이미 있으면 그 값 */
  onceBegin(tag: string, ttlSec: number): Promise<string | null>;
  /** 한 번짜리 작업 끝: 결과를 영구로 남긴다 (null이면 표시를 지워 다시 할 수 있게) */
  onceEnd(tag: string, value: string | null): Promise<void>;
  /** 개인 코드 해시 교체 (이전 코드는 무효) */
  setCode(id: string, codeHash: string): Promise<void>;
  findByCode(codeHash: string): Promise<string | null>;
  /**
   * 구매. unique(캐릭터 꾸미기)면 가방에 있거나 지금 착용 중이거나 벗어 둔 것(stash, 만료 전)이 있을 때
   * "owned"로 거절한다 (확인과 차감이 한 번에).
   */
  buy(id: string, itemId: string, price: number, opts?: { unique?: boolean; now?: number }): Promise<"ok" | "insufficient" | "owned">;
  /**
   * 11/15 기간 이용권 넣기 (야근 빌딩 상자 꾸미기, 0P): 입고 있으면 그 자리, 아니면 벗어 둔 꾸미기의 만료 시각을 ms만큼 늘린다
   * (선물 기간 규칙 giftTermUntil과 같다). 이미 영구로 가졌으면 "owned" (아무것도 바꾸지 않는다)
   */
  grantTerm(id: string, itemId: string, ms: number, now: number): Promise<"ok" | "owned">;
  /** 가방에서 1개 쓰기. 없으면 false */
  consume(id: string, itemId: string): Promise<boolean>;
  /**
   * 가방에서 1개 쓰고 그 부위에 착용. 같은 부위에 입던 것은 사라지지 않고 벗어 둔 꾸미기(stash)로 옮긴다
   * (이미 만료됐으면 버린다). 같은 아이템이 stash에 있으면 지운다 (새로 입는 쪽이 더 오래 간다 → 한 아이템은
   * 입은 곳과 stash 중 한 곳에만 있다). now는 만료 판정 기준 (만료된 착용품·stash는 이때 정리한다). 가방에 없으면 false.
   * 11/22 이미 영구로 가진 꾸미기면 이용권을 쓰지 않고 영구 그대로 입힌다 (true) — 영구가 이용권 기간으로 줄지 않는다.
   * 기간제로 가진 것(입었든 벗어 뒀든)이면 남은 기간에 이용 기간(until − now)을 더한다
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
   * 칭호 끼우기·빼기 (titleId = null이면 뺀다). 착용 해시의 "title" 칸에 영구로 둔다 → 착용 목록(lookOf)에 같이 실려
   * 입장 토큰·착용 증서로 다른 사람 머리 위에도 보인다. 얻었는지는 호출자(lib/titlesServer)가 확인한다
   */
  setTitle(id: string, titleId: string | null): Promise<void>;
  /** 11/16 지금 단 칭호 id만 (착용 해시 "title" 칸 HGET 1번 — 칭호 능력 기억이 없을 때만 lib/titlesServer wornTitle이 부른다) */
  wornTitle(id: string, now: number): Promise<string | null>;
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
   * 디자인권 1개로 묘비 2개를 동시에 세울 수 없다. 가방에 없으면 저장하지 않고 false.
   * 11/18 mustExist(수정): 묘비가 묘역에 없으면 디자인권을 쓰지 않고 "gone"
   */
  putGraveUsing(id: string, itemId: string, grave: Grave, mustExist?: boolean): Promise<boolean | "gone">;
  /** 관리자 포인트 조정. 0~WALLET_MAX로 자르고 횟수 규칙과는 무관. 지갑만 바뀐다 (모은 포인트·포인트 랭킹엔 넣지 않는다). 없는 계정이면 null */
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

  // ── 닉네임 중복 금지 (이름 색인: nameKey → 계정 id). 등록·변경·휴면 점유 교체는 모두 원자적이다 ──
  /** 그 이름(비교 키)을 지금 쓰는 계정. 점유자가 휴면이면 null (가져갈 수 있다) */
  nameOwner(key: string, now: number): Promise<string | null>;
  /**
   * 계정에 이름이 없거나 휴면 재설정 중일 때 그 이름으로 등록한다 (색인 등록·계정 이름 저장이 한 번에, 무료·쿨다운 없음).
   * 다른 계정이 쓰는 이름이면 taken (점유자가 휴면이면 가져온다). 등록하면 마지막 입장 시각도 now로
   */
  claimName(id: string, name: string, now: number): Promise<NameClaimResult>;
  /**
   * 입장·계정 확인 때: 휴면이면 재설정 표시를 남기고 그 계정이 차지한 이름 색인을 푼다. touch면(마을에 들어올 때) 마지막 입장 시각을 now로.
   * 색인에 없는 옛 계정 이름은 여기서 색인에 채운다 (이미 다른 계정이 차지했으면 이름은 그대로 두고 nameDup 표시만)
   */
  visit(id: string, now: number, touch: boolean): Promise<VisitResult>;
  /** 관리자 일괄 색인: cursor부터 계정 몇 개를 훑어 색인에 채운다. next = "0"이면 끝 */
  reindexNames(cursor: string, count: number, now: number): Promise<{ next: string; indexed: number; dup: number }>;
  setTutorialDone(id: string): Promise<void>;
  /**
   * 11/18 새 이웃 꾸러미 받기 (원자적으로 한 번): 받은 수가 expect일 때만 받은 수 + grant.count·오늘 날짜를 적고 가방·기간제 꾸미기를 넣는다.
   * 11/19 밀린 꾸러미를 한꺼번에 (하루 한 번 제한 없음 — 받을 수는 서버가 가입한 날부터 센다). 사냥 가방 몫은 gpPot에 적어 두고 서버가 따로
   */
  claimGiftPath(id: string, day: string, expect: number, grant: PathGrant, now: number): Promise<PathClaim>;
  /** 꾸러미 창이 오늘 저절로 열렸다 (하루 한 번) */
  markPathSeen(id: string, day: string): Promise<void>;
  /** 사냥 가방 몫을 넣었으면 표시를 지운다 */
  clearPathPotions(id: string): Promise<void>;
  /** 첫 걸음 미션 한 칸 표시 (비트). mask = 새 비트 마스크, fresh = 이번에 처음 켰다 (그 칸 작은 선물을 줄 때). 큰 선물까지 받았으면 null */
  markFirstStep(id: string, bit: number): Promise<{ mask: number; fresh: boolean } | null>;
  /** 첫 걸음 큰 선물 (미션을 다 했을 때 한 번): 가방 아이템. 받으면 1, 이미 받았으면 -1, 덜 했으면 -2 (사냥 가방 몫은 서버가 따로) */
  claimFirstSteps(id: string, day: string, all: number, item: { itemId: string; count: number }, now: number): Promise<number>;
  /**
   * 오늘의 할 일 받기 (원자적으로 한 번): which 0..2 = 그 칸(진행 칸 field가 need 이상일 때), 3 = 셋 다(0..2를 다 받았을 때 — 도장 +1).
   * 받으면 1 (셋 다는 올린 뒤 도장 수), 이미 받았으면 -1, 아직이면 -2 (포인트·사냥 가방 몫은 서버가 따로)
   */
  claimTodo(id: string, day: string, which: number, field: string, need: number, now: number): Promise<number>;
  /** 날짜(YYYYMMDD)별 경제 통계 필드: `earn:{source}`, `spend:{분류}`, `refund` (운영자 계정 활동은 ECON_STAFF_EXCLUDED_FROM부터 빠져 있다) */
  economy(days: string[]): Promise<{ date: string; fields: Record<string, number> }[]>;
  /** 포인트를 가진 적 있는 계정 수와 지갑 잔액 합계. exclude(운영자 계정)는 빼고 센다 */
  walletTotals(exclude?: string | null): Promise<{ wallets: number; accounts: number }>;

  // ── 관리자 회원 목록 (lib/adminMembers.ts) ──
  /** 계정 요약 (ids 순서대로, 없는 계정은 null). 계정 해시만 읽는다 */
  summaries(ids: readonly string[]): Promise<(AccountSummary | null)[]>;
  /** 모든 계정을 cursor부터 count개 안팎씩 훑는다 (Redis SCAN과 같은 약속: next = "0"이면 끝, 한 번에 나오는 수는 count와 다를 수 있다) */
  scanAccounts(cursor: string, count: number): Promise<{ next: string; accounts: AccountSummary[] }>;
  /** 11/26 scanAccounts에서 계정 id만 (요약은 summaries로 따로 — 훑기와 요약 읽기를 겹쳐 돌리려고) */
  scanIds(cursor: string, count: number): Promise<{ next: string; ids: string[] }>;
}

/** 관리자 회원 목록 한 줄의 원재료 (계정 해시에서 바로 읽는 값) */
/** 지갑 전용 지급에 함께 빌려 주는 꾸미기 (AccountStore.walletGrant) */
export type WalletRent = { itemId: string; slot: CosmeticSlot; until: number };

export type AccountSummary = {
  accountId: string;
  name: string | null;
  /** 처음 입장 시각 (0 = 모름: 기록 전 옛 계정) */
  createdAt: number;
  /** 마지막 접속 = 입장 seenAt·머무르기 presenceAt·처음 입장 createdAt 중 가장 늦은 것 (0 = 기록 없음) */
  lastSeenAt: number;
  points: number;
  /** 휴면에서 돌아와 닉네임을 다시 정해야 한다 */
  renameRequired: boolean;
  hasCode: boolean;
  /** 총 접속 시간 (분, 기록 전 옛 계정은 채우기 전까지 0) */
  stayMinutes: number;
  /** 모은 포인트 (써도 줄지 않는다, 개편 전 계정은 지금 잔액) */
  lifetimePoints: number;
};

/** 포인트 사용 사유 → 경제 통계 분류 (사유 앞부분으로 나눈다) */
export function spendCategory(reason: string): string {
  if (reason.startsWith("housing")) return "housing";
  if (reason.startsWith("사냥터") || reason.startsWith("rpg")) return "rpg";
  if (reason.startsWith("name")) return "name";
  if (reason.startsWith("shop")) return "shop";
  if (reason.startsWith("admin")) return "admin";
  if (reason.startsWith("lottery")) return "lottery";
  // 11/27 좌대 입장권·연장 (lib/raft — Redis는 좌대 Lua가 spend:raft로 바로 센다)
  if (reason.startsWith("raft")) return "raft";
  return "other";
}
