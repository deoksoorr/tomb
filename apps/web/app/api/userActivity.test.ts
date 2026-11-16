import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { REGULAR_RULE, tierOf, VIP_RULE } from "@/lib/activityRules";
import { addDays, dayStartMs, gameDay } from "@/lib/gameDay";
import { setStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { MemoryAccounts } from "@/lib/store/accounts-memory";
import { MemoryStore } from "@/lib/store/memory";
import { DORMANT_MS, PRESENCE_TICK_MS, type AccountSummary } from "@/lib/store/types";
import { getActivity, MemoryActivity } from "@/lib/store/userActivity";
import { bucketOf, buildActivityReport, seedActivity, type UserActivityReport } from "@/lib/userActivity";
import * as activityRoute from "./admin/activity/route";
import * as presence from "./me/presence/route";
import * as session from "./session/route";

// 관리자 「유저 활동」: 날마다 한 번 활동 기록 · 리텐션 계산 · 등급 · 마지막 접속 구간 · 운영자 빼기 (메모리 구성만)

const ADMIN = { "x-admin-key": "dev-admin" };
const DAY_MS = 86_400_000;
/** 2026-11-16 (월) 한국 시간 낮 12시 */
const NOW = Date.UTC(2026, 10, 16, 3, 0);
const TODAY = gameDay(NOW);
const at = (day: string, hours = 1) => dayStartMs(day) + hours * 3_600_000;

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
});

function acct(id: string, p: Partial<AccountSummary> = {}): AccountSummary {
  return { accountId: id, name: id, createdAt: 0, lastSeenAt: 0, points: 0, renameRequired: false, hasCode: false, stayMinutes: 0, lifetimePoints: 0, ...p };
}
function setsOf(active: Record<string, string[]>): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const [id, days] of Object.entries(active)) for (const d of days) (m.get(d) ?? m.set(d, new Set()).get(d)!).add(id);
  return m;
}
const report = (accounts: AccountSummary[], active: Record<string, string[]>, opts: { staffId?: string; includeStaff?: boolean; since?: string } = {}) =>
  buildActivityReport({ now: NOW, accounts, sets: setsOf(active), since: opts.since ?? "20261001", staffId: opts.staffId ?? null, includeStaff: !!opts.includeStaff });

describe("활동 기록 (날마다 한 번)", () => {
  it("같은 날은 한 번만 세고, 날이 바뀌면 다시 센다. 가장 이른 날을 기억한다", async () => {
    const s = new MemoryActivity();
    expect(await s.record([["u1", "20261115"]])).toBe(1);
    expect(await s.record([["u1", "20261115"]])).toBe(0);
    expect(await s.record([["u1", "20261116"], ["u2", "20261114"]])).toBe(2);
    expect(await s.activeDays(["u1", "u2", "x"])).toEqual([2, 1, 0]);
    expect(await s.since()).toBe("20261114");
    expect([...(await s.daySets(["20261116"])).get("20261116")!]).toEqual(["u1"]);
  });

  it("머무르기 라우트는 그날 첫 기록에서만 남긴다", async () => {
    const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "x-forwarded-for": "10.91.0.1" } }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const { visitorId } = (await res.json()) as { visitorId: string };
    const tick = (t: number) => {
      vi.spyOn(Date, "now").mockReturnValue(t);
      return presence.POST(new NextRequest("http://localhost/api/me/presence?lite=1&sid=sidACTIVITY1", { method: "POST", headers: { cookie, "x-forwarded-for": "10.91.0.1" } }));
    };
    const t0 = Date.now();
    expect((await tick(t0)).status).toBe(200);
    expect((await tick(t0 + PRESENCE_TICK_MS)).status).toBe(200);
    expect(await getActivity().activeDays([visitorId])).toEqual([1]);
    expect((await getActivity().daySets([gameDay(t0)])).get(gameDay(t0))!.has(visitorId)).toBe(true);
    // 다음 날 첫 기록
    expect((await tick(t0 + DAY_MS)).status).toBe(200);
    expect(await getActivity().activeDays([visitorId])).toEqual([2]);
  });
});

describe("리텐션 계산", () => {
  // 11/1(일)에 a·b 가입, 11/2(월)에 c 가입
  const accounts = [
    acct("a", { createdAt: at("20261101"), lastSeenAt: at("20261108") }),
    acct("b", { createdAt: at("20261101"), lastSeenAt: at("20261101") }),
    acct("c", { createdAt: at("20261102"), lastSeenAt: at(TODAY) }),
  ];
  const active = { a: ["20261101", "20261102", "20261104", "20261108"], b: ["20261101"], c: ["20261103", TODAY] };

  it("일별: 정확히 D일 뒤 활동, 7일 안에 한 번이라도. 끝나지 않은 날은 null", () => {
    const r = report(accounts, active);
    const nov1 = r.cohorts.find((c) => c.day === "20261101")!;
    // D1, D3, D7, D14, D30
    expect(nov1).toMatchObject({ size: 2, returned: [1, 1, 1, 0, null], within7: 1 });
    const nov2 = r.cohorts.find((c) => c.day === "20261102")!;
    // D14(11/16)는 오늘이라 아직
    expect(nov2).toMatchObject({ size: 1, returned: [1, 0, 0, null, null], within7: 1 });
    // 오늘 전날 가입 묶음은 D1이 오늘이라 아직 못 센다
    expect(r.cohorts[0]).toMatchObject({ day: addDays(TODAY, -1), returned: [null, null, null, null, null], within7: null });
    // 전체 = 셀 수 있는 묶음만 더한다
    expect(r.cohortTotal.size[0]).toBe(r.cohorts.filter((c) => c.returned[0] !== null).reduce((n, c) => n + c.size, 0));
    expect(r.cohortTotal.returned[0]).toBe(2);
    expect(r.cohortTotal.within7).toEqual({ size: 3, returned: 2 });
  });

  it("기록이 시작되기 전 날은 세지 않는다", () => {
    const r = report(accounts, active, { since: "20261104" });
    expect(r.cohorts.find((c) => c.day === "20261101")).toMatchObject({ returned: [null, 1, 1, 0, null], within7: null });
  });

  it("주별: 가입한 주 다음 W주에 한 번이라도. 끝나지 않은 주는 null", () => {
    const r = report(accounts, active);
    // 11/1(일)은 10/26 주, 11/2(월)은 11/2 주. 이번 주는 11/16
    expect(r.weekly.find((w) => w.week === "20261026")).toMatchObject({ size: 2, returned: [1, 0, null, null] });
    expect(r.weekly.find((w) => w.week === "20261102")).toMatchObject({ size: 1, returned: [0, null, null, null] });
    expect(r.weekly).toHaveLength(8);
    expect(r.weekly[0].week).toBe("20261109");
  });

  it("요약: DAU·WAU·MAU·신규", () => {
    const r = report(accounts, active);
    expect(r.summary).toMatchObject({ dau: 1, dauYesterday: 0, wau: 1, mau: 3, new1: 0, new7: 0, new30: 3 });
    expect(r.summary.stickiness).toBeCloseTo(1 / 7 / 3);
  });
});

describe("등급 · 마지막 접속 · 떠난 단골", () => {
  it("등급 기준 경계", () => {
    expect(tierOf(VIP_RULE.days, VIP_RULE.hours * 60)).toBe("vip");
    expect(tierOf(VIP_RULE.days, VIP_RULE.hours * 60 - 1)).toBe("regular");
    expect(tierOf(REGULAR_RULE.days, 0)).toBe("regular");
    expect(tierOf(REGULAR_RULE.days - 1, 99_999)).toBeNull();
  });

  it("최근 30일 활동한 날로 VIP·단골을 나누고 VIP가 먼저", () => {
    const last = (n: number) => Array.from({ length: n }, (_, i) => addDays(TODAY, -i));
    const r = report(
      [acct("vip", { stayMinutes: VIP_RULE.hours * 60, lastSeenAt: NOW }), acct("reg", { stayMinutes: 10, lastSeenAt: NOW }), acct("few", { lastSeenAt: NOW })],
      { vip: last(VIP_RULE.days), reg: last(REGULAR_RULE.days), few: last(3) },
    );
    expect(r.tiers.map((u) => [u.accountId, u.tier])).toEqual([
      ["vip", "vip"],
      ["reg", "regular"],
    ]);
    expect(r.frequent.map((u) => u.accountId)).toEqual(["vip", "reg", "few"]);
    expect(r.frequent[0]).toMatchObject({ days7: 7, days30: VIP_RULE.days });
  });

  it("마지막 접속 구간 (게임 날짜 기준, 90일 넘으면 휴면)", () => {
    const ago = (d: number) => bucketOf({ lastSeenAt: NOW - d * DAY_MS, renameRequired: false }, NOW);
    expect([0, 1, 3, 4, 7, 8, 30, 31, 89].map(ago)).toEqual(["today", "d3", "d3", "d7", "d7", "d30", "d30", "d90", "d90"]);
    expect(bucketOf({ lastSeenAt: NOW - DORMANT_MS - 1, renameRequired: false }, NOW)).toBe("dormant");
    expect(bucketOf({ lastSeenAt: NOW, renameRequired: true }, NOW)).toBe("dormant");
    expect(bucketOf({ lastSeenAt: 0, renameRequired: false }, NOW)).toBe("none");
  });

  it("떠난 단골: 7~30일 안 왔고 마지막 접속까지 30일 동안 단골 기준을 넘었던 계정", () => {
    const lastDay = addDays(TODAY, -10);
    const before = (n: number) => Array.from({ length: n }, (_, i) => addDays(lastDay, -i));
    const r = report(
      [
        acct("gone", { lastSeenAt: at(lastDay) }),
        acct("light", { lastSeenAt: at(lastDay) }),
        acct("recent", { lastSeenAt: at(addDays(TODAY, -3)) }),
      ],
      { gone: before(REGULAR_RULE.days), light: before(2), recent: Array.from({ length: 15 }, (_, i) => addDays(TODAY, -3 - i)) },
    );
    expect(r.gone.map((u) => [u.accountId, u.awayDays, u.daysBefore, u.tierBefore])).toEqual([["gone", 10, REGULAR_RULE.days, "regular"]]);
    expect(r.buckets.find((b) => b.id === "d30")?.count).toBe(2);
    expect(r.buckets.find((b) => b.id === "d3")?.count).toBe(1);
  });

  it("운영자 계정은 기본으로 빼고, 넣기를 고르면 센다", () => {
    const accounts = [acct("op", { createdAt: at(TODAY), lastSeenAt: NOW }), acct("u", { createdAt: at(TODAY), lastSeenAt: NOW })];
    const active = { op: [TODAY], u: [TODAY] };
    const off = report(accounts, active, { staffId: "op" });
    expect(off).toMatchObject({ accounts: 1, summary: { dau: 1, new1: 1 } });
    expect(off.frequent.map((x) => x.accountId)).toEqual(["u"]);
    const on = report(accounts, active, { staffId: "op", includeStaff: true });
    expect(on).toMatchObject({ accounts: 2, summary: { dau: 2, new1: 2 } });
  });
});

describe("기록 전 활동 채우기 · 라우트", () => {
  it("남은 머무르기 기록과 그 안의 가입일·마지막 접속일로 채우고, 두 번 돌려도 그대로", async () => {
    const accounts = new MemoryAccounts(() => new MemoryStore());
    const activity = new MemoryActivity();
    const yesterday = at(addDays(TODAY, -1), 3);
    await accounts.enter("s1", { name: "채우기1" }, yesterday);
    await accounts.presenceTick("s1", addDays(TODAY, -1), yesterday, "sidSEED0001");
    // 오래전 가입·접속 (남은 기록 밖)
    await accounts.enter("s2", { name: "채우기2" }, NOW - 40 * DAY_MS);
    const run = async () => {
      let cursor = "0";
      let recorded = 0;
      do {
        const r = await seedActivity(cursor, 1, NOW, accounts, activity);
        cursor = r.next;
        recorded += r.recorded;
      } while (cursor !== "0");
      return recorded;
    };
    expect(await run()).toBe(1);
    expect(await run()).toBe(0);
    expect(await activity.activeDays(["s1", "s2"])).toEqual([1, 0]);
    expect(await activity.since()).toBe(addDays(TODAY, -1));
  });

  it("보고서 라우트는 관리자만, 운영자 빼기가 기본", async () => {
    const call = (q: string) => new NextRequest(`http://localhost/api/admin/activity${q}`, { headers: { "x-forwarded-for": "10.91.0.2", ...ADMIN } });
    expect((await activityRoute.GET(new NextRequest("http://localhost/api/admin/activity", { headers: { "x-forwarded-for": "10.91.0.2" } }))).status).toBe(401);
    const now = Date.now();
    const accounts = getAccounts();
    await accounts.enter("act-op", { name: "활동운영자" }, now);
    await accounts.enter("act-user", { name: "활동유저" }, now);
    await getActivity().record([
      ["act-op", gameDay(now)],
      ["act-user", gameDay(now)],
    ]);
    await setStaff("act-op");
    const body = async (q: string) => (await (await activityRoute.GET(call(q))).json()) as UserActivityReport;
    const off = await body("?fresh=1");
    expect(off.includeStaff).toBe(false);
    expect(off.frequent.map((u) => u.accountId)).toContain("act-user");
    expect(off.frequent.map((u) => u.accountId)).not.toContain("act-op");
    const on = await body("?staff=1&fresh=1");
    expect(on.frequent.map((u) => u.accountId)).toContain("act-op");
    expect(on.frequent.find((u) => u.accountId === "act-user")?.totalDays).toBeGreaterThanOrEqual(1);
  });
});
