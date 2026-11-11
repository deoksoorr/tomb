import { verifyGrant, verifyJoinToken } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminGrave } from "@/lib/admin";
import { CODE_RE } from "@/lib/economy";
import { todayKst } from "@/lib/epitaph";
import { verifySession } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import type {
  ApiError,
  AttendResponse,
  CodeLoginResponse,
  CodeResponse,
  CreateGraveResponse,
  GraveDetailResponse,
  GraveListResponse,
  JoinResponse,
  LookGrantResponse,
  Me,
  UseItemResponse,
} from "@/lib/types";
import * as adminPoints from "./admin/accounts/points/route";
import * as adminGraves from "./admin/graves/route";
import * as flower from "./graves/[id]/flower/route";
import * as graveById from "./graves/[id]/route";
import * as graves from "./graves/route";
import * as join from "./join/route";
import * as attend from "./me/attend/route";
import * as code from "./me/code/route";
import * as login from "./me/login/route";
import * as look from "./me/look/route";
import * as logout from "./me/logout/route";
import * as me from "./me/route";
import * as reviveRoute from "./graves/[id]/revive/route";
import * as session from "./session/route";
import * as buy from "./shop/buy/route";
import * as use from "./shop/use/route";
import * as version from "./version/route";

// v2: 계정·포인트·상점·간단 묘비·대기열. 로컬 구성(MemoryStore/MemoryAccounts)으로 라우트를 직접 호출한다
const SECRET = "dev-join-secret-change-me";

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

function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;

async function newVisitor(ip = `10.2.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip, visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId };
}

/** 테스트용: 메모리 계정의 잔액을 직접 맞춘다 */
function setPoints(v: Visitor, n: number) {
  (getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points = n;
}
const getMe = (v: Visitor) => bodyOf<Me>(me.GET(call("/api/me", { visitor: v })));
const quickBury = (v: Visitor, body: object = {}) =>
  graves.POST(call("/api/graves", { visitor: v, body: { name: "할 일 앱", lived: "week", mourner: "새벽코더", channel: 1, ...body } }));

describe("계정·출석", () => {
  it("세션이 없으면 401, 처음엔 0점·빈 가방", async () => {
    expect((await me.GET(call("/api/me"))).status).toBe(401);
    const v = await newVisitor();
    expect(await getMe(v)).toEqual({
      accountId: v.visitorId,
      name: null,
      color: null,
      body: null,
      points: 0,
      lifetimePoints: 0,
      todayEarned: 0,
      attendance: { today: false, streak: 0 },
      hasCode: false,
      inventory: {},
      equipped: [],
      graves: [],
      activityUnread: 0,
      nameChange: { nextAllowedAt: 0, cost: 0 },
      tutorialDone: false,
    });
  });

  it("출석: +10, 같은 날 다시 하면 0, 이름을 저장한다", async () => {
    const v = await newVisitor();
    const first = await bodyOf<AttendResponse>(attend.POST(call("/api/me/attend", { visitor: v, body: { name: "새벽코더" } })));
    expect(first.earned).toBe(10);
    expect(first.me).toMatchObject({ points: 10, name: "새벽코더", attendance: { today: true, streak: 1 } });
    const again = await bodyOf<AttendResponse>(attend.POST(call("/api/me/attend", { visitor: v, body: {} })));
    expect(again.earned).toBe(0);
    expect((await attend.POST(call("/api/me/attend", { visitor: v, body: { name: "x" } }))).status).toBe(400);
  });

  it("같은 IP의 4번째 계정은 출석 포인트를 받지 못한다", async () => {
    const earned = [];
    for (let i = 0; i < 4; i++) {
      const v = await newVisitor("10.3.3.3");
      earned.push((await bodyOf<AttendResponse>(attend.POST(call("/api/me/attend", { visitor: v, body: {} })))).earned);
    }
    expect(earned).toEqual([10, 10, 10, 0]);
  });
});

describe("개인 코드", () => {
  it("발급 → 다른 기기에서 그 코드로 들어오면 같은 계정, 재발급하면 이전 코드는 무효", async () => {
    const v = await newVisitor();
    await attend.POST(call("/api/me/attend", { visitor: v, body: { name: "새벽코더" } }));
    const { code: first } = await bodyOf<CodeResponse>(code.POST(call("/api/me/code", { method: "POST", visitor: v })));
    expect(first).toMatch(CODE_RE);
    expect((await getMe(v)).hasCode).toBe(true);

    // 소문자·하이픈 없이 쳐도 된다
    const typed = first.replaceAll("-", "").toLowerCase();
    const res = await login.POST(call("/api/me/login", { body: { code: typed }, headers: { "x-forwarded-for": "10.4.0.1" } }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as CodeLoginResponse).me).toMatchObject({ accountId: v.visitorId, name: "새벽코더", points: 10 });
    const cookie = res.headers.get("set-cookie")!.split(";")[0].replace(/^vid=/, "");
    expect(await verifySession(cookie)).toBe(v.visitorId);

    const { code: second } = await bodyOf<CodeResponse>(code.POST(call("/api/me/code", { method: "POST", visitor: v })));
    expect(second).not.toBe(first);
    const old = await login.POST(call("/api/me/login", { body: { code: first }, headers: { "x-forwarded-for": "10.4.0.1" } }));
    expect(old.status).toBe(404);
    expect((await errorOf(old)).code).toBe("INVALID_CODE");
    expect((await login.POST(call("/api/me/login", { body: { code: "nope" } }))).status).toBe(400);
  });

  it("틀린 코드는 IP당 시간당 10번까지 — 운영자 IP여도 예외 없고, 넘으면 맞는 코드도 429", async () => {
    vi.stubEnv("ADMIN_ALLOWED_IPS", "10.4.9.9");
    try {
      const v = await newVisitor();
      const { code: right } = await bodyOf<CodeResponse>(code.POST(call("/api/me/code", { method: "POST", visitor: v })));
      const attempt = (c: string) => login.POST(call("/api/me/login", { body: { code: c }, headers: { "x-forwarded-for": "10.4.9.9" } }));
      for (let i = 0; i < 10; i++) expect((await attempt("2222-2222-2222")).status).toBe(404);
      const locked = await attempt(right);
      expect(locked.status).toBe(429);
      expect((await errorOf(locked)).code).toBe("RATE_LIMITED");
    } finally {
      vi.stubEnv("ADMIN_ALLOWED_IPS", "");
    }
  });
});

describe("간단 묘비 세우기", () => {
  it("날짜·묘비명·사인 기본값, 하루 1개분 +20, isMine, 계정 주인은 토큰 없이 수정·삭제", async () => {
    const owner = await newVisitor();
    const res = await quickBury(owner);
    expect(res.status).toBe(201);
    const { grave, earned } = (await res.json()) as CreateGraveResponse;
    const today = todayKst();
    const born = new Date(Date.parse(today) - 6 * 86_400_000).toISOString().slice(0, 10);
    expect(grave).toMatchObject({ bornAt: born, diedAt: today, ageDays: 7, epitaph: "향년 7일, 조용히 별세", causes: ["other"] });
    expect(grave).not.toHaveProperty("ownerAccountId");
    expect(earned).toBe(20);
    expect((await bodyOf<CreateGraveResponse>(quickBury(owner, { lived: "day", cause: "time", epitaph: "짧았다" }))).earned).toBe(0);
    expect((await getMe(owner)).graves).toContain(grave.id);

    const detail = (v: Visitor) => bodyOf<GraveDetailResponse>(graveById.GET(call(`/api/graves/${grave.id}`, { visitor: v }), ctx(grave.id)));
    const other = await newVisitor();
    expect((await detail(owner)).isMine).toBe(true);
    expect((await detail(other)).isMine).toBe(false);

    const full = { name: "고친 이름", epitaph: "고침", bornAt: born, diedAt: today, causes: ["time"], mourner: "새벽코더" };
    expect((await graveById.PATCH(call(`/api/graves/${grave.id}`, { method: "PATCH", visitor: owner, body: full }), ctx(grave.id))).status).toBe(200);
    expect((await detail(owner)).isMine).toBe(true);
    expect((await graveById.DELETE(call(`/api/graves/${grave.id}`, { method: "DELETE", visitor: other }), ctx(grave.id))).status).toBe(403);
    expect((await graveById.DELETE(call(`/api/graves/${grave.id}`, { method: "DELETE", visitor: owner }), ctx(grave.id))).status).toBe(200);
    expect((await getMe(owner)).graves).not.toContain(grave.id);
  });

  it("간단 입력 검증", async () => {
    const v = await newVisitor();
    expect(await errorOf(await quickBury(v, { lived: "forever" }))).toEqual({ code: "INVALID_INPUT", message: "얼마나 살았는지 골라 주세요." });
    expect((await errorOf(await quickBury(v, { name: " " }))).message).toBe("그만둔 것의 이름을 적어 주세요.");
    expect((await errorOf(await quickBury(v, { epitaph: "가".repeat(31) }))).message).toBe("묘비명은 30자까지 적을 수 있어요.");
  });
});

describe("반응 포인트", () => {
  it("헌화: 한 사람 +2, 주인 +1. 자기 묘비에 자기가 하면 주인 몫은 없다", async () => {
    const owner = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(quickBury(owner));
    const fan = await newVisitor();
    const res = await bodyOf<{ count: number; earned: number }>(
      flower.POST(call(`/api/graves/${grave.id}/flower`, { method: "POST", visitor: fan }), ctx(grave.id)),
    );
    expect(res).toEqual({ count: 1, earned: 2 });
    expect((await getMe(owner)).points).toBe(21);
    await flower.POST(call(`/api/graves/${grave.id}/flower`, { method: "POST", visitor: owner }), ctx(grave.id));
    expect((await getMe(owner)).points).toBe(23);
  });
});

describe("상점", () => {
  it("포인트가 모자라면 409, 폭죽은 사용권(증서)으로 바뀌고 다 쓰면 NO_ITEM", async () => {
    const v = await newVisitor();
    const poor = await buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "fw_small" } }));
    expect(await errorOf(poor)).toEqual({ code: "NOT_ENOUGH_POINTS", message: "포인트가 모자라요." });
    expect((await buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "rocket" } }))).status).toBe(400);

    setPoints(v, 100);
    const bought = await bodyOf<{ me: Me }>(buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "fw_small" } })));
    expect(bought.me).toMatchObject({ points: 80, inventory: { fw_small: 1 } });

    const used = await bodyOf<UseItemResponse>(use.POST(call("/api/shop/use", { visitor: v, body: { itemId: "fw_small" } })));
    expect(used.me.inventory).toEqual({});
    const grant = await verifyGrant(SECRET, used.grant!);
    expect(grant).toMatchObject({ kind: "firework", visitorId: v.visitorId, item: "fw_small" });
    expect(grant!.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
    expect(await verifyGrant("other-secret", used.grant!)).toBeNull();

    const empty = await use.POST(call("/api/shop/use", { visitor: v, body: { itemId: "fw_small" } }));
    expect(await errorOf(empty)).toEqual({ code: "NO_ITEM", message: "가방에 그 아이템이 없어요." });
  });

  it("캐릭터 꾸미기: 착용 증서, /api/me/look, 입장 토큰에 착용품", async () => {
    const v = await newVisitor();
    setPoints(v, 100);
    await buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "hat_cat" } }));
    const used = await bodyOf<UseItemResponse>(use.POST(call("/api/shop/use", { visitor: v, body: { itemId: "hat_cat" } })));
    expect(await verifyGrant(SECRET, used.lookGrant!)).toMatchObject({ kind: "look", visitorId: v.visitorId, look: ["hat_cat"] });
    expect(used.me.equipped).toEqual([{ itemId: "hat_cat", until: expect.any(Number) }]);
    expect(used.me.equipped[0].until - Date.now()).toBeGreaterThan(23 * 3_600_000);

    const again = await bodyOf<LookGrantResponse>(look.GET(call("/api/me/look", { visitor: v })));
    expect(again.look).toEqual(["hat_cat"]);
    expect(await verifyGrant(SECRET, again.lookGrant)).toMatchObject({ kind: "look", look: ["hat_cat"] });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no lobby"));
    const joined = await bodyOf<JoinResponse>(
      join.POST(call("/api/join", { visitor: v, body: { channel: "auto", name: "새벽코더", color: "#9fc5a8" } })),
    );
    if (joined.mode !== "channel") throw new Error("channel 모드여야 한다");
    expect((await verifyJoinToken(SECRET, joined.token))?.look).toEqual(["hat_cat"]);
  });

  it("묘비 꾸미기: 내 계정 묘비에만, 목록·상세·관리자 목록에 보인다", async () => {
    const owner = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(quickBury(owner));
    const stranger = await newVisitor();
    for (const v of [owner, stranger]) {
      setPoints(v, 100);
      await buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "decor_candles" } }));
    }
    const steal = await use.POST(call("/api/shop/use", { visitor: stranger, body: { itemId: "decor_candles", graveId: grave.id } }));
    expect((await errorOf(steal)).code).toBe("NOT_OWNER");
    expect((await use.POST(call("/api/shop/use", { visitor: owner, body: { itemId: "decor_candles" } }))).status).toBe(400);

    const placed = await bodyOf<UseItemResponse>(
      use.POST(call("/api/shop/use", { visitor: owner, body: { itemId: "decor_candles", graveId: grave.id } })),
    );
    expect(placed.grave?.decor).toEqual([{ itemId: "decor_candles", until: expect.any(Number) }]);
    expect(placed.grave!.decor![0].until - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(placed.me.inventory).toEqual({});

    const list = await bodyOf<GraveListResponse>(graves.GET(call("/api/graves")));
    expect(list.graves.find((g) => g.id === grave.id)?.decor).toHaveLength(1);
    const detail = await bodyOf<GraveDetailResponse>(graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id)));
    expect(detail.grave.decor).toHaveLength(1);
    const admin = await bodyOf<{ graves: AdminGrave[] }>(adminGraves.GET(call("/api/admin/graves", { headers: { "x-admin-key": "dev-admin" } })));
    expect(admin.graves.find((g) => g.id === grave.id)?.decor).toHaveLength(1);
  });
});

describe("GET /api/version", () => {
  it("배포 식별자, 캐시하지 않는다", async () => {
    const res = await version.GET(call("/api/version"));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ version: "dev" });
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    try {
      expect(await bodyOf(version.GET(call("/api/version")))).toEqual({ version: "abc123" });
      vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_1");
      expect(await bodyOf(version.GET(call("/api/version")))).toEqual({ version: "dpl_1" });
    } finally {
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
      vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
    }
  });
});

describe("묘비 디자인", () => {
  const items = async (v: Visitor) => (await getMe(v)).inventory;
  const style = async (id: string) => (await bodyOf<GraveDetailResponse>(graveById.GET(call(`/api/graves/${id}`), ctx(id)))).grave.style;

  it("무료는 그대로, 유료는 디자인권을 쓴다(없으면 409·저장 안 함), 기본은 auto", async () => {
    const v = await newVisitor();
    expect((await bodyOf<CreateGraveResponse>(quickBury(v))).grave.style).toBe("auto");
    const noTicket = await quickBury(v, { style: "coffee" });
    expect(await errorOf(noTicket)).toEqual({ code: "NO_ITEM", message: "가방에 그 묘비 디자인권이 없어요. 상점에서 먼저 사 주세요." });
    expect((await getMe(v)).graves).toHaveLength(1);
    expect((await errorOf(await quickBury(v, { style: "unicorn" }))).code).toBe("INVALID_INPUT");

    setPoints(v, 100);
    await buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "gs_coffee" } }));
    expect(await items(v)).toEqual({ gs_coffee: 1 });
    const { grave } = await bodyOf<CreateGraveResponse>(quickBury(v, { style: "coffee" }));
    expect(grave.style).toBe("coffee");
    expect(await items(v)).toEqual({});

    const list = await bodyOf<GraveListResponse>(graves.GET(call("/api/graves")));
    expect(list.graves.find((g) => g.id === grave.id)?.style).toBe("coffee");
    const admin = await bodyOf<{ graves: AdminGrave[] }>(adminGraves.GET(call("/api/admin/graves", { headers: { "x-admin-key": "dev-admin" } })));
    expect(admin.graves.find((g) => g.id === grave.id)?.style).toBe("coffee");
  });

  it("디자인권 1개로 동시에 묘비 2개를 세우면 하나만 성공한다", async () => {
    const v = await newVisitor();
    setPoints(v, 100);
    await buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "gs_coffee" } }));
    const statuses = (await Promise.all([1, 2].map(() => quickBury(v, { style: "coffee" })))).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await items(v)).toEqual({});
    expect((await getMe(v)).graves).toHaveLength(1);
  });

  it("수정: style을 빼면 유지, 같은 디자인이면 소모 없음, 다른 유료 디자인은 디자인권 필요, 무료로는 자유", async () => {
    const v = await newVisitor();
    setPoints(v, 1000);
    await buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "gs_gold" } }));
    const { grave } = await bodyOf<CreateGraveResponse>(quickBury(v, { style: "gold" }));
    const full = { name: "고침", epitaph: "e", bornAt: grave.bornAt, diedAt: grave.diedAt, causes: ["time"], mourner: "새벽코더" };
    const patch = (body: object) => graveById.PATCH(call(`/api/graves/${grave.id}`, { method: "PATCH", visitor: v, body }), ctx(grave.id));

    expect((await patch(full)).status).toBe(200);
    expect(await style(grave.id)).toBe("gold");
    expect((await patch({ ...full, style: "gold" })).status).toBe(200);
    const noTicket = await patch({ ...full, name: "바뀌면 안 됨", style: "crystal" });
    expect((await errorOf(noTicket)).code).toBe("NO_ITEM");
    const detail = await bodyOf<GraveDetailResponse>(graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id)));
    expect(detail.grave).toMatchObject({ name: "고침", style: "gold" });
    expect((await patch({ ...full, style: "cross" })).status).toBe(200);
    expect(await style(grave.id)).toBe("cross");
    expect(await items(v)).toEqual({});
  });

  it("디자인권은 상점에서 사고, 사용(use)으로는 쓸 수 없다", async () => {
    const v = await newVisitor();
    setPoints(v, 200);
    const bought = await bodyOf<{ me: Me }>(buy.POST(call("/api/shop/buy", { visitor: v, body: { itemId: "gs_duck" } })));
    expect(bought.me).toMatchObject({ points: 80, inventory: { gs_duck: 1 } });
    const used = await use.POST(call("/api/shop/use", { visitor: v, body: { itemId: "gs_duck" } }));
    expect(used.status).toBe(400);
    expect(await items(v)).toEqual({ gs_duck: 1 });
  });
});

describe("관리자 포인트 지급", () => {
  const admin = (body: object, key = "dev-admin") =>
    adminPoints.POST(call("/api/admin/accounts/points", { body, headers: { "x-admin-key": key } }));

  it("개인 코드(해시로 조회) 또는 계정 id로 지급·회수, 0~9,999로 자른다", async () => {
    const v = await newVisitor();
    await attend.POST(call("/api/me/attend", { visitor: v, body: {} }));
    const { code: personal } = await bodyOf<CodeResponse>(code.POST(call("/api/me/code", { method: "POST", visitor: v })));

    const byCode = await admin({ code: personal.replaceAll("-", "").toLowerCase(), delta: 500 });
    const text = await byCode.text();
    expect(JSON.parse(text)).toEqual({ accountId: v.visitorId, points: 510 });
    expect(text).not.toContain(personal);
    expect(await bodyOf(admin({ accountId: v.visitorId, delta: -9999 }))).toEqual({ accountId: v.visitorId, points: 0 });
    await admin({ accountId: v.visitorId, delta: 9999 });
    expect(await bodyOf(admin({ accountId: v.visitorId, delta: 9999 }))).toEqual({ accountId: v.visitorId, points: 9999 });
    expect((await getMe(v)).todayEarned).toBe(10);
  });

  it("검증·없는 계정·관리자 키", async () => {
    const v = await newVisitor();
    for (const body of [
      { accountId: v.visitorId, delta: 10000 },
      { accountId: v.visitorId, delta: 1.5 },
      { accountId: v.visitorId, delta: 0 },
      { accountId: v.visitorId, code: "2222-2222-2222", delta: 1 },
      { delta: 1 },
      { code: "nope", delta: 1 },
    ])
      expect((await admin(body)).status, JSON.stringify(body)).toBe(400);
    expect((await admin({ accountId: v.visitorId, delta: 1 })).status).toBe(404); // 아직 기록이 없는 계정
    expect((await admin({ code: "2222-2222-2222", delta: 1 })).status).toBe(404);
    expect((await admin({ accountId: v.visitorId, delta: 1 }, "wrong")).status).toBe(401);
  });
});

describe("채널별 묘지", () => {
  const listOf = (channel?: number) =>
    bodyOf<GraveListResponse>(graves.GET(call(channel === undefined ? "/api/graves" : `/api/graves?channel=${channel}`)));

  it("세운 채널에만 있다: 다른 채널 목록에 안 나오고, 상세·반응은 id로 그대로 된다", async () => {
    const v = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(quickBury(v, { channel: 2 }));
    expect(grave.channel).toBe(2);
    expect((await listOf()).graves.some((g) => g.id === grave.id)).toBe(false);
    expect((await listOf(1)).graves.some((g) => g.id === grave.id)).toBe(false);
    const two = await listOf(2);
    expect(two.channel).toBe(2);
    expect(two.graves.find((g) => g.id === grave.id)?.channel).toBe(2);
    expect(two.graves.every((g) => g.channel === 2)).toBe(true);

    const fan = await newVisitor();
    await flower.POST(call(`/api/graves/${grave.id}/flower`, { method: "POST", visitor: fan }), ctx(grave.id));
    const detail = await bodyOf<GraveDetailResponse>(graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id)));
    expect(detail.grave).toMatchObject({ channel: 2, flowers: 1 });
    expect((await getMe(v)).graves).toContain(grave.id);

    // 수정해도 채널은 옮겨지지 않는다
    const full = { name: "고침", epitaph: "e", bornAt: grave.bornAt, diedAt: grave.diedAt, causes: ["time"], mourner: "새벽코더", channel: 5 };
    const patched = await graveById.PATCH(call(`/api/graves/${grave.id}`, { method: "PATCH", visitor: v, body: full }), ctx(grave.id));
    expect(((await patched.json()) as { grave: { channel: number } }).grave.channel).toBe(2);
  });

  it("다시 피어날 자리(reviveTop)도 채널별", async () => {
    const v = await newVisitor();
    const { grave: a } = await bodyOf<CreateGraveResponse>(quickBury(v, { channel: 3 }));
    const { grave: b } = await bodyOf<CreateGraveResponse>(quickBury(v, { channel: 4 }));
    const fan = await newVisitor();
    for (const g of [a, b]) await reviveRoute.POST(call(`/api/graves/${g.id}/revive`, { method: "POST", visitor: fan }), ctx(g.id));
    expect((await listOf(3)).reviveTop).toContain(a.id);
    expect((await listOf(3)).reviveTop).not.toContain(b.id);
    expect((await listOf(4)).reviveTop).toEqual([b.id]);
  });

  it("채널 검증: 목록 ?channel은 1~10, 간단 입력은 channel 필수", async () => {
    for (const bad of ["0", "11", "abc", "1.5"]) expect((await graves.GET(call(`/api/graves?channel=${bad}`))).status, bad).toBe(400);
    const v = await newVisitor();
    const res = await graves.POST(call("/api/graves", { visitor: v, body: { name: "x", lived: "day", mourner: "새벽코더" } }));
    expect(res.status).toBe(400);
  });

  it("관리자 목록은 모든 채널을 채널과 함께 보여 준다", async () => {
    const v = await newVisitor();
    const { grave } = await bodyOf<CreateGraveResponse>(quickBury(v, { channel: 7 }));
    const admin = await bodyOf<{ graves: AdminGrave[] }>(adminGraves.GET(call("/api/admin/graves", { headers: { "x-admin-key": "dev-admin" } })));
    expect(admin.graves.find((g) => g.id === grave.id)?.channel).toBe(7);
    expect(new Set(admin.graves.map((g) => g.channel)).size).toBeGreaterThan(1);
  });
});

describe("새로 시작·로그아웃·닉네임", () => {
  it("fresh면 기존 쿠키를 버리고 새 계정, 아니면 같은 계정", async () => {
    const v = await newVisitor();
    const same = await bodyOf<{ visitorId: string }>(session.POST(call("/api/session", { method: "POST", visitor: v })));
    expect(same.visitorId).toBe(v.visitorId);
    const res = await session.POST(call("/api/session", { visitor: v, body: { fresh: true } }));
    const fresh = (await res.json()) as { visitorId: string };
    expect(fresh.visitorId).not.toBe(v.visitorId);
    expect(await verifySession(res.headers.get("set-cookie")!.split(";")[0].replace(/^vid=/, ""))).toBe(fresh.visitorId);
  });

  it("로그아웃은 204와 함께 세션 쿠키를 지운다", async () => {
    const v = await newVisitor();
    const res = await logout.POST(call("/api/me/logout", { method: "POST", visitor: v }));
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toMatch(/^vid=;.*Max-Age=0/i);
  });

  it("개인 코드로 들어온 기기에서 다른 이름으로 출석해도 계정 닉네임은 그대로", async () => {
    const v = await newVisitor();
    await attend.POST(call("/api/me/attend", { visitor: v, body: { name: "원래이름" } }));
    const { code: c } = await bodyOf<CodeResponse>(code.POST(call("/api/me/code", { method: "POST", visitor: v })));
    const res = await login.POST(call("/api/me/login", { body: { code: c }, headers: { "x-forwarded-for": "10.5.0.1" } }));
    expect(((await res.json()) as CodeLoginResponse).me.name).toBe("원래이름");
    const device2: Visitor = { cookie: res.headers.get("set-cookie")!.split(";")[0], ip: "10.5.0.1", visitorId: v.visitorId };
    await attend.POST(call("/api/me/attend", { visitor: device2, body: { name: "다른기기" } }));
    expect((await getMe(device2)).name).toBe("원래이름");
  });
});
