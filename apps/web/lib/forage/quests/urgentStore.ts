import { Redis } from "@upstash/redis";
import { env } from "../../env";
import { K } from "../../store/keys";
import { titleStatsKey } from "../../store/titleStats";
import { lk } from "../store";
import { questKey } from "./store";
import { countOf, URGENT_TTL_SEC, type UrgentKind } from "./urgent";

// 11/15: 긴급 의뢰 저장소. 언제·무엇은 저장하지 않는다(lib/forage/quests/urgent 시드). 목표·막대·순위·받은 표시만.
// 바뀌는 연산은 하나씩 원자적이다 (Redis는 Lua 한 번, 메모리는 await 없는 구간). urgent.test.ts가 메모리 구현에 계약을 돌린다.
//
// Redis 키 (의뢰 id = "YYYYMMDD-0|1", 테스트 서버 시험 의뢰는 "t…"). 모두 TTL URGENT_TTL_SEC (약 4일)
//  - urg:{id}       HASH  goal = 목표(처음 정한 값) · n = 낸 수(막대) · fest = 150%에 닿은 시각(ms, 축제 시작)
//                         last = 마지막 1분에 100%를 넘긴 계정 · a0·a2·a1 = 시작·축제·끝 확성기 남김
//  - urg:{id}:by    ZSET  계정 → 낸 수 + 먼저 닿은 순서(소수부, lib/forage/quests/urgent rankScore)
//  - urg:{id}:nm    HASH  계정 → 이름 (순위 3명 표시용)
//  - urg:{id}:got   HASH  계정 → 받은 보상 JSON (한 번만 — HSETNX)
//  - urg:test       STRING 테스트 서버 시험 의뢰 JSON (운영 서버에서는 읽지도 쓰지도 않는다)
// 함께 바꾸는 키: 가방 forage:{a}:bag(납품·상자 물고기) · 의뢰 도장 quest:{a}(st) · 계정 acct:{a}:inv(염색권)·:look·:stash(사이렌 모자)
//                 · 칭호 누적 titles:stats:{a}(urgKing·urgLast = 칭호가 끝나는 시각 ms)

export const uk = {
  ev: (id: string) => `urg:${id}`,
  by: (id: string) => `urg:${id}:by`,
  nm: (id: string) => `urg:${id}:nm`,
  got: (id: string) => `urg:${id}:got`,
  test: "urg:test",
};

export type UrgentState = { goal: number; n: number; fest: number; last: string | null; a0: boolean; a1: boolean; a2: boolean };
export type NoticeField = "a0" | "a1" | "a2";
export type UrgentTop = { acct: string; name: string; n: number };
export type UrgentMine = { id: string; n: number; got: string | null };
/** 시험 의뢰 (테스트 서버) */
export type UrgentTest = { id: string; kind: UrgentKind; start: number; end: number };

export type DeliverArgs = {
  /** 목표 (저장된 값) */
  goal: number;
  end: number;
  now: number;
  /** 순위 소수부 (먼저 닿은 사람이 위) */
  frac: number;
  /** 마지막 1분이 시작하는 시각 */
  lastFrom: number;
};
export type UrgentDeliverResult = { status: "ok"; n: number; mine: number; fest: number } | { status: "bag" };

/** 받기: 단계 도장 + 상자 + 칭호·모자를 한 번에 */
export type ClaimPlan = {
  /** 받은 표시에 남길 JSON */
  record: string;
  stamps: number;
  stampCap: number;
  /** 상자 염색권 아이템 id (없으면 "") */
  dye: string;
  /** 상자 물고기 id (없으면 "") — 가방 칸이 가득이면 대신 fishFallback 도장 */
  fish: string;
  fishFallback: number;
  stackMax: number;
  /** 사이렌 모자 (없으면 null) */
  hat: { id: string; slot: string; until: number } | null;
  now: number;
  /** 칭호가 끝나는 시각 (0 = 없음) */
  kingUntil: number;
  lastUntil: number;
};
export type ClaimResult = { status: "ok"; stamps: number; fish: boolean } | { status: "dup" | "noacct" };

export interface UrgentStore {
  /** 막대·목표 (명령 1개) */
  state(id: string): Promise<UrgentState>;
  /** 목표를 처음 한 번 정한다 (이미 있으면 그 값). 정해진 목표를 돌려준다 */
  setGoal(id: string, goal: number): Promise<number>;
  /** 확성기 남김 표시 (처음이면 true) */
  mark(id: string, field: NoticeField): Promise<boolean>;
  /**
   * 납품 (원자적): 가방에 모자라면 bag (아무것도 바뀌지 않는다). 아니면 가방에서 빼고 막대 +낸 수, 순위 +낸 수, 이름 기억.
   * 150%를 처음 넘기면 fest = now, 마지막 1분에 100%를 처음 넘기면 last = 이 계정
   */
  deliver(id: string, acct: string, name: string, items: Record<string, number>, a: DeliverArgs): Promise<UrgentDeliverResult>;
  /** 많이 낸 순 k명 (명령 2개) */
  top(id: string, k: number): Promise<UrgentTop[]>;
  /** 의뢰마다 내가 낸 수·받은 기록 (의뢰마다 명령 2개) */
  mine(ids: readonly string[], acct: string): Promise<UrgentMine[]>;
  /** 보상 받기 (원자적, 의뢰·계정마다 한 번). 계정이 없으면 noacct, 이미 받았으면 dup */
  claim(id: string, acct: string, plan: ClaimPlan): Promise<ClaimResult>;
  /** 시험 의뢰 (테스트 서버 전용) */
  testGet(): Promise<UrgentTest | null>;
  testSet(t: UrgentTest | null): Promise<void>;
  /** 시험: 막대만 더하기 */
  testAdd(id: string, n: number): Promise<number>;
  /** 시험: 축제 시작 표시 (처음만) */
  testFest(id: string, now: number): Promise<void>;
}

const num = (v: unknown) => Number(v) || 0;
export function stateOf(h: Record<string, string>): UrgentState {
  return { goal: num(h.goal), n: num(h.n), fest: num(h.fest), last: h.last || null, a0: h.a0 === "1", a1: h.a1 === "1", a2: h.a2 === "1" };
}

// ── 메모리 (로컬·시험) ──

/** 메모리 구현이 함께 바꾸는 다른 저장소 (모두 동기) */
export type UrgentMemDeps = {
  takeBag(acct: string, items: Record<string, number>): boolean;
  bagHas(acct: string, id: string): number;
  giveBag(acct: string, id: string, n: number): void;
  hasAccount(acct: string): boolean;
  giveInv(acct: string, itemId: string): void;
  /** 의뢰 도장 더하기 (상한까지). 새 도장 수 */
  addStamps(acct: string, n: number, cap: number): number;
  /** 기간 꾸미기 (입고 있으면 그 자리, 아니면 벗어 둔 꾸미기 — 더 길 때만) */
  grantTimed(acct: string, itemId: string, slot: string, until: number): void;
  setTitleUntil(acct: string, field: "urgKing" | "urgLast", until: number): void;
};

export class MemoryUrgentStore implements UrgentStore {
  private evs = new Map<string, Record<string, string>>();
  private bys = new Map<string, Map<string, number>>();
  private nms = new Map<string, Map<string, string>>();
  private gots = new Map<string, Map<string, string>>();
  private test: UrgentTest | null = null;
  constructor(private deps: () => UrgentMemDeps) {}

  private ev(id: string) {
    let x = this.evs.get(id);
    if (!x) this.evs.set(id, (x = {}));
    return x;
  }
  private map<T>(m: Map<string, Map<string, T>>, id: string) {
    let x = m.get(id);
    if (!x) m.set(id, (x = new Map()));
    return x;
  }

  async state(id: string) {
    return stateOf({ ...(this.evs.get(id) ?? {}) });
  }
  async setGoal(id: string, goal: number) {
    const e = this.ev(id);
    e.goal ??= String(goal);
    return Number(e.goal);
  }
  async mark(id: string, field: NoticeField) {
    const e = this.ev(id);
    if (e[field] === "1") return false;
    e[field] = "1";
    return true;
  }
  async deliver(id: string, acct: string, name: string, items: Record<string, number>, a: DeliverArgs): Promise<UrgentDeliverResult> {
    if (!this.deps().takeBag(acct, items)) return { status: "bag" };
    const e = this.ev(id);
    const add = Object.values(items).reduce((s, n) => s + n, 0);
    const before = num(e.n);
    const n = before + add;
    e.n = String(n);
    const by = this.map(this.bys, id);
    const mine = countOf(by.get(acct) ?? 0) + add;
    by.set(acct, mine + a.frac);
    this.map(this.nms, id).set(acct, name);
    if (!e.fest && before * 2 < a.goal * 3 && n * 2 >= a.goal * 3) e.fest = String(a.now);
    if (!e.last && before < a.goal && n >= a.goal && a.now >= a.lastFrom) e.last = acct;
    return { status: "ok", n, mine, fest: num(e.fest) };
  }
  async top(id: string, k: number) {
    const by = [...(this.bys.get(id) ?? new Map<string, number>())].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1)).slice(0, k);
    const nm = this.nms.get(id);
    return by.map(([acct, s]) => ({ acct, name: nm?.get(acct) ?? "", n: countOf(s) }));
  }
  async mine(ids: readonly string[], acct: string) {
    return ids.map((id) => ({ id, n: countOf(this.bys.get(id)?.get(acct) ?? 0), got: this.gots.get(id)?.get(acct) ?? null }));
  }
  async claim(id: string, acct: string, p: ClaimPlan): Promise<ClaimResult> {
    const d = this.deps();
    if (!d.hasAccount(acct)) return { status: "noacct" };
    const got = this.map(this.gots, id);
    if (got.has(acct)) return { status: "dup" };
    got.set(acct, p.record);
    let st = p.stamps;
    if (p.dye) d.giveInv(acct, p.dye);
    let fish = false;
    if (p.fish) {
      if (d.bagHas(acct, p.fish) < p.stackMax) {
        d.giveBag(acct, p.fish, 1);
        fish = true;
      } else st += p.fishFallback;
    }
    const stamps = d.addStamps(acct, st, p.stampCap);
    if (p.hat) d.grantTimed(acct, p.hat.id, p.hat.slot, p.hat.until);
    if (p.kingUntil > 0) d.setTitleUntil(acct, "urgKing", p.kingUntil);
    if (p.lastUntil > 0) d.setTitleUntil(acct, "urgLast", p.lastUntil);
    return { status: "ok", stamps, fish };
  }
  async testGet() {
    return this.test;
  }
  async testSet(t: UrgentTest | null) {
    this.test = t;
  }
  async testAdd(id: string, n: number) {
    const e = this.ev(id);
    e.n = String(num(e.n) + n);
    return Number(e.n);
  }
  async testFest(id: string, now: number) {
    this.ev(id).fest ??= String(now);
  }
}

// ── Redis (운영) ──

// KEYS: ev, by, nm, bag  ARGV: 계정, 이름, 목표, 지금, 순위 소수부, 마지막 1분 시작, ttl, (id, 개수)...
// → {'ok', 막대, 내 수, fest} | {'bag'}
export const URGENT_DELIVER_LUA = `
for i = 8, #ARGV, 2 do
  if tonumber(redis.call('HGET', KEYS[4], ARGV[i]) or '0') < tonumber(ARGV[i + 1]) then return {'bag'} end
end
local add = 0
for i = 8, #ARGV, 2 do
  local k = tonumber(ARGV[i + 1])
  add = add + k
  if redis.call('HINCRBY', KEYS[4], ARGV[i], -k) <= 0 then redis.call('HDEL', KEYS[4], ARGV[i]) end
end
local goal, now = tonumber(ARGV[3]), tonumber(ARGV[4])
local n = redis.call('HINCRBY', KEYS[1], 'n', add)
local before = n - add
local old = tonumber(redis.call('ZSCORE', KEYS[2], ARGV[1]) or '0')
local mine = math.floor(old + 1e-9) + add
redis.call('ZADD', KEYS[2], mine + tonumber(ARGV[5]), ARGV[1])
redis.call('HSET', KEYS[3], ARGV[1], ARGV[2])
if before * 2 < goal * 3 and n * 2 >= goal * 3 then redis.call('HSETNX', KEYS[1], 'fest', ARGV[4]) end
if before < goal and n >= goal and now >= tonumber(ARGV[6]) then redis.call('HSETNX', KEYS[1], 'last', ARGV[1]) end
if before == 0 then redis.call('EXPIRE', KEYS[1], ARGV[7]) end
if mine == add then
  redis.call('EXPIRE', KEYS[2], ARGV[7])
  redis.call('EXPIRE', KEYS[3], ARGV[7])
end
return {'ok', n, mine, redis.call('HGET', KEYS[1], 'fest') or '0'}
`;

// KEYS: got, quest, inv, bag, look, stash, tstats, acct
// ARGV: 계정, 기록, 도장, 도장 상한, 염색권 id, 물고기 id, 가득일 때 도장, 칸 상한, 모자 id, 모자 부위, 모자 끝, 지금, 배달왕 끝, 마감 끝, ttl
// 기간 꾸미기는 lib/store/accounts-redis.ts TIER_LUA와 같은 자리 규칙 (입고 있으면 그 자리, 아니면 벗어 둔 꾸미기 — 더 길 때만)
// → {'ok', 도장, 물고기 넣음(1/0)} | {'dup'} | {'noacct'}
export const URGENT_CLAIM_LUA = `
if redis.call('EXISTS', KEYS[8]) == 0 then return {'noacct'} end
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 0 then return {'dup'} end
redis.call('EXPIRE', KEYS[1], ARGV[15])
local st = tonumber(ARGV[3])
if ARGV[5] ~= '' then redis.call('HINCRBY', KEYS[3], ARGV[5], 1) end
local fish = 0
if ARGV[6] ~= '' then
  if tonumber(redis.call('HGET', KEYS[4], ARGV[6]) or '0') < tonumber(ARGV[8]) then
    redis.call('HINCRBY', KEYS[4], ARGV[6], 1)
    fish = 1
  else
    st = st + tonumber(ARGV[7])
  end
end
local total = tonumber(redis.call('HGET', KEYS[2], 'st') or '0')
if st > 0 then
  total = math.min(tonumber(ARGV[4]), total + st)
  redis.call('HSET', KEYS[2], 'st', total)
end
if ARGV[9] ~= '' then
  local id, slot, u, now = ARGV[9], ARGV[10], tonumber(ARGV[11]), tonumber(ARGV[12])
  local cur = redis.call('HGET', KEYS[5], slot)
  local ci, cu = nil, 0
  if cur then
    local a, b = string.match(cur, '^([^|]+)|(.+)$')
    ci, cu = a, tonumber(b) or 0
  end
  if ci == id and cu > now then
    if u > cu then redis.call('HSET', KEYS[5], slot, id .. '|' .. u) end
  else
    local had = tonumber(redis.call('HGET', KEYS[6], id) or '0')
    if u > had then redis.call('HSET', KEYS[6], id, u) end
  end
end
if tonumber(ARGV[13]) > 0 then redis.call('HSET', KEYS[7], 'urgKing', ARGV[13]) end
if tonumber(ARGV[14]) > 0 then redis.call('HSET', KEYS[7], 'urgLast', ARGV[14]) end
return {'ok', total, fish}
`;

function hashOf(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  else if (flat && typeof flat === "object") for (const [k, v] of Object.entries(flat)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
}

export class RedisUrgentStore implements UrgentStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async state(id: string) {
    return stateOf(hashOf(await this.redis.hgetall(uk.ev(id))));
  }
  async setGoal(id: string, goal: number) {
    const [, , g] = (await this.redis.pipeline().hsetnx(uk.ev(id), "goal", String(goal)).expire(uk.ev(id), URGENT_TTL_SEC).hget(uk.ev(id), "goal").exec()) as unknown[];
    return Number(g) || goal;
  }
  async mark(id: string, field: NoticeField) {
    return Number(await this.redis.hsetnx(uk.ev(id), field, "1")) === 1;
  }
  async deliver(id: string, acct: string, name: string, items: Record<string, number>, a: DeliverArgs): Promise<UrgentDeliverResult> {
    const pairs = Object.entries(items)
      .filter(([, n]) => n > 0)
      .flatMap(([sp, n]) => [sp, String(n)]);
    const r = (await this.redis.eval<string[], unknown[]>(
      URGENT_DELIVER_LUA,
      [uk.ev(id), uk.by(id), uk.nm(id), lk.bag(acct)],
      [acct, name, String(a.goal), String(a.now), String(a.frac), String(a.lastFrom), String(URGENT_TTL_SEC), ...pairs],
    )) as unknown[];
    if (String(r?.[0]) !== "ok") return { status: "bag" };
    return { status: "ok", n: num(r[1]), mine: num(r[2]), fest: num(r[3]) };
  }
  async top(id: string, k: number) {
    const z = ((await this.redis.zrange(uk.by(id), 0, k - 1, { rev: true, withScores: true })) as unknown[]) ?? [];
    const rows: { acct: string; n: number }[] = [];
    for (let i = 0; i + 1 < z.length; i += 2) rows.push({ acct: String(z[i]), n: countOf(Number(z[i + 1]) || 0) });
    if (!rows.length) return [];
    const names = ((await this.redis.hmget(uk.nm(id), ...rows.map((r) => r.acct))) as unknown) ?? [];
    const list = Array.isArray(names) ? names : rows.map((r) => (names as Record<string, unknown>)[r.acct]);
    return rows.map((r, i) => ({ ...r, name: list[i] == null ? "" : String(list[i]) }));
  }
  async mine(ids: readonly string[], acct: string) {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) p.zscore(uk.by(id), acct).hget(uk.got(id), acct);
    const r = (await p.exec()) as unknown[];
    return ids.map((id, i) => ({ id, n: countOf(Number(r[i * 2]) || 0), got: r[i * 2 + 1] == null ? null : String(r[i * 2 + 1]) }));
  }
  async claim(id: string, acct: string, p: ClaimPlan): Promise<ClaimResult> {
    const r = (await this.redis.eval<string[], unknown[]>(
      URGENT_CLAIM_LUA,
      [uk.got(id), questKey(acct), K.inv(acct), lk.bag(acct), K.look(acct), K.stash(acct), titleStatsKey(acct), K.acct(acct)],
      [
        acct,
        p.record,
        String(p.stamps),
        String(p.stampCap),
        p.dye,
        p.fish,
        String(p.fishFallback),
        String(p.stackMax),
        p.hat?.id ?? "",
        p.hat?.slot ?? "",
        String(p.hat?.until ?? 0),
        String(p.now),
        String(p.kingUntil),
        String(p.lastUntil),
        String(URGENT_TTL_SEC),
      ],
    )) as unknown[];
    const s = String(r?.[0]);
    if (s === "ok") return { status: "ok", stamps: num(r[1]), fish: num(r[2]) === 1 };
    return { status: s === "noacct" ? "noacct" : "dup" };
  }
  async testGet() {
    const raw = await this.redis.get<string>(uk.test);
    if (!raw) return null;
    try {
      return JSON.parse(String(raw)) as UrgentTest;
    } catch {
      return null;
    }
  }
  async testSet(t: UrgentTest | null) {
    if (t) await this.redis.set(uk.test, JSON.stringify(t), { ex: URGENT_TTL_SEC });
    else await this.redis.del(uk.test);
  }
  async testAdd(id: string, n: number) {
    const [v] = (await this.redis.pipeline().hincrby(uk.ev(id), "n", n).expire(uk.ev(id), URGENT_TTL_SEC).exec()) as unknown[];
    return num(v);
  }
  async testFest(id: string, now: number) {
    await this.redis.hsetnx(uk.ev(id), "fest", String(now));
  }
}

const g = globalThis as typeof globalThis & { __tombUrgent?: UrgentStore };

/** 메모리 구현의 다른 저장소 연결 (lib/forage/quests/urgentService가 넘긴다 — 순환 import를 피하려고) */
export function getUrgentStore(memDeps: () => UrgentMemDeps): UrgentStore {
  const cur = g.__tombUrgent;
  const conn = env.redis();
  if (conn) return cur instanceof RedisUrgentStore ? cur : (g.__tombUrgent = new RedisUrgentStore(conn));
  if (env.isProd()) throw new Error("[urgent] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryUrgentStore) {
    (cur as unknown as { deps: () => UrgentMemDeps }).deps = memDeps;
    return cur;
  }
  const mem = new MemoryUrgentStore(memDeps);
  if (cur) Object.assign(mem, cur, { deps: memDeps });
  return (g.__tombUrgent = mem);
}
