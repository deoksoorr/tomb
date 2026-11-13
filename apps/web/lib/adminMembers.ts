import { nameKey } from "@tomb/protocol";
import { HttpError } from "./http";
import { getHuntLevelStore, levelOf } from "./huntLevelRank";
import { staffAccountId } from "./staff";
import { getAccounts } from "./store";
import { codeHash, newCode } from "./store/accounts";
import { getAdminAudit, type AdminAuditEntry } from "./store/adminAudit";
import { getBanStore } from "./store/bans";
import { DORMANT_MS, type AccountStore, type AccountSummary } from "./store/types";

// 관리자 '회원 제재' 탭의 회원 목록·접속 코드 재발급 (라우트: app/api/admin/accounts/list, app/api/admin/accounts/code).
//
// 목록: 계정 저장소를 SCAN(메모리는 순번)으로 끝까지 훑어 요약을 모은 뒤 최근 접속 순으로 줄 세우고,
// 커서(마지막 줄의 "마지막 접속~계정 id")로 다음 MEMBERS_PAGE명을 자른다 — 그 사이 순서가 바뀌어도 겹치거나 빠지지 않는다.
// 훑은 결과는 이 서버 인스턴스에 SNAPSHOT_MS 동안 기억한다 (페이지를 넘길 때마다 다시 훑지 않게, fresh면 다시).

export const MEMBERS_PAGE = 50;
/** 한 번 훑을 때 SCAN count (키 전체를 돌므로 크게) */
const SCAN_COUNT = 1000;
/** 훑기 상한 (SCAN 호출 수). 넘으면 partial로 알린다 */
const SCAN_MAX_CALLS = 500;
const SNAPSHOT_MS = 30_000;

export type MemberStatus = "normal" | "banned" | "dormant" | "staff";
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  normal: "정상",
  banned: "정지",
  dormant: "휴면",
  staff: "운영자",
};

export type AdminMemberRow = {
  accountId: string;
  name: string | null;
  /** 0 = 모름 (기록 전 옛 계정) */
  createdAt: number;
  /** 0 = 기록 없음 */
  lastSeenAt: number;
  points: number;
  status: MemberStatus;
  /** 정지 중이면 해제 시각 (null = 영구) */
  banUntil?: number | null;
  /** 사냥 레벨 (랭킹에 기록된 것, 없으면 null) */
  huntLevel: number | null;
  hasCode: boolean;
};
/** GET /api/admin/accounts/list */
export type AdminMembersResponse = {
  members: AdminMemberRow[];
  /** 다음 페이지 커서 (null = 마지막) */
  next: string | null;
  /** 검색 조건에 맞는 전체 회원 수 */
  total: number;
  /** 목록을 훑은 시각 */
  scannedAt: number;
  /** 훑기 상한에 걸려 일부만 봤다 */
  partial: boolean;
};

// ── 훑기 ──

type Snapshot = {
  at: number;
  rows: AccountSummary[];
  partial: boolean;
  store: AccountStore;
};
const g = globalThis as typeof globalThis & { __tombMembersSnap?: Snapshot };

export async function scanAllAccounts(accounts: AccountStore): Promise<{ rows: AccountSummary[]; partial: boolean }> {
  const seen = new Map<string, AccountSummary>();
  let cursor = "0";
  for (let calls = 0; calls < SCAN_MAX_CALLS; calls++) {
    const r = await accounts.scanAccounts(cursor, SCAN_COUNT);
    // SCAN은 같은 키를 두 번 돌려줄 수 있다
    for (const a of r.accounts) seen.set(a.accountId, a);
    cursor = r.next;
    if (cursor === "0") return { rows: [...seen.values()], partial: false };
  }
  return { rows: [...seen.values()], partial: true };
}

async function snapshot(accounts: AccountStore, fresh: boolean, now: number): Promise<Snapshot> {
  const cur = g.__tombMembersSnap;
  if (!fresh && cur && cur.store === accounts && now - cur.at < SNAPSHOT_MS) return cur;
  const { rows, partial } = await scanAllAccounts(accounts);
  return (g.__tombMembersSnap = { at: now, rows, partial, store: accounts });
}

// ── 정렬·검색·자르기 (순수 함수) ──

/** 최근 접속 순, 같으면 계정 id 순 */
export const byRecent = (a: Pick<AccountSummary, "lastSeenAt" | "accountId">, b: Pick<AccountSummary, "lastSeenAt" | "accountId">) =>
  b.lastSeenAt - a.lastSeenAt || (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0);

export const memberCursor = (r: Pick<AccountSummary, "lastSeenAt" | "accountId">) => `${r.lastSeenAt}~${r.accountId}`;
function parseCursor(raw: string): Pick<AccountSummary, "lastSeenAt" | "accountId"> {
  const i = raw.indexOf("~");
  const lastSeenAt = Number(raw.slice(0, i));
  const accountId = raw.slice(i + 1);
  if (i < 1 || !Number.isFinite(lastSeenAt) || !/^[A-Za-z0-9_-]{1,64}$/.test(accountId))
    throw new HttpError(400, "INVALID_INPUT", "페이지 커서가 올바르지 않아요. 처음부터 다시 불러와 주세요.");
  return { lastSeenAt, accountId };
}

/** 이름(공백·_·대소문자 무시 부분 일치) 또는 계정 id(앞부분 일치) */
export function matchesMember(r: Pick<AccountSummary, "name" | "accountId">, q: string): boolean {
  const raw = q.trim();
  if (!raw) return true;
  const key = nameKey(raw);
  return (!!key && !!r.name && nameKey(r.name).includes(key)) || r.accountId.startsWith(raw);
}

export function pageMembers<T extends AccountSummary>(
  all: readonly T[],
  opts: { q?: string; cursor?: string | null; size?: number } = {},
): { rows: T[]; next: string | null; total: number } {
  const size = opts.size ?? MEMBERS_PAGE;
  const sorted = all.filter((r) => matchesMember(r, opts.q ?? "")).sort(byRecent);
  const after = opts.cursor ? parseCursor(opts.cursor) : null;
  const start = after ? sorted.findIndex((r) => byRecent(r, after) > 0) : 0;
  const rows = start < 0 ? [] : sorted.slice(start, start + size);
  const more = start >= 0 && start + size < sorted.length;
  return {
    rows,
    next: more && rows.length ? memberCursor(rows[rows.length - 1]) : null,
    total: sorted.length,
  };
}

// ── 목록 ──

export async function listMembers(
  opts: {
    q?: string;
    cursor?: string | null;
    fresh?: boolean;
    now?: number;
    accounts?: AccountStore;
  } = {},
): Promise<AdminMembersResponse> {
  const now = opts.now ?? Date.now();
  const accounts = opts.accounts ?? getAccounts();
  const snap = await snapshot(accounts, !!opts.fresh, now);
  const page = pageMembers(snap.rows, { q: opts.q, cursor: opts.cursor });
  const ids = page.rows.map((r) => r.accountId);
  const [staffId, bans, scores] = await Promise.all([
    staffAccountId(now),
    getBanStore().index(),
    getHuntLevelStore(accounts)
      .scoresOf(ids)
      .catch(() => ids.map(() => null)),
  ]);
  const members = page.rows.map((r, i): AdminMemberRow => {
    const ban = bans.get(`a:${r.accountId}`);
    const banned = !!ban && (ban.until === null || ban.until > now);
    const dormant = r.renameRequired || (r.lastSeenAt > 0 && now - r.lastSeenAt > DORMANT_MS);
    const status: MemberStatus = r.accountId === staffId ? "staff" : banned ? "banned" : dormant ? "dormant" : "normal";
    const score = scores[i];
    return {
      accountId: r.accountId,
      name: r.name,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      points: r.points,
      status,
      ...(banned ? { banUntil: ban!.until } : {}),
      huntLevel: score ? levelOf(score) : null,
      hasCode: r.hasCode,
    };
  });
  return {
    members,
    next: page.next,
    total: page.total,
    scannedAt: snap.at,
    partial: snap.partial,
  };
}

// ── 접속 코드 재발급 ──

export type CodeReissueResponse = {
  accountId: string;
  name: string | null;
  code: string;
};
/** GET /api/admin/accounts/code — 재발급 기록 (최신 먼저) */
export type CodeReissueLogResponse = { log: AdminAuditEntry[] };

/**
 * 새 코드를 만들어 해시만 저장한다 (옛 코드 해시는 지워져 바로 무효). 원문은 이 응답에서 한 번만 돌려주고 어디에도 남기지 않는다.
 * 운영자 계정은 실수로 운영자 접속이 끊기지 않게 막는다 (운영자 계정 탭에서 지정을 풀면 할 수 있다). 감사 기록을 남긴다
 */
export async function reissueCode(accountId: string, actor: string, now = Date.now(), accounts: AccountStore = getAccounts()): Promise<CodeReissueResponse> {
  const [found] = await accounts.summaries([accountId]);
  if (!found) throw new HttpError(404, "NOT_FOUND", "그 계정을 찾을 수 없어요.");
  if ((await staffAccountId(now)) === accountId)
    throw new HttpError(403, "STAFF_ACCOUNT", "운영자 계정의 코드는 여기서 재발급할 수 없어요. '운영자 계정' 탭에서 지정을 푼 뒤 다시 해 주세요.");
  const code = newCode();
  await accounts.setCode(accountId, codeHash(code));
  await getAdminAudit().push({
    at: now,
    by: actor,
    action: "codeReissue",
    accountId,
    name: found.name,
  });
  return { accountId, name: found.name, code };
}

export async function codeReissueLog(limit = 30): Promise<AdminAuditEntry[]> {
  return (await getAdminAudit().recent(limit * 2)).filter((e) => e.action === "codeReissue").slice(0, limit);
}
