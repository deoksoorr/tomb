import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";
import { normalize, RpgError } from "./character";
import { getAccounts } from "../store";
import { econKeyFor, kstDay } from "../store/accounts";
import { K } from "../store/keys";
import { ECON_TTL_SEC, spendCategory } from "../store/types";
import type { CharacterState, DailyStats } from "./types";

// 사냥터 저장소. 캐릭터는 계정마다 JSON 한 덩어리이고, 모든 변경은 "읽기 → 순수 함수 → 버전 비교 후 쓰기(Lua)"로
// 원자적이다 (두 탭에서 동시에 사고팔아도 한쪽이 다시 계산된다). 로컬은 같은 규칙의 메모리 구현을 쓴다.
//
// Redis 키 (모두 rpg:{accountId}:*)
//  - rpg:{a}:char        HASH  rev → 버전, data → CharacterState JSON
//  - rpg:{a}:active      STRING 지금 진행 중인 판의 nonce (시간 제한 + 여유 뒤 만료). 새 판을 시작하면 바뀐다
//  - rpg:{a}:used:{n}    STRING 끝낸 판 표시 (SET NX, 2일) → 같은 티켓을 두 번 낼 수 없다
//  - rpg:{a}:starts      ZSET  판 시작 시각들 (nonce → 시각 ms). 11/18 최근 60분 안에 시작한 판 수 (정시 버킷이던 rpg:{a}:runs:{시}는 정시 앞뒤로 몰아 할 수 있었다)
//  - rpg:{a}:day:{게임 날짜}   HASH  points/runs/exp 오늘 사냥 기록 (2일)
//  - rpg:endgame:launch  STRING 11/15 끝판이 이 서버(운영·테스트 따로)에서 처음 열린 시각 ms (SET NX, 한 번만). 개척자 모집 14일의 시작
//  - rpg:pioneer         HASH  계정 id → "번호|받은 시각 ms" (개척자, 한 번 받으면 그대로)
//  - rpg:pioneer:n       STRING 개척자 번호 (INCR)

export const RUNS_PER_HOUR = 30;
/** 11/18 판 수를 세는 창 (최근 60분) */
export const RUN_WINDOW_MS = 3_600_000;
const USED_TTL_SEC = 2 * 86_400;
const DAY_TTL_SEC = 2 * 86_400;
const CAS_RETRIES = 6;

export type ClaimResult = "ok" | "reused" | "stale";

export interface RpgStore {
  get(acct: string): Promise<CharacterState>;
  /** fn을 최신 상태에 적용해 원자적으로 저장한다. fn이 던지면 저장하지 않는다 */
  update<T>(acct: string, fn: (s: CharacterState) => { state: CharacterState; result: T }): Promise<{ state: CharacterState; result: T }>;
  /**
   * 11/15 포인트를 같이 쓰는 갱신 (강화·옵션 굴리기): fn이 정한 cost만큼 지갑 포인트를 빼고 캐릭터를 쓰는 것을 저장소 명령 한 번에.
   * 지갑에서만 뺀다 (모은 포인트·포인트 랭킹은 그대로 — spendPoints와 같다). 포인트가 모자라면 아무것도 바꾸지 않고 409
   */
  updatePaid<T>(
    acct: string,
    fn: (s: CharacterState) => { state: CharacterState; result: T; cost: number },
    reason: string,
    now?: number,
  ): Promise<{ state: CharacterState; result: T }>;
  /** 최근 60분 판 수 한도를 세고 진행 중인 판으로 기록한다 (11/18 이동 창). 한도면 false */
  startRun(acct: string, nonce: string, ttlSec: number, now: number): Promise<boolean>;
  /** 끝내기: 처음 내는 티켓이고 지금 진행 중인 판이어야 ok */
  claimRun(acct: string, nonce: string): Promise<ClaimResult>;
  /** 11/18 지금 진행 중인 판의 nonce (없으면 null) — 드롭 시드 알려 주기(reveal)가 진행 중인 판에만 */
  activeRun(acct: string): Promise<string | null>;
  addDaily(acct: string, day: string, d: Partial<DailyStats>): Promise<DailyStats>;
  daily(acct: string, day: string): Promise<DailyStats>;
  /** 최근 60분 안에 시작한 판 수 */
  runsThisHour(acct: string, now: number): Promise<number>;
  /** 저장된 캐릭터를 커서로 훑는다 (next "0" = 끝). 랭킹 기존 기록 채우기용 (lib/huntLevelRank) */
  scanChars(cursor: string, count: number): Promise<{ next: string; chars: [string, CharacterState][] }>;
  /** 11/15 끝판이 처음 열린 시각: 없으면 now로 적고(SET NX) 저장된 값을 돌려준다 */
  endgameLaunch(now: number): Promise<number>;
  /** 11/15 개척자 번호 받기: 이미 받았으면 그 번호·시각, 아니면 다음 번호를 붙인다 (한 계정에 한 번 — 원자적) */
  claimPioneer(acct: string, now: number): Promise<{ n: number; at: number }>;
}

export const rk = {
  char: (a: string) => `rpg:${a}:char`,
  active: (a: string) => `rpg:${a}:active`,
  used: (a: string, n: string) => `rpg:${a}:used:${n}`,
  starts: (a: string) => `rpg:${a}:starts`,
  day: (a: string, day: string) => `rpg:${a}:day:${day}`,
  launch: "rpg:endgame:launch",
  pioneer: "rpg:pioneer",
  pioneerN: "rpg:pioneer:n",
};

const conflict = () => new RpgError(409, "BUSY", "다른 곳에서 같은 캐릭터를 바꾸는 중이에요. 다시 시도해 주세요.");
const noPoints = () => new RpgError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");

// ── 메모리 (로컬·테스트). await 없이 끝나는 구간이라 이벤트 루프 안에서 원자적이다 ──

export class MemoryRpgStore implements RpgStore {
  private chars = new Map<string, CharacterState>();
  private active = new Map<string, { nonce: string; until: number }>();
  private used = new Set<string>();
  private starts = new Map<string, number[]>();
  private days = new Map<string, DailyStats>();
  private launch: number | null = null;
  private pioneers = new Map<string, { n: number; at: number }>();

  async get(acct: string): Promise<CharacterState> {
    return structuredClone(this.chars.get(acct) ?? normalize(null));
  }

  async update<T>(acct: string, fn: (s: CharacterState) => { state: CharacterState; result: T }) {
    const out = fn(structuredClone(this.chars.get(acct) ?? normalize(null)));
    this.chars.set(acct, structuredClone(out.state));
    return out;
  }

  async updatePaid<T>(acct: string, fn: (s: CharacterState) => { state: CharacterState; result: T; cost: number }, reason: string, now = Date.now()) {
    const out = fn(structuredClone(this.chars.get(acct) ?? normalize(null)));
    // 메모리 계정 저장소의 쓰기는 기다릴 일이 없어 이 사이에 다른 갱신이 끼지 않는다
    if (out.cost > 0 && (await getAccounts().spend(acct, out.cost, reason, now)) === null) throw noPoints();
    this.chars.set(acct, structuredClone(out.state));
    return { state: out.state, result: out.result };
  }
  async startRun(acct: string, nonce: string, ttlSec: number, now: number): Promise<boolean> {
    const live = (this.starts.get(acct) ?? []).filter((t) => t > now - RUN_WINDOW_MS);
    if (live.length >= RUNS_PER_HOUR) {
      this.starts.set(acct, live);
      return false;
    }
    this.starts.set(acct, [...live, now]);
    this.active.set(acct, { nonce, until: Date.now() + ttlSec * 1000 });
    return true;
  }

  async claimRun(acct: string, nonce: string): Promise<ClaimResult> {
    const k = rk.used(acct, nonce);
    if (this.used.has(k)) return "reused";
    this.used.add(k);
    const a = this.active.get(acct);
    if (!a || a.nonce !== nonce || a.until < Date.now()) return "stale";
    this.active.delete(acct);
    return "ok";
  }

  async activeRun(acct: string): Promise<string | null> {
    const a = this.active.get(acct);
    return a && a.until >= Date.now() ? a.nonce : null;
  }

  async addDaily(acct: string, day: string, d: Partial<DailyStats>): Promise<DailyStats> {
    const k = rk.day(acct, day);
    const cur = this.days.get(k) ?? { points: 0, runs: 0, exp: 0 };
    const next = { points: cur.points + (d.points ?? 0), runs: cur.runs + (d.runs ?? 0), exp: cur.exp + (d.exp ?? 0) };
    this.days.set(k, next);
    return next;
  }

  async daily(acct: string, day: string): Promise<DailyStats> {
    return { ...(this.days.get(rk.day(acct, day)) ?? { points: 0, runs: 0, exp: 0 }) };
  }

  async runsThisHour(acct: string, now: number): Promise<number> {
    return Math.min((this.starts.get(acct) ?? []).filter((t) => t > now - RUN_WINDOW_MS).length, RUNS_PER_HOUR);
  }

  async scanChars(cursor: string, count: number) {
    const all = [...this.chars];
    const start = Number(cursor) || 0;
    const end = start + Math.max(1, count);
    return { next: end >= all.length ? "0" : String(end), chars: all.slice(start, end).map(([a, s]) => [a, structuredClone(s)] as [string, CharacterState]) };
  }

  async endgameLaunch(now: number): Promise<number> {
    this.launch ??= now;
    return this.launch;
  }

  async claimPioneer(acct: string, now: number) {
    const had = this.pioneers.get(acct);
    if (had) return { ...had };
    const p = { n: this.pioneers.size + 1, at: now };
    this.pioneers.set(acct, p);
    return { ...p };
  }
}

// ── Redis (운영) ──

/** automaticDeserialization을 끈 클라이언트의 HGETALL은 [필드, 값, ...] 배열이다 */
function hashOf(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  return out;
}

// KEYS: char  ARGV: 기대 버전, 새 버전, JSON
const CAS_LUA = `
if (redis.call('HGET', KEYS[1], 'rev') or '0') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'rev', ARGV[2], 'data', ARGV[3])
return 1
`;

// 11/15 포인트 쓰기 + 캐릭터 쓰기 한 번에 (lib/store/accounts-redis SPEND_LUA와 같은 장부·통계). 버전이 다르면 -2, 포인트가 모자라면 -1
// KEYS: char, acct, ledger, econ  ARGV: 기대 버전, 새 버전, JSON, 포인트, 장부 JSON, 통계 필드
const PAID_LUA = `
if (redis.call('HGET', KEYS[1], 'rev') or '0') ~= ARGV[1] then return -2 end
local cost = tonumber(ARGV[4])
if cost > 0 then
  if tonumber(redis.call('HGET', KEYS[2], 'points') or '0') < cost then return -1 end
  redis.call('HINCRBY', KEYS[2], 'points', -cost)
  redis.call('LPUSH', KEYS[3], ARGV[5])
  redis.call('LTRIM', KEYS[3], 0, 99)
  redis.call('HINCRBY', KEYS[4], ARGV[6], cost)
  redis.call('EXPIRE', KEYS[4], ${ECON_TTL_SEC})
end
redis.call('HSET', KEYS[1], 'rev', ARGV[2], 'data', ARGV[3])
return 1
`;
// KEYS: starts(ZSET), active  ARGV: nonce, ttl, max, now — 최근 60분 밖은 지우고 세어 한도 안이면 이 판을 더한다 (11/18 이동 창)
const START_LUA = `
local now = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - ${RUN_WINDOW_MS})
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], now, ARGV[1])
redis.call('EXPIRE', KEYS[1], ${RUN_WINDOW_MS / 1000})
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return 1
`;

// KEYS: used, active  ARGV: nonce, usedTtl
const CLAIM_LUA = `
if not redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[2]) then return 'reused' end
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 'stale' end
redis.call('DEL', KEYS[2])
return 'ok'
`;

// KEYS: launch  ARGV: now — 처음이면 적고, 저장된 값
const LAUNCH_LUA = `
redis.call('SET', KEYS[1], ARGV[1], 'NX')
return redis.call('GET', KEYS[1])
`;

// KEYS: pioneer(HASH), pioneer:n  ARGV: acct, now — 이미 받았으면 그 값, 아니면 INCR로 번호를 붙여 적는다 ("번호|시각")
const PIONEER_LUA = `
local had = redis.call('HGET', KEYS[1], ARGV[1])
if had then return had end
local n = redis.call('INCR', KEYS[2])
local v = n .. '|' .. ARGV[2]
redis.call('HSET', KEYS[1], ARGV[1], v)
return v
`;

export class RedisRpgStore implements RpgStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "rpg/store");
  }

  private async read(acct: string): Promise<{ rev: string; state: CharacterState }> {
    const h = hashOf(await this.redis.hgetall(rk.char(acct)));
    return { rev: h.rev ?? "0", state: normalize(h.data ? JSON.parse(h.data) : null) };
  }

  async get(acct: string): Promise<CharacterState> {
    return (await this.read(acct)).state;
  }

  async update<T>(acct: string, fn: (s: CharacterState) => { state: CharacterState; result: T }) {
    for (let i = 0; i < CAS_RETRIES; i++) {
      const { rev, state } = await this.read(acct);
      const out = fn(state);
      const ok = await this.redis.eval<string[], number>(CAS_LUA, [rk.char(acct)], [rev, String(Number(rev) + 1), JSON.stringify(out.state)]);
      if (Number(ok) === 1) return out;
    }
    throw conflict();
  }

  async updatePaid<T>(acct: string, fn: (s: CharacterState) => { state: CharacterState; result: T; cost: number }, reason: string, now = Date.now()) {
    const econ = await econKeyFor(acct, kstDay(now));
    for (let i = 0; i < CAS_RETRIES; i++) {
      const { rev, state } = await this.read(acct);
      const out = fn(state);
      const r = Number(
        await this.redis.eval<string[], number>(
          PAID_LUA,
          [rk.char(acct), K.acct(acct), K.ledger(acct), econ],
          [rev, String(Number(rev) + 1), JSON.stringify(out.state), String(Math.max(0, out.cost)), JSON.stringify({ at: now, amount: -out.cost, reason }), `spend:${spendCategory(reason)}`],
        ),
      );
      if (r === 1) return { state: out.state, result: out.result };
      if (r === -1) throw noPoints();
    }
    throw conflict();
  }
  async startRun(acct: string, nonce: string, ttlSec: number, now: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(START_LUA, [rk.starts(acct), rk.active(acct)], [nonce, String(ttlSec), String(RUNS_PER_HOUR), String(Math.round(now))]);
    return Number(r) === 1;
  }

  async claimRun(acct: string, nonce: string): Promise<ClaimResult> {
    return (await this.redis.eval<string[], string>(CLAIM_LUA, [rk.used(acct, nonce), rk.active(acct)], [nonce, String(USED_TTL_SEC)])) as ClaimResult;
  }

  async activeRun(acct: string): Promise<string | null> {
    return (await this.redis.get<string>(rk.active(acct))) ?? null;
  }

  async addDaily(acct: string, day: string, d: Partial<DailyStats>): Promise<DailyStats> {
    const k = rk.day(acct, day);
    const p = this.redis.pipeline();
    for (const f of ["points", "runs", "exp"] as const) if (d[f]) p.hincrby(k, f, d[f]);
    p.expire(k, DAY_TTL_SEC);
    await p.exec();
    return this.daily(acct, day);
  }

  async daily(acct: string, day: string): Promise<DailyStats> {
    const h = hashOf(await this.redis.hgetall(rk.day(acct, day)));
    return { points: Number(h.points ?? 0), runs: Number(h.runs ?? 0), exp: Number(h.exp ?? 0) };
  }

  async runsThisHour(acct: string, now: number): Promise<number> {
    return Math.min(Number(await this.redis.zcount(rk.starts(acct), `(${Math.round(now - RUN_WINDOW_MS)}`, "+inf")), RUNS_PER_HOUR);
  }

  /** SCAN rpg:*:char (해시만) → 캐릭터 JSON을 파이프라인 한 번으로. 깨진 JSON은 건너뛴다 */
  async scanChars(cursor: string, count: number) {
    const [next, keys] = await this.redis.scan(cursor, { match: "rpg:*:char", count, type: "hash" });
    const ids = keys.flatMap((k) => /^rpg:([^:]+):char$/.exec(k)?.[1] ?? []);
    const chars: [string, CharacterState][] = [];
    if (ids.length) {
      const p = this.redis.pipeline();
      for (const id of ids) p.hget(rk.char(id), "data");
      const res = (await p.exec()) as unknown[];
      ids.forEach((id, i) => {
        if (res[i] === null || res[i] === undefined) return;
        try {
          chars.push([id, normalize(JSON.parse(String(res[i])))]);
        } catch {
          /* 깨진 캐릭터는 랭킹에서 뺀다 */
        }
      });
    }
    return { next: String(next), chars };
  }

  async endgameLaunch(now: number): Promise<number> {
    const v = Number(await this.redis.eval<string[], string>(LAUNCH_LUA, [rk.launch], [String(now)]));
    return Number.isFinite(v) && v > 0 ? v : now;
  }

  async claimPioneer(acct: string, now: number) {
    const v = String(await this.redis.eval<string[], string>(PIONEER_LUA, [rk.pioneer, rk.pioneerN], [acct, String(now)]));
    const [n, at] = v.split("|").map(Number);
    return { n: n || 0, at: at || now };
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 남게 globalThis에 둔다 (lib/store와 같은 방식)
const g = globalThis as typeof globalThis & { __tombRpg?: RpgStore };

export function getRpgStore(): RpgStore {
  const cur = g.__tombRpg;
  const conn = env.redis();
  if (conn) return cur instanceof RedisRpgStore ? cur : (g.__tombRpg = new RedisRpgStore(conn));
  if (env.isProd()) throw new Error("[rpg] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryRpgStore) return cur;
  g.__tombRpg = cur ? Object.assign(new MemoryRpgStore(), cur) : new MemoryRpgStore();
  return g.__tombRpg;
}
