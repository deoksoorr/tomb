import { INTERNAL_SIG_HEADER, verifyInternal } from "@tomb/protocol";
import { describe, expect, it, vi } from "vitest";
import { LOTTERY_DRAW_PATH, drawLottery } from "./lotteryCron";

// 11/21 행운권 정각 추첨 예약 작업: 웹 주소·비밀이 있을 때만, 서명한 본문으로 웹을 부른다

describe("drawLottery", () => {
  it("WEB_ORIGIN이나 JOIN_SECRET이 없으면 부르지 않는다", async () => {
    const f = vi.fn();
    expect(await drawLottery({ JOIN_SECRET: "s" }, f)).toBe("skip");
    expect(await drawLottery({ WEB_ORIGIN: "https://a.test" }, f)).toBe("skip");
    expect(f).not.toHaveBeenCalled();
  });

  it("웹 추첨 경로를 서명해서 POST한다 (끝 슬래시는 떼고)", async () => {
    const now = 1_800_000_000_000;
    const f = vi.fn(async () => new Response('{"last":"20261121"}', { status: 200 }));
    expect(await drawLottery({ WEB_ORIGIN: "https://a.test/", JOIN_SECRET: "s" }, f as unknown as typeof fetch, now)).toBe('200 {"last":"20261121"}');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://a.test" + LOTTERY_DRAW_PATH);
    expect(init.method).toBe("POST");
    const sig = (init.headers as Record<string, string>)[INTERNAL_SIG_HEADER];
    expect(await verifyInternal("s", init.body as string, sig, now / 1000)).toMatchObject({ op: "lotteryDraw" });
  });

  it("웹이 실패해도 던지지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await drawLottery({ WEB_ORIGIN: "https://a.test", JOIN_SECRET: "s" }, f as unknown as typeof fetch)).toBe("error");
  });
});
