import { afterEach, describe, expect, it, vi } from "vitest";
import { friendHello, resetHelloMemo } from "./ban";

// 11/17 친구 등록(/internal/hello): 같은 내용을 방금 맡겼으면 다시 보내지 않는다 (재접속마다 로비 DO를 깨우지 않게)

describe("friendHello 인스턴스 기억", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetHelloMemo();
  });

  const ok = () => Response.json({ ok: true });

  it("같은 내용은 5분 안에 한 번만, 내용이 바뀌거나 5분이 지나면 다시", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok());
    expect(await friendHello("v1", "새벽코더", "k1", ["a", "b"], 0)).toBe(true);
    expect(await friendHello("v1", "새벽코더", "k1", ["a", "b"], 60_000)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("/internal/hello");
    // 친구가 늘었다
    await friendHello("v1", "새벽코더", "k1", ["a", "b", "c"], 61_000);
    expect(spy).toHaveBeenCalledTimes(2);
    // 다른 사람은 따로
    await friendHello("v2", "밤코더", "k2", ["a"], 61_000);
    expect(spy).toHaveBeenCalledTimes(3);
    // 5분 뒤에는 같은 내용도 다시 (다른 인스턴스가 사이에 바꿨을 수 있다)
    await friendHello("v1", "새벽코더", "k1", ["a", "b", "c"], 61_000 + 5 * 60_000);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("실패한 등록은 기억하지 않는다 (다음 입장 때 다시)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => new Response("no", { status: 500 }));
    expect(await friendHello("v3", "새벽코더", "k3", ["a"], 0)).toBe(false);
    spy.mockImplementation(async () => ok());
    expect(await friendHello("v3", "새벽코더", "k3", ["a"], 1000)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
