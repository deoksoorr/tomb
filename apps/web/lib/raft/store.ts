import type { Redis } from "@upstash/redis";
import { RAFT_DAILY_MIN, RAFT_PRICE, RAFT_PRICE_MIN, RAFT_REBUY_WAIT_MS, RAFT_RENEW_MAX, RAFT_RENEW_WINDOW_MS, RAFT_TICKET_MIN, raftGrantMin, raftPriceFor } from "@tomb/protocol";
import { env } from "../env";
import { redisClient } from "../redisUsage";
import { econKeyFor, kstDay } from "../store/accounts";
import { getAccounts } from "../store";
import { K } from "../store/keys";
import { ECON_TTL_SEC } from "../store/types";
import { getTitleStats, MemoryTitleStats, titleStatsKey } from "../store/titleStats";

// 11/27 좌대 입장권 저장소 (규칙은 protocol raft.ts). 사기·연장은 확인·포인트 빼기·기록을 Lua 하나로 (연타·창 여러 개에도 한 번만).
//
// Redis 키
//  - raft:ch:{ch}          HASH  좌대 번호 → `계정|끝|연장 수|산 시각|이름` (끝난 것은 사거나 연장할 때 지운다 — 많아야 6칸)
//  - raft:own:{계정}        STRING `채널|번호|끝|연장 수` (한 사람 한 장 — 끝난 뒤 10분 + 1분까지 남긴다)
//  - raft:cool:{ch}:{계정}  STRING 그 채널 마지막 입장권이 끝나는 시각 (끝난 뒤 10분까지 — 다시 사기 막기)
//  - raft:day:{날짜}:{계정} STRING 오늘(KST) 산 좌대 시간 합 (분, 이틀 뒤 사라짐)
//  - titles:stats:{계정}    HASH  rafts(산·연장한 수) · raftMin(산 시간 합, 분) — 칭호 「좌대 단골」·「밤낚시 장인」
//  - 포인트: acct·ledger·econ (accounts-redis SPEND_LUA와 같은 규칙, 경제 통계 spend:raft)

export const RAFT_DAY_TTL_SEC = 2 * 86_400;
const keys = {
  board: (ch: number) => `raft:ch:${ch}`,
  own: (acct: string) => `raft:own:${acct}`,
  cool: (ch: number, acct: string) => `raft:cool:${ch}:${acct}`,
  day: (day: string, acct: string) => `raft:day:${day}:${acct}`,
};
export const raftKeys = keys;

export type RaftHold = { n: number; acct: string; until: number; renews: number; start: number; name: string };
export type RaftOwn = { ch: number; n: number; until: number; renews: number };
export type RaftFail = "HAVE" | "WAIT" | "SOLD" | "DAY" | "POINTS" | "NONE" | "EARLY" | "MAX";
export type RaftDeal = { ok: true; until: number; min: number; price: number; points: number; renews: number } | { ok: false; why: RaftFail; until?: number; n?: number; ch?: number };

export interface RaftStore {
  /** 그 채널 좌대 (끝난 것 포함일 수 있다 — 부르는 쪽이 시각으로 거른다) */
  board(ch: number): Promise<RaftHold[]>;
  /** 내 입장권 + 그 채널 다시 사기 막힘 끝 + 오늘 쓴 분 (한 번에) */
  mine(acct: string, ch: number, day: string): Promise<{ own: RaftOwn | null; coolUntil: number; used: number }>;
  buy(acct: string, name: string, ch: number, n: number, now: number): Promise<RaftDeal>;
  renew(acct: string, now: number): Promise<RaftDeal>;
  /** 개발 전용: 내 입장권 끝을 지금 + leftMs로 (연장 창·끝남 확인용) */
  devLeft(acct: string, leftMs: number, now: number): Promise<RaftOwn | null>;
}

const parseHold = (n: number, raw: string): RaftHold | null => {
  const m = /^([^|]+)\|(\d+)\|(\d+)\|(\d+)\|([^]*)$/.exec(raw);
  return m ? { n, acct: m[1], until: Number(m[2]), renews: Number(m[3]), start: Number(m[4]), name: m[5] } : null;
};
export const parseOwn = (raw: string | null | undefined): RaftOwn | null => {
  const m = raw ? /^(\d+)\|(\d+)\|(\d+)\|(\d+)$/.exec(String(raw)) : null;
  return m ? { ch: Number(m[1]), n: Number(m[2]), until: Number(m[3]), renews: Number(m[4]) } : null;
};
/** 이름표에 「|」가 들어가도 저장 모양이 깨지지 않게 (이름은 마지막 칸이라 그대로 둬도 되지만 줄바꿈만 뺀다) */
const cleanName = (s: string) => s.replace(/[\r\n]/g, " ").slice(0, 40);
const reasonOf = (ch: number, n: number, renew: boolean) => `raft:${n}번 좌대 ${renew ? "연장" : "입장권"} (${ch}채널)`;

// ── 메모리 (로컬·시험) ──
export class MemoryRaft implements RaftStore {
  private boards = new Map<number, Map<number, RaftHold>>();
  private owns = new Map<string, RaftOwn>();
  private cools = new Map<string, number>();
  private days = new Map<string, number>();

  private bd(ch: number) {
    let b = this.boards.get(ch);
    if (!b) this.boards.set(ch, (b = new Map()));
    return b;
  }
  async board(ch: number): Promise<RaftHold[]> {
    return [...this.bd(ch).values()].map((h) => ({ ...h }));
  }
  async mine(acct: string, ch: number, day: string) {
    const own = this.owns.get(acct);
    return { own: own ? { ...own } : null, coolUntil: this.cools.get(`${ch}:${acct}`) ?? 0, used: this.days.get(`${day}:${acct}`) ?? 0 };
  }
  private stats(acct: string, min: number) {
    // 개발 서버가 옛 모듈의 메모리 저장소를 들고 있을 수 있어 메서드가 있을 때만 (칭호 기록이 사기를 막지 않게)
    const t = getTitleStats() as Partial<MemoryTitleStats>;
    if (typeof t.bumpRaft === "function") t.bumpRaft(acct, min);
  }
  private async charge(acct: string, price: number, reason: string, now: number): Promise<number | null> {
    return getAccounts().spend(acct, price, reason, now);
  }
  async buy(acct: string, name: string, ch: number, n: number, now: number): Promise<RaftDeal> {
    const day = kstDay(now);
    const own = this.owns.get(acct);
    if (own && own.until > now) return { ok: false, why: "HAVE", n: own.n, ch: own.ch, until: own.until };
    const cool = this.cools.get(`${ch}:${acct}`) ?? 0;
    if (cool > 0 && now < cool + RAFT_REBUY_WAIT_MS) return { ok: false, why: "WAIT", until: cool + RAFT_REBUY_WAIT_MS };
    const b = this.bd(ch);
    const cur = b.get(n);
    if (cur && cur.until > now) return { ok: false, why: "SOLD", until: cur.until };
    const min = raftGrantMin(RAFT_DAILY_MIN - (this.days.get(`${day}:${acct}`) ?? 0));
    if (min < 1) return { ok: false, why: "DAY" };
    const price = raftPriceFor(min);
    const points = await this.charge(acct, price, reasonOf(ch, n, false), now);
    if (points === null) return { ok: false, why: "POINTS" };
    for (const [k, h] of b) if (h.until <= now) b.delete(k);
    const until = now + min * 60_000;
    b.set(n, { n, acct, until, renews: 0, start: now, name: cleanName(name) });
    this.owns.set(acct, { ch, n, until, renews: 0 });
    this.cools.set(`${ch}:${acct}`, until);
    this.days.set(`${day}:${acct}`, (this.days.get(`${day}:${acct}`) ?? 0) + min);
    this.stats(acct, min);
    return { ok: true, until, min, price, points, renews: 0 };
  }
  async renew(acct: string, now: number): Promise<RaftDeal> {
    const day = kstDay(now);
    const own = this.owns.get(acct);
    if (!own || own.until <= now) return { ok: false, why: "NONE" };
    if (own.until - now > RAFT_RENEW_WINDOW_MS) return { ok: false, why: "EARLY", until: own.until };
    if (own.renews >= RAFT_RENEW_MAX) return { ok: false, why: "MAX" };
    const min = raftGrantMin(RAFT_DAILY_MIN - (this.days.get(`${day}:${acct}`) ?? 0));
    if (min < 1) return { ok: false, why: "DAY" };
    const price = raftPriceFor(min);
    const points = await this.charge(acct, price, reasonOf(own.ch, own.n, true), now);
    if (points === null) return { ok: false, why: "POINTS" };
    const until = own.until + min * 60_000;
    const renews = own.renews + 1;
    const h = this.bd(own.ch).get(own.n);
    this.bd(own.ch).set(own.n, { n: own.n, acct, until, renews, start: h?.acct === acct ? h.start : now, name: h?.acct === acct ? h.name : "" });
    this.owns.set(acct, { ...own, until, renews });
    this.cools.set(`${own.ch}:${acct}`, until);
    this.days.set(`${day}:${acct}`, (this.days.get(`${day}:${acct}`) ?? 0) + min);
    this.stats(acct, min);
    return { ok: true, until, min, price, points, renews };
  }
  async devLeft(acct: string, leftMs: number, now: number): Promise<RaftOwn | null> {
    const own = this.owns.get(acct);
    if (!own || own.until <= now) return null;
    const until = now + Math.max(0, leftMs);
    const h = this.bd(own.ch).get(own.n);
    if (h && h.acct === acct) h.until = until;
    own.until = until;
    this.cools.set(`${own.ch}:${acct}`, until);
    return { ...own };
  }
}

// ── Redis ──
// 값 계산(분 비례 값)은 Lua 안에서 protocol raftPriceFor와 같은 식으로 (Math.round = floor(x + 0.5), 양수만)
const PRICE_FN = `
local function price(m)
  if m >= ${RAFT_TICKET_MIN} then return ${RAFT_PRICE} end
  return math.max(${RAFT_PRICE_MIN}, math.floor((${RAFT_PRICE} * m / ${RAFT_TICKET_MIN}) / 10 + 0.5) * 10)
end
local function charge(acctKey, ledgerKey, econKey, amount, now, reason)
  if tonumber(redis.call('HGET', acctKey, 'points') or '0') < amount then return nil end
  local left = redis.call('HINCRBY', acctKey, 'points', -amount)
  redis.call('LPUSH', ledgerKey, '{"at":' .. now .. ',"amount":-' .. amount .. ',"reason":"' .. reason .. '"}')
  redis.call('LTRIM', ledgerKey, 0, 99)
  redis.call('HINCRBY', econKey, 'spend:raft', amount)
  redis.call('EXPIRE', econKey, ${ECON_TTL_SEC})
  return left
end
local function prune(boardKey, now)
  local all = redis.call('HGETALL', boardKey)
  for i = 1, #all, 2 do
    local u = tonumber(string.match(all[i + 1], '^[^|]+|(%d+)|') or '0')
    if u <= now then redis.call('HDEL', boardKey, all[i]) end
  end
end
`;

// KEYS: board, own, cool, day, acct, ledger, econ, titleStats
// ARGV: 계정, 번호, now, 이름, 채널, 사용 사유
// → {1, 끝, 분, 값, 남은 포인트} | {-1 HAVE, 번호, 채널, 끝} | {-2 WAIT, 풀리는 시각} | {-3 SOLD, 끝} | {-4 DAY} | {-5 POINTS}
const BUY_LUA = `${PRICE_FN}
local now = tonumber(ARGV[3])
local own = redis.call('GET', KEYS[2])
if own then
  local och, on, ou = string.match(own, '^(%d+)|(%d+)|(%d+)|')
  if ou and tonumber(ou) > now then return {-1, tonumber(on), tonumber(och), tonumber(ou)} end
end
local cool = tonumber(redis.call('GET', KEYS[3]) or '0')
if cool > 0 and now < cool + ${RAFT_REBUY_WAIT_MS} then return {-2, cool + ${RAFT_REBUY_WAIT_MS}} end
local cur = redis.call('HGET', KEYS[1], ARGV[2])
if cur then
  local cu = tonumber(string.match(cur, '^[^|]+|(%d+)|') or '0')
  if cu > now then return {-3, cu} end
end
local used = tonumber(redis.call('GET', KEYS[4]) or '0')
local m = math.min(${RAFT_TICKET_MIN}, ${RAFT_DAILY_MIN} - used)
if m < 1 then return {-4} end
local p = price(m)
local left = charge(KEYS[5], KEYS[6], KEYS[7], p, now, ARGV[6])
if not left then return {-5, p} end
prune(KEYS[1], now)
local u = now + m * 60000
redis.call('HSET', KEYS[1], ARGV[2], ARGV[1] .. '|' .. u .. '|0|' .. now .. '|' .. ARGV[4])
redis.call('SET', KEYS[2], ARGV[5] .. '|' .. ARGV[2] .. '|' .. u .. '|0', 'PX', u - now + ${RAFT_REBUY_WAIT_MS + 60_000})
redis.call('SET', KEYS[3], u, 'PX', u - now + ${RAFT_REBUY_WAIT_MS})
redis.call('INCRBY', KEYS[4], m)
redis.call('EXPIRE', KEYS[4], ${RAFT_DAY_TTL_SEC})
redis.call('HINCRBY', KEYS[8], 'rafts', 1)
redis.call('HINCRBY', KEYS[8], 'raftMin', m)
return {1, u, m, p, left}
`;

// KEYS: board, own, cool, day, acct, ledger, econ, titleStats  ARGV: 계정, now, 채널(own에서 읽은 것), 사용 사유
// → {1, 끝, 분, 값, 남은 포인트, 연장 수} | {-6 NONE} | {-7 EARLY, 끝} | {-8 MAX} | {-4 DAY} | {-5 POINTS}
const RENEW_LUA = `${PRICE_FN}
local now = tonumber(ARGV[2])
local own = redis.call('GET', KEYS[2])
if not own then return {-6} end
local och, on, ou, orn = string.match(own, '^(%d+)|(%d+)|(%d+)|(%d+)$')
if not ou or och ~= ARGV[3] then return {-6} end
ou = tonumber(ou)
orn = tonumber(orn)
if ou <= now then return {-6} end
if ou - now > ${RAFT_RENEW_WINDOW_MS} then return {-7, ou} end
if orn >= ${RAFT_RENEW_MAX} then return {-8} end
local used = tonumber(redis.call('GET', KEYS[4]) or '0')
local m = math.min(${RAFT_TICKET_MIN}, ${RAFT_DAILY_MIN} - used)
if m < 1 then return {-4} end
local p = price(m)
local left = charge(KEYS[5], KEYS[6], KEYS[7], p, now, ARGV[4])
if not left then return {-5, p} end
local u = ou + m * 60000
local rn = orn + 1
local cur = redis.call('HGET', KEYS[1], on)
local start, name = now, ''
if cur then
  local ca, cs, cn = string.match(cur, '^([^|]+)|%d+|%d+|(%d+)|(.*)$')
  if ca == ARGV[1] then start, name = cs, cn end
end
redis.call('HSET', KEYS[1], on, ARGV[1] .. '|' .. u .. '|' .. rn .. '|' .. start .. '|' .. name)
redis.call('SET', KEYS[2], och .. '|' .. on .. '|' .. u .. '|' .. rn, 'PX', u - now + ${RAFT_REBUY_WAIT_MS + 60_000})
redis.call('SET', KEYS[3], u, 'PX', u - now + ${RAFT_REBUY_WAIT_MS})
redis.call('INCRBY', KEYS[4], m)
redis.call('EXPIRE', KEYS[4], ${RAFT_DAY_TTL_SEC})
redis.call('HINCRBY', KEYS[8], 'rafts', 1)
redis.call('HINCRBY', KEYS[8], 'raftMin', m)
return {1, u, m, p, left, rn}
`;

// 개발 전용. KEYS: board, own, cool  ARGV: 계정, 새 끝, now
const DEV_LEFT_LUA = `
local own = redis.call('GET', KEYS[2])
if not own then return nil end
local och, on, ou, orn = string.match(own, '^(%d+)|(%d+)|(%d+)|(%d+)$')
if not ou or tonumber(ou) <= tonumber(ARGV[3]) then return nil end
local u = tonumber(ARGV[2])
local cur = redis.call('HGET', KEYS[1], on)
if cur then
  local ca, crn, cs, cn = string.match(cur, '^([^|]+)|%d+|(%d+)|(%d+)|(.*)$')
  if ca == ARGV[1] then redis.call('HSET', KEYS[1], on, ca .. '|' .. u .. '|' .. crn .. '|' .. cs .. '|' .. cn) end
end
local v = och .. '|' .. on .. '|' .. u .. '|' .. orn
redis.call('SET', KEYS[2], v, 'PX', math.max(1000, u - tonumber(ARGV[3]) + ${RAFT_REBUY_WAIT_MS + 60_000}))
redis.call('SET', KEYS[3], u, 'PX', math.max(1000, u - tonumber(ARGV[3]) + ${RAFT_REBUY_WAIT_MS}))
return v
`;

const FAIL: Record<number, RaftFail> = { [-1]: "HAVE", [-2]: "WAIT", [-3]: "SOLD", [-4]: "DAY", [-5]: "POINTS", [-6]: "NONE", [-7]: "EARLY", [-8]: "MAX" };

export class RedisRaft implements RaftStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "raft");
  }
  async board(ch: number): Promise<RaftHold[]> {
    // HGETALL은 객체로 올 때도, [필드, 값, …] 배열로 올 때도 있다 (메모리 redis-hmget-array — 둘 다 받는다)
    const raw = (await this.redis.hgetall<Record<string, string>>(keys.board(ch))) as unknown;
    const pairs: [string, unknown][] = Array.isArray(raw) ? Array.from({ length: Math.floor(raw.length / 2) }, (_, i) => [String(raw[2 * i]), raw[2 * i + 1]]) : Object.entries((raw ?? {}) as Record<string, unknown>);
    return pairs
      .map(([n, raw]) => parseHold(Number(n), String(raw)))
      .filter((h): h is RaftHold => !!h);
  }
  async mine(acct: string, ch: number, day: string) {
    const r = (await this.redis.mget<(string | number | null)[]>(keys.own(acct), keys.cool(ch, acct), keys.day(day, acct))) ?? [];
    return { own: parseOwn(r[0] === null || r[0] === undefined ? null : String(r[0])), coolUntil: Number(r[1]) || 0, used: Number(r[2]) || 0 };
  }
  private async keysFor(acct: string, ch: number, now: number) {
    const day = kstDay(now);
    return [keys.board(ch), keys.own(acct), keys.cool(ch, acct), keys.day(day, acct), K.acct(acct), K.ledger(acct), await econKeyFor(acct, day), titleStatsKey(acct)];
  }
  private deal(r: unknown, renew: boolean): RaftDeal {
    const a = (Array.isArray(r) ? r : []).map(Number);
    if (a[0] === 1) return { ok: true, until: a[1], min: a[2], price: a[3], points: a[4], renews: renew ? a[5] : 0 };
    const why = FAIL[a[0]] ?? "NONE";
    if (why === "HAVE") return { ok: false, why, n: a[1], ch: a[2], until: a[3] };
    if (why === "WAIT" || why === "SOLD" || why === "EARLY") return { ok: false, why, until: a[1] };
    return { ok: false, why };
  }
  async buy(acct: string, name: string, ch: number, n: number, now: number): Promise<RaftDeal> {
    const r = await this.redis.eval(BUY_LUA, await this.keysFor(acct, ch, now), [acct, String(n), String(now), cleanName(name), String(ch), reasonOf(ch, n, false)]);
    return this.deal(r, false);
  }
  async renew(acct: string, now: number): Promise<RaftDeal> {
    const own = parseOwn(await this.redis.get<string>(keys.own(acct)));
    if (!own || own.until <= now) return { ok: false, why: "NONE" };
    const r = await this.redis.eval(RENEW_LUA, await this.keysFor(acct, own.ch, now), [acct, String(now), String(own.ch), reasonOf(own.ch, own.n, true)]);
    return this.deal(r, true);
  }
  async devLeft(acct: string, leftMs: number, now: number): Promise<RaftOwn | null> {
    const own = parseOwn(await this.redis.get<string>(keys.own(acct)));
    if (!own) return null;
    const v = await this.redis.eval(DEV_LEFT_LUA, [keys.board(own.ch), keys.own(acct), keys.cool(own.ch, acct)], [acct, String(now + Math.max(0, leftMs)), String(now)]);
    return parseOwn(v === null || v === undefined ? null : String(v));
  }
}

const g = globalThis as typeof globalThis & { __tombRaft?: RaftStore };

export function getRaftStore(): RaftStore {
  const cur = g.__tombRaft;
  const conn = env.redis();
  if (conn) return cur instanceof RedisRaft ? cur : (g.__tombRaft = new RedisRaft(conn));
  if (env.isProd()) throw new Error("[raft] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryRaft) return cur;
  return (g.__tombRaft = cur ? Object.assign(new MemoryRaft(), cur) : new MemoryRaft());
}
