// 11/26 점검 예상 끝 시각 문구 (KST, 예: "11월 26일 오후 3:30") — 미들웨어 점검 화면·게임 안 점검 화면·관리자 화면이 같이 쓴다 (순수)

export function maintUntilLabel(until: number | null | undefined): string | null {
  if (!until) return null;
  const d = new Date(until + 9 * 3_600_000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${m}`;
}
