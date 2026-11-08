import { EMPTY_CHANNEL_HIDE_MS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { LOBBY_REFRESH_MS, VisitorRegistry, applyReport, computeLobby, emptyLobby, refreshTargets, type LobbyState } from "./lobbyState";

const cfg = { capacity: 40, maxChannels: 10, threshold: 0.8 };
const openIds = (s: LobbyState, now: number) => computeLobby(s, cfg, now).info.channels.filter((c) => c.open).map((c) => c.id);
/** 채널 DO의 push 보고 (seq는 시각 기반이라 now를 그대로 쓴다) */
const push = (s: LobbyState, id: number, count: number, now: number) => applyReport(s, id, count, now, now, true);

describe("computeLobby", () => {
  it("lists every channel id with channel 1 always open", () => {
    const { info, opened } = computeLobby(emptyLobby(), cfg, 0);
    expect(info.channels.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(info.channels.filter((c) => c.open).map((c) => c.id)).toEqual([1]);
    expect(info).toMatchObject({ total: 0, totalCap: 400, maxChannels: 10, threshold: 0.8 });
    expect(opened).toBeNull();
  });

  it("keeps an emptied channel listed for 5 minutes, then hides it (channel 1 never hides)", () => {
    const s = emptyLobby();
    push(s, 1, 0, 0);
    push(s, 3, 5, 0);
    expect(openIds(s, 10)).toEqual([1, 3]);
    push(s, 3, 0, 1_000);
    expect(openIds(s, 1_000 + EMPTY_CHANNEL_HIDE_MS - 1)).toEqual([1, 3]);
    expect(openIds(s, 1_000 + EMPTY_CHANNEL_HIDE_MS)).toEqual([1]);
  });

  it("opens the next channel when every open channel is ≥ threshold, one at a time", () => {
    const s = emptyLobby();
    push(s, 1, 31, 0);
    expect(computeLobby(s, cfg, 0).opened).toBeNull();
    push(s, 1, 32, 1); // 40 × 0.8
    const r = computeLobby(s, cfg, 1);
    expect(r.opened).toBe(2);
    expect(r.info.channels.filter((c) => c.open).map((c) => c.id)).toEqual([1, 2]);
    // 새로 연 2채널은 비어 있으므로 3채널은 열리지 않는다
    expect(computeLobby(s, cfg, 2).opened).toBeNull();
    expect(openIds(s, 2)).toEqual([1, 2]);
  });

  it("keeps an auto-opened empty channel listed for 5 minutes", () => {
    const s = emptyLobby();
    push(s, 1, 40, 0);
    computeLobby(s, cfg, 0);
    push(s, 1, 10, 1);
    expect(openIds(s, EMPTY_CHANNEL_HIDE_MS - 1)).toEqual([1, 2]);
    expect(openIds(s, EMPTY_CHANNEL_HIDE_MS)).toEqual([1]);
  });

  it("does nothing once all channels are open and full", () => {
    const s = emptyLobby();
    for (let id = 1; id <= 10; id++) push(s, id, 40, 0);
    const { info, opened } = computeLobby(s, cfg, 0);
    expect(opened).toBeNull();
    expect(info.total).toBe(400);
    expect(info.channels.every((c) => c.open && c.count === 40)).toBe(true);
  });
});

describe("applyReport", () => {
  it("tells whether the count changed", () => {
    const s = emptyLobby();
    expect(push(s, 2, 0, 0)).toBe(false);
    expect(push(s, 2, 12, 1)).toBe(true);
    expect(push(s, 2, 12, 2)).toBe(false);
    expect(push(s, 2, 0, 3)).toBe(true);
    expect(computeLobby(s, cfg, 4).info.channels[1]).toMatchObject({ count: 0, open: true });
  });

  it("ignores a refresh result older than the latest push (seq)", () => {
    const s = emptyLobby();
    push(s, 2, 7, 1_000); // push seq 1000
    expect(applyReport(s, 2, 3, 900, 1_100, false)).toBe(false); // 늦게 도착한 재확인(seq 900)
    expect(s.channels[2]).toMatchObject({ count: 7, seq: 1_000 });
    expect(applyReport(s, 2, 5, 1_200, 1_200, false)).toBe(true);
    expect(s.channels[2]).toMatchObject({ count: 5, pushedAt: 1_000 }); // 재확인은 push 시각을 바꾸지 않는다
  });
});

describe("refreshTargets", () => {
  it("re-checks open channels (even ones believed empty) unless they pushed within 5 minutes", () => {
    const s = emptyLobby();
    const t = 10 * LOBBY_REFRESH_MS;
    push(s, 2, 4, t - 1_000); // 최근 push → 건너뜀
    push(s, 3, 6, t - LOBBY_REFRESH_MS); // 오래된 push → 재확인
    push(s, 4, 3, t - 2 * LOBBY_REFRESH_MS);
    applyReport(s, 4, 0, t - 60_000, t - 60_000, false); // 1분 전 재확인에서 0명(목록에는 남아 있음) → 재확인
    expect(refreshTargets(s, cfg, t)).toEqual([1, 3, 4]); // 1채널은 늘 열려 있다
  });
});

describe("VisitorRegistry", () => {
  it("returns the previous channel when a visitor shows up in another one", () => {
    const r = new VisitorRegistry(100);
    expect(r.claim("v", 1)).toBeNull();
    expect(r.claim("v", 1)).toBeNull(); // 같은 채널에서 복귀·교체
    expect(r.claim("v", 3)).toBe(1);
    expect(r.channelOf("v")).toBe(3);
  });

  it("does not let a late release from the old channel erase the new registration", () => {
    const r = new VisitorRegistry(100);
    r.claim("v", 1);
    r.claim("v", 2); // 채널 이동: 새 채널 claim이 먼저
    r.release("v", 1); // 옛 채널 release가 나중에 도착
    expect(r.channelOf("v")).toBe(2);
    r.release("v", 2);
    expect(r.channelOf("v")).toBeUndefined();
  });

  it("is bounded (oldest entries go first)", () => {
    const r = new VisitorRegistry(2);
    r.claim("a", 1);
    r.claim("b", 1);
    r.claim("c", 1);
    expect(r.channelOf("a")).toBeUndefined();
    expect(r.channelOf("c")).toBe(1);
  });
});
