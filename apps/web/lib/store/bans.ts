import { Redis } from "@upstash/redis";
import { env } from "../env";

// 47번 정지·IP 차단 저장소 + 계정별 최근 접속 IP(해시) 기록.
// IP는 lib/ban.ts의 banIpHash(비밀키 HMAC)로만 들어온다 — 이 파일은 원본 IP를 모른다.
//
// Redis 키 (이 파일에서만 쓴다)
//  - ban:rec  HASH 정지 id → BanRecord JSON (해제·만료된 것도 처리 기록으로 남긴다)
//  - ban:idx  HASH "a:{계정 id}" | "i:{IP 해시}" → "{정지 id}|{해제 시각 ms, 영구면 0}"  (지금 걸려 있는 것만)
//             판정은 HMGET 한 번(계정·IP 두 필드), 캐시용 전체 목록은 HGETALL 한 번
//  - ban:seen:{계정}:{IP 해시}  STRING NX EX — 같은 계정·IP를 SEEN_EVERY_SEC 안에 다시 적지 않게 (기록 비용 절약)
//  - ban:ips:{계정}             ZSET IP 해시 → 마지막 접속 ms (최근 ACCT_IPS_KEEP개, SEEN_TTL_SEC)
//  - ban:ipacct:{IP 해시}       ZSET 계정 id → 마지막 접속 ms (최근 IP_ACCTS_KEEP개, SEEN_TTL_SEC)
//  - ban:opip                   SET 운영자 IP(ADMIN_ALLOWED_IPS)에서 본 IP 해시 — 이 해시로는 IP 차단을 걸 수 없다

export type BanKind = "account" | "ip" | "both";
export type BanAction = "create" | "edit" | "lift" | "replaced";
export type BanEvent = { at: number; by: string; action: BanAction; note: string };

export type BanRecord = {
  id: string;
  kind: BanKind;
  /** 계정 정지 대상 (IP만 막을 때도 어느 계정에서 고른 IP인지 남긴다) */
  accountId: string | null;
  /** 정지할 때의 닉네임 (목록 표시용) */
  accountName: string | null;
  /** IP 차단 대상 (비밀키 HMAC 해시, 원본 IP 아님) */
  ipHash: string | null;
  /** IP를 어떻게 골랐는지: 계정의 최근 접속 IP / 관리자가 직접 입력 */
  ipSource: "account" | "manual" | null;
  /** 차단할 때 이 IP로 최근 접속한 계정 수 */
  ipAccounts: number;
  /** 사용자에게 보여 줄 사유 */
  reason: string;
  /** 관리자만 보는 메모 */
  memo: string;
  startAt: number;
  /** 해제 예정 시각 (ms). null = 영구 */
  until: number | null;
  /** 처리자 */
  by: string;
  liftedAt: number | null;
  liftedBy: string | null;
  /** 처리 기록 (오래된 것 먼저) */
  history: BanEvent[];
};

export const banTargets = (r: Pick<BanRecord, "kind" | "accountId" | "ipHash">): string[] => {
  const t: string[] = [];
  if (r.kind !== "ip" && r.accountId) t.push(`a:${r.accountId}`);
  if (r.kind !== "account" && r.ipHash) t.push(`i:${r.ipHash}`);
  return t;
};

/** 지금 효력이 있는지 (해제되지 않았고 기간이 남았다) */
export const isBanActive = (r: Pick<BanRecord, "liftedAt" | "until">, now: number) => r.liftedAt === null && (r.until === null || r.until > now);

/** 판정용 색인 값 */
export type BanPointer = { id: string; until: number | null };
const encodePtr = (r: BanRecord) => `${r.id}|${r.until ?? 0}`;
function decodePtr(raw: string | null | undefined): BanPointer | null {
  if (!raw) return null;
  const [id, u] = raw.split("|");
  const until = Number(u);
  return id && Number.isFinite(until) ? { id, until: until === 0 ? null : until } : null;
}
const livePtr = (p: BanPointer | null, now: number) => !!p && (p.until === null || p.until > now);

export const SEEN_EVERY_SEC = 6 * 3600;
export const SEEN_TTL_SEC = 30 * 86_400;
export const ACCT_IPS_KEEP = 5;
export const IP_ACCTS_KEEP = 50;

export type SeenIp = { ipHash: string; lastAt: number };
export type SeenAccount = { accountId: string; lastAt: number };

export interface BanStore {
  /** 정지 기록 저장 (색인은 건드리지 않는다 — lib/banAdmin.ts가 대상마다 point로 맞춘다) */
  save(rec: BanRecord): Promise<void>;
  get(id: string): Promise<BanRecord | null>;
  /** 모든 정지 (최근 시작 순) */
  list(): Promise<BanRecord[]>;
  /** 이 계정·IP 해시에 지금 걸린 정지 id (색인만 본다, 만료는 거른다) */
  lookup(accountId: string | null, ipHash: string | null, now: number): Promise<BanPointer | null>;
  /** 판정 캐시용 전체 색인 ("a:{id}" | "i:{hash}" → 포인터) */
  index(): Promise<Map<string, BanPointer>>;
  /** 대상("a:{id}" | "i:{hash}")의 색인을 이 정지로, null이면 지운다 */
  point(target: string, rec: BanRecord | null): Promise<void>;

  /** 계정의 접속 IP 기록 (SEEN_EVERY_SEC 안의 같은 쌍은 건너뛴다). operator면 운영자 IP 해시로도 적는다 */
  seen(accountId: string, ipHash: string, now: number, operator: boolean): Promise<void>;
  /** 계정의 최근 접속 IP (최근 먼저) */
  accountIps(accountId: string, now: number): Promise<SeenIp[]>;
  /** 이 IP로 최근 접속한 계정 (최근 먼저) */
  ipAccounts(ipHash: string, now: number): Promise<SeenAccount[]>;
  isOperatorIp(ipHash: string): Promise<boolean>;
}

// ── 메모리 (로컬·테스트) ──

export class MemoryBans implements BanStore {
  private recs = new Map<string, BanRecord>();
  private idx = new Map<string, string>();
  private seenAt = new Map<string, number>();
  private acctIps = new Map<string, Map<string, number>>();
  private ipAccts = new Map<string, Map<string, number>>();
  private opIps = new Set<string>();

  async save(rec: BanRecord): Promise<void> {
    this.recs.set(rec.id, structuredClone(rec));
  }
  async get(id: string): Promise<BanRecord | null> {
    const r = this.recs.get(id);
    return r ? structuredClone(r) : null;
  }
  async list(): Promise<BanRecord[]> {
    return [...this.recs.values()].map((r) => structuredClone(r)).sort((a, b) => b.startAt - a.startAt);
  }
  async lookup(accountId: string | null, ipHash: string | null, now: number): Promise<BanPointer | null> {
    const ptrs = [accountId ? decodePtr(this.idx.get(`a:${accountId}`)) : null, ipHash ? decodePtr(this.idx.get(`i:${ipHash}`)) : null];
    return ptrs.find((p) => livePtr(p, now)) ?? null;
  }
  async index(): Promise<Map<string, BanPointer>> {
    const m = new Map<string, BanPointer>();
    for (const [k, v] of this.idx) {
      const p = decodePtr(v);
      if (p) m.set(k, p);
    }
    return m;
  }
  async point(target: string, rec: BanRecord | null): Promise<void> {
    if (rec) this.idx.set(target, encodePtr(rec));
    else this.idx.delete(target);
  }

  async seen(accountId: string, ipHash: string, now: number, operator: boolean): Promise<void> {
    const key = `${accountId}|${ipHash}`;
    if ((this.seenAt.get(key) ?? 0) > now) return;
    this.seenAt.set(key, now + SEEN_EVERY_SEC * 1000);
    if (operator) this.opIps.add(ipHash);
    const put = (m: Map<string, Map<string, number>>, k: string, member: string, keep: number) => {
      let z = m.get(k);
      if (!z) m.set(k, (z = new Map()));
      z.set(member, now);
      const sorted = [...z].sort((a, b) => b[1] - a[1]);
      for (const [old] of sorted.slice(keep)) z.delete(old);
    };
    put(this.acctIps, accountId, ipHash, ACCT_IPS_KEEP);
    put(this.ipAccts, ipHash, accountId, IP_ACCTS_KEEP);
  }
  async accountIps(accountId: string, now: number): Promise<SeenIp[]> {
    return [...(this.acctIps.get(accountId) ?? [])]
      .filter(([, at]) => at > now - SEEN_TTL_SEC * 1000)
      .sort((a, b) => b[1] - a[1])
      .map(([ipHash, lastAt]) => ({ ipHash, lastAt }));
  }
  async ipAccounts(ipHash: string, now: number): Promise<SeenAccount[]> {
    return [...(this.ipAccts.get(ipHash) ?? [])]
      .filter(([, at]) => at > now - SEEN_TTL_SEC * 1000)
      .sort((a, b) => b[1] - a[1])
      .map(([accountId, lastAt]) => ({ accountId, lastAt }));
  }
  async isOperatorIp(ipHash: string): Promise<boolean> {
    return this.opIps.has(ipHash);
  }
}

// ── Redis (운영) ── Lua 없이 MULTI/파이프라인만 쓴다. 쓰기는 관리자 작업(드묾)과 접속 기록(멱등)뿐이다.

const BK = {
  rec: "ban:rec",
  idx: "ban:idx",
  seen: (a: string, h: string) => `ban:seen:${a}:${h}`,
  ips: (a: string) => `ban:ips:${a}`,
  ipAcct: (h: string) => `ban:ipacct:${h}`,
  opIp: "ban:opip",
};

/** automaticDeserialization: false면 HMGET은 필드 순서 배열을 준다 (객체로 오는 경우도 받아 둔다) */
function hmgetValues(got: unknown, fields: string[]): (string | null)[] {
  if (Array.isArray(got)) return fields.map((_, i) => (got[i] as string | null) ?? null);
  const o = (got ?? {}) as Record<string, string | null>;
  return fields.map((f) => o[f] ?? null);
}

export class RedisBans implements BanStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async save(rec: BanRecord): Promise<void> {
    await this.redis.hset(BK.rec, { [rec.id]: JSON.stringify(rec) });
  }
  async get(id: string): Promise<BanRecord | null> {
    const raw = await this.redis.hget<string>(BK.rec, id);
    return raw ? (JSON.parse(raw) as BanRecord) : null;
  }
  async list(): Promise<BanRecord[]> {
    const flat = (await this.redis.hgetall(BK.rec)) as unknown as Record<string, string> | string[] | null;
    const values = !flat ? [] : Array.isArray(flat) ? flat.filter((_, i) => i % 2 === 1) : Object.values(flat);
    return values.map((v) => JSON.parse(v) as BanRecord).sort((a, b) => b.startAt - a.startAt);
  }
  async lookup(accountId: string | null, ipHash: string | null, now: number): Promise<BanPointer | null> {
    const fields = [accountId ? `a:${accountId}` : null, ipHash ? `i:${ipHash}` : null].filter((f): f is string => !!f);
    if (!fields.length) return null;
    const vals = hmgetValues(await this.redis.hmget(BK.idx, ...fields), fields);
    for (const v of vals) {
      const p = decodePtr(v);
      if (livePtr(p, now)) return p;
    }
    return null;
  }
  async index(): Promise<Map<string, BanPointer>> {
    const flat = (await this.redis.hgetall(BK.idx)) as unknown as Record<string, string> | string[] | null;
    const entries: [string, string][] = !flat
      ? []
      : Array.isArray(flat)
        ? Array.from({ length: flat.length / 2 }, (_, i) => [flat[i * 2], flat[i * 2 + 1]] as [string, string])
        : Object.entries(flat);
    const m = new Map<string, BanPointer>();
    for (const [k, v] of entries) {
      const p = decodePtr(v);
      if (p) m.set(k, p);
    }
    return m;
  }
  async point(target: string, rec: BanRecord | null): Promise<void> {
    if (rec) await this.redis.hset(BK.idx, { [target]: encodePtr(rec) });
    else await this.redis.hdel(BK.idx, target);
  }

  async seen(accountId: string, ipHash: string, now: number, operator: boolean): Promise<void> {
    // 같은 계정·IP는 SEEN_EVERY_SEC에 한 번만 적는다 → 평소 입장은 SET NX 한 번
    const first = await this.redis.set(BK.seen(accountId, ipHash), "1", { nx: true, ex: SEEN_EVERY_SEC });
    if (first === null) return;
    const m = this.redis
      .multi()
      .zadd(BK.ips(accountId), { score: now, member: ipHash })
      .zremrangebyrank(BK.ips(accountId), 0, -(ACCT_IPS_KEEP + 1))
      .expire(BK.ips(accountId), SEEN_TTL_SEC)
      .zadd(BK.ipAcct(ipHash), { score: now, member: accountId })
      .zremrangebyrank(BK.ipAcct(ipHash), 0, -(IP_ACCTS_KEEP + 1))
      .expire(BK.ipAcct(ipHash), SEEN_TTL_SEC);
    if (operator) m.sadd(BK.opIp, ipHash);
    await m.exec();
  }
  private async recent(key: string, now: number): Promise<[string, number][]> {
    const raw = (await this.redis.zrange(key, "+inf", now - SEEN_TTL_SEC * 1000, { byScore: true, rev: true, withScores: true })) as string[];
    const out: [string, number][] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) out.push([raw[i], Number(raw[i + 1])]);
    return out;
  }
  async accountIps(accountId: string, now: number): Promise<SeenIp[]> {
    return (await this.recent(BK.ips(accountId), now)).map(([ipHash, lastAt]) => ({ ipHash, lastAt }));
  }
  async ipAccounts(ipHash: string, now: number): Promise<SeenAccount[]> {
    return (await this.recent(BK.ipAcct(ipHash), now)).map(([accountId, lastAt]) => ({ accountId, lastAt }));
  }
  async isOperatorIp(ipHash: string): Promise<boolean> {
    return (await this.redis.sismember(BK.opIp, ipHash)) === 1;
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 남게 globalThis에 둔다 (store/index.ts와 같은 방식)
const g = globalThis as typeof globalThis & { __tombBans?: BanStore };

export function getBanStore(): BanStore {
  const cur = g.__tombBans;
  const conn = env.redis();
  if (conn) return cur instanceof RedisBans ? cur : (g.__tombBans = new RedisBans(conn));
  if (env.isProd()) throw new Error("[bans] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryBans) return cur;
  g.__tombBans = cur ? Object.assign(new MemoryBans(), cur) : new MemoryBans();
  return g.__tombBans;
}
