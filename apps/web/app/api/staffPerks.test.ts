import { ITEMS, verifyGrant } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import type { ApiError, CalendarClaimResponse, Me, StayBonusResponse, UseItemResponse } from "@/lib/types";
import * as devClock from "./dev/clock/route";
import * as attend from "./me/attend/route";
import * as claim from "./me/calendar/claim/route";
import * as stayBonus from "./me/stay-bonus/route";
import * as session from "./session/route";
import * as use from "./shop/use/route";

// 운영자 계정: 폭죽 무제한(가방에서 빼지 않음) · 출석 도장·접속 시간 보너스 없음. 일반 계정은 그대로
const SECRET = "dev-join-secret-change-me";
/** 2026-11-12 12:00 KST (자정 근처에서 돌아도 날짜가 바뀌지 않게 시계를 고정한다) */
const NOON = Date.UTC(2026, 10, 12, 3, 0);
const FIREWORKS = ITEMS.filter((i) => i.kind === "firework").map((i) => i.id);

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
});

type Visitor = { cookie: string; ip: string; id: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const errOf = async (res: Response | Promise<Response>) => {
  const r = await res;
  return { status: r.status, code: ((await r.json()) as ApiError).error.code };
};
async function newVisitor(name: string): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.8.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`, id: (await bodyOf<{ visitorId: string }>(res)).visitorId };
  await attend.POST(call("/api/me/attend", { visitor: v, body: { name } }));
  return v;
}
const giveItem = (v: Visitor, itemId: string, n: number) => {
  (getAccounts() as unknown as { acct(id: string): { inv: Map<string, number> } }).acct(v.id).inv.set(itemId, n);
};
const fire = (v: Visitor, itemId: string) => use.POST(call("/api/shop/use", { visitor: v, body: { itemId } }));
const clock = (v: Visitor, minutes: number) => devClock.POST(call("/api/dev/clock", { visitor: v, body: { minutes } }));

describe("운영자 폭죽 무제한", () => {
  it("가방에 없어도 모든 폭죽의 사용권을 받고, 가방은 줄지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const op = await newVisitor("폭죽운영자");
    await setStaff(op.id);
    for (const itemId of FIREWORKS) {
      const res = await bodyOf<UseItemResponse>(fire(op, itemId));
      expect(await verifyGrant(SECRET, res.grant!)).toMatchObject({ kind: "firework", visitorId: op.id, item: itemId });
      expect(res.me.staff).toBe(true);
    }
    // 가방에 있던 폭죽도 그대로
    giveItem(op, FIREWORKS[0], 2);
    const a = await bodyOf<UseItemResponse>(fire(op, FIREWORKS[0]));
    const b = await bodyOf<UseItemResponse>(fire(op, FIREWORKS[0]));
    expect(a.me.inventory[FIREWORKS[0]]).toBe(2);
    expect(b.me.inventory[FIREWORKS[0]]).toBe(2);
    // 사용권마다 nonce가 다르다 (실시간 서버는 nonce 한 번만 — 운영자도 같은 검사)
    const nonceOf = async (t: string) => {
      const g = await verifyGrant(SECRET, t);
      return g?.kind === "firework" ? g.nonce : null;
    };
    const [na, nb] = await Promise.all([nonceOf(a.grant!), nonceOf(b.grant!)]);
    expect(na).toBeTruthy();
    expect(na).not.toBe(nb);
  });

  it("일반 계정은 그대로: 가방에서 1개 빠지고, 없으면 NO_ITEM", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const v = await newVisitor("폭죽손님");
    expect(await errOf(fire(v, FIREWORKS[0]))).toEqual({ status: 409, code: "NO_ITEM" });
    giveItem(v, FIREWORKS[0], 1);
    const used = await bodyOf<UseItemResponse>(fire(v, FIREWORKS[0]));
    expect(used.grant).toBeTruthy();
    expect(used.me.inventory[FIREWORKS[0]]).toBeUndefined();
    expect(await errOf(fire(v, FIREWORKS[0]))).toEqual({ status: 409, code: "NO_ITEM" });
  });

  it("운영자 지정이 풀리면 다시 가방에서 뺀다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const op = await newVisitor("전운영자");
    await setStaff(op.id);
    expect((await fire(op, FIREWORKS[0])).status).toBe(200);
    await setStaff(null);
    expect(await errOf(fire(op, FIREWORKS[0]))).toEqual({ status: 409, code: "NO_ITEM" });
  });
});

describe("운영자 출석·접속 보너스 없음", () => {
  it("운영자는 1시간 머물러도 출석 도장·접속 보너스를 거절(403)하고 적립·도장이 남지 않는다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const op = await newVisitor("출석운영자");
    await setStaff(op.id);
    await clock(op, 60);
    expect(await errOf(claim.POST(call("/api/me/calendar/claim", { method: "POST", visitor: op })))).toEqual({ status: 403, code: "STAFF_NO_REWARD" });
    expect(await errOf(stayBonus.POST(call("/api/me/stay-bonus", { method: "POST", visitor: op })))).toEqual({ status: 403, code: "STAFF_NO_REWARD" });
    const { me } = await bodyOf<{ me: Me; earned: number }>(attend.POST(call("/api/me/attend", { visitor: op, body: {} })));
    expect(me.attendance).toMatchObject({ today: false, streak: 0, bonusClaimed: 0 });
    expect(me.earnedBy?.attend).toBeUndefined();
    expect(me.earnedBy?.stayBonus).toBeUndefined();
  });

  it("입장 때 출석 처리는 운영자·일반 모두 0P", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const op = await newVisitor("입장운영자");
    await setStaff(op.id);
    const v = await newVisitor("입장손님");
    for (const who of [op, v]) {
      const res = await bodyOf<{ me: Me; earned: number }>(attend.POST(call("/api/me/attend", { visitor: who, body: {} })));
      expect(res.earned).toBe(0);
    }
  });

  it("일반 계정은 그대로: 출석 도장 +10P, 접속 보너스 받기", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOON);
    const v = await newVisitor("출석손님");
    await clock(v, 60);
    const stamped = await bodyOf<CalendarClaimResponse>(claim.POST(call("/api/me/calendar/claim", { method: "POST", visitor: v })));
    expect(stamped.earned).toEqual({ daily: 10, streak: 0, monthly: 0 });
    expect(stamped.me.attendance).toMatchObject({ today: true, streak: 1 });
    const bonus = await bodyOf<StayBonusResponse>(stayBonus.POST(call("/api/me/stay-bonus", { method: "POST", visitor: v })));
    expect(bonus.earned).toBeGreaterThan(0);
    expect(bonus.me.attendance.bonusClaimed).toBeGreaterThan(0);
  });
});
