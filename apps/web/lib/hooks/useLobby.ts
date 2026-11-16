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

/** 11/16 집이 하나라도 있는 채널 (GET /api/housing/channels, useLobby가 2분마다 채운다). 이 채널들은 비어도 목록에서 숨지 않는다 */
let houseChannels: readonly number[] = [];
const HOUSE_CHANNELS_POLL_MS = 120_000;

/**
 * 목록에 보일 채널: 열린 채널(평소 몇 개 + 붐비면 자동으로 더) + 집이 있는 채널(누구에게나) + 나와 관계있는 채널(내 집·내 묘비·지금 채널).
 * 채널마다 주거 구역이 따로라, 누가 집을 산 채널은 비어 있어도 늘 고를 수 있게 한다 (자동 배정은 여전히 열린 채널만)
 */
export function visibleChannels(lobby: LobbyInfo | null, mine: Iterable<number | null | undefined> = []): ChannelInfo[] {
  if (!lobby) return [];
  const keep = new Set<number>(houseChannels);
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
    // 집이 있는 채널: 바뀌면 다시 그린다 (실패하면 지난 목록 그대로)
    const pollHouses = async () => {
      try {
        const res = await fetch("/api/housing/channels", { signal: ctrl.signal });
        if (!res.ok) return;
        const { channels } = (await res.json()) as { channels?: unknown };
        const next = Array.isArray(channels) ? channels.filter((c): c is number => Number.isInteger(c)) : [];
        if (ctrl.signal.aborted || next.join() === houseChannels.join()) return;
        houseChannels = next;
        setState((prev) => ({ ...prev }));
      } catch {
        // 다음에 다시 묻는다
      }
    };
    void poll();
    void pollHouses();
    const timer = setInterval(poll, LOBBY_POLL_MS);
    const houseTimer = setInterval(pollHouses, HOUSE_CHANNELS_POLL_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
      clearInterval(houseTimer);
    };
  }, []);
  return state;
}
