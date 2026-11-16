import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";

// 칭호용 누적 기록 (계정마다): 다른 곳에 누적 값이 없는 것만 여기서 센다.
//  - stay: 머문 기록 수 (머무르기 10분 한 번 = 1). 계정 기록의 stayTicks는 "오늘"만 세므로 누적은 여기서.
//    기능 전 시간은 남은 기록이 없어 셀 수 없다 → 처음 세는 날 그날 머문 기록부터 (seed) 시작한다.
//
// Redis 키
//  - titles:stats:{계정}  HASH  stay → 누적 머문 기록 수
//                         11/15 quests → 끝낸 수집 의뢰 수 · qking → 수집가 유령 외형을 받음(1). 둘은 수집 의뢰 Lua(lib/forage/quests/store)가 같이 바꾼다
//                         11/15 urgKing·urgLast → 긴급 의뢰 칭호(「긴급 배달왕」·「아슬아슬 마감」)가 끝나는 시각 ms. 긴급 의뢰 받기 Lua(lib/forage/quests/urgentStore)가 쓴다

const key = (id: string) => `titles:stats:${id}`;
export const titleStatsKey = key;

export type TitleStats = { stay: number; quests: number; qking: number; urgKing: number; urgLast: number };

export interface TitleStatStore {
  get(accountId: string): Promise<TitleStats>;
  /**
   * 머문 기록 +by (숨긴 탭은 몰아서 세므로 한 번에 여러 개). 처음이면 그날 머문 기록 수(todayTotal — 이번 것 포함)에서 시작한다.
   * Redis 2명령 (HSETNX + HINCRBY). 새 누적 값을 돌려준다
   */
  addStay(accountId: string, by: number, todayTotal: number): Promise<number>;
}

export class MemoryTitleStats implements TitleStatStore {
  private rows = new Map<string, TitleStats>();
  async get(accountId: string): Promise<TitleStats> {
    const r = this.rows.get(accountId);
    return { stay: r?.stay ?? 0, quests: r?.quests ?? 0, qking: r?.qking ?? 0, urgKing: r?.urgKing ?? 0, urgLast: r?.urgLast ?? 0 };
  }
  /** 수집 의뢰 메모리 저장소가 부른다 (동기 — 의뢰 저장과 한 번에) */
  bump(accountId: string, field: "quests" | "qking", by: number): void {
    const r = this.rows.get(accountId) ?? { stay: 0, quests: 0, qking: 0, urgKing: 0, urgLast: 0 };
    r[field] = field === "qking" ? 1 : (r[field] ?? 0) + by;
    this.rows.set(accountId, r);
  }
  /** 긴급 의뢰 칭호 끝 시각 (긴급 의뢰 메모리 저장소가 받기와 한 번에 부른다 — 동기) */
  setUntil(accountId: string, field: "urgKing" | "urgLast", until: number): void {
    const r = this.rows.get(accountId) ?? { stay: 0, quests: 0, qking: 0, urgKing: 0, urgLast: 0 };
    r[field] = until;
    this.rows.set(accountId, r);
  }
  async addStay(accountId: string, by: number, todayTotal: number): Promise<number> {
    const r = this.rows.get(accountId) ?? { stay: Math.max(0, todayTotal - by), quests: 0, qking: 0, urgKing: 0, urgLast: 0 };
    r.stay += by;
    this.rows.set(accountId, r);
    return r.stay;
  }
}

export class RedisTitleStats implements TitleStatStore {
  private redis: Redis;
  /** 이 인스턴스가 stay 칸이 이미 있는 것을 본 계정 (그 뒤로는 첫 값 채우기 HSETNX를 보내지 않는다 — 머무르기 기록마다 명령 1개 절약) */
  private seeded = new Set<string>();
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "titleStats");
  }
  async get(accountId: string): Promise<TitleStats> {
    const r = (await this.redis.hmget(key(accountId), "stay", "quests", "qking", "urgKing", "urgLast")) as unknown;
    const o = (r ?? {}) as Record<string, unknown>;
    const v = Array.isArray(r) ? r : [o.stay, o.quests, o.qking, o.urgKing, o.urgLast];
    return { stay: Number(v[0]) || 0, quests: Number(v[1]) || 0, qking: Number(v[2]) || 0, urgKing: Number(v[3]) || 0, urgLast: Number(v[4]) || 0 };
  }
  async addStay(accountId: string, by: number, todayTotal: number): Promise<number> {
    if (this.seeded.has(accountId)) return Number(await this.redis.hincrby(key(accountId), "stay", by)) || 0;
    const [, n] = (await this.redis
      .pipeline()
      .hsetnx(key(accountId), "stay", String(Math.max(0, todayTotal - by)))
      .hincrby(key(accountId), "stay", by)
      .exec()) as [unknown, unknown];
    if (this.seeded.size > 50_000) this.seeded.clear();
    this.seeded.add(accountId);
    return Number(n) || 0;
  }
}

const g = globalThis as typeof globalThis & { __tombTitleStats?: TitleStatStore };

export function getTitleStats(): TitleStatStore {
  const cur = g.__tombTitleStats;
  const conn = env.redis();
  if (conn) return cur instanceof RedisTitleStats ? cur : (g.__tombTitleStats = new RedisTitleStats(conn));
  if (env.isProd()) throw new Error("[titleStats] Redis 환경변수가 없습니다.");
  // 모듈이 다시 로드되거나 경로마다 따로 묶여도(개발 서버) 기록이 남게 이전 객체의 값을 옮긴다 (lib/store/champ와 같은 방식)
  if (cur instanceof MemoryTitleStats) return cur;
  return (g.__tombTitleStats = cur ? Object.assign(new MemoryTitleStats(), cur) : new MemoryTitleStats());
}
