import { Redis } from "@upstash/redis";
import { champBitsOf, champBoards, type ChampBoard } from "@tomb/protocol";
import { env } from "../env";
import { gameWeek, prevWeek, weekEndMs, weekStartMs } from "../gameDay";
import { testServerEnv } from "../rpg/superHunter";
import { K } from "./keys";

// 주간 랭킹 1위 기록 (lib/weeklyChamp). 한 주의 1위는 처음 정한 기록만 남는다 (SET NX → 다시 계산해도 바뀌지 않는다).
// 지급 자체의 "한 번만"은 계정 저장소 grantChamp(champ:paid HSETNX)가 지키고, 여기 잠금은 같은 정리를 여러 요청이 겹쳐 하지 않게 할 뿐이다.

/** 한 랭킹의 1위 (value = 그 주 값: 포인트 P · 처치 수 · 크기 cm×10, sp = 낚시면 물고기 id) */
export type ChampWinner = { board: ChampBoard; accountId: string; name: string; value: number; sp?: string };
/** 한 주의 1위 기록. winners = 1위가 있는 랭킹만 (아무도 기록이 없으면 빠진다) */
export type ChampWeek = { week: string; winners: ChampWinner[]; settledAt: number };

/** 테스트 서버 운영자 시험 1위 (주간 기록과 따로 — 랭킹·명예의 전당에 나오지 않는다). id = 알림 창 "봤음" 표시용, until = 저절로 끝나는 시각 */
export type ChampTest = { id: string; bits: number; until: number };

/** 잠금 유지 시간 (정리하던 서버가 죽어도 이만큼 지나면 다른 요청이 잇는다) */
const LOCK_SEC = 60;
/** 레이스 1위 기록 보관 (그 주 + 지난주 비교 여유) */
const LEAD_TTL_SEC = 21 * 86_400;

export interface ChampStore {
  get(week: string): Promise<ChampWeek | null>;
  /** 처음이면 저장하고 true, 이미 있으면 그대로 두고 false */
  create(rec: ChampWeek, weekStartMs: number): Promise<boolean>;
  /** 명예의 전당: 최근 주부터 limit개 */
  hall(limit: number): Promise<ChampWeek[]>;
  lock(week: string): Promise<boolean>;
  unlock(week: string): Promise<void>;
  /** 1위 알림 창을 본 주 (없으면 null) */
  seen(accountId: string): Promise<string | null>;
  setSeen(accountId: string, week: string): Promise<void>;
  /** 1위 오라 끔 (본인 설정, 기본 켜짐) */
  auraOff(accountId: string): Promise<boolean>;
  setAuraOff(accountId: string, off: boolean): Promise<void>;
  /** 레이스: 그 주 그 랭킹의 직전 1위 계정을 next로 바꾸고 직전 값을 돌려준다 (처음이면 null) */
  swapLeader(week: string, board: ChampBoard, next: string): Promise<string | null>;
  /** 1위 바뀜 공지 간격: ms 안에 처음이면 true (잡는다) */
  leadCooldown(board: ChampBoard, ms: number): Promise<boolean>;
  /** 시험 1위 (테스트 서버 운영자 전용, 끝났으면 null) */
  test(accountId: string, now: number): Promise<ChampTest | null>;
  setTest(accountId: string, t: ChampTest | null): Promise<void>;
}

export class MemoryChamp implements ChampStore {
  private weeks = new Map<string, ChampWeek>();
  private locks = new Map<string, number>();
  private seenBy = new Map<string, string>();
  private off = new Set<string>();
  private leads = new Map<string, string>();
  private cools = new Map<string, number>();
  private tests = new Map<string, ChampTest>();

  async get(week: string): Promise<ChampWeek | null> {
    const r = this.weeks.get(week);
    return r ? structuredClone(r) : null;
  }
  async create(rec: ChampWeek): Promise<boolean> {
    if (this.weeks.has(rec.week)) return false;
    this.weeks.set(rec.week, structuredClone(rec));
    return true;
  }
  async hall(limit: number): Promise<ChampWeek[]> {
    return [...this.weeks.values()].sort((a, b) => b.week.localeCompare(a.week)).slice(0, limit).map((r) => structuredClone(r));
  }
  async lock(week: string): Promise<boolean> {
    const now = Date.now();
    if ((this.locks.get(week) ?? 0) > now) return false;
    this.locks.set(week, now + LOCK_SEC * 1000);
    return true;
  }
  async unlock(week: string): Promise<void> {
    this.locks.delete(week);
  }
  async seen(accountId: string): Promise<string | null> {
    return this.seenBy.get(accountId) ?? null;
  }
  async setSeen(accountId: string, week: string): Promise<void> {
    this.seenBy.set(accountId, week);
  }
  async auraOff(accountId: string): Promise<boolean> {
    return this.off.has(accountId);
  }
  async setAuraOff(accountId: string, off: boolean): Promise<void> {
    if (off) this.off.add(accountId);
    else this.off.delete(accountId);
  }
  async swapLeader(week: string, board: ChampBoard, next: string): Promise<string | null> {
    const key = `${week}:${board}`;
    const prev = this.leads.get(key) ?? null;
    this.leads.set(key, next);
    return prev;
  }
  async leadCooldown(board: ChampBoard, ms: number): Promise<boolean> {
    const now = Date.now();
    if ((this.cools.get(board) ?? 0) > now) return false;
    this.cools.set(board, now + ms);
    return true;
  }
  async test(accountId: string, now: number): Promise<ChampTest | null> {
    const t = this.tests?.get(accountId);
    return t && t.until > now ? { ...t } : null;
  }
  async setTest(accountId: string, t: ChampTest | null): Promise<void> {
    this.tests ??= new Map();
    if (t) this.tests.set(accountId, { ...t });
    else this.tests.delete(accountId);
  }
}

// KEYS: 레이스 1위 해시  ARGV: 랭킹, 새 1위, ttl → 직전 1위 (없으면 false)
const SWAP_LUA = `
local prev = redis.call('HGET', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return prev
`;

export class RedisChamp implements ChampStore {
  private redis: Redis;
  private token = new Map<string, string>();

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async get(week: string): Promise<ChampWeek | null> {
    const raw = await this.redis.get<string>(K.champWeek(week));
    return raw ? (JSON.parse(String(raw)) as ChampWeek) : null;
  }
  async create(rec: ChampWeek, weekStartMs: number): Promise<boolean> {
    const ok = (await this.redis.set(K.champWeek(rec.week), JSON.stringify(rec), { nx: true })) !== null;
    if (ok) await this.redis.zadd(K.champWeeks, { score: weekStartMs, member: rec.week });
    return ok;
  }
  async hall(limit: number): Promise<ChampWeek[]> {
    const weeks = (await this.redis.zrange<string[]>(K.champWeeks, 0, limit - 1, { rev: true })) ?? [];
    if (!weeks.length) return [];
    const raws = (await this.redis.mget<(string | null)[]>(...weeks.map((w) => K.champWeek(String(w))))) ?? [];
    return raws.flatMap((r) => (r ? [JSON.parse(String(r)) as ChampWeek] : []));
  }
  async lock(week: string): Promise<boolean> {
    const t = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ok = (await this.redis.set(K.champLock(week), t, { nx: true, ex: LOCK_SEC })) !== null;
    if (ok) this.token.set(week, t);
    return ok;
  }
  async unlock(week: string): Promise<void> {
    const t = this.token.get(week);
    this.token.delete(week);
    // 내가 잡은 잠금일 때만 푼다 (시간이 지나 남이 잡은 잠금은 건드리지 않는다)
    if (t) await this.redis.eval<string[], number>("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [K.champLock(week)], [t]);
  }
  async seen(accountId: string): Promise<string | null> {
    const v = await this.redis.hget<string>(K.champSeen, accountId);
    return v === null || v === undefined ? null : String(v);
  }
  async setSeen(accountId: string, week: string): Promise<void> {
    await this.redis.hset(K.champSeen, { [accountId]: week });
  }
  async auraOff(accountId: string): Promise<boolean> {
    return (await this.redis.hget<string>(K.champAuraOff, accountId)) !== null;
  }
  async setAuraOff(accountId: string, off: boolean): Promise<void> {
    if (off) await this.redis.hset(K.champAuraOff, { [accountId]: "1" });
    else await this.redis.hdel(K.champAuraOff, accountId);
  }
  async swapLeader(week: string, board: ChampBoard, next: string): Promise<string | null> {
    const prev = await this.redis.eval<string[], string | null>(SWAP_LUA, [K.champLead(week)], [board, next, String(LEAD_TTL_SEC)]);
    return typeof prev === "string" && prev ? prev : null;
  }
  async leadCooldown(board: ChampBoard, ms: number): Promise<boolean> {
    return (await this.redis.set(K.champLeadCool(board), "1", { nx: true, px: ms })) !== null;
  }
  async test(accountId: string, now: number): Promise<ChampTest | null> {
    const raw = await this.redis.hget<string>(K.champTest, accountId);
    if (raw === null || raw === undefined) return null;
    const t = JSON.parse(String(raw)) as ChampTest;
    return t.until > now ? t : null;
  }
  async setTest(accountId: string, t: ChampTest | null): Promise<void> {
    if (t) await this.redis.hset(K.champTest, { [accountId]: JSON.stringify(t) });
    else await this.redis.hdel(K.champTest, accountId);
  }
}

const g = globalThis as typeof globalThis & { __tombChamp?: ChampStore };

/** 주간 랭킹 1위 기록 저장소 (묘비 저장소와 같은 백엔드: Redis 환경변수가 있으면 Redis, 없으면 로컬 메모리) */
export function getChamp(): ChampStore {
  const cur = g.__tombChamp;
  const conn = env.redis();
  if (conn) return cur instanceof RedisChamp ? cur : (g.__tombChamp = new RedisChamp(conn));
  if (env.isProd()) throw new Error("[champ] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryChamp) return cur;
  return (g.__tombChamp = cur ? Object.assign(new MemoryChamp(), cur) : new MemoryChamp());
}

// ── 주 계산 (월요일 새벽 5시 마감 — 하루·주 경계는 lib/gameDay 한 곳) ──

const DAY_MS = 86_400_000;
/** 1위 꾸미기 대여 여유: 다음 주 1위가 정해지는 정리(월요일 새벽 5시 뒤 첫 요청)가 늦어져도 끊기지 않게 */
export const CHAMP_GRACE_MS = 6 * 3_600_000;

/** now가 속한 주의 월요일 (YYYYMMDD). store/accounts.ts kstWeek와 같은 값 (둘 다 lib/gameDay gameWeek) */
export const kstWeekOf = gameWeek;
/** 그 주(월요일 YYYYMMDD)가 시작하는 시각 = 그 월요일 새벽 5시 (ms) · 마감 = 다음 월요일 새벽 5시 · 지난주 */
export { prevWeek, weekEndMs, weekStartMs };
/** 그 주 1위 꾸미기·자격이 끝나는 시각: 다음 주 마감(다다음 월요일 새벽 5시) + 여유 */
export const champUntil = (week: string) => weekStartMs(week) + 14 * DAY_MS + CHAMP_GRACE_MS;

// ── 계정의 지금 1위 값 (입장 토큰·내 정보·착용 증서가 함께 쓴다) ──

/** 지난주 기록을 프로세스 안에 잠깐 들고 있는다 (입장·내 정보마다 저장소를 읽지 않게) */
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; rec: ChampWeek | null }>();

/** 그 주 1위 기록 (잠깐 캐시) */
export async function champWeekCached(week: string, now = Date.now()): Promise<ChampWeek | null> {
  const hit = cache.get(week);
  if (hit && now - hit.at < CACHE_MS) return hit.rec;
  const rec = await getChamp().get(week);
  cache.set(week, { at: now, rec });
  return rec;
}
/** 정리가 끝나 새로 저장한 기록을 캐시에 바로 넣는다 */
export function primeChampCache(rec: ChampWeek, now = Date.now()): void {
  cache.set(rec.week, { at: now, rec });
}

/**
 * 지금 그 계정의 1위 값 (CHAMP_BOARDS 비트 + 본인이 오라를 껐으면 CHAMP_AURA_OFF, 1위가 아니면 0).
 * 자격 = 지난주(이번 주 월요일 새벽 5시에 마감한 주) 1위. 이번 주가 끝나면 저절로 다음 주 1위로 넘어간다
 */
export async function champBitsFor(accountId: string, now = Date.now()): Promise<number> {
  const rec = await champWeekCached(prevWeek(kstWeekOf(now)), now);
  const boards = rec?.winners.filter((w) => w.accountId === accountId).map((w) => w.board) ?? [];
  // 테스트 서버에서만: 운영자 시험 1위를 더한다 (운영에서는 읽지도 않는다)
  if (testServerEnv()) {
    const t = await getChamp().test(accountId, now);
    for (const b of champBoards(t?.bits)) if (!boards.includes(b)) boards.push(b);
  }
  if (!boards.length) return 0;
  return champBitsOf(boards, await getChamp().auraOff(accountId));
}
