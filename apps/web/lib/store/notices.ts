import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import type { Notice, NoticeDoc } from "../types";

// 공지사항. 관리자만 쓰고 수가 적으므로 HASH 하나(`notices`: id → JSON)에 두고 읽을 때 정렬한다.
// 11/20 개발자 노트 편집기로 쓴 글의 꼭지·맺음말(NoticeDoc)은 STRING `notice:doc:<id>`에 따로 둔다:
// 게임이 10분마다 받는 공지 목록(HGETALL 한 번)에 무거운 본문이 실리지 않고, 글 보기에서만 GET 한 번으로 읽는다.

const NOTICES_KEY = "notices";
const docKey = (id: string) => `notice:doc:${id}`;
/** 공개 목록에 내보내는 최대 개수 */
export const NOTICE_LIST_MAX = 20;

export interface NoticeStore {
  /** 전체 (고정 먼저, 최신 순) */
  list(): Promise<Notice[]>;
  get(id: string): Promise<Notice | null>;
  put(notice: Notice): Promise<void>;
  /** 없으면 false (본문도 같이 지운다) */
  remove(id: string): Promise<boolean>;
  /** 개발자 노트 본문 (없으면 null) */
  getDoc(id: string): Promise<NoticeDoc | null>;
  /** 개발자 노트 본문 저장. null이면 지운다 */
  putDoc(id: string, doc: NoticeDoc | null): Promise<void>;
}

/** 고정 먼저, 그 안에서 최신 순 */
export const byPinnedThenNewest = (a: Notice, b: Notice) =>
  Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt || a.id.localeCompare(b.id);

export class MemoryNotices implements NoticeStore {
  private notices = new Map<string, Notice>();
  private docs = new Map<string, NoticeDoc>();

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
    this.docs.delete(id);
    return this.notices.delete(id);
  }
  async getDoc(id: string): Promise<NoticeDoc | null> {
    const doc = this.docs.get(id);
    return doc ? structuredClone(doc) : null;
  }
  async putDoc(id: string, doc: NoticeDoc | null): Promise<void> {
    if (doc) this.docs.set(id, structuredClone(doc));
    else this.docs.delete(id);
  }
}

export class RedisNotices implements NoticeStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "notices");
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
    const [removed] = await Promise.all([this.redis.hdel(NOTICES_KEY, id), this.redis.del(docKey(id))]);
    return Number(removed) === 1;
  }
  async getDoc(id: string): Promise<NoticeDoc | null> {
    const raw = await this.redis.get<string>(docKey(id));
    return raw ? (JSON.parse(raw) as NoticeDoc) : null;
  }
  async putDoc(id: string, doc: NoticeDoc | null): Promise<void> {
    if (doc) await this.redis.set(docKey(id), JSON.stringify(doc));
    else await this.redis.del(docKey(id));
  }
}
