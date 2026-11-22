"use client";

import { useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { dexBadgeBits, takePlan } from "@/lib/forage/catalog";
import { forageApi } from "@/lib/forage/client";
import { NODE_SYNC_WINDOWS, nodeIdsAt, nodeWindow, windowEndsAt } from "@/lib/forage/rules";
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

  /**
   * 11/15 수집 의뢰 납품: 가방 사본에서 낸 것만 뺀다 (낚시 상태를 다시 읽지 않게).
   * 11/22 used는 종 단위 → 서버와 같은 차례(보통 → 대물 → 월척, catalog takePlan)로 칸에서 뺀다 (사본이 모자라면 종 칸에서만)
   */
  takeFromBag(used: Record<string, number>): void {
    const st = this.snap.state;
    if (!st) return;
    const bag = { ...st.bag };
    for (const [id, n] of Object.entries(takePlan(bag, used) ?? used)) {
      const left = (bag[id] ?? 0) - n;
      if (left > 0) bag[id] = left;
      else delete bag[id];
    }
    this.snap = { state: { ...st, bag }, error: null };
    this.listeners.forEach((fn) => fn());
  }

  /**
   * 다음 창(지점이 다시 피는 시각)에 맞춰 다시 받는다.
   * 뒤로 간 동안(숨긴 탭·다른 창)은 묻지 않고(아무도 안 보는 지점 갱신에 Redis 명령 7개 남짓), 돌아오면 (흩어서) 한 번 받는다.
   * 11/16 창이 10분으로 짧아져서: 씨앗(nodes.seed)이 있으면 창 NODE_SYNC_WINDOWS개 중 하나만 서버에서 받고
   * 나머지 창은 스스로 바꾼다 (새 창은 아직 캔 게 없어서 씨앗만으로 서버와 같은 목록) → 상태 읽기가 예전 15분마다에서 30분마다로
   */
  private schedule(at: number): void {
    if (this.timer) clearTimeout(this.timer);
    const ms = Math.max(5_000, Math.min(20 * 60_000, at - Date.now() + 1_500));
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!tabHidden()) return void (this.rollLocal(at) || this.refresh());
      this.due = true;
      this.offVisible ??= onVisibleAgain(() => {
        if (this.due) void this.refresh();
      });
    }, ms);
  }

  /** 창이 바뀌는 시각 at에 서버에 묻지 않고 새 창 지점으로 바꾼다. 서버에서 받을 차례·씨앗 없음·시계가 크게 어긋남(잠자기 등)이면 false */
  private rollLocal(at: number): boolean {
    const st = this.snap.state;
    const seed = st?.nodes.seed;
    const w = nodeWindow(at);
    if (!st || !seed || w % NODE_SYNC_WINDOWS === 0 || Math.abs(Date.now() - at) > 60_000) return false;
    this.set({ ...st, nodes: { ids: nodeIdsAt(seed, w), refreshAt: windowEndsAt(w), seed } });
    return true;
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
