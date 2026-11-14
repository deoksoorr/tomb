import { Redis } from "@upstash/redis";
import { env } from "../env";
import { normalize, RpgError } from "./character";
import type { CharacterState, DailyStats } from "./types";

// 사냥터 저장소. 캐릭터는 계정마다 JSON 한 덩어리이고, 모든 변경은 "읽기 → 순수 함수 → 버전 비교 후 쓰기(Lua)"로
// 원자적이다 (두 탭에서 동시에 사고팔아도 한쪽이 다시 계산된다). 로컬은 같은 규칙의 메모리 구현을 쓴다.
//
// Redis 키 (모두 rpg:{accountId}:*)
//  - rpg:{a}:char        HASH  rev → 버전, data → CharacterState JSON
//  - rpg:{a}:active      STRING 지금 진행 중인 판의 nonce (시간 제한 + 여유 뒤 만료). 새 판을 시작하면 바뀐다
//  - rpg:{a}:used:{n}    STRING 끝낸 판 표시 (SET NX, 2일) → 같은 티켓을 두 번 낼 수 없다
//  - rpg:{a}:runs:{시}   STRING 이번 한 시간 동안 시작한 판 수 (INCR, 1시간)
//  - rpg:{a}:day:{게임 날짜}   HASH  points/runs/exp 오늘 사냥 기록 (2일)

export const RUNS_PER_HOUR = 30;
const USED_TTL_SEC = 2 * 86_400;
const DAY_TTL_SEC = 2 * 86_400;
const CAS_RETRIES = 6;

export type ClaimResult = "ok" | "reused" | "stale";

export interface RpgStore {
  get(acct: string): Promise<CharacterState>;
  /** fn을 최신 상태에 적용해 원자적으로 저장한다. fn이 던지면 저장하지 않는다 */
  update<T>(acct: string, fn: (s: CharacterState) => { state: CharacterState; result: T }): Promise<{ state: CharacterState; result: T }>;
  /** 시간당 한도를 세고 진행 중인 판으로 기록한다. 한도면 false */
  startRun(acct: string, nonce: string, ttlSec: number, hourBucket: string): Promise<boolean>;
  /** 끝내기: 처음 내는 티켓이고 지금 진행 중인 판이어야 ok */
  claimRun(acct: string, nonce: string): Promise<ClaimResult>;
  addDaily(acct: string, day: string, d: Partial<DailyStats>): Promise<DailyStats>;
  daily(acct: string, day: string): Promise<DailyStats>;
  runsThisHour(acct: string, hourBucket: string): Promise<number>;
  /** 저장된 캐릭터를 커서로 훑는다 (next "0" = 끝). 랭킹 기존 기록 채우기용 (lib/huntLevelRank) */
  scanChars(cursor: string, count: number): Promise<{ next: string; chars: [string, CharacterState][] }>;
}

export const rk = {
  char: (a: string) => `rpg:${a}:char`,
  active: (a: string) => `rpg:${a}:active`,
  used: (a: string, n: string) => `rpg:${a}:used:${n}`,
  runs: (a: string, hour: string) => `rpg:${a}:runs:${hour}`,
  day: (a: string, day: string) => `rpg:${a}:day:${day}`,
};

const conflict = () => new RpgError(409, "BUSY", "다른 곳에서 같은 캐릭터를 바꾸는 중이에요. 다시 시도해 주세요.");

// ── 메모리 (로컬·테스트). await 없이 끝나는 구간이라 이벤트 루프 안에서 원자적이다 ──

export class MemoryRpgStore implements RpgStore {
  private chars = new Map<string, CharacterState>();
  private active = new Map<string, { nonce: string; until: number }>();
  private used = new Set<string>();
  private runs = new Map<string, number>();
  private days = new Map<string, DailyStats>();

  async get(acct: string): Promise<CharacterState> {
    return structuredClone(this.chars.get(acct) ?? normalize(null));
  }

  async update<T>(acct: string, fn: (s: CharacterState) => { state: CharacterState; result: T }) {
    const out = fn(structuredClone(this.chars.get(acct) ?? normalize(null)));
    this.chars.set(acct, structuredClone(out.state));
    return out;
  }

  async startRun(acct: string, nonce: string, ttlSec: number, hour: string): Promise<boolean> {
    const k = rk.runs(acct, hour);
    const n = (this.runs.get(k) ?? 0) + 1;
    this.runs.set(k, n);
    if (n > RUNS_PER_HOUR) return false;
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

  async runsThisHour(acct: string, hour: string): Promise<number> {
    return Math.min(this.runs.get(rk.runs(acct, hour)) ?? 0, RUNS_PER_HOUR);
  }

  async scanChars(cursor: string, count: number) {
    const all = [...this.chars];
    const start = Number(cursor) || 0;
    const end = start + Math.max(1, count);
    return { next: end >= all.length ? "0" : String(end), chars: all.slice(start, end).map(([a, s]) => [a, structuredClone(s)] as [string, CharacterState]) };
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

// KEYS: runs, active  ARGV: nonce, ttl, max
const START_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
if n > tonumber(ARGV[3]) then return 0 end
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

export class RedisRpgStore implements RpgStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
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

  async startRun(acct: string, nonce: string, ttlSec: number, hour: string): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(START_LUA, [rk.runs(acct, hour), rk.active(acct)], [nonce, String(ttlSec), String(RUNS_PER_HOUR)]);
    return Number(r) === 1;
  }

  async claimRun(acct: string, nonce: string): Promise<ClaimResult> {
    return (await this.redis.eval<string[], string>(CLAIM_LUA, [rk.used(acct, nonce), rk.active(acct)], [nonce, String(USED_TTL_SEC)])) as ClaimResult;
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

  async runsThisHour(acct: string, hour: string): Promise<number> {
    return Math.min(Number((await this.redis.get<string>(rk.runs(acct, hour))) ?? 0), RUNS_PER_HOUR);
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
