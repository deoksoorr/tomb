import { getAccounts } from "./store";
import { getOpsLog, type LogEntry, type LogList } from "./store/opsLog";
import { kstDay } from "./store/accounts";
import { getSignupSrc, type LiveSrc } from "./store/signupSrc";
import { srcText } from "./signupSource";
import { describeLog, type LogLine } from "./logText";

// 11/26 관리자 「접속 기록」·「사냥터 기록」 읽기: 전체 최근 500줄 또는 한 계정 50줄 + 이름 (나온 계정만 한 번에 읽는다)

/**
 * 이름 + 11/28 한 문장(lib/logText — 「자동 낚시 시작 (캠핑장 윤슬 낚시터 좌대 4번 · 1채널)」).
 * 저장된 줄 필드는 그대로 같이 보낸다 (관리 화면 「원본」 펼치기 — 디버그용)
 */
export type AdminLogRow = LogEntry & { name: string | null; line: LogLine };

export type AdminLogsResponse = {
  list: LogList;
  /** 서버 시각 (몇 분 전 표시 기준) */
  at: number;
  rows: AdminLogRow[];
  /** 한 계정을 볼 때: 그 계정의 가입 유입 + 11/27 최근 접속 유입(오늘·어제 입장한 탭, 없으면 null)·그 접속 시작 */
  account?: { id: string; name: string | null; signup: string; session: string | null; sessionAt: number | null };
};

export async function readAdminLogs(list: LogList, accountId: string | null): Promise<AdminLogsResponse> {
  const log = getOpsLog();
  const entries = accountId ? await log.ofAccount(list, accountId) : await log.recent(list);
  const ids = [...new Set([...entries.map((e) => e.a), ...(accountId ? [accountId] : [])])];
  const now = Date.now();
  const [sums, src, live] = await Promise.all([
    getAccounts().summaries(ids),
    accountId ? getSignupSrc().get([accountId]) : Promise.resolve([]),
    accountId ? getSignupSrc().live([accountId], [kstDay(now), kstDay(now - 86_400_000)]) : Promise.resolve([] as (LiveSrc | null)[]),
  ]);
  const names = new Map(ids.map((id, i) => [id, sums[i]?.name ?? null]));
  return {
    list,
    at: now,
    rows: entries.map((e) => ({ ...e, name: names.get(e.a) ?? null, line: describeLog(list, e) })),
    ...(accountId
      ? { account: { id: accountId, name: names.get(accountId) ?? null, signup: srcText(src[0]), session: live[0]?.s ?? null, sessionAt: live[0]?.at ?? null } }
      : {}),
  };
}
