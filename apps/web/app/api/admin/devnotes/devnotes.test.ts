import { del } from "@vercel/blob";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_NOTE_LIMITS as L } from "@/lib/devNotes/limits";
import { getNotices } from "@/lib/store";
import type { ApiError, Notice, NoticeListResponse } from "@/lib/types";
import * as notices from "../../notices/route";
import * as localFile from "../../upload/local/[...path]/route";
import * as oldNotice from "../notices/[id]/route";
import * as byId from "./[id]/route";
import * as revert from "./[id]/revert/route";
import { listDevNotes, withDevNoteBody } from "@/lib/devNotes/notes";
import { STATIC_NOTES } from "@/lib/devNotes/posts";
import type { AdminDevNoteResponse } from "@/lib/devNotes/admin";
import * as list from "./route";
import * as localUpload from "./upload/local/route";
import * as upload from "./upload/route";

vi.mock("@vercel/blob", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vercel/blob")>()),
  del: vi.fn(),
}));
// Next 요청 밖이라 캐시 만료는 기록만, 1분 캐시는 그대로 부른다
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));

const STORE = "abc123";
const BLOB = `https://${STORE.toLowerCase()}.public.blob.vercel-storage.com`;
const ADMIN = { "x-admin-key": "dev-admin" };

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
beforeEach(() => {
  vi.stubEnv("BLOB_STORE_ID", `store_${STORE}`);
  vi.mocked(del).mockClear();
});
afterEach(() => {
  vi.stubEnv("BLOB_STORE_ID", `store_${STORE}`);
});

let ipSeq = 0;
function call(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": `10.9.0.${++ipSeq % 250}`, ...opts.headers };
  if (opts.body !== undefined && !(opts.body instanceof FormData)) headers["content-type"] = "application/json";
  const body = opts.body instanceof FormData ? opts.body : opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? "GET", headers, body });
}
const ctx = <P,>(p: P) => ({ params: Promise.resolve(p) });
const errorOf = async (res: Response) => ((await res.json()) as ApiError).error;

const img = (n: number) => `${BLOB}/devnotes/shot${n}-AbCdEf123.webp`;
const note = (over: Record<string, unknown> = {}) => ({
  title: "11월 30일 업데이트",
  summary: "사진 블록 시험",
  hero: img(0),
  intro: "첫 문단이에요.",
  blocks: [
    { t: "h", text: "새 낚시터" },
    { t: "img", src: img(1) },
    { t: "p", text: "첫 줄\n둘째 줄\n\n둘째 문단" },
    { t: "img", src: img(2) },
  ],
  outro: "고마워요.",
  pinned: false,
  ...over,
});

async function create(body: unknown = note()) {
  const res = await list.POST(call("/api/admin/devnotes", { method: "POST", body, headers: ADMIN }));
  return res;
}

describe("개발자 노트 관리자 API", () => {
  it("관리자만 쓰고 읽는다 (키 없음 401, 다른 사이트에서 보낸 요청 403)", async () => {
    expect((await list.POST(call("/api/admin/devnotes", { method: "POST", body: note() }))).status).toBe(401);
    expect((await list.GET(call("/api/admin/devnotes"))).status).toBe(401);
    expect((await byId.DELETE(call("/api/admin/devnotes/x", { method: "DELETE" }), ctx({ id: "x" }))).status).toBe(401);
    expect((await upload.GET(call("/api/admin/devnotes/upload"))).status).toBe(401);
    const cross = await list.POST(call("/api/admin/devnotes", { method: "POST", body: note(), headers: { ...ADMIN, "sec-fetch-site": "cross-site" } }));
    expect(cross.status).toBe(403);
  });

  it("쓰기: 가벼운 쪽은 공지에, 꼭지는 본문으로 따로. 공개 공지 목록에는 본문·요약·이미지가 실리지 않는다", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    const { notice } = (await res.json()) as { notice: Notice };
    expect(notice).toMatchObject({ title: "11월 30일 업데이트", body: "첫 문단이에요.", summary: "사진 블록 시험", hero: img(0), rich: true, pinned: false });
    expect(JSON.stringify(notice)).not.toContain("새 낚시터");

    const doc = await getNotices().getDoc(notice.id);
    expect(doc?.blocks).toHaveLength(4);
    expect(doc?.outro).toBe("고마워요.");

    const pub = (await (await notices.GET(call("/api/notices"))).json()) as NoticeListResponse;
    const mine = pub.notices.find((n) => n.id === notice.id)!;
    expect(Object.keys(mine).sort()).toEqual(["body", "createdAt", "id", "pinned", "rich", "title"]);
    expect(JSON.stringify(pub)).not.toContain("새 낚시터");

    const one = await byId.GET(call(`/api/admin/devnotes/${notice.id}`, { headers: ADMIN }), ctx({ id: notice.id }));
    expect(((await one.json()) as { doc: { blocks: unknown[] } }).doc.blocks).toHaveLength(4);
    await byId.DELETE(call(`/api/admin/devnotes/${notice.id}`, { method: "DELETE", headers: ADMIN }), ctx({ id: notice.id }));
  });

  it("검증: 제목·블록 수·글자 수·빈 블록·이미지 주소", async () => {
    const bad = async (over: Record<string, unknown>) => {
      const res = await create(note(over));
      expect(res.status).toBe(400);
      return (await errorOf(res)).message;
    };
    expect(await bad({ title: "  " })).toContain("제목");
    expect(await bad({ title: "가".repeat(L.title + 1) })).toContain(`${L.title}자`);
    expect(await bad({ intro: "" })).toContain("첫 문단");
    expect(await bad({ blocks: Array.from({ length: L.blocks + 1 }, () => ({ t: "h", text: "소제목" })) })).toContain(`${L.blocks}개`);
    expect(await bad({ blocks: [{ t: "p", text: "가".repeat(L.text + 1) }] })).toContain(`${L.text}자`);
    expect(await bad({ blocks: Array.from({ length: 8 }, () => ({ t: "p", text: "가".repeat(L.text - 10) })) })).toContain(`${L.total}자`);
    expect(await bad({ blocks: [{ t: "p", text: "   " }] })).toContain("빈 글");
    expect(await bad({ blocks: [{ t: "html", text: "<b>x</b>" }] })).toContain("블록");
    // 이미지는 우리 Blob 스토어의 devnotes/ 아래만
    expect(await bad({ hero: "https://evil.example.com/devnotes/a.webp" })).toContain("이미지");
    expect(await bad({ hero: "https://other.public.blob.vercel-storage.com/devnotes/a.webp" })).toContain("이미지");
    expect(await bad({ blocks: [{ t: "img", src: `${BLOB}/graves/0123456789abcdef/a.webp` }] })).toContain("이미지");
    expect(await bad({ blocks: [{ t: "img", src: "javascript:alert(1)" }] })).toContain("이미지");
    expect(await bad({ blocks: [{ t: "img", src: `http://${STORE}.public.blob.vercel-storage.com/devnotes/a.webp` }] })).toContain("이미지");
    // 사이트에 들어 있는 그림·제목 공백 정리는 받는다
    const ok = await create(note({ title: "  여러   칸\n제목 ", hero: "/devnotes/hero-1119.webp", summary: "", blocks: [] }));
    expect(ok.status).toBe(201);
    const { notice } = (await ok.json()) as { notice: Notice };
    expect(notice.title).toBe("여러 칸 제목");
    expect(notice.summary).toBeUndefined();
    await getNotices().remove(notice.id);
  });

  it("고치기: 쓴 시각은 그대로, 빠진 이미지는 지운다. 지우기: 본문·이미지까지", async () => {
    const { notice } = (await (await create()).json()) as { notice: Notice };
    const put = await byId.PUT(
      call(`/api/admin/devnotes/${notice.id}`, { method: "PUT", headers: ADMIN, body: note({ title: "고친 제목", hero: null, blocks: [{ t: "img", src: img(1) }] }) }),
      ctx({ id: notice.id }),
    );
    expect(put.status).toBe(200);
    const after = (await getNotices().get(notice.id))!;
    expect(after.title).toBe("고친 제목");
    expect(after.createdAt).toBe(notice.createdAt);
    expect(after.updatedAt).toBeGreaterThanOrEqual(notice.createdAt);
    expect(after.hero).toBeUndefined();
    expect(vi.mocked(del).mock.calls[0]?.[0]).toEqual([img(0), img(2)]);

    const pin = await byId.PATCH(call(`/api/admin/devnotes/${notice.id}`, { method: "PATCH", headers: ADMIN, body: { pinned: true } }), ctx({ id: notice.id }));
    expect(((await pin.json()) as { notice: Notice }).notice.pinned).toBe(true);

    vi.mocked(del).mockClear();
    const gone = await byId.DELETE(call(`/api/admin/devnotes/${notice.id}`, { method: "DELETE", headers: ADMIN }), ctx({ id: notice.id }));
    expect(gone.status).toBe(200);
    expect(await getNotices().get(notice.id)).toBeNull();
    expect(await getNotices().getDoc(notice.id)).toBeNull();
    expect(vi.mocked(del).mock.calls[0]?.[0]).toEqual([img(1)]);
    expect((await byId.DELETE(call(`/api/admin/devnotes/${notice.id}`, { method: "DELETE", headers: ADMIN }), ctx({ id: notice.id }))).status).toBe(404);
  });

  it("예전 공지 메뉴에서 지워도 본문과 이미지가 같이 지워진다", async () => {
    const { notice } = (await (await create()).json()) as { notice: Notice };
    const res = await oldNotice.DELETE(call(`/api/admin/notices/${notice.id}`, { method: "DELETE", headers: ADMIN }), ctx({ id: notice.id }));
    expect(res.status).toBe(200);
    expect(await getNotices().getDoc(notice.id)).toBeNull();
    expect(vi.mocked(del)).toHaveBeenCalled();
  });
});

describe("정적 글 고치기·되돌리기", () => {
  const put = (id: string, body: unknown) => byId.PUT(call(`/api/admin/devnotes/${id}`, { method: "PUT", headers: ADMIN, body }), ctx({ id }));
  const get = async (id: string) => (await (await byId.GET(call(`/api/admin/devnotes/${id}`, { headers: ADMIN }), ctx({ id }))).json()) as AdminDevNoteResponse;
  const onSite = async (id: string) => (await listDevNotes()).find((n) => n.id === id)!;

  it("고친 적 없는 정적 글은 원본으로 채워 열린다 (사이트 그림 주소 그대로)", async () => {
    const s = STATIC_NOTES.find((n) => n.id === "qALW3m3LA_")!;
    const r = await get(s.id);
    expect(r.kind).toBe("static");
    expect(r.notice).toMatchObject({ title: s.title, body: s.intro, createdAt: s.createdAt, hero: s.hero, summary: s.summary });
    expect(r.doc!.blocks.filter((b) => b.t === "h").map((b) => (b.t === "h" ? b.text : ""))).toEqual(s.sections.filter((x) => x.heading).map((x) => x.heading));
    expect(r.doc!.blocks.filter((b) => b.t === "img")).toHaveLength(s.sections.filter((x) => x.img).length);
    // 원본 그대로 다시 올려도 검증을 통과한다 (정적 글 이미지 /devnotes/*.webp 허용)
    for (const n of STATIC_NOTES) {
      const src = await get(n.id);
      const body = { title: src.notice.title, summary: src.notice.summary, hero: src.notice.hero ?? null, intro: src.notice.body, callout: src.doc!.callout, blocks: src.doc!.blocks, outro: src.doc!.outro, pinned: src.notice.pinned };
      const res = await put(n.id, body);
      expect(res.status, n.id).toBe(200);
      expect((await revert.POST(call(`/api/admin/devnotes/${n.id}/revert`, { method: "POST", headers: ADMIN }), ctx({ id: n.id }))).status).toBe(200);
    }
    expect(await getNotices().list()).toEqual([]);
  });

  it("저장소에 없던 정적 글: 고치면 같은 id rich 글이 정적 글보다 앞서고, 쓴 시각은 정적 글 그대로. 되돌리면 지워진다", async () => {
    const s = STATIC_NOTES.find((n) => n.id === "QHTXLpxKlt")!;
    const res = await put(s.id, note({ title: "고친 11월 17일", hero: "/devnotes/hero-1119.webp", blocks: [{ t: "h", text: "새 꼭지" }, { t: "img", src: img(5) }] }));
    expect(res.status).toBe(200);
    const saved = (await getNotices().get(s.id))!;
    expect(saved).toMatchObject({ rich: true, createdAt: s.createdAt, title: "고친 11월 17일" });
    const shown = await onSite(s.id);
    expect(shown.title).toBe("고친 11월 17일");
    expect((await withDevNoteBody(shown)).sections[0]).toEqual({ img: img(5), heading: "새 꼭지", text: "" });
    expect((await get(s.id)).kind).toBe("edited");
    // 정적 글은 지울 수 없다 (되돌리기만)
    expect((await byId.DELETE(call(`/api/admin/devnotes/${s.id}`, { method: "DELETE", headers: ADMIN }), ctx({ id: s.id }))).status).toBe(400);

    vi.mocked(del).mockClear();
    expect((await revert.POST(call(`/api/admin/devnotes/${s.id}/revert`, { method: "POST", headers: ADMIN }), ctx({ id: s.id }))).status).toBe(200);
    expect(await getNotices().get(s.id)).toBeNull();
    expect((await onSite(s.id)).title).toBe(s.title);
    // 올린 이미지만 지우고 사이트 그림은 그대로
    expect(vi.mocked(del).mock.calls[0]?.[0]).toEqual([img(5)]);
    expect((await revert.POST(call(`/api/admin/devnotes/${s.id}/revert`, { method: "POST", headers: ADMIN }), ctx({ id: s.id }))).status).toBe(404);
  });

  it("예전 공지(글만)가 있던 정적 글: 쓴 시각 유지, 원문은 보관해 두었다가 되돌리면 그대로 되살린다", async () => {
    const s = STATIC_NOTES.find((n) => n.id === "Fdnq9-pR0k")!;
    const old: Notice = { id: s.id, title: "처음 오신 분께 (옛 공지)", body: "옛 본문\n\n둘째 문단", createdAt: s.createdAt - 5, pinned: true };
    await getNotices().put(old);
    expect((await onSite(s.id)).title).toBe(s.title); // 예전 공지는 정적 글에 진다
    expect((await put(s.id, note({ title: "처음 오신 분께", pinned: true, hero: s.hero, blocks: [{ t: "p", text: "고친 편지" }] }))).status).toBe(200);
    expect((await put(s.id, note({ title: "처음 오신 분께!", pinned: true, hero: s.hero, blocks: [{ t: "p", text: "두 번 고친 편지" }] }))).status).toBe(200);
    const saved = (await getNotices().get(s.id))!;
    expect(saved.createdAt).toBe(old.createdAt);
    expect((await getNotices().getDoc(s.id))?.backup).toEqual({ title: old.title, body: old.body, pinned: true });
    const shown = await withDevNoteBody(await onSite(s.id));
    expect(shown).toMatchObject({ title: "처음 오신 분께!", pinned: true, fromStore: true });
    // 게임 공지 목록: 같은 id·같은 시각 → 새 글 점이 다시 켜지지 않는다. 고친 제목이 쓰인다
    const pub = (await (await notices.GET(call("/api/notices"))).json()) as NoticeListResponse;
    expect(pub.notices.find((n) => n.id === s.id)).toMatchObject({ createdAt: old.createdAt, title: "처음 오신 분께!", rich: true });

    expect((await revert.POST(call(`/api/admin/devnotes/${s.id}/revert`, { method: "POST", headers: ADMIN }), ctx({ id: s.id }))).status).toBe(200);
    expect(await getNotices().get(s.id)).toEqual(old);
    expect(await getNotices().getDoc(s.id)).toBeNull();
    expect((await onSite(s.id)).title).toBe(s.title);
    await getNotices().remove(s.id);
  });
});

describe("개발자 노트 이미지 업로드", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const form = (bytes: Uint8Array<ArrayBuffer>, type = "image/png") => {
    const fd = new FormData();
    fd.append("file", new File([bytes], "a.png", { type }));
    return fd;
  };

  it("Blob이 없으면 로컬 대체: 관리자만, PNG·JPG·WebP만, 받은 그림은 맞는 형식으로 내준다", async () => {
    vi.stubEnv("BLOB_STORE_ID", "");
    expect(((await (await upload.GET(call("/api/admin/devnotes/upload", { headers: ADMIN }))).json()) as { mode: string }).mode).toBe("local");
    expect((await localUpload.POST(call("/x", { method: "POST", body: form(png) }))).status).toBe(401);
    expect((await localUpload.POST(call("/x", { method: "POST", body: form(new Uint8Array([1, 2, 3, 4])), headers: ADMIN }))).status).toBe(400);
    const res = await localUpload.POST(call("/x", { method: "POST", body: form(png), headers: ADMIN }));
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^\/api\/upload\/local\/devnotes\/[A-Za-z0-9_-]{12}\.png$/);
    const path = url.replace("/api/upload/local/", "").split("/");
    const file = await localFile.GET(call(url), ctx({ path }));
    expect(file.headers.get("content-type")).toBe("image/png");
    // 로컬 주소는 글에 붙일 수 있다
    const made = await create(note({ hero: url, blocks: [] }));
    expect(made.status).toBe(201);
    await getNotices().remove(((await made.json()) as { notice: Notice }).notice.id);
  });

  it("Blob 모드: 운영자만, devnotes/ 경로만 서명한다", async () => {
    const body = { type: "blob.generate-presigned-url", payload: { pathname: "graves/0123456789abcdef/x.webp", multipart: false, clientPayload: null } };
    expect((await upload.POST(call("/api/admin/devnotes/upload", { method: "POST", body }))).status).toBe(401);
    const res = await upload.POST(call("/api/admin/devnotes/upload", { method: "POST", body, headers: ADMIN }));
    expect(res.status).toBe(400);
  });
});
