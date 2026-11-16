import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOBBY_POLL_MS, type LobbyInfo } from "@tomb/protocol";
import { INITIAL_LOBBY, isChannelSelectable, LobbyPoller, nextLobbyState, visibleChannels, type LobbyState } from "./useLobby";

const lobby: LobbyInfo = {
  channels: [
    { id: 1, count: 40, cap: 40, open: true },
    { id: 2, count: 10, cap: 40, open: true },
    { id: 3, count: 0, cap: 40, open: false },
  ],
  total: 50,
  totalCap: 400,
  maxChannels: 10,
  threshold: 0.8,
};

describe("nextLobbyState", () => {
  it("한 번 실패로는 포기하지 않고, 마지막 정상 데이터를 유지한다", () => {
    const ok = nextLobbyState(INITIAL_LOBBY, lobby);
    const once = nextLobbyState(ok, null);
    expect(once).toMatchObject({ status: "ok", lobby, failures: 1 });
    const twice = nextLobbyState(once, null);
    expect(twice).toMatchObject({ status: "unreachable", lobby, failures: 2 });
    expect(nextLobbyState(twice, lobby)).toEqual({ status: "ok", lobby, failures: 0 });
  });

  it("처음부터 실패하면 두 번째에야 연결할 수 없다고 본다", () => {
    const once = nextLobbyState(INITIAL_LOBBY, null);
    expect(once.status).toBe("loading");
    expect(nextLobbyState(once, null).status).toBe("unreachable");
  });
});

describe("isChannelSelectable", () => {
  it("만석·닫힌·없는 채널은 고를 수 없다", () => {
    expect(isChannelSelectable(lobby, 1)).toBe(false);
    expect(isChannelSelectable(lobby, 2)).toBe(true);
    expect(isChannelSelectable(lobby, 3)).toBe(false);
    expect(isChannelSelectable(lobby, 9)).toBe(false);
    expect(isChannelSelectable(null, 2)).toBe(false);
    // 닫힌 채널이라도 내 집(묘비) 채널이면 고를 수 있다
    expect(isChannelSelectable(lobby, 3, [3])).toBe(true);
    expect(isChannelSelectable(lobby, 1, [1])).toBe(false);
  });

  it("목록에는 열린 채널과 내 채널(닫혀 있어도)만 보인다", () => {
    expect(visibleChannels(lobby).map((c) => c.id)).toEqual([1, 2]);
    expect(visibleChannels(lobby, [null, 3, undefined]).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(visibleChannels(null, [3])).toEqual([]);
  });
});

// ── 11/17 폴러 하나로 묶기 · 뒤로 가면 멈추기 ──

describe("LobbyPoller", () => {
  function setup(bg = false) {
    let background = bg;
    const bgSubs = new Set<(b: boolean) => void>();
    const calls = { lobby: 0, houses: 0 };
    let now = 0;
    const poller = new LobbyPoller(
      {
        fetchLobby: async () => {
          calls.lobby++;
          return lobby;
        },
        fetchHouses: async () => {
          calls.houses++;
          return [];
        },
        background: () => background,
        onBackground: (fn) => {
          bgSubs.add(fn);
          return () => bgSubs.delete(fn);
        },
        now: () => now,
      },
      LOBBY_POLL_MS,
      120_000,
    );
    const setBg = (b: boolean) => {
      background = b;
      for (const fn of bgSubs) fn(b);
    };
    const advance = async (ms: number) => {
      now += ms;
      await vi.advanceTimersByTimeAsync(ms);
    };
    return { poller, calls, setBg, advance, bgSubs };
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("구독하는 곳이 여럿이어도 LOBBY_POLL_MS마다 한 번만 묻고, 모두에게 같은 상태를 준다", async () => {
    const { poller, calls, advance } = setup();
    const a: LobbyState[] = [];
    const b: LobbyState[] = [];
    const offA = poller.subscribe((s) => a.push(s));
    const offB = poller.subscribe((s) => b.push(s));
    await advance(0);
    expect(calls.lobby).toBe(1);
    await advance(LOBBY_POLL_MS * 3);
    expect(calls.lobby).toBe(4);
    expect(a.at(-1)).toMatchObject({ status: "ok", lobby });
    expect(b.at(-1)).toBe(a.at(-1));
    offA();
    await advance(LOBBY_POLL_MS);
    expect(calls.lobby).toBe(5);
    offB();
    expect(poller.running).toBe(false);
    await advance(LOBBY_POLL_MS * 5);
    expect(calls.lobby).toBe(5);
  });

  it("뒤로 가면 멈추고, 돌아오면 바로 한 번 받은 뒤 다시 돈다", async () => {
    const { poller, calls, setBg, advance } = setup();
    const off = poller.subscribe(() => undefined);
    await advance(0);
    expect(calls.lobby).toBe(1);
    setBg(true);
    await advance(LOBBY_POLL_MS * 30);
    expect(calls.lobby).toBe(1);
    setBg(false);
    await advance(0);
    expect(calls.lobby).toBe(2);
    await advance(LOBBY_POLL_MS);
    expect(calls.lobby).toBe(3);
    off();
  });

  it("처음부터 뒤에 있으면 묻지 않는다 (열어 둔 채 잊은 탭)", async () => {
    const { poller, calls, advance } = setup(true);
    const off = poller.subscribe(() => undefined);
    await advance(LOBBY_POLL_MS * 100);
    expect(calls.lobby).toBe(0);
    expect(calls.houses).toBe(0);
    off();
  });

  it("집이 있는 채널은 2분에 한 번만 (돌아왔을 때도 그만큼 지났을 때만)", async () => {
    const { poller, calls, setBg, advance, bgSubs } = setup();
    const off = poller.subscribe(() => undefined);
    await advance(0);
    expect(calls.houses).toBe(1);
    setBg(true);
    setBg(false);
    await advance(0);
    expect(calls.houses).toBe(1);
    await advance(120_000);
    expect(calls.houses).toBe(2);
    off();
    expect(bgSubs.size).toBe(0);
  });
});
