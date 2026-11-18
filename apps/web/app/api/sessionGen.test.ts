import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { invalidateSessionGenCache, parseSession, signSession, verifySession } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { MemorySessionGen } from "@/lib/store/sessionGen";
import * as code from "./me/code/route";
import * as login from "./me/login/route";
import * as me from "./me/route";
import * as sessions from "./me/sessions/route";
import * as session from "./session/route";

// 11/18 세션 세대: 개인 코드 재발급·「다른 기기에서 모두 로그아웃」이면 다른 기기 쿠키가 끊기고 지금 기기는 남는다.
// 세대를 한 번도 안 올린 계정의 옛 쿠키(세대 없음)는 그대로 유효하다.

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

let ipSeq = 0;
function call(path: string, opts: { method?: string; cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.77.0.${++ipSeq % 250}` };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? null;
const meStatus = async (cookie: string) => (await me.GET(call("/api/me", { cookie }))).status;

async function newAccount(): Promise<{ cookie: string; id: string }> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const id = ((await res.json()) as { visitorId: string }).visitorId;
  await getAccounts().enter(id, { name: `세대${ipSeq}`, color: "#9fc5a8", body: "hood" }, Date.now());
  return { cookie: cookieOf(res)!, id };
}

describe("세션 세대 (서명 모양)", () => {
  it("세대 0은 옛 모양 그대로, 세대가 있으면 서명에 들어가 바꿔 쓸 수 없다", async () => {
    const id = "A".repeat(21);
    const old = await signSession(id);
    expect(old.split(".")).toHaveLength(2);
    expect(await parseSession(old)).toEqual({ id, gen: 0 });
    const g2 = await signSession(id, 2);
    expect(await parseSession(g2)).toEqual({ id, gen: 2 });
    // 세대 숫자만 바꾸면 서명이 안 맞는다
    expect(await parseSession(g2.replace(".g2.", ".g9."))).toBeNull();
  });

  it("쿠키 세대가 계정의 지금 세대보다 낮으면 무효 (캐시를 비우면 바로)", async () => {
    const store = new MemorySessionGen();
    const id = "B".repeat(21);
    const old = await signSession(id);
    invalidateSessionGenCache();
    expect(await verifySession(old, { store })).toBe(id);
    await store.bump(id);
    invalidateSessionGenCache();
    expect(await verifySession(old, { store })).toBeNull();
    expect(await verifySession(await signSession(id, 1), { store })).toBe(id);
  });
});

describe("다른 기기 끊기", () => {
  it("처음 코드를 만들면 세대가 그대로라 지금 쿠키가 바뀌지 않는다", async () => {
    const a = await newAccount();
    const res = await code.POST(call("/api/me/code", { method: "POST", cookie: a.cookie }));
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toBeNull();
    expect(await meStatus(a.cookie)).toBe(200);
  });

  it("코드를 다시 받으면 예전 코드로 들어온 다른 기기는 끊기고 지금 기기는 새 쿠키로 남는다", async () => {
    const a = await newAccount();
    const first = (await (await code.POST(call("/api/me/code", { method: "POST", cookie: a.cookie }))).json()) as { code: string };
    const other = cookieOf(await login.POST(call("/api/me/login", { body: { code: first.code } })))!;
    expect(await meStatus(other)).toBe(200);
    const res = await code.POST(call("/api/me/code", { method: "POST", cookie: a.cookie }));
    const mine = cookieOf(res)!;
    expect(mine).toMatch(/\.g1\./);
    expect(await meStatus(other)).toBe(401);
    expect(await meStatus(a.cookie)).toBe(401);
    expect(await meStatus(mine)).toBe(200);
    // 새 코드로 다시 들어오면 지금 세대 쿠키를 받는다
    const again = (await res.json()) as { code: string };
    const back = cookieOf(await login.POST(call("/api/me/login", { body: { code: again.code } })))!;
    expect(back).toMatch(/\.g1\./);
    expect(await meStatus(back)).toBe(200);
  });

  it("[다른 기기에서 모두 로그아웃]은 지금 기기만 남긴다, 쿠키 연장(/api/session)은 세대를 지킨다", async () => {
    const a = await newAccount();
    const c = (await (await code.POST(call("/api/me/code", { method: "POST", cookie: a.cookie }))).json()) as { code: string };
    const other = cookieOf(await login.POST(call("/api/me/login", { body: { code: c.code } })))!;
    const res = await sessions.POST(call("/api/me/sessions", { method: "POST", cookie: a.cookie }));
    expect(res.status).toBe(200);
    const mine = cookieOf(res)!;
    expect(await meStatus(other)).toBe(401);
    expect(await meStatus(mine)).toBe(200);
    // 끊긴 기기가 쿠키 연장을 불러도 그 계정으로 돌아가지 못한다 (새 계정이 된다)
    const renew = await session.POST(call("/api/session", { method: "POST", cookie: other }));
    expect(((await renew.json()) as { visitorId: string }).visitorId).not.toBe(a.id);
    // 남은 기기의 연장은 같은 세대로 다시 굽는다
    const keep = await session.POST(call("/api/session", { method: "POST", cookie: mine }));
    expect(((await keep.json()) as { visitorId: string }).visitorId).toBe(a.id);
    expect(cookieOf(keep)).toBe(mine);
  });
});
