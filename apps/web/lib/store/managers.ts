import { Redis } from "@upstash/redis";

// 11/16 매니저 저장소. 관리자 화면(관리자 키 + 관리자 IP)에서만 임명·해제한다. 혜택은 매니저 전용 칭호·오라뿐 (운영자 권한은 없다).
// Redis 키: admin:managers  HASH 계정 id → JSON {setAt, name}  (임명한 사람 수만큼, 상한 MANAGER_MAX)

export const MANAGERS_KEY = "admin:managers";

/** name = 임명할 때의 닉네임 (관리자 화면 표시용 — 지금 닉네임은 화면이 계정에서 다시 읽는다) */
export type ManagerRecord = { accountId: string; setAt: number; name: string | null };

export interface ManagerStore {
  /** 지금 매니저 전부 (임명한 순서) */
  list(): Promise<ManagerRecord[]>;
  /** 임명. 이미 매니저면 false (임명 시각은 그대로) */
  add(rec: ManagerRecord): Promise<boolean>;
  /** 해제. 매니저가 아니었으면 false */
  remove(accountId: string): Promise<boolean>;
}

const byTime = (a: ManagerRecord, b: ManagerRecord) => a.setAt - b.setAt || a.accountId.localeCompare(b.accountId);

export class MemoryManagers implements ManagerStore {
  private map = new Map<string, ManagerRecord>();
  async list(): Promise<ManagerRecord[]> {
    return [...this.map.values()].sort(byTime);
  }
  async add(rec: ManagerRecord): Promise<boolean> {
    if (this.map.has(rec.accountId)) return false;
    this.map.set(rec.accountId, { ...rec });
    return true;
  }
  async remove(accountId: string): Promise<boolean> {
    return this.map.delete(accountId);
  }
}

function parse(accountId: string, raw: unknown): ManagerRecord | null {
  try {
    const r = (typeof raw === "string" ? JSON.parse(raw) : raw) as { setAt?: unknown; name?: unknown };
    return { accountId, setAt: Number(r?.setAt) || 0, name: typeof r?.name === "string" ? r.name : null };
  } catch {
    return { accountId, setAt: 0, name: null };
  }
}

export class RedisManagers implements ManagerStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async list(): Promise<ManagerRecord[]> {
    const raw = (await this.redis.hgetall(MANAGERS_KEY)) as unknown;
    const out: ManagerRecord[] = [];
    if (Array.isArray(raw)) {
      for (let i = 0; i + 1 < raw.length; i += 2) {
        const r = parse(String(raw[i]), raw[i + 1]);
        if (r) out.push(r);
      }
    } else if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        const r = parse(k, v);
        if (r) out.push(r);
      }
    }
    return out.sort(byTime);
  }
  async add(rec: ManagerRecord): Promise<boolean> {
    return Number(await this.redis.hsetnx(MANAGERS_KEY, rec.accountId, JSON.stringify({ setAt: rec.setAt, name: rec.name }))) === 1;
  }
  async remove(accountId: string): Promise<boolean> {
    return Number(await this.redis.hdel(MANAGERS_KEY, accountId)) > 0;
  }
}
