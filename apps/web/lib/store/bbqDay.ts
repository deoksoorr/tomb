import { Redis } from "@upstash/redis";
import { K } from "./keys";

// 11/15 캠핑장 바베큐: 계정당 하루(게임 날짜, 한국 시간 새벽 5시에 바뀐다) 몇 접시까지 (protocol BBQ_DAILY).
// 차감 전에 그날 횟수를 원자적으로 하나 올리고(INCR), 한도를 넘었거나 포인트가 모자라 실패하면 하나 내린다 → 실패한 시도는 세지 않는다.
// 키는 날짜를 품고 있어 새벽 5시가 지나면 저절로 새로 센다.

/** 키를 남겨 두는 시간 (날짜가 키에 들어 있으니 하루 남짓이면 충분) */
export const BBQ_DAY_TTL_SEC = 2 * 24 * 60 * 60;

export interface BbqDayStore {
  /** 그날 횟수를 하나 올리고 올린 뒤 값을 돌려준다 */
  take(accountId: string, day: string): Promise<number>;
  /** 올린 것을 되돌린다 (실패) */
  undo(accountId: string, day: string): Promise<void>;
  /** 그날 먹은 횟수 */
  count(accountId: string, day: string): Promise<number>;
}

export class MemoryBbqDay implements BbqDayStore {
  private days = new Map<string, number>();

  async take(accountId: string, day: string): Promise<number> {
    const k = `${day}:${accountId}`;
    const n = (this.days.get(k) ?? 0) + 1;
    this.days.set(k, n);
    return n;
  }
  async undo(accountId: string, day: string): Promise<void> {
    const k = `${day}:${accountId}`;
    const n = (this.days.get(k) ?? 0) - 1;
    if (n > 0) this.days.set(k, n);
    else this.days.delete(k);
  }
  async count(accountId: string, day: string): Promise<number> {
    return this.days.get(`${day}:${accountId}`) ?? 0;
  }
}

export class RedisBbqDay implements BbqDayStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async take(accountId: string, day: string): Promise<number> {
    const key = K.bbqDay(accountId, day);
    const [n] = await this.redis.pipeline().incr(key).expire(key, BBQ_DAY_TTL_SEC).exec<[number, number]>();
    return Number(n);
  }
  async undo(accountId: string, day: string): Promise<void> {
    await this.redis.decr(K.bbqDay(accountId, day));
  }
  async count(accountId: string, day: string): Promise<number> {
    return Number((await this.redis.get<string>(K.bbqDay(accountId, day))) ?? 0);
  }
}
