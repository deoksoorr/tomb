"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { api, ApiRequestError } from "@/lib/api";
import { readItem, UI_KEYS, writeItem } from "@/lib/storage";
import type { GraveDetailResponse, GraveListResponse, PublicGrave } from "@/lib/types";
import { GraveEventGate, isActionableGraveEvent } from "./graveEventGate";
import { mergeGraves, pruneOverrides, REVIVE_TOP_N, sortByRevives, type Overrides } from "./graveMerge";

const LIST_POLL_MS = 30_000;

export type GravesSnapshot = {
  graves: PublicGrave[];
  reviveTop: string[];
  byId: ReadonlyMap<string, PublicGrave>;
  loaded: boolean;
};

const EMPTY: GravesSnapshot = { graves: [], reviveTop: [], byId: new Map(), loaded: false };

/**
 * 묘비 목록의 클라이언트 사본. 첫 목록을 받은 뒤로는 바뀔 때마다 그 자리에서 graves:set을 보내므로,
 * `cache.upsert(grave)` 직후에 `grave:buried` 같은 이벤트를 보내면 게임은 이미 그 묘비를 알고 있다.
 */
export class GraveCache {
  private list: GraveListResponse | null = null;
  private overrides: Overrides = {};
  private snapshot = EMPTY;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snapshot;

  setList(list: GraveListResponse): void {
    // CDN 캐시가 같은 응답을 다시 주면 게임을 괜히 다시 맞추지 않는다
    if (this.list?.generatedAt === list.generatedAt) return;
    this.list = list;
    this.overrides = pruneOverrides(this.overrides, list.generatedAt, Date.now());
    this.publish();
  }

  upsert(grave: PublicGrave): void {
    this.overrides = { ...this.overrides, [grave.id]: { grave, at: Date.now() } };
    this.publish();
  }

  /** 지금 보이는 값에 일부만 덮어쓴다 (헌화·살려주세요 카운트) */
  patch(id: string, fields: Partial<Pick<PublicGrave, "flowers" | "revives">>): void {
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

  private publish(): void {
    const graves = mergeGraves(this.list?.graves ?? [], this.overrides);
    const reviveTop = sortByRevives(graves, this.list?.reviveTop ?? [])
      .slice(0, REVIVE_TOP_N)
      .map((g) => g.id);
    this.snapshot = { graves, reviveTop, byId: new Map(graves.map((g) => [g.id, g])), loaded: this.list !== null };
    // 첫 목록 전에 보내면 게임이 "묘비 0개(또는 몇 개)"로 월드를 잘못 깔았다가 다시 맞추게 된다
    if (this.list) bridge.emit("graves:set", { graves, reviveTop });
    this.listeners.forEach((fn) => fn());
  }
}

export type GravesState = GravesSnapshot & { cache: GraveCache };

// ── 첫 화면 속도: 입장 화면이 뜨자마자 목록을 받아 두고, 마지막 목록은 localStorage에 남겨 다음 방문 때 바로 깐다 ──

let prefetched: Promise<GraveListResponse> | null = null;

/** 입장 화면에서 부른다. 입장하면 useGraves가 이 응답을 이어받는다 */
export function prefetchGraves(): void {
  prefetched ??= api.listGraves();
  prefetched.catch(() => {
    prefetched = null;
  });
}

function takePrefetched(): Promise<GraveListResponse> | null {
  const p = prefetched;
  prefetched = null;
  return p;
}

/** 저장해 둔 목록. 형식이 다르면 null */
export function parseCachedList(raw: string | null): GraveListResponse | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<GraveListResponse>;
    return Array.isArray(v.graves) && Array.isArray(v.reviveTop) && typeof v.generatedAt === "number"
      ? (v as GraveListResponse)
      : null;
  } catch {
    return null;
  }
}

/**
 * 목록: 저장해 둔 목록을 바로 깔고 → 미리 받아 둔(또는 새로 받은) 최신 목록으로 바꾸고 → 30초마다 갱신.
 * 같은 채널의 묘비 변경(net:graveEvent)은 상세를 받아 바로 반영한다.
 */
export function useGraves(): GravesState {
  const [cache] = useState(() => new GraveCache());
  const snapshot = useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot);

  useEffect(() => {
    const cached = parseCachedList(readItem(UI_KEYS.gravesCache));
    if (cached) cache.setList(cached);

    let ctrl: AbortController | null = null;
    const apply = (list: GraveListResponse) => {
      cache.setList(list);
      writeItem(UI_KEYS.gravesCache, JSON.stringify(list));
    };
    const load = async () => {
      if (document.hidden) return;
      ctrl?.abort();
      const mine = (ctrl = new AbortController());
      try {
        const list = await api.listGraves(mine.signal);
        if (!mine.signal.aborted) apply(list);
      } catch {
        // 다음 주기에 다시 받는다
      }
    };
    const onVisibility = () => {
      if (!document.hidden) void load();
    };
    const early = takePrefetched();
    if (early) void early.then(apply, load);
    else void load();
    const timer = setInterval(load, LIST_POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      ctrl?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cache]);

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
