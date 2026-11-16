"use client";

import { useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { dexBadgeBits } from "@/lib/forage/catalog";
import { forageApi } from "@/lib/forage/client";
import { onVisibleAgain, tabHidden } from "@/lib/hooks/visibleAgain";
import type { ForageState } from "@/lib/forage/types";

// 내 낚시·채집 상태(가방의 물고기·채집물, 도감, 오늘 기록, 피어 있는 채집 지점)의 클라이언트 사본.
// 서버 응답의 state로 통째로 바꾼다. 바뀔 때마다 피어 있는 지점을 게임에 알린다 (forage:nodes).

export type ForageSnapshot = { state: ForageState | null; error: string | null };

class ForageStore {
  private snap: ForageSnapshot = { state: null, error: null };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<ForageState | null> | null = null;
  /** 뒤로 간 동안 새 창이 열렸다 (돌아오면 한 번 받는다) */
  private due = false;
  private offVisible: (() => void) | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  set(state: ForageState): void {
    this.due = false;
    this.snap = { state, error: null };
    bridge.emit("forage:nodes", { ids: state.nodes.ids });
    // 도감 100% 배지: 바뀔 때만 게임에 알린다 (내 캐릭터 이름표 옆)
    const bits = dexBadgeBits(state.dex);
    if (bridge.last("me:dex")?.bits !== bits) bridge.emit("me:dex", { bits });
    this.schedule(state.nodes.refreshAt);
    this.listeners.forEach((fn) => fn());
  }

  /** 11/15 수집 의뢰 납품: 가방 사본에서 낸 것만 뺀다 (낚시 상태를 다시 읽지 않게) */
  takeFromBag(used: Record<string, number>): void {
    const st = this.snap.state;
    if (!st) return;
    const bag = { ...st.bag };
    for (const [id, n] of Object.entries(used)) {
      const left = (bag[id] ?? 0) - n;
      if (left > 0) bag[id] = left;
      else delete bag[id];
    }
    this.snap = { state: { ...st, bag }, error: null };
    this.listeners.forEach((fn) => fn());
  }

  /**
   * 다음 창(지점이 다시 피는 시각)에 맞춰 다시 받는다.
   * 뒤로 간 동안(숨긴 탭·다른 창)은 묻지 않고(아무도 안 보는 지점 갱신에 Redis 명령 7개 남짓), 돌아오면 (흩어서) 한 번 받는다
   */
  private schedule(at: number): void {
    if (this.timer) clearTimeout(this.timer);
    const ms = Math.max(5_000, Math.min(20 * 60_000, at - Date.now() + 1_500));
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!tabHidden()) return void this.refresh();
      this.due = true;
      this.offVisible ??= onVisibleAgain(() => {
        if (this.due) void this.refresh();
      });
    }, ms);
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
    this.offVisible?.();
    this.offVisible = null;
    this.due = false;
  }
}

export const forageStore = new ForageStore();

export function useForage(): ForageSnapshot {
  return useSyncExternalStore(forageStore.subscribe, forageStore.getSnapshot, forageStore.getSnapshot);
}
