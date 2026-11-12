import { Redis } from "@upstash/redis";
import { env } from "../env";
import type { UserReportReason } from "../reports";

// 47번 신고함: 유저(닉네임 포함)·확성기 신고를 모으고, 신고 탭에서 처리한 결과(묘비·방명록 포함)를 "처리됨"으로 남긴다.
// 묘비·방명록 신고 자체는 원래 저장소(grave:{id}:reports, 하우징 guestReports)에 그대로 두고 신고 탭이 함께 읽는다.
//
// 사건 키 = `${type}:${대상 id}` (방명록은 `guestbook:{집 id}/{글 id}`)
// Redis 키 (이 파일에서만 쓴다)
//  - rpt:open  ZSET 사건 키 → 마지막 신고 시각 (대기)
//  - rpt:done  ZSET 사건 키 → 처리 시각 (최근 DONE_KEEP개, 밀려나면 아래 키도 지운다)
//  - rpt:meta  HASH 사건 키 → CaseMeta JSON (대상 미리보기, 마지막 신고 때 값)
//  - rpt:first HASH 사건 키 → 처음 신고 시각
//  - rpt:last  HASH 사건 키 → 마지막 신고 시각
//  - rpt:n     HASH 사건 키 → 누적 신고 횟수
//  - rpt:res   HASH 사건 키 → Resolution JSON (처리 결과, 다시 신고되면 지운다)
//  - rpt:by:{사건 키}   SET 신고한 계정 (신고자 수)
//  - rpt:log:{사건 키}  LIST 신고 메모 JSON, 최신 먼저 NOTES_KEEP개
//  - rpt:day:{YYYYMMDD}:{신고자}:{사건 키}  STRING NX EX 2일 — 같은 사람을 하루 한 번만

export { REPORT_MEMO_MAX, USER_REPORT_REASON_LABELS, USER_REPORT_REASONS, type UserReportReason } from "../reports";

export type CaseType = "user" | "megaphone" | "grave" | "guestbook";
export type CaseMeta = {
  type: CaseType;
  targetId: string;
  /** 대상(글쓴이·닉네임 주인) 계정. 모르면 null */
  accountId: string | null;
  /** 대상 닉네임 (또는 묘비 이름) */
  name: string;
  /** 미리보기: 확성기 글·방명록 글·묘비 내용·닉네임 */
  preview: string;
  /** 묘비·방명록처럼 원래 저장소가 따로 세는 경우 그쪽 신고자 수 (신고함의 신고자 집합이 없을 때) */
  reporters?: number;
};
export type ReportNote = { at: number; reason: UserReportReason; memo: string; by: string };
export type Resolution = { at: number; by: string; action: string; note?: string };
export type ReportCase = CaseMeta & {
  key: string;
  count: number;
  reporters: number;
  firstAt: number;
  lastAt: number;
  status: "open" | "done";
  resolution: Resolution | null;
  notes: ReportNote[];
};

export const caseKey = (type: CaseType, targetId: string) => `${type}:${targetId}`;
export const NOTES_KEEP = 20;
export const DONE_KEEP = 300;
const DAY_TTL_SEC = 2 * 86_400;

export interface ReportBox {
  /** 신고 하나. 같은 신고자가 그날 이미 이 사건을 신고했으면 "duplicate" (아무것도 바꾸지 않는다). 처리된 사건이면 다시 대기로 */
  add(meta: CaseMeta, note: ReportNote, day: string): Promise<"ok" | "duplicate">;
  /** 대기(최근 신고 순) 또는 처리됨(최근 처리 순) */
  list(status: "open" | "done", limit: number): Promise<ReportCase[]>;
  get(key: string): Promise<ReportCase | null>;
  /**
   * 처리 결과를 남기고 처리됨으로 옮긴다. 신고함에 없는 사건(묘비·방명록)은 snapshot으로 처리 기록을 새로 만든다.
   * 신고함에도 없고 snapshot도 없으면 false
   */
  resolve(key: string, res: Resolution, snapshot?: CaseMeta & { count: number; firstAt: number; lastAt: number }): Promise<boolean>;
  openCount(): Promise<number>;
}

// ── 메모리 ──

type MemCase = { meta: CaseMeta; first: number; last: number; n: number; by: Set<string>; notes: ReportNote[]; res: Resolution | null };

export class MemoryReportBox implements ReportBox {
  private cases = new Map<string, MemCase>();
  private open = new Map<string, number>();
  private done = new Map<string, number>();
  private daily = new Set<string>();

  async add(meta: CaseMeta, note: ReportNote, day: string): Promise<"ok" | "duplicate"> {
    const key = caseKey(meta.type, meta.targetId);
    const mark = `${day}|${note.by}|${key}`;
    if (this.daily.has(mark)) return "duplicate";
    this.daily.add(mark);
    const c = this.cases.get(key) ?? { meta, first: note.at, last: note.at, n: 0, by: new Set<string>(), notes: [], res: null };
    c.meta = meta;
    c.last = note.at;
    c.n++;
    c.by.add(note.by);
    c.notes = [note, ...c.notes].slice(0, NOTES_KEEP);
    c.res = null;
    this.cases.set(key, c);
    this.done.delete(key);
    this.open.set(key, note.at);
    return "ok";
  }
  private view(key: string, status: "open" | "done"): ReportCase | null {
    const c = this.cases.get(key);
    if (!c) return null;
    return {
      ...c.meta,
      key,
      count: c.n,
      reporters: c.by.size || c.meta.reporters || 0,
      firstAt: c.first,
      lastAt: c.last,
      status,
      resolution: c.res,
      notes: [...c.notes],
    };
  }
  async list(status: "open" | "done", limit: number): Promise<ReportCase[]> {
    const z = status === "open" ? this.open : this.done;
    return [...z]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([k]) => this.view(k, status))
      .filter((c): c is ReportCase => !!c);
  }
  async get(key: string): Promise<ReportCase | null> {
    return this.view(key, this.open.has(key) ? "open" : "done");
  }
  async resolve(key: string, res: Resolution, snapshot?: CaseMeta & { count: number; firstAt: number; lastAt: number }): Promise<boolean> {
    let c = this.cases.get(key);
    if (!c) {
      if (!snapshot) return false;
      const { count, firstAt, lastAt, ...meta } = snapshot;
      c = { meta, first: firstAt, last: lastAt, n: count, by: new Set(), notes: [], res: null };
      this.cases.set(key, c);
    }
    c.res = res;
    this.open.delete(key);
    this.done.set(key, res.at);
    if (this.done.size > DONE_KEEP) {
      const oldest = [...this.done].sort((a, b) => a[1] - b[1]).slice(0, this.done.size - DONE_KEEP);
      for (const [k] of oldest) {
        this.done.delete(k);
        if (!this.open.has(k)) this.cases.delete(k);
      }
    }
    return true;
  }
  async openCount(): Promise<number> {
    return this.open.size;
  }
}

// ── Redis ── Lua 없이: 신고는 SET NX(하루 한 번) 뒤 MULTI 한 번, 처리는 관리자만 한다

const RK = {
  open: "rpt:open",
  done: "rpt:done",
  meta: "rpt:meta",
  first: "rpt:first",
  last: "rpt:last",
  n: "rpt:n",
  res: "rpt:res",
  by: (key: string) => `rpt:by:${key}`,
  log: (key: string) => `rpt:log:${key}`,
  day: (day: string, by: string, key: string) => `rpt:day:${day}:${by}:${key}`,
};

/** automaticDeserialization: false면 HMGET은 필드 순서 배열을 준다 */
function hmgetValues(got: unknown, fields: string[]): (string | null)[] {
  if (Array.isArray(got)) return fields.map((_, i) => (got[i] as string | null) ?? null);
  const o = (got ?? {}) as Record<string, string | null>;
  return fields.map((f) => o[f] ?? null);
}

export class RedisReportBox implements ReportBox {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async add(meta: CaseMeta, note: ReportNote, day: string): Promise<"ok" | "duplicate"> {
    const key = caseKey(meta.type, meta.targetId);
    const first = await this.redis.set(RK.day(day, note.by, key), "1", { nx: true, ex: DAY_TTL_SEC });
    if (first === null) return "duplicate";
    await this.redis
      .multi()
      .hset(RK.meta, { [key]: JSON.stringify(meta) })
      .hsetnx(RK.first, key, String(note.at))
      .hset(RK.last, { [key]: String(note.at) })
      .hincrby(RK.n, key, 1)
      .sadd(RK.by(key), note.by)
      .lpush(RK.log(key), JSON.stringify(note))
      .ltrim(RK.log(key), 0, NOTES_KEEP - 1)
      .hdel(RK.res, key)
      .zrem(RK.done, key)
      .zadd(RK.open, { score: note.at, member: key })
      .exec();
    return "ok";
  }

  private async load(keys: string[], status: "open" | "done", scores: Map<string, number>): Promise<ReportCase[]> {
    if (!keys.length) return [];
    const p = this.redis.pipeline().hmget(RK.meta, ...keys).hmget(RK.first, ...keys).hmget(RK.n, ...keys).hmget(RK.res, ...keys).hmget(RK.last, ...keys);
    for (const k of keys) p.scard(RK.by(k)).lrange(RK.log(k), 0, NOTES_KEEP - 1);
    const out = (await p.exec()) as unknown[];
    const [metas, firsts, ns, ress, lasts] = out.slice(0, 5).map((v) => hmgetValues(v, keys));
    const cases: ReportCase[] = [];
    keys.forEach((key, i) => {
      if (!metas[i]) return;
      const meta = JSON.parse(metas[i]!) as CaseMeta;
      const by = Number(out[5 + i * 2] ?? 0);
      const notes = ((out[6 + i * 2] as string[] | null) ?? []).map((raw) => JSON.parse(raw) as ReportNote);
      const res = ress[i] ? (JSON.parse(ress[i]!) as Resolution) : null;
      cases.push({
        ...meta,
        key,
        count: Number(ns[i] ?? 0),
        reporters: by || meta.reporters || 0,
        firstAt: Number(firsts[i] ?? 0),
        lastAt: Number(lasts[i] ?? scores.get(key) ?? 0),
        status,
        resolution: res,
        notes,
      });
    });
    return cases;
  }

  private async range(z: string, limit: number): Promise<Map<string, number>> {
    const raw = (await this.redis.zrange(z, 0, limit - 1, { rev: true, withScores: true })) as string[];
    const m = new Map<string, number>();
    for (let i = 0; i + 1 < raw.length; i += 2) m.set(raw[i], Number(raw[i + 1]));
    return m;
  }

  async list(status: "open" | "done", limit: number): Promise<ReportCase[]> {
    const scores = await this.range(status === "open" ? RK.open : RK.done, limit);
    return this.load([...scores.keys()], status, scores);
  }

  async get(key: string): Promise<ReportCase | null> {
    const [open, done] = await this.redis.pipeline().zscore(RK.open, key).zscore(RK.done, key).exec<[string | null, string | null]>();
    if (open === null && done === null) return null;
    const status = open !== null ? "open" : "done";
    const [c] = await this.load([key], status, new Map([[key, Number(open ?? done)]]));
    return c ?? null;
  }

  async resolve(key: string, res: Resolution, snapshot?: CaseMeta & { count: number; firstAt: number; lastAt: number }): Promise<boolean> {
    const exists = (await this.redis.hexists(RK.meta, key)) === 1;
    if (!exists && !snapshot) return false;
    const m = this.redis.multi();
    if (!exists && snapshot) {
      const { count, firstAt, lastAt, ...meta } = snapshot;
      m.hset(RK.meta, { [key]: JSON.stringify(meta) })
        .hset(RK.first, { [key]: String(firstAt) })
        .hset(RK.last, { [key]: String(lastAt) })
        .hset(RK.n, { [key]: String(count) });
    }
    await m
      .hset(RK.res, { [key]: JSON.stringify(res) })
      .zrem(RK.open, key)
      .zadd(RK.done, { score: res.at, member: key })
      .exec();
    // 처리됨이 DONE_KEEP개를 넘으면 오래된 것부터 지운다 (다시 신고돼 대기에 있는 것은 남긴다)
    const extra = (await this.redis.zrange(RK.done, 0, -(DONE_KEEP + 1))) as string[];
    if (extra.length) {
      const opens = await Promise.all(extra.map((k) => this.redis.zscore(RK.open, k)));
      const gone = extra.filter((_, i) => opens[i] === null);
      const d = this.redis.multi().zrem(RK.done, ...extra);
      if (gone.length) {
        d.hdel(RK.meta, ...gone).hdel(RK.first, ...gone).hdel(RK.last, ...gone).hdel(RK.n, ...gone).hdel(RK.res, ...gone);
        for (const k of gone) d.del(RK.by(k), RK.log(k));
      }
      await d.exec();
    }
    return true;
  }

  async openCount(): Promise<number> {
    return Number(await this.redis.zcard(RK.open));
  }
}

const g = globalThis as typeof globalThis & { __tombReportBox?: ReportBox };

export function getReportBox(): ReportBox {
  const cur = g.__tombReportBox;
  const conn = env.redis();
  if (conn) return cur instanceof RedisReportBox ? cur : (g.__tombReportBox = new RedisReportBox(conn));
  if (env.isProd()) throw new Error("[reports] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryReportBox) return cur;
  g.__tombReportBox = cur ? Object.assign(new MemoryReportBox(), cur) : new MemoryReportBox();
  return g.__tombReportBox;
}
