import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminMembersResponse } from "@/lib/adminMembers";
import { setStaff } from "@/lib/staff";
import { stayText } from "@/lib/stayTime";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { MemoryAccounts } from "@/lib/store/accounts-memory";
import { MemoryStore } from "@/lib/store/memory";
import { PRESENCE_TICK_MS } from "@/lib/store/types";
import type { RankResponse } from "@/lib/types";
import * as adminList from "./admin/accounts/list/route";
import * as adminStay from "./admin/accounts/stay/route";
import * as rank from "./rank/route";

// 총 접속 시간: 머무르기마다 쌓기 · 접속 시간 랭킹 · 기록 전 머문 시간 채우기(두 번 돌려도 그대로) (메모리 구성만)

const ADMIN = { "x-admin-key": "dev-admin" };
const MIN = 60_000;
/** 한국 시간 낮 12시 (게임 날짜 한가운데) */
const T0 = Date.UTC(2026, 10, 16, 3, 0);
const DAY = kstDay(T0);

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
});

const fresh = () => new MemoryAccounts(() => new MemoryStore());
/** 같은 화면에서 n번 연달아 머무르기 (10분 간격) */
async function stay(accounts: MemoryAccounts, id: string, n: number, from = T0) {
  for (let i = 0; i < n; i++) await accounts.presenceTick(id, kstDay(from + i * PRESENCE_TICK_MS), from + i * PRESENCE_TICK_MS, `sid-${id}`);
}
/** 배포 전에 쌓인 기록처럼 총 접속 시간만 지운다 (날짜별 기록 `_stay`는 그대로) */
const forgetTotal = (accounts: MemoryAccounts, id: string) =>
  delete (accounts as unknown as { accts: Map<string, { stayMin?: number }> }).accts.get(id)!.stayMin;
const minutesOf = async (accounts: MemoryAccounts, id: string) => (await accounts.stayRank(100, id)).mine?.points ?? 0;

describe("총 접속 시간 쌓기", () => {
  it("머문 기록 1번 = 10분, 몰아서 정산하면 센 수만큼, 너무 이르면 그대로", async () => {
    const a = fresh();
    await a.presenceTick("u1", DAY, T0, "s1");
    expect(await minutesOf(a, "u1")).toBe(10);
    // 너무 이르다 (null)
    expect(await a.presenceTick("u1", DAY, T0 + 5 * MIN, "s1")).toBeNull();
    expect(await minutesOf(a, "u1")).toBe(10);
    // 같은 화면 30분 뒤 → 3번
    expect(await a.presenceTick("u1", DAY, T0 + 30 * MIN, "s1")).toMatchObject({ ticks: 3 });
    expect(await minutesOf(a, "u1")).toBe(40);
    const [summary] = await a.summaries(["u1"]);
    expect(summary?.stayMinutes).toBe(40);
  });

  it("포인트 하루 한도에 막혀도 머문 시간은 쌓인다", async () => {
    const a = fresh();
    await stay(a, "u1", 20);
    expect(await minutesOf(a, "u1")).toBe(200);
  });

  it("랭킹은 오래 머문 순, 기록 없는 계정은 빠지고 내 순위가 따로 나온다", async () => {
    const a = fresh();
    await stay(a, "a", 3);
    await stay(a, "b", 1);
    await stay(a, "c", 2);
    await a.earn("d", "hunt", DAY);
    const r = await a.stayRank(2, "b");
    expect(r.rows.map((x) => [x.accountId, x.points, x.rank])).toEqual([
      ["a", 30, 1],
      ["c", 20, 2],
    ]);
    expect(r.mine).toMatchObject({ accountId: "b", points: 10, rank: 3 });
    expect((await a.stayRank(10, "d")).mine).toBeNull();
  });

  it("123시간 45분 꼴로 보여 준다", () => {
    expect(stayText(0)).toBe("0분");
    expect(stayText(45)).toBe("45분");
    expect(stayText(180)).toBe("3시간");
    expect(stayText(123 * 60 + 45)).toBe("123시간 45분");
    expect(stayText(1234 * 60 + 5)).toBe("1,234시간 5분");
  });
});

describe("기록 전 머문 시간 채우기 (backfillStay)", () => {
  it("남은 날짜별 기록 합계로 올린다. 배포 뒤 센 기록은 두 번 세지 않고, 두 번 돌려도 그대로", async () => {
    const a = fresh();
    // 배포 전 2번 머묾 → 배포 뒤 1번 더 (날짜별 기록 3번, 총 접속 시간 10분)
    await stay(a, "u1", 2);
    forgetTotal(a, "u1");
    await stay(a, "u1", 1, T0 + 2 * PRESENCE_TICK_MS);
    expect(await minutesOf(a, "u1")).toBe(10);

    const now = T0 + 3 * PRESENCE_TICK_MS;
    expect(await a.backfillStay("0", 100, now)).toEqual({ next: "0", raised: 1, minutes: 20 });
    expect(await minutesOf(a, "u1")).toBe(30);
    // 다시 돌려도 그대로
    expect(await a.backfillStay("0", 100, now)).toEqual({ next: "0", raised: 0, minutes: 0 });
    expect(await minutesOf(a, "u1")).toBe(30);
    // 그 뒤 머문 시간은 그대로 쌓이고, 또 돌려도 늘지 않는다
    await stay(a, "u1", 1, T0 + 3 * PRESENCE_TICK_MS);
    expect(await minutesOf(a, "u1")).toBe(40);
    expect((await a.backfillStay("0", 100, now)).raised).toBe(0);
    expect(await minutesOf(a, "u1")).toBe(40);
  });

  it("이미 센 시간이 더 크면 줄이지 않고, 남지 않은 오래된 기록은 세지 않는다", async () => {
    const a = fresh();
    await stay(a, "big", 3);
    // 오늘 기록은 1번뿐인데 총 접속 시간은 더 크다 (예전 날짜에 쌓인 것)
    (a as unknown as { accts: Map<string, { stayMin?: number }> }).accts.get("big")!.stayMin = 500;
    // 4일 전 기록만 있는 계정 (날짜별 기록은 이미 사라졌을 때)
    const old = T0 - 4 * 86_400_000;
    await stay(a, "old", 2, old);
    forgetTotal(a, "old");
    expect(await a.backfillStay("0", 100, T0 + 3 * PRESENCE_TICK_MS)).toMatchObject({ raised: 0 });
    expect(await minutesOf(a, "big")).toBe(500);
    expect(await minutesOf(a, "old")).toBe(0);
  });

  it("count개씩 훑어 next가 0이 될 때까지 이어 부른다", async () => {
    const a = fresh();
    for (const id of ["p", "q", "r"]) {
      await stay(a, id, 2);
      forgetTotal(a, id);
    }
    let cursor = "0";
    let raised = 0;
    let rounds = 0;
    do {
      const r = await a.backfillStay(cursor, 1, T0 + 2 * PRESENCE_TICK_MS);
      cursor = r.next;
      raised += r.raised;
      rounds++;
    } while (cursor !== "0");
    expect(rounds).toBe(3);
    expect(raised).toBe(3);
    expect((await a.stayRank(10, null)).rows.map((x) => x.points)).toEqual([20, 20, 20]);
  });
});

describe("라우트 (메모리 저장소)", () => {
  const call = (path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    new NextRequest(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers: { "x-forwarded-for": "10.88.0.1", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

  it("공개 접속 시간 랭킹은 운영자를 빼고, 관리자 목록 접속 시간 순에는 운영자도 나온다", async () => {
    const accounts = getAccounts();
    const now = Date.now();
    const ids = { op: "stay-op", one: "stay-one", two: "stay-two" };
    for (const [key, id] of Object.entries(ids)) await accounts.enter(id, { name: `접속${key}` }, now);
    const ticks = { op: 5, one: 3, two: 1 };
    for (const [key, n] of Object.entries(ticks)) {
      const id = ids[key as keyof typeof ids];
      for (let i = 0; i < n; i++) await accounts.presenceTick(id, kstDay(now + i * PRESENCE_TICK_MS), now + i * PRESENCE_TICK_MS, `sid-${id}`);
    }
    await setStaff(ids.op);

    const res = await rank.GET(call("/api/rank?board=stay&period=week"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RankResponse;
    expect(body.period).toBe("all");
    expect(body.rows.map((r) => [r.name, r.value, r.rank])).toEqual([
      ["접속one", 30, 1],
      ["접속two", 10, 2],
    ]);

    const list = (await (await adminList.GET(call("/api/admin/accounts/list?sort=stay&fresh=1", { headers: ADMIN }))).json()) as AdminMembersResponse;
    expect(list.members.slice(0, 3).map((m) => [m.accountId, m.stayMinutes, m.status])).toEqual([
      [ids.op, 50, "staff"],
      [ids.one, 30, "normal"],
      [ids.two, 10, "normal"],
    ]);
  });

  it("채우기 라우트는 관리자만, 두 번 불러도 그대로", async () => {
    expect((await adminStay.POST(call("/api/admin/accounts/stay", { method: "POST", body: {} }))).status).toBe(401);
    const run = async () => {
      let cursor = "0";
      let raised = 0;
      do {
        const r = (await (await adminStay.POST(call("/api/admin/accounts/stay", { method: "POST", body: { cursor, count: 50 }, headers: ADMIN }))).json()) as {
          next: string;
          raised: number;
        };
        cursor = r.next;
        raised += r.raised;
      } while (cursor !== "0");
      return raised;
    };
    const accounts = getAccounts() as MemoryAccounts;
    const now = Date.now();
    await accounts.presenceTick("stay-legacy", kstDay(now), now, "sid-legacy");
    forgetTotal(accounts, "stay-legacy");
    expect(await run()).toBe(1);
    expect(await run()).toBe(0);
    expect((await accounts.stayRank(100, "stay-legacy")).mine?.points).toBe(10);
  });
});
