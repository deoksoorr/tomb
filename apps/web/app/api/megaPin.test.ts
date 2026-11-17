import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MEGA_PIN_MAX, verifyInternal, type InternalPin } from "@tomb/protocol";
import { setStaff } from "@/lib/staff";
import { getAccounts, getMegaphone } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { GRAVE_CHANNELS } from "@/lib/store/channels";
import type { ApiError, MegaphoneListResponse, MegaPinResponse } from "@/lib/types";
import * as megaphone from "./megaphone/route";
import * as pinRoute from "./megaphone/pin/route";
import * as session from "./session/route";

// 11/17 확성기 창 고정 공지: 운영자만 쓰기·지우기 · 200자 · 채널 범위 · 확성기 목록에 같이 실림 · 실시간 서버 알림

const SECRET = "dev-join-secret-change-me";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
// 실시간 서버 알림이 밖(로컬 8787 등)으로 나가지 않게 늘 막아 둔다 (알림을 보는 테스트는 fakeRealtime으로 바꾼다)
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  // 응답 뒤에 도는 알림(runAfter)이 다음 테스트로 넘어가지 않게 잠깐 기다린다
  await new Promise((r) => setTimeout(r, 30));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await setStaff(null);
  for (let ch = 1; ch <= GRAVE_CHANNELS; ch++) await getMegaphone().setPin("channel", ch, null);
  await getMegaphone().setPin("all", 1, null);
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;

async function newVisitor(name: string): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const id = ((await res.json()) as { visitorId: string }).visitorId;
  await getAccounts().enter(id, { name: `${name}${++seq}`, color: "#9fc5a8", body: "hood" }, Date.now());
  return { cookie, ip: `10.88.${seq}.1`, id };
}

const headers = (v?: Visitor): Record<string, string> => ({ "content-type": "application/json", ...(v ? { cookie: v.cookie, "x-forwarded-for": v.ip } : {}) });
const write = (v: Visitor | undefined, body: unknown) =>
  pinRoute.POST(new NextRequest("http://localhost/api/megaphone/pin", { method: "POST", headers: headers(v), body: JSON.stringify(body) }));
const remove = (v: Visitor | undefined, query: string) => pinRoute.DELETE(new NextRequest(`http://localhost/api/megaphone/pin?${query}`, { method: "DELETE", headers: headers(v) }));
const list = async (ch: number) => (await (await megaphone.GET(new NextRequest(`http://localhost/api/megaphone?channel=${ch}`))).json()) as MegaphoneListResponse;
const errCode = async (res: Response) => ((await res.json()) as ApiError).error.code;
const ok = async (res: Response) => {
  expect(res.status).toBe(200);
  return (await res.json()) as MegaPinResponse;
};

/** 실시간 서버 흉내: /internal/pin만 받아 기록한다 */
function fakeRealtime() {
  const got: InternalPin[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("/internal/pin")) throw new Error("offline");
      const r = await verifyInternal(SECRET, String(init?.body ?? ""), new Headers(init?.headers).get("X-Tomb-Internal"));
      if (r?.op !== "pin") return new Response("not found", { status: 404 });
      got.push(r);
      return Response.json({ sent: 1 });
    }),
  );
  return got;
}

describe("운영자만", () => {
  it("세션이 없으면 401, 일반 계정은 쓰기·지우기 모두 403", async () => {
    const user = await newVisitor("손님");
    expect((await write(undefined, { text: "안내", scope: "channel", channel: 1 })).status).toBe(401);
    const w = await write(user, { text: "안내", scope: "channel", channel: 1 });
    expect(w.status).toBe(403);
    expect(await errCode(w)).toBe("FORBIDDEN");
    const d = await remove(user, "scope=channel&channel=1");
    expect(d.status).toBe(403);
    expect((await list(1)).pins).toEqual([]);
  });

  it("운영자는 쓰고 지울 수 있고, 쓴 사람·시각이 남는다", async () => {
    const staff = await newVisitor("운영");
    await setStaff(staff.id);
    const name = (await getAccounts().get(staff.id, kstDay(), Date.now())).name;
    const before = Date.now();
    const res = await ok(await write(staff, { text: "  오늘 밤\n11시 점검이에요.  ", scope: "channel", channel: 2 }));
    // 한 줄로 고른다
    expect(res.pins).toEqual([{ scope: "channel", ch: 2, text: "오늘 밤 11시 점검이에요.", name, at: expect.any(Number) }]);
    expect(res.pins[0].at).toBeGreaterThanOrEqual(before);
    const saved = await getMegaphone().pins(2);
    expect(saved.channel).toMatchObject({ accountId: staff.id, name });
    expect((await ok(await remove(staff, "scope=channel&channel=2"))).pins).toEqual([]);
    expect((await getMegaphone().pins(2)).channel).toBeNull();
  });
});

describe("검사", () => {
  it("200자까지, 빈 글은 400. 채널은 1~최대만, 대상은 channel·all만", async () => {
    const staff = await newVisitor("운영");
    await setStaff(staff.id);
    await ok(await write(staff, { text: "가".repeat(MEGA_PIN_MAX), scope: "all", channel: 1 }));
    const long = await write(staff, { text: "가".repeat(MEGA_PIN_MAX + 1), scope: "all", channel: 1 });
    expect(long.status).toBe(400);
    expect(await errCode(long)).toBe("INVALID_INPUT");
    expect((await write(staff, { text: "   ", scope: "all", channel: 1 })).status).toBe(400);
    for (const channel of [0, GRAVE_CHANNELS + 1, 1.5]) expect((await write(staff, { text: "안내", scope: "channel", channel })).status, String(channel)).toBe(400);
    await ok(await write(staff, { text: "끝 채널", scope: "channel", channel: GRAVE_CHANNELS }));
    expect((await write(staff, { text: "안내", scope: "moon", channel: 1 })).status).toBe(400);
    for (const q of ["scope=channel&channel=0", `scope=channel&channel=${GRAVE_CHANNELS + 1}`, "scope=moon&channel=1", "scope=channel"])
      expect((await remove(staff, q)).status, q).toBe(400);
    // 없는 공지를 지워도 성공
    await ok(await remove(staff, "scope=channel&channel=1"));
  });
});

describe("확성기 목록·실시간 알림", () => {
  it("목록에 그 채널 공지 먼저, 모든 채널 공지 다음으로 실리고 다른 채널 공지는 안 보인다", async () => {
    const staff = await newVisitor("운영");
    await setStaff(staff.id);
    await ok(await write(staff, { text: "전체 안내", scope: "all", channel: 3 }));
    await ok(await write(staff, { text: "1채널 안내", scope: "channel", channel: 1 }));
    expect((await list(1)).pins?.map((p) => [p.scope, p.ch, p.text])).toEqual([
      ["channel", 1, "1채널 안내"],
      ["all", 0, "전체 안내"],
    ]);
    expect((await list(2)).pins?.map((p) => p.text)).toEqual(["전체 안내"]);
    // 쓴 계정은 목록에 나가지 않는다
    expect(JSON.stringify(await list(1))).not.toContain(staff.id);
  });

  it("쓰거나 지우면 실시간 서버에 /internal/pin을 한 번씩 보낸다 (모든 채널은 ch 0)", async () => {
    const got = fakeRealtime();
    const staff = await newVisitor("운영");
    await setStaff(staff.id);
    await ok(await write(staff, { text: "2채널 안내", scope: "channel", channel: 2 }));
    await ok(await write(staff, { text: "전체 안내", scope: "all", channel: 2 }));
    await ok(await remove(staff, "scope=all&channel=2"));
    await vi.waitFor(() => expect(got).toHaveLength(3));
    expect(got.map(({ scope, ch, pin }) => ({ scope, ch, text: pin?.text ?? null }))).toEqual([
      { scope: "channel", ch: 2, text: "2채널 안내" },
      { scope: "all", ch: 0, text: "전체 안내" },
      { scope: "all", ch: 0, text: null },
    ]);
  });

  it("실시간 서버에 닿지 못해도 저장은 그대로 된다", async () => {
    const staff = await newVisitor("운영");
    await setStaff(staff.id);
    await ok(await write(staff, { text: "안내", scope: "channel", channel: 1 }));
    expect((await list(1)).pins?.map((p) => p.text)).toEqual(["안내"]);
  });
});
