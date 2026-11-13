import type { Redis } from "@upstash/redis";

// 랭킹 "기존 기록 채우기" 공통 (사냥 레벨 lib/huntLevelRank · 꾸미기 lib/lookRank).
// 두 랭킹은 원래 판 끝·착용 변경·재접속 때만 기록돼서, 랭킹이 생기기 전부터 있던 캐릭터·코디가 안 보였다.
// 랭킹을 처음 읽을 때 서버가 한 번 원본 저장소를 커서로 훑어 채우고 "채움 끝" 표시를 남긴다.
//  - 표시 값: 없음 = 아직 시작 전, "done" = 끝, 그 밖 = 이어서 훑을 커서 (한 요청에서 다 못 끝내면 다음 요청이 잇는다)
//  - 잠금: 여러 요청이 동시에 와도 한 곳만 훑는다 (못 잡은 요청은 기다리지 않고 지금 있는 기록으로 읽는다)

export const FILL_DONE = "done";
/** 잠금 유지 시간 (훑던 서버가 죽어도 이만큼 지나면 다른 요청이 잇는다) */
const LOCK_SEC = 30;
/** 한 요청에서 훑는 시간 상한 (넘으면 커서를 남기고 다음 요청에 넘긴다) */
const BUDGET_MS = 2_500;
/** 한 번에 훑는 개수 */
export const FILL_BATCH = 200;
const MAX_ROUNDS = 50;

export interface FillMark {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  /** 잡으면 true (이미 누가 잡고 있으면 false) */
  lock(): Promise<boolean>;
  unlock(): Promise<void>;
}

export class MemoryFillMark implements FillMark {
  private value: string | null = null;
  private lockedUntil = 0;
  async get() {
    return this.value;
  }
  async set(value: string) {
    this.value = value;
  }
  async lock() {
    const now = Date.now();
    if (this.lockedUntil > now) return false;
    this.lockedUntil = now + LOCK_SEC * 1000;
    return true;
  }
  async unlock() {
    this.lockedUntil = 0;
  }
}

// KEYS: 잠금  ARGV: 내 토큰 — 내가 잡은 잠금일 때만 푼다 (시간이 지나 남이 잡은 잠금은 건드리지 않는다)
const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

/** key = 표시 STRING, `${key}:lock` = 잠금 STRING (SET NX EX) */
export class RedisFillMark implements FillMark {
  private token = "";
  constructor(
    private redis: Redis,
    private key: string,
  ) {}
  async get() {
    const v = await this.redis.get<string>(this.key);
    return v === null || v === undefined ? null : String(v);
  }
  async set(value: string) {
    await this.redis.set(this.key, value);
  }
  async lock() {
    this.token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return (await this.redis.set(`${this.key}:lock`, this.token, { nx: true, ex: LOCK_SEC })) !== null;
  }
  async unlock() {
    await this.redis.eval<string[], number>(UNLOCK_LUA, [`${this.key}:lock`], [this.token]);
  }
}

/** 한 묶음 채우기: 커서부터 훑고 다음 커서("0" = 끝)와 랭킹에 올린 수를 준다 */
export type FillStep = (cursor: string) => Promise<{ next: string; filled: number }>;

/**
 * 채움 표시가 "done"이 아니면 잠금을 잡고 이어서 훑는다 (시간 상한 안에서). 랭킹 읽기를 막으면 안 되므로 오류는 삼킨다
 */
export async function autoFill(mark: FillMark, step: FillStep, label: string): Promise<void> {
  try {
    const cur = await mark.get();
    if (cur === FILL_DONE) return;
    if (!(await mark.lock())) return;
    try {
      const start = Date.now();
      let cursor = cur ?? "0";
      for (let round = 0; round < MAX_ROUNDS; round++) {
        cursor = (await step(cursor)).next;
        if (cursor === "0") return void (await mark.set(FILL_DONE));
        await mark.set(cursor);
        if (Date.now() - start > BUDGET_MS) return;
      }
    } finally {
      await mark.unlock();
    }
  } catch (e) {
    console.warn(`[${label}] 기존 기록 채우기 실패`, e);
  }
}
