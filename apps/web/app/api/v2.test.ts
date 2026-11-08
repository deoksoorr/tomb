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
import * as adminGraves from "./admin/graves/route";
import * as flower from "./graves/[id]/flower/route";
import * as graveById from "./graves/[id]/route";
import * as graves from "./graves/route";
import * as join from "./join/route";
import * as attend from "./me/attend/route";
import * as code from "./me/code/route";
import * as login from "./me/login/route";
import * as look from "./me/look/route";
import * as me from "./me/route";
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
  graves.POST(call("/api/graves", { visitor: v, body: { name: "할 일 앱", lived: "week", mourner: "새벽코더", ...body } }));

describe("계정·출석", () => {
  it("세션이 없으면 401, 처음엔 0점·빈 가방", async () => {
    expect((await me.GET(call("/api/me"))).status).toBe(401);
    const v = await newVisitor();
    expect(await getMe(v)).toEqual({
      accountId: v.visitorId,
      name: null,
      points: 0,
      todayEarned: 0,
      attendance: { today: false, streak: 0 },
      hasCode: false,
      inventory: {},
      equipped: [],
      graves: [],
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
    expect((await errorOf(await quickBury(v, { name: " " }))).message).toBe("프로젝트 이름을 적어 주세요.");
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
    expect(bought.me).toMatchObject({ points: 70, inventory: { fw_small: 1 } });

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
