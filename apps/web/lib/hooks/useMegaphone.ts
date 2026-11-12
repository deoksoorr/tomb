"use client";

import { useSyncExternalStore } from "react";
import { MEGAPHONE_TTL_MS } from "@tomb/protocol";
import { socialApi } from "@/lib/socialApi";
import { readItem, writeItem } from "@/lib/storage";
import type { MegaphoneEntry } from "@/lib/types";

// 23번 확성기 상태: 왼쪽 위 기록(최근 20개, 접힘) + 화면 가운데에 크게 뜨는 한마디(몇 초간, 여러 개면 차례로).
// 기록은 서버 목록(/api/megaphone)이 기준이고, 실시간으로 온 것은 다음 목록에 실릴 때까지 덧붙여 둔다.

export const MEGA_FEED_MAX = 20;
/** 방금 온 한마디를 가운데에 크게 보여 주는 시간 (기다리는 것이 없을 때) */
export const MEGA_FLASH_MS = 7_000;
/** 뒤에 기다리는 한마디가 있으면 앞의 것은 이만큼만 보여 주고 넘긴다 */
export const MEGA_FLASH_QUEUED_MS = 4_000;
/** 가운데 표시를 기다리는 줄의 최대 길이 (넘치면 오래된 것부터 건너뛴다 — 기록에는 남는다) */
export const MEGA_QUEUE_MAX = 5;

/** 지금 보여 주는 한마디가 언제 내려가야 하는지 (뒤에 기다리는 것이 있으면 짧게) */
export function flashEndsAt(startedAt: number, waiting: number): number {
  return startedAt + (waiting > 0 ? MEGA_FLASH_QUEUED_MS : MEGA_FLASH_MS);
}
const COLLAPSED_KEY = "tomb.ui.megaphoneCollapsed";

/** 외친 지 5분이 안 된 한마디만 (기록 목록은 열려 있는 동안에도 5분이 지나면 빠진다) */
export function liveMegaphones(entries: MegaphoneEntry[], now: number): MegaphoneEntry[] {
  return entries.filter((e) => now - e.at < MEGAPHONE_TTL_MS);
}

export type MegaphoneState = {
  entries: MegaphoneEntry[];
  /** 지금 화면 가운데에 크게 떠 있는 한마디 */
  flash: MegaphoneEntry | null;
  /** 가운데 표시를 기다리는 한마디 (온 순서대로) */
  queue: MegaphoneEntry[];
  /** 지금 한마디가 내려가는 시각 (뒤에 기다리는 것이 생기면 당겨진다) */
  flashUntil: number;
  collapsed: boolean;
  /** 외치기 창 열림 */
  composing: boolean;
};

class MegaphoneStore {
  private state: MegaphoneState = { entries: [], flash: null, queue: [], flashUntil: 0, collapsed: false, composing: false };
  private listeners = new Set<() => void>();
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private flashStartedAt = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
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
    if (patch.entries) patch = { ...patch, entries: liveMegaphones(patch.entries, Date.now()) };
    this.state = { ...this.state, ...patch };
    if (patch.entries) this.armExpiry();
    this.listeners.forEach((fn) => fn());
  }

  /** 가장 오래된 한마디가 5분을 채우는 때에 맞춰 목록을 다시 거른다 */
  private armExpiry(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    if (!this.state.entries.length) return;
    const oldest = Math.min(...this.state.entries.map((e) => e.at));
    const ms = Math.max(0, oldest + MEGAPHONE_TTL_MS - Date.now()) + 50;
    this.expiryTimer = setTimeout(() => this.update({ entries: this.state.entries }), ms);
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

  /** 새 한마디 (실시간 방송 또는 내가 방금 외친 것). 같은 id는 한 번만. 가운데 표시는 앞의 것이 끝나면 차례로 */
  push(e: MegaphoneEntry): void {
    if (this.state.entries.some((x) => x.id === e.id)) return;
    const entries = [...this.state.entries, e].slice(-MEGA_FEED_MAX);
    if (!this.state.flash) {
      this.update({ entries });
      this.show(e);
      return;
    }
    this.update({ entries, queue: [...this.state.queue, e].slice(-MEGA_QUEUE_MAX) });
    // 앞의 것은 기다리는 줄이 생겼으니 짧게 줄인다 (이미 그만큼 지났으면 곧바로 넘긴다)
    this.schedule(Math.max(300, flashEndsAt(this.flashStartedAt, 1) - Date.now()));
  }

  private show(e: MegaphoneEntry): void {
    this.flashStartedAt = Date.now();
    this.update({ flash: e });
    this.schedule(flashEndsAt(this.flashStartedAt, this.state.queue.length) - this.flashStartedAt);
  }

  private schedule(ms: number): void {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.next(), ms);
    this.update({ flashUntil: Date.now() + ms });
  }

  /** 지금 것을 내리고 기다리던 다음 것을 띄운다 */
  private next(): void {
    this.flashTimer = null;
    const [head, ...rest] = this.state.queue;
    if (!head) {
      this.update({ flash: null });
      return;
    }
    this.update({ queue: rest });
    this.show(head);
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

const SERVER: MegaphoneState = { entries: [], flash: null, queue: [], flashUntil: 0, collapsed: false, composing: false };
export function useMegaphone(): MegaphoneState {
  return useSyncExternalStore(megaphoneStore.subscribe, megaphoneStore.getSnapshot, () => SERVER);
}
