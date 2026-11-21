import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";
import type { InquiryCategory, InquirySource } from "../types";

// 문의함: 유저가 [문의하기]로 보낸 문의를 우리 저장소에 남기고 관리자 문의 탭에서 읽는다 (GitHub 이슈는 덤으로 보낸다).
// 최근 INQUIRY_KEEP개만 두고 오래된 것부터 지운다. 처리 여부·관리자 메모는 원본 JSON과 따로 둬서 고칠 때 원본을 다시 쓰지 않는다.
//
// Redis 키 (이 파일에서만 쓴다)
//  - inq:rec  HASH 문의 id → 원본 JSON (처리 여부·메모 빼고)
//  - inq:all  ZSET 문의 id → 보낸 시각 (최신 순 목록, 넘치면 오래된 것부터 지운다)
//  - inq:new  ZSET 문의 id → 보낸 시각 (아직 처리 안 한 것. 빠지면 처리됨)
//  - inq:memo HASH 문의 id → 관리자 메모
//  - inq:done HASH 문의 id → 처리한 시각

export const INQUIRY_KEEP = 500;
export const INQUIRY_MEMO_MAX = 500;

export type InquiryStatus = "new" | "done";
export type InquiryRecord = {
  id: string;
  at: number;
  /** 11/20 null이면 게임에 들어오지 않고 개발자 노트에서 보낸 손님 (연락처 필수) */
  accountId: string | null;
  /** 보낼 때의 닉네임 (없으면 이름 없는 계정) */
  name: string | null;
  category: InquiryCategory;
  message: string;
  contact?: string;
  channel?: number;
  userAgent: string | null;
  /** 11/20 보낸 곳 (없으면 게임 안 문의 창) */
  source?: InquirySource;
};
export type InquiryRow = InquiryRecord & { status: InquiryStatus; memo?: string; doneAt?: number };
export type InquiryPatch = { status?: InquiryStatus; memo?: string };

export interface InquiryStore {
  /** 문의 하나 저장. INQUIRY_KEEP개를 넘으면 오래된 것부터 지운다 */
  add(rec: InquiryRecord): Promise<void>;
  /** 최신 순. status를 주면 그 상태만 */
  list(opts?: { status?: InquiryStatus; limit?: number }): Promise<InquiryRow[]>;
  /** 처리 여부·메모 바꾸기 (빈 메모는 지운다). 없는 문의면 null */
  update(id: string, patch: InquiryPatch, now?: number): Promise<InquiryRow | null>;
  /** 아직 처리 안 한 문의 수 (메뉴 배지) */
  newCount(): Promise<number>;
}

// ── 메모리 ──

export class MemoryInquiries implements InquiryStore {
  /** 최신 먼저 */
  private rows: InquiryRow[] = [];

  async add(rec: InquiryRecord): Promise<void> {
    this.rows = [{ ...rec, status: "new" as const }, ...this.rows].sort((a, b) => b.at - a.at).slice(0, INQUIRY_KEEP);
  }
  async list(opts: { status?: InquiryStatus; limit?: number } = {}): Promise<InquiryRow[]> {
    return this.rows
      .filter((r) => !opts.status || r.status === opts.status)
      .slice(0, opts.limit ?? INQUIRY_KEEP)
      .map((r) => ({ ...r }));
  }
  async update(id: string, patch: InquiryPatch, now = Date.now()): Promise<InquiryRow | null> {
    const r = this.rows.find((x) => x.id === id);
    if (!r) return null;
    if (patch.status === "done" && r.status !== "done") Object.assign(r, { status: "done", doneAt: now });
    if (patch.status === "new") {
      r.status = "new";
      delete r.doneAt;
    }
    if (patch.memo !== undefined) {
      if (patch.memo) r.memo = patch.memo;
      else delete r.memo;
    }
    return { ...r };
  }
  async newCount(): Promise<number> {
    return this.rows.filter((r) => r.status === "new").length;
  }
}

// ── Redis ── 쓰기는 문의(하루 3번 제한)와 관리자뿐이라 Lua 없이 MULTI로 묶는다

const RK = { rec: "inq:rec", all: "inq:all", fresh: "inq:new", memo: "inq:memo", done: "inq:done" };

/** automaticDeserialization: false면 HMGET은 필드 순서 배열을 준다 */
function hmgetValues(got: unknown, fields: string[]): (string | null)[] {
  if (Array.isArray(got)) return fields.map((_, i) => (got[i] as string | null) ?? null);
  const o = (got ?? {}) as Record<string, string | null>;
  return fields.map((f) => o[f] ?? null);
}

export class RedisInquiries implements InquiryStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "inquiries");
  }

  async add(rec: InquiryRecord): Promise<void> {
    await this.redis
      .multi()
      .hset(RK.rec, { [rec.id]: JSON.stringify(rec) })
      .zadd(RK.all, { score: rec.at, member: rec.id })
      .zadd(RK.fresh, { score: rec.at, member: rec.id })
      .exec();
    // 넘친 만큼 오래된 것부터 지운다 (처리 여부와 상관없이)
    const extra = (await this.redis.zrange(RK.all, 0, -(INQUIRY_KEEP + 1))) as string[];
    if (!extra.length) return;
    await this.redis
      .multi()
      .zrem(RK.all, ...extra)
      .zrem(RK.fresh, ...extra)
      .hdel(RK.rec, ...extra)
      .hdel(RK.memo, ...extra)
      .hdel(RK.done, ...extra)
      .exec();
  }

  private async load(ids: string[], fresh: Set<string>): Promise<InquiryRow[]> {
    if (!ids.length) return [];
    const [recs, memos, dones] = (await this.redis.pipeline().hmget(RK.rec, ...ids).hmget(RK.memo, ...ids).hmget(RK.done, ...ids).exec()).map((v) =>
      hmgetValues(v, ids),
    );
    const rows: InquiryRow[] = [];
    ids.forEach((id, i) => {
      if (!recs[i]) return;
      const row: InquiryRow = { ...(JSON.parse(recs[i]!) as InquiryRecord), status: fresh.has(id) ? "new" : "done" };
      if (memos[i]) row.memo = memos[i]!;
      if (row.status === "done" && dones[i]) row.doneAt = Number(dones[i]);
      rows.push(row);
    });
    return rows;
  }

  async list(opts: { status?: InquiryStatus; limit?: number } = {}): Promise<InquiryRow[]> {
    const limit = opts.limit ?? INQUIRY_KEEP;
    // 처리 안 한 것만이면 inq:new에서 바로, 아니면 전체(최대 INQUIRY_KEEP개 id)에서 거른다
    if (opts.status === "new") {
      const ids = (await this.redis.zrange(RK.fresh, 0, limit - 1, { rev: true })) as string[];
      return this.load(ids, new Set(ids));
    }
    const [all, fresh] = (await this.redis.pipeline().zrange(RK.all, 0, -1, { rev: true }).zrange(RK.fresh, 0, -1).exec()) as [string[], string[]];
    const f = new Set(fresh);
    const ids = (opts.status === "done" ? all.filter((id) => !f.has(id)) : all).slice(0, limit);
    return this.load(ids, f);
  }

  async update(id: string, patch: InquiryPatch, now = Date.now()): Promise<InquiryRow | null> {
    const [raw, score] = await this.redis.pipeline().hget(RK.rec, id).zscore(RK.fresh, id).exec<[string | null, string | null]>();
    if (!raw) return null;
    const rec = JSON.parse(raw) as InquiryRecord;
    const m = this.redis.multi();
    // 바꿀 게 없으면(이미 그 상태) 빈 MULTI를 보내지 않는다
    let dirty = false;
    if (patch.status === "new" && score === null) {
      m.zadd(RK.fresh, { score: rec.at, member: id }).hdel(RK.done, id);
      dirty = true;
    }
    // 이미 처리한 문의를 다시 처리해도 처음 처리한 시각을 남긴다
    if (patch.status === "done" && score !== null) {
      m.zrem(RK.fresh, id).hset(RK.done, { [id]: String(now) });
      dirty = true;
    }
    if (patch.memo !== undefined) {
      if (patch.memo) m.hset(RK.memo, { [id]: patch.memo });
      else m.hdel(RK.memo, id);
      dirty = true;
    }
    if (dirty) await m.exec();
    const fresh = patch.status ? patch.status === "new" : score !== null;
    const [row] = await this.load([id], fresh ? new Set([id]) : new Set());
    return row ?? null;
  }

  async newCount(): Promise<number> {
    return Number(await this.redis.zcard(RK.fresh));
  }
}

const g = globalThis as typeof globalThis & { __tombInquiries?: InquiryStore };

/** 문의함 (묘비 저장소와 같은 백엔드). HMR로 다시 로드돼도 로컬 문의를 잃지 않게 globalThis에 둔다 */
export function getInquiries(): InquiryStore {
  const cur = g.__tombInquiries;
  const conn = env.redis();
  if (conn) return cur instanceof RedisInquiries ? cur : (g.__tombInquiries = new RedisInquiries(conn));
  if (env.isProd()) throw new Error("[inquiries] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryInquiries) return cur;
  g.__tombInquiries = cur ? Object.assign(new MemoryInquiries(), cur) : new MemoryInquiries();
  return g.__tombInquiries;
}
