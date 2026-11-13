import { Redis } from "@upstash/redis";
import { env } from "../env";
import { normalizeResidentSettings, RESIDENTS_DEFAULT, type ResidentSettings } from "../residents";

// 돌아다니는 마을 주민 설정 저장소 (관리자가 켜기/끄기·주민 수를 정한다). 운영자 계정(lib/store/staff)처럼 값 하나.
// Redis 키: admin:residents  STRING JSON {enabled, count}. 없으면 기본값(켜기·12명)

export const RESIDENTS_KEY = "admin:residents";

export interface ResidentSettingsStore {
  get(): Promise<ResidentSettings>;
  set(s: ResidentSettings): Promise<ResidentSettings>;
}

export class MemoryResidentSettings implements ResidentSettingsStore {
  private cur: ResidentSettings = { ...RESIDENTS_DEFAULT };
  async get(): Promise<ResidentSettings> {
    return { ...this.cur };
  }
  async set(s: ResidentSettings): Promise<ResidentSettings> {
    this.cur = normalizeResidentSettings(s);
    return { ...this.cur };
  }
}

export class RedisResidentSettings implements ResidentSettingsStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async get(): Promise<ResidentSettings> {
    const raw = await this.redis.get<string>(RESIDENTS_KEY);
    if (!raw) return { ...RESIDENTS_DEFAULT };
    try {
      return normalizeResidentSettings(JSON.parse(raw));
    } catch {
      return { ...RESIDENTS_DEFAULT };
    }
  }
  async set(s: ResidentSettings): Promise<ResidentSettings> {
    const v = normalizeResidentSettings(s);
    await this.redis.set(RESIDENTS_KEY, JSON.stringify(v));
    return v;
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 값이 날아가지 않게 globalThis에 둔다
const g = globalThis as typeof globalThis & {
  __tombResidents?: ResidentSettingsStore;
};

/** Redis 환경변수가 있으면 Redis, 없으면 (로컬) 메모리 */
export function getResidentSettings(): ResidentSettingsStore {
  const cur = g.__tombResidents;
  const conn = env.redis();
  if (conn) return cur instanceof RedisResidentSettings ? cur : (g.__tombResidents = new RedisResidentSettings(conn));
  if (cur instanceof MemoryResidentSettings) return cur;
  return (g.__tombResidents = cur ? Object.assign(new MemoryResidentSettings(), cur) : new MemoryResidentSettings());
}
