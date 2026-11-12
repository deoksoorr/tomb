"use client";

import { useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { BALANCE_CAP } from "@/lib/economy";
import { api, errorMessage } from "@/lib/api";
import type { Me } from "@/lib/types";

// 내 계정(포인트·가방·착용·내 묘비) 클라이언트 사본. 서버 응답의 me로 통째로 바꾸는 것이 기본이고,
// 반응 응답처럼 earned만 오는 경우에는 숫자만 더해 둔다(다음 /api/me 때 서버 값으로 맞춰진다).

export type MeState = { me: Me | null; error: string | null };

const INITIAL: MeState = { me: null, error: null };

class MeStore {
  private state = INITIAL;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.state;

  set(me: Me): void {
    this.update({ me, error: null });
    // 31번 운영자 표시를 게임에도 알린다 (바뀔 때만)
    if (bridge.last("me:staff")?.on !== !!me.staff) bridge.emit("me:staff", { on: !!me.staff });
  }

  /** 새로 시작·로그아웃: 이전 계정 정보를 버린다 */
  reset(): void {
    this.update(INITIAL);
    if (bridge.last("me:staff")?.on) bridge.emit("me:staff", { on: false });
  }

  async refresh(): Promise<Me | null> {
    try {
      const me = await api.me();
      this.set(me);
      return me;
    } catch (e) {
      this.update({ ...this.state, error: errorMessage(e) });
      return null;
    }
  }

  addEarned(earned: number | undefined): void {
    const me = this.state.me;
    if (!me || !earned || earned <= 0) return;
    this.set({ ...me, points: Math.min(BALANCE_CAP, me.points + earned), todayEarned: me.todayEarned + earned });
  }

  /** 내 계정이 세운 묘비 목록에 더한다 (세운 직후) */
  addGrave(graveId: string): void {
    const me = this.state.me;
    if (me && !me.graves.includes(graveId)) this.set({ ...me, graves: [...me.graves, graveId] });
  }

  private update(next: MeState): void {
    this.state = next;
    this.listeners.forEach((fn) => fn());
  }
}

export const meStore = new MeStore();

export function useMe(): MeState {
  return useSyncExternalStore(meStore.subscribe, meStore.getSnapshot, () => INITIAL);
}
