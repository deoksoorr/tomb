"use client";

import { useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { forageApi } from "@/lib/forage/client";
import type { ForageState } from "@/lib/forage/types";

// 내 낚시·채집 상태(가방의 물고기·채집물, 도감, 오늘 기록, 피어 있는 채집 지점)의 클라이언트 사본.
// 서버 응답의 state로 통째로 바꾼다. 바뀔 때마다 피어 있는 지점을 게임에 알린다 (forage:nodes).

export type ForageSnapshot = { state: ForageState | null; error: string | null };

class ForageStore {
  private snap: ForageSnapshot = { state: null, error: null };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<ForageState | null> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  set(state: ForageState): void {
    this.snap = { state, error: null };
    bridge.emit("forage:nodes", { ids: state.nodes.ids });
    this.schedule(state.nodes.refreshAt);
    this.listeners.forEach((fn) => fn());
  }

  /** 다음 창(지점이 다시 피는 시각)에 맞춰 다시 받는다 */
  private schedule(at: number): void {
    if (this.timer) clearTimeout(this.timer);
    const ms = Math.max(5_000, Math.min(20 * 60_000, at - Date.now() + 1_500));
    this.timer = setTimeout(() => void this.refresh(), ms);
  }

  refresh(): Promise<ForageState | null> {
    this.inflight ??= forageApi
      .state()
      .then((s) => {
        this.set(s);
        return s;
      })
      .catch((e) => {
        this.snap = { ...this.snap, error: errorMessage(e) };
        this.listeners.forEach((fn) => fn());
        return null;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const forageStore = new ForageStore();

export function useForage(): ForageSnapshot {
  return useSyncExternalStore(forageStore.subscribe, forageStore.getSnapshot, forageStore.getSnapshot);
}
