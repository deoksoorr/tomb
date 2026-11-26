import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MEGAPHONE_MAX, verifyInternal, type InternalSay } from "@tomb/protocol";
import { appointManager, dismissManager } from "@/lib/managers";
import { OP_SHOUT_GAP_MS, OP_SHOUT_NAME, OP_SHOUT_PREFIX, type OpShoutResponse } from "@/lib/opShout";
import { OP_SHOUT_COOL_KEY } from "@/lib/opShoutSend";
import { setStaff } from "@/lib/staff";
import { getAccounts, getMegaphone } from "@/lib/store";
import type { ApiError, MegaphoneListResponse } from "@/lib/types";
import * as adminShout from "./admin/shout/route";
import * as megaphone from "./megaphone/route";
import * as session from "./session/route";
import * as staffShout from "./staff/shout/route";

// 11/26 운영자 외치기: 관리자 키·운영자 계정만 (매니저·일반 계정 403) · 확성기와 같은 글 검사 · 5초 간격 ·
// 실시간 서버 say로 모든 채널에 · 어디에도 남지 않는다 (확성기 기록·목록에 없음)

const SECRET = "dev-join-secret-change-me";
const ADMIN = { "x-admin-key": "dev-admin", "x-forwarded-for": "127.0.0.1" };

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
let said: InternalSay[] = [];
let down = false;
beforeEach(() => {
  said = [];
  down = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  // 실시간 서버 흉내: /internal/say만 받아 기록한다 (down이면 닿지 않음)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (down || !url.includes("/internal/say")) throw new Error("offline");
      const r = await verifyInternal(SECRET, String(init?.body ?? ""), new Headers(init?.headers).get("X-Tomb-Internal"));
      if (r?.op !== "say") return new Response("not found", { status: 404 });
      said.push(r);
      return Response.json({ sent: 3 });
    }),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await setStaff(null);
  await getMegaphone().releaseCooldown(OP_SHOUT_COOL_KEY);
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
async function newVisitor(name: string): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const id = ((await res.json()) as { visitorId: string }).visitorId;
  await getAccounts().enter(id, { name: `${name}${++seq}`, color: "#9fc5a8", body: "hood" }, Date.now());
  return { cookie, ip: `10.77.${seq}.1`, id };
}

const body = (text: unknown) => JSON.stringify({ text });
const fromAdmin = (text: unknown, headers: Record<string, string> = ADMIN) =>
  adminShout.POST(new NextRequest("http://localhost/api/admin/shout", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: body(text) }));
const fromGame = (v: Visitor | undefined, text: unknown) =>
  staffShout.POST(
    new NextRequest("http://localhost/api/staff/shout", {
      method: "POST",
      headers: { "content-type": "application/json", ...(v ? { cookie: v.cookie, "x-forwarded-for": v.ip } : {}) },
      body: body(text),
    }),
  );
const errCode = async (res: Response) => ((await res.json()) as ApiError).error.code;
const list = async () => (await (await megaphone.GET(new NextRequest("http://localhost/api/megaphone?channel=1"))).json()) as MegaphoneListResponse;

describe("누가 외칠 수 있나", () => {
  it("관리자 키가 없으면 401, 틀리면 401", async () => {
    expect((await fromAdmin("안녕", {})).status).toBe(401);
    expect((await fromAdmin("안녕", { "x-admin-key": "nope", "x-forwarded-for": "10.9.9.9" })).status).toBe(401);
    expect(said).toEqual([]);
  });

  it("게임: 세션 없으면 401, 일반 계정·매니저는 403 (보내지 않는다), 운영자 계정은 된다", async () => {
    expect((await fromGame(undefined, "안녕")).status).toBe(401);
    const user = await newVisitor("손님");
    const r = await fromGame(user, "안녕");
    expect(r.status).toBe(403);
    expect(await errCode(r)).toBe("FORBIDDEN");
    const mgr = await newVisitor("매니저");
    await appointManager(mgr.id, "매니저");
    expect((await fromGame(mgr, "안녕")).status).toBe(403);
    expect(said).toEqual([]);
    const staff = await newVisitor("운영");
    await setStaff(staff.id);
    const ok = await fromGame(staff, "  오늘 밤\n점검해요 ");
    expect(ok.status).toBe(200);
    expect((await ok.json()) as OpShoutResponse).toEqual({ sent: 3, text: "오늘 밤 점검해요" });
    await dismissManager(mgr.id);
  });
});

describe("보내기", () => {
  it("관리자 화면: 운영자 이름으로 say 한 줄 (계정 닉네임 없음, id는 ops-)", async () => {
    const before = Date.now();
    const res = await fromAdmin("10시에 낚시 대회가 열려요!");
    expect(res.status).toBe(200);
    expect((await res.json()) as OpShoutResponse).toEqual({ sent: 3, text: "10시에 낚시 대회가 열려요!" });
    expect(said).toHaveLength(1);
    const s = said[0];
    expect(s.name).toBe(OP_SHOUT_NAME);
    expect(s.text).toBe("10시에 낚시 대회가 열려요!");
    expect(s.id.startsWith(OP_SHOUT_PREFIX)).toBe(true);
    expect(s.replaces).toBeUndefined();
    expect(s.at).toBeGreaterThanOrEqual(before);
  });

  it("확성기와 같은 검사: 빈 글·60자 넘음·링크·금칙어·같은 글자 도배는 400", async () => {
    for (const t of ["   ", "가".repeat(MEGAPHONE_MAX + 1), "https://example.com 오세요", "시발 뭐야", "ㅋ".repeat(9)]) {
      const r = await fromAdmin(t);
      expect(r.status, t).toBe(400);
      expect(await errCode(r)).toBe("INVALID_INPUT");
    }
    expect((await fromAdmin(123)).status).toBe(400);
    expect(said).toEqual([]);
    expect((await fromAdmin("가나다라마바사아자차".repeat(MEGAPHONE_MAX / 10))).status).toBe(200);
  });

  it("운영자가 스스로 「운영자」「관리자」라고 하는 건 되고, 욕설은 운영 낱말과 섞여도 걸린다", async () => {
    expect((await fromAdmin("운영자예요. 관리자 공지 확인해 주세요")).status).toBe(200);
    await getMegaphone().releaseCooldown(OP_SHOUT_COOL_KEY);
    expect((await fromAdmin("운영자 시발")).status).toBe(400);
  });

  it("5초에 한 번 (관리자 화면·게임 운영자 합쳐서), 지나면 다시 된다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(10_000_000);
      const staff = await newVisitor("운영");
      await setStaff(staff.id);
      expect((await fromAdmin("하나")).status).toBe(200);
      const again = await fromGame(staff, "/외치기 둘");
      expect(again.status).toBe(429);
      expect(await errCode(again)).toBe("RATE_LIMITED");
      vi.setSystemTime(10_000_000 + OP_SHOUT_GAP_MS - 1);
      expect((await fromAdmin("셋")).status).toBe(429);
      vi.setSystemTime(10_000_000 + OP_SHOUT_GAP_MS);
      expect((await fromAdmin("넷")).status).toBe(200);
      expect(said.map((s) => s.text)).toEqual(["하나", "넷"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("실시간 서버에 닿지 못하면 502이고 간격을 풀어 바로 다시 보낼 수 있다", async () => {
    down = true;
    const r = await fromAdmin("안녕");
    expect(r.status).toBe(502);
    down = false;
    expect((await fromAdmin("안녕")).status).toBe(200);
  });
});

describe("기록에 남지 않는다", () => {
  it("확성기 기록(관리자 목록 포함)·손님 확성기 목록 어디에도 없다", async () => {
    const before = await getMegaphone().recent(500);
    expect((await fromAdmin("남으면 안 되는 말")).status).toBe(200);
    const after = await getMegaphone().recent(500);
    expect(after).toEqual(before);
    expect(after.some((r) => r.text === "남으면 안 되는 말")).toBe(false);
    expect((await list()).entries.some((e) => e.text === "남으면 안 되는 말" || e.id.startsWith(OP_SHOUT_PREFIX))).toBe(false);
  });
});
