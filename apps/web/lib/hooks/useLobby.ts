"use client";

import { useEffect, useState } from "react";
import { channelStatus, LOBBY_POLL_MS, type ChannelInfo, type LobbyInfo } from "@tomb/protocol";
import { fetchLobby } from "@/lib/realtime";

/** 연속으로 이만큼 실패해야 "연결할 수 없어요"라고 말한다 (한 번의 일시적 실패로 깜빡이지 않게) */
export const LOBBY_FAILURES_TO_GIVE_UP = 2;

export type LobbyState = {
  status: "loading" | "ok" | "unreachable";
  /** 마지막으로 받은 정상 응답 (실패해도 유지) */
  lobby: LobbyInfo | null;
  failures: number;
};

export const INITIAL_LOBBY: LobbyState = { status: "loading", lobby: null, failures: 0 };

export function nextLobbyState(prev: LobbyState, result: LobbyInfo | null): LobbyState {
  if (result) return { status: "ok", lobby: result, failures: 0 };
  const failures = prev.failures + 1;
  return { ...prev, failures, status: failures >= LOBBY_FAILURES_TO_GIVE_UP ? "unreachable" : prev.status };
}

/**
 * 목록에 보일 채널: 열린 채널(평소 몇 개 + 붐비면 자동으로 더) + 나와 관계있는 채널(내 집·내 묘비·지금 채널).
 * 채널마다 주거 구역이 따로라, 지금은 닫혀 있는 채널에 집이 있는 사람도 그 채널을 골라 갈 수 있게 한다
 */
export function visibleChannels(lobby: LobbyInfo | null, mine: Iterable<number | null | undefined> = []): ChannelInfo[] {
  if (!lobby) return [];
  const keep = new Set<number>();
  for (const id of mine) if (typeof id === "number") keep.add(id);
  return lobby.channels.filter((c) => c.open || keep.has(c.id));
}

/** 목록에 보이고 만석이 아닌 채널인지 (mine = visibleChannels와 같은, 닫혀 있어도 보여 줄 내 채널들) */
export function isChannelSelectable(lobby: LobbyInfo | null, channel: number, mine: Iterable<number | null | undefined> = []): boolean {
  const ch = visibleChannels(lobby, mine).find((c) => c.id === channel);
  return !!ch && channelStatus(ch, lobby?.threshold) !== "full";
}

/** 채널 목록을 5초마다 HTTP로 가져온다 (입장 화면은 웹소켓을 쓰지 않는다) */
export function useLobby(): LobbyState {
  const [state, setState] = useState<LobbyState>(INITIAL_LOBBY);
  useEffect(() => {
    const ctrl = new AbortController();
    const poll = async () => {
      const lobby = await fetchLobby(ctrl.signal);
      if (!ctrl.signal.aborted) setState((prev) => nextLobbyState(prev, lobby));
    };
    void poll();
    const timer = setInterval(poll, LOBBY_POLL_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, []);
  return state;
}
