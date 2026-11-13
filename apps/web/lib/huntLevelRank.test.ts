import { beforeAll, describe, expect, it, vi } from "vitest";
import { fillHuntLevel, huntLevelRank, levelScore, MemoryHuntLevel, recordHuntLevel, type HuntLevelInput } from "./huntLevelRank";
import { FILL_DONE } from "./rankFill";
import { getRpgStore, MemoryRpgStore } from "./rpg/store";
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

describe("사냥 레벨 랭킹 기존 캐릭터 채우기", () => {
  /** 랭킹 기록 없이 사냥 저장소에만 있는 기존 캐릭터들 (사냥 레벨 랭킹이 생기기 전부터 레벨을 올린 사람) */
  async function legacy() {
    const rpg = new MemoryRpgStore();
    const set = (id: string, level: number, exp: number, runs = 3, weapon: string | null = null) =>
      rpg.update(id, (s) => ({ state: { ...s, level, exp, runs, equip: { ...s.equip, weapon } }, result: null }));
    await set("a", 10, 5, 3, "w_keyboard");
    await set("b", 12, 0);
    await set("op", 50, 0);
    await set("new", 1, 0, 0); // 한 판도 안 한 캐릭터
    for (let i = 0; i < 250; i++) await set(`n${i}`, 1, 0, 0); // 여러 묶음으로 나눠 훑는다
    const scan = vi.spyOn(rpg, "scanChars");
    const accounts = new MemoryAccounts(() => null as never);
    const store = new MemoryHuntLevel(() => accounts);
    return { rpg, scan, store, o: (banned: string[] = []) => ({ ...opts(store, banned), rpg }) };
  }

  it("빈 랭킹을 처음 읽을 때 한 번 채운다 (운영자·새 캐릭터는 빼고, 정지 계정은 목록에서만 뺀다)", async () => {
    const { scan, store, o } = await legacy();
    const r = await huntLevelRank(null, 50, o(["b"]));
    expect(brief(r.rows)).toEqual([[1, "a", 10]]);
    expect(r.rows[0]).toMatchObject({ gear: "w_keyboard", sub: "경험치 5" });
    expect((await store.top(10)).map((e) => e.accountId)).toEqual(["b", "a"]);
    expect(await store.fill.get()).toBe(FILL_DONE);
    const scans = scan.mock.calls.length;
    expect(scans).toBe(2); // 254명 → 200 + 54
    // 표시가 남았으니 다시 읽어도 훑지 않는다
    await huntLevelRank("a", 50, o());
    expect(scan.mock.calls.length).toBe(scans);
  });

  it("동시에 여러 요청이 와도 한 번만 훑는다", async () => {
    const { scan, o } = await legacy();
    await Promise.all([1, 2, 3].map(() => huntLevelRank(null, 50, o())));
    await huntLevelRank(null, 50, o());
    expect(scan.mock.calls.length).toBe(2);
  });

  it("관리자 다시 채우기: 채운 뒤 바뀐 캐릭터도 끝까지 훑어 적는다", async () => {
    const { rpg, store, o } = await legacy();
    await huntLevelRank(null, 50, o());
    // 랭킹 기록 없이 저장소만 바뀐 경우 (예: 채우기 전 버전 서버에서 올린 레벨)
    await rpg.update("late", (s) => ({ state: { ...s, level: 20, exp: 1, runs: 9 }, result: null }));
    expect((await huntLevelRank(null, 50, o())).rows.map((x) => x.accountId)).not.toContain("late");
    let cursor = "0";
    let filled = 0;
    do {
      const r = await fillHuntLevel(cursor, 200, { store, staffId: "op", rpg });
      cursor = r.next;
      filled += r.filled;
    } while (cursor !== "0");
    expect(filled).toBe(3); // a · b · late (운영자·새 캐릭터는 없다)
    expect(brief((await huntLevelRank(null, 50, o())).rows)).toEqual([
      [1, "late", 20],
      [2, "b", 12],
      [3, "a", 10],
    ]);
  });
});
