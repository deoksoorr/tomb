"use client";

import { useEffect, useRef } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { friendJoinToastOn, friendsInChannel, friendsStore, isOnline, presenceChanges, useFriends } from "@/lib/hooks/useFriends";
import { showFriendNotice } from "./FriendNotice";

/** 친구가 있거나 받은 신청이 있으면 이 간격으로 접속 상태를 묻는다 (실시간 서버도 10초씩 기억해 가볍다) → 들고 나는 것을 30초 안팎에 안다 */
export const POLL_MS = 20_000;
/** 친구도 신청도 없으면 드물게 (새 신청·수락은 실시간 서버의 "내 정보 새로 받기" 알림으로 바로 온다) */
export const IDLE_POLL_MS = 2 * 60_000;

/** 다음에 물을 때까지 (친구·받은 신청이 있으면 짧게) */
const delayFor = () => {
  const s = friendsStore.getSnapshot();
  return (s.friends?.length ?? 0) > 0 || s.incoming > 0 ? POLL_MS : IDLE_POLL_MS;
};

/** "가람님, 보리님 외 2명" */
const namesText = (names: string[]) => (names.length > 2 ? `${names.slice(0, 2).join("님, ")}님 외 ${names.length - 2}명` : `${names.join("님, ")}님`);

/**
 * 친구: 게임 중 접속 상태를 주기적으로 받아
 *  - 친구가 들어오고 나가면 화면 가운데 띠로 알린다 (친구 창에서 끌 수 있다). 처음 받았을 때 이미 와 있는 친구도 한 번 알린다
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
    let waitMs = 0;
    let alive = true;
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      waitMs = ms;
      timer = setTimeout(() => void loop(), ms);
    };
    const loop = async () => {
      timer = null;
      // 숨긴 탭은 묻지 않는다 (돌아오면 바로 다시)
      if (typeof document === "undefined" || !document.hidden) await friendsStore.refresh();
      if (alive) schedule(delayFor());
    };
    void loop();
    // 이 세션에서 처음 친구가 생기면(수락·신청) 드문 간격으로 기다리던 것을 바로 짧은 간격으로 바꾼다
    const offStore = friendsStore.subscribe(() => {
      if (alive && timer && waitMs > POLL_MS && delayFor() === POLL_MS) schedule(POLL_MS);
    });
    // 친구 신청·수락처럼 서버에서 내 쪽이 바뀌면 실시간 서버가 알려 준다 → 바로 다시 받는다
    const offStale = bridge.on("me:stale", () => void friendsStore.refresh());
    const onVisible = () => {
      if (!document.hidden && alive) schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      offStore();
      offStale();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  // 접속·퇴장 알림 (처음 받은 목록이면 이미 와 있는 친구를 한 번에)
  const prev = useRef<typeof friends>(null);
  useEffect(() => {
    if (!friends) return;
    const first = prev.current === null;
    const { came, left } = presenceChanges(prev.current, friends);
    prev.current = friends;
    if (!friendJoinToastOn()) return;
    if (first) {
      const here = friends.filter((f) => isOnline(f.where)).map((f) => f.name);
      if (here.length) showFriendNotice(`${namesText(here)}이 마을에 있어요`);
      return;
    }
    for (const name of came.slice(0, 3)) showFriendNotice(`${name}님이 마을에 왔어요`);
    if (came.length > 3) showFriendNotice(`친구 ${came.length - 3}명이 더 왔어요`);
    for (const name of left.slice(0, 3)) showFriendNotice(`${name}님이 나갔어요`);
    if (left.length > 3) showFriendNotice(`친구 ${left.length - 3}명이 더 나갔어요`);
  }, [friends]);

  // 새 친구 신청
  const seenIncoming = useRef<number | null>(null);
  useEffect(() => {
    if (friends === null) return;
    if (seenIncoming.current !== null && incoming > seenIncoming.current) showFriendNotice("새 친구 신청이 왔어요!");
    seenIncoming.current = incoming;
  }, [friends, incoming]);

  // 지금 채널의 친구 → 게임 (채널을 옮기면 다시)
  useEffect(() => {
    bridge.emit("friends:here", { ch: channel ?? 0, list: friends ? friendsInChannel(friends, channel) : [] });
  }, [friends, channel]);

  return { friendIncoming: incoming };
}
