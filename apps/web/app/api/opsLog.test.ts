import { INTERNAL_SIG_HEADER, signInternal, verifyInternal, type ConnLogWire, type InternalPerson } from "@tomb/protocol";
import { moveText, type MoveLogEntry } from "@/lib/moveLog";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminLogsResponse } from "@/lib/adminLogs";
import { onlineRows, onlineStats, type AdminOnlineResponse } from "@/lib/onlineNow";
import type { ConnHealth } from "@/lib/opsLog";
import { getSignupSrc } from "@/lib/store/signupSrc";
import { kstDay } from "@/lib/store/accounts";
import type { AccountSummary } from "@/lib/store/types";
import * as adminLogs from "./admin/logs/route";
import * as adminMaint from "./admin/maintenance/route";
import * as adminOnline from "./admin/online/route";
import * as connHealth from "./admin/conn-health/route";
import * as signupSources from "./admin/signup-sources/route";
import * as errors from "./errors/route";
import * as connLog from "./internal/conn-log/route";
import * as join from "./join/route";
import * as maintStatus from "./maintenance/route";
import * as attend from "./me/attend/route";
import * as session from "./session/route";

// 11/26 로그·관리자: 접속 기록 받기(서명)·화면 오류 묶음·가입 유입 저장·이번 접속 유입·지금 접속자·점검 모드 관리자 API

const SECRET = "dev-join-secret-change-me";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS", "ADMIN_KEY"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

type Visitor = { cookie: string; id: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; admin?: boolean; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.126.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`, ...opts.headers };
  if (opts.visitor) headers.cookie = opts.visitor.cookie;
  if (opts.admin) Object.assign(headers, { "x-admin-key": "dev-admin", "x-forwarded-for": "127.0.0.1" });
  const body = opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  if (body) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
/** 응답 뒤에 쓰는 기록(runAfter)이 끝나기를 기다린다 */
const settle = () => new Promise((r) => setTimeout(r, 20));

async function newVisitor(src?: unknown, ua?: string): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { body: src === undefined ? {} : { src }, headers: ua ? { "user-agent": ua } : {} }));
  return { cookie: res.headers.get("set-cookie")!.split(";")[0], id: (await bodyOf<{ visitorId: string }>(res)).visitorId };
}

describe("접속 기록 받기 (/api/internal/conn-log)", () => {
  it("서명이 맞을 때만 저장하고, 관리자 기록·24시간 비율에 보인다", async () => {
    const v = await newVisitor();
    const now = Date.now();
    const rows: [string, "i" | "o", number, number, string, "" | "closed" | "drop"][] = [
      [v.id, "i", now - 3_000, 1, "phone·카카오톡", ""],
      [v.id, "o", now - 2_000, 1, "phone·카카오톡", "drop"],
      [v.id, "o", now - 1_000, 2, "pc", "closed"],
    ];
    const signed = await signInternal(SECRET, { op: "connLog", rows, exp: Math.floor(now / 1000) + 20 });
    expect((await connLog.POST(call("/api/internal/conn-log", { body: signed.body }))).status).toBe(404); // 서명 없음
    const bad = await signInternal("other", { op: "connLog", rows, exp: Math.floor(now / 1000) + 20 });
    expect((await connLog.POST(call("/api/internal/conn-log", { body: bad.body, headers: { [INTERNAL_SIG_HEADER]: bad.sig } }))).status).toBe(404);
    const ok = await connLog.POST(call("/api/internal/conn-log", { body: signed.body, headers: { [INTERNAL_SIG_HEADER]: signed.sig } }));
    expect(await bodyOf(ok)).toEqual({ saved: 3 });

    const mine = await bodyOf<AdminLogsResponse>(adminLogs.GET(call(`/api/admin/logs?list=conn&account=${v.id}`, { admin: true })));
    expect(mine.rows.map((r) => [r.k, (r as { why?: string }).why ?? null])).toEqual([
      ["out", "closed"],
      ["out", "drop"],
      ["in", null],
    ]);
    // 쿠키만 받고 입장 기록(/api/me/attend)이 없는 계정은 가입 유입을 남기지 않는다 (11/26 보안)
    expect(mine.account?.signup).toBe("기록 없음");
    const h = await bodyOf<ConnHealth>(connHealth.GET(call("/api/admin/conn-health", { admin: true })));
    expect(h.abnormal).toBeGreaterThanOrEqual(1);
    expect(h.outs).toBeGreaterThanOrEqual(2);
    // 관리자가 아니면 막힌다
    expect((await adminLogs.GET(call("/api/admin/logs?list=conn"))).status).toBe(401);
  });
});

describe("11/27 다시 접속·다른 탭·서버 맵 옮김 줄 (실시간 서버 일곱 칸 줄)", () => {
  it("다른 탭 줄은 계정·전체 목록에, 맵 옮김 줄은 계정 목록에만, 회원 상세에 읽을 수 있는 말로", async () => {
    const v = await newVisitor();
    const now = Date.now();
    const rows: ConnLogWire[] = [
      [v.id, "m", now - 3_000, 1, "pc", "", { f: "village", t: "sea", c: "mapReq" }],
      [v.id, "t", now - 2_000, 1, "pc", "", { m: "sea", a: "village", tab: "tabA1", pt: "tabB1", live: 1 }],
      [v.id, "t", now - 1_000, 2, "pc", "", { m: "sea", a: "village", tab: "tabC1", pt: "tabA1", pc: 1 }],
    ];
    const signed = await signInternal(SECRET, { op: "connLog", rows, exp: Math.floor(now / 1000) + 20 });
    const ok = await connLog.POST(call("/api/internal/conn-log", { body: signed.body, headers: { [INTERNAL_SIG_HEADER]: signed.sig } }));
    expect(await bodyOf(ok)).toEqual({ saved: 3 });
    const mine = await bodyOf<AdminLogsResponse>(adminLogs.GET(call(`/api/admin/logs?list=conn&account=${v.id}`, { admin: true })));
    const texts = mine.rows.map((r) => moveText(r as MoveLogEntry));
    expect(texts).toEqual([
      "다른 채널 탭에서 들어옴 (1채널에서) · 2채널 바닷가 → 서버 맵 유지 · 화면이 다른 맵을 보냄(마을) · 탭 tabC1 ← tabA1",
      "다른 탭에서 다시 접속 (이전 탭 끊음) · 1채널 바닷가 → 서버 맵 유지 · 화면이 다른 맵을 보냄(마을) · 탭 tabA1 ← tabB1",
      "맵 마을 → 바닷가 · 맵 옮기기 요청(버스·친구·집 문)",
    ]);
    const all = await bodyOf<AdminLogsResponse>(adminLogs.GET(call("/api/admin/logs?list=conn", { admin: true })));
    const fromMe = all.rows.filter((r) => r.a === v.id);
    expect(fromMe.map((r) => (r as MoveLogEntry).m)).toEqual(["tab", "tab"]);
    // 틀린 줄이 섞이면 묶음 전체를 받지 않는다 (서명이 맞아도)
    const bad = await signInternal(SECRET, { op: "connLog", rows: [[v.id, "t", now, 1, "pc", "", { tab: "x" }]], exp: Math.floor(now / 1000) + 20 });
    expect((await connLog.POST(call("/api/internal/conn-log", { body: bad.body, headers: { [INTERNAL_SIG_HEADER]: bad.sig } }))).status).toBe(404);
  });
});

describe("화면 오류·API 실패 묶음 (/api/errors)", () => {
  it("한 번에 여러 개, 로그인한 계정이면 그 계정 접속 기록에도", async () => {
    const v = await newVisitor();
    const res = await errors.POST(
      call("/api/errors", {
        visitor: v,
        body: { reports: [{ kind: "error", message: "x is undefined", url: "/" }, { kind: "api", message: "GET /api/me → 연결 실패", url: "/" }] },
      }),
    );
    expect(res.status).toBe(204);
    // 옛 화면 모양(하나)도 받는다
    expect((await errors.POST(call("/api/errors", { body: { kind: "error", message: "old", url: "/" } }))).status).toBe(204);
    await settle();
    const mine = await bodyOf<AdminLogsResponse>(adminLogs.GET(call(`/api/admin/logs?list=conn&account=${v.id}`, { admin: true })));
    expect(mine.rows.map((r) => (r as { msg?: string }).msg).sort()).toEqual(["API: GET /api/me → 연결 실패", "화면: x is undefined"]);
    // 11/26 보안: 오류 줄은 계정 기록에만 — 전체 접속 기록(들어옴·나감)을 밀어내지 않는다
    const all = await bodyOf<AdminLogsResponse>(adminLogs.GET(call("/api/admin/logs?list=conn", { admin: true })));
    expect(all.rows.some((r) => r.a === v.id)).toBe(false);
    // 6개 이상은 받지 않는다 (묶음 한도)
    const many = Array.from({ length: 6 }, (_, i) => ({ kind: "error", message: `e${i}`, url: "/" }));
    expect((await errors.POST(call("/api/errors", { body: { reports: many } }))).status).toBe(400);
  });
});

describe("가입 유입 (/api/me/attend 첫 입장) · 이번 접속 유입 (/api/join)", () => {
  const enter = (v: Visitor, src?: unknown, ua?: string) =>
    attend.POST(call("/api/me/attend", { visitor: v, body: src === undefined ? {} : { src }, headers: ua ? { "user-agent": ua } : {} }));

  it("계정이 처음 만들어질 때만 저장, 리퍼러 호스트·utm만 (앱 안 브라우저는 앱 이름)", async () => {
    // 11/26 보안: 쿠키만 받고 들어오지 않은 방문(로그인 없이 /api/session 반복)은 옛 화면처럼 src를 실어도 남기지 않는다
    const bot = await newVisitor({ r: "spam.example", us: "spam-src" });
    const bot2 = await session.POST(call("/api/session", { body: { fresh: true, src: { us: "spam-src2" } } }));
    expect(bot2.status).toBe(200);
    await settle();
    expect((await getSignupSrc().get([bot.id]))[0]).toBeNull();

    const v = await newVisitor();
    expect((await enter(v, { r: "m.search.naver.com", us: "Blog", um: "post" }, "Mozilla/5.0 (iPhone) NAVER(inapp; search; 1000)")).status).toBe(200);
    await settle();
    const [s] = await getSignupSrc().get([v.id]);
    expect(s).toMatchObject({ r: "search.naver.com", us: "blog", um: "post", app: "네이버 앱" });
    // 이미 만들어진 계정의 다음 입장 기록은 바꾸지 않는다
    expect((await enter(v, { r: "google.com" })).status).toBe(200);
    await settle();
    expect((await getSignupSrc().get([v.id]))[0]?.r).toBe("search.naver.com");
    // 모양이 틀린 src는 없는 것으로 (입장은 그대로 된다)
    const w = await newVisitor();
    expect((await enter(w, { r: "https://evil.example/path?q=secret" })).status).toBe(200);
    await settle();
    expect((await getSignupSrc().get([w.id]))[0]).toMatchObject({});
    expect(JSON.stringify((await getSignupSrc().get([w.id]))[0])).not.toContain("secret");
    // 옛 화면(src 없이 입장 기록)도 새 계정이면 「직접·알 수 없음」으로 남는다
    const x = await newVisitor();
    expect((await enter(x)).status).toBe(200);
    await settle();
    expect((await getSignupSrc().get([x.id]))[0]).toMatchObject({});
    // 유입별 가입 수: 들어온 계정만. 11/27 모르는 사이트도 호스트 그대로 (커뮤니티 이름이 보이게)
    const y = await newVisitor();
    const forum = `x${ipSeq}.example.org`;
    await enter(y, { r: forum });
    await settle();
    const counts = await bodyOf<{ rows: { label: string; n: number }[] }>(signupSources.GET(call("/api/admin/signup-sources?days=1", { admin: true })));
    expect(counts.rows.find((r) => r.label === "utm blog/post")?.n).toBeGreaterThanOrEqual(1);
    expect(counts.rows.find((r) => r.label === forum)?.n).toBe(1);
    expect(counts.rows.some((r) => r.label.includes("spam"))).toBe(false);
  });

  it("입장 첫 요청의 src는 그날 이번 접속 유입으로", async () => {
    const v = await newVisitor();
    const res = await join.POST(call("/api/join", { visitor: v, body: { channel: 1, name: `유입${ipSeq}`, color: "#9fc5a8", src: { r: "instagram.com" } } }));
    expect(res.status).toBe(200);
    await settle();
    const [live] = await getSignupSrc().live([v.id], [kstDay(Date.now())]);
    expect(live?.s).toBe("인스타그램");
    // 11/27 유저 상세: 가입 유입과 함께 최근 접속 유입
    const mine = await bodyOf<AdminLogsResponse>(adminLogs.GET(call(`/api/admin/logs?list=conn&account=${v.id}`, { admin: true })));
    expect(mine.account).toMatchObject({ signup: "기록 없음", session: "인스타그램" });
    expect(mine.account?.sessionAt).toBeGreaterThan(0);
  });

  it("11/27 리퍼러가 빈 앱 안 브라우저는 앱 이름으로 (「네이버 앱 앱」이 아니라 「네이버 앱」), 모르는 커뮤니티는 호스트 그대로", async () => {
    const v = await newVisitor();
    const naverApp = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.1.2; 15ProMax)";
    const body = { channel: 1, name: `앱유입${ipSeq}`, color: "#9fc5a8", src: {} };
    expect((await join.POST(call("/api/join", { visitor: v, body, headers: { "user-agent": naverApp } }))).status).toBe(200);
    const w = await newVisitor();
    const body2 = { channel: 1, name: `포럼${ipSeq}`, color: "#9fc5a8", src: { r: "forum.example.com" } };
    expect((await join.POST(call("/api/join", { visitor: w, body: body2 }))).status).toBe(200);
    await settle();
    const lives = await getSignupSrc().live([v.id, w.id], [kstDay(Date.now())]);
    expect(lives.map((l) => l?.s)).toEqual(["네이버 앱", "forum.example.com"]);
  });
});

describe("지금 접속자 (순수 계산 · 실시간 서버에 못 닿을 때)", () => {
  const person = (visitorId: string, ch: number, extra: Partial<InternalPerson> = {}): InternalPerson => ({ visitorId, ch, sid: 1, name: visitorId, x: 0, y: 0, ...extra });
  const sum = (id: string, points: number, stayMinutes: number, createdAt = Date.UTC(2026, 10, 20)): AccountSummary => ({
    accountId: id,
    name: id,
    createdAt,
    lastSeenAt: 0,
    points,
    renameRequired: false,
    hasCode: false,
    stayMinutes,
    lifetimePoints: points,
  });

  it("줄·통계: 운영자는 통계에서 빼고, 새싹·포인트 구간·맵·유입을 센다", () => {
    const rows = onlineRows(
      [person("a", 1), person("b", 1, { map: "camp" }), person("c", 2, { inside: true, place: "hunt" }), person("boss", 1)],
      [sum("a", 500, 30), sum("b", 20_000, 600), sum("c", 2_000_000, 100), sum("boss", 9_999_999, 9_000)],
      [{ r: "google.com", at: 1 }, null, { app: "카카오톡", at: 1 }, null],
      [{ s: "구글", at: 1000 }, null, { s: "카카오톡 앱", at: 2000 }, null],
      "boss",
    );
    expect(rows.map((r) => [r.signup, r.session, r.sprout, r.staff])).toEqual([
      ["구글", "구글", true, false],
      ["기록 없음", null, false, false],
      ["카카오톡 앱", "카카오톡 앱", true, false],
      ["기록 없음", null, false, true],
    ]);
    expect(rows[2].place).toBe("사냥터");
    const s = onlineStats(rows);
    expect(s.count).toBe(3);
    expect(s.points.median).toBe(20_000);
    expect(s.points.avg).toBe(Math.round((500 + 20_000 + 2_000_000) / 3));
    expect(s.points.buckets.filter((b) => b.n).map((b) => b.label)).toEqual(["1천 미만", "1만~5만", "100만 이상"]);
    expect(s.sprouts).toBe(2);
    expect(s.byMap.map((m) => m.label).sort()).toEqual(["마을", "마을 · 사냥터", "캠핑장"]);
    expect(onlineStats([])).toMatchObject({ count: 0, sproutRatio: null, points: { avg: 0, median: 0 } });
  });

  it("실시간 서버에 닿지 못하면 reachable false (빈 목록)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("down");
    });
    const r = await bodyOf<AdminOnlineResponse>(adminOnline.GET(call("/api/admin/online", { admin: true })));
    expect(r).toMatchObject({ reachable: false, rows: [] });
  });
});

describe("점검 모드 관리자 API", () => {
  it("시작·끝을 실시간 서버에 서명해서 보내고, 점검 상태 API는 통과 목록을 싣지 않는다", async () => {
    const sent: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/internal/maint")) {
        const r = await verifyInternal(SECRET, String(init?.body), new Headers(init?.headers).get(INTERNAL_SIG_HEADER));
        if (!r || r.op !== "maint") return new Response("nf", { status: 404 });
        sent.push(r as unknown as Record<string, unknown>);
        return Response.json({ state: { on: r.on, msg: r.msg, until: r.until, at: Date.now(), skip: r.skip }, kicked: r.on ? 4 : 0 });
      }
      if (url.endsWith("/maintenance")) return Response.json({ on: false, msg: "", until: null, at: 0 });
      throw new Error(`unexpected ${url}`);
    });
    expect((await adminMaint.POST(call("/api/admin/maintenance", { body: { on: true, msg: "점검" } }))).status).toBe(401);
    const past = await adminMaint.POST(call("/api/admin/maintenance", { admin: true, body: { on: true, msg: "점검", until: Date.now() - 1 } }));
    expect(past.status).toBe(400);
    const until = Date.now() + 3_600_000;
    const on = await bodyOf<{ state: { on: boolean; msg: string }; kicked: number }>(adminMaint.POST(call("/api/admin/maintenance", { admin: true, body: { on: true, msg: " 캠핑장 공사 ", until } })));
    expect(on).toMatchObject({ state: { on: true, msg: "캠핑장 공사" }, kicked: 4 });
    expect(sent[0]).toMatchObject({ op: "maint", on: true, msg: "캠핑장 공사", until });
    // 점검 상태 API: 이 인스턴스가 기억한 값 (통과 목록 없이)
    const pub = await bodyOf<Record<string, unknown>>(maintStatus.GET(call("/api/maintenance")));
    expect(pub).toMatchObject({ on: true, msg: "캠핑장 공사", until });
    expect(pub.skip).toBeUndefined();
    const off = await bodyOf<{ state: { on: boolean } }>(adminMaint.POST(call("/api/admin/maintenance", { admin: true, body: { on: false } })));
    expect(off.state.on).toBe(false);
    expect(sent[1]).toMatchObject({ on: false, msg: "", until: null, skip: [] });
  });
});
