import { Redis } from "@upstash/redis";
import { DYE_PARTS, type AvatarDye } from "@tomb/protocol";
import { env } from "../env";
import { kstDay } from "./accounts";
import { K } from "./keys";
import { getStyleStore, styleKey } from "./style";
import type { AccountStore, EquippedItem } from "./types";

// 외형 꾸미기 점수 랭킹 저장소. 점수는 "후보를 고르는 색인"일 뿐 믿지 않는다 —
// 읽을 때마다 후보의 지금 착용(acct:{id}:look)·몸·염색을 다시 읽어 점수를 다시 매긴다 (lib/lookRank.ts).
//
// Redis 키 (이 파일에서만 쓴다)
//  - rank:look  ZSET 계정 id → 마지막으로 기록한 꾸미기 점수 (0점이면 뺀다). 착용 변경·구매·재접속·읽을 때 바로잡기로 갱신

const LOOK_RANK_KEY = "rank:look";

/** 점수를 다시 매길 때 읽는 계정 상태 (착용품은 만료된 것도 그대로 — 판정은 lookScore가 now로 한다) */
export type LookState = { name: string | null; body: string | null; dye: AvatarDye; equipped: EquippedItem[] };
export type LookRankEntry = { accountId: string; score: number };

export interface LookRankStore {
  /** 점수 기록 (0 이하면 뺀다) */
  put(accountId: string, score: number): Promise<void>;
  /** 기록 점수 높은 순 offset부터 count명 */
  top(offset: number, count: number): Promise<LookRankEntry[]>;
  /** 기록 점수가 score보다 큰 계정 수 (내 순위 어림) */
  countAbove(score: number): Promise<number>;
  /** 계정들의 지금 외형 (없는 계정은 빠진다) */
  states(ids: readonly string[], now: number): Promise<Map<string, LookState>>;
}

// ── 메모리 (로컬·테스트) ──

export class MemoryLookRank implements LookRankStore {
  private scores = new Map<string, number>();
  /** 계정 저장소 (HMR로 바뀌어도 최신 것을 쓰게 매번 받는다) */
  constructor(public accounts: () => AccountStore) {}

  async put(accountId: string, score: number): Promise<void> {
    if (score > 0) this.scores.set(accountId, score);
    else this.scores.delete(accountId);
  }
  async top(offset: number, count: number): Promise<LookRankEntry[]> {
    return [...this.scores]
      .map(([accountId, score]) => ({ accountId, score }))
      .sort((a, b) => b.score - a.score || b.accountId.localeCompare(a.accountId))
      .slice(offset, offset + count);
  }
  async countAbove(score: number): Promise<number> {
    let n = 0;
    for (const s of this.scores.values()) if (s > score) n++;
    return n;
  }
  async states(ids: readonly string[], now: number): Promise<Map<string, LookState>> {
    const accounts = this.accounts();
    const style = getStyleStore(accounts);
    const out = new Map<string, LookState>();
    await Promise.all(
      ids.map(async (id) => {
        const [a, st] = await Promise.all([accounts.get(id, kstDay(now), now), style.get(id)]);
        out.set(id, { name: a.name, body: a.body, dye: st.dye, equipped: a.equipped });
      }),
    );
    return out;
  }
}

// ── Redis ──

/** HGETALL 결과 → [필드, 값] (automaticDeserialization: false면 평평한 배열, 아니면 객체) */
function entriesOf(raw: unknown): [string, string][] {
  if (Array.isArray(raw)) {
    const out: [string, string][] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) out.push([String(raw[i]), String(raw[i + 1])]);
    return out;
  }
  if (raw && typeof raw === "object") return Object.entries(raw).flatMap(([k, v]) => (v === null || v === undefined ? [] : [[k, String(v)] as [string, string]]));
  return [];
}

export class RedisLookRank implements LookRankStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async put(accountId: string, score: number): Promise<void> {
    if (score > 0) await this.redis.zadd(LOOK_RANK_KEY, { score, member: accountId });
    else await this.redis.zrem(LOOK_RANK_KEY, accountId);
  }

  async top(offset: number, count: number): Promise<LookRankEntry[]> {
    if (count <= 0) return [];
    const flat = (await this.redis.zrange(LOOK_RANK_KEY, offset, offset + count - 1, { rev: true, withScores: true })) as unknown[];
    const out: LookRankEntry[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push({ accountId: String(flat[i]), score: Number(flat[i + 1]) });
    return out;
  }

  async countAbove(score: number): Promise<number> {
    return Number(await this.redis.zcount(LOOK_RANK_KEY, `(${score}`, "+inf"));
  }

  async states(ids: readonly string[]): Promise<Map<string, LookState>> {
    const out = new Map<string, LookState>();
    if (!ids.length) return out;
    // 한 사람당 4개 명령을 파이프라인 한 번으로 (착용·이름·몸·염색)
    const p = this.redis.pipeline();
    for (const id of ids) p.hgetall(K.look(id)).hget(K.acct(id), "name").hget(K.acct(id), "body").hgetall(styleKey(id));
    const res = (await p.exec()) as unknown[];
    ids.forEach((id, i) => {
      const [look, name, body, style] = res.slice(i * 4, i * 4 + 4);
      if (name === null && body === null && !entriesOf(look).length) return; // 없는 계정
      const equipped = entriesOf(look).flatMap(([, v]) => {
        const [itemId, until] = v.split("|");
        return itemId ? [{ itemId, until: Number(until) || 0 }] : [];
      });
      const st = Object.fromEntries(entriesOf(style));
      const dye: AvatarDye = {};
      for (const part of DYE_PARTS) if (st[part]) dye[part] = st[part];
      out.set(id, { name: name === null ? null : String(name), body: body === null ? null : String(body), dye, equipped });
    });
    return out;
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 남게 globalThis에 둔다 (lib/store와 같은 방식)
const g = globalThis as typeof globalThis & { __tombLookRank?: LookRankStore };

/** accounts = getAccounts() (로컬이면 메모리 계정에서 지금 외형을 읽는다) */
export function getLookRankStore(accounts: AccountStore): LookRankStore {
  const cur = g.__tombLookRank;
  const conn = env.redis();
  if (conn) return cur instanceof RedisLookRank ? cur : (g.__tombLookRank = new RedisLookRank(conn));
  if (env.isProd()) throw new Error("[lookRank] Redis 환경변수가 없습니다.");
  const mem = cur instanceof MemoryLookRank ? cur : (g.__tombLookRank = cur ? Object.assign(new MemoryLookRank(() => accounts), cur) : new MemoryLookRank(() => accounts));
  mem.accounts = () => accounts;
  return mem;
}
