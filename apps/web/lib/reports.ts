// 신고 사유 (클라이언트·서버 공용). 사유를 고르지 않은 신고는 "other"로 받는다.

export const REPORT_REASONS = ["spam", "abuse", "privacy", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "스팸·광고",
  abuse: "욕설·혐오",
  privacy: "개인정보 노출",
  other: "기타",
};

/** 묘비별 신고 기록 한 줄 (최근 REPORT_LOG_MAX개만 남긴다) */
export type ReportLogEntry = { at: number; reason: ReportReason };
export const REPORT_LOG_MAX = 50;

// ── 47번 유저·확성기 신고 (게임 안 캐릭터 메뉴·확성기 창) ──
export const USER_REPORT_REASONS = ["nickname", "abuse", "spam", "other"] as const;
export type UserReportReason = (typeof USER_REPORT_REASONS)[number];
export const USER_REPORT_REASON_LABELS: Record<UserReportReason, string> = {
  nickname: "부적절한 닉네임",
  abuse: "욕설·괴롭힘",
  spam: "도배·광고",
  other: "기타",
};
/** 신고 메모 최대 글자 수 */
export const REPORT_MEMO_MAX = 100;
