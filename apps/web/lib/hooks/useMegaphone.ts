"use client";

import { useSyncExternalStore } from "react";
import { MEGAPHONE_TTL_MS, type MegaPin, type MegaPinMsg } from "@tomb/protocol";
import { socialApi } from "@/lib/socialApi";
import { readItem, writeItem } from "@/lib/storage";
import type { MegaphoneEntry } from "@/lib/types";

// 23번 확성기 상태: 왼쪽 위 기록(최근 20개, 접힘) + 화면 가운데에 크게 뜨는 한마디(몇 초간, 여러 개면 차례로).
// 기록은 서버 목록(/api/megaphone)이 기준이고, 실시간으로 온 것은 다음 목록에 실릴 때까지 덧붙여 둔다.
// 11/17 맨 위 고정 공지(운영자)도 같은 목록에 실려 오고, 바뀌면 실시간 megaPin으로 온다 (따로 묻지 않는다).

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

/** 실시간으로 바뀐 고정 공지는 이만큼 서버 목록보다 먼저 믿는다 (목록은 CDN에 30초 + 갱신 중 2분까지 옛것일 수 있다) */
export const PIN_HOLD_MS = 3 * 60_000;

/** 고정 공지 정렬: 그 채널 것 먼저, 모든 채널 것 다음 (최대 2개) */
export function sortPins(pins: MegaPin[]): MegaPin[] {
  return [...pins].sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "channel" ? -1 : 1)).slice(0, 2);
}

/** 고정 공지 바뀜을 지금 칸들에 반영한다. 다른 채널 것이면 그대로 (null = 이 화면과 상관없다) */
export function applyPinMsg(pins: MegaPin[], m: MegaPinMsg, channel: number): MegaPin[] | null {
  if (m.scope === "channel" && m.ch !== channel) return null;
  return sortPins([...pins.filter((p) => p.scope !== m.scope), ...(m.pin ? [m.pin] : [])]);
}

/** 외친 지 5분이 안 된 한마디만 (기록 목록은 열려 있는 동안에도 5분이 지나면 빠진다) */
export function liveMegaphones(entries: MegaphoneEntry[], now: number): MegaphoneEntry[] {
  return entries.filter((e) => now - e.at < MEGAPHONE_TTL_MS);
}

/** 뒤 공지가 바꿔 끼운 앞 공지를 뺀다 (긴급 의뢰 시작 → 끝) */
export function dropReplaced(entries: MegaphoneEntry[]): MegaphoneEntry[] {
  const gone = new Set(entries.flatMap((e) => (e.replaces ? [e.replaces] : [])));
  return gone.size ? entries.filter((e) => !gone.has(e.id)) : entries;
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
  /** 11/17 맨 위 고정 공지 (그 채널 것 먼저, 모든 채널 것 다음) */
  pins: MegaPin[];
};

class MegaphoneStore {
  private state: MegaphoneState = { entries: [], flash: null, queue: [], flashUntil: 0, collapsed: false, composing: false, pins: [] };
  private listeners = new Set<() => void>();
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private flashStartedAt = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;
  /** 고정 공지를 마지막으로 맞춘 채널과, 실시간으로 바뀐 공지를 서버 목록보다 먼저 믿는 때 */
  private pinCh = 0;
  private pinHeldUntil = 0;

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
      const { entries, pins } = await socialApi.megaphones(channel);
      const ids = new Set(entries.map((e) => e.id));
      const fresh = this.state.entries.filter((e) => !ids.has(e.id) && e.at > Date.now() - 60_000 && (e.scope === "all" || e.ch === channel));
      // 고정 공지: 옛 서버(pins 없음)면 그대로, 방금 실시간으로 바뀐 것은 CDN 옛 목록으로 되돌리지 않는다 (채널을 옮겼으면 새 채널 것으로)
      const takePins = !!pins && (channel !== this.pinCh || Date.now() >= this.pinHeldUntil);
      this.pinCh = channel;
      this.update({
        entries: dropReplaced([...entries, ...fresh]).sort((a, b) => a.at - b.at).slice(-MEGA_FEED_MAX),
        ...(takePins ? { pins: sortPins(pins) } : {}),
      });
    } catch {
      // 다음 갱신 때 다시
    }
  }

  /** 새 한마디 (실시간 방송 또는 내가 방금 외친 것). 같은 id는 한 번만. 가운데 표시는 앞의 것이 끝나면 차례로.
   * 11/15 replaces가 있으면(긴급 의뢰 끝 공지) 바꿔 끼울 앞 공지를 기록·기다리는 줄에서 뺀다 */
  push(e: MegaphoneEntry): void {
    if (this.state.entries.some((x) => x.id === e.id)) return;
    const entries = [...this.state.entries.filter((x) => x.id !== e.replaces), e].slice(-MEGA_FEED_MAX);
    if (e.replaces && this.state.queue.some((x) => x.id === e.replaces)) this.update({ queue: this.state.queue.filter((x) => x.id !== e.replaces) });
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

  /** 11/17 고정 공지가 바뀌었다 (실시간 megaPin). 이 채널과 상관없는 것은 버린다 */
  applyPin(m: MegaPinMsg, channel: number): void {
    const pins = applyPinMsg(this.state.pins, m, channel);
    if (!pins) return;
    this.pinCh = channel;
    this.pinHeldUntil = Date.now() + PIN_HOLD_MS;
    this.update({ pins });
  }

  /** 11/17 운영자가 방금 쓰거나 지운 뒤 서버가 돌려준 그 채널 고정 공지 */
  setPins(pins: MegaPin[], channel: number): void {
    this.pinCh = channel;
    this.pinHeldUntil = Date.now() + PIN_HOLD_MS;
    this.update({ pins: sortPins(pins) });
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

const SERVER: MegaphoneState = { entries: [], flash: null, queue: [], flashUntil: 0, collapsed: false, composing: false, pins: [] };
export function useMegaphone(): MegaphoneState {
  return useSyncExternalStore(megaphoneStore.subscribe, megaphoneStore.getSnapshot, () => SERVER);
}
