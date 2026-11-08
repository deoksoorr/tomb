import { verifyJoinToken, type LobbyInfo } from "@tomb/protocol";
import { del, issueSignedToken } from "@vercel/blob";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { REALTIME_WS_URL } from "@/lib/realtime";
import type {
  ApiError,
  CreateGraveResponse,
  GraveDetailResponse,
  GraveListResponse,
  JoinResponse,
  UploadModeResponse,
} from "@/lib/types";
import type { AdminGrave } from "@/lib/admin";
import * as adminChannels from "./admin/channels/route";
import * as adminBulk from "./admin/graves/bulk/route";
import * as adminGrave from "./admin/graves/[id]/route";
import * as adminGraves from "./admin/graves/route";
import * as adminSession from "./admin/session/route";
import * as flower from "./graves/[id]/flower/route";
import * as report from "./graves/[id]/report/route";
import * as revive from "./graves/[id]/revive/route";
import * as graveById from "./graves/[id]/route";
import * as graves from "./graves/route";
import * as join from "./join/route";
import { issueJoin } from "@/lib/joinToken";
import * as og from "./og/route";
import * as session from "./session/route";
import * as localFile from "./upload/local/[...path]/route";
import * as localUpload from "./upload/local/route";
import * as upload from "./upload/route";

// Blob 제어 API(네트워크)를 부르는 두 함수만 가짜로 바꾼다. presigned URL 서명 자체는 SDK가 로컬에서 계산한다
vi.mock("@vercel/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vercel/blob")>()),
  issueSignedToken: vi.fn(),
  del: vi.fn(),
}));

// 외부 계정 없이 도는 로컬 구성(MemoryStore + 메모리 레이트리밋 + 로컬 업로드)으로 라우트를 직접 호출한다
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
  if (opts.body !== undefined && !(opts.body instanceof FormData)) headers["content-type"] = "application/json";
  const body = opts.body instanceof FormData ? opts.body : opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? "GET", headers, body });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;

/** 새 쿠키를 받은 방문자. IP를 주지 않으면 방문자마다 다른 IP를 쓴다 */
async function newVisitor(ip = `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip, visitorId: ((await res.json()) as { visitorId: string }).visitorId };
}

const input = {
  name: "할 일 앱 v4",
  epitaph: "향년 3일, 로그인 구현 중 별세",
  bornAt: "2024-01-01",
  diedAt: "2024-01-03",
  lastTask: "로그인 구현",
  causes: ["time"],
  mourner: "새벽코더",
};

async function createGrave(visitor: Visitor, body: object = input) {
  const res = await graves.POST(call("/api/graves", { method: "POST", visitor, body }));
  expect(res.status).toBe(201);
  return (await res.json()) as CreateGraveResponse;
}

describe("POST /api/session", () => {
  it("httpOnly·SameSite=Lax·1년 쿠키를 주고, 유효한 쿠키가 있으면 같은 id를 다시 쓴다", async () => {
    const v = await newVisitor();
    const res = await session.POST(call("/api/session", { method: "POST", visitor: v }));
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Max-Age=31536000/);
    expect(((await res.json()) as { visitorId: string }).visitorId).toBe(v.visitorId);

    const forged = { ...v, cookie: v.cookie.slice(0, -3) + "xyz" };
    const fresh = await session.POST(call("/api/session", { method: "POST", visitor: forged }));
    expect(((await fresh.json()) as { visitorId: string }).visitorId).not.toBe(v.visitorId);
  });
});

describe("묘비 CRUD", () => {
  it("세션 없이 쓰기 요청 → 401 NO_SESSION", async () => {
    const res = await graves.POST(call("/api/graves", { method: "POST", body: input }));
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("NO_SESSION");
  });

  it("잘못된 입력 → 400 INVALID_INPUT + 한국어 메시지", async () => {
    const v = await newVisitor();
    const res = await graves.POST(call("/api/graves", { method: "POST", visitor: v, body: { ...input, causes: [] } }));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toEqual({ code: "INVALID_INPUT", message: "사인을 하나 이상 골라 주세요." });

    const broken = new NextRequest("http://localhost/api/graves", {
      method: "POST",
      headers: { cookie: v.cookie, "content-type": "application/json" },
      body: "{oops",
    });
    expect((await errorOf(await graves.POST(broken))).code).toBe("INVALID_INPUT");
  });

  it("생성 → 주인만 수정·이장, 다른 토큰은 403", async () => {
    const owner = await newVisitor();
    const { grave, ownerToken } = await createGrave(owner);
    expect(grave).toMatchObject({ name: "할 일 앱 v4", ageDays: 3, flowers: 0, revives: 0 });
    expect(grave).not.toHaveProperty("ownerTokenHash");
    expect(ownerToken).toHaveLength(32);

    const stranger = await newVisitor();
    const patchBody = { ...input, name: "할 일 앱 v5", diedAt: "2024-01-10" };
    for (const token of [undefined, "x".repeat(32)]) {
      const headers = token ? { "x-owner-token": token } : undefined;
      const res = await graveById.PATCH(
        call(`/api/graves/${grave.id}`, { method: "PATCH", visitor: stranger, body: patchBody, headers }),
        ctx(grave.id),
      );
      expect(res.status).toBe(403);
      expect((await errorOf(res)).code).toBe("NOT_OWNER");
    }
    const del403 = await graveById.DELETE(
      call(`/api/graves/${grave.id}`, { method: "DELETE", visitor: stranger, headers: { "x-owner-token": "nope" } }),
      ctx(grave.id),
    );
    expect(del403.status).toBe(403);

    // 소유권은 쿠키가 아니라 ownerToken으로 증명한다 (다른 방문자여도 토큰이 있으면 된다)
    const patched = await graveById.PATCH(
      call(`/api/graves/${grave.id}`, {
        method: "PATCH",
        visitor: stranger,
        body: patchBody,
        headers: { "x-owner-token": ownerToken },
      }),
      ctx(grave.id),
    );
    expect(patched.status).toBe(200);
    const updated = ((await patched.json()) as { grave: CreateGraveResponse["grave"] }).grave;
    expect(updated).toMatchObject({ id: grave.id, name: "할 일 앱 v5", ageDays: 10, createdAt: grave.createdAt });

    const detail = await graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id));
    expect(((await detail.json()) as GraveDetailResponse).grave.name).toBe("할 일 앱 v5");

    const deleted = await graveById.DELETE(
      call(`/api/graves/${grave.id}`, { method: "DELETE", visitor: owner, headers: { "x-owner-token": ownerToken } }),
      ctx(grave.id),
    );
    expect(deleted.status).toBe(200);
    const gone = await graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id));
    expect(gone.status).toBe(404);
    expect((await errorOf(gone)).code).toBe("NOT_FOUND");
  });

  it("상세: 공유 캐시 금지, IP당 분당 120회 (쿠키를 바꿔도 같은 IP면 같이 센다)", async () => {
    const ip = "10.5.5.5";
    const detail = async (cookie?: string) =>
      graveById.GET(call("/api/graves/mock-001", { headers: { "x-forwarded-for": ip, ...(cookie && { cookie }) } }), ctx("mock-001"));
    const first = await detail();
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    for (let i = 1; i < 119; i++) await detail();
    expect((await detail((await newVisitor()).cookie)).status).toBe(200);
    const limited = await detail((await newVisitor()).cookie);
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe("RATE_LIMITED");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await graveById.GET(call("/api/graves/mock-001", { headers: { "x-forwarded-for": "10.5.5.6" } }), ctx("mock-001"))).status).toBe(200);
  });

  it("목업 묘비(소유자 없음)는 아무도 고칠 수 없다", async () => {
    const v = await newVisitor();
    const res = await graveById.DELETE(
      call("/api/graves/mock-001", { method: "DELETE", visitor: v, headers: { "x-owner-token": "" } }),
      ctx("mock-001"),
    );
    expect(res.status).toBe(403);
  });

  it("목록: CDN 캐시 헤더, 등록 순, 비밀 필드 없음", async () => {
    const v = await newVisitor();
    const { grave } = await createGrave(v);
    const res = await graves.GET(call("/api/graves"));
    expect(res.headers.get("cache-control")).toBe("s-maxage=30, stale-while-revalidate=86400");
    const list = (await res.json()) as GraveListResponse;
    expect(list.graves.at(-1)?.id).toBe(grave.id);
    expect(list.graves.slice(0, 3).map((g) => g.id)).toEqual(["mock-001", "mock-002", "mock-003"]);
    expect(JSON.stringify(list)).not.toMatch(/ownerTokenHash|"hidden"/);
  });

  it("하루 3개를 넘게 세우면 429 RATE_LIMITED + Retry-After", async () => {
    const v = await newVisitor();
    for (let i = 0; i < 3; i++) await createGrave(v);
    const res = await graves.POST(call("/api/graves", { method: "POST", visitor: v, body: input }));
    expect(res.status).toBe(429);
    expect(await errorOf(res)).toEqual({ code: "RATE_LIMITED", message: "묘비는 하루에 3개까지 세울 수 있어요." });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("같은 IP에서 쿠키를 새로 받아도, 같은 쿠키로 IP를 바꿔도 하루 3개까지 (QA)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const v = await newVisitor("10.9.9.9");
      statuses.push((await graves.POST(call("/api/graves", { method: "POST", visitor: v, body: input }))).status);
    }
    expect(statuses).toEqual([201, 201, 201, 429, 429, 429]);

    const roaming = await newVisitor();
    for (let i = 0; i < 3; i++) await createGrave({ ...roaming, ip: `10.8.0.${i}` });
    const res = await graves.POST(call("/api/graves", { method: "POST", visitor: { ...roaming, ip: "10.8.0.9" }, body: input }));
    expect(res.status).toBe(429);
  });
});

describe("반응", () => {
  it("헌화: 두 번째는 409 ALREADY_FLOWERED, 상세에 myFlowerToday", async () => {
    const v = await newVisitor();
    const { grave } = await createGrave(v);
    const first = await flower.POST(call(`/api/graves/${grave.id}/flower`, { method: "POST", visitor: v }), ctx(grave.id));
    expect(await first.json()).toEqual({ count: 1, earned: 2 });
    const second = await flower.POST(call(`/api/graves/${grave.id}/flower`, { method: "POST", visitor: v }), ctx(grave.id));
    expect(second.status).toBe(409);
    expect((await errorOf(second)).code).toBe("ALREADY_FLOWERED");

    const detail = (await (
      await graveById.GET(call(`/api/graves/${grave.id}`, { visitor: v }), ctx(grave.id))
    ).json()) as GraveDetailResponse;
    expect(detail).toMatchObject({ myFlowerToday: true, myRevive: false, grave: { flowers: 1 } });
  });

  it("살려주세요: 토글, 상세에 myRevive", async () => {
    const v = await newVisitor();
    const { grave } = await createGrave(v);
    const on = await revive.POST(call(`/api/graves/${grave.id}/revive`, { method: "POST", visitor: v }), ctx(grave.id));
    expect(await on.json()).toEqual({ revived: true, count: 1, earned: 1 });
    const detail = (await (
      await graveById.GET(call(`/api/graves/${grave.id}`, { visitor: v }), ctx(grave.id))
    ).json()) as GraveDetailResponse;
    expect(detail.myRevive).toBe(true);
    const off = await revive.POST(call(`/api/graves/${grave.id}/revive`, { method: "POST", visitor: v }), ctx(grave.id));
    expect(await off.json()).toEqual({ revived: false, count: 0, earned: 0 });
    // 취소했다 다시 눌러도 포인트는 처음 한 번만
    const again = await revive.POST(call(`/api/graves/${grave.id}/revive`, { method: "POST", visitor: v }), ctx(grave.id));
    expect(await again.json()).toEqual({ revived: true, count: 1, earned: 0 });
  });

  it("없는 묘비에 반응 → 404", async () => {
    const v = await newVisitor();
    const res = await flower.POST(call("/api/graves/nope/flower", { method: "POST", visitor: v }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("서로 다른 5명이 신고하면 목록·상세에서 사라지고, 관리자는 볼 수 있고 복구할 수 있다", async () => {
    const owner = await newVisitor();
    const { grave } = await createGrave(owner);
    const reporters = await Promise.all(Array.from({ length: 5 }, newVisitor));

    const post = (v: Visitor) => report.POST(call(`/api/graves/${grave.id}/report`, { method: "POST", visitor: v }), ctx(grave.id));
    expect(await (await post(reporters[0])).json()).toEqual({ ok: true });
    const dup = await post(reporters[0]);
    expect(dup.status).toBe(409);
    expect((await errorOf(dup)).code).toBe("ALREADY_REPORTED");
    for (const v of reporters.slice(1, 4)) expect((await post(v)).status).toBe(200);

    const listed = async () => ((await (await graves.GET(call("/api/graves"))).json()) as GraveListResponse).graves;
    expect((await listed()).some((g) => g.id === grave.id)).toBe(true);
    expect((await post(reporters[4])).status).toBe(200);
    expect((await listed()).some((g) => g.id === grave.id)).toBe(false);
    expect((await graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id))).status).toBe(404);

    const adminHeaders = { "x-admin-key": "dev-admin" };
    const all = (await (await adminGraves.GET(call("/api/admin/graves", { headers: adminHeaders }))).json()) as {
      graves: { id: string; hidden: boolean }[];
    };
    expect(all.graves.find((g) => g.id === grave.id)?.hidden).toBe(true);

    const unhide = await adminGrave.POST(
      call(`/api/admin/graves/${grave.id}`, {
        method: "POST",
        body: { action: "unhide" },
        headers: { authorization: "Bearer dev-admin" },
      }),
      ctx(grave.id),
    );
    expect(unhide.status).toBe(200);
    expect((await listed()).some((g) => g.id === grave.id)).toBe(true);
  });
});

describe("신고 남용 (QA)", () => {
  it("한 IP에서 쿠키를 바꿔 5번 신고해도 1건만 센다", async () => {
    const owner = await newVisitor();
    const { grave } = await createGrave(owner);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const v = await newVisitor("10.7.7.7");
      statuses.push((await report.POST(call(`/api/graves/${grave.id}/report`, { method: "POST", visitor: v }), ctx(grave.id))).status);
    }
    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    expect((await graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id))).status).toBe(200);
  });
});

describe("신고 사유", () => {
  it("사유를 고르면 기록되고, 본문이 없으면 기타로 받는다. 모르는 사유는 400", async () => {
    const owner = await newVisitor();
    const { grave } = await createGrave(owner);
    const post = (v: Visitor, body?: object) =>
      report.POST(call(`/api/graves/${grave.id}/report`, { method: "POST", visitor: v, body }), ctx(grave.id));
    const bad = await post(await newVisitor(), { reason: "boring" });
    expect(await errorOf(bad)).toEqual({ code: "INVALID_INPUT", message: "알 수 없는 신고 사유예요." });
    expect((await post(await newVisitor(), { reason: "privacy" })).status).toBe(200);
    expect((await post(await newVisitor())).status).toBe(200);

    const list = (await (await adminGraves.GET(call("/api/admin/graves", { headers: { "x-admin-key": "dev-admin" } }))).json()) as {
      graves: AdminGrave[];
    };
    const mine = list.graves.find((g) => g.id === grave.id)!;
    expect(mine.reports).toBe(2);
    expect(mine.reportLog.map((e) => e.reason)).toEqual(["other", "privacy"]);
    expect(mine.reportLog[0].at).toBeGreaterThan(Date.now() - 10_000);
  });
});

describe("관리자", () => {
  it("키가 없거나 틀리면 401 UNAUTHORIZED", async () => {
    const attempts: (Record<string, string> | undefined)[] = [
      undefined,
      { "x-admin-key": "wrong" },
      { authorization: "Bearer wrong" },
    ];
    for (const headers of attempts) {
      const res = await adminGraves.GET(call("/api/admin/graves", { headers }));
      expect(res.status).toBe(401);
      expect((await errorOf(res)).code).toBe("UNAUTHORIZED");
    }
  });

  it("틀린 키를 IP당 분당 10번 넘게 시도하면 맞는 키도 잠시 429", async () => {
    const from = (ip: string, key: string) =>
      adminGraves.GET(call("/api/admin/graves", { headers: { "x-admin-key": key, "x-forwarded-for": ip } }));
    for (let i = 0; i < 10; i++) expect((await from("10.6.6.6", `guess-${i}`)).status).toBe(401);
    expect((await from("10.6.6.6", "guess-x")).status).toBe(429);
    const locked = await from("10.6.6.6", "dev-admin");
    expect(locked.status).toBe(429);
    expect((await errorOf(locked)).code).toBe("RATE_LIMITED");
    expect((await from("10.6.6.7", "dev-admin")).status).toBe(200);
  });

  it("hide / delete / 잘못된 action / 없는 묘비", async () => {
    const v = await newVisitor();
    const { grave } = await createGrave(v);
    const act = (id: string, action: string) =>
      adminGrave.POST(
        call(`/api/admin/graves/${id}`, { method: "POST", body: { action }, headers: { "x-admin-key": "dev-admin" } }),
        ctx(id),
      );
    expect((await act(grave.id, "hide")).status).toBe(200);
    expect((await graveById.GET(call(`/api/graves/${grave.id}`), ctx(grave.id))).status).toBe(404);
    expect((await act(grave.id, "explode")).status).toBe(400);
    expect((await act(grave.id, "delete")).status).toBe(200);
    expect((await act(grave.id, "delete")).status).toBe(404);
  });

  it("로그인 쿠키: 맞는 키면 12시간짜리 httpOnly·SameSite=Strict 쿠키, 그 쿠키로 API 사용, 로그아웃하면 끝", async () => {
    const ip = "10.4.4.4";
    const login = (key: string) =>
      adminSession.POST(call("/api/admin/session", { method: "POST", body: { key }, headers: { "x-forwarded-for": ip } }));
    expect((await login("wrong")).status).toBe(401);
    const ok = await login("dev-admin");
    const setCookie = ok.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^tomb_admin=\d+\.[\w-]+;/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=strict/i);
    expect(setCookie).toMatch(/Max-Age=43200/);
    const cookie = setCookie.split(";")[0];

    const withCookie = (c: string) => adminGraves.GET(call("/api/admin/graves", { headers: { cookie: c, "x-forwarded-for": ip } }));
    expect((await withCookie(cookie)).status).toBe(200);
    // base64url 서명의 마지막 글자는 하위 비트가 버려져 바꿔도 같은 바이트가 될 수 있으므로, 가운데 글자를 바꾼다
    const mid = cookie.length - 10;
    const tampered = cookie.slice(0, mid) + (cookie[mid] === "A" ? "B" : "A") + cookie.slice(mid + 1);
    expect((await withCookie(tampered)).status).toBe(401);
    expect((await withCookie("tomb_admin=99999999999.forged")).status).toBe(401);
    // 쿠키도 키도 없는 요청(로그인 전 화면)은 실패로 세지 않는다
    for (let i = 0; i < 12; i++) expect((await adminGraves.GET(call("/api/admin/graves", { headers: { "x-forwarded-for": ip } }))).status).toBe(401);
    expect((await withCookie(cookie)).status).toBe(200);

    const out = await adminSession.DELETE(call("/api/admin/session", { method: "DELETE" }));
    expect(out.headers.get("set-cookie")).toMatch(/tomb_admin=;.*Max-Age=0/i);
  });

  it("신고 초기화와 일괄 처리 (최대 100개, 없는 묘비는 따로 알려 준다)", async () => {
    const owner = await newVisitor();
    const a = (await createGrave(owner)).grave.id;
    const b = (await createGrave(owner)).grave.id;
    const key = { "x-admin-key": "dev-admin" };
    const bulk = (body: object) => adminBulk.POST(call("/api/admin/graves/bulk", { method: "POST", body, headers: key }));
    const status = async (id: string) =>
      ((await (await adminGraves.GET(call("/api/admin/graves", { headers: key }))).json()) as { graves: AdminGrave[] }).graves.find(
        (g) => g.id === id,
      );

    await report.POST(call(`/api/graves/${a}/report`, { method: "POST", visitor: await newVisitor(), body: { reason: "spam" } }), ctx(a));
    expect(await (await bulk({ ids: [a, b, "nope", a], action: "hide" })).json()).toEqual({ done: [a, b], notFound: ["nope"] });
    expect(await status(a)).toMatchObject({ hidden: true, reports: 1 });

    const reset = await adminGrave.POST(
      call(`/api/admin/graves/${a}`, { method: "POST", body: { action: "resetReports" }, headers: key }),
      ctx(a),
    );
    expect(reset.status).toBe(200);
    expect(await status(a)).toMatchObject({ hidden: true, reports: 0, reportLog: [] });

    expect(await (await bulk({ ids: [a, b], action: "delete" })).json()).toEqual({ done: [a, b], notFound: [] });
    expect(await status(a)).toBeUndefined();
    expect((await bulk({ ids: [], action: "hide" })).status).toBe(400);
    expect((await bulk({ ids: Array.from({ length: 101 }, (_, i) => `id${i}`), action: "hide" })).status).toBe(400);
    expect((await bulk({ ids: ["../x"], action: "hide" })).status).toBe(400);
  });

  it("채널 조회: 로비를 프록시하고, 실패하면 502", async () => {
    const lobby: LobbyInfo = { channels: [{ id: 1, count: 3, cap: 40, open: true }], total: 3, totalCap: 400, maxChannels: 10, threshold: 0.8 };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(lobby));
    const ok = await adminChannels.GET(call("/api/admin/channels", { headers: { "x-admin-key": "dev-admin" } }));
    expect(await ok.json()).toEqual(lobby);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("down"));
    const down = await adminChannels.GET(call("/api/admin/channels", { headers: { "x-admin-key": "dev-admin" } }));
    expect(down.status).toBe(502);
  });
});

describe("POST /api/join", () => {
  const body = { channel: "auto", name: "새벽코더", color: "#9fc5a8" };
  const lobby = (counts: number[]): LobbyInfo => ({
    channels: counts.map((count, i) => ({ id: i + 1, count, cap: 40, open: true })),
    total: counts.reduce((a, b) => a + b, 0),
    totalCap: 400,
    maxChannels: counts.length,
    threshold: 0.8,
  });
  // 기본은 로비 무응답. 로비가 필요한 테스트는 mockResolvedValueOnce로 덮는다
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no lobby"));
  });

  it("auto: 로비를 보고 채널을 고르고, 그 채널 전용 60초짜리 토큰과 wsUrl을 준다", async () => {
    const v = await newVisitor();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(lobby([35, 12, 0])));
    const res = (await (await join.POST(call("/api/join", { method: "POST", visitor: v, body }))).json()) as JoinResponse;
    if (res.mode !== "channel") throw new Error("channel 모드여야 한다");
    expect(res.channel).toBe(2);
    expect(res.wsUrl).toBe(`${REALTIME_WS_URL}/ch/2?t=${encodeURIComponent(res.token)}`);
    const claims = await verifyJoinToken("dev-join-secret-change-me", res.token);
    expect(claims).toMatchObject({ visitorId: v.visitorId, name: "새벽코더", color: "#9fc5a8", channel: 2 });
    expect(claims!.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
  });

  it("로비가 응답하지 않으면 auto는 1채널, 직접 고른 채널은 1~99 검증만으로 그 채널", async () => {
    const v = await newVisitor();
    const auto = (await (await join.POST(call("/api/join", { method: "POST", visitor: v, body }))).json()) as JoinResponse;
    expect(auto).toMatchObject({ mode: "channel", channel: 1 });

    const picked = (await (
      await join.POST(call("/api/join", { method: "POST", visitor: v, body: { ...body, channel: 42 } }))
    ).json()) as JoinResponse;
    if (picked.mode !== "channel") throw new Error("channel 모드여야 한다");
    expect(picked.channel).toBe(42);
    expect((await verifyJoinToken("dev-join-secret-change-me", picked.token))?.channel).toBe(42);
  });

  it("로비를 알면 직접 고른 채널은 maxChannels 안이어야 한다", async () => {
    const v = await newVisitor();
    const pick = (channel: number) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(lobby([3, 0, 0])));
      return join.POST(call("/api/join", { method: "POST", visitor: v, body: { ...body, channel } }));
    };
    expect(await (await pick(3)).json()).toMatchObject({ mode: "channel", channel: 3 });
    const over = await pick(4);
    expect(over.status).toBe(400);
    expect(await errorOf(over)).toEqual({ code: "INVALID_INPUT", message: "채널은 1~3 중에서 골라 주세요." });
  });

  it("로비 응답 형태가 이상하면 1채널", async () => {
    const v = await newVisitor();
    for (const weird of [{ channels: "nope" }, { ...lobby([0]), channels: [{ id: 500, count: 0, cap: 40, open: true }] }, [1, 2]]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(weird));
      const res = await join.POST(call("/api/join", { method: "POST", visitor: v, body }));
      expect(await res.json()).toMatchObject({ mode: "channel", channel: 1 });
    }
  });

  it("운영에서 NEXT_PUBLIC_REALTIME_URL이 없으면 localhost로 보내지 않고 500 + 로그", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "prod-session-secret");
    vi.stubEnv("JOIN_SECRET", "prod-join-secret");
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "");
    vi.stubEnv("REALTIME_INTERNAL_URL", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const claims = { visitorId: "v", name: "새벽코더", color: "#9fc5a8", look: [] };
      await expect(issueJoin(1, claims)).rejects.toThrow(/NEXT_PUBLIC_REALTIME_URL/);
      const v = await newVisitor();
      const res = await join.POST(call("/api/join", { method: "POST", visitor: v, body: { ...body, channel: 1 } }));
      expect(res.status).toBe(500);
      expect((await errorOf(res)).code).toBe("INTERNAL");
      expect(log).toHaveBeenCalled();
    } finally {
      for (const k of ["SESSION_SECRET", "JOIN_SECRET", "NEXT_PUBLIC_REALTIME_URL", "REALTIME_INTERNAL_URL"]) vi.stubEnv(k, "");
      vi.stubEnv("NODE_ENV", "test");
    }
  });

  it("전체 만석이면 대기열: 대기열 전용(channel 0) 10분 토큰이 든 queueUrl", async () => {
    const v = await newVisitor();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(lobby([40, 40])));
    const res = (await (await join.POST(call("/api/join", { method: "POST", visitor: v, body }))).json()) as JoinResponse;
    if (res.mode !== "queue") throw new Error("queue 모드여야 한다");
    const url = new URL(res.queueUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${REALTIME_WS_URL.replace(/^ws/, "http")}/queue`);
    const claims = await verifyJoinToken("dev-join-secret-change-me", url.searchParams.get("t")!);
    expect(claims).toMatchObject({ visitorId: v.visitorId, channel: 0, look: [] });
    expect(claims!.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(590);
  });

  it("세션·입력 검증, 분당 10회", async () => {
    expect((await join.POST(call("/api/join", { method: "POST", body }))).status).toBe(401);
    const v = await newVisitor();
    const bad = await join.POST(call("/api/join", { method: "POST", visitor: v, body: { ...body, color: "red" } }));
    expect((await errorOf(bad)).message).toBe("고를 수 있는 색이 아니에요.");

    const fixed = { ...body, channel: 1 };
    for (let i = 0; i < 10; i++)
      expect((await join.POST(call("/api/join", { method: "POST", visitor: v, body: fixed }))).status).toBe(200);
    expect((await join.POST(call("/api/join", { method: "POST", visitor: v, body: fixed }))).status).toBe(429);
  });
});

describe("업로드", () => {
  const webp = () => {
    const bytes = new Uint8Array(64);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    return bytes;
  };
  const form = (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    return fd;
  };
  const uploadMode = async (v: Visitor) => (await (await upload.GET(call("/api/upload", { visitor: v }))).json()) as UploadModeResponse;
  const uploadLocal = async (v: Visitor) => {
    const res = await localUpload.POST(
      call("/api/upload/local", { method: "POST", visitor: v, body: form(new File([webp()], "a.webp", { type: "image/webp" })) }),
    );
    expect(res.status).toBe(201);
    return ((await res.json()) as { url: string }).url;
  };
  const serve = (url: string) =>
    localFile.GET(call(url), { params: Promise.resolve({ path: url.slice("/api/upload/local/".length).split("/") }) });
  const patch = (v: Visitor, id: string, ownerToken: string, body: object) =>
    graveById.PATCH(call(`/api/graves/${id}`, { method: "PATCH", visitor: v, body, headers: { "x-owner-token": ownerToken } }), ctx(id));

  it("GET /api/upload: 세션 필요, 방문자마다 다른 업로드 폴더(prefix)", async () => {
    expect((await upload.GET(call("/api/upload"))).status).toBe(401);
    const a = await newVisitor();
    const mode = await uploadMode(a);
    expect(mode).toEqual({ mode: "local", prefix: expect.stringMatching(/^graves\/[0-9a-f]{16}\/$/) });
    expect((await uploadMode(a)).prefix).toBe(mode.prefix);
    expect((await uploadMode(await newVisitor())).prefix).not.toBe(mode.prefix);
    // Blob 토큰이 없으면 클라이언트 토큰 경로는 쓰지 않는다
    expect((await upload.POST(call("/api/upload", { method: "POST", visitor: a, body: {} }))).status).toBe(503);
  });

  it("로컬: 내 폴더에 저장·서빙되고, 내 묘비 이미지로 쓸 수 있다", async () => {
    const v = await newVisitor();
    const url = await uploadLocal(v);
    expect(url.startsWith(`/api/upload/local/${(await uploadMode(v)).prefix}`)).toBe(true);
    const served = await serve(url);
    expect(served.headers.get("content-type")).toBe("image/webp");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(webp());

    const { grave } = await createGrave(v, { ...input, imageUrl: url });
    expect(grave.imageUrl).toBe(url);
  });

  it("남의 이미지로 묘비를 세우거나 바꿔 끼울 수 없다 → 이장으로 남의 이미지를 지울 수 없다 (QA)", async () => {
    const victim = await newVisitor();
    const url = await uploadLocal(victim);
    await createGrave(victim, { ...input, imageUrl: url });

    const attacker = await newVisitor();
    const stolen = await graves.POST(call("/api/graves", { method: "POST", visitor: attacker, body: { ...input, imageUrl: url } }));
    expect(stolen.status).toBe(400);
    expect(await errorOf(stolen)).toEqual({ code: "INVALID_INPUT", message: "직접 올린 이미지만 쓸 수 있어요." });

    const own = await createGrave(attacker);
    expect((await patch(attacker, own.grave.id, own.ownerToken, { ...input, imageUrl: url })).status).toBe(400);
    await graveById.DELETE(
      call(`/api/graves/${own.grave.id}`, { method: "DELETE", visitor: attacker, headers: { "x-owner-token": own.ownerToken } }),
      ctx(own.grave.id),
    );
    expect((await serve(url)).status).toBe(200);
  });

  it("수정: 붙어 있던 이미지는 다른 브라우저에서도 유지할 수 있고, 교체하면 옛 이미지를 지운다", async () => {
    const owner = await newVisitor();
    const first = await uploadLocal(owner);
    const { grave, ownerToken } = await createGrave(owner, { ...input, imageUrl: first });

    const sameOwnerNewCookie = await newVisitor();
    expect((await patch(sameOwnerNewCookie, grave.id, ownerToken, { ...input, name: "새 이름", imageUrl: first })).status).toBe(200);
    expect((await serve(first)).status).toBe(200);

    const second = await uploadLocal(owner);
    expect((await patch(owner, grave.id, ownerToken, { ...input, imageUrl: second })).status).toBe(200);
    expect((await serve(first)).status).toBe(404);
    expect((await serve(second)).status).toBe(200);
  });

  it("2차 방어: 다른 묘비가 같은 이미지를 쓰고 있으면 이장해도 지우지 않는다", async () => {
    const owner = await newVisitor();
    const url = await uploadLocal(owner);
    const a = await createGrave(owner, { ...input, imageUrl: url });
    const b = await createGrave(owner, { ...input, imageUrl: url });
    const del = (g: CreateGraveResponse) =>
      graveById.DELETE(
        call(`/api/graves/${g.grave.id}`, { method: "DELETE", visitor: owner, headers: { "x-owner-token": g.ownerToken } }),
        ctx(g.grave.id),
      );
    await del(a);
    expect((await serve(url)).status).toBe(200);
    await del(b);
    expect((await serve(url)).status).toBe(404);
  });

  it("로컬: WebP가 아니거나 300KB를 넘으면 거절", async () => {
    const v = await newVisitor();
    const post = (file: File) => localUpload.POST(call("/api/upload/local", { method: "POST", visitor: v, body: form(file) }));
    expect((await errorOf(await post(new File(["<svg/>"], "a.webp", { type: "image/webp" })))).code).toBe("INVALID_FILE");
    expect((await post(new File([webp()], "a.png", { type: "image/png" }))).status).toBe(400);
    const big = new Uint8Array(300 * 1024 + 1);
    big.set(webp());
    expect((await errorOf(await post(new File([big], "a.webp", { type: "image/webp" })))).code).toBe("FILE_TOO_LARGE");
  });

  it("모드 조회는 업로드 한도를 미리 확인한다 (쓰지는 않는다)", async () => {
    const v = await newVisitor();
    for (let i = 0; i < 3; i++) expect((await upload.GET(call("/api/upload", { visitor: v }))).status).toBe(200);
    for (let i = 0; i < 5; i++) await uploadLocal(v);
    const res = await upload.GET(call("/api/upload", { visitor: v }));
    expect(res.status).toBe(429);
    expect(await errorOf(res)).toEqual({ code: "RATE_LIMITED", message: "사진은 하루에 5장까지 올릴 수 있어요." });
  });
});

describe("업로드 (Blob presigned: OIDC / 읽기쓰기 토큰)", () => {
  /** issueSignedToken이 돌려주는 위임 토큰 흉내: base64url(JSON 범위) + "." + 서명 */
  const fakeSignedToken = (opts: { pathname?: string; validUntil?: number }) => ({
    delegationToken: `${Buffer.from(JSON.stringify({ ...opts, operations: ["put"], storeId: "store_AbC123" })).toString("base64url")}.sig`,
    clientSigningToken: "client-signing-key",
    validUntil: opts.validUntil ?? Date.now() + 60_000,
  });
  const presignRequest = (v: Visitor, pathname: string) =>
    upload.POST(
      call("/api/upload", {
        method: "POST",
        visitor: v,
        body: { type: "blob.generate-presigned-url", payload: { pathname, clientPayload: null, multipart: false } },
      }),
    );
  beforeEach(() => {
    vi.mocked(issueSignedToken).mockReset().mockImplementation(async (opts) => fakeSignedToken(opts));
    vi.mocked(del).mockReset();
  });
  afterEach(() => {
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
  });

  it("BLOB_STORE_ID만 있어도 blob 모드: 내 prefix 경로만, 토큰 없이(OIDC) 60초짜리 put 권한을 받는다", async () => {
    vi.stubEnv("BLOB_STORE_ID", "store_AbC123");
    const v = await newVisitor();
    const { mode, prefix } = (await (await upload.GET(call("/api/upload", { visitor: v }))).json()) as UploadModeResponse;
    expect(mode).toBe("blob");

    const otherPrefix = ((await (await upload.GET(call("/api/upload", { visitor: await newVisitor() }))).json()) as UploadModeResponse)
      .prefix;
    for (const bad of [`${otherPrefix}shot.webp`, `${prefix}shot.png`, `${prefix}sub/shot.webp`, `${prefix}${"a".repeat(65)}.webp`])
      expect((await presignRequest(v, bad)).status, bad).toBe(400);
    expect(issueSignedToken).not.toHaveBeenCalled();

    const ok = await presignRequest(v, `${prefix}shot-1.webp`);
    expect(ok.status).toBe(200);
    const opts = vi.mocked(issueSignedToken).mock.calls[0][0];
    expect(opts).toMatchObject({
      pathname: `${prefix}shot-1.webp`,
      operations: ["put"],
      allowedContentTypes: ["image/webp"],
      maximumSizeInBytes: 300 * 1024,
      token: undefined,
    });
    expect(opts.validUntil! - Date.now()).toBeGreaterThan(50_000);
    expect(opts.validUntil! - Date.now()).toBeLessThanOrEqual(60_000);

    const { presignedUrlPayload } = (await ok.json()) as { presignedUrlPayload: { signature: string; params: Record<string, string> } };
    expect(presignedUrlPayload.signature).toBeTruthy();
    expect(JSON.stringify(presignedUrlPayload.params)).toMatch(/image\/webp/);
  });

  it("읽기쓰기 토큰이 있으면 그 토큰을 명시적으로 넘긴다", async () => {
    const rw = `vercel_blob_rw_AbC123_${"s".repeat(30)}`;
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", rw);
    const v = await newVisitor();
    const { prefix } = (await (await upload.GET(call("/api/upload", { visitor: v }))).json()) as UploadModeResponse;
    expect((await presignRequest(v, `${prefix}shot.webp`)).status).toBe(200);
    expect(vi.mocked(issueSignedToken).mock.calls[0][0].token).toBe(rw);
  });

  it("이장하면 OIDC 모드에서도 토큰 없이 Blob 이미지를 지운다 (BLOB_STORE_ID 스토어 호스트만 허용)", async () => {
    vi.stubEnv("BLOB_STORE_ID", "store_AbC123");
    const v = await newVisitor();
    const { prefix } = (await (await upload.GET(call("/api/upload", { visitor: v }))).json()) as UploadModeResponse;
    const url = `https://abc123.public.blob.vercel-storage.com/${prefix}shot-x1y2.webp`;
    const other = `https://zzz999.public.blob.vercel-storage.com/${prefix}shot-x1y2.webp`;
    expect((await graves.POST(call("/api/graves", { method: "POST", visitor: v, body: { ...input, imageUrl: other } }))).status).toBe(400);

    const { grave, ownerToken } = await createGrave(v, { ...input, imageUrl: url });
    await graveById.DELETE(
      call(`/api/graves/${grave.id}`, { method: "DELETE", visitor: v, headers: { "x-owner-token": ownerToken } }),
      ctx(grave.id),
    );
    expect(del).toHaveBeenCalledWith(url, { token: undefined });
  });
});

describe("GET /api/og", () => {
  it("사이트 카드와 묘비 카드를 PNG로 그린다", { timeout: 30_000 }, async () => {
    const site = await og.GET(call("/api/og"));
    expect(site.headers.get("content-type")).toBe("image/png");
    expect((await site.arrayBuffer()).byteLength).toBeGreaterThan(1000);

    const card = await og.GET(call("/api/og?grave=mock-001"));
    expect(card.status).toBe(200);
    expect(card.headers.get("content-type")).toBe("image/png");
    expect((await card.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });
});
