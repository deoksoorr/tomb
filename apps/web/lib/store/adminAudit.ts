import { Redis } from "@upstash/redis";
import { env } from "../env";

// 관리자 감사 기록: 되돌릴 수 없는 계정 작업(지금은 접속 코드 재발급)을 누가·언제·누구에게 했는지 남긴다.
// 새 코드 원문은 절대 적지 않는다. Redis 키: admin:audit  LIST JSON, 최신 먼저 최대 AUDIT_KEEP개

export const AUDIT_KEY = "admin:audit";
export const AUDIT_KEEP = 200;

export type AdminAuditAction = "codeReissue";
export type AdminAuditEntry = {
  at: number;
  /** 처리자 (lib/ban.ts adminActor — "관리자" 또는 "관리자(닉네임)") */
  by: string;
  action: AdminAuditAction;
  accountId: string;
  /** 그때 대상 닉네임 */
  name: string | null;
};

export interface AdminAuditStore {
  push(entry: AdminAuditEntry): Promise<void>;
  /** 최신 먼저 limit개 */
  recent(limit: number): Promise<AdminAuditEntry[]>;
}

export class MemoryAdminAudit implements AdminAuditStore {
  private rows: AdminAuditEntry[] = [];
  async push(entry: AdminAuditEntry): Promise<void> {
    this.rows = [entry, ...this.rows].slice(0, AUDIT_KEEP);
  }
  async recent(limit: number): Promise<AdminAuditEntry[]> {
    return this.rows.slice(0, limit);
  }
}

export class RedisAdminAudit implements AdminAuditStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async push(entry: AdminAuditEntry): Promise<void> {
    await this.redis
      .pipeline()
      .lpush(AUDIT_KEY, JSON.stringify(entry))
      .ltrim(AUDIT_KEY, 0, AUDIT_KEEP - 1)
      .exec();
  }
  async recent(limit: number): Promise<AdminAuditEntry[]> {
    const raw = await this.redis.lrange<string>(AUDIT_KEY, 0, limit - 1);
    return raw.flatMap((r) => {
      try {
        return [JSON.parse(r) as AdminAuditEntry];
      } catch {
        return [];
      }
    });
  }
}

const g = globalThis as typeof globalThis & {
  __tombAdminAudit?: AdminAuditStore;
};

/** 계정 저장소와 같은 백엔드 (Redis가 있으면 Redis, 없으면 메모리) */
export function getAdminAudit(): AdminAuditStore {
  const cur = g.__tombAdminAudit;
  const conn = env.redis();
  if (conn) return cur instanceof RedisAdminAudit ? cur : (g.__tombAdminAudit = new RedisAdminAudit(conn));
  if (cur instanceof MemoryAdminAudit) return cur;
  return (g.__tombAdminAudit = cur ? Object.assign(new MemoryAdminAudit(), cur) : new MemoryAdminAudit());
}
