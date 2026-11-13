"use client";

import { useSyncExternalStore } from "react";
import { request } from "@/lib/api";
import type { FriendListResponse, FriendPresenceResponse, FriendRequestResponse, FriendWhere, FriendWhereResponse } from "@/lib/friendTypes";
import { readItem, writeItem } from "@/lib/storage";

// 친구 클라이언트: API 호출 + 접속 상태 사본 (접속 알림·지도 하트·빨간 점). 친구 창은 열 때 목록 전체를 따로 받는다.

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
const enc = encodeURIComponent;

export const friendsApi = {
  list: () => request<FriendListResponse>("/api/friends", { cache: "no-store" }),
  presence: () => request<FriendPresenceResponse>("/api/friends/presence", { cache: "no-store" }),
  /** 게임 안에서 누른 사람에게 신청 (채널·방 + sid — 계정은 서버가 푼다) */
  request: (peer: { sid: number; ch?: number; room?: string }) => request<FriendRequestResponse>("/api/friends/requests", post(peer)),
  answer: (key: string, accept: boolean) => request<{ ok: true }>(`/api/friends/requests/${enc(key)}`, post({ accept })),
  cancel: (key: string) => request<{ ok: true }>(`/api/friends/requests/${enc(key)}`, { method: "DELETE" }),
  remove: (key: string) => request<{ ok: true }>(`/api/friends/${enc(key)}`, { method: "DELETE" }),
  /** 친구 한 명의 지금 위치 (친구한테 가기 직전) */
  where: (key: string) => request<FriendWhereResponse>(`/api/friends/${enc(key)}`, { cache: "no-store" }),
};

/** 접속 중인지 (마을이든 실내든). 모르면(unknown) false */
export const isOnline = (w: FriendWhere) => w.at === "world" || w.at === "away";

/**
 * 접속 알림 대상: 직전에 "접속 안 함"이었다가 지금 접속한 친구 이름.
 * 처음 받은 목록(prev = null)과 실시간 서버에 닿지 못했던 때(unknown)는 알리지 않는다 (들어올 때마다 한꺼번에 뜨지 않게)
 */
export function arrivals(prev: FriendPresenceResponse["friends"] | null, next: FriendPresenceResponse["friends"]): string[] {
  if (!prev) return [];
  const before = new Map(prev.map((f) => [f.key, f.where]));
  return next.filter((f) => before.get(f.key)?.at === "offline" && isOnline(f.where)).map((f) => f.name);
}

/** 지금 채널에 있는 친구 (게임이 이름표·미니맵 하트로 그린다) */
export function friendsInChannel(friends: FriendPresenceResponse["friends"], ch: number | null): { sid: number; name: string }[] {
  if (ch === null) return [];
  return friends.flatMap((f) => ((f.where.at === "world" || f.where.at === "away") && f.where.ch === ch ? [{ sid: f.where.sid, name: f.name }] : []));
}

// ── 설정: 친구 접속 알림 (이 브라우저에 기억) ──
const JOIN_TOAST_KEY = "tomb.ui.friendJoinToast";
export const friendJoinToastOn = () => readItem(JOIN_TOAST_KEY) !== "0";
export const setFriendJoinToast = (on: boolean) => writeItem(JOIN_TOAST_KEY, on ? "1" : "0");

// ── 접속 상태 사본 ──

export type FriendsState = { friends: FriendPresenceResponse["friends"] | null; incoming: number };
const INITIAL: FriendsState = { friends: null, incoming: 0 };

class FriendsStore {
  private state = INITIAL;
  private listeners = new Set<() => void>();
  private inflight: Promise<FriendsState | null> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;

  set(next: FriendsState): void {
    this.state = next;
    this.listeners.forEach((fn) => fn());
  }

  /** 다시 받는다 (동시에 여러 번 불러도 한 번). 실패하면 null — 다음 주기에 다시 */
  refresh(): Promise<FriendsState | null> {
    this.inflight ??= friendsApi
      .presence()
      .then((r) => {
        const next = { friends: r.friends, incoming: r.incoming };
        this.set(next);
        return next;
      })
      .catch(() => null)
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** 친구 창에서 받은 전체 목록으로 맞춘다 (받은 신청 수·위치) */
  fromList(list: FriendListResponse): void {
    this.set({ friends: list.friends.map(({ key, name, where }) => ({ key, name, where })), incoming: list.incoming.length });
  }
}

export const friendsStore = new FriendsStore();

export function useFriends(): FriendsState {
  return useSyncExternalStore(friendsStore.subscribe, friendsStore.getSnapshot, () => INITIAL);
}
