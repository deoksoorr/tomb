import { Redis } from "@upstash/redis";
import { env } from "../env";

// 칭호용 누적 기록 (계정마다): 다른 곳에 누적 값이 없는 것만 여기서 센다.
//  - stay: 머문 기록 수 (머무르기 10분 한 번 = 1). 계정 기록의 stayTicks는 "오늘"만 세므로 누적은 여기서.
//    기능 전 시간은 남은 기록이 없어 셀 수 없다 → 처음 세는 날 그날 머문 기록부터 (seed) 시작한다.
//
// Redis 키 (이 파일에서만 쓴다)
//  - titles:stats:{계정}  HASH  stay → 누적 머문 기록 수

const key = (id: string) => `titles:stats:${id}`;

export type TitleStats = { stay: number };

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
    return { stay: this.rows.get(accountId)?.stay ?? 0 };
  }
  async addStay(accountId: string, by: number, todayTotal: number): Promise<number> {
    const r = this.rows.get(accountId) ?? { stay: Math.max(0, todayTotal - by) };
    r.stay += by;
    this.rows.set(accountId, r);
    return r.stay;
  }
}

export class RedisTitleStats implements TitleStatStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async get(accountId: string): Promise<TitleStats> {
    return { stay: Number(await this.redis.hget(key(accountId), "stay")) || 0 };
  }
  async addStay(accountId: string, by: number, todayTotal: number): Promise<number> {
    const [, n] = (await this.redis
      .pipeline()
      .hsetnx(key(accountId), "stay", String(Math.max(0, todayTotal - by)))
      .hincrby(key(accountId), "stay", by)
      .exec()) as [unknown, unknown];
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
