import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiRequestError } from "./api";

type Reply = { status: number; body: unknown };
function stubFetch(replies: Record<string, Reply>) {
  const calls: { key: string; headers: Record<string, string>; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url}`;
      calls.push({
        key,
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const reply = replies[key];
      if (!reply) throw new Error(`예상하지 못한 요청: ${key}`);
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("서버의 한국어 에러 메시지를 그대로 던진다", async () => {
    stubFetch({
      "POST /api/shop/buy": { status: 409, body: { error: { code: "NOT_ENOUGH", message: "포인트가 모자라요." } } },
    });
    const err = await api.buy("fw_small").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as InstanceType<typeof ApiRequestError>).message).toBe("포인트가 모자라요.");
  });

  it("관리 토큰이 있을 때만 x-owner-token을 보낸다 (계정 묘비는 토큰 없이)", async () => {
    const calls = stubFetch({ "DELETE /api/graves/g1": { status: 200, body: { ok: true } } });
    await api.deleteGrave("g1", null);
    await api.deleteGrave("g1", "tok");
    expect(calls[0].headers["x-owner-token"]).toBeUndefined();
    expect(calls[1].headers["x-owner-token"]).toBe("tok");
  });

  it("아이템 사용은 묘비 꾸미기일 때만 graveId를 붙인다", async () => {
    const me = { points: 0 };
    const calls = stubFetch({ "POST /api/shop/use": { status: 200, body: { me } } });
    await api.spendItem("fw_small");
    await api.spendItem("decor_candles", "g1");
    expect(calls.map((c) => c.body)).toEqual([{ itemId: "fw_small" }, { itemId: "decor_candles", graveId: "g1" }]);
  });
});
