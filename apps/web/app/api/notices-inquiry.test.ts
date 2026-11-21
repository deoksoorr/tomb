import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildIssue, fenced } from "@/lib/inquiry";
import { getInquiries, INQUIRY_MEMO_MAX, type InquiryRow } from "@/lib/store/inquiries";
import type { ApiError, InquiryInfoResponse, Notice, NoticeListResponse } from "@/lib/types";
import * as adminNotice from "./admin/notices/[id]/route";
import * as adminInquiry from "./admin/inquiries/[id]/route";
import * as adminInquiries from "./admin/inquiries/route";
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
    expect(res.headers.get("vercel-cdn-cache-control")).toBe("max-age=60, stale-while-revalidate=300");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const ids = ((await res.json()) as NoticeListResponse).notices.map((n) => n.id);
    expect(ids.slice(0, 3)).toEqual([pinned.notice.id, second.notice.id, first.notice.id]);
  });

  it("검증: 제목 1~60, 본문 1~10000", async () => {
    expect((await errorOf(await create({ title: " ", body: "b" }))).message).toBe("제목을 적어 주세요.");
    expect((await errorOf(await create({ title: "가".repeat(61), body: "b" }))).message).toBe("제목은 60자까지 적을 수 있어요.");
    expect((await errorOf(await create({ title: "t", body: "가".repeat(10001) }))).message).toBe("본문은 10000자까지 적을 수 있어요.");
    expect((await create({ title: "가".repeat(60), body: "가".repeat(10000) })).status).toBe(201);
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

describe("문의 → 문의함 (+ GitHub 이슈는 덤)", () => {
  const enable = (repo = "owner/inquiries") => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_secret_token");
    vi.stubEnv("GITHUB_INQUIRY_REPO", repo);
  };
  const send = (v: Visitor | undefined, body: object, headers?: Record<string, string>) =>
    inquiry.POST(call("/api/inquiry", { visitor: v, body, headers }));
  const valid = { category: "bug", message: "입장 버튼이 안 눌려요. 확인 부탁해요." };

  const mine = async (accountId: string) => (await getInquiries().list()).filter((r) => r.accountId === accountId);

  it("GitHub 설정이 없어도 문의함에 저장해 접수한다 (공개 안내 없음, GitHub 호출 없음)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await bodyOf<InquiryInfoResponse>(inquiry.GET(call("/api/inquiry")))).toEqual({ enabled: true, public: false, signedIn: false });
    const v = await newVisitor();
    const res = await send(v, { category: "account", message: "포인트가 갑자기\n사라졌어요 <b>확인</b>", contact: " me@example.com ", channel: 2 }, { "user-agent": "TestBrowser/1.0" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    const [row] = await mine(v.visitorId);
    expect(row).toMatchObject({
      category: "account",
      message: "포인트가 갑자기\n사라졌어요 <b>확인</b>",
      contact: "me@example.com",
      channel: 2,
      name: null,
      userAgent: "TestBrowser/1.0",
      status: "new",
    });
    expect(row.id).toMatch(/^[\w-]{12}$/);
  });

  it("저장소 공개 여부를 GitHub에서 읽어 10분 캐시, 조회에 실패하면 공개로 본다", async () => {
    enable("owner/private-repo");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ private: true }));
    expect(await bodyOf(inquiry.GET(call("/api/inquiry")))).toEqual({ enabled: true, public: false, signedIn: false });
    expect(await bodyOf(inquiry.GET(call("/api/inquiry")))).toMatchObject({ enabled: true, public: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://api.github.com/repos/owner/private-repo");

    enable("owner/unknown-repo");
    fetchSpy.mockRejectedValueOnce(new Error("down"));
    expect(await bodyOf(inquiry.GET(call("/api/inquiry")))).toMatchObject({ enabled: true, public: true });
  });

  it("세션·입력 검증 (세션 없으면 손님이라 연락처 필수)", async () => {
    enable();
    const res = await send(undefined, valid, { "x-forwarded-for": "10.7.0.1" });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toBe("답장 받을 연락처를 적어 주세요.");
    const v = await newVisitor();
    expect(await bodyOf(inquiry.GET(call("/api/inquiry", { visitor: v })))).toMatchObject({ signedIn: true });
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

  it("라벨을 못 붙이면(422) 라벨 없이 다시 만들고, GitHub이 실패해도 문의함에 남아 접수된다", async () => {
    enable();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 422 }))
      .mockResolvedValueOnce(Response.json({}, { status: 201 }));
    expect((await send(await newVisitor(), valid)).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body))).not.toHaveProperty("labels");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const v = await newVisitor();
    expect((await send(v, valid)).status).toBe(200);
    expect(logged).toHaveBeenCalledWith("[inquiry] GitHub 이슈 생성 실패", 500);
    expect(await mine(v.visitorId)).toHaveLength(1);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    expect((await send(v, valid)).status).toBe(200);
    expect(await mine(v.visitorId)).toHaveLength(2);
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

describe("관리자 문의 탭", () => {
  const list = (query = "", headers: Record<string, string> = KEY) => adminInquiries.GET(call(`/api/admin/inquiries${query}`, { headers }));
  const patch = (id: string, body: object, headers: Record<string, string> = KEY) =>
    adminInquiry.PATCH(call(`/api/admin/inquiries/${id}`, { method: "PATCH", body, headers }), ctx(id));
  type Listed = { inquiries: InquiryRow[]; newCount: number };

  it("관리자만, 최신 순·상태로 거르고 처리 여부·메모를 바꾼다", async () => {
    expect((await list()).status).toBe(200);
    expect((await list("", {})).status).toBe(401);
    expect((await patch("x", { status: "done" }, {})).status).toBe(401);

    const v = await newVisitor();
    const send = (message: string) => inquiry.POST(call("/api/inquiry", { visitor: v, body: { category: "idea", message } }));
    expect((await send("첫 번째 제안이에요. 고마워요.")).status).toBe(200);
    await new Promise((r) => setTimeout(r, 2));
    expect((await send("두 번째 제안이에요. 고마워요.")).status).toBe(200);

    const before = await bodyOf<Listed>(list("?status=new"));
    const ours = before.inquiries.filter((r) => r.accountId === v.visitorId);
    expect(ours.map((r) => r.message)).toEqual(["두 번째 제안이에요. 고마워요.", "첫 번째 제안이에요. 고마워요."]);
    const [second, first] = ours;

    const done = await bodyOf<{ inquiry: InquiryRow }>(patch(first.id, { status: "done", memo: "  다음 판에 넣을게요\n둘째 줄 " }));
    expect(done.inquiry).toMatchObject({ id: first.id, status: "done", memo: "다음 판에 넣을게요\n둘째 줄" });
    expect(done.inquiry.doneAt).toBeGreaterThan(0);

    const after = await bodyOf<Listed>(list("?status=new"));
    expect(after.newCount).toBe(before.newCount - 1);
    expect(after.inquiries.some((r) => r.id === first.id)).toBe(false);
    expect((await bodyOf<Listed>(list("?status=done"))).inquiries.map((r) => r.id)).toContain(first.id);
    const all = (await bodyOf<Listed>(list())).inquiries.map((r) => r.id);
    expect(all.indexOf(second.id)).toBeLessThan(all.indexOf(first.id));
    expect((await bodyOf<Listed>(list("?limit=1"))).inquiries).toHaveLength(1);

    // 메모만 지우기 → 처리 여부는 그대로
    expect((await bodyOf<{ inquiry: InquiryRow }>(patch(first.id, { memo: "" }))).inquiry).not.toHaveProperty("memo");
    expect((await bodyOf<{ inquiry: InquiryRow }>(patch(first.id, { status: "new" }))).inquiry.status).toBe("new");
  });

  it("검증: 바꿀 것이 없으면 400, 메모 길이 제한, 없는 문의는 404", async () => {
    expect((await patch("nope", {})).status).toBe(400);
    expect((await patch("nope", { status: "later" })).status).toBe(400);
    expect((await errorOf(await patch("nope", { memo: "가".repeat(INQUIRY_MEMO_MAX + 1) }))).message).toBe(`메모는 ${INQUIRY_MEMO_MAX}자까지 적을 수 있어요.`);
    expect((await patch("nope", { status: "done" })).status).toBe(404);
  });
});

describe("개발자 노트 문의하기 (보낸 곳·손님)", () => {
  const send = (body: object, opts: { who?: Visitor; ip?: string } = {}) =>
    inquiry.POST(call("/api/inquiry", { visitor: opts.who, body, headers: opts.ip ? { "x-forwarded-for": opts.ip } : undefined }));
  const adminRows = async () => (await bodyOf<{ inquiries: InquiryRow[] }>(adminInquiries.GET(call("/api/admin/inquiries", { headers: KEY })))).inquiries;
  afterEach(() => vi.useRealTimers());

  it("source=devnote로 보내면 관리자 문의함에 보낸 곳·종류가 남는다 (계정 문의는 그대로)", async () => {
    const v = await newVisitor();
    expect((await send({ category: "account", message: "포인트가 갑자기 줄었어요. 확인 부탁해요.", source: "devnote" }, { who: v })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 2));
    expect((await send({ category: "bug", message: "게임 안에서 보낸 문의예요. 고마워요." }, { who: v })).status).toBe(200);
    expect((await send({ category: "bug", message: "보낸 곳이 이상한 문의예요. 고마워요.", source: "web" }, { who: v })).status).toBe(400);
    const ours = (await adminRows()).filter((r) => r.accountId === v.visitorId);
    expect(ours.map((r) => [r.category, r.source])).toEqual([
      ["bug", undefined],
      ["account", "devnote"],
    ]);
  });

  it("손님: 연락처를 적으면 accountId null로 접수, 숨은 칸을 채운 봇은 저장하지 않는다", async () => {
    const body = { category: "idea", message: "계정 없이 보내는 건의예요. 고마워요.", source: "devnote", contact: "guest@example.com" };
    expect((await send({ ...body, contact: "  " }, { ip: "10.8.0.1" })).status).toBe(400);
    expect((await send(body, { ip: "10.8.0.1" })).status).toBe(200);
    const row = (await adminRows()).find((r) => r.contact === "guest@example.com");
    expect(row).toMatchObject({ accountId: null, name: null, source: "devnote", category: "idea", status: "new" });

    const before = (await adminRows()).length;
    const bot = await send({ ...body, contact: "bot@example.com", homepage: "http://spam" }, { ip: "10.8.0.2" });
    expect(bot.status).toBe(200);
    expect(await bot.json()).toEqual({ ok: true });
    expect(await adminRows()).toHaveLength(before);
  });

  it("손님 한도: IP마다 1분에 1번, 하루 3번 (다른 IP는 따로)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 10, 20, 3));
    const body = { category: "bug", message: "손님 한도를 확인하는 문의예요.", contact: "a@b.c" };
    const ip = "10.9.0.1";
    expect((await send(body, { ip })).status).toBe(200);
    const burst = await send(body, { ip });
    expect(burst.status).toBe(429);
    expect((await errorOf(burst)).message).toBe("조금 뒤에 다시 보내 주세요.");
    for (let i = 0; i < 2; i++) {
      vi.advanceTimersByTime(61_000);
      expect((await send(body, { ip })).status).toBe(200);
    }
    vi.advanceTimersByTime(61_000);
    const day = await send(body, { ip });
    expect(day.status).toBe(429);
    expect((await errorOf(day)).message).toBe("문의는 하루에 3번까지 보낼 수 있어요.");
    expect((await send(body, { ip: "10.9.0.2" })).status).toBe(200);
  });
});
