import type { ReportBy } from "./reports";
import { getAccounts } from "./store";
import { kstDay } from "./store/accounts";

// 11/18 신고 자동 숨김은 만든 지 REPORT_TRUST_AGE_MS가 지난 계정의 신고만 센다.
// 갓 만든 계정(새로 시작·다른 기기)의 신고는 관리자 신고함에만 남는다 — 계정을 여러 개 만들어 남의 묘비·방명록을 숨기지 못하게.
// IP가 아니라 계정 나이로 본다 (집·회사처럼 한 IP에 여럿이 있어도 서로 막지 않는다).

export const REPORT_TRUST_AGE_MS = 3 * 86_400_000;

/**
 * 이 계정의 신고를 숨김 수에 넣을지. 만든 시각을 모르는 옛 계정(0)은 마을에 들어와 이름이 있을 때만 넣는다
 * (쿠키만 받고 한 번도 안 들어온 계정도 만든 시각이 0이다)
 */
export async function trustedReporter(accountId: string, now = Date.now()): Promise<boolean> {
  return (await reporterOf(accountId, now)).trusted;
}

/** 11/18 신고한 사람: 숨김 수에 넣을지(trusted)와 기록에 남길 계정 id·캐릭터 이름 (계정 한 번 읽기) */
export async function reporterOf(accountId: string, now = Date.now()): Promise<{ trusted: boolean; by: ReportBy }> {
  const a = await getAccounts().get(accountId, kstDay(now), now);
  const trusted = a.createdAt > 0 ? now - a.createdAt >= REPORT_TRUST_AGE_MS : !!a.name;
  return { trusted, by: { accountId, name: a.name ?? null } };
}
