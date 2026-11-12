import { CLOSE } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { z } from "zod";
import { banIpHash, canonicalIp, invalidateBanCache, isOperatorIp, kickNow } from "./ban";
import { HttpError } from "./http";
import { displayName, NO_NAME } from "./store";
import { banTargets, getBanStore, isBanActive, type BanEvent, type BanKind, type BanRecord, type BanStore } from "./store/bans";

// 47번 관리자 정지·IP 차단 작업 (라우트: app/api/admin/bans/*, app/api/admin/kick).
// 모든 변경은 기록(history)에 남기고, 해제·만료된 정지도 지우지 않는다.

const DAY_MS = 86_400_000;
/** 기간 직접 입력 상한 (10년) */
export const BAN_MAX_DAYS = 3650;
/** IP 차단 때 함께 내보낼 계정: 이 시간 안에 그 IP로 접속한 계정 */
const IP_KICK_RECENT_MS = DAY_MS;

const accountIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "계정 id 형식이 아니에요.");
const ipHashSchema = z.string().regex(/^[0-9a-f]{32}$/, "IP 해시 형식이 아니에요.");
const days = z
  .number()
  .int("기간은 날 수(정수)로 적어 주세요.")
  .min(1, "기간은 1일 이상이에요.")
  .max(BAN_MAX_DAYS, `기간은 ${BAN_MAX_DAYS}일까지예요.`)
  .nullable();
const reason = z.string().trim().min(1, "사용자에게 보일 사유를 적어 주세요.").max(200, "사유는 200자까지예요.");
const memo = z.string().trim().min(1, "관리자 메모를 적어 주세요.").max(500, "메모는 500자까지예요.");

export const BanCreateSchema = z.object({
  kind: z.enum(["account", "ip", "both"]),
  accountId: accountIdSchema.optional(),
  /** 관리자가 직접 입력한 IP (해시로만 바꿔 쓴다) */
  ip: z.string().trim().max(64).optional(),
  /** 계정의 최근 접속 IP 중 고른 것 */
  ipHash: ipHashSchema.optional(),
  /** null = 영구 */
  days,
  reason,
  memo,
});
export type BanCreateInput = z.output<typeof BanCreateSchema>;

export const BanEditSchema = z.discriminatedUnion("action", [
  /** 기간을 지금부터 days일(null = 영구)로 바꾼다. 사유·메모도 함께 고칠 수 있다 */
  z.object({ action: z.literal("edit"), days: days.optional(), reason: reason.optional(), memo: memo.optional(), note: z.string().trim().max(200).optional() }),
  /** 조기 해제 */
  z.object({ action: z.literal("lift"), note: z.string().trim().max(200).optional() }),
]);
export type BanEditInput = z.output<typeof BanEditSchema>;

export type BanStatus = "active" | "expired" | "lifted";
export type AdminBan = BanRecord & { status: BanStatus };
export const banStatus = (r: BanRecord, now: number): BanStatus => (r.liftedAt !== null ? "lifted" : isBanActive(r, now) ? "active" : "expired");

const bad = (msg: string) => new HttpError(400, "INVALID_INPUT", msg);
const untilOf = (d: number | null, now: number) => (d === null ? null : now + d * DAY_MS);
const fmtUntil = (u: number | null) => (u === null ? "영구" : new Date(u).toISOString().slice(0, 16).replace("T", " ") + " UTC");

/** 대상 확인 (차단 전 미리 보기) */
export type BanIpInfo = {
  ipHash: string;
  lastAt: number | null;
  /** 이 IP로 최근(30일) 접속한 계정 수와 그중 앞 10명 닉네임 */
  accounts: number;
  names: string[];
  /** 운영자 IP라 차단할 수 없다 */
  operator: boolean;
};
export type BanLookup = {
  account: { accountId: string; name: string; ips: BanIpInfo[]; active: AdminBan | null } | null;
  ip: BanIpInfo | null;
};

async function ipInfo(store: BanStore, ipHash: string, lastAt: number | null, operator: boolean, now: number): Promise<BanIpInfo> {
  const accts = await store.ipAccounts(ipHash, now);
  const names = await Promise.all(accts.slice(0, 10).map((a) => displayName(a.accountId, now).catch(() => NO_NAME)));
  return { ipHash, lastAt, accounts: accts.length, names, operator: operator || (await store.isOperatorIp(ipHash)) };
}

/** 계정(최근 접속 IP들과 각 IP의 계정 수) 또는 직접 입력한 IP를 미리 본다 */
export async function lookupBanTarget(q: { accountId?: string; ip?: string }, now = Date.now(), store = getBanStore()): Promise<BanLookup> {
  let account: BanLookup["account"] = null;
  if (q.accountId) {
    const id = accountIdSchema.parse(q.accountId);
    const [name, ips, list] = await Promise.all([displayName(id, now), store.accountIps(id, now), store.list()]);
    const active = list.find((b) => b.accountId === id && b.kind !== "ip" && isBanActive(b, now)) ?? null;
    account = {
      accountId: id,
      name,
      ips: await Promise.all(ips.map((s) => ipInfo(store, s.ipHash, s.lastAt, false, now))),
      active: active && { ...active, status: "active" },
    };
  }
  let ip: BanIpInfo | null = null;
  if (q.ip) {
    const hash = banIpHash(q.ip);
    if (!hash) throw bad("IP 주소 형식이 아니에요. (예: 203.0.113.7 또는 2001:db8::1)");
    ip = await ipInfo(store, hash, null, isOperatorIp(q.ip), now);
  }
  return { account, ip };
}

/** 해제 시각이 늦은 쪽 (영구가 가장 늦다) */
const stronger = (a: BanRecord, b: BanRecord) => (a.until === null ? a : b.until === null ? b : a.until >= b.until ? a : b);

/** 대상마다 지금 효력이 있는 정지 중 가장 긴 것을 판정 색인에 둔다 (없으면 지운다) */
async function reindex(store: BanStore, targets: string[], now: number): Promise<void> {
  if (!targets.length) return;
  const active = (await store.list()).filter((b) => isBanActive(b, now));
  for (const t of targets) {
    const covering = active.filter((b) => banTargets(b).includes(t));
    await store.point(t, covering.length ? covering.reduce(stronger) : null);
  }
}

/** 모든 정지 (진행 중 먼저, 그다음 최근 시작 순) */
export async function listBans(now = Date.now(), store = getBanStore()): Promise<AdminBan[]> {
  const order: Record<BanStatus, number> = { active: 0, expired: 1, lifted: 1 };
  // 기간이 끝난 색인은 판정에서 이미 걸러지지만, 목록을 볼 때 한 번씩 치운다 (색인이 쌓이지 않게)
  const stale = [...(await store.index())].filter(([, p]) => p.until !== null && p.until <= now).map(([t]) => t);
  if (stale.length) {
    await reindex(store, stale, now);
    invalidateBanCache();
  }
  return (await store.list())
    .map((b) => ({ ...b, status: banStatus(b, now) }))
    .sort((a, b) => order[a.status] - order[b.status] || b.startAt - a.startAt);
}

/** 정지·차단을 건다. 같은 대상의 진행 중인 정지는 "새 정지로 바뀜"으로 해제하고, 접속 중인 사람은 바로 내보낸다 */
export async function createBan(
  input: BanCreateInput,
  actor: string,
  now = Date.now(),
  store = getBanStore(),
): Promise<{ ban: AdminBan; expelled: number | null }> {
  const kind: BanKind = input.kind;
  const wantsAccount = kind !== "ip";
  const wantsIp = kind !== "account";
  if (wantsAccount && !input.accountId) throw bad("정지할 계정을 골라 주세요.");

  let ipHash: string | null = null;
  let ipSource: BanRecord["ipSource"] = null;
  if (wantsIp) {
    if (input.ip) {
      if (!canonicalIp(input.ip)) throw bad("IP 주소 형식이 아니에요. (예: 203.0.113.7 또는 2001:db8::1)");
      if (isOperatorIp(input.ip)) throw bad("운영자 IP(ADMIN_ALLOWED_IPS)는 차단할 수 없어요.");
      ipHash = banIpHash(input.ip);
      ipSource = "manual";
    } else if (input.accountId) {
      // 계정의 최근 접속 IP 중에서만 고를 수 있다 (아무 해시나 넣지 못하게). 고르지 않았으면 가장 최근 IP
      const ips = await store.accountIps(input.accountId, now);
      const pick = input.ipHash ? ips.find((s) => s.ipHash === input.ipHash) : ips[0];
      if (!pick) throw bad(input.ipHash ? "그 계정의 최근 접속 IP가 아니에요." : "이 계정은 최근 접속 IP 기록이 없어요. IP를 직접 입력해 주세요.");
      ipHash = pick.ipHash;
      ipSource = "account";
    } else throw bad("차단할 IP를 입력하거나 계정을 골라 주세요.");
    if (!ipHash) throw bad("IP 주소 형식이 아니에요.");
    if (await store.isOperatorIp(ipHash)) throw bad("운영자 IP(ADMIN_ALLOWED_IPS)에서 쓰인 IP라 차단할 수 없어요.");
  }

  const ipAccounts = ipHash ? await store.ipAccounts(ipHash, now) : [];
  const accountName = input.accountId ? await displayName(input.accountId, now) : null;
  const rec: BanRecord = {
    id: `ban_${nanoid(10)}`,
    kind,
    accountId: input.accountId ?? null,
    accountName,
    ipHash,
    ipSource,
    ipAccounts: ipAccounts.length,
    reason: input.reason,
    memo: input.memo,
    startAt: now,
    until: untilOf(input.days, now),
    by: actor,
    liftedAt: null,
    liftedBy: null,
    history: [{ at: now, by: actor, action: "create", note: `${KIND_LABEL[kind]} · ${input.days === null ? "영구" : `${input.days}일`}` }],
  };

  // 대상이 새 정지에 모두 포함되는 진행 중 정지는 "새 정지로 바뀜"으로 끝낸다 (기록은 남긴다).
  // 일부만 겹치면(예: 계정+IP 정지 위에 계정만 새로) 둘 다 두고, 겹치는 대상의 색인은 더 긴 쪽을 가리킨다
  const mine = new Set(banTargets(rec));
  for (const old of await store.list()) {
    if (!isBanActive(old, now) || !banTargets(old).every((t) => mine.has(t))) continue;
    await store.save({ ...old, liftedAt: now, liftedBy: actor, history: [...old.history, { at: now, by: actor, action: "replaced", note: `새 정지 ${rec.id}로 바뀜` }] });
  }
  await store.save(rec);
  await reindex(store, [...mine], now);
  invalidateBanCache();

  const kick = new Set<string>();
  if (wantsAccount && rec.accountId) kick.add(rec.accountId);
  for (const a of ipAccounts) if (a.lastAt > now - IP_KICK_RECENT_MS) kick.add(a.accountId);
  const expelled = kick.size ? await kickNow([...kick], CLOSE.BANNED) : 0;
  return { ban: { ...rec, status: "active" }, expelled };
}

export const KIND_LABEL: Record<BanKind, string> = { account: "계정 정지", ip: "IP 차단", both: "계정 정지 + IP 차단" };

/** 기간 수정·사유 수정·조기 해제. 해제·만료된 정지는 기간을 바꿀 수 없다(새로 거는 게 맞다) */
export async function editBan(id: string, input: BanEditInput, actor: string, now = Date.now(), store = getBanStore()): Promise<AdminBan> {
  const rec = await store.get(id);
  if (!rec) throw new HttpError(404, "NOT_FOUND", "그 정지 기록을 찾을 수 없어요.");
  if (!isBanActive(rec, now)) throw new HttpError(409, "BAN_ENDED", "이미 끝난 정지예요. 다시 막으려면 새로 정지해 주세요.");
  const note = input.note ? ` (${input.note})` : "";
  let next: BanRecord;
  if (input.action === "lift") {
    next = { ...rec, liftedAt: now, liftedBy: actor, history: [...rec.history, { at: now, by: actor, action: "lift", note: `조기 해제${note}` }] };
  } else {
    const changes: string[] = [];
    next = { ...rec };
    if (input.days !== undefined) {
      next.until = untilOf(input.days, now);
      changes.push(`기간 ${fmtUntil(rec.until)} → ${fmtUntil(next.until)}`);
    }
    if (input.reason !== undefined && input.reason !== rec.reason) {
      next.reason = input.reason;
      changes.push("사유 수정");
    }
    if (input.memo !== undefined && input.memo !== rec.memo) {
      next.memo = input.memo;
      changes.push("메모 수정");
    }
    if (!changes.length) throw bad("바꿀 내용이 없어요.");
    const ev: BanEvent = { at: now, by: actor, action: "edit", note: changes.join(", ") + note };
    next.history = [...rec.history, ev];
  }
  await store.save(next);
  await reindex(store, banTargets(next), now);
  invalidateBanCache();
  return { ...next, status: banStatus(next, now) };
}

/** 지금 내보내기 (정지 아님). 내보낸 연결 수, 실시간 서버에 닿지 못하면 null */
export async function kickAccount(accountId: string): Promise<number | null> {
  return kickNow([accountIdSchema.parse(accountId)], CLOSE.KICKED);
}
