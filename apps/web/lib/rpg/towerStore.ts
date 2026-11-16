import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";

// 11/15 야근 빌딩 기록 저장소 (랭킹·서버 최초·꼭대기 층 주인). 캐릭터 기록(최고 층·이번 주 최고)은 캐릭터 JSON에 있고,
// 여기는 여러 사람을 줄 세우거나 한 사람만 갖는 값만 둔다. 층이 오를 때만 쓴다 (판마다 쓰지 않는다 — 11/16 같은 층은 처음 도달한 점수를 지킨다).
//
// Redis 키
//  - rpg:tower:all          ZSET 계정 → 점수(층 × 1e9 + 먼저 도달한 시각, lib/rpg/tower towerScore — 11/16 예전엔 빨리 오른 시간). 전체 최고 층 랭킹
//  - rpg:tower:w:{주}       ZSET 같은 점수, 그 주(월요일 YYYYMMDD) 최고 층 랭킹 (60일 뒤 지워진다 — 지난주 1위 칭호를 그 다음 주에 읽는다)
//  - rpg:tower:first        HASH 칭호 id → "계정|시각" (서버 최초 — HSETNX로 처음 한 사람만)
//  - rpg:tower:top          STRING "계정|층|ms|시각" 꼭대기 층 주인 (더 높은 층만 빼앗는다 — 같으면 먼저 오른 사람)
// 운영자(슈퍼) 계정은 부르는 쪽(service)이 처음부터 넣지 않는다.

const WEEK_TTL_SEC = 60 * 86_400;

export type TowerEntry = { accountId: string; score: number };
export type TopHolder = {
  accountId: string;
  floor: number;
  ms: number;
  at: number;
};

export interface TowerStore {
  /** 기록이 오른 사람만: 주간(week)·전체 점수를 올린다 (null이면 그 판은 건드리지 않는다). 파이프라인 한 번 */
  record(
    acct: string,
    week: string,
    weekScore: number | null,
    allScore: number | null,
  ): Promise<void>;
  /** 높은 점수부터 n명 (week가 없으면 전체) */
  top(n: number, week?: string): Promise<TowerEntry[]>;
  scoreOf(acct: string, week?: string): Promise<number | null>;
  /** 이 점수보다 높은 사람 수 (내 순위) */
  countAbove(score: number, week?: string): Promise<number>;
  /** 서버 최초 칭호 받기: 아직 아무도 없으면 이 계정이 갖고 true (원자적) */
  claimFirst(titleId: string, acct: string, at: number): Promise<boolean>;
  /** 서버 최초 칭호 주인들 (칭호 id → 계정) */
  firsts(): Promise<Record<string, string>>;
  /** 꼭대기 층: floor가 지금 주인 층보다 높으면 빼앗는다 (같으면 그대로 — 먼저 오른 사람). 빼앗았는지와 그 전 주인 */
  claimTop(
    acct: string,
    floor: number,
    ms: number,
    at: number,
  ): Promise<{ took: boolean; prev: TopHolder | null }>;
  topHolder(): Promise<TopHolder | null>;
}

const k = {
  all: "rpg:tower:all",
  week: (w: string) => `rpg:tower:w:${w}`,
  first: "rpg:tower:first",
  top: "rpg:tower:top",
};

function parseTop(v: unknown): TopHolder | null {
  if (typeof v !== "string" || !v) return null;
  const [accountId, floor, ms, at] = v.split("|");
  return accountId
    ? {
        accountId,
        floor: Number(floor) || 0,
        ms: Number(ms) || 0,
        at: Number(at) || 0,
      }
    : null;
}

// ── 메모리 (로컬·테스트) ──

export class MemoryTowerStore implements TowerStore {
  private boards = new Map<string, Map<string, number>>();
  private first = new Map<string, string>();
  private topV: string | null = null;

  private board(key: string): Map<string, number> {
    let b = this.boards.get(key);
    if (!b) this.boards.set(key, (b = new Map()));
    return b;
  }
  async record(
    acct: string,
    week: string,
    weekScore: number | null,
    allScore: number | null,
  ) {
    if (weekScore !== null) this.board(k.week(week)).set(acct, weekScore);
    if (allScore !== null) this.board(k.all).set(acct, allScore);
  }
  async top(n: number, week?: string) {
    return [...this.board(week ? k.week(week) : k.all)]
      .map(([accountId, score]) => ({ accountId, score }))
      .sort(
        (a, b) => b.score - a.score || b.accountId.localeCompare(a.accountId),
      )
      .slice(0, n);
  }
  async scoreOf(acct: string, week?: string) {
    return this.board(week ? k.week(week) : k.all).get(acct) ?? null;
  }
  async countAbove(score: number, week?: string) {
    let n = 0;
    for (const v of this.board(week ? k.week(week) : k.all).values())
      if (v > score) n++;
    return n;
  }
  async claimFirst(titleId: string, acct: string, at: number) {
    if (this.first.has(titleId)) return false;
    this.first.set(titleId, `${acct}|${at}`);
    return true;
  }
  async firsts() {
    return Object.fromEntries(
      [...this.first].map(([id, v]) => [id, v.split("|")[0]]),
    );
  }
  async claimTop(acct: string, floor: number, ms: number, at: number) {
    const prev = parseTop(this.topV);
    if (prev && prev.floor >= floor) return { took: false, prev };
    this.topV = `${acct}|${floor}|${ms}|${at}`;
    return { took: true, prev };
  }
  async topHolder() {
    return parseTop(this.topV);
  }
}

// ── Redis ──

// KEYS: top  ARGV: 계정, 층, ms, 시각 — 지금 주인 층보다 높을 때만 바꾼다. {바꿨나, 그 전 값}
const TOP_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local f = tonumber(string.match(cur, '^[^|]*|(%d+)'))
  if f and f >= tonumber(ARGV[2]) then return {0, cur} end
end
redis.call('SET', KEYS[1], ARGV[1] .. '|' .. ARGV[2] .. '|' .. ARGV[3] .. '|' .. ARGV[4])
return {1, cur or ''}
`;

export class RedisTowerStore implements TowerStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "rpg/towerStore");
  }
  async record(
    acct: string,
    week: string,
    weekScore: number | null,
    allScore: number | null,
  ) {
    if (weekScore === null && allScore === null) return;
    const p = this.redis.pipeline();
    if (weekScore !== null)
      p.zadd(k.week(week), { score: weekScore, member: acct }).expire(
        k.week(week),
        WEEK_TTL_SEC,
      );
    if (allScore !== null) p.zadd(k.all, { score: allScore, member: acct });
    await p.exec();
  }
  async top(n: number, week?: string) {
    const flat = (await this.redis.zrange(
      week ? k.week(week) : k.all,
      0,
      n - 1,
      { rev: true, withScores: true },
    )) as unknown[];
    const out: TowerEntry[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2)
      out.push({ accountId: String(flat[i]), score: Number(flat[i + 1]) });
    return out;
  }
  async scoreOf(acct: string, week?: string) {
    const v = await this.redis.zscore(week ? k.week(week) : k.all, acct);
    return v === null || v === undefined ? null : Number(v);
  }
  async countAbove(score: number, week?: string) {
    return Number(
      await this.redis.zcount(week ? k.week(week) : k.all, `(${score}`, "+inf"),
    );
  }
  async claimFirst(titleId: string, acct: string, at: number) {
    return (
      Number(await this.redis.hsetnx(k.first, titleId, `${acct}|${at}`)) === 1
    );
  }
  async firsts() {
    const flat = (await this.redis.hgetall(k.first)) as unknown;
    const out: Record<string, string> = {};
    if (Array.isArray(flat))
      for (let i = 0; i + 1 < flat.length; i += 2)
        out[String(flat[i])] = String(flat[i + 1]).split("|")[0];
    else if (flat && typeof flat === "object")
      for (const [id, v] of Object.entries(flat))
        out[id] = String(v).split("|")[0];
    return out;
  }
  async claimTop(acct: string, floor: number, ms: number, at: number) {
    const r = (await this.redis.eval<string[], [number, string]>(
      TOP_LUA,
      [k.top],
      [acct, String(floor), String(Math.round(ms)), String(at)],
    )) as unknown as [number | string, string];
    return { took: Number(r[0]) === 1, prev: parseTop(r[1]) };
  }
  async topHolder() {
    return parseTop(await this.redis.get<string>(k.top));
  }
}

const g = globalThis as typeof globalThis & { __tombTower?: TowerStore };

export function getTowerStore(): TowerStore {
  const cur = g.__tombTower;
  const conn = env.redis();
  if (conn)
    return cur instanceof RedisTowerStore
      ? cur
      : (g.__tombTower = new RedisTowerStore(conn));
  if (env.isProd()) throw new Error("[tower] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryTowerStore) return cur;
  return (g.__tombTower = new MemoryTowerStore());
}
