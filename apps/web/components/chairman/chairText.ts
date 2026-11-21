import { addDays } from "@/lib/gameDay";
import { CHAIR_POINTS_PER_MIN, CHAIR_RUNS_PER_DAY, type ChairMode } from "@/lib/chairman/rules";
import { chairPerkName, type ChairPerk } from "@/lib/chairPerks";

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

/** 오늘 남은 판 칸 (켜진 칸 수). max = 하루 판 수 (11/24 2관왕 혜택이면 3 — 상태 응답 perDay) */
export const pips = (left: number, max: number = CHAIR_RUNS_PER_DAY) => Array.from({ length: max }, (_, i) => i < left);
export const runsText = (left: number, max: number = CHAIR_RUNS_PER_DAY) => `${Math.max(0, left)} / ${max}`;

/** 입장 창 아래 판 수 안내 (11/24 2관왕이면 3판 + 혜택 이름) */
export function runsNote(perDay: number = CHAIR_RUNS_PER_DAY, perk?: ChairPerk | null): string {
  const extra = perDay > CHAIR_RUNS_PER_DAY && chairPerkName(perk) ? ` 「${chairPerkName(perk)}」 혜택으로 한 판씩 더 해요.` : "";
  return `포인트를 주는 판은 하루 노멀 ${perDay}판, 헬 ${perDay}판이에요 (새벽 5시 초기화).${extra} 다 쓰면 연습 판만 열려요. 받은 포인트는 바로 쓸 수 있지만, 포인트 랭킹과 포인트왕 레이스에는 들어가지 않아요.`;
}

type Lead = { name: string; damage: number } | null;
/** 모드마다 이번 주 현재 1위 */
export type BoardTops = Record<ChairMode, Lead>;

/** 11/22 전광판 글 (3×5 LED — 영문 대문자·숫자·기호만). 노멀·헬 현재 1위 피해를 차례로 (없는 모드는 WAITING) */
export function ledLine(tops: BoardTops | null): string {
  const n = tops?.normal && tops.normal.damage > 0 ? tops.normal : null;
  const h = tops?.hell && tops.hell.damage > 0 ? tops.hell : null;
  if (!n && !h) return "PANGYO LIGHTHOUSE * CEO 1:1 MEETING * ";
  const part = (label: string, t: Lead) => (t ? `${label} NOW #1 ${num(t.damage)}` : `${label} #1 WAITING`);
  return `PANGYO LIGHTHOUSE * ${part("NORMAL", n)} * ${part("HELL", h)} * `;
}

/** 이름이 너무 길면 자른다 */
const clip = (name: string) => {
  const s = [...name.trim()];
  return s.length > 10 ? `${s.slice(0, 10).join("")}…` : s.join("");
};

/** 11/22 등대 이름표 줄 (노멀 → 헬 차례로 번갈아 — 한글은 LED로 못 그려서 마을 이름표 글씨). 두 모드 다 비면 [] */
export function boardTags(tops: BoardTops | null): { mode: ChairMode; text: string }[] {
  const ok = (t: Lead) => !!t && t.damage > 0 && !!t.name?.trim();
  if (!tops || (!ok(tops.normal) && !ok(tops.hell))) return [];
  return (["normal", "hell"] as const).map((m) => {
    const t = tops[m];
    return { mode: m, text: t && ok(t) ? `${MODE_NAME[m]} 현재 1위 ${clip(t.name)} ${num(t.damage)}` : `${MODE_NAME[m]} 1위를 기다리고 있어요` };
  });
}

/** 11/22 「이번 주 현재 1위」 이름 (레이스 탭 모드 카드) */
export const LEAD_LABEL = "이번 주 현재 1위";

/** 피해 칸 「피해 48,213,904」 */
export const dmgText = (n: number) => `피해 ${num(n)}`;

/** 11/22 「버틴 시간 14:32」 (옛 기록은 null) */
export function lastedText(ms?: number | null): string | null {
  return ms && ms > 0 ? `버틴 시간 ${msClock(ms)}` : null;
}

/** 11/22 명예의 전당 주 「11월 30일 정산」 (주 = 월요일 시작, 정산은 다음 월요일 새벽 5시) */
export function hallWeekText(week: string): string {
  const d = addDays(week, 7);
  return `${Number(d.slice(4, 6))}월 ${Number(d.slice(6, 8))}일 정산`;
}

/** 11/22 명예의 전당이 비었을 때 */
export const HALL_EMPTY = "첫 명예의 전당은 11월 30일 월요일 새벽 5시 정산 뒤에 채워져요.";

/** 버틴 시간 열 "14:32" (옛 기록은 "-") */
export function msClock(ms?: number | null): string {
  if (!ms || ms <= 0) return "-";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
