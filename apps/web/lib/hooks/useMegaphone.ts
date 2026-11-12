"use client";

import { useSyncExternalStore } from "react";
import { socialApi } from "@/lib/socialApi";
import { readItem, writeItem } from "@/lib/storage";
import type { MegaphoneEntry } from "@/lib/types";

// 23번 확성기 창(왼쪽 위) 상태: 최근 20개 기록 + 방금 온 한마디(몇 초간 크게) + 접힘.
// 기록은 서버 목록(/api/megaphone)이 기준이고, 실시간으로 온 것은 다음 목록에 실릴 때까지 덧붙여 둔다.

export const MEGA_FEED_MAX = 20;
/** 방금 온 한마디를 크게 보여 주는 시간 */
export const MEGA_FLASH_MS = 7_000;
const COLLAPSED_KEY = "tomb.ui.megaphoneCollapsed";

export type MegaphoneState = {
  entries: MegaphoneEntry[];
  /** 지금 크게 떠 있는 한마디 */
  flash: MegaphoneEntry | null;
  collapsed: boolean;
  /** 외치기 창 열림 */
  composing: boolean;
};

class MegaphoneStore {
  private state: MegaphoneState = { entries: [], flash: null, collapsed: false, composing: false };
  private listeners = new Set<() => void>();
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  subscribe = (fn: () => void) => {
    if (!this.loaded) {
      this.loaded = true;
      this.state = { ...this.state, collapsed: readItem(COLLAPSED_KEY) === "1" };
    }
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;

  private update(patch: Partial<MegaphoneState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  /** 그 채널의 최근 기록으로 맞춘다 (관리자가 숨긴 것은 여기서 빠진다). 방금 온 것(1분 안)은 서버 목록에 아직 없어도 남긴다 */
  async load(channel: number): Promise<void> {
    try {
      const { entries } = await socialApi.megaphones(channel);
      const ids = new Set(entries.map((e) => e.id));
      const fresh = this.state.entries.filter((e) => !ids.has(e.id) && e.at > Date.now() - 60_000 && (e.scope === "all" || e.ch === channel));
      this.update({ entries: [...entries, ...fresh].sort((a, b) => a.at - b.at).slice(-MEGA_FEED_MAX) });
    } catch {
      // 다음 갱신 때 다시
    }
  }

  /** 새 한마디 (실시간 방송 또는 내가 방금 외친 것). 같은 id는 한 번만 */
  push(e: MegaphoneEntry): void {
    if (this.state.entries.some((x) => x.id === e.id)) return;
    this.update({ entries: [...this.state.entries, e].slice(-MEGA_FEED_MAX), flash: e });
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.update({ flash: null }), MEGA_FLASH_MS);
  }

  setCollapsed(collapsed: boolean): void {
    writeItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    this.update({ collapsed });
  }

  compose(open: boolean): void {
    this.update({ composing: open });
  }
}

export const megaphoneStore = new MegaphoneStore();

/** 가방 등 다른 곳에서 외치기 창을 연다 */
export const openMegaphone = () => megaphoneStore.compose(true);

const SERVER: MegaphoneState = { entries: [], flash: null, collapsed: false, composing: false };
export function useMegaphone(): MegaphoneState {
  return useSyncExternalStore(megaphoneStore.subscribe, megaphoneStore.getSnapshot, () => SERVER);
}
