import { NAME_TAKEN_MESSAGE, verifyJoinToken } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccounts } from "@/lib/store";
import { DORMANT_MS } from "@/lib/store/types";
import { DORMANT_RENAME_MESSAGE, type ApiError, type JoinResponse, type Me, type NameCheckResponse, type NameClaimResponse } from "@/lib/types";
import * as attend from "./me/attend/route";
import * as join from "./join/route";
import * as me from "./me/route";
import * as rename from "./me/name/route";
import * as names from "./names/route";
import * as session from "./session/route";

// 닉네임 중복 금지·휴면 재설정 라우트. 외부 계정 없이 메모리 저장소로 직접 호출한다
beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let seq = 0;

function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, ip: `10.77.${Math.floor(++seq / 250)}.${seq % 250}`, visitorId: ((await res.json()) as { visitorId: string }).visitorId };
}
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;
const check = async (name: string, visitor?: Visitor) =>
  (await (await names.GET(call(`/api/names?name=${encodeURIComponent(name)}`, { visitor }))).json()) as NameCheckResponse;
const joinAs = (v: Visitor, name: string) => join.POST(call("/api/join", { visitor: v, body: { channel: 1, name, color: "#9fc5a8" } }));

describe("닉네임 중복 금지 (라우트)", () => {
  // 로비 무응답 → 1채널 (실제 네트워크로 나가지 않게 테스트마다 다시 막는다)
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no lobby"));
  });

  it("미리 확인: 규칙 위반·다른 계정이 쓰는 이름(공백 차이 포함)은 안 되고, 내 이름은 된다", async () => {
    const [a, b] = [await newVisitor(), await newVisitor()];
    expect(await check("가")).toMatchObject({ ok: false });
    expect(await check("대장")).toMatchObject({ ok: false });
    expect(await check("미리 확인")).toEqual({ ok: true, name: "미리 확인" });
    const claimed = await names.POST(call("/api/names", { visitor: a, body: { name: "미리확인" } }));
    expect(claimed.status).toBe(200);
    expect(((await claimed.json()) as NameClaimResponse).me.name).toBe("미리확인");
    expect(await check("미리 확인", b)).toEqual({ ok: false, reason: NAME_TAKEN_MESSAGE });
    expect(await check("미리_확인", a)).toEqual({ ok: true, name: "미리_확인" });
  });

  it("등록·입장·변경 모두 서버에서 거절 (409 NAME_TAKEN), 이름이 있는 계정의 등록은 NAME_ALREADY_SET", async () => {
    const [a, b] = [await newVisitor(), await newVisitor()];
    expect((await joinAs(a, "같은이름")).status).toBe(200);
    const taken = await names.POST(call("/api/names", { visitor: b, body: { name: "같은 이름" } }));
    expect(taken.status).toBe(409);
    expect(await errorOf(taken)).toEqual({ code: "NAME_TAKEN", message: NAME_TAKEN_MESSAGE });
    const joined = await joinAs(b, "같은_이름");
    expect(joined.status).toBe(409);
    expect((await errorOf(joined)).code).toBe("NAME_TAKEN");
    // 입장 기록은 조용히 이름을 저장하지 않는다
    await attend.POST(call("/api/me/attend", { visitor: b, body: { name: "같은이름" } }));
    expect(((await (await me.GET(call("/api/me", { visitor: b }))).json()) as Me).name).toBeNull();

    expect((await names.POST(call("/api/names", { visitor: b, body: { name: "비어있던" } }))).status).toBe(200);
    const change = await rename.POST(call("/api/me/name", { visitor: b, body: { name: "같은이름" } }));
    expect(change.status).toBe(409);
    expect(await errorOf(change)).toEqual({ code: "NAME_TAKEN", message: NAME_TAKEN_MESSAGE });
    const again = await names.POST(call("/api/names", { visitor: b, body: { name: "또다른" } }));
    expect((await errorOf(again)).code).toBe("NAME_ALREADY_SET");
  });

  it("입장 토큰의 이름은 계정 이름 (요청 이름으로 남의 이름을 쓸 수 없다)", async () => {
    const [a, b] = [await newVisitor(), await newVisitor()];
    expect((await joinAs(a, "토큰주인")).status).toBe(200);
    expect((await joinAs(b, "토큰손님")).status).toBe(200);
    const res = (await (await joinAs(b, "토큰주인")).json()) as JoinResponse;
    if (res.mode !== "channel") throw new Error("channel 모드여야 한다");
    expect((await verifyJoinToken("dev-join-secret-change-me", res.token))?.name).toBe("토큰손님");
  });

  it("휴면: 돌아오면 me.renameRequired, 입장은 409 RENAME_REQUIRED, 다시 정하면(옛 이름 그대로도 가능) 들어간다", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    // 91일 전에 마지막으로 들어온 계정
    expect(await accounts.claimName(v.visitorId, "오래된손님", Date.now() - DORMANT_MS - 86_400_000)).toBe("ok");
    const mine = (await (await me.GET(call("/api/me", { visitor: v }))).json()) as Me;
    expect(mine).toMatchObject({ name: "오래된손님", renameRequired: true });
    const blocked = await joinAs(v, "오래된손님");
    expect(blocked.status).toBe(409);
    expect(await errorOf(blocked)).toEqual({ code: "RENAME_REQUIRED", message: DORMANT_RENAME_MESSAGE });
    // 옛 이름이 아직 비어 있으면 그대로 다시 쓸 수 있다
    expect(await check("오래된손님", v)).toEqual({ ok: true, name: "오래된손님" });
    const back = await names.POST(call("/api/names", { visitor: v, body: { name: "오래된손님" } }));
    expect(back.status).toBe(200);
    expect(((await back.json()) as NameClaimResponse).me.renameRequired).toBeUndefined();
    expect((await joinAs(v, "오래된손님")).status).toBe(200);
  });
});
