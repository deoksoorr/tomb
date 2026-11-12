import { verifyJoinToken } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminErrorsResponse } from "@/lib/admin";
import { handler } from "@/lib/http";
import { getHouseStore, houseIdFor } from "@/lib/housing/service";
import { earnPoints, getAccounts, refundPoints, spendPoints } from "@/lib/store";
import type {
  ActivityResponse,
  ApiError,
  CreateGraveResponse,
  EconomyResponse,
  Me,
  NameChangeResponse,
  PointRankResponse,
  RoomJoinResponse,
} from "@/lib/types";
import { NAME_CHANGE_PRICE } from "@/lib/types";
import * as adminPoints from "./admin/accounts/points/route";
import * as adminEconomy from "./admin/economy/route";
import * as adminErrors from "./admin/errors/route";
import * as errorsRoute from "./errors/route";
import * as flower from "./graves/[id]/flower/route";
import * as revive from "./graves/[id]/revive/route";
import * as graves from "./graves/route";
import * as guestbook from "./housing/houses/[id]/guestbook/route";
import * as like from "./housing/houses/[id]/like/route";
import * as roomJoin from "./join/room/route";
import * as activity from "./me/activity/route";
import * as seen from "./me/activity/seen/route";
import * as attend from "./me/attend/route";
import * as nameRoute from "./me/name/route";
import * as me from "./me/route";
import * as tutorial from "./me/tutorial/route";
import * as rank from "./rank/points/route";
import * as session from "./session/route";
import * as buy from "./shop/buy/route";

// v4: 방 입장 토큰·내 소식·닉네임 변경·튜토리얼·오류 수집·경제 통계 (메모리 구성)
const SECRET = "dev-join-secret-change-me";
const ADMIN = { "x-admin-key": "dev-admin" };

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "3");
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; headers?: Record<string, string>; ip?: string } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId,
  };
}
const getMe = (v: Visitor) => bodyOf<Me>(me.GET(call("/api/me", { visitor: v })));
const attendAs = (v: Visitor, name: string) => attend.POST(call("/api/me/attend", { visitor: v, body: { name } }));
const setPoints = (v: Visitor, n: number) =>
  ((getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points = n);
const myActivity = (v: Visitor) => bodyOf<ActivityResponse>(activity.GET(call("/api/me/activity", { visitor: v })));

describe("방 입장 토큰", () => {
  const join = (v: Visitor, room: string) => roomJoin.POST(call("/api/join/room", { visitor: v, body: { room } }));

  it("마을: channel 0 + room 클레임, 계정의 이름·몸 모양, wsUrl은 /room/{room}", async () => {
    const v = await newVisitor();
    await attend.POST(call("/api/me/attend", { visitor: v, body: { name: "새벽코더", color: "#9fc5a8", body: "cat" } }));
    const res = await bodyOf<RoomJoinResponse>(join(v, "village"));
    expect(res.room).toBe("village");
    expect(res.wsUrl).toMatch(/\/room\/village\?t=/);
    const claims = await verifyJoinToken(SECRET, res.token);
    expect(claims).toMatchObject({ visitorId: v.visitorId, channel: 0, room: "village", name: "새벽코더", body: "cat" });

    const hunt = await bodyOf<RoomJoinResponse>(join(v, "hunt:slime:a"));
    expect(hunt.wsUrl).toContain(`/room/${encodeURIComponent("hunt:slime:a")}?t=`);
  });

  it("형식이 틀린 방은 400, 집 방은 있고 숨겨지지 않은 집만, 세션 없으면 401", async () => {
    const owner = await newVisitor();
    const v = await newVisitor();
    for (const room of ["lobby", "house:", "village ", "hunt:Slime:a"]) expect((await join(v, room)).status, room).toBe(400);
    expect((await roomJoin.POST(call("/api/join/room", { body: { room: "village" } }))).status).toBe(401);

    const id = houseIdFor(owner.visitorId);
    expect((await join(v, `house:${id}`)).status).toBe(404);
    await getHouseStore().create({ id, owner: owner.visitorId, name: "새벽의 집", intro: "", ownerName: "주인", tier: "small", lot: null, now: Date.now() });
    const ok = await bodyOf<RoomJoinResponse>(join(v, `house:${id}`));
    expect((await verifyJoinToken(SECRET, ok.token))?.room).toBe(`house:${id}`);
    await getHouseStore().setHidden(id, true);
    expect((await join(v, `house:${id}`)).status).toBe(404);
  });

  it("방문자당 분당 20회", async () => {
    const v = await newVisitor();
    for (let i = 0; i < 20; i++) expect((await join(v, "village")).status).toBe(200);
    const blocked = await join(v, "village");
    expect(blocked.status).toBe(429);
  });
});

describe("내 소식", () => {
  it("남의 헌화·집 좋아요·방명록을 쌓고, 내 행동과 (없어진) 살려주세요 소식은 보여 주지 않는다", async () => {
    const owner = await newVisitor();
    const fan = await newVisitor();
    const ghost = await newVisitor(); // 이름 없는 방문자
    await attendAs(fan, "꽃집주인");
    const grave = await bodyOf<CreateGraveResponse>(
      graves.POST(call("/api/graves", { visitor: owner, body: { name: "할 일 앱", lived: "week", mourner: "새벽코더", channel: 1 } })),
    );
    const id = grave.grave.id;

    await flower.POST(call(`/api/graves/${id}/flower`, { method: "POST", visitor: owner }), ctx(id)); // 내 헌화
    await flower.POST(call(`/api/graves/${id}/flower`, { method: "POST", visitor: fan }), ctx(id));
    expect((await revive.POST(call(`/api/graves/${id}/revive`, { method: "POST", visitor: ghost }), ctx(id))).status).toBe(410);
    // 49번 이전에 쌓인 살려주세요 소식은 남아 있어도 보여 주지 않고 안 읽은 수에도 넣지 않는다
    await getAccounts().pushActivity(owner.visitorId, { id: "legacy", kind: "revive", at: Date.now(), who: "옛 유령", targetId: id, targetName: "할 일 앱" });

    const houseId = houseIdFor(owner.visitorId);
    await getHouseStore().create({ id: houseId, owner: owner.visitorId, name: "새벽의 집", intro: "", ownerName: "새벽코더", tier: "small", lot: null, now: Date.now() });
    expect((await like.POST(call(`/api/housing/houses/${houseId}/like`, { method: "POST", visitor: fan }), ctx(houseId))).status).toBe(200);
    expect((await guestbook.POST(call(`/api/housing/houses/${houseId}/guestbook`, { visitor: fan, body: { text: "잘 보고 가요" } }), ctx(houseId))).status).toBe(201);

    const feed = await myActivity(owner);
    expect(feed.items.map((i) => [i.kind, i.who, i.targetName])).toEqual([
      ["guestbook", "꽃집주인", "새벽의 집"],
      ["houseLike", "꽃집주인", "새벽의 집"],
      ["flower", "꽃집주인", "할 일 앱"],
    ]);
    expect(feed.items[2].targetId).toBe(id);
    expect(feed.unread).toBe(3);
    expect((await getMe(owner)).activityUnread).toBe(3);
    expect((await myActivity(fan)).items).toEqual([]);

    // 읽음: 뒤로 되돌리지 않고, 미래 시각은 지금으로 자른다
    const read = await bodyOf<{ lastSeenAt: number; unread: number }>(seen.POST(call("/api/me/activity/seen", { visitor: owner, body: { at: feed.items[1].at } })));
    expect(read.unread).toBeLessThanOrEqual(1);
    const all = await bodyOf<{ lastSeenAt: number; unread: number }>(seen.POST(call("/api/me/activity/seen", { visitor: owner, body: { at: Date.now() + 9e9 } })));
    expect(all.unread).toBe(0);
    expect(all.lastSeenAt).toBeLessThanOrEqual(Date.now());
    const back = await bodyOf<{ lastSeenAt: number }>(seen.POST(call("/api/me/activity/seen", { visitor: owner, body: { at: 1 } })));
    expect(back.lastSeenAt).toBe(all.lastSeenAt);
    expect((await getMe(owner)).activityUnread).toBe(0);
    expect((await seen.POST(call("/api/me/activity/seen", { visitor: owner, body: { at: -1 } }))).status).toBe(400);
  });

  it("최신 50개만 남는다", async () => {
    const owner = await newVisitor();
    const fan = await newVisitor();
    const { pushActivity } = await import("@/lib/store");
    for (let i = 0; i < 55; i++) await pushActivity(owner.visitorId, { kind: "flower", actorId: fan.visitorId, targetId: `g${i}`, targetName: `무덤${i}` }, 1000 + i);
    const feed = await myActivity(owner);
    expect(feed.items).toHaveLength(50);
    expect(feed.items[0].targetName).toBe("무덤54");
  });
});

describe("닉네임 변경", () => {
  const rename = (v: Visitor, name: string) => nameRoute.POST(call("/api/me/name", { visitor: v, body: { name } }));

  it("첫 변경은 무료, 7일 쿨다운(429 + 다음 시각), 그다음은 NAME_CHANGE_PRICE. 묘비 상주명은 그대로, 랭킹은 새 이름", async () => {
    const v = await newVisitor();
    await attendAs(v, "옛이름");
    const grave = await bodyOf<CreateGraveResponse>(
      graves.POST(call("/api/graves", { visitor: v, body: { name: "할 일 앱", lived: "week", mourner: "옛이름", channel: 1 } })),
    );
    expect((await getMe(v)).nameChange).toEqual({ nextAllowedAt: 0, cost: 0 });
    const startPoints = (await getMe(v)).points;

    const first = await bodyOf<NameChangeResponse>(rename(v, "새이름"));
    expect(first.cost).toBe(0);
    expect(first.me.name).toBe("새이름");
    expect(first.me.points).toBe(startPoints);
    expect(first.me.nameChange.cost).toBe(NAME_CHANGE_PRICE);
    expect(first.me.nameChange.nextAllowedAt).toBe(first.nextAllowedAt);

    const cool = await rename(v, "또바꿈");
    expect(cool.status).toBe(429);
    expect((await errorOf(cool)).code).toBe("NAME_COOLDOWN");
    expect(Number(cool.headers.get("X-Next-Allowed-At"))).toBe(first.nextAllowedAt);
    expect(Number(cool.headers.get("Retry-After"))).toBeGreaterThan(6 * 86_400);

    const later = first.nextAllowedAt + 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    expect((await errorOf(await rename(v, "또바꿈"))).code).toBe("NOT_ENOUGH_POINTS");
    setPoints(v, NAME_CHANGE_PRICE + 50);
    const second = await bodyOf<NameChangeResponse>(rename(v, "또바꿈"));
    expect(second.cost).toBe(NAME_CHANGE_PRICE);
    expect(second.me.points).toBe(50);
    vi.restoreAllMocks();

    const ranks = await bodyOf<PointRankResponse>(rank.GET(call("/api/rank/points", { visitor: v })));
    expect(JSON.stringify(ranks)).toContain("또바꿈");
    expect(JSON.stringify(ranks)).not.toContain("옛이름");
    expect(grave.grave.mourner).toBe("옛이름");
    expect((await rename(v, "x")).status).toBe(400);
  });
});

describe("튜토리얼", () => {
  it("완료하면 me.tutorialDone", async () => {
    const v = await newVisitor();
    expect((await getMe(v)).tutorialDone).toBe(false);
    const res = await bodyOf<{ me: Me }>(tutorial.POST(call("/api/me/tutorial", { method: "POST", visitor: v })));
    expect(res.me.tutorialDone).toBe(true);
    expect((await getMe(v)).tutorialDone).toBe(true);
  });
});

describe("오류 수집", () => {
  const report = (ip: string, body: object) => errorsRoute.POST(call("/api/errors", { ip, body }));
  const adminList = () => bodyOf<AdminErrorsResponse>(adminErrors.GET(call("/api/admin/errors?days=7", { headers: ADMIN })));

  it("같은 메시지는 묶어서 횟수·마지막 시각, 긴 메시지는 자르고, IP당 분당 10회", async () => {
    const msg = `TypeError: x is undefined ${Math.random()}`;
    for (let i = 0; i < 3; i++)
      expect((await report("10.66.0.1", { kind: "error", message: msg, stack: "at a\nat b\nat c", url: "/?ch=1" })).status).toBe(204);
    await report("10.66.0.1", { kind: "react", message: "y".repeat(2000), url: "/" });
    const list = await adminList();
    const group = list.errors.find((e) => e.message === msg)!;
    expect(group).toMatchObject({ count: 3, source: "client", kind: "error", url: "/?ch=1" });
    expect(group.lastAt).toBeGreaterThan(0);
    expect(list.errors.find((e) => e.kind === "react")!.message.length).toBeLessThanOrEqual(500);

    expect((await report("10.66.0.2", { kind: "nope", message: "a", url: "/" })).status).toBe(400);
    for (let i = 0; i < 10; i++) await report("10.66.0.3", { kind: "error", message: `m${i}`, url: "/" });
    expect((await report("10.66.0.3", { kind: "error", message: "m", url: "/" })).status).toBe(429);
    expect((await adminErrors.GET(call("/api/admin/errors"))).status).toBe(401);
  });

  it("handler 래퍼의 500도 같은 저장소에 남는다 (서버)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = handler(async () => {
      throw new Error("db exploded");
    });
    const res = await boom(call("/api/boom", { method: "POST" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const group = (await adminList()).errors.find((e) => e.message.includes("db exploded"))!;
    expect(group).toMatchObject({ source: "server", kind: "api", url: "/api/boom", count: 1 });
  });
});

describe("경제 통계", () => {
  const economy = () => bodyOf<EconomyResponse>(adminEconomy.GET(call("/api/admin/economy?days=3", { headers: ADMIN })));
  const today = (e: EconomyResponse) => e.days[0];

  it("적립(항목별)·사용(분류별)·환불·관리자 지급을 날짜별로 더하고, 지갑 합계·계정 수", async () => {
    const before = await economy();
    expect(before.days).toHaveLength(3);
    const v = await newVisitor();
    await attendAs(v, "경제학자"); // 입장만 (10번: 출석 포인트는 달력에서)
    await earnPoints(v.visitorId, "attend"); // +10 attend
    await adminPoints.POST(call("/api/admin/accounts/points", { headers: ADMIN, body: { accountId: v.visitorId, delta: 300 } }));
    await bodyOf(buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "fw_small" } })));
    await spendPoints(v.visitorId, 30, "rpg:entry");
    await spendPoints(v.visitorId, 20, "housing:furniture");
    await refundPoints(v.visitorId, 5, "housing:sell");
    await adminPoints.POST(call("/api/admin/accounts/points", { headers: ADMIN, body: { accountId: v.visitorId, delta: -7 } }));

    const after = await economy();
    const d = (k: "earned" | "spent", f: string) => (today(after)[k][f] ?? 0) - (today(before)[k][f] ?? 0);
    expect(d("earned", "attend")).toBe(10);
    expect(d("earned", "admin")).toBe(300);
    expect(d("earned", "refund")).toBe(5);
    expect(d("spent", "rpg")).toBe(30);
    expect(d("spent", "housing")).toBe(20);
    expect(d("spent", "admin")).toBe(7);
    const shopSpent = d("spent", "shop");
    const balance = (await getMe(v)).points;
    expect(balance).toBe(10 + 300 - shopSpent - 30 - 20 + 5 - 7);
    expect(after.totals.accounts - before.totals.accounts).toBe(1);
    expect(after.totals.wallets - before.totals.wallets).toBe(balance);
    expect((await adminEconomy.GET(call("/api/admin/economy"))).status).toBe(401);
  });

  it("닉네임 변경 비용은 spend:name", async () => {
    const v = await newVisitor();
    await attendAs(v, "하나둘");
    await nameRoute.POST(call("/api/me/name", { visitor: v, body: { name: "둘셋넷" } }));
    const first = (await getMe(v)).nameChange.nextAllowedAt;
    vi.spyOn(Date, "now").mockReturnValue(first + 1); // 7일 뒤: 통계도 그날 기준으로 본다
    const before = await economy();
    setPoints(v, NAME_CHANGE_PRICE + 100);
    expect((await nameRoute.POST(call("/api/me/name", { visitor: v, body: { name: "셋넷다섯" } }))).status).toBe(200);
    const after = await economy();
    vi.restoreAllMocks();
    expect((today(after).spent.name ?? 0) - (today(before).spent.name ?? 0)).toBe(NAME_CHANGE_PRICE);
  });
});
