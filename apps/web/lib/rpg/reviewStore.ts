import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";
import type { RunLog } from "./types";

// 11/18 관리자 「확인 필요」 목록 (보안 검토): 서버가 확신할 수 없는 기록을 버리지 않고 관리자가 인정하거나 거절할 때까지 붙잡아 둔다.
//  - tower: 의심 판으로 끝난 야근 빌딩 판. 판·포인트는 이미 받았고, 최고 층·랭킹·서버 최초·상자·초월 EXP·체크포인트는 인정하면 들어간다
//  - first: 서버 최초 칭호(한 명뿐 — 30·50·100층, ★100, 강화 +15). 조건을 채운 순서(at)대로 줄을 서고, 인정하면 그때 칭호 주인이 된다
//  - top: 다른 사람이 가진 서버 전체 최고 층을 새로 깬 정상 판. 그 판의 보상·내 최고 층·주간 기록은 바로 받았고,
//    「꼭대기 층 주인」 자리와 야근 빌딩 전체 랭킹 기록만 인정하면 들어간다 (거절하면 전체 랭킹·꼭대기에서 빠진다)
//
// Redis 키
//  - rpg:review   HASH  항목 id → JSON. 넣기는 HSETNX(같은 항목 한 번), 꺼내기는 HGET+HDEL 한 번(Lua — 인정·거절을 두 번 할 수 없다)
// 목록이 아주 커지지 않게 REVIEW_MAX개까지만 받는다 (넘으면 넣지 않고 운영 로그에 남긴다)

export const REVIEW_MAX = 500;

export type TowerReview = {
  id: string;
  kind: "tower";
  acct: string;
  /** 판을 끝낸 시각 */
  at: number;
  /** 의심 사유 (운영 로그와 같은 말) */
  why: string[];
  start: number;
  /** 상자를 굴릴 드롭 시드 (판 끝과 같은 상자) */
  seed: number;
  floors: number;
  floorMs: number;
  kills: number;
  /** 꼭대기 층에 도달한 시각 (랭킹 순서) */
  arrival: number;
  /** 서버가 잰 판 시간 · 화면이 보낸 판 시간 (ms) */
  elapsed: number;
  durationMs: number;
  level: number;
  gp: number;
  /** 한 마리에게 넣을 수 있는 초당 최대 피해 (티켓 dm) */
  dm?: number;
  /** 고른 카드 수 */
  cards: number;
  log?: RunLog;
};
export type FirstReview = {
  id: string;
  kind: "first";
  acct: string;
  /** 조건을 채운 시각 (같은 칭호 줄 순서) */
  at: number;
  titleId: string;
  /** 인정할 때 마을 알림 글 */
  text: string;
};
export type TopReview = {
  id: string;
  kind: "top";
  acct: string;
  /** 꼭대기 층에 도달한 시각 (랭킹 순서) */
  at: number;
  floor: number;
  floorMs: number;
  /** 전체 랭킹 점수 (lib/rpg/tower towerScore) */
  score: number;
};
export type ReviewItem = TowerReview | FirstReview | TopReview;

export const towerReviewId = (acct: string, at: number) => `t:${acct}:${at}`;
export const firstReviewId = (titleId: string, acct: string) => `f:${titleId}:${acct}`;
export const topReviewId = (acct: string, floor: number) => `p:${acct}:${floor}`;

export interface ReviewStore {
  /** 넣기 (같은 id가 있거나 목록이 꽉 찼으면 false) */
  add(item: ReviewItem): Promise<boolean>;
  list(): Promise<ReviewItem[]>;
  /** 꺼내기 (원자적 — 처음 한 번만 항목을, 그 뒤는 null) */
  take(id: string): Promise<ReviewItem | null>;
}

const KEY = "rpg:review";

function parse(v: unknown): ReviewItem | null {
  try {
    const o = (typeof v === "string" ? JSON.parse(v) : v) as ReviewItem | null;
    return o && typeof o === "object" && typeof o.id === "string" && (o.kind === "tower" || o.kind === "first" || o.kind === "top") ? o : null;
  } catch {
    return null;
  }
}

export class MemoryReviewStore implements ReviewStore {
  private items = new Map<string, ReviewItem>();
  async add(item: ReviewItem) {
    if (this.items.has(item.id) || this.items.size >= REVIEW_MAX) return false;
    this.items.set(item.id, structuredClone(item));
    return true;
  }
  async list() {
    return [...this.items.values()].map((i) => structuredClone(i));
  }
  async take(id: string) {
    const it = this.items.get(id);
    if (!it) return null;
    this.items.delete(id);
    return it;
  }
}

// KEYS: review  ARGV: id, json, max — 꽉 찼거나 이미 있으면 0
const ADD_LUA = `
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
return redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2])
`;
// KEYS: review  ARGV: id — 있으면 지우고 그 값
const TAKE_LUA = `
local v = redis.call('HGET', KEYS[1], ARGV[1])
if not v then return false end
redis.call('HDEL', KEYS[1], ARGV[1])
return v
`;

export class RedisReviewStore implements ReviewStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "rpg/reviewStore");
  }
  async add(item: ReviewItem) {
    return Number(await this.redis.eval<string[], number>(ADD_LUA, [KEY], [item.id, JSON.stringify(item), String(REVIEW_MAX)])) === 1;
  }
  async list() {
    const all = (await this.redis.hgetall<Record<string, unknown>>(KEY)) ?? {};
    return Object.values(all)
      .map(parse)
      .filter((i): i is ReviewItem => !!i);
  }
  async take(id: string) {
    const v = await this.redis.eval<string[], string | null>(TAKE_LUA, [KEY], [id]);
    return v ? parse(v) : null;
  }
}

const g = globalThis as typeof globalThis & { __tombReview?: ReviewStore };

export function getReviewStore(): ReviewStore {
  const cur = g.__tombReview;
  const conn = env.redis();
  if (conn) return cur instanceof RedisReviewStore ? cur : (g.__tombReview = new RedisReviewStore(conn));
  if (env.isProd()) throw new Error("[review] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryReviewStore) return cur;
  return (g.__tombReview = new MemoryReviewStore());
}
