import type { MemberStatus } from "@/lib/adminMembers";

// 회원 제재 탭 표시 도우미 (화면 전용 — lib/adminMembers.ts는 서버 코드라 값은 가져오지 않는다)

export const STATUS_LABEL: Record<MemberStatus, string> = {
  normal: "정상",
  banned: "정지",
  dormant: "휴면",
  staff: "운영자",
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 상대 시간: 방금 · n분 전 · n시간 전 · n일 전 · n달 전 · n년 전 (0 = 기록 없음) */
export function relativeTime(at: number, now: number): string {
  if (!at) return "기록 없음";
  const d = Math.max(0, now - at);
  if (d < MIN) return "방금";
  if (d < HOUR) return `${Math.floor(d / MIN)}분 전`;
  if (d < DAY) return `${Math.floor(d / HOUR)}시간 전`;
  if (d < 30 * DAY) return `${Math.floor(d / DAY)}일 전`;
  if (d < 365 * DAY) return `${Math.floor(d / (30 * DAY))}달 전`;
  return `${Math.floor(d / (365 * DAY))}년 전`;
}

const KST_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const KST_FULL = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 가입일 (KST 날짜, 0 = 모름) */
export const joinDate = (at: number) => (at ? KST_DATE.format(at) : "모름");
/** 마우스를 올렸을 때 보일 정확한 시각 */
export const fullTime = (at: number) => (at ? KST_FULL.format(at) : "");
