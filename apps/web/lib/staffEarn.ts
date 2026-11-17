// 운영자 「포인트 현황」 (화면·서버 공용). 서버는 app/api/staff/earn, 화면은 components/overlay/StaffEarnDialog.tsx.
//  - 게이지 계산은 내 정보의 오늘 포인트 게이지와 같은 함수(earnGaugeRows)라 플레이어가 보는 값과 같다 (포인트 배수 이벤트로 늘어난 한도 포함)
//  - 계정 id는 내보내지 않는다. 지금 채널 사람들은 화면이 아는 이름으로 묻는다

import type { EarnSource } from "./economy";
import { earnGaugeRows, type EarnGaugeView } from "./earnGauge";
import type { EarnBoost } from "./pointEvent";

/** 한 번에 물을 수 있는 이름 수 (한 채널에 보이는 사람보다 넉넉히) */
export const STAFF_EARN_MAX_NAMES = 60;
/** 오늘 들어온 계정: 이만큼까지만 본다 */
export const STAFF_EARN_TODAY_MAX = 500;

/** 요청: 지금 채널 사람들(이름) 또는 오늘 들어온 모든 계정 */
/** 11/17 channel = 그 채널에 지금 접속한 사람 모두 (마을·캠핑장·바닷가·집·사냥터 어디에 있든 — 실시간 서버에 묻는다) */
export type StaffEarnRequest = { mode: "names"; names: string[] } | { mode: "today" } | { mode: "channel"; channel: number };

/** 한 사람의 오늘 적립. total = 하루 합계, by = 항목별 */
export type StaffEarnRow = { name: string; total: number; by: Partial<Record<EarnSource, number>> };

export type StaffEarnResponse = {
  /** 게임 날짜 YYYYMMDD (새벽 5시에 바뀐다) */
  day: string;
  /** 오늘 포인트 배수 이벤트 (없으면 mult 1) — 한도 계산에 그대로 쓴다 */
  boost: EarnBoost;
  rows: StaffEarnRow[];
  /** names: 찾지 못한 이름 (계정이 없거나 이름이 바뀌었다) */
  missing?: string[];
  /** today: 오늘 들어온 계정이 STAFF_EARN_TODAY_MAX보다 많아 다 보지 못했다 */
  truncated?: boolean;
};

/** 화면 한 줄: 게이지 계산까지 마친 것 */
export type StaffEarnView = StaffEarnRow & { view: EarnGaugeView; pct: number; full: boolean };

/** 게이지 계산 + 정렬 (오늘 한도를 많이 채운 순, 같으면 받은 포인트·이름 순) */
export function staffEarnViews(rows: readonly StaffEarnRow[], boost: EarnBoost): StaffEarnView[] {
  return rows
    .map((r) => {
      const view = earnGaugeRows(r.total, r.by, boost);
      return { ...r, view, pct: Math.round(view.total.ratio * 100), full: view.total.full };
    })
    .sort((a, b) => b.view.total.ratio - a.view.total.ratio || b.total - a.total || a.name.localeCompare(b.name, "ko"));
}
