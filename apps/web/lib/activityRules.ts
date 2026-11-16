// 관리자 「유저 활동」의 기준값을 한곳에 (화면 안내 문구도 여기 값으로 만든다 → 숫자만 바꾸면 된다)

/** 등급 판정 기간 (최근 며칠 중 활동한 날 수로 본다) */
export const TIER_WINDOW_DAYS = 30;
/** VIP: 최근 TIER_WINDOW_DAYS일 중 days일 이상 활동 + 총 접속 시간 hours시간 이상 */
export const VIP_RULE = { days: 20, hours: 50 } as const;
/** 단골: 최근 TIER_WINDOW_DAYS일 중 days일 이상 활동 (VIP가 아니면) */
export const REGULAR_RULE = { days: 10 } as const;
/** 떠난 단골: 마지막 접속이 이 범위(일)만큼 지났고, 마지막 접속까지 TIER_WINDOW_DAYS일 동안 단골 기준을 넘었던 계정 */
export const GONE_RULE = { minDays: 7, maxDays: 30 } as const;

export type ActivityTier = "vip" | "regular";
export const TIER_LABEL: Record<ActivityTier, string> = { vip: "VIP", regular: "단골" };

/** 활동한 날 수·총 접속 시간(분) → 등급 (없으면 null) */
export function tierOf(days: number, stayMinutes: number): ActivityTier | null {
  if (days >= VIP_RULE.days && stayMinutes >= VIP_RULE.hours * 60) return "vip";
  if (days >= REGULAR_RULE.days) return "regular";
  return null;
}

export const TIER_RULE_TEXT: Record<ActivityTier, string> = {
  vip: `최근 ${TIER_WINDOW_DAYS}일 중 ${VIP_RULE.days}일 이상 들어오고 총 접속 시간이 ${VIP_RULE.hours}시간 이상이에요.`,
  regular: `최근 ${TIER_WINDOW_DAYS}일 중 ${REGULAR_RULE.days}일 이상 들어왔어요.`,
};

/** 마지막 접속 구간. maxDays = 마지막 접속 게임 날짜가 오늘에서 며칠 전까지인지 (dormant는 휴면 기준 90일을 넘은 계정) */
export const LAST_SEEN_BUCKETS = [
  { id: "today", label: "오늘", maxDays: 0 },
  { id: "d3", label: "1~3일 전", maxDays: 3 },
  { id: "d7", label: "4~7일 전", maxDays: 7 },
  { id: "d30", label: "8~30일 전", maxDays: 30 },
  { id: "d90", label: "31~90일 전", maxDays: Infinity },
  { id: "dormant", label: "90일 넘음 (휴면)", maxDays: Infinity },
  { id: "none", label: "접속 기록 없음", maxDays: Infinity },
] as const;
export type LastSeenBucket = (typeof LAST_SEEN_BUCKETS)[number]["id"];

/** 리텐션 표의 날짜 칸 (가입한 날에서 며칠 뒤에 다시 왔는지) */
export const RETENTION_DAYS = [1, 3, 7, 14, 30] as const;
/** 주간 리텐션: 가입한 주에서 몇 주 뒤에 한 번이라도 왔는지 */
export const RETENTION_WEEKS = [1, 2, 3, 4] as const;
/** 일별 가입 묶음 수 · 주별 가입 묶음 수 */
export const COHORT_DAYS = 30;
export const COHORT_WEEKS = 8;
