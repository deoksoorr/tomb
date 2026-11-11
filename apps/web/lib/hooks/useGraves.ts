"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { api, ApiRequestError } from "@/lib/api";
import { gravesCacheKey, readItem, writeItem } from "@/lib/storage";
import type { GraveDetailResponse, GraveListResponse, PublicGrave } from "@/lib/types";
import { GraveEventGate, isActionableGraveEvent } from "./graveEventGate";
import { mergeGraves, pruneOverrides, type Overrides } from "./graveMerge";

const LIST_POLL_MS = 30_000;

export type GravesSnapshot = {
  /** 이 목록의 채널 (채널마다 묘지가 따로다) */
  channel: number;
  graves: PublicGrave[];
  /** @deprecated 살려주세요(다시 피어날 자리)는 49번에서 없어졌다 → 항상 빈 배열 */
  reviveTop: string[];
  byId: ReadonlyMap<string, PublicGrave>;
  loaded: boolean;
};

const emptySnapshot = (channel: number): GravesSnapshot => ({
  channel,
  graves: [],
  reviveTop: [],
  byId: new Map(),
  loaded: false,
});

/**
 * 한 채널 묘지의 클라이언트 사본. 첫 목록을 받은 뒤로는 바뀔 때마다 그 자리에서 graves:set을 보내므로,
 * `cache.upsert(grave)` 직후에 `grave:buried` 같은 이벤트를 보내면 게임은 이미 그 묘비를 알고 있다.
 * 채널을 옮기면 비우고 새 채널 목록을 기다린다. 다른 채널 묘비는 섞지 않는다.
 */
export class GraveCache {
  private channel: number;
  private list: GraveListResponse | null = null;
  private overrides: Overrides = {};
  private snapshot: GravesSnapshot;
  private listeners = new Set<() => void>();

  constructor(channel: number) {
    this.channel = channel;
    this.snapshot = emptySnapshot(channel);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snapshot;

  getChannel = () => this.channel;

  /** 채널을 옮겼다: 이전 채널 목록·덮어쓰기를 버리고 새 목록을 기다린다 */
  setChannel(channel: number): void {
    if (channel === this.channel) return;
    this.channel = channel;
    this.list = null;
    this.overrides = {};
    this.snapshot = emptySnapshot(channel);
    this.listeners.forEach((fn) => fn());
  }

  setList(list: GraveListResponse): void {
    // 늦게 도착한 다른 채널 목록, CDN 캐시가 다시 준 같은 응답은 무시한다
    if ((list.channel ?? 1) !== this.channel || this.list?.generatedAt === list.generatedAt) return;
    this.list = list;
    this.overrides = pruneOverrides(this.overrides, list.generatedAt, Date.now());
    // 방금 성불한 묘비가 아직 내 화면에 있으면 게임이 빛 연출 뒤에 지운다
    const passed = list.passed?.filter((id) => this.snapshot.byId.has(id));
    this.publish(passed?.length ? passed : undefined);
  }

  upsert(grave: PublicGrave): void {
    if (grave.channel !== this.channel) return;
    this.overrides = { ...this.overrides, [grave.id]: { grave, at: Date.now() } };
    this.publish();
  }

  /** 지금 보이는 값에 일부만 덮어쓴다 (헌화 수) */
  patch(id: string, fields: Partial<Pick<PublicGrave, "flowers">>): void {
    const grave = this.snapshot.byId.get(id);
    if (grave) this.upsert({ ...grave, ...fields });
  }

  remove(id: string): void {
    this.overrides = { ...this.overrides, [id]: { grave: null, at: Date.now() } };
    this.publish();
  }

  /** 상세를 직접 받아(CDN 캐시 우회) 목록에 반영한다. 없어졌으면 지우고 null */
  async refresh(id: string, signal?: AbortSignal): Promise<GraveDetailResponse | null> {
    try {
      const detail = await api.graveDetail(id, signal);
      this.upsert(detail.grave);
      return detail;
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) {
        this.remove(id);
        return null;
      }
      throw e;
    }
  }

  private publish(passed?: string[]): void {
    const graves = mergeGraves(this.list?.graves ?? [], this.overrides);
    const reviveTop: string[] = [];
    const channel = this.channel;
    this.snapshot = { channel, graves, reviveTop, byId: new Map(graves.map((g) => [g.id, g])), loaded: this.list !== null };
    // 첫 목록 전에 보내면 게임이 "묘비 0개(또는 몇 개)"로 월드를 잘못 깔았다가 다시 맞추게 된다
    if (this.list) bridge.emit("graves:set", { channel, graves, reviveTop, ...(passed ? { passed } : {}) });
    this.listeners.forEach((fn) => fn());
  }
}

export type GravesState = GravesSnapshot & { cache: GraveCache };

// ── 첫 화면 속도: 입장 화면이 뜨자마자 목록을 받아 두고, 마지막 목록은 localStorage에 남겨 다음 방문 때 바로 깐다 ──

let prefetched: { channel: number; list: Promise<GraveListResponse> } | null = null;

/** 입장 버튼을 누를 때 들어갈(것으로 보이는) 채널 목록을 미리 받는다. 입장하면 useGraves가 이어받는다 */
export function prefetchGraves(channel: number): void {
  if (prefetched?.channel === channel) return;
  const entry = { channel, list: api.listGraves(channel) };
  prefetched = entry;
  entry.list.catch(() => {
    if (prefetched === entry) prefetched = null;
  });
}

function takePrefetched(channel: number): Promise<GraveListResponse> | null {
  const p = prefetched?.channel === channel ? prefetched.list : null;
  prefetched = null;
  return p;
}

/** 저장해 둔 목록. 형식이 다르면 null */
export function parseCachedList(raw: string | null): GraveListResponse | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<GraveListResponse>;
    return Array.isArray(v.graves) &&
      Array.isArray(v.reviveTop) &&
      typeof v.generatedAt === "number" &&
      typeof v.channel === "number"
      ? (v as GraveListResponse)
      : null;
  } catch {
    return null;
  }
}

/**
 * 지금 채널의 목록: 저장해 둔 목록을 바로 깔고 → 미리 받아 둔(또는 새로 받은) 최신 목록으로 바꾸고 → 30초마다 갱신.
 * 채널이 바뀌면 즉시 그 채널 목록으로 다시 시작한다. 같은 채널의 묘비 변경(net:graveEvent)은 상세를 받아 바로 반영한다.
 */
export function useGraves(channel: number): GravesState {
  const [cache] = useState(() => new GraveCache(channel));
  const snapshot = useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot);

  useEffect(() => {
    cache.setChannel(channel);
    const cached = parseCachedList(readItem(gravesCacheKey(channel)));
    if (cached) cache.setList(cached);

    let ctrl: AbortController | null = null;
    const apply = (list: GraveListResponse) => {
      cache.setList(list);
      writeItem(gravesCacheKey(channel), JSON.stringify(list));
    };
    const load = async () => {
      if (document.hidden) return;
      ctrl?.abort();
      const mine = (ctrl = new AbortController());
      try {
        const list = await api.listGraves(channel, mine.signal);
        if (!mine.signal.aborted) apply(list);
      } catch {
        // 다음 주기에 다시 받는다
      }
    };
    const onVisibility = () => {
      if (!document.hidden) void load();
    };
    const early = takePrefetched(channel);
    if (early) void early.then(apply, load);
    else void load();
    const timer = setInterval(load, LIST_POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      ctrl?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cache, channel]);

  // 같은 채널의 묘비 변경 알림 → 한도(graveEventGate) 안에서만 상세를 받아 반영한다
  useEffect(() => {
    const gate = new GraveEventGate();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = (graveId: string) => {
      cache.refresh(graveId).catch(() => {
        // 네트워크 실패는 다음 목록 갱신 때 맞춰진다
      });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const at = gate.nextDueAt();
      if (at === null) return;
      timer = setTimeout(
        () => {
          timer = null;
          gate.due(Date.now()).forEach(refresh);
          schedule();
        },
        Math.max(0, at - Date.now()),
      );
    };
    const off = bridge.on("net:graveEvent", ({ kind, graveId }) => {
      if (!isActionableGraveEvent(kind, graveId, cache.getSnapshot().byId.has(graveId))) return;
      const decision = gate.offer(graveId, Date.now());
      if (decision === "now") refresh(graveId);
      else if (decision === "later") schedule();
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [cache]);

  return { ...snapshot, cache };
}
