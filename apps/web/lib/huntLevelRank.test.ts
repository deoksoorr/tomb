import { beforeAll, describe, expect, it, vi } from "vitest";
import { huntLevelRank, levelScore, MemoryHuntLevel, recordHuntLevel, type HuntLevelInput } from "./huntLevelRank";
import { getRpgStore } from "./rpg/store";
import { MemoryAccounts } from "./store/accounts-memory";

// 사냥 레벨 랭킹: 레벨 높은 순, 같으면 경험치. 운영자·정지 계정은 빠지고 순번은 이어진다

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]) vi.stubEnv(k, "");
});

const ch = (level: number, exp: number, weapon: string | null = null): HuntLevelInput => ({ level, exp, runs: 1, equip: { weapon } });

async function setup() {
  const accounts = new MemoryAccounts(() => null as never);
  const store = new MemoryHuntLevel(() => accounts);
  const rec = (id: string, c: HuntLevelInput) => recordHuntLevel(id, c, { store, staffId: "op" });
  await rec("a", ch(10, 5, "w_keyboard"));
  await rec("b", ch(12, 0));
  await rec("c", ch(10, 80));
  await rec("op", ch(50, 0));
  await rec("new", { level: 1, exp: 0, runs: 0, equip: {} }); // 한 판도 안 한 캐릭터는 올리지 않는다
  return store;
}
const opts = (store: MemoryHuntLevel, banned: string[] = []) => ({ store, staffId: "op", isBanned: async (id: string) => banned.includes(id) });
const brief = (rows: { rank: number; accountId: string; value: number }[]) => rows.map((r) => [r.rank, r.accountId, r.value]);

describe("사냥 레벨 랭킹", () => {
  it("레벨 순, 같으면 경험치 순. 운영자·새 캐릭터는 없다", async () => {
    const store = await setup();
    const r = await huntLevelRank(null, 50, opts(store));
    expect(brief(r.rows)).toEqual([
      [1, "b", 12],
      [2, "c", 10],
      [3, "a", 10],
    ]);
    expect(r.rows[2]).toMatchObject({ gear: "w_keyboard", sub: "경험치 5" });
    expect(levelScore(11, 0)).toBeGreaterThan(levelScore(10, 999_999));
  });

  it("정지 계정은 빠지고 순번은 이어진다", async () => {
    const store = await setup();
    expect(brief((await huntLevelRank(null, 50, opts(store, ["b"]))).rows)).toEqual([
      [1, "c", 10],
      [2, "a", 10],
    ]);
  });

  it("내 줄은 사냥 저장소의 지금 캐릭터로 맞춘다 (판 밖이면 mine), 운영자 본인은 staff", async () => {
    const store = await setup();
    await getRpgStore().update("me", (s) => ({ state: { ...s, level: 3, exp: 7, runs: 2 }, result: null }));
    const r = await huntLevelRank("me", 2, opts(store));
    expect(r.mine).toMatchObject({ accountId: "me", rank: 4, value: 3, me: true });
    const op = await huntLevelRank("op", 50, opts(store));
    expect(op.staff).toBe(true);
    expect(op.mine).toBeNull();
    expect(op.rows.map((x) => x.accountId)).not.toContain("op");
  });
});
