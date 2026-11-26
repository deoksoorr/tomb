import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { scanAllAccounts } from "./adminMembers";
import { huntLevelRank, MemoryHuntLevel, recordHuntLevel, type HuntLevelInput } from "./huntLevelRank";
import { MemoryHouseStore } from "./housing/store";
import { TtlMemo } from "./memo";
import { FILL_DONE, RedisFillMark } from "./rankFill";
import { memoTopFetch, styleMine } from "./rankMemo";
import { MemoryRpgStore } from "./rpg/store";
import { MemoryAccounts } from "./store/accounts-memory";

// 11/26 반응 속도: 화면 하나를 여는 동안 저장소(운영은 Redis — 왕복마다 수십 ms)를 "차례로" 몇 번 기다리는지 회귀 시험.
// 저장소 메서드를 감싸 부를 때마다 조금 늦게 끝나게 하고, 앞선 부름이 끝난 뒤에 시작한 부름을 다음 단계로 센다 (직렬 단계 수)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]) vi.stubEnv(k, "");
});
afterEach(() => vi.restoreAllMocks());

type Call = { name: string; start: number; end: number; depth: number };
/** obj의 methods를 감싸 부름마다 직렬 단계(depth)를 적는다 */
function track<T extends object>(log: Call[], obj: T, methods: (keyof T & string)[], label = "") {
  let clock = 0;
  for (const m of methods) {
    const orig = (obj[m] as (...a: unknown[]) => Promise<unknown>).bind(obj);
    (obj as Record<string, unknown>)[m] = async (...args: unknown[]) => {
      const start = ++clock;
      const depth = 1 + log.filter((c) => c.end <= start && c.end > 0).reduce((d, c) => Math.max(d, c.depth), 0);
      const c: Call = { name: `${label}${m}`, start, end: 0, depth };
      log.push(c);
      await new Promise((r) => setTimeout(r, 2));
      try {
        return await orig(...args);
      } finally {
        c.end = ++clock;
      }
    };
  }
}
const depthOf = (log: Call[]) => log.reduce((d, c) => Math.max(d, c.depth), 0);

describe("랭킹 내 줄 (lib/rankMemo)", () => {
  type Row = { accountId: string; rank: number; points: number };
  const board = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ accountId: `u${i}`, rank: i + 1, points: 1000 - i }));

  it("판을 기억한 뒤 상위 밖 내 줄은 순위와 닉네임 꾸미기를 함께 한 단계로 읽는다 (예전 2단계)", async () => {
    const log: Call[] = [];
    const src = { fetch: async (limit: number, me: string | null) => ({ rows: board(Math.min(limit, 60)), mine: me ? { accountId: me, rank: 99, points: 1 } : null }) };
    track(log, src, ["fetch"]);
    const store = new TtlMemo<unknown>(30_000);
    const f = memoTopFetch<Row>("k", src.fetch, null, { store, style: false });
    await f(50, null); // 판 기억
    log.length = 0;
    const r = await f(50, "me");
    expect(r.mine).toMatchObject({ accountId: "me", rank: 99 });
    expect(depthOf(log)).toBe(1);
    expect(log.map((c) => c.name)).toEqual(["fetch"]);
  });

  it("판이 아직 없으면 내 줄을 판과 함께 읽기 시작한다 (판 1단계 + 내 줄 0단계 더)", async () => {
    const log: Call[] = [];
    const src = { fetch: async (limit: number, me: string | null) => ({ rows: board(Math.min(limit, 60)), mine: me ? { accountId: me, rank: 99, points: 1 } : null }) };
    track(log, src, ["fetch"]);
    const f = memoTopFetch<Row>("k", src.fetch, null, { store: new TtlMemo<unknown>(30_000), style: false });
    const r = await f(50, "me");
    expect(r.mine).toMatchObject({ accountId: "me" });
    expect(depthOf(log)).toBe(1);
    // 내가 상위 안이면 미리 읽은 내 줄은 버리고 판의 줄을 쓴다
    const r2 = await memoTopFetch<Row>("k2", src.fetch, null, { store: new TtlMemo<unknown>(30_000), style: false })(50, "u3");
    expect(r2.mine).toMatchObject({ accountId: "u3", rank: 4 });
  });

  it("styleMine은 이미 꾸미기를 붙인 내 줄을 다시 읽지 않는다 (붙지 않은 줄은 예전처럼 읽는다)", async () => {
    const plain = { accountId: "x", rank: 70 };
    // 상위 줄에도 없고 표시도 없으면 그대로 한 번 읽는다 (메모리 저장소 — 꾸미기 없음)
    expect(await styleMine([], plain)).toEqual(plain);
  });
});

describe("사냥 레벨 랭킹 (lib/huntLevelRank)", () => {
  const ch = (level: number, exp: number, weapon: string | null = null): HuntLevelInput => ({ level, exp, runs: 1, equip: { weapon } });

  it("내 캐릭터·판을 함께, 기록·이름·내 순위를 함께 → 2단계 (예전 5단계). 결과는 예전과 같다", async () => {
    const accounts = new MemoryAccounts(() => null as never);
    const store = new MemoryHuntLevel(() => accounts);
    const rpg = new MemoryRpgStore();
    for (let i = 0; i < 12; i++) await recordHuntLevel(`p${i}`, ch(20 + i, i), { store, staffId: "op" });
    // 내 캐릭터는 판에 적힌 것보다 올라 있다 (판 밖 → 지금 점수로 순위)
    await recordHuntLevel("me", ch(3, 0, "w_keyboard"), { store, staffId: "op" });
    await rpg.update("me", (c) => ({ state: { ...c, level: 25, exp: 7, runs: 3, equip: { ...c.equip, weapon: "w_ruler" } }, result: null }));
    await store.fill.set(FILL_DONE); // 옛 기록 채우기는 운영에서 이미 끝났다
    const log: Call[] = [];
    track(log, store, ["top", "put", "info", "countAbove"]);
    track(log, rpg, ["get"], "rpg.");
    const r = await huntLevelRank("me", 5, { store, rpg, staffId: "op", isBanned: async () => false });
    expect(depthOf(log)).toBe(2);
    // 25레벨은 p11(31)~p6(26) 6명 아래, 같은 레벨 p5(경험치 5)보다 경험치 7이 앞선다 → 7위 (판 5명 밖)
    expect(r.rows.map((x) => x.accountId)).toEqual(["p11", "p10", "p9", "p8", "p7"]);
    expect(r.mine).toMatchObject({ accountId: "me", value: 25, rank: 7, gear: "w_ruler" });
    // 기록도 지금 점수로 고쳐 적었다
    expect((await store.top(20)).findIndex((e) => e.accountId === "me")).toBe(6);
  });
});

describe("관리자 회원 훑기 (lib/adminMembers)", () => {
  it("요약 읽기를 다음 훑기와 겹친다: 직렬 단계 = 훑기 수 + 1 (예전 훑기 수 × 2)", async () => {
    const accounts = new MemoryAccounts(() => null as never);
    for (let i = 0; i < 12_000; i++) await accounts.enter(`a${i}`, { color: "#9fc5a8", body: "hood" }, 1_000 + i);
    const log: Call[] = [];
    track(log, accounts, ["scanIds", "summaries"]);
    const r = await scanAllAccounts(accounts);
    const scans = log.filter((c) => c.name === "scanIds").length;
    expect(r.rows.length).toBe(12_000);
    expect(r.partial).toBe(false);
    expect(scans).toBe(3); // 5000개씩
    expect(depthOf(log)).toBe(scans + 1);
  });
});

describe("관리자 신고함 방명록 (lib/housing)", () => {
  it("여러 집의 방명록 신고 수를 한 번에 읽는다 (집마다 차례로 읽지 않게)", async () => {
    const store = new MemoryHouseStore();
    const many = vi.spyOn(store, "guestReportsMany");
    const each = vi.spyOn(store, "guestReports");
    const m = await store.guestReportsMany(["h1", "h2"]);
    expect([...m.keys()]).toEqual(["h1", "h2"]);
    expect(m.get("h1")?.size).toBe(0);
    expect(many).toHaveBeenCalledTimes(1);
    expect(each).toHaveBeenCalledTimes(2); // 메모리는 집마다 (Redis는 파이프라인 한 번 — housing-redis 시험)
  });
});

describe("랭킹 채우기 표시 (lib/rankFill)", () => {
  it("done을 한 번 본 뒤에는 Redis에 다시 묻지 않는다", async () => {
    const get = vi.fn(async () => FILL_DONE);
    const set = vi.fn(async () => "OK");
    const mark = new RedisFillMark({ get, set } as never, "k");
    expect(await mark.get()).toBe(FILL_DONE);
    expect(await mark.get()).toBe(FILL_DONE);
    expect(get).toHaveBeenCalledTimes(1);
    // 아직이면 계속 묻는다
    const get2 = vi.fn(async () => "123");
    const mark2 = new RedisFillMark({ get: get2, set } as never, "k");
    await mark2.get();
    await mark2.get();
    expect(get2).toHaveBeenCalledTimes(2);
    await mark2.set(FILL_DONE);
    await mark2.get();
    expect(get2).toHaveBeenCalledTimes(2);
  });
});
