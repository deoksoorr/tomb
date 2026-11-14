import { Redis } from "@upstash/redis";
import { env } from "../env";

// 관리자 감사 기록: 되돌릴 수 없는 계정 작업(지금은 접속 코드 재발급)을 누가·언제·누구에게 했는지 남긴다.
// 새 코드 원문은 절대 적지 않는다. Redis 키: admin:audit  LIST JSON, 최신 먼저 최대 AUDIT_KEEP개

export const AUDIT_KEY = "admin:audit";
export const AUDIT_KEEP = 200;

/** codeReissue = 관리자 코드 재발급, googleLink·googleUnlink = 본인의 구글 연결·끊기 (따로 쌓는다 — getGoogleAudit) */
export type AdminAuditAction = "codeReissue" | "googleLink" | "googleUnlink";
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
  constructor(private keep = AUDIT_KEEP) {}
  async push(entry: AdminAuditEntry): Promise<void> {
    this.rows = [entry, ...this.rows].slice(0, this.keep);
  }
  async recent(limit: number): Promise<AdminAuditEntry[]> {
    return this.rows.slice(0, limit);
  }
}

export class RedisAdminAudit implements AdminAuditStore {
  private redis: Redis;
  constructor(
    conn: { url: string; token: string },
    private key = AUDIT_KEY,
    private keep = AUDIT_KEEP,
  ) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async push(entry: AdminAuditEntry): Promise<void> {
    await this.redis
      .pipeline()
      .lpush(this.key, JSON.stringify(entry))
      .ltrim(this.key, 0, this.keep - 1)
      .exec();
  }
  async recent(limit: number): Promise<AdminAuditEntry[]> {
    const raw = await this.redis.lrange<string>(this.key, 0, limit - 1);
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
  __tombGoogleAudit?: AdminAuditStore;
};

/** 계정 저장소와 같은 백엔드 (Redis가 있으면 Redis, 없으면 메모리) */
export function getAdminAudit(): AdminAuditStore {
  const cur = g.__tombAdminAudit;
  const conn = env.redis();
  if (conn) return cur instanceof RedisAdminAudit ? cur : (g.__tombAdminAudit = new RedisAdminAudit(conn));
  if (cur instanceof MemoryAdminAudit) return cur;
  return (g.__tombAdminAudit = cur ? Object.assign(new MemoryAdminAudit(), cur) : new MemoryAdminAudit());
}

// 구글 연결·끊기 기록: 같은 형식이지만 키를 따로 둔다 — 누구나 하는 일이라 한 목록에 섞으면 관리자 재발급 기록을 밀어낸다.
// Redis 키: google:audit  LIST JSON, 최신 먼저 최대 GOOGLE_AUDIT_KEEP개 (구글 고유 번호·해시는 적지 않는다)
export const GOOGLE_AUDIT_KEY = "google:audit";
export const GOOGLE_AUDIT_KEEP = 500;

export function getGoogleAudit(): AdminAuditStore {
  const cur = g.__tombGoogleAudit;
  const conn = env.redis();
  if (conn) return cur instanceof RedisAdminAudit ? cur : (g.__tombGoogleAudit = new RedisAdminAudit(conn, GOOGLE_AUDIT_KEY, GOOGLE_AUDIT_KEEP));
  if (cur instanceof MemoryAdminAudit) return cur;
  return (g.__tombGoogleAudit = cur ? Object.assign(new MemoryAdminAudit(GOOGLE_AUDIT_KEEP), cur) : new MemoryAdminAudit(GOOGLE_AUDIT_KEEP));
}
