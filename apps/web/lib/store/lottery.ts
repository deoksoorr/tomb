import { Redis } from "@upstash/redis";
import type { LotteryResult } from "../lottery";
import { K } from "./keys";

// 주간 행운권 추첨 저장소 (lib/lottery · lib/lotteryService).
//  - 회차마다 산 계정 표(한 장씩). 사기는 "마감 표시가 없고 아직 안 샀을 때만" 한 명령으로 넣는다
//  - 추첨은 먼저 마감 표시를 걸고 같은 명령으로 표·지원금·이월을 읽는다 → 그 뒤 들어오는 사기는 closed로 거절된다
//  - 결과는 처음 것만 저장한다 (같은 명령에서 이월·마지막 회차·기록 목록도 바꾼다). 지급·공지는 결과 id 아래 표시로 한 번만

/** 회차 키 보관 (결과는 따로 오래 남긴다) */
export const LOTTERY_ROUND_TTL_SEC = 60 * 86_400;
/** 추첨 잠금 (지급까지 끝내는 데 넉넉한 시간) */
export const LOTTERY_LOCK_SEC = 60;
/** 결과 기록 목록 길이 */
export const LOTTERY_HISTORY_KEEP = 50;

export type LotteryBuy = "ok" | "dup" | "closed";
export type LotterySnapshot = { buyers: string[]; subsidy: number; carry: number };

export interface LotteryStore {
  has(round: string, accountId: string): Promise<boolean>;
  /** 한 장 넣기 (원자적): 이미 샀으면 dup, 추첨이 마감을 걸었으면 closed */
  buy(round: string, accountId: string, now: number): Promise<LotteryBuy>;
  count(round: string): Promise<number>;
  subsidy(round: string): Promise<number>;
  /** 지원금 더하기. 마감된 회차면 null, 아니면 새 합계 */
  addSubsidy(round: string, amount: number): Promise<number | null>;
  /** 다음 추첨으로 넘어갈 이월 상금 */
  carry(): Promise<number>;
  /** 판매 마감을 걸고 산 계정·지원금·이월을 읽는다 (여러 번 불러도 같다) */
  close(round: string): Promise<LotterySnapshot>;
  /** 결과 저장 (처음 한 번만 true). 같은 명령에서 이월 = carryOut, 기록 목록 맨 앞, official이면 마지막 회차 */
  commit(r: LotteryResult, official: boolean): Promise<boolean>;
  result(id: string): Promise<LotteryResult | null>;
  /** 최근 결과 (최신 먼저) */
  recent(limit: number): Promise<LotteryResult[]>;
  /** 마지막으로 추첨을 마친 정식 회차 */
  last(): Promise<string | null>;
  /** 결과 id 아래 표시 (처음이면 true) · 있는지 */
  mark(id: string, field: string): Promise<boolean>;
  marked(id: string, field: string): Promise<boolean>;
  /** 시험 추첨 뒤: 그 회차 표·마감·지원금을 비워 다시 팔게 한다 (테스트 서버 전용) */
  reopen(round: string): Promise<void>;
  lock(round: string): Promise<boolean>;
  unlock(round: string): Promise<void>;
}

export class MemoryLottery implements LotteryStore {
  private tickets = new Map<string, Map<string, number>>();
  private closed = new Set<string>();
  private subs = new Map<string, number>();
  private results = new Map<string, LotteryResult>();
  private history: string[] = [];
  private carryP = 0;
  private lastRound: string | null = null;
  private marks = new Set<string>();
  private locks = new Map<string, number>();

  async has(round: string, accountId: string): Promise<boolean> {
    return !!this.tickets.get(round)?.has(accountId);
  }
  async buy(round: string, accountId: string, now: number): Promise<LotteryBuy> {
    if (this.closed.has(round)) return "closed";
    let t = this.tickets.get(round);
    if (!t) this.tickets.set(round, (t = new Map()));
    if (t.has(accountId)) return "dup";
    t.set(accountId, now);
    return "ok";
  }
  async count(round: string): Promise<number> {
    return this.tickets.get(round)?.size ?? 0;
  }
  async subsidy(round: string): Promise<number> {
    return this.subs.get(round) ?? 0;
  }
  async addSubsidy(round: string, amount: number): Promise<number | null> {
    if (this.closed.has(round)) return null;
    const n = (this.subs.get(round) ?? 0) + amount;
    this.subs.set(round, n);
    return n;
  }
  async carry(): Promise<number> {
    return this.carryP;
  }
  async close(round: string): Promise<LotterySnapshot> {
    this.closed.add(round);
    return { buyers: [...(this.tickets.get(round)?.keys() ?? [])], subsidy: this.subs.get(round) ?? 0, carry: this.carryP };
  }
  async commit(r: LotteryResult, official: boolean): Promise<boolean> {
    if (this.results.has(r.id)) return false;
    this.results.set(r.id, r);
    this.carryP = r.carryOut;
    this.history = [r.id, ...this.history].slice(0, LOTTERY_HISTORY_KEEP);
    if (official) this.lastRound = r.round;
    return true;
  }
  async result(id: string): Promise<LotteryResult | null> {
    return this.results.get(id) ?? null;
  }
  async recent(limit: number): Promise<LotteryResult[]> {
    return this.history.slice(0, limit).flatMap((id) => this.results.get(id) ?? []);
  }
  async last(): Promise<string | null> {
    return this.lastRound;
  }
  async mark(id: string, field: string): Promise<boolean> {
    const k = `${id}:${field}`;
    if (this.marks.has(k)) return false;
    this.marks.add(k);
    return true;
  }
  async marked(id: string, field: string): Promise<boolean> {
    return this.marks.has(`${id}:${field}`);
  }
  async reopen(round: string): Promise<void> {
    this.tickets.delete(round);
    this.closed.delete(round);
    this.subs.delete(round);
  }
  async lock(round: string): Promise<boolean> {
    const now = Date.now();
    if ((this.locks.get(round) ?? 0) > now) return false;
    this.locks.set(round, now + LOTTERY_LOCK_SEC * 1000);
    return true;
  }
  async unlock(round: string): Promise<void> {
    this.locks.delete(round);
  }
}

// KEYS: 표, 마감. ARGV: 계정, 시각, TTL. 1 = 넣음, -1 = 이미 있음, -2 = 마감
const BUY_LUA = `
if redis.call('EXISTS', KEYS[2]) == 1 then return -2 end
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 0 then return -1 end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1
`;
// KEYS: 지원금, 마감. ARGV: 양, TTL. -1 = 마감
const SUBSIDY_LUA = `
if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end
local n = redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return n
`;
// KEYS: 마감, 표, 지원금, 이월. ARGV: TTL. 반환 {표 계정들, 지원금, 이월}
const CLOSE_LUA = `
redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[1]))
return {redis.call('HKEYS', KEYS[2]), tonumber(redis.call('GET', KEYS[3]) or '0'), tonumber(redis.call('GET', KEYS[4]) or '0')}
`;
// KEYS: 결과, 이월, 기록 목록, 마지막 회차. ARGV: 결과 JSON, 이월, 결과 id, official(1/0), 회차, 목록 길이
const COMMIT_LUA = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], ARGV[2])
redis.call('LPUSH', KEYS[3], ARGV[3])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[6]) - 1)
if ARGV[4] == '1' then redis.call('SET', KEYS[4], ARGV[5]) end
return 1
`;
const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

export class RedisLottery implements LotteryStore {
  private redis: Redis;
  private token = new Map<string, string>();

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async has(round: string, accountId: string): Promise<boolean> {
    return (await this.redis.hexists(K.lotTickets(round), accountId)) === 1;
  }
  async buy(round: string, accountId: string, now: number): Promise<LotteryBuy> {
    const n = Number(await this.redis.eval(BUY_LUA, [K.lotTickets(round), K.lotClosed(round)], [accountId, String(now), String(LOTTERY_ROUND_TTL_SEC)]));
    return n === 1 ? "ok" : n === -2 ? "closed" : "dup";
  }
  async count(round: string): Promise<number> {
    return Number(await this.redis.hlen(K.lotTickets(round)));
  }
  async subsidy(round: string): Promise<number> {
    return Number((await this.redis.get<string>(K.lotSubsidy(round))) ?? 0);
  }
  async addSubsidy(round: string, amount: number): Promise<number | null> {
    const n = Number(await this.redis.eval(SUBSIDY_LUA, [K.lotSubsidy(round), K.lotClosed(round)], [String(amount), String(LOTTERY_ROUND_TTL_SEC)]));
    return n < 0 ? null : n;
  }
  async carry(): Promise<number> {
    return Number((await this.redis.get<string>(K.lotCarry)) ?? 0);
  }
  async close(round: string): Promise<LotterySnapshot> {
    const r = (await this.redis.eval(CLOSE_LUA, [K.lotClosed(round), K.lotTickets(round), K.lotSubsidy(round), K.lotCarry], [String(LOTTERY_ROUND_TTL_SEC)])) as [string[], number, number];
    return { buyers: r[0] ?? [], subsidy: Number(r[1]), carry: Number(r[2]) };
  }
  async commit(r: LotteryResult, official: boolean): Promise<boolean> {
    const n = await this.redis.eval(
      COMMIT_LUA,
      [K.lotResult(r.id), K.lotCarry, K.lotHistory, K.lotLast],
      [JSON.stringify(r), String(r.carryOut), r.id, official ? "1" : "0", r.round, String(LOTTERY_HISTORY_KEEP)],
    );
    return Number(n) === 1;
  }
  async result(id: string): Promise<LotteryResult | null> {
    const raw = await this.redis.get<string>(K.lotResult(id));
    return raw ? (JSON.parse(raw) as LotteryResult) : null;
  }
  async recent(limit: number): Promise<LotteryResult[]> {
    const ids = await this.redis.lrange(K.lotHistory, 0, limit - 1);
    if (!ids.length) return [];
    const rows = await this.redis.mget<(string | null)[]>(...ids.map((id) => K.lotResult(id)));
    return rows.flatMap((raw) => (raw ? [JSON.parse(raw) as LotteryResult] : []));
  }
  async last(): Promise<string | null> {
    return (await this.redis.get<string>(K.lotLast)) ?? null;
  }
  async mark(id: string, field: string): Promise<boolean> {
    return (await this.redis.hsetnx(K.lotPaid(id), field, "1")) === 1;
  }
  async marked(id: string, field: string): Promise<boolean> {
    return (await this.redis.hexists(K.lotPaid(id), field)) === 1;
  }
  async reopen(round: string): Promise<void> {
    await this.redis.del(K.lotTickets(round), K.lotClosed(round), K.lotSubsidy(round));
  }
  async lock(round: string): Promise<boolean> {
    const t = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ok = (await this.redis.set(K.lotLock(round), t, { nx: true, ex: LOTTERY_LOCK_SEC })) !== null;
    if (ok) this.token.set(round, t);
    return ok;
  }
  async unlock(round: string): Promise<void> {
    const t = this.token.get(round);
    if (!t) return;
    this.token.delete(round);
    await this.redis.eval(UNLOCK_LUA, [K.lotLock(round)], [t]);
  }
}
