import { Redis } from "@upstash/redis";
import { gearGrade, type Grade } from "@/components/rpg/gear";
import { env } from "../env";
import { isStaff } from "../staff";
import { COSMETIC_DROPS, DIFFS, GEAR, zoneFor, type Difficulty, type ZoneId } from "./catalog";
import { testServerEnv } from "./superHunter";
import type { Drop } from "./types";

// 테스트 서버 전용 "다음 판 시험 드롭" 예약 (운영자 계정만, 운영 서버에서는 예약도 꺼내기도 하지 않는다).
// 관리자 운영 점검에서 판 단위 묶음을 예약해 두면, 운영자 계정이 사냥 판을 시작할 때 맨 앞 묶음을 원자적으로 꺼내
// 실제 드롭으로 정해(장비는 그 사냥터에 어울리는 해당 등급에서 무작위) 서명된 티켓(td)에 싣고 판 시작 응답으로 화면에 알린다.
// 판이 끝나면 서버는 그 판의 굴림 대신 이 드롭을 실제로 준다 (승리·쓰러짐 관계없이, 결과 검증은 그대로).
// 화면은 예측 대신 이 값을 판 끝에 우두머리(마지막으로 잡은 몬스터) 자리에서 떨군다.
// Redis 키: rpg:testdrops:{acct}  LIST (JSON 묶음, 맨 앞부터 꺼냄) · 7일 뒤 저절로 지운다

/** 예약 한 칸: 장비(등급) 또는 꾸미기 선물 (어떤 꾸미기인지는 지급 때 — 이미 가진 것은 건너뛰는 기존 규칙) */
export type TestDropSpec = { kind: "gear"; grade: Grade["id"] } | { kind: "cosmetic" };
/** 한 판에 떨어질 묶음 */
export type TestDropBatch = TestDropSpec[];

/** 관리자 단추 하나로 넣는 두 판: [고급 + 희귀] → [꾸미기 선물 + 전설] */
export const TEST_DROP_PRESET: readonly TestDropBatch[] = [
  [
    { kind: "gear", grade: "fine" },
    { kind: "gear", grade: "rare" },
  ],
  [{ kind: "cosmetic" }, { kind: "gear", grade: "legend" }],
];

const GRADE_LABEL: Record<Grade["id"], string> = { common: "일반", fine: "고급", rare: "희귀", legend: "전설" };

/** 묶음 → "고급+희귀" */
export function batchLabel(b: TestDropBatch): string {
  return b.map((s) => (s.kind === "cosmetic" ? "꾸미기 선물" : GRADE_LABEL[s.grade])).join("+");
}

const TTL_SEC = 7 * 86_400;
const key = (acct: string) => `rpg:testdrops:${acct}`;

export interface TestDropStore {
  /** 예약을 이 묶음들로 바꾼다 (빈 목록 = 비우기) */
  set(acct: string, batches: readonly TestDropBatch[]): Promise<void>;
  /** 맨 앞 묶음을 꺼낸다 (원자적 — 동시에 두 판을 시작해도 같은 묶음을 두 번 꺼내지 않는다). 없으면 null */
  pop(acct: string): Promise<TestDropBatch | null>;
  list(acct: string): Promise<TestDropBatch[]>;
}

export class MemoryTestDrops implements TestDropStore {
  private q = new Map<string, TestDropBatch[]>();
  async set(acct: string, batches: readonly TestDropBatch[]): Promise<void> {
    if (batches.length) this.q.set(acct, batches.map((b) => [...b]));
    else this.q.delete(acct);
  }
  async pop(acct: string): Promise<TestDropBatch | null> {
    return this.q.get(acct)?.shift() ?? null;
  }
  async list(acct: string): Promise<TestDropBatch[]> {
    return (this.q.get(acct) ?? []).map((b) => [...b]);
  }
}

export class RedisTestDrops implements TestDropStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async set(acct: string, batches: readonly TestDropBatch[]): Promise<void> {
    const tx = this.redis.multi().del(key(acct));
    if (batches.length) tx.rpush(key(acct), ...batches.map((b) => JSON.stringify(b))).expire(key(acct), TTL_SEC);
    await tx.exec();
  }
  async pop(acct: string): Promise<TestDropBatch | null> {
    const raw = await this.redis.lpop<string>(key(acct));
    return raw ? parseBatch(raw) : null;
  }
  async list(acct: string): Promise<TestDropBatch[]> {
    const rows = await this.redis.lrange<string>(key(acct), 0, -1);
    return rows.map(parseBatch).filter((b): b is TestDropBatch => !!b);
  }
}

function parseBatch(raw: string): TestDropBatch | null {
  try {
    const b = JSON.parse(raw) as TestDropBatch;
    return Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

const g = globalThis as typeof globalThis & { __tombTestDrops?: TestDropStore };

export function getTestDropStore(): TestDropStore {
  const cur = g.__tombTestDrops;
  const conn = env.redis();
  if (conn) return cur instanceof RedisTestDrops ? cur : (g.__tombTestDrops = new RedisTestDrops(conn));
  if (cur instanceof MemoryTestDrops) return cur;
  return (g.__tombTestDrops = new MemoryTestDrops());
}

/**
 * 예약 묶음 → 실제 드롭. 장비는 그 사냥터의 드롭 범위(난이도 dropMaxLevel−20 ~ dropMaxLevel, 잘 나오는 장비 우선)에서 해당 등급을 무작위로,
 * 그 범위에 그 등급이 없으면(예: 쉬움 사냥터의 전설) 드롭 상한에 가장 가까운 그 등급 장비 몇 개 중에서. 꾸미기는 드롭 후보 중 무작위
 */
export function resolveTestDrops(batch: TestDropBatch, difficulty: Difficulty, zoneId: ZoneId | undefined, rnd: () => number = Math.random): Drop[] {
  const D = DIFFS[difficulty];
  const zone = zoneFor(difficulty, zoneId);
  const pick = <T,>(a: readonly T[]) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  const out: Drop[] = [];
  for (const s of batch) {
    if (s.kind === "cosmetic") {
      if (COSMETIC_DROPS.length) out.push({ kind: "cosmetic", id: pick(COSMETIC_DROPS), qty: 1 });
      continue;
    }
    const pool = GEAR.filter((x) => gearGrade(x).id === s.grade);
    if (!pool.length) continue;
    const fit = pool.filter((x) => x.reqLevel <= D.dropMaxLevel && x.reqLevel >= D.dropMaxLevel - 20);
    const favor = fit.filter((x) => zone.favor.includes(x.id));
    const near = [...pool].sort((a, b) => Math.abs(a.reqLevel - D.dropMaxLevel) - Math.abs(b.reqLevel - D.dropMaxLevel)).slice(0, 4);
    const from = favor.length && rnd() < 0.5 ? favor : fit.length ? fit : near;
    out.push({ kind: "gear", id: pick(from).id, qty: 1 });
  }
  return out;
}

/** 판 시작: 테스트 서버의 운영자 계정이면 맨 앞 예약을 꺼내 실제 드롭으로 (아니면 null — 꺼내지도 않는다) */
export async function takeTestDrops(acct: string, difficulty: Difficulty, zoneId: ZoneId | undefined): Promise<Drop[] | null> {
  if (!testServerEnv() || !(await isStaff(acct))) return null;
  const batch = await getTestDropStore().pop(acct);
  if (!batch) return null;
  const drops = resolveTestDrops(batch, difficulty, zoneId);
  return drops.length ? drops : null;
}
