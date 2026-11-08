import { afterEach, describe, expect, it, vi } from "vitest";

const uploadPresigned = vi.fn(async (pathname: string) => ({ url: `https://x.public.blob.vercel-storage.com/${pathname}` }));
vi.mock("@vercel/blob/client", () => ({ uploadPresigned }));

const { api, ApiRequestError } = await import("./api");

type Reply = { status: number; body: unknown };
function stubFetch(replies: Record<string, Reply>) {
  const calls: { key: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url}`;
      calls.push({ key, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const reply = replies[key];
      if (!reply) throw new Error(`예상하지 못한 요청: ${key}`);
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  uploadPresigned.mockClear();
});

describe("api.uploadScreenshot (blob 모드)", () => {
  const image = new Blob([new Uint8Array(4)], { type: "image/webp" });

  it("방문자 prefix 아래 경로로 presigned 업로드한다 (OIDC·읽기쓰기 토큰 공통)", async () => {
    stubFetch({ "GET /api/upload": { status: 200, body: { mode: "blob", prefix: "graves/abc123/" } } });
    const url = await api.uploadScreenshot(image);
    const [pathname, body, options] = uploadPresigned.mock.calls[0] as unknown as [string, Blob, Record<string, unknown>];
    expect(pathname).toMatch(/^graves\/abc123\/[A-Za-z0-9_-]{1,64}\.webp$/);
    expect(body).toBe(image);
    expect(options).toEqual({ access: "public", handleUploadUrl: "/api/upload", contentType: "image/webp" });
    expect(url).toContain(pathname);
  });

  it("업로드 한도를 다 썼으면(429) 모드 조회에서 서버의 한국어 메시지를 그대로 쓴다", async () => {
    stubFetch({
      "GET /api/upload": {
        status: 429,
        body: { error: { code: "RATE_LIMITED", message: "사진은 하루에 5장까지 올릴 수 있어요." } },
      },
    });
    const err = await api.uploadScreenshot(image).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as InstanceType<typeof ApiRequestError>).message).toBe("사진은 하루에 5장까지 올릴 수 있어요.");
    expect(uploadPresigned).not.toHaveBeenCalled();
  });

  it("presigned 업로드가 실패하면 UPLOAD_FAILED", async () => {
    stubFetch({ "GET /api/upload": { status: 200, body: { mode: "blob", prefix: "graves/abc123/" } } });
    uploadPresigned.mockRejectedValueOnce(new Error("Failed to retrieve the presigned URL"));
    const err = await api.uploadScreenshot(image).catch((e: unknown) => e);
    expect((err as InstanceType<typeof ApiRequestError>).code).toBe("UPLOAD_FAILED");
  });

  it("세션이 없으면(401) 모드 조회에서 바로 서버 메시지", async () => {
    stubFetch({
      "GET /api/upload": { status: 401, body: { error: { code: "NO_SESSION", message: "다시 입장해 주세요." } } },
    });
    await expect(api.uploadScreenshot(image)).rejects.toThrow("다시 입장해 주세요.");
  });
});
