import { describe, expect, it } from "vitest";
import type { LobbyInfo } from "@tomb/protocol";
import { INITIAL_LOBBY, isChannelSelectable, nextLobbyState, visibleChannels } from "./useLobby";

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
