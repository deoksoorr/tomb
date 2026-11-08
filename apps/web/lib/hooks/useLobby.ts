"use client";

import { useEffect, useState } from "react";
import { channelStatus, LOBBY_POLL_MS, type LobbyInfo } from "@tomb/protocol";
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

/** 목록에 보이고 만석이 아닌 채널인지 */
export function isChannelSelectable(lobby: LobbyInfo | null, channel: number): boolean {
  const ch = lobby?.channels.find((c) => c.id === channel);
  return !!ch && ch.open && channelStatus(ch, lobby?.threshold) !== "full";
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
