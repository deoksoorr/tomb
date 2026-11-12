import { isPermanentUntil, isShopListed, ITEMS, STAFF_ITEM_IDS, verifyJoinToken } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BALANCE_CAP } from "@/lib/economy";
import { getAnalytics } from "@/lib/analyticsService";
import type { AnalyticsReport } from "@/lib/analyticsReport";
import { adminActor } from "@/lib/ban";
import { grantStaffItems, setStaff } from "@/lib/staff";
import { getAccounts, getStore } from "@/lib/store";
import type { ApiError, CreateGraveResponse, JoinResponse, Me } from "@/lib/types";
import type { AdminStaffResponse } from "./admin/staff/route";
import * as adminAnalytics from "./admin/analytics/route";
import * as adminStaff from "./admin/staff/route";
import * as hit from "./analytics/hit/route";
import * as stay from "./analytics/stay/route";
import * as staffDelete from "./graves/[id]/staff/route";
import * as graves from "./graves/route";
import * as join from "./join/route";
import * as megaphone from "./megaphone/route";
import * as me from "./me/route";
import * as buy from "./shop/buy/route";
import * as session from "./session/route";

// 47번 방문 분석 · 31번 운영자 계정 (메모리 구성으로 라우트를 직접 부른다)

const ADMIN = { "x-admin-key": "dev-admin" };
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
beforeEach(() => {
  // 로비는 기본으로 무응답 (필요한 테스트만 덮는다)
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no lobby"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await setStaff(null);
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "user-agent": CHROME, ...opts.headers };
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;
async function newVisitor(ip = `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const v = { cookie: res.headers.get("set-cookie")!.split(";")[0], ip, visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId };
  await getAccounts().enter(v.visitorId, { name: `검수${ipSeq}`, color: "#9fc5a8", body: "hood" }, Date.now());
  return v;
}
const report = (range = "day") => bodyOf<AnalyticsReport>(adminAnalytics.GET(call(`/api/admin/analytics?range=${range}`, { headers: ADMIN })));

describe("47번 방문 기록", () => {
  it("처음 방문은 신규 + 방문 쿠키, 같은 쿠키로 다시 오면 재방문, 로봇은 세지 않는다", async () => {
    const before = (await report()).today;
    const first = await hit.POST(
      call("/api/analytics/hit", { body: { ref: "https://www.google.com/search?q=x", path: "/", utm: { source: "Kakao", medium: "chat", campaign: "open" } }, headers: { "user-agent": IPHONE, "x-vercel-ip-country": "kr", "x-forwarded-for": "10.50.0.1" } }),
    );
    expect(first.status).toBe(204);
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toMatch(/^tav=[A-Za-z0-9_-]{21}$/);
    await hit.POST(call("/api/analytics/hit", { body: { path: "/privacy" }, headers: { cookie, "x-forwarded-for": "10.50.0.1" } }));
    await hit.POST(call("/api/analytics/hit", { body: { path: "/" }, headers: { "user-agent": "Googlebot/2.1", "x-forwarded-for": "10.50.0.2" } }));

    const r = await report();
    expect(r.today.visits - before.visits).toBe(2);
    expect(r.today.newVisits - before.newVisits).toBe(1);
    expect(r.today.returningVisits - before.returningVisits).toBe(1);
    expect(r.today.visitors - before.visitors).toBe(1);
    expect(r.domains.find((d) => d.key === "google.com")?.count).toBeGreaterThanOrEqual(1);
    expect(r.utm.find((d) => d.key === "kakao / chat / open")?.count).toBeGreaterThanOrEqual(1);
    expect(r.landings.find((d) => d.key === "/privacy")).toBeTruthy();
    expect(r.countries.find((d) => d.key === "KR")).toBeTruthy();
    expect(r.browsers.find((d) => d.key === "사파리")).toBeTruthy();
  });

  it("체류 시간·신규 가입·묘비 작성이 오늘 요약에 쌓인다", async () => {
    const before = (await report()).today;
    expect((await stay.POST(call("/api/analytics/stay", { body: { sec: 90 }, headers: { "x-forwarded-for": "10.50.0.3" } }))).status).toBe(204);
    expect((await stay.POST(call("/api/analytics/stay", { body: { sec: 999_999 }, headers: { "x-forwarded-for": "10.50.0.3" } }))).status).toBe(400);
    const v = await newVisitor();
    await graves.POST(call("/api/graves", { visitor: v, body: { name: "할 일 앱", lived: "week", mourner: "새벽코더", channel: 1 } }));
    const t = (await report()).today;
    expect(t.signups - before.signups).toBe(1);
    expect(t.graves - before.graves).toBe(1);
    const [d] = await getAnalytics().days([new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "")]);
    expect(d.fields.stay).toBeGreaterThanOrEqual(90);
  });

  it("관리자 화면을 열면 로비 동시 접속을 그 시간대 최고값으로 찍는다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ channels: [{ id: 1, count: 7, cap: 50, open: true }], total: 7, totalCap: 50, maxChannels: 10, threshold: 0.8 }),
    );
    expect((await report("hour")).today.peak).toBeGreaterThanOrEqual(7);
  });

  it("관리자 인증 없이는 볼 수 없고 기간은 정해진 것만", async () => {
    expect((await adminAnalytics.GET(call("/api/admin/analytics"))).status).toBe(401);
    expect((await adminAnalytics.GET(call("/api/admin/analytics?range=year", { headers: ADMIN }))).status).toBe(400);
  });
});

describe("31번 운영자 계정", () => {
  it("관리자만 지정할 수 있고, 지정하면 잔액이 지갑 상한까지 찬다", async () => {
    const v = await newVisitor();
    expect((await adminStaff.POST(call("/api/admin/staff", { body: { accountId: v.visitorId } }))).status).toBe(401);
    expect((await adminStaff.POST(call("/api/admin/staff", { body: { accountId: "없는계정" }, headers: ADMIN }))).status).toBe(400);
    expect((await adminStaff.POST(call("/api/admin/staff", { body: { accountId: "nobody-here" }, headers: ADMIN }))).status).toBe(404);
    const set = await bodyOf<AdminStaffResponse>(adminStaff.POST(call("/api/admin/staff", { body: { accountId: v.visitorId }, headers: ADMIN })));
    expect(set.staff?.accountId).toBe(v.visitorId);
    const mine = await bodyOf<Me>(me.GET(call("/api/me", { visitor: v })));
    expect(mine.staff).toBe(true);
    expect(mine.points).toBe(BALANCE_CAP);
    // 지정하자마자 운영자 전용 꾸미기가 전부 영구로 벗어 둔 꾸미기에 들어온다
    for (const id of STAFF_ITEM_IDS) expect(mine.stash.some((e) => e.itemId === id && isPermanentUntil(e.until))).toBe(true);
    // 해제
    const off = await bodyOf<AdminStaffResponse>(adminStaff.POST(call("/api/admin/staff", { body: { accountId: null }, headers: ADMIN })));
    expect(off.staff).toBeNull();
    expect((await bodyOf<Me>(me.GET(call("/api/me", { visitor: v })))).staff).toBeUndefined();
  });

  it("운영자 전용 꾸미기: 상점 목록에 없고, 운영자로 입장하면 빠진 것만 영구로 다시 채운다", async () => {
    expect(STAFF_ITEM_IDS.length).toBeGreaterThan(0);
    expect(ITEMS.filter((i) => i.staff).some(isShopListed)).toBe(false);
    const op = await newVisitor();
    await setStaff(op.visitorId);
    try {
      expect(await grantStaffItems(getAccounts(), op.visitorId)).toBe(STAFF_ITEM_IDS.length);
      // 이미 다 있으면 더 넣지 않는다
      expect(await grantStaffItems(getAccounts(), op.visitorId)).toBe(0);
      // 하나가 빠지면(벗어 둔 꾸미기에서 사라짐) 내 정보를 불러올 때 그것만 채운다
      const mem = getAccounts() as unknown as { accts: Map<string, { stash?: Map<string, number> }> };
      mem.accts.get(op.visitorId)?.stash?.delete("staff_crown");
      const mine = await bodyOf<Me>(me.GET(call("/api/me", { visitor: op })));
      expect(mine.stash.filter((e) => STAFF_ITEM_IDS.includes(e.itemId) && isPermanentUntil(e.until))).toHaveLength(STAFF_ITEM_IDS.length);
      // 없는 계정
      expect(await grantStaffItems(getAccounts(), "nobody-here")).toBe(-1);
    } finally {
      await setStaff(null);
    }
  });

  it("관리자 처리 기록의 처리자 이름: 운영자 계정 브라우저면 관리자(닉네임)", async () => {
    const op = await newVisitor();
    const other = await newVisitor();
    await adminStaff.POST(call("/api/admin/staff", { body: { accountId: op.visitorId }, headers: ADMIN }));
    const name = (await getAccounts().get(op.visitorId, "20000101", Date.now())).name;
    expect(await adminActor(call("/api/admin/bans", { visitor: op, headers: ADMIN }))).toBe(`관리자(${name})`);
    expect(await adminActor(call("/api/admin/bans", { visitor: other, headers: ADMIN }))).toBe("관리자");
    expect(await adminActor(call("/api/admin/bans", { headers: ADMIN }))).toBe("관리자");
  });

  it("포인트가 줄지 않는다 (사고 나도 잔액이 다시 상한), 일반 계정은 그대로 줄어든다", async () => {
    const op = await newVisitor();
    const user = await newVisitor();
    await setStaff(op.visitorId);
    await getAccounts().adjustPoints(user.visitorId, 500);
    await bodyOf<Me>(me.GET(call("/api/me", { visitor: op })));
    const a = await bodyOf<{ me: Me }>(buy.POST(call("/api/shop/buy", { visitor: op, body: { itemId: "hat_crown" } })));
    expect(a.me.points).toBe(BALANCE_CAP);
    const b = await bodyOf<{ me: Me }>(buy.POST(call("/api/shop/buy", { visitor: user, body: { itemId: "hat_crown" } })));
    expect(b.me.points).toBeLessThan(500);
    expect(b.me.staff).toBeUndefined();
  });

  it("확성기는 가방에 없어도 무료, 일반 계정은 없으면 거절", async () => {
    const op = await newVisitor();
    const user = await newVisitor();
    await setStaff(op.visitorId);
    const ok = await megaphone.POST(call("/api/megaphone", { visitor: op, body: { itemId: "mega_all", text: "오늘 밤 모닥불 모여요", channel: 1 } }));
    expect(ok.status).toBe(200);
    const no = await megaphone.POST(call("/api/megaphone", { visitor: user, body: { itemId: "mega_ch", text: "안녕하세요", channel: 1 } }));
    expect(no.status).toBe(409);
  });

  it("입장 토큰의 운영자 표시는 서버가 확인한 계정에만", async () => {
    const op = await newVisitor();
    const user = await newVisitor();
    await setStaff(op.visitorId);
    const tokenOf = async (v: Visitor) => {
      const r = await bodyOf<JoinResponse>(join.POST(call("/api/join", { visitor: v, body: { channel: 1, name: "검수", color: "#9fc5a8" } })));
      if (r.mode !== "channel") throw new Error("채널 입장이 아님");
      return verifyJoinToken("dev-join-secret-change-me", r.token);
    };
    expect((await tokenOf(op))?.staff).toBe(true);
    expect((await tokenOf(user))?.staff).toBeUndefined();
  });

  it("묘비 삭제: 운영자 계정 + 관리자 IP 둘 다 맞아야 한다", async () => {
    const owner = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(
      graves.POST(call("/api/graves", { visitor: owner, body: { name: "남의 묘비", lived: "week", mourner: "주인", channel: 1 } })),
    );
    const op = await newVisitor("127.0.0.1");
    const opAway = { ...op, ip: "203.0.113.9" };
    const user = await newVisitor("127.0.0.1");

    // 일반 계정은 관리자 IP여도 안 된다
    const r1 = await staffDelete.DELETE(call(`/api/graves/${grave.id}/staff`, { method: "DELETE", visitor: user }), ctx(grave.id));
    expect(r1.status).toBe(403);
    await setStaff(op.visitorId);
    // 운영자여도 관리자 IP가 아니면 안 된다
    const r2 = await staffDelete.DELETE(call(`/api/graves/${grave.id}/staff`, { method: "DELETE", visitor: opAway }), ctx(grave.id));
    expect(r2.status).toBe(403);
    expect((await errorOf(r2)).message).toContain("관리자 IP");
    expect(await getStore().get(grave.id)).not.toBeNull();
    // 둘 다 맞으면 완전히 지운다
    const r3 = await staffDelete.DELETE(call(`/api/graves/${grave.id}/staff`, { method: "DELETE", visitor: op }), ctx(grave.id));
    expect(r3.status).toBe(200);
    expect(await getStore().get(grave.id)).toBeNull();
    expect((await staffDelete.DELETE(call(`/api/graves/${grave.id}/staff`, { method: "DELETE", visitor: op }), ctx(grave.id))).status).toBe(404);
  });
});
