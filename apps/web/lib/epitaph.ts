// 날짜/향년/묘비명 유틸 (클라이언트·서버 공용)

const DAY = 86_400_000;

/** YYYY-MM-DD → UTC 자정 ms. 형식이 틀리면 NaN */
export function parseYmd(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}

/** 오늘 날짜(KST) YYYY-MM-DD */
export function todayKst(now = Date.now()): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 향년(일). 탄생일과 사망일이 같으면 1일 */
export function ageDays(bornAt: string, diedAt: string): number {
  const a = parseYmd(bornAt);
  const b = parseYmd(diedAt);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / DAY) + 1;
}

/** 기본 묘비명 제안: `향년 {N}일, {마지막으로 하던 일} 중 별세` (30자 이내로 자름) */
export function suggestEpitaph(age: number, lastTask?: string): string {
  const task = lastTask?.trim();
  const s = task ? `향년 ${age}일, ${task} 중 별세` : `향년 ${age}일, 조용히 별세`;
  return [...s].slice(0, 30).join("");
}

/** `YYYY.MM.DD ~ YYYY.MM.DD (향년 N일)` */
export function lifespanLabel(bornAt: string, diedAt: string, age: number): string {
  const f = (s: string) => s.replaceAll("-", ".");
  return `${f(bornAt)} ~ ${f(diedAt)} (향년 ${age}일)`;
}
