"use client";

import { useSyncExternalStore } from "react";
import { socialApi } from "@/lib/socialApi";
import type { GiftEntry } from "@/lib/types";

// 11번 선물함 클라이언트 사본. 입장 때·몇 분마다·선물함 창에서 받기/지우기 뒤에 맞춘다 (메뉴의 빨간 점)

export type GiftsState = { gifts: GiftEntry[] | null; unclaimed: number };
const INITIAL: GiftsState = { gifts: null, unclaimed: 0 };

class GiftsStore {
  private state = INITIAL;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;

  set(gifts: GiftEntry[]): void {
    this.state = { gifts, unclaimed: gifts.filter((g) => g.claimedAt === null).length };
    this.listeners.forEach((fn) => fn());
  }

  async refresh(): Promise<void> {
    try {
      this.set((await socialApi.gifts()).gifts);
    } catch {
      // 다음 갱신 때 다시
    }
  }

  /** 받았거나 지운 한 통만 고친다 (gift = null이면 목록에서 뺀다) */
  replace(id: string, gift: GiftEntry | null): void {
    const list = this.state.gifts ?? [];
    this.set(gift ? list.map((g) => (g.id === id ? gift : g)) : list.filter((g) => g.id !== id));
  }
}

export const giftsStore = new GiftsStore();

export function useGifts(): GiftsState {
  return useSyncExternalStore(giftsStore.subscribe, giftsStore.getSnapshot, () => INITIAL);
}
