import { Redis } from "@upstash/redis";
import { K } from "./keys";

// 50번 소원 분수: 계정당 하루(게임 날짜, 한국 시간 새벽 5시에 바뀐다) 한 번. 운영자 IP도 예외 없이 이 표 하나로 막는다 (lib/ratelimit와 따로).
// 차감 전에 그날 자리를 원자적으로 잡고(SET NX), 포인트가 모자라 실패하면 풀어 준다 → 실패한 시도는 횟수에서 빠진다.
// 동시에 여러 번 눌러도 SET NX가 하나만 통과시킨다. 키는 날짜를 품고 있어 새벽 5시가 지나면 저절로 새로 던질 수 있다.

/** 키를 남겨 두는 시간 (날짜가 키에 들어 있으니 하루 남짓이면 충분) */
export const WISH_DAY_TTL_SEC = 2 * 24 * 60 * 60;

export interface WishDayStore {
  /** 그날 처음이면 잡고 true, 이미 던졌으면 false */
  claim(accountId: string, day: string): Promise<boolean>;
  /** 잡아 둔 그날 자리를 푼다 (차감 실패) */
  release(accountId: string, day: string): Promise<void>;
}

export class MemoryWishDay implements WishDayStore {
  private days = new Map<string, string>();

  async claim(accountId: string, day: string): Promise<boolean> {
    if (this.days.get(accountId) === day) return false;
    this.days.set(accountId, day);
    return true;
  }
  async release(accountId: string, day: string): Promise<void> {
    if (this.days.get(accountId) === day) this.days.delete(accountId);
  }
}

export class RedisWishDay implements WishDayStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async claim(accountId: string, day: string): Promise<boolean> {
    return (await this.redis.set(K.wishDay(accountId, day), "1", { nx: true, ex: WISH_DAY_TTL_SEC })) !== null;
  }
  async release(accountId: string, day: string): Promise<void> {
    await this.redis.del(K.wishDay(accountId, day));
  }
}
