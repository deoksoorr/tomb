import { DIFFS, HUNT_ZONES, isZoneId } from "./rpg/catalog";
import { getAccounts } from "./store";
import { getOpsLog, type LogEntry, type LogList } from "./store/opsLog";
import { getSignupSrc } from "./store/signupSrc";
import { srcText } from "./signupSource";

// 11/26 관리자 「접속 기록」·「사냥터 기록」 읽기: 전체 최근 500줄 또는 한 계정 50줄 + 이름 (나온 계정만 한 번에 읽는다)

/** 이름 + 사냥터 기록이면 어디인지 (사냥터·난이도·야근 빌딩 층 — 서버가 이름으로 바꿔 보낸다) */
export type AdminLogRow = LogEntry & { name: string | null; where?: string };

function whereOf(e: LogEntry): string | undefined {
  const h = e as { zone?: string; d?: string; tw?: number };
  if (h.tw) return `야근 빌딩 ${h.tw}층부터`;
  const diff = h.d && h.d in DIFFS ? DIFFS[h.d as keyof typeof DIFFS].name : null;
  const zone = h.zone && isZoneId(h.zone) ? HUNT_ZONES[h.zone].name : null;
  return [zone, diff].filter(Boolean).join(" · ") || undefined;
}
export type AdminLogsResponse = {
  list: LogList;
  /** 서버 시각 (몇 분 전 표시 기준) */
  at: number;
  rows: AdminLogRow[];
  /** 한 계정을 볼 때: 그 계정의 가입 유입 */
  account?: { id: string; name: string | null; signup: string };
};

export async function readAdminLogs(list: LogList, accountId: string | null): Promise<AdminLogsResponse> {
  const log = getOpsLog();
  const entries = accountId ? await log.ofAccount(list, accountId) : await log.recent(list);
  const ids = [...new Set([...entries.map((e) => e.a), ...(accountId ? [accountId] : [])])];
  const [sums, src] = await Promise.all([getAccounts().summaries(ids), accountId ? getSignupSrc().get([accountId]) : Promise.resolve([])]);
  const names = new Map(ids.map((id, i) => [id, sums[i]?.name ?? null]));
  return {
    list,
    at: Date.now(),
    rows: entries.map((e) => {
      const where = list === "hunt" ? whereOf(e) : undefined;
      return { ...e, name: names.get(e.a) ?? null, ...(where ? { where } : {}) };
    }),
    ...(accountId ? { account: { id: accountId, name: names.get(accountId) ?? null, signup: srcText(src[0]) } } : {}),
  };
}
