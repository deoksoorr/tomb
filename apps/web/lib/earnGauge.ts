// 내 정보의 "오늘 포인트" 게이지 계산 (화면·서버 공용 순수 함수). 한도 값은 모두 lib/economy.ts EARN_RULES에서 온다.
//  - 서버: 오늘 적립 해시(acct:{id}:earn:{날짜})에서 항목 값만 골라 me.earnedBy로 싣는다 (earnedBySource)
//  - 화면: 큰 게이지 1개(하루 전체 한도) + 항목별 작은 게이지 (earnGaugeRows)
//  - 포인트 배수 이벤트 날은 고른 항목 한도만 늘어나고, 하루 전체 한도는 그 몫만큼 늘어난다 (me.earnBoost, lib/pointEvent)

import { EARN_RULES, type EarnRule, type EarnSource } from "./economy";
import { boostedTotalCap, capsMult, NO_BOOST, type EarnBoost } from "./pointEvent";

const SOURCES: ReadonlySet<string> = new Set(EARN_RULES.map((r) => r.source));

/** 오늘 적립 해시의 필드들 → 항목별 오늘 적립 (`_total`·`_stay`·`_bonus` 같은 내부 필드와 0 이하는 뺀다) */
export function earnedBySource(entries: Iterable<readonly [string, unknown]>): Partial<Record<EarnSource, number>> {
  const out: Partial<Record<EarnSource, number>> = {};
  for (const [k, v] of entries) {
    const n = Math.floor(Number(v));
    if (SOURCES.has(k) && n > 0) out[k as EarnSource] = n;
  }
  return out;
}

export type Gauge = { value: number; max: number; ratio: number; full: boolean };

/** 막대 하나: 값은 0..max로 자르고(넘쳐도 100%), 한도가 0이면 비어 있는 막대 */
export function gaugeOf(earned: number, max: number): Gauge {
  const m = Math.max(0, Math.floor(max) || 0);
  const value = Math.min(m, Math.max(0, Math.floor(earned) || 0));
  return { value, max: m, ratio: m > 0 ? value / m : 0, full: m > 0 && value >= m };
}

/** 많이 쓰는 항목 (위에 늘 보인다). 나머지는 접어 둔다 */
export const MAIN_SOURCES: readonly EarnSource[] = ["hunt", "bugs", "stars", "fish", "gather"];
/** 접어 둔 항목의 순서. 여기 없는 새 항목은 맨 뒤에 붙는다 */
const REST_ORDER: readonly EarnSource[] = ["dex", "goblin", "presence", "wish", "flower", "bury", "gotFlower", "houseLike"];
/** 하루 전체 한도와 따로 세는 보상. 7일 연속·한 달 개근은 받은 날에만 보인다 */
const SEPARATE: readonly EarnSource[] = ["attend", "stayBonus", "streak", "monthly"];
const ONLY_WHEN_EARNED: ReadonlySet<EarnSource> = new Set<EarnSource>(["streak", "monthly"]);

/** boosted = 오늘 포인트 배수 이벤트로 한도가 늘어난 항목이면 그 배수 */
export type GaugeRow = Gauge & { source: EarnSource; label: string; boosted?: number };
export type EarnGaugeView = {
  /** 하루 전체 한도 (DAILY_EARN_CAP, 이벤트 날이면 늘어난 항목 몫만큼 더) 대비 오늘 쌓은 포인트 */
  total: Gauge;
  /** 많이 쓰는 항목 */
  main: GaugeRow[];
  /** 하루 전체 한도에 드는 나머지 항목 (접어 둔다) */
  rest: GaugeRow[];
  /** 하루 전체 한도와 따로 세는 보상 (출석 도장·접속 시간 보너스 …) */
  separate: GaugeRow[];
};

const restRank = (s: EarnSource) => {
  const i = REST_ORDER.indexOf(s);
  return i < 0 ? REST_ORDER.length : i;
};

function row(r: EarnRule, by: Partial<Record<EarnSource, number>>, boost: EarnBoost): GaugeRow {
  const m = capsMult(boost, r.source);
  return { source: r.source, label: r.label, ...gaugeOf(by[r.source] ?? 0, r.dailyMax * m), ...(m > 1 ? { boosted: m } : {}) };
}

/** 화면에 그릴 게이지 목록. todayEarned = me.todayEarned (서버의 하루 합계 `_total`), boost = me.earnBoost (포인트 배수 이벤트 날) */
export function earnGaugeRows(todayEarned: number, by: Partial<Record<EarnSource, number>> = {}, boost: EarnBoost = NO_BOOST): EarnGaugeView {
  const rule = (s: EarnSource) => EARN_RULES.find((r) => r.source === s)!;
  const sep = new Set<EarnSource>(SEPARATE);
  const main = new Set<EarnSource>(MAIN_SOURCES);
  return {
    total: gaugeOf(todayEarned, boostedTotalCap(boost)),
    main: MAIN_SOURCES.map((s) => row(rule(s), by, boost)),
    rest: EARN_RULES.filter((r) => !main.has(r.source) && !sep.has(r.source))
      .sort((a, b) => restRank(a.source) - restRank(b.source))
      .map((r) => row(r, by, boost)),
    separate: SEPARATE.filter((s) => !ONLY_WHEN_EARNED.has(s) || (by[s] ?? 0) > 0).map((s) => row(rule(s), by, boost)),
  };
}

/** 다음 초기화까지 남은 시간 문구 ("3시간 20분", "45분", "1분") */
export function resetLeftText(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
