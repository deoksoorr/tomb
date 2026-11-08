import type { InquiryCategory, Notice } from "@/lib/types";

/** 고정 공지 먼저, 그다음 최신 순 */
export function sortNotices(notices: readonly Notice[]): Notice[] {
  return [...notices].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}

/** 가장 최근에 올라온 공지 (고정 여부와 상관없이) */
export function latestNotice(notices: readonly Notice[]): Notice | null {
  return notices.reduce<Notice | null>((latest, n) => (!latest || n.createdAt > latest.createdAt ? n : latest), null);
}

/** 마지막으로 본 공지 이후 새 공지가 있는지 */
export function hasUnread(notices: readonly Notice[], seenId: string | null): boolean {
  const latest = latestNotice(notices);
  return latest !== null && latest.id !== seenId;
}

export const INQUIRY_LIMITS = { min: 10, max: 1000, contact: 100 } as const;

export type InquiryErrors = Partial<Record<"category" | "message" | "contact", string>>;

/** 서버와 같은 기준 (글자 수는 코드포인트) */
export function validateInquiry(v: { category: InquiryCategory | null; message: string; contact: string }): InquiryErrors {
  const len = [...v.message.trim()].length;
  const errors: InquiryErrors = {
    category: v.category ? undefined : "어떤 문의인지 골라 주세요.",
    message:
      len < INQUIRY_LIMITS.min
        ? `${INQUIRY_LIMITS.min}자 이상 적어 주세요.`
        : len > INQUIRY_LIMITS.max
          ? `${INQUIRY_LIMITS.max}자까지 적을 수 있어요.`
          : undefined,
    contact: [...v.contact.trim()].length > INQUIRY_LIMITS.contact ? `${INQUIRY_LIMITS.contact}자까지 적을 수 있어요.` : undefined,
  };
  return Object.fromEntries(Object.entries(errors).filter(([, m]) => m)) as InquiryErrors;
}
