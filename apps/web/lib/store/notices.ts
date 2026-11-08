import { Redis } from "@upstash/redis";
import type { Notice } from "../types";

// 공지사항. 관리자만 쓰고 수가 적으므로 HASH 하나(`notices`: id → JSON)에 두고 읽을 때 정렬한다.

const NOTICES_KEY = "notices";
/** 공개 목록에 내보내는 최대 개수 */
export const NOTICE_LIST_MAX = 20;

export interface NoticeStore {
  /** 전체 (고정 먼저, 최신 순) */
  list(): Promise<Notice[]>;
  get(id: string): Promise<Notice | null>;
  put(notice: Notice): Promise<void>;
  /** 없으면 false */
  remove(id: string): Promise<boolean>;
}

/** 고정 먼저, 그 안에서 최신 순 */
export const byPinnedThenNewest = (a: Notice, b: Notice) =>
  Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt || a.id.localeCompare(b.id);

export class MemoryNotices implements NoticeStore {
  private notices = new Map<string, Notice>();

  async list(): Promise<Notice[]> {
    return [...this.notices.values()].sort(byPinnedThenNewest);
  }
  async get(id: string): Promise<Notice | null> {
    return this.notices.get(id) ?? null;
  }
  async put(notice: Notice): Promise<void> {
    this.notices.set(notice.id, { ...notice });
  }
  async remove(id: string): Promise<boolean> {
    return this.notices.delete(id);
  }
}

export class RedisNotices implements NoticeStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async list(): Promise<Notice[]> {
    const flat = (await this.redis.hgetall<Record<string, string>>(NOTICES_KEY)) as unknown as string[] | null;
    const out: Notice[] = [];
    for (let i = 1; flat && i < flat.length; i += 2) out.push(JSON.parse(flat[i]) as Notice);
    return out.sort(byPinnedThenNewest);
  }
  async get(id: string): Promise<Notice | null> {
    const raw = await this.redis.hget<string>(NOTICES_KEY, id);
    return raw ? (JSON.parse(raw) as Notice) : null;
  }
  async put(notice: Notice): Promise<void> {
    await this.redis.hset(NOTICES_KEY, { [notice.id]: JSON.stringify(notice) });
  }
  async remove(id: string): Promise<boolean> {
    return Number(await this.redis.hdel(NOTICES_KEY, id)) === 1;
  }
}
