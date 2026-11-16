// 포인트 배수 이벤트 (관리자가 켜고 끈다 — 주말 이벤트 등). 저장소는 lib/store/pointEvent.ts, 관리자 화면은 components/admin/PointEventPanel.tsx.
//  - 관리자가 고른 항목(sources)만: 켜져 있는 동안 그 항목 적립이 mult배 (AccountStore.earn·머무르기·접속 시간 보너스)
//  - 이벤트가 걸친 게임 날(새벽 5시 기준)은 고른 항목의 하루 한도도 mult배, 하루 전체 한도는 그만큼만 늘어난다 (= 항목 한도의 합).
//    도중에 끝나도 그날은 늘어난 한도 그대로 (끝나자마자 0P가 되지 않게)
//  - 지갑 상한·출석 달력 보상(출석·7일 연속·한 달 개근)·선물·관리자 지급·환불·사용은 그대로
// 클라이언트·서버 공용 (화면의 안내 띠·오늘 포인트 게이지가 같은 계산을 쓴다)

import { DAILY_EARN_CAP, EARN_RULES, earnRule, inDailyTotal, type EarnSource } from "./economy";
import { dayStartMs, gameDay } from "./gameDay";

/** 고를 수 있는 배수 (기본 2배). 정수만 — Redis Lua가 정수로 더한다 */
export const POINT_EVENT_MULTS = [2, 3] as const;
export const POINT_EVENT_MULT = 2;
/** 끝나는 시각을 정할 수 있는 가장 먼 때 (켠 때부터) */
export const POINT_EVENT_MAX_MS = 14 * 86_400_000;

/** 이벤트와 상관없는 항목 (출석 달력 보상은 늘 그대로) */
const UNBOOSTED: ReadonlySet<EarnSource> = new Set<EarnSource>(["attend", "streak", "monthly"]);
/** 이벤트로 고를 수 있는 항목 (EARN_RULES 순서) */
export const BOOSTABLE_SOURCES: readonly EarnSource[] = EARN_RULES.map((r) => r.source).filter((s) => !UNBOOSTED.has(s));

/**
 * 저장 형태. startAt = 켠 시각, endAt = 저절로 꺼지는 시각 (null = 끌 때까지). 끄면 endAt을 끈 시각으로 바꾼다.
 * sources = 늘어나는 항목 (예전 값처럼 없으면 전부), mult = 배수
 */
export type PointEvent = { startAt: number; endAt: number | null; sources: EarnSource[]; mult: number };

/** 적립 배수: on = 지금 적립이 mult배인 항목, caps = 오늘 하루 한도가 mult배인 항목 */
export type EarnBoost = { mult: number; on: EarnSource[]; caps: EarnSource[] };
export const NO_BOOST: EarnBoost = { mult: 1, on: [], caps: [] };

export const isBoosted = (b: EarnBoost) => b.caps.length > 0;
/** 그 항목 적립에 곱하는 수 */
export const pointsMult = (b: EarnBoost, s: EarnSource) => (b.on.includes(s) ? b.mult : 1);
/** 그 항목 하루 한도에 곱하는 수 */
export const capsMult = (b: EarnBoost, s: EarnSource) => (b.caps.includes(s) ? b.mult : 1);
/** 오늘 하루 전체 한도: 늘어난 항목의 늘어난 몫만 더한다 (= 하루 전체에 드는 항목 한도의 합) */
export const boostedTotalCap = (b: EarnBoost) =>
  b.caps.reduce((n, s) => (inDailyTotal(s) ? n + earnRule(s).dailyMax * (b.mult - 1) : n), DAILY_EARN_CAP);

/** 저장소가 한 번 적립할 때 쓰는 값: points·caps = 그 항목 적립·한도 배수, total = 오늘 하루 전체 한도 */
export const earnLimits = (b: EarnBoost, s: EarnSource) => ({ points: pointsMult(b, s), caps: capsMult(b, s), total: boostedTotalCap(b) });

/** 지금 적립이 늘어나는 중인지 */
export const pointEventOn = (ev: PointEvent | null, now: number): boolean => !!ev && ev.startAt <= now && (ev.endAt === null || now < ev.endAt);

/** now의 적립 배수. 한도는 이벤트가 오늘(게임 날) 한 번이라도 켜져 있었으면 */
export function earnBoostAt(ev: PointEvent | null, now: number): EarnBoost {
  if (!ev || ev.startAt > now) return NO_BOOST;
  const touched = ev.endAt === null || ev.endAt > dayStartMs(gameDay(now));
  if (!touched) return NO_BOOST;
  return { mult: ev.mult, on: pointEventOn(ev, now) ? [...ev.sources] : [], caps: [...ev.sources] };
}

/**
 * 늘어난 적립(earned)이 원래 값으로 얼마어치인지 (asked 이하). 값 단위로 계산하는 쪽(낚시·채집 팔기, 도감 보상, 사냥터 되팔기)이
 * 한도에 막혀 못 받은 만큼을 되돌릴 때 쓴다. mult = 그 항목 적립 배수 (pointsMult), 1이면 earned 그대로
 */
export const paidOf = (earned: number, asked: number, mult: number) => Math.min(asked, Math.ceil(earned / mult));

/** 저장소·응답에서 읽은 값을 안전한 설정으로 (모르는 값·고른 항목이 없으면 null = 꺼짐). 항목이 없는 예전 값은 전부 */
export function normalizePointEvent(raw: unknown): PointEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { startAt?: unknown; endAt?: unknown; sources?: unknown; mult?: unknown };
  if (typeof o.startAt !== "number" || !Number.isFinite(o.startAt)) return null;
  const endAt = typeof o.endAt === "number" && Number.isFinite(o.endAt) ? o.endAt : null;
  const picked = Array.isArray(o.sources) ? new Set(o.sources) : null;
  const sources = picked ? BOOSTABLE_SOURCES.filter((s) => picked.has(s)) : [...BOOSTABLE_SOURCES];
  if (!sources.length) return null;
  const mult = (POINT_EVENT_MULTS as readonly unknown[]).includes(o.mult) ? (o.mult as number) : POINT_EVENT_MULT;
  return { startAt: o.startAt, endAt, sources, mult };
}

/** 고를 수 있는 항목을 전부 골랐는지 */
export const allSources = (sources: readonly EarnSource[]) => BOOSTABLE_SOURCES.every((s) => sources.includes(s));

/** 마지막 글자에 받침이 있는지 (한글이 아니면 없다고 본다) */
function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0;
}
const labelOf = (s: EarnSource) => earnRule(s).label;

/** 이벤트 항목 문구 (안내 띠): "포인트"(전부), "사냥터 포인트", "사냥터와 곤충 채집 포인트", "사냥터 포함 4가지 포인트" */
export function pointEventWhat(sources: readonly EarnSource[]): string {
  if (!sources.length || allSources(sources)) return "포인트";
  const [a, b] = sources.map(labelOf);
  if (sources.length === 1) return `${a} 포인트`;
  if (sources.length === 2) return `${a}${hasBatchim(a) ? "과" : "와"} ${b} 포인트`;
  return `${a} 포함 ${sources.length}가지 포인트`;
}

/** 이벤트 항목 목록 문구 (관리자 화면): "모든 항목이", "사냥터, 곤충 채집이" */
export function pointEventListText(sources: readonly EarnSource[]): string {
  if (allSources(sources)) return "모든 항목이";
  const text = sources.map(labelOf).join(", ");
  return `${text}${hasBatchim(text) ? "이" : "가"}`;
}

const KST_MS = 9 * 3_600_000;
const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/** 한국 시간 시각 문구: "새벽 5시", "낮 12시", "오후 3시 30분", "밤 11시" */
function clockText(h: number, m: number): string {
  const part = h < 6 ? "새벽" : h < 12 ? "오전" : h === 12 ? "낮" : h < 18 ? "오후" : "밤";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${part} ${h12}시${m ? ` ${m}분` : ""}`;
}

/** 끝나는 때 문구 (한국 시간): "오늘 밤 11시", "내일 새벽 5시", "월요일 새벽 5시", "11월 30일 새벽 5시" */
export function pointEventEndText(endAt: number, now: number): string {
  const e = new Date(endAt + KST_MS);
  const dayOf = (t: number) => Math.floor((t + KST_MS) / 86_400_000);
  const diff = dayOf(endAt) - dayOf(now);
  const day =
    diff <= 0 ? "오늘" : diff === 1 ? "내일" : diff < 7 ? WEEKDAYS[e.getUTCDay()] : `${e.getUTCMonth() + 1}월 ${e.getUTCDate()}일`;
  return `${day} ${clockText(e.getUTCHours(), e.getUTCMinutes())}`;
}

/** 게임 화면 안내 띠 문구: "사냥터와 별자리 잇기 포인트 2배 이벤트 중이에요. 월요일 새벽 5시까지" */
export function pointEventBanner(ev: PointEvent, now: number): string {
  const head = `${pointEventWhat(ev.sources)} ${ev.mult}배 이벤트 중이에요.`;
  return ev.endAt === null ? head : `${head} ${pointEventEndText(ev.endAt, now)}까지`;
}

/** GET /api/point-event (게임 화면 안내 띠, CDN 캐시) · GET/POST /api/admin/point-event 응답. 공개 쪽은 오늘과 상관없는 이벤트면 null */
export type PointEventResponse = { event: PointEvent | null };
