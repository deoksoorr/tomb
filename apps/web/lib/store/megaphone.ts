import { Redis } from "@upstash/redis";
import type { MegaphoneEntry } from "../types";
import { K } from "./keys";

// 23번 확성기 기록. 최근 MEGA_KEEP개를 LIST 하나에 두고(최신 먼저), 관리자가 숨긴 id는 SET에 따로 둔다
// (기록 JSON을 고치지 않아도 되고, 숨김 해제도 SREM 한 번). 계정마다 도배 제한 간격은 SET NX PX로 잡는다.

/** 저장하는 기록 수 (관리자 화면은 이만큼, 유저 창은 그중 MEGA_SHOW개) */
export const MEGA_KEEP = 100;
/** 확성기 창에 보여 주는 최근 기록 수 */
export const MEGA_SHOW = 20;
/** 같은 계정이 다시 외칠 수 있는 간격 */
export const MEGAPHONE_COOLDOWN_MS = 30_000;

/** 저장 형태: 공개 기록 + 외친 계정 (관리자만 본다) */
export type MegaRecord = MegaphoneEntry & { accountId: string };

export interface MegaphoneStore {
  /** 도배 제한: 간격이 지났으면 지금부터 ms 동안 잡아 두고 0, 아직이면 남은 ms */
  cooldown(accountId: string, ms: number, now: number): Promise<number>;
  /** 잡아 둔 간격을 푼다 (확성기가 없어 실패했을 때) */
  releaseCooldown(accountId: string): Promise<void>;
  push(rec: MegaRecord): Promise<void>;
  /** 최근 기록 (최신 먼저, 숨김 포함 + hidden 표시) */
  recent(limit: number): Promise<(MegaRecord & { hidden: boolean })[]>;
  /** 숨기기·다시 보이기. 기록에 없는 id면 false */
  setHidden(id: string, hidden: boolean): Promise<boolean>;
}

export class MemoryMegaphone implements MegaphoneStore {
  private log: MegaRecord[] = [];
  private hidden = new Set<string>();
  private cool = new Map<string, number>();

  async cooldown(accountId: string, ms: number, now: number): Promise<number> {
    const until = this.cool.get(accountId) ?? 0;
    if (until > now) return until - now;
    this.cool.set(accountId, now + ms);
    return 0;
  }
  async releaseCooldown(accountId: string): Promise<void> {
    this.cool.delete(accountId);
  }
  async push(rec: MegaRecord): Promise<void> {
    this.log = [rec, ...this.log].slice(0, MEGA_KEEP);
  }
  async recent(limit: number): Promise<(MegaRecord & { hidden: boolean })[]> {
    return this.log.slice(0, limit).map((r) => ({ ...r, hidden: this.hidden.has(r.id) }));
  }
  async setHidden(id: string, hidden: boolean): Promise<boolean> {
    if (!this.log.some((r) => r.id === id)) return false;
    if (hidden) this.hidden.add(id);
    else this.hidden.delete(id);
    return true;
  }
}

export class RedisMegaphone implements MegaphoneStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async cooldown(accountId: string, ms: number): Promise<number> {
    const key = K.megaCool(accountId);
    if ((await this.redis.set(key, "1", { nx: true, px: ms })) !== null) return 0;
    return Math.max(1, Number(await this.redis.pttl(key)));
  }
  async releaseCooldown(accountId: string): Promise<void> {
    await this.redis.del(K.megaCool(accountId));
  }
  async push(rec: MegaRecord): Promise<void> {
    await this.redis.multi().lpush(K.megaLog, JSON.stringify(rec)).ltrim(K.megaLog, 0, MEGA_KEEP - 1).exec();
  }
  async recent(limit: number): Promise<(MegaRecord & { hidden: boolean })[]> {
    const [rows, hidden] = await this.redis.pipeline().lrange(K.megaLog, 0, limit - 1).smembers(K.megaHidden).exec<[string[], string[]]>();
    const h = new Set(hidden);
    return rows.map((raw) => {
      const r = JSON.parse(raw) as MegaRecord;
      return { ...r, hidden: h.has(r.id) };
    });
  }
  async setHidden(id: string, hidden: boolean): Promise<boolean> {
    const rows = await this.redis.lrange(K.megaLog, 0, MEGA_KEEP - 1);
    if (!rows.some((raw) => (JSON.parse(raw) as MegaRecord).id === id)) return false;
    // 기록에서 밀려난 id는 숨김 집합에서도 정리한다 (집합이 끝없이 커지지 않게)
    const live = new Set(rows.map((raw) => (JSON.parse(raw) as MegaRecord).id));
    const stale = ((await this.redis.smembers(K.megaHidden)) as string[]).filter((x) => !live.has(x));
    const p = this.redis.multi();
    if (hidden) p.sadd(K.megaHidden, id);
    else p.srem(K.megaHidden, id);
    if (stale.length) p.srem(K.megaHidden, ...stale);
    await p.exec();
    return true;
  }
}
