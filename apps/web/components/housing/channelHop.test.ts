import { afterEach, describe, expect, it, vi } from "vitest";
import { bridge } from "@/game/bridge";
import { hopChannel } from "./channelHop";

// 내 집 가기·친구한테 가기의 채널 옮기기 기다림: 꽉 찬 채널이라 게임이 옮기지 않으면(channel:refused) 바로 그만두고 그 안내를 넘긴다

describe("hopChannel", () => {
  afterEach(() => vi.useRealTimers());

  it("fullMsg를 실어 channel:switch를 보내고, 그 채널이 거절되면 run 없이 onFail(안내)", () => {
    const sent: unknown[] = [];
    const offSwitch = bridge.on("channel:switch", (p) => sent.push(p));
    const run = vi.fn();
    const fail = vi.fn();
    hopChannel(5, 3, run, fail, { fullMsg: "나래님이 있는 채널이 꽉 차서 갈 수 없어요." });
    expect(sent).toEqual([{ channel: 5, fullMsg: "나래님이 있는 채널이 꽉 차서 갈 수 없어요." }]);
    bridge.emit("channel:refused", { channel: 4, message: "다른 채널", back: false });
    expect(fail).not.toHaveBeenCalled();
    bridge.emit("channel:refused", { channel: 5, message: "꽉 참", back: false });
    expect(fail).toHaveBeenCalledWith("꽉 참");
    bridge.emit("net:status", { mode: "online", channel: 5, count: 1, cap: 40 });
    expect(run).not.toHaveBeenCalled();
    offSwitch();
  });

  it("시간이 지나도 못 옮기면 onFail() (안내 없음)", () => {
    vi.useFakeTimers();
    const fail = vi.fn();
    hopChannel(6, 3, vi.fn(), fail, { waitMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(fail).toHaveBeenCalledWith();
  });
});
