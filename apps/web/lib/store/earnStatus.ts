import { Redis } from "@upstash/redis";
import { nameKey } from "@tomb/protocol";
import type { EarnSource } from "../economy";
import { earnedBySource } from "../earnGauge";
import { env } from "../env";
import { K } from "./keys";
import type { AccountStore } from "./types";

// 운영자 「포인트 현황」 읽기 (app/api/staff/earn). 계정 저장소의 키를 그대로 읽기만 한다.
//  - 이름 → 계정: 닉네임 색인(names 해시) HMGET 한 번 (지금 채널 사람들은 화면이 이름만 안다)
//  - 계정마다 이름·오늘 적립 해시: Lua 한 번에 (명령 수를 사람 수만큼 늘리지 않게)

/** 한 계정의 오늘 적립 (total = 하루 합계 `_total`, by = 항목별) */
export type EarnToday = { name: string | null; total: number; by: Partial<Record<EarnSource, number>> };

export interface EarnStatusStore {
  /** 이름들(비교 키 nameKey)의 지금 주인 계정 (names 순서대로, 없으면 null) */
  owners(names: readonly string[]): Promise<(string | null)[]>;
  /** 계정마다 이름·오늘 적립 (ids 순서대로) */
  today(ids: readonly string[], day: string): Promise<EarnToday[]>;
}

// KEYS: [acct, earn] 쌍. 계정마다 { 이름, 오늘 적립 해시(평평한 배열) }
const TODAY_LUA = `
local out = {}
for i = 1, #KEYS, 2 do
  out[#out + 1] = { redis.call('HGET', KEYS[i], 'name') or '', redis.call('HGETALL', KEYS[i + 1]) }
end
return out
`;

function hashPairs(flat: unknown): [string, string][] {
  const a = Array.isArray(flat) ? flat : [];
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push([String(a[i]), String(a[i + 1])]);
  return out;
}

export class RedisEarnStatus implements EarnStatusStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async owners(names: readonly string[]): Promise<(string | null)[]> {
    if (!names.length) return [];
    const v = (await this.redis.hmget(K.names, ...names.map(nameKey))) as unknown;
    // 응답 모양이 배열이든 { 필드: 값 }이든 이름 순서대로 맞춘다
    const vals = Array.isArray(v) ? v : names.map((n) => (v as Record<string, unknown> | null)?.[nameKey(n)] ?? null);
    return names.map((_, i) => (vals[i] ? String(vals[i]) : null));
  }
  async today(ids: readonly string[], day: string): Promise<EarnToday[]> {
    if (!ids.length) return [];
    const res = (await this.redis.eval(TODAY_LUA, ids.flatMap((id) => [K.acct(id), K.earn(id, day)]), [])) as unknown;
    const rows = Array.isArray(res) ? res : [];
    return ids.map((_, i) => {
      const [name, flat] = (Array.isArray(rows[i]) ? rows[i] : []) as [unknown, unknown];
      const pairs = hashPairs(flat);
      const total = Math.floor(Number(pairs.find(([k]) => k === "_total")?.[1] ?? 0)) || 0;
      return { name: name ? String(name) : null, total, by: earnedBySource(pairs) };
    });
  }
}

/** 로컬·테스트: 계정 저장소(MemoryAccounts)의 공개 메서드로 같은 값을 읽는다 */
export class MemoryEarnStatus implements EarnStatusStore {
  constructor(public accounts: () => AccountStore) {}
  async owners(names: readonly string[]): Promise<(string | null)[]> {
    const now = Date.now();
    return Promise.all(names.map((n) => this.accounts().nameOwner(nameKey(n), now)));
  }
  async today(ids: readonly string[], day: string): Promise<EarnToday[]> {
    const now = Date.now();
    return Promise.all(
      ids.map(async (id) => {
        const a = await this.accounts().get(id, day, now);
        return { name: a.name, total: a.todayEarned, by: a.earnedBy };
      }),
    );
  }
}

const g = globalThis as typeof globalThis & { __tombEarnStatus?: EarnStatusStore };

export function getEarnStatusStore(accounts: AccountStore): EarnStatusStore {
  const cur = g.__tombEarnStatus;
  const conn = env.redis();
  if (conn) return cur instanceof RedisEarnStatus ? cur : (g.__tombEarnStatus = new RedisEarnStatus(conn));
  const mem = cur instanceof MemoryEarnStatus ? cur : (g.__tombEarnStatus = new MemoryEarnStatus(() => accounts));
  mem.accounts = () => accounts;
  return mem;
}
