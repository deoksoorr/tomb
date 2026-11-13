"use client";

import { useEffect, useRef } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { friendJoinToastOn, friendsInChannel, friendsStore, presenceChanges, useFriends } from "@/lib/hooks/useFriends";
import { showFriendNotice } from "./FriendNotice";

/**
 * 들고 남 알림은 실시간 서버가 바로 밀어 준다(friend:presence). 주기 조회는 지도 하트·목록을 맞추는 용도라 느리게,
 * 밀어 주기를 못 받은 경우(옛 실시간 서버 등)에만 조회 결과로 알린다
 */
export const POLL_MS = 60_000;
/** 친구도 신청도 없으면 더 드물게 (새 신청·수락은 실시간 서버의 "내 정보 새로 받기" 알림으로 바로 온다) */
export const IDLE_POLL_MS = 3 * 60_000;
/** 밀어 준 알림 뒤 이 안에 조회로 같은 변화를 보면 다시 알리지 않는다 */
const PUSH_DEDUPE_MS = 3 * 60_000;
/** 밀어 준 알림 뒤 목록(지도 하트)을 다시 받기까지 (실시간 서버가 새 자리를 보게 조금 기다린다) */
const PUSH_REFRESH_MS = 2_500;

/** 다음에 물을 때까지 (친구·받은 신청이 있으면 짧게) */
const delayFor = () => {
  const s = friendsStore.getSnapshot();
  return (s.friends?.length ?? 0) > 0 || s.incoming > 0 ? POLL_MS : IDLE_POLL_MS;
};

/** 실시간 서버가 밀어 준 들고 남 (친구 키 → 방향·시각) */
const pushed = new Map<string, { on: boolean; at: number }>();


/**
 * 친구: 게임 중 접속 상태를 주기적으로 받아
 *  - 친구가 들어오고 나가면 화면 가운데 띠로 알린다 (친구 창에서 끌 수 있다). 내가 들어왔을 때 이미 와 있는 친구는 알리지 않는다
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
    // 친구 들고 남 (실시간 서버가 밀어 준 것): 바로 알리고, 조금 뒤 목록을 새로 (지도 하트·친구 창)
    let pushTimer: ReturnType<typeof setTimeout> | null = null;
    const offPush = bridge.on("friend:presence", ({ key, name, on }) => {
      pushed.set(key, { on, at: Date.now() });
      const known = friendsStore.getSnapshot().friends;
      if (friendJoinToastOn() && (!known || known.some((f) => f.key === key))) showFriendNotice(on ? `${name}님이 마을에 왔어요` : `${name}님이 나갔어요`);
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => void friendsStore.refresh(), PUSH_REFRESH_MS);
    });
    const onVisible = () => {
      if (!document.hidden && alive) schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      offStore();
      offStale();
      offPush();
      if (pushTimer) clearTimeout(pushTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  // 접속·퇴장 알림 (밀어 주기를 못 받았을 때만). 처음 받은 목록은 알리지 않는다 — "들어옴"은 이미 와 있던 쪽 화면에만 뜬다
  const prev = useRef<typeof friends>(null);
  useEffect(() => {
    if (!friends) return;
    const changes = presenceChanges(prev.current, friends);
    // 실시간 서버가 이미 밀어 준 변화는 다시 알리지 않는다
    const now = Date.now();
    const fresh = (on: boolean) => (name: string) => {
      const f = friends.find((x) => x.name === name);
      const p = f ? pushed.get(f.key) : undefined;
      return !(p && p.on === on && now - p.at < PUSH_DEDUPE_MS);
    };
    const came = changes.came.filter(fresh(true));
    const left = changes.left.filter(fresh(false));
    prev.current = friends;
    if (!friendJoinToastOn()) return;
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
