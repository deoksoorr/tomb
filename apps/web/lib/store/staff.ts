import { Redis } from "@upstash/redis";
import { K } from "./keys";
import type { AccountStore } from "./types";

// 31번 운영자(슈퍼) 계정 저장소. 운영자는 한 명(계정 하나)이고, 관리자 화면(관리자 키 + 관리자 IP)에서만 지정·해제한다.
// Redis 키: admin:staff  STRING JSON {accountId, setAt}
// 운영자 잔액 채우기는 계정 해시(acct:{id})의 points만 바꾼다 — 적립이 아니라 모은 포인트·랭킹·경제 통계에 남지 않는다.

export const STAFF_KEY = "admin:staff";

/** name = 지정할 때의 닉네임 (처리 기록의 처리자 이름용) */
export type StaffRecord = { accountId: string; setAt: number; name?: string | null };

export interface StaffStore {
  get(): Promise<StaffRecord | null>;
  /** null이면 해제 */
  set(rec: StaffRecord | null): Promise<void>;
  /** 잔액을 to까지 채운다 (이미 그 이상이면 그대로). 없는 계정이면 false. 메모리는 accounts(MemoryAccounts)를 바꾼다 */
  fill(accounts: AccountStore, accountId: string, to: number): Promise<boolean>;
}

export class MemoryStaff implements StaffStore {
  private rec: StaffRecord | null = null;
  async get(): Promise<StaffRecord | null> {
    return this.rec;
  }
  async set(rec: StaffRecord | null): Promise<void> {
    this.rec = rec;
  }
  async fill(accounts: AccountStore, accountId: string, to: number): Promise<boolean> {
    const mem = accounts as AccountStore & { staffFill?: (id: string, to: number) => boolean };
    return mem.staffFill?.(accountId, to) ?? false;
  }
}

// KEYS: acct:{id}  ARGV: 채울 잔액. 없는 계정이면 -1
const FILL_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local p = tonumber(redis.call('HGET', KEYS[1], 'points') or '0')
if p < tonumber(ARGV[1]) then redis.call('HSET', KEYS[1], 'points', ARGV[1]) end
return 1
`;

export class RedisStaff implements StaffStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async get(): Promise<StaffRecord | null> {
    const raw = await this.redis.get<string>(STAFF_KEY);
    if (!raw) return null;
    try {
      const r = JSON.parse(raw) as StaffRecord;
      return typeof r.accountId === "string" ? r : null;
    } catch {
      return null;
    }
  }
  async set(rec: StaffRecord | null): Promise<void> {
    if (rec) await this.redis.set(STAFF_KEY, JSON.stringify(rec));
    else await this.redis.del(STAFF_KEY);
  }
  async fill(_accounts: AccountStore, accountId: string, to: number): Promise<boolean> {
    return Number(await this.redis.eval(FILL_LUA, [K.acct(accountId)], [String(to)])) === 1;
  }
}
