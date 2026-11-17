import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DAILY_EARN_CAP, EARN_RULES, earnRule, inDailyTotal } from "@/lib/economy";
import { setStaff } from "@/lib/staff";
import { STAFF_EARN_TODAY_MAX, staffEarnViews, type StaffEarnResponse } from "@/lib/staffEarn";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { MemoryEarnStatus, RedisEarnStatus } from "@/lib/store/earnStatus";
import { setPointEvent } from "@/lib/store/pointEvent";
import { MemoryActivity, recordActive } from "@/lib/store/userActivity";
import type { ApiError } from "@/lib/types";
import * as session from "./session/route";
import * as earn from "./staff/earn/route";

// 11/17 지금 채널 = 실시간 서버의 접속 명단 + 자리(채널) 조회 — 테스트에선 흉내
const rt = vi.hoisted(() => ({ online: null as string[] | null, ch: new Map<string, number>() }));
vi.mock("@/lib/ban", async (orig) => ({
  ...(await orig<typeof import("@/lib/ban")>()),
  onlineVisitorIds: async () => rt.online,
  whereOf: async (ids: string[]) => Object.fromEntries(ids.filter((id) => rt.ch.has(id)).map((id) => [id, { ch: rt.ch.get(id)!, sid: 1, x: 0, y: 0 }])),
}));

// 운영자 「포인트 현황」: 운영자 세션만 · 이름/오늘 모드 · 오늘 값 · 운영자 자신 제외 · 포인트 배수 이벤트 한도 · 한 번에 읽기 · 요청 한도

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
  await setPointEvent(null);
});

type Visitor = { cookie: string; ip: string; id: string; name: string };
let seq = 0;

function call(v: Visitor | undefined, body: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (v) Object.assign(headers, { cookie: v.cookie, "x-forwarded-for": v.ip });
  return new NextRequest("http://localhost/api/staff/earn", { method: "POST", headers, body: JSON.stringify(body) });
}

async function newVisitor(prefix = "현황"): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const id = ((await res.json()) as { visitorId: string }).visitorId;
  const name = `${prefix}${++seq}`;
  await getAccounts().enter(id, { name, color: "#9fc5a8", body: "hood" }, Date.now());
  return { cookie, ip: `10.77.${seq}.1`, id, name };
}

const ask = (v: Visitor | undefined, body: unknown) => earn.POST(call(v, body));
const ok = async (res: Response) => {
  expect(res.status).toBe(200);
  return (await res.json()) as StaffEarnResponse;
};
const errCode = async (res: Response) => ((await res.json()) as ApiError).error.code;
const give = (id: string, source: Parameters<typeof earnRule>[0], amount: number) => getAccounts().earn(id, source, kstDay(), { amount });

describe("운영자만", () => {
  it("세션이 없으면 401, 일반 계정은 403, 운영자 계정은 볼 수 있다", async () => {
    const [user, staff] = [await newVisitor(), await newVisitor()];
    await setStaff(staff.id);
    expect((await ask(undefined, { mode: "today" })).status).toBe(401);
    const r = await ask(user, { mode: "today" });
    expect(r.status).toBe(403);
    expect(await errCode(r)).toBe("FORBIDDEN");
    await ok(await ask(staff, { mode: "today" }));
    // 잘못된 요청 모양은 400
    expect((await ask(staff, { mode: "names", names: [] })).status).toBe(400);
    expect((await ask(staff, { mode: "names", names: Array.from({ length: 61 }, (_, i) => `n${i}`) })).status).toBe(400);
  });

  it("요청이 잦으면 429 (분당 12번)", async () => {
    const staff = await newVisitor();
    await setStaff(staff.id);
    for (let i = 0; i < 12; i++) expect((await ask(staff, { mode: "today" })).status).toBe(200);
    const r = await ask(staff, { mode: "today" });
    expect(r.status).toBe(429);
    expect(await errCode(r)).toBe("RATE_LIMITED");
  });
});

describe("오늘 받은 포인트", () => {
  it("이름 모드: 사람마다 오늘 합계·항목별 값. 운영자 자신은 빠지고, 못 찾은 이름은 missing. 계정 id는 나가지 않는다", async () => {
    const [full, half, idle, staff] = [await newVisitor(), await newVisitor(), await newVisitor(), await newVisitor()];
    await setStaff(staff.id);
    // full: 하루 전체 한도를 다 채운다
    for (const r of EARN_RULES.filter((x) => inDailyTotal(x.source))) await give(full.id, r.source, r.dailyMax);
    await give(half.id, "hunt", 300);
    await give(half.id, "bugs", 50);
    await give(staff.id, "hunt", 100);
    const spy = vi.spyOn(MemoryEarnStatus.prototype, "today");

    const r = await ok(await ask(staff, { mode: "names", names: [idle.name, half.name, full.name, staff.name, "없는사람"] }));
    expect(r.day).toBe(kstDay());
    expect(r.missing).toEqual(["없는사람"]);
    expect(r.rows.map((x) => x.name)).toEqual([idle.name, half.name, full.name]);
    expect(r.rows[1]).toEqual({ name: half.name, total: 350, by: { hunt: 300, bugs: 50 } });
    expect(r.rows[0]).toEqual({ name: idle.name, total: 0, by: {} });
    expect(r.rows[2].total).toBe(DAILY_EARN_CAP);
    expect(JSON.stringify(r)).not.toContain(full.id);
    // 사람 수와 상관없이 한 번에 읽는다
    expect(spy).toHaveBeenCalledTimes(1);

    // 화면 계산: 많이 채운 순, 비율·다 채움 (내 정보 게이지와 같은 함수)
    const views = staffEarnViews(r.rows, r.boost);
    expect(views.map((v) => [v.name, v.pct, v.full])).toEqual([
      [full.name, 100, true],
      [half.name, Math.round((350 / DAILY_EARN_CAP) * 100), false],
      [idle.name, 0, false],
    ]);
    expect(views[1].view.main.find((x) => x.source === "hunt")).toMatchObject({ value: 300, max: earnRule("hunt").dailyMax });
  });

  it("오늘 모드: 오늘 들어온 계정 모두 (받은 것이 없으면 0P). 오늘 기록이 없는 계정·운영자는 빠진다", async () => {
    const [a, b, idle, absent, staff] = [await newVisitor(), await newVisitor(), await newVisitor(), await newVisitor(), await newVisitor()];
    await setStaff(staff.id);
    for (const v of [a, b, idle, staff]) await recordActive(v.id, kstDay());
    await give(a.id, "fish", 120);
    await give(b.id, "presence", 5);
    await give(absent.id, "hunt", 100); // 활동 기록이 없는 계정 (오늘 목록은 활동 기록 기준)
    await give(staff.id, "hunt", 100);
    const spy = vi.spyOn(MemoryEarnStatus.prototype, "today");
    const r = await ok(await ask(staff, { mode: "today" }));
    const names = r.rows.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining([a.name, b.name, idle.name]));
    expect(names).not.toContain(absent.name);
    expect(names).not.toContain(staff.name);
    expect(r.rows.find((x) => x.name === a.name)).toEqual({ name: a.name, total: 120, by: { fish: 120 } });
    expect(r.rows.find((x) => x.name === idle.name)).toEqual({ name: idle.name, total: 0, by: {} });
    expect(staffEarnViews(r.rows, r.boost).find((v) => v.name === idle.name)?.pct).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.truncated).toBeUndefined();
  });

  it(`오늘 모드: 오늘 들어온 계정이 ${STAFF_EARN_TODAY_MAX}명보다 많으면 그만큼만 한 번에 읽고 truncated`, async () => {
    const staff = await newVisitor();
    await setStaff(staff.id);
    const ids = [staff.id, ...Array.from({ length: STAFF_EARN_TODAY_MAX + 5 }, (_, i) => `many${String(i).padStart(4, "0")}`)];
    vi.spyOn(MemoryActivity.prototype, "daySets").mockImplementation(async (days) => new Map(days.map((d) => [d, new Set(ids)])));
    const spy = vi.spyOn(MemoryEarnStatus.prototype, "today");
    const r = await ok(await ask(staff, { mode: "today" }));
    expect(r.rows).toHaveLength(STAFF_EARN_TODAY_MAX);
    expect(r.truncated).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).not.toContain(staff.id);
  });

  it("포인트 배수 이벤트 날은 고른 항목 한도·하루 전체 한도가 늘어난 값으로 계산한다", async () => {
    const [p, staff] = [await newVisitor(), await newVisitor()];
    await setStaff(staff.id);
    await setPointEvent({ startAt: Date.now() - 60_000, endAt: null, sources: ["hunt"], mult: 2 });
    const huntMax = earnRule("hunt").dailyMax;
    expect(await give(p.id, "hunt", huntMax * 2)).toBe(huntMax * 2);
    const r = await ok(await ask(staff, { mode: "names", names: [p.name] }));
    expect(r.boost).toMatchObject({ mult: 2, caps: ["hunt"] });
    const [v] = staffEarnViews(r.rows, r.boost);
    expect(v.view.total).toMatchObject({ value: huntMax * 2, max: DAILY_EARN_CAP + huntMax });
    expect(v.view.main.find((x) => x.source === "hunt")).toMatchObject({ value: huntMax * 2, max: huntMax * 2, full: true, boosted: 2 });
    expect(v.full).toBe(false);
  });
});

describe("Redis 읽기 모양 (가짜 클라이언트 — 실제 Redis에 붙지 않는다)", () => {
  it("이름은 HMGET 한 번, 오늘 적립은 계정마다 [acct, earn] 키를 넘긴 Lua 한 번", async () => {
    const store = new RedisEarnStatus({ url: "https://example.invalid", token: "x" });
    const calls: { cmd: string; args: unknown[] }[] = [];
    const fake = {
      hmget: async (...args: unknown[]) => (calls.push({ cmd: "hmget", args }), { 가람: "id1" }),
      eval: async (...args: unknown[]) => (
        calls.push({ cmd: "eval", args }),
        [
          ["가람", ["hunt", "300", "_total", "350", "bugs", "50", "_stay", "4"]],
          ["", []],
        ]
      ),
    };
    (store as unknown as { redis: unknown }).redis = fake;

    expect(await store.owners(["가람", "없음"])).toEqual(["id1", null]);
    expect(calls[0]).toEqual({ cmd: "hmget", args: ["names", "가람", "없음"] });

    const t = await store.today(["id1", "id2"], "20261116");
    const ev = calls.filter((c) => c.cmd === "eval");
    expect(ev).toHaveLength(1);
    expect(ev[0].args[1]).toEqual(["acct:id1", "acct:id1:earn:20261116", "acct:id2", "acct:id2:earn:20261116"]);
    expect(t).toEqual([
      { name: "가람", total: 350, by: { hunt: 300, bugs: 50 } },
      { name: null, total: 0, by: {} },
    ]);
  });
});

describe("11/17 지금 채널 = 그 채널 접속자 모두 (맵 상관없이)", () => {
  it("실시간 서버 명단에서 그 채널 사람만, 운영자 자신은 빼고 · 실시간 서버에 못 닿으면 503", async () => {
    const [staff, a, b, c] = [await newVisitor("운영"), await newVisitor(), await newVisitor(), await newVisitor()];
    await setStaff(staff.id);
    await give(a.id, "fish", 10);
    rt.online = [staff.id, a.id, b.id, c.id];
    rt.ch = new Map([[staff.id, 1], [a.id, 1], [b.id, 1], [c.id, 2]]);
    const r = await ok(await ask(staff, { mode: "channel", channel: 1 }));
    expect(r.rows.map((x) => x.name).sort()).toEqual([a.name, b.name].sort());
    expect(r.rows.find((x) => x.name === a.name)?.total).toBeGreaterThan(0);
    rt.online = null;
    expect((await ask(staff, { mode: "channel", channel: 1 })).status).toBe(503);
  });
});

