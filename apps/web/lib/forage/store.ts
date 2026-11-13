import { Redis } from "@upstash/redis";
import { env } from "../env";
import type { DexEntry, LifeDay } from "./types";

// 낚시·채집 저장소. 가방·도감·진행 중 기록은 모두 계정마다 따로이고, 바뀌는 연산은 하나씩 원자적이다
// (Redis는 Lua 한 번, 메모리는 await 없는 구간). 로컬은 같은 규칙의 메모리 구현을 쓴다. store.test.ts가 두 구현에 같은 계약을 돌린다.
//
// Redis 키 (모두 forage:{accountId}:*)
//  - forage:{a}:bag         HASH  종류 id → 개수 (0이 되면 지운다)
//  - forage:{a}:dex         HASH  n:{id} 잡은 수 · max:{id} 가장 큰 크기(cm×10) · first:{id} 처음 잡은 날(YYYYMMDD)
//  - forage:{a}:claims      HASH  `${cat}:${tier}` → 받은 날 (도감 보상은 한 번만)
//  - forage:{a}:active      STRING `${nonce}|${JSON}` 진행 중인 낚시·채집 (새로 시작하면 바뀐다, TTL)
//  - forage:{a}:used:{n}    STRING 끝낸 티켓 표시 (SET NX, 1일) → 같은 티켓을 두 번 낼 수 없다
//  - forage:{a}:hour:{h}    STRING 이번 한 시간 동안 시작한 수 (INCR, 1시간)
//  - forage:{a}:day:{KST}   HASH  fishP/gatherP/dexP(판 포인트) · fish/gather(잡은 수) (2일)
//  - forage:{a}:took:{w}    SET   이 창(15분)에 캔 채집 지점 id (2시간)
//  - forage:{a}:auto        STRING 자동 낚시 세션 JSON (lib/forage/auto.ts, 바꿀 때는 이전 값과 같을 때만 = 비교 후 교체)

export type ClaimResult = { status: "ok"; payload: string } | { status: "reused" | "stale" };
export type GrantItem = { id: string; size: number };
export type Granted = { id: string; size: number; kept: boolean; isNew: boolean; record: boolean };
export type Snapshot = {
  bag: Record<string, number>;
  dex: Record<string, DexEntry>;
  claims: Record<string, string>;
  day: LifeDay;
  taken: string[];
};
export type DayField = keyof LifeDay;

const USED_TTL_SEC = 86_400;
const DAY_TTL_SEC = 2 * 86_400;
const TOOK_TTL_SEC = 2 * 3_600;
/** 자동 낚시 세션 보관 (켜 둔 채 떠나도 다음 날 돌아와 정산할 수 있게) */
export const AUTO_TTL_SEC = 2 * 86_400;

export interface ForageStore {
  /** 가방·도감·보상·오늘 기록·이번 창에 캔 지점 */
  snapshot(acct: string, day: string, window: number): Promise<Snapshot>;
  /** 남의 도감 구경용 (가방·오늘 기록 없이) */
  dex(acct: string): Promise<{ dex: Record<string, DexEntry>; claims: Record<string, string> }>;
  /** 시간당 시작 수를 세고(한도면 false) 진행 기록을 남긴다 (이전 진행은 버려진다) */
  begin(acct: string, nonce: string, payload: string, ttlSec: number, hour: string, perHour: number): Promise<boolean>;
  /** 끝내기: 처음 내는 티켓이고 지금 진행 중인 기록이어야 ok (기록을 지우고 돌려준다) */
  claim(acct: string, nonce: string): Promise<ClaimResult>;
  /**
   * 잡은 것 넣기 (원자적): take가 있으면 먼저 그 창의 지점을 캔 것으로 표시하고(이미 캤으면 아무것도 하지 않고 null),
   * 오늘 잡은 수(count 칸)를 items 수만큼 올리고, 가방(한 칸 stackMax까지)과 도감(수·최대 크기·처음 날)을 바꾼다
   */
  grant(
    acct: string,
    day: string,
    count: "fish" | "gather",
    items: GrantItem[],
    stackMax: number,
    take?: { window: number; node: string },
  ): Promise<Granted[] | null>;
  /** 가방에서 꺼내기 (전부 있을 때만, 한 번에). 모자라면 false */
  remove(acct: string, items: Record<string, number>): Promise<boolean>;
  /** 가방에 되돌리기 (한 칸 stackMax까지) */
  restore(acct: string, items: Record<string, number>, stackMax: number): Promise<void>;
  addDay(acct: string, day: string, field: DayField, n: number): Promise<void>;
  /** 도감 보상 받음 표시 (한 번만 true) */
  claimDex(acct: string, key: string, day: string): Promise<boolean>;
  /** 자동 낚시 세션 (없으면 null) */
  autoGet(acct: string): Promise<string | null>;
  /** 비교 후 교체 (원자적): 지금 값이 expected(null = 없음)와 같을 때만 next(null = 지움)로 바꾸고 true */
  autoSwap(acct: string, expected: string | null, next: string | null): Promise<boolean>;
  /**
   * 자동 낚시로 낚은 것 넣기 (원자적): 오늘 자동 한도(autoCap − 오늘 auto)와 하루 전체 낚시 한도(fishCap − 오늘 fish) 중
   * 남은 만큼만 앞에서부터 넣고 fish·auto를 그만큼 올린다. 도감은 수·처음 날만 (최대 크기 기록은 직접 낚은 것만).
   * id가 "@"로 시작하면(물에 빠진 꾸미기 자리) 한도만 세고 가방·도감은 건드리지 않는다
   */
  grantAuto(acct: string, day: string, items: GrantItem[], stackMax: number, autoCap: number, fishCap: number): Promise<Granted[]>;
}

export const lk = {
  bag: (a: string) => `forage:${a}:bag`,
  dex: (a: string) => `forage:${a}:dex`,
  claims: (a: string) => `forage:${a}:claims`,
  active: (a: string) => `forage:${a}:active`,
  used: (a: string, n: string) => `forage:${a}:used:${n}`,
  hour: (a: string, h: string) => `forage:${a}:hour:${h}`,
  day: (a: string, d: string) => `forage:${a}:day:${d}`,
  took: (a: string, w: number) => `forage:${a}:took:${w}`,
  auto: (a: string) => `forage:${a}:auto`,
};

const emptyDay = (): LifeDay => ({ fishP: 0, gatherP: 0, dexP: 0, fish: 0, gather: 0, auto: 0 });

/** dex 해시(n:/max:/first: 필드) → 칸별 기록 */
export function dexFromHash(h: Record<string, string>): Record<string, DexEntry> {
  const out: Record<string, DexEntry> = {};
  for (const [k, v] of Object.entries(h)) {
    const i = k.indexOf(":");
    if (i <= 0) continue;
    const f = k.slice(0, i);
    const id = k.slice(i + 1);
    const e = (out[id] ??= { n: 0, max: 0, first: "" });
    if (f === "n") e.n = Number(v) || 0;
    else if (f === "max") e.max = Number(v) || 0;
    else if (f === "first") e.first = v;
  }
  for (const [id, e] of Object.entries(out)) if (e.n <= 0) delete out[id];
  return out;
}

function dayFromHash(h: Record<string, string>): LifeDay {
  const d = emptyDay();
  for (const k of Object.keys(d) as DayField[]) d[k] = Number(h[k] ?? 0) || 0;
  return d;
}

// ── 메모리 (로컬·테스트). await 없이 끝나는 구간이라 이벤트 루프 안에서 원자적이다 ──

type Acct = {
  bag: Map<string, number>;
  dex: Map<string, string>;
  claims: Map<string, string>;
  active: { value: string; until: number } | null;
};

export class MemoryForageStore implements ForageStore {
  private accts = new Map<string, Acct>();
  private used = new Map<string, number>();
  private hours = new Map<string, number>();
  private days = new Map<string, LifeDay>();
  private took = new Map<string, Set<string>>();
  private autos = new Map<string, string>();

  private acct(a: string): Acct {
    let x = this.accts.get(a);
    if (!x) this.accts.set(a, (x = { bag: new Map(), dex: new Map(), claims: new Map(), active: null }));
    return x;
  }

  async snapshot(acct: string, day: string, window: number) {
    const a = this.acct(acct);
    return {
      bag: Object.fromEntries([...a.bag].filter(([, n]) => n > 0)),
      dex: dexFromHash(Object.fromEntries(a.dex)),
      claims: Object.fromEntries(a.claims),
      day: { ...(this.days.get(lk.day(acct, day)) ?? emptyDay()) },
      taken: [...(this.took.get(lk.took(acct, window)) ?? [])],
    };
  }

  async dex(acct: string) {
    const a = this.acct(acct);
    return { dex: dexFromHash(Object.fromEntries(a.dex)), claims: Object.fromEntries(a.claims) };
  }

  async begin(acct: string, nonce: string, payload: string, ttlSec: number, hour: string, perHour: number) {
    const k = lk.hour(acct, hour);
    const n = (this.hours.get(k) ?? 0) + 1;
    this.hours.set(k, n);
    if (n > perHour) return false;
    this.acct(acct).active = { value: `${nonce}|${payload}`, until: Date.now() + ttlSec * 1000 };
    return true;
  }

  async claim(acct: string, nonce: string): Promise<ClaimResult> {
    const k = lk.used(acct, nonce);
    if (this.used.has(k)) return { status: "reused" };
    this.used.set(k, Date.now());
    const a = this.acct(acct);
    const v = a.active;
    if (!v || v.until < Date.now() || !v.value.startsWith(`${nonce}|`)) return { status: "stale" };
    a.active = null;
    return { status: "ok", payload: v.value.slice(nonce.length + 1) };
  }

  async grant(acct: string, day: string, count: "fish" | "gather", items: GrantItem[], stackMax: number, take?: { window: number; node: string }) {
    if (take) {
      const k = lk.took(acct, take.window);
      let s = this.took.get(k);
      if (!s) this.took.set(k, (s = new Set()));
      if (s.has(take.node)) return null;
      s.add(take.node);
    }
    const dk = lk.day(acct, day);
    const d = this.days.get(dk) ?? emptyDay();
    d[count] += items.length;
    this.days.set(dk, d);
    const a = this.acct(acct);
    return items.map(({ id, size }) => {
      const have = a.bag.get(id) ?? 0;
      const kept = have < stackMax;
      if (kept) a.bag.set(id, have + 1);
      const n = Number(a.dex.get(`n:${id}`) ?? 0) + 1;
      a.dex.set(`n:${id}`, String(n));
      const isNew = n === 1;
      if (isNew) a.dex.set(`first:${id}`, day);
      let record = false;
      if (size > 0) {
        const old = Number(a.dex.get(`max:${id}`) ?? 0);
        if (size > old) {
          a.dex.set(`max:${id}`, String(size));
          record = old > 0;
        }
      }
      return { id, size, kept, isNew, record };
    });
  }

  async remove(acct: string, items: Record<string, number>) {
    const a = this.acct(acct);
    for (const [id, n] of Object.entries(items)) if ((a.bag.get(id) ?? 0) < n) return false;
    for (const [id, n] of Object.entries(items)) {
      const left = (a.bag.get(id) ?? 0) - n;
      if (left > 0) a.bag.set(id, left);
      else a.bag.delete(id);
    }
    return true;
  }

  async restore(acct: string, items: Record<string, number>, stackMax: number) {
    const a = this.acct(acct);
    for (const [id, n] of Object.entries(items)) {
      const have = a.bag.get(id) ?? 0;
      const add = Math.min(n, stackMax - have);
      if (add > 0) a.bag.set(id, have + add);
    }
  }

  async addDay(acct: string, day: string, field: DayField, n: number) {
    const dk = lk.day(acct, day);
    const d = this.days.get(dk) ?? emptyDay();
    d[field] += n;
    this.days.set(dk, d);
  }

  async claimDex(acct: string, key: string, day: string) {
    const a = this.acct(acct);
    if (a.claims.has(key)) return false;
    a.claims.set(key, day);
    return true;
  }

  async autoGet(acct: string) {
    return this.autos.get(acct) ?? null;
  }

  async autoSwap(acct: string, expected: string | null, next: string | null) {
    if ((this.autos.get(acct) ?? null) !== expected) return false;
    if (next === null) this.autos.delete(acct);
    else this.autos.set(acct, next);
    return true;
  }

  async grantAuto(acct: string, day: string, items: GrantItem[], stackMax: number, autoCap: number, fishCap: number) {
    const dk = lk.day(acct, day);
    const d = this.days.get(dk) ?? emptyDay();
    const room = Math.max(0, Math.min(autoCap - d.auto, fishCap - d.fish));
    const take = items.slice(0, room);
    d.fish += take.length;
    d.auto += take.length;
    this.days.set(dk, d);
    const a = this.acct(acct);
    return take.map(({ id, size }) => {
      if (id.startsWith("@")) return { id, size, kept: false, isNew: false, record: false };
      const have = a.bag.get(id) ?? 0;
      const kept = have < stackMax;
      if (kept) a.bag.set(id, have + 1);
      const n = Number(a.dex.get(`n:${id}`) ?? 0) + 1;
      a.dex.set(`n:${id}`, String(n));
      if (n === 1) a.dex.set(`first:${id}`, day);
      return { id, size, kept, isNew: n === 1, record: false };
    });
  }
}

// ── Redis (운영) ──

/** automaticDeserialization을 끈 클라이언트의 HGETALL은 [필드, 값, ...] 배열이다 (객체로 오는 경우도 받는다) */
function hashOf(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  else if (flat && typeof flat === "object") for (const [k, v] of Object.entries(flat)) out[k] = String(v);
  return out;
}

// KEYS: hour, active  ARGV: nonce|payload, ttl, perHour
export const BEGIN_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
if n > tonumber(ARGV[3]) then return 0 end
redis.call('SET', KEYS[2], ARGV[1], 'EX', tonumber(ARGV[2]))
return 1
`;

// KEYS: used, active  ARGV: nonce, usedTtl
// 진행 기록 값은 "nonce|payload" — 접두어로 같은 판인지 본다 (cjson 없이)
export const CLAIM_LUA = `
if not redis.call('SET', KEYS[1], '1', 'NX', 'EX', tonumber(ARGV[2])) then return 'reused' end
local v = redis.call('GET', KEYS[2])
if not v then return 'stale' end
local p = ARGV[1] .. '|'
if string.sub(v, 1, string.len(p)) ~= p then return 'stale' end
redis.call('DEL', KEYS[2])
return v
`;

// KEYS: bag, dex, day, took  ARGV: day, countField, take('1'/'0'), node, tookTtl, dayTtl, stackMax, 개수, (id, size)...
// 돌려주는 값: 'taken' 또는 아이템마다 "id:{kept}{isNew}{record}" (각 0/1)
export const GRANT_LUA = `
if ARGV[3] == '1' then
  if redis.call('SADD', KEYS[4], ARGV[4]) == 0 then return 'taken' end
  redis.call('EXPIRE', KEYS[4], tonumber(ARGV[5]))
end
redis.call('HINCRBY', KEYS[3], ARGV[2], tonumber(ARGV[8]))
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[6]))
local stackMax = tonumber(ARGV[7])
local out = {}
for i = 9, #ARGV, 2 do
  local id = ARGV[i]
  local size = tonumber(ARGV[i + 1])
  local kept = '0'
  if tonumber(redis.call('HGET', KEYS[1], id) or '0') < stackMax then
    redis.call('HINCRBY', KEYS[1], id, 1)
    kept = '1'
  end
  local isNew = '0'
  if redis.call('HINCRBY', KEYS[2], 'n:' .. id, 1) == 1 then
    isNew = '1'
    redis.call('HSET', KEYS[2], 'first:' .. id, ARGV[1])
  end
  local rec = '0'
  if size > 0 then
    local old = tonumber(redis.call('HGET', KEYS[2], 'max:' .. id) or '0')
    if size > old then
      redis.call('HSET', KEYS[2], 'max:' .. id, ARGV[i + 1])
      if old > 0 then rec = '1' end
    end
  end
  out[#out + 1] = id .. ':' .. kept .. isNew .. rec
end
return out
`;

// KEYS: bag  ARGV: (id, n)...  전부 있을 때만 한 번에 뺀다 (0이 되면 칸을 지운다)
export const REMOVE_LUA = `
for i = 1, #ARGV, 2 do
  if tonumber(redis.call('HGET', KEYS[1], ARGV[i]) or '0') < tonumber(ARGV[i + 1]) then return 0 end
end
for i = 1, #ARGV, 2 do
  if redis.call('HINCRBY', KEYS[1], ARGV[i], -tonumber(ARGV[i + 1])) <= 0 then redis.call('HDEL', KEYS[1], ARGV[i]) end
end
return 1
`;

// KEYS: bag  ARGV: stackMax, (id, n)...  한 칸 stackMax까지만 되돌린다
export const RESTORE_LUA = `
local stackMax = tonumber(ARGV[1])
for i = 2, #ARGV, 2 do
  local have = tonumber(redis.call('HGET', KEYS[1], ARGV[i]) or '0')
  local add = math.min(tonumber(ARGV[i + 1]), stackMax - have)
  if add > 0 then redis.call('HINCRBY', KEYS[1], ARGV[i], add) end
end
return 1
`;

// KEYS: auto  ARGV: expected('' = 없음), next('' = 지움), ttl
export const AUTO_SWAP_LUA = `
local cur = redis.call('GET', KEYS[1])
if ARGV[1] == '' then
  if cur then return 0 end
elseif cur ~= ARGV[1] then
  return 0
end
if ARGV[2] == '' then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3])) end
return 1
`;

// KEYS: bag, dex, day  ARGV: day, stackMax, autoCap, fishCap, dayTtl, (id, size)...
// 남은 한도만큼만 앞에서부터. 돌려주는 값: 넣은 아이템마다 "id:{kept}{isNew}0" (최대 크기는 기록하지 않는다).
// "@"로 시작하는 id(물에 빠진 꾸미기 자리)는 한도만 센다 → "id:000"
export const GRANT_AUTO_LUA = `
local auto = tonumber(redis.call('HGET', KEYS[3], 'auto') or '0')
local fish = tonumber(redis.call('HGET', KEYS[3], 'fish') or '0')
local room = math.min(tonumber(ARGV[3]) - auto, tonumber(ARGV[4]) - fish, (#ARGV - 5) / 2)
local out = {}
if room <= 0 then return out end
redis.call('HINCRBY', KEYS[3], 'fish', room)
redis.call('HINCRBY', KEYS[3], 'auto', room)
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[5]))
local stackMax = tonumber(ARGV[2])
for j = 0, room - 1 do
  local id = ARGV[6 + j * 2]
  local kept = '0'
  local isNew = '0'
  if string.sub(id, 1, 1) ~= '@' then
    if tonumber(redis.call('HGET', KEYS[1], id) or '0') < stackMax then
      redis.call('HINCRBY', KEYS[1], id, 1)
      kept = '1'
    end
    if redis.call('HINCRBY', KEYS[2], 'n:' .. id, 1) == 1 then
      isNew = '1'
      redis.call('HSET', KEYS[2], 'first:' .. id, ARGV[1])
    end
  end
  out[#out + 1] = id .. ':' .. kept .. isNew .. '0'
end
return out
`;

/** GRANT_LUA 결과 한 줄 → 기록 (크기는 넘긴 값) */
export function parseGranted(lines: unknown, items: GrantItem[]): Granted[] | null {
  if (lines === "taken" || !Array.isArray(lines)) return null;
  return items.map((it, i) => {
    const s = String(lines[i] ?? "");
    const f = s.slice(s.lastIndexOf(":") + 1);
    return { id: it.id, size: it.size, kept: f[0] === "1", isNew: f[1] === "1", record: f[2] === "1" };
  });
}

export class RedisForageStore implements ForageStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async snapshot(acct: string, day: string, window: number) {
    const p = this.redis.pipeline();
    p.hgetall(lk.bag(acct));
    p.hgetall(lk.dex(acct));
    p.hgetall(lk.claims(acct));
    p.hgetall(lk.day(acct, day));
    p.smembers(lk.took(acct, window));
    const [bag, dex, claims, d, took] = await p.exec<[unknown, unknown, unknown, unknown, unknown]>();
    const bagH = hashOf(bag);
    return {
      bag: Object.fromEntries(Object.entries(bagH).map(([k, v]) => [k, Number(v) || 0]).filter(([, n]) => (n as number) > 0)),
      dex: dexFromHash(hashOf(dex)),
      claims: hashOf(claims),
      day: dayFromHash(hashOf(d)),
      taken: Array.isArray(took) ? took.map(String) : [],
    };
  }

  async dex(acct: string) {
    const [dex, claims] = await Promise.all([this.redis.hgetall(lk.dex(acct)), this.redis.hgetall(lk.claims(acct))]);
    return { dex: dexFromHash(hashOf(dex)), claims: hashOf(claims) };
  }

  async begin(acct: string, nonce: string, payload: string, ttlSec: number, hour: string, perHour: number) {
    const r = await this.redis.eval<string[], number>(BEGIN_LUA, [lk.hour(acct, hour), lk.active(acct)], [`${nonce}|${payload}`, String(ttlSec), String(perHour)]);
    return Number(r) === 1;
  }

  async claim(acct: string, nonce: string): Promise<ClaimResult> {
    const r = String(await this.redis.eval<string[], string>(CLAIM_LUA, [lk.used(acct, nonce), lk.active(acct)], [nonce, String(USED_TTL_SEC)]));
    if (r === "reused" || r === "stale") return { status: r };
    return { status: "ok", payload: r.slice(nonce.length + 1) };
  }

  async grant(acct: string, day: string, count: "fish" | "gather", items: GrantItem[], stackMax: number, take?: { window: number; node: string }) {
    const argv = [day, count, take ? "1" : "0", take?.node ?? "", String(TOOK_TTL_SEC), String(DAY_TTL_SEC), String(stackMax), String(items.length)];
    for (const it of items) argv.push(it.id, String(Math.max(0, Math.round(it.size))));
    const r = await this.redis.eval<string[], unknown>(
      GRANT_LUA,
      [lk.bag(acct), lk.dex(acct), lk.day(acct, day), lk.took(acct, take?.window ?? 0)],
      argv,
    );
    return parseGranted(r, items);
  }

  async remove(acct: string, items: Record<string, number>) {
    const argv = Object.entries(items).flatMap(([id, n]) => [id, String(n)]);
    if (!argv.length) return true;
    return Number(await this.redis.eval<string[], number>(REMOVE_LUA, [lk.bag(acct)], argv)) === 1;
  }

  async restore(acct: string, items: Record<string, number>, stackMax: number) {
    const pairs = Object.entries(items).flatMap(([id, n]) => [id, String(n)]);
    if (!pairs.length) return;
    await this.redis.eval<string[], number>(RESTORE_LUA, [lk.bag(acct)], [String(stackMax), ...pairs]);
  }

  async addDay(acct: string, day: string, field: DayField, n: number) {
    if (!n) return;
    const k = lk.day(acct, day);
    const p = this.redis.pipeline();
    p.hincrby(k, field, n);
    p.expire(k, DAY_TTL_SEC);
    await p.exec();
  }

  async claimDex(acct: string, key: string, day: string) {
    return Number(await this.redis.hsetnx(lk.claims(acct), key, day)) === 1;
  }

  async autoGet(acct: string) {
    const v = await this.redis.get<string>(lk.auto(acct));
    return v == null ? null : String(v);
  }

  async autoSwap(acct: string, expected: string | null, next: string | null) {
    const r = await this.redis.eval<string[], number>(AUTO_SWAP_LUA, [lk.auto(acct)], [expected ?? "", next ?? "", String(AUTO_TTL_SEC)]);
    return Number(r) === 1;
  }

  async grantAuto(acct: string, day: string, items: GrantItem[], stackMax: number, autoCap: number, fishCap: number) {
    if (!items.length) return [];
    const argv = [day, String(stackMax), String(autoCap), String(fishCap), String(DAY_TTL_SEC)];
    for (const it of items) argv.push(it.id, String(Math.max(0, Math.round(it.size))));
    const r = await this.redis.eval<string[], unknown>(GRANT_AUTO_LUA, [lk.bag(acct), lk.dex(acct), lk.day(acct, day)], argv);
    if (!Array.isArray(r)) return [];
    return parseGranted(r, items.slice(0, r.length)) ?? [];
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 남게 globalThis에 둔다 (lib/store와 같은 방식)
const g = globalThis as typeof globalThis & { __tombForage?: ForageStore };

export function getForageStore(): ForageStore {
  const cur = g.__tombForage;
  const conn = env.redis();
  if (conn) return cur instanceof RedisForageStore ? cur : (g.__tombForage = new RedisForageStore(conn));
  if (env.isProd()) throw new Error("[forage] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryForageStore) return cur;
  g.__tombForage = cur ? Object.assign(new MemoryForageStore(), cur) : new MemoryForageStore();
  return g.__tombForage;
}
