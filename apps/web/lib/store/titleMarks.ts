import { Redis } from "@upstash/redis";
import { env } from "../env";

// 칭호 알림 기록 (계정마다): 새 칭호 알림 창을 띄운 칭호(announced)와 가방 [칭호] 칸에서 본 칭호(seen).
// 얻은 칭호 − announced = 새로 띄울 알림, 얻은 칭호 − seen = 가방의 "NEW" 표시·가방 단추 점.
// 처음 확인하는 계정(기록이 아직 없음)은 이미 얻어 둔 칭호를 한 번에 묶어 알린다 (lib/titlesServer).
//
// Redis 키 (이 파일에서만 쓴다)
//  - titles:ann:{계정}   SET  알린 칭호 id (+ 처음 확인 표시 "_")
//  - titles:seen:{계정}  SET  가방에서 본 칭호 id

const INIT = "_";
const annKey = (id: string) => `titles:ann:${id}`;
const seenKey = (id: string) => `titles:seen:${id}`;

export type TitleMarks = {
  /** 한 번이라도 확인·기록한 계정인지 (false면 기능 전에 얻은 칭호를 묶어서 알린다) */
  init: boolean;
  announced: string[];
  seen: string[];
};
export type TitleMarkKind = "announced" | "seen";

export interface TitleMarkStore {
  get(accountId: string): Promise<TitleMarks>;
  /** 기록 더하기 (빈 목록이어도 처음 확인 표시는 남긴다) */
  add(accountId: string, kind: TitleMarkKind, ids: readonly string[]): Promise<void>;
}

export class MemoryTitleMarks implements TitleMarkStore {
  private rows = new Map<string, { ann: Set<string>; seen: Set<string> }>();
  async get(accountId: string): Promise<TitleMarks> {
    const r = this.rows.get(accountId);
    return { init: !!r, announced: r ? [...r.ann] : [], seen: r ? [...r.seen] : [] };
  }
  async add(accountId: string, kind: TitleMarkKind, ids: readonly string[]): Promise<void> {
    let r = this.rows.get(accountId);
    if (!r) this.rows.set(accountId, (r = { ann: new Set(), seen: new Set() }));
    for (const id of ids) (kind === "announced" ? r.ann : r.seen).add(id);
  }
}

export class RedisTitleMarks implements TitleMarkStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async get(accountId: string): Promise<TitleMarks> {
    const [ann, seen] = (await this.redis.pipeline().smembers(annKey(accountId)).smembers(seenKey(accountId)).exec()) as [unknown, unknown];
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    const a = list(ann);
    return { init: a.includes(INIT), announced: a.filter((x) => x !== INIT), seen: list(seen) };
  }
  async add(accountId: string, kind: TitleMarkKind, ids: readonly string[]): Promise<void> {
    const p = this.redis.pipeline();
    p.sadd(annKey(accountId), INIT);
    if (ids.length) p.sadd(kind === "announced" ? annKey(accountId) : seenKey(accountId), ...(ids as [string, ...string[]]));
    await p.exec();
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 남게 globalThis에 둔다 (lib/store와 같은 방식)
const g = globalThis as typeof globalThis & { __tombTitleMarks?: TitleMarkStore };

export function getTitleMarks(): TitleMarkStore {
  const cur = g.__tombTitleMarks;
  const conn = env.redis();
  if (conn) return cur instanceof RedisTitleMarks ? cur : (g.__tombTitleMarks = new RedisTitleMarks(conn));
  if (env.isProd()) throw new Error("[titleMarks] Redis 환경변수가 없습니다.");
  // 모듈이 다시 로드되거나 경로마다 따로 묶여도(개발 서버) 기록이 남게 이전 객체의 값을 옮긴다 (lib/store/champ와 같은 방식)
  if (cur instanceof MemoryTitleMarks) return cur;
  return (g.__tombTitleMarks = cur ? Object.assign(new MemoryTitleMarks(), cur) : new MemoryTitleMarks());
}
