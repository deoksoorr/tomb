"use client";

import { useEffect, useRef } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { arrivals, friendJoinToastOn, friendsInChannel, friendsStore, useFriends } from "@/lib/hooks/useFriends";
import { showToast } from "@/lib/hooks/useToasts";

/** 친구가 있거나 받은 신청이 있으면 이 간격으로 접속 상태를 묻는다 (실시간 서버도 15초씩 기억해 가볍다) */
const POLL_MS = 30_000;
/** 친구도 신청도 없으면 드물게 (새 신청은 실시간 서버의 "내 정보 새로 받기" 알림으로 바로 온다) */
const IDLE_POLL_MS = 3 * 60_000;

/**
 * 친구: 게임 중 접속 상태를 주기적으로 받아
 *  - 친구가 들어오면 "○○님이 마을에 왔어요" 토스트 (친구 창에서 끌 수 있다)
 *  - 새 친구 신청이 오면 알리고 빨간 점 (받은 신청 수를 돌려준다)
 *  - 지금 채널에 있는 친구를 게임에 알린다 (이름표·미니맵 하트)
 */
export function useFriendPresence(ready: boolean): { friendIncoming: number } {
  const { friends, incoming } = useFriends();
  const status = useBridgeValue("net:status");
  const channel = status?.mode === "online" ? status.channel : null;

  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      if (typeof document === "undefined" || !document.hidden) await friendsStore.refresh();
      if (!alive) return;
      const s = friendsStore.getSnapshot();
      timer = setTimeout(() => void loop(), (s.friends?.length ?? 0) > 0 || s.incoming > 0 ? POLL_MS : IDLE_POLL_MS);
    };
    void loop();
    // 친구 신청·수락처럼 서버에서 내 쪽이 바뀌면 실시간 서버가 알려 준다 → 바로 다시 받는다
    const off = bridge.on("me:stale", () => void friendsStore.refresh());
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      off();
    };
  }, [ready]);

  // 접속 알림: 직전에 "접속 안 함"이던 친구가 들어왔다
  const prev = useRef<typeof friends>(null);
  useEffect(() => {
    if (!friends) return;
    const names = arrivals(prev.current, friends);
    prev.current = friends;
    if (!friendJoinToastOn()) return;
    for (const name of names.slice(0, 3)) showToast(`${name}님이 마을에 왔어요`, 5_000);
  }, [friends]);

  // 새 친구 신청
  const seenIncoming = useRef<number | null>(null);
  useEffect(() => {
    if (friends === null) return;
    if (seenIncoming.current !== null && incoming > seenIncoming.current) showToast("새 친구 신청이 왔어요! 친구 창에서 확인해 보세요.", 6_000);
    seenIncoming.current = incoming;
  }, [friends, incoming]);

  // 지금 채널의 친구 → 게임 (채널을 옮기면 다시)
  useEffect(() => {
    bridge.emit("friends:here", { ch: channel ?? 0, list: friends ? friendsInChannel(friends, channel) : [] });
  }, [friends, channel]);

  return { friendIncoming: incoming };
}
