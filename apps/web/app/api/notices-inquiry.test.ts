import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildIssue, fenced } from "@/lib/inquiry";
import type { ApiError, InquiryInfoResponse, Notice, NoticeListResponse } from "@/lib/types";
import * as adminNotice from "./admin/notices/[id]/route";
import * as adminNotices from "./admin/notices/route";
import * as inquiry from "./inquiry/route";
import * as notices from "./notices/route";
import * as session from "./session/route";

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "GITHUB_TOKEN", "GITHUB_INQUIRY_REPO"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("GITHUB_INQUIRY_REPO", "");
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.6.0.${++ipSeq}`,
    visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId,
  };
}

const KEY = { "x-admin-key": "dev-admin" };

describe("공지사항", () => {
  const create = (body: object) => adminNotices.POST(call("/api/admin/notices", { body, headers: KEY }));

  it("관리자만 쓰고, 공개 목록은 고정 먼저·최신 순·줄바꿈 그대로·CDN 캐시", async () => {
    expect((await adminNotices.POST(call("/api/admin/notices", { body: { title: "x", body: "y" } }))).status).toBe(401);
    const first = await bodyOf<{ notice: Notice }>(create({ title: "  첫 공지 ", body: "첫 줄\n둘째 줄" }));
    expect(first.notice).toMatchObject({ title: "첫 공지", body: "첫 줄\n둘째 줄", pinned: false });
    await new Promise((r) => setTimeout(r, 2));
    const second = await bodyOf<{ notice: Notice }>(create({ title: "둘째", body: "b" }));
    const pinned = await bodyOf<{ notice: Notice }>(create({ title: "고정", body: "c", pinned: true }));

    const res = await notices.GET(call("/api/notices"));
    expect(res.headers.get("vercel-cdn-cache-control")).toBe("max-age=5, stale-while-revalidate=25");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const ids = ((await res.json()) as NoticeListResponse).notices.map((n) => n.id);
    expect(ids.slice(0, 3)).toEqual([pinned.notice.id, second.notice.id, first.notice.id]);
  });

  it("검증: 제목 1~60, 본문 1~4000", async () => {
    expect((await errorOf(await create({ title: " ", body: "b" }))).message).toBe("제목을 적어 주세요.");
    expect((await errorOf(await create({ title: "가".repeat(61), body: "b" }))).message).toBe("제목은 60자까지 적을 수 있어요.");
    expect((await errorOf(await create({ title: "t", body: "가".repeat(4001) }))).message).toBe("본문은 4000자까지 적을 수 있어요.");
    expect((await create({ title: "가".repeat(60), body: "가".repeat(4000) })).status).toBe(201);
  });

  it("수정(바꿀 것만·고정 토글)·삭제, 없는 공지는 404", async () => {
    const { notice } = await bodyOf<{ notice: Notice }>(create({ title: "원래", body: "본문" }));
    const patch = (body: object) => adminNotice.PATCH(call(`/api/admin/notices/${notice.id}`, { method: "PATCH", body, headers: KEY }), ctx(notice.id));
    expect((await bodyOf<{ notice: Notice }>(patch({ pinned: true }))).notice).toMatchObject({ title: "원래", body: "본문", pinned: true });
    expect((await bodyOf<{ notice: Notice }>(patch({ title: "고침" }))).notice).toMatchObject({ title: "고침", pinned: true });
    expect((await patch({})).status).toBe(400);
    const del = () => adminNotice.DELETE(call(`/api/admin/notices/${notice.id}`, { method: "DELETE", headers: KEY }), ctx(notice.id));
    expect((await del()).status).toBe(200);
    expect((await del()).status).toBe(404);
    expect((await patch({ pinned: false })).status).toBe(404);
    const list = await bodyOf<NoticeListResponse>(adminNotices.GET(call("/api/admin/notices", { headers: KEY })));
    expect(list.notices.some((n) => n.id === notice.id)).toBe(false);
  });

  it("공개 목록은 최대 20개", async () => {
    for (let i = 0; i < 22; i++) await create({ title: `n${i}`, body: "b" });
    expect((await bodyOf<NoticeListResponse>(notices.GET(call("/api/notices")))).notices).toHaveLength(20);
  });
});

describe("문의 → GitHub 이슈", () => {
  const enable = (repo = "owner/inquiries") => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_secret_token");
    vi.stubEnv("GITHUB_INQUIRY_REPO", repo);
  };
  const send = (v: Visitor | undefined, body: object, headers?: Record<string, string>) =>
    inquiry.POST(call("/api/inquiry", { visitor: v, body, headers }));
  const valid = { category: "bug", message: "입장 버튼이 안 눌려요. 확인 부탁해요." };

  it("설정이 없으면 꺼져 있고 보내면 503", async () => {
    expect(await bodyOf<InquiryInfoResponse>(inquiry.GET(call("/api/inquiry")))).toEqual({ enabled: false, public: false });
    const res = await send(await newVisitor(), valid);
    expect(await errorOf(res)).toEqual({ code: "INQUIRY_DISABLED", message: "문의 기능을 준비하고 있어요. 조금 뒤에 다시 찾아와 주세요." });
  });

  it("저장소 공개 여부를 GitHub에서 읽어 10분 캐시, 조회에 실패하면 공개로 본다", async () => {
    enable("owner/private-repo");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ private: true }));
    expect(await bodyOf(inquiry.GET(call("/api/inquiry")))).toEqual({ enabled: true, public: false });
    expect(await bodyOf(inquiry.GET(call("/api/inquiry")))).toEqual({ enabled: true, public: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://api.github.com/repos/owner/private-repo");

    enable("owner/unknown-repo");
    fetchSpy.mockRejectedValueOnce(new Error("down"));
    expect(await bodyOf(inquiry.GET(call("/api/inquiry")))).toEqual({ enabled: true, public: true });
  });

  it("세션·입력 검증", async () => {
    enable();
    expect((await send(undefined, valid)).status).toBe(401);
    const v = await newVisitor();
    expect((await errorOf(await send(v, { ...valid, message: "짧아요" }))).message).toBe("문의 내용을 10자 이상 적어 주세요.");
    expect((await send(v, { ...valid, category: "spam" })).status).toBe(400);
    expect((await send(v, { ...valid, contact: "가".repeat(101) })).status).toBe(400);
  });

  it("이슈를 만든다: 제목·라벨·코드 블록 본문, 토큰·이슈 주소는 응답에 없다", async () => {
    enable();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ html_url: "https://github.com/owner/inquiries/issues/7" }, { status: 201 }));
    const v = await newVisitor();
    const message = "@someone 님 #12 확인 ```끝``` [링크](https://evil.example) 묘비가 안 보여요";
    const res = await send(v, { category: "grave", message, contact: "me@example.com", channel: 3 }, { "user-agent": "TestBrowser/1.0" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(text).not.toMatch(/ghp_|issues\/7/);

    // 저장소 공개 여부 확인(GET)이 먼저 올 수 있어 이슈 만들기(POST) 호출을 고른다
    const [url, init] = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST") as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/owner/inquiries/issues");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_secret_token");
    const issue = JSON.parse(String(init.body)) as { title: string; body: string; labels: string[] };
    expect(issue.labels).toEqual(["문의", "부적절한 묘비"]);
    expect(issue.title.startsWith("[문의·부적절한 묘비] ＠someone 님 ＃12")).toBe(true);
    expect(issue.title).not.toMatch(/[@#]/);
    expect(issue.body).toContain(fenced(message));
    expect(issue.body).toContain("````text"); // 본문 안 ``` 보다 긴 펜스
    // 이 시험의 저장소 확인 응답에 따라 비공개면 계정 id 전체, 공개면 앞부분만
    expect(issue.body).toMatch(new RegExp(`계정: ${v.visitorId.slice(0, 6)}`));
    expect(issue.body).toContain("닉네임: ");
    expect(issue.body).toContain("채널: 3");
    expect(issue.body).toContain("User-Agent: TestBrowser/1.0");
    expect(issue.body).toContain(fenced("me@example.com"));
  });

  it("라벨을 못 붙이면(422) 라벨 없이 다시 만들고, GitHub이 실패하면 502", async () => {
    enable();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 422 }))
      .mockResolvedValueOnce(Response.json({}, { status: 201 }));
    expect((await send(await newVisitor(), valid)).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body))).not.toHaveProperty("labels");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await send(await newVisitor(), valid);
    expect(res.status).toBe(502);
    expect((await errorOf(res)).code).toBe("INQUIRY_FAILED");
  });

  it("하루 3번까지", async () => {
    enable();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 201 }));
    const v = await newVisitor();
    for (let i = 0; i < 3; i++) expect((await send(v, valid)).status).toBe(200);
    const res = await send(v, valid);
    expect(res.status).toBe(429);
    expect((await errorOf(res)).message).toBe("문의는 하루에 3번까지 보낼 수 있어요.");
  });

  it("buildIssue: 제목은 본문 앞 40자 한 줄", () => {
    const { title } = buildIssue({ category: "idea", message: "가".repeat(50) + "\n다음 줄", accountId: "abcdef123", userAgent: null });
    expect(title).toBe(`[문의·제안] ${"가".repeat(40)}`);
  });
});
