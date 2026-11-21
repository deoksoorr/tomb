import { INTERNAL_SIG_HEADER, signInternal } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { drawAtMs } from "@/lib/lottery";
import { resetLotteryMemo } from "@/lib/lotteryService";
import { getLottery } from "@/lib/store";
import { POST } from "./route";

// 11/21 행운권 정각 추첨: 실시간 서버 예약 작업의 서명이 맞을 때만 추첨하고, 여러 번 불러도 한 번만 정리된다

const call = (body: string, sig?: string) =>
  POST(new NextRequest("http://localhost/api/internal/lottery-draw", { method: "POST", body, headers: sig ? { [INTERNAL_SIG_HEADER]: sig } : {} }));

afterEach(() => {
  vi.useRealTimers();
  resetLotteryMemo();
});

describe("POST /api/internal/lottery-draw", () => {
  it("서명이 없거나 틀리거나 다른 op면 404, 추첨하지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(drawAtMs("20261121") + 5_000);
    const now = Math.floor(Date.now() / 1000);
    const ok = await signInternal(env.joinSecret(), { op: "lotteryDraw", exp: now + 20 });
    expect((await call(ok.body)).status).toBe(404);
    expect((await call(ok.body, ok.sig.slice(0, -2) + "xx")).status).toBe(404);
    const online = await signInternal(env.joinSecret(), { op: "online", exp: now + 20 });
    expect((await call(online.body, online.sig)).status).toBe(404);
    expect(await getLottery().last()).toBeNull();
  });

  it("토요일 8시 직후 서명된 요청이면 그 회차를 추첨하고, 다시 불러도 그대로", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(drawAtMs("20261121") + 5_000);
    const sign = async () => signInternal(env.joinSecret(), { op: "lotteryDraw", exp: Math.floor(Date.now() / 1000) + 20 });
    const a = await sign();
    const res = await call(a.body, a.sig);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ last: "20261121" });
    const b = await sign();
    expect(await (await call(b.body, b.sig)).json()).toEqual({ last: "20261121" });
  });
});
