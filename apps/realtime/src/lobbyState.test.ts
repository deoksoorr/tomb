import { describe, expect, it } from "vitest";
import { LOBBY_REFRESH_MS, VisitorRegistry, applyReport, computeLobby, emptyLobby, hasRecentChannels, refreshTargets, type LobbyState } from "./lobbyState";

const cfg = { capacity: 40, maxChannels: 10, baseChannels: 2, threshold: 0.8 };
const openIds = (s: LobbyState, now: number, held?: (id: number) => number) =>
  computeLobby(s, cfg, held, now).channels.filter((c) => c.open).map((c) => c.id);
/** 채널 DO의 push 보고 (seq는 시각 기반이라 now를 그대로 쓴다) */
const push = (s: LobbyState, id: number, count: number, now: number) => applyReport(s, id, count, now, now, true);

describe("computeLobby", () => {
  it("lists all 10 channels but keeps only the base ones open when quiet", () => {
    const info = computeLobby(emptyLobby(), cfg, undefined, 0);
    expect(info.channels.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(info.channels.every((c) => c.count === 0 && c.cap === 40)).toBe(true);
    expect(openIds(emptyLobby(), 0)).toEqual([1, 2]);
    expect(info).toMatchObject({ total: 0, totalCap: 400, maxChannels: 10, threshold: 0.8 });
    // baseChannels가 없으면(예전 설정) 모두 열려 있다
    expect(computeLobby(emptyLobby(), { capacity: 40, maxChannels: 3, threshold: 0.8 }).channels.every((c) => c.open)).toBe(true);
  });

  it("opens the next channel when every open one is busy, and keeps it open while used (then 5 more minutes)", () => {
    const s = emptyLobby();
    push(s, 1, 32, 0);
    push(s, 2, 31, 0);
    expect(openIds(s, 0)).toEqual([1, 2]);
    push(s, 2, 32, 1);
    expect(openIds(s, 1)).toEqual([1, 2, 3]);
    // 3채널에 사람이 들어온 뒤 1·2채널이 한산해져도 3채널은 사람이 있는 동안 열려 있다
    push(s, 3, 4, 2);
    push(s, 1, 10, 2);
    push(s, 2, 10, 2);
    expect(openIds(s, 3)).toEqual([1, 2, 3]);
    push(s, 3, 0, 10);
    expect(openIds(s, 10 + LOBBY_REFRESH_MS - 1)).toEqual([1, 2, 3]);
    expect(openIds(s, 10 + LOBBY_REFRESH_MS)).toEqual([1, 2]);
  });

  it("a closed channel with someone in it (a house owner) shows up as open; seats held for the queue count too", () => {
    const s = emptyLobby();
    push(s, 7, 1, 0);
    expect(openIds(s, LOBBY_REFRESH_MS * 2)).toEqual([1, 2, 7]);
    expect(openIds(emptyLobby(), 0, (id) => (id === 5 ? 1 : 0))).toEqual([1, 2, 5]);
  });

  it("counts seats held for the queue as taken (capped at the channel capacity)", () => {
    const s = emptyLobby();
    push(s, 1, 39, 0);
    push(s, 2, 40, 0);
    const info = computeLobby(s, cfg, (id) => (id === 1 ? 1 : id === 2 ? 3 : 0));
    expect(info.channels[0].count).toBe(40);
    expect(info.channels[1].count).toBe(40);
    expect(info.total).toBe(80);
  });
});

describe("applyReport", () => {
  it("tells whether the count changed", () => {
    const s = emptyLobby();
    expect(push(s, 2, 0, 0)).toBe(false);
    expect(push(s, 2, 12, 1)).toBe(true);
    expect(push(s, 2, 12, 2)).toBe(false);
    expect(push(s, 2, 0, 3)).toBe(true);
  });

  it("ignores a refresh result older than the latest push (seq)", () => {
    const s = emptyLobby();
    push(s, 2, 7, 1_000);
    expect(applyReport(s, 2, 3, 900, 1_100, false)).toBe(false); // 늦게 도착한 재확인(seq 900)
    expect(s.channels[2]).toMatchObject({ count: 7, seq: 1_000 });
    expect(applyReport(s, 2, 5, 1_200, 1_200, false)).toBe(true);
    expect(s.channels[2]).toMatchObject({ count: 5, pushedAt: 1_000 }); // 재확인은 push 시각을 바꾸지 않는다
  });
});

describe("refreshTargets", () => {
  it("re-checks channels in recent use that have not pushed for 5 minutes", () => {
    const s = emptyLobby();
    const t = 10 * LOBBY_REFRESH_MS;
    push(s, 2, 4, t - 1_000); // 최근 push → 건너뜀
    push(s, 3, 6, t - LOBBY_REFRESH_MS); // 사람 있음 + 오래된 push → 재확인
    push(s, 4, 3, t - 2 * LOBBY_REFRESH_MS);
    applyReport(s, 4, 0, t - 60_000, t - 60_000, false); // 1분 전에 비었다(최근 사용) → 재확인
    push(s, 5, 0, 0); // 오래 빈 채널 → 다음 입장 때 보고가 오므로 깨우지 않는다
    expect(refreshTargets(s, cfg, t)).toEqual([3, 4]);
    expect(hasRecentChannels(s, cfg, t)).toBe(true);
    expect(hasRecentChannels(emptyLobby(), cfg, t)).toBe(false);
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
