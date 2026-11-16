import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { DRUNK_STEP_MS, isDrunkState, type DrunkState } from "@tomb/protocol";
import { K } from "./keys";

// 11/15 캠핑장 바베큐: 계정마다 지금 취기 하나 (먹거리·마실 거리 모두 하루 한도는 없다 — 포인트로만 산다).
// 취기는 마실 때마다 +1(최대 5)이고 10분에 1씩 깬다. 다 깨고 조금 지나면 키가 저절로 사라진다.

export interface BbqDayStore {
  /** 11/15 지금 취기 기록 (없으면 null — 다 깬 뒤에는 키가 사라진다) */
  drunk(accountId: string): Promise<DrunkState | null>;
  /** 취기 기록 (다 깨는 시각 + 10분까지 남긴다) */
  setDrunk(accountId: string, s: DrunkState): Promise<void>;
}

/** 취기 키를 남겨 두는 시간 (초): 다 깨는 시각 + 한 단계 */
export function drunkTtlSec(s: DrunkState, now: number): number {
  return Math.max(60, Math.ceil((s.at + (s.lv + 1) * DRUNK_STEP_MS - now) / 1000));
}

export class MemoryBbqDay implements BbqDayStore {
  private drunks = new Map<string, DrunkState>();

  async drunk(accountId: string): Promise<DrunkState | null> {
    return this.drunks.get(accountId) ?? null;
  }
  async setDrunk(accountId: string, s: DrunkState): Promise<void> {
    this.drunks.set(accountId, s);
  }
}

export class RedisBbqDay implements BbqDayStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "bbqDay");
  }

  async drunk(accountId: string): Promise<DrunkState | null> {
    const raw = await this.redis.get<string>(K.campDrunk(accountId));
    if (!raw) return null;
    try {
      const v: unknown = JSON.parse(raw);
      return isDrunkState(v) ? v : null;
    } catch {
      return null;
    }
  }
  async setDrunk(accountId: string, s: DrunkState): Promise<void> {
    await this.redis.set(K.campDrunk(accountId), JSON.stringify({ lv: s.lv, at: s.at }), { ex: drunkTtlSec(s, Date.now()) });
  }
}
