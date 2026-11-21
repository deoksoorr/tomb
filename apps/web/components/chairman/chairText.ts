import { CHAIR_POINTS_PER_MIN, CHAIR_RUNS_PER_DAY, type ChairMode } from "@/lib/chairman/rules";

// 11/20 회장님 독대 입장 창·전광판 글 (순수 — chairText.test.ts)

export const MODE_NAME: Record<ChairMode, string> = { normal: "노멀", hell: "헬" };

export const num = (n: number) => Math.max(0, Math.round(n)).toLocaleString("en-US");

/** 판 포인트 줄 (크런치 전 기본, 크런치(5분)부터 두 배 — lib/chairman/rules chairTimePoints) */
export const pointsLine = (m: ChairMode) => `1분에 ${CHAIR_POINTS_PER_MIN[m]}P, 크런치 땐 ${CHAIR_POINTS_PER_MIN[m] * 2}P`;

/** 헬 딱지: 45초마다 스킬 봉인 */
export const sealTag = (everyMs: number) => `${Math.round(everyMs / 1000)}초마다 자동 반려`;
/** 11/21 헬 규칙 (입장 창 헬 카드에만 — 11/22 헬 확인·브리핑은 짧게) — 순서는 패시브 70% 먼저, 레벨 높은 것부터 (lib/chairman/rules chairSealOrder) */
export const sealRule = (everyMs: number) => `${Math.round(everyMs / 1000)}초마다 회장님이 스킬을 하나씩 반려해요. 주로 패시브부터, 레벨이 높은 것부터예요. 무엇이 반려될지는 3초 전에 알려 드려요.`;
/** 11/22 업무 브리핑 헬 한 줄 (자세한 규칙은 입장 창 헬 카드에 한 번만) */
export const sealBrief = (everyMs: number) => `${Math.round(everyMs / 1000)}초마다 스킬이 하나씩 반려돼요`;

/** 이번 주 순위 칸 */
export function weekText(w: { rank: number } | null): string {
  if (!w) return "기록 없음";
  return w.rank === 1 ? "1위 ★" : `${w.rank}위`;
}

export type GoState = { label: string; disabled: boolean };

/** 출근 단추: 자격 없음·연습·오늘 판 다 씀 */
export function goState(mode: ChairMode, o: { eligible: boolean; remaining: number; practice: boolean; busy: boolean }): GoState {
  const n = MODE_NAME[mode];
  if (o.practice) return { label: `${n} 연습하기`, disabled: !o.eligible || o.busy };
  if (o.eligible && o.remaining <= 0) return { label: "오늘 판 다 씀", disabled: true };
  return { label: mode === "normal" ? "노멀로 사직서 내기" : "헬로 사직서 내기", disabled: !o.eligible || o.busy };
}

/** 오늘 남은 판 칸 (켜진 칸 수) */
export const pips = (left: number) => Array.from({ length: CHAIR_RUNS_PER_DAY }, (_, i) => i < left);
export const runsText = (left: number) => `${Math.max(0, left)} / ${CHAIR_RUNS_PER_DAY}`;

/** 전광판 글 (3×5 LED — 영문 대문자·숫자·기호만). 이번 주 노멀 1위가 있으면 그 피해 */
export function ledLine(top: { damage: number } | null): string {
  return top && top.damage > 0 ? `PANGYO LIGHTHOUSE * THIS WEEK #1 ${num(top.damage)} * ` : "PANGYO LIGHTHOUSE * CEO 1:1 MEETING * ";
}

/** 이름표 (한글 이름 — 너무 길면 자른다) */
export function boardName(name: string | null | undefined): string | null {
  const n = name?.trim();
  if (!n) return null;
  const s = [...n];
  return `이번 주 1위 ${s.length > 10 ? `${s.slice(0, 10).join("")}…` : n}`;
}

/** 버틴 시간 열 "14:32" (옛 기록은 "-") */
export function msClock(ms?: number | null): string {
  if (!ms || ms <= 0) return "-";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 「14분 32초 버팀」 (옛 기록은 null) */
export function lastedText(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${s % 60}초 버팀` : `${s}초 버팀`;
}
