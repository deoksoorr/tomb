import { nanoid } from "nanoid";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { itemById, PERMANENT_UNTIL, RAFT_GEAR, RAFT_GEAR_IDS, RAFT_GEAR_ODDS, RAFT_GEAR_ON, RAFT_SET_IDS } from "@tomb/protocol";
import { autoHit, newAutoSession, type AutoSession } from "../forage/auto";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { grantRaftRange, raftGearChoices, rollRaftGear } from "./gear";

// 11/27 좌대 전용 코디 굴림 (자동 낚시 정산 때 내 좌대 세션에서 걸린 한 마리마다 — 메모리 구성)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

const T0 = Date.UTC(2026, 10, 27, 3, 0, 0);
const DAY = 86_400_000;

async function account(): Promise<string> {
  const id = nanoid();
  await getAccounts().enter(id, { name: `손님${id.slice(0, 4)}`, color: "#9fc5a8", body: "hood" }, T0);
  return id;
}
const owned = async (id: string) => {
  const a = await getAccounts().get(id, kstDay(T0), T0);
  return new Map([...a.equipped, ...a.stash].map((e) => [e.itemId, e.until]));
};

/** 내 좌대 세션: 접속 구간 하나에 k번째 시도까지 (15초 간격) */
function raftSession(seed: number, tries: number): AutoSession {
  const every = 15_000;
  return { ...newAutoSession(seed, "f_x", "pond" as AutoSession["water"], 1, T0), every, raft: { ch: 1, n: 2 }, segs: [[T0, T0 + every * tries]] };
}

/** 그 단계가 나오는 (seed, k) — 걸린 시도만 굴린다 */
function findRoll(tier: "d7" | "d30" | "perm", seed = 7): { seed: number; k: number } {
  for (let k = 1; k < 5_000_000; k++) if (autoHit(seed, k) && rollRaftGear(seed, k)?.tier === tier) return { seed, k };
  throw new Error("못 찾음");
}

describe("11/27 좌대 전용 코디 굴림", () => {
  it("켜져 있고, 카탈로그(items.ts raft: true)에 일곱 점이 다 있다 — 상점에는 없다", () => {
    expect(RAFT_GEAR_ON).toBe(true);
    for (const g of RAFT_GEAR) {
      const it = itemById(g.id);
      expect(it, g.id).toBeDefined();
      expect(it).toMatchObject({ kind: "cosmetic", slot: g.slot, raft: true });
    }
  });

  it("시드·번호로 결정적: 같은 (seed, k)는 늘 같고, 끄면 늘 없다", () => {
    for (let k = 1; k < 2000; k++) {
      expect(rollRaftGear(42, k)).toEqual(rollRaftGear(42, k));
      expect(rollRaftGear(42, k, false)).toBeNull();
    }
    const hit = findRoll("d7", 3);
    expect(rollRaftGear(hit.seed, hit.k)).toEqual(rollRaftGear(hit.seed, hit.k));
  });

  it("확률: 70만 번 굴리면 7일 ≈ 1/7,000 · 30일 ≈ 1/35,000 · 영구 ≈ 1/200,000", () => {
    const n = 700_000;
    const c = { d7: 0, d30: 0, perm: 0 };
    for (let k = 1; k <= n; k++) {
      const r = rollRaftGear(11, k);
      if (r) c[r.tier]++;
    }
    // 기대값 100 · 20 · 3.5 (넉넉한 범위 — 결정적이라 흔들리지 않는다)
    expect(c.d7).toBeGreaterThan(n * RAFT_GEAR_ODDS.d7 * 0.6);
    expect(c.d7).toBeLessThan(n * RAFT_GEAR_ODDS.d7 * 1.4);
    expect(c.d30).toBeGreaterThan(n * RAFT_GEAR_ODDS.d30 * 0.4);
    expect(c.d30).toBeLessThan(n * RAFT_GEAR_ODDS.d30 * 1.8);
    expect(c.perm).toBeLessThan(n * RAFT_GEAR_ODDS.perm * 4);
  }, 30_000);

  it("고르기: 이미 영구로 가진 것은 빼고, 그 단계 것을 다 가졌으면 없다", () => {
    expect(raftGearChoices("perm", new Set())).toEqual([...RAFT_SET_IDS]);
    expect(raftGearChoices("perm", new Set(["jw_sedge", "jw_cape"]))).toEqual(["jw_bell", "jw_waders"]);
    expect(raftGearChoices("d30", new Set(["jw_vest", "jw_net"]))).toEqual([]);
    expect(raftGearChoices("d7", new Set())).toEqual(["jw_carphat"]);
    expect(RAFT_GEAR_IDS).toHaveLength(7);
  });

  it("지급: 7일은 끝을 7일 늘리고(더 짧아지지 않는다), 영구는 영구로 · 좌대 세션이 아니면 굴리지 않는다", async () => {
    const acct = await account();
    const d7 = findRoll("d7");
    const s = raftSession(d7.seed, d7.k);
    const first = await grantRaftRange(acct, s, d7.k, d7.k, T0);
    expect(first).toEqual([{ id: "jw_carphat", name: "붕어 털모자", tier: "d7" }]);
    expect((await owned(acct)).get("jw_carphat")).toBe(T0 + 7 * DAY);
    // 같은 결과를 다시 받으면 7일 더 (남은 기간 위로)
    await grantRaftRange(acct, s, d7.k, d7.k, T0);
    expect((await owned(acct)).get("jw_carphat")).toBe(T0 + 14 * DAY);
    // 좌대 세션이 아니면 없음
    const plain = { ...s, raft: undefined };
    expect(await grantRaftRange(acct, plain, d7.k, d7.k, T0)).toEqual([]);

    const perm = findRoll("perm");
    const acct2 = await account();
    const got = await grantRaftRange(acct2, raftSession(perm.seed, perm.k), perm.k, perm.k, T0);
    expect(got).toHaveLength(1);
    expect(got[0].tier).toBe("perm");
    expect(RAFT_SET_IDS).toContain(got[0].id);
    expect((await owned(acct2)).get(got[0].id)).toBe(PERMANENT_UNTIL);
  }, 60_000);
});
