import { afterEach, describe, expect, it, vi } from "vitest";

const put = vi.fn(async (pathname: string) => ({ url: `https://x.public.blob.vercel-storage.com/${pathname}` }));
vi.mock("@vercel/blob/client", () => ({ put }));

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
  put.mockClear();
});

describe("api.uploadScreenshot (blob 모드)", () => {
  const image = new Blob([new Uint8Array(4)], { type: "image/webp" });

  it("방문자 prefix 아래 경로로 토큰을 받아 올린다", async () => {
    const calls = stubFetch({
      "GET /api/upload": { status: 200, body: { mode: "blob", prefix: "graves/abc123/" } },
      "POST /api/upload": { status: 200, body: { type: "blob.generate-client-token", clientToken: "tok" } },
    });
    const url = await api.uploadScreenshot(image);
    const tokenRequest = calls[1].body as { type: string; payload: { pathname: string } };
    expect(tokenRequest.type).toBe("blob.generate-client-token");
    expect(tokenRequest.payload.pathname).toMatch(/^graves\/abc123\/[A-Za-z0-9_-]{1,64}\.webp$/);
    expect(put).toHaveBeenCalledWith(tokenRequest.payload.pathname, image, expect.objectContaining({ token: "tok" }));
    expect(url).toContain(tokenRequest.payload.pathname);
  });

  it("토큰 발급이 막히면(429) 서버의 한국어 메시지를 그대로 쓴다", async () => {
    stubFetch({
      "GET /api/upload": { status: 200, body: { mode: "blob", prefix: "graves/abc123/" } },
      "POST /api/upload": {
        status: 429,
        body: { error: { code: "RATE_LIMITED", message: "오늘은 사진을 더 올릴 수 없어요." } },
      },
    });
    const err = await api.uploadScreenshot(image).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as InstanceType<typeof ApiRequestError>).message).toBe("오늘은 사진을 더 올릴 수 없어요.");
    expect(put).not.toHaveBeenCalled();
  });

  it("세션이 없으면(401) 모드 조회에서 바로 서버 메시지", async () => {
    stubFetch({
      "GET /api/upload": { status: 401, body: { error: { code: "NO_SESSION", message: "다시 입장해 주세요." } } },
    });
    await expect(api.uploadScreenshot(image)).rejects.toThrow("다시 입장해 주세요.");
  });
});
