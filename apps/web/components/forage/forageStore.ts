"use client";

import { useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { dexBadgeBits, takePlan } from "@/lib/forage/catalog";
import { forageApi } from "@/lib/forage/client";
import { NODE_SYNC_WINDOWS, NODE_WINDOW_MS, nodeRefreshAt, nodeWindow, rollNodeIds, type NodeUrgent } from "@/lib/forage/rules";
import { onVisibleAgain, tabHidden } from "@/lib/hooks/visibleAgain";
import type { ForageState } from "@/lib/forage/types";
import { urgentStore } from "./urgentStore";

// 내 낚시·채집 상태(가방의 물고기·채집물, 도감, 오늘 기록, 피어 있는 채집 지점)의 클라이언트 사본.
// 서버 응답의 state로 통째로 바꾼다. 바뀔 때마다 피어 있는 지점을 게임에 알린다 (forage:nodes).
// 11/22 긴급 의뢰(약초·광석·발굴품) 동안 그 종류 지점은 5분마다 모두 핀다 (lib/forage/rules nodeBloomRule — 서버와 같은 함수).
// 의뢰는 긴급 의뢰 사본(urgentStore)에서 보고, 의뢰가 열리고 닫히면 서버에 묻지 않고 지점을 다시 굴린다

/** 11/22 지점 규칙이 볼 긴급 의뢰 (긴급 의뢰 사본의 ev — 시각 판단은 규칙이 한다) */
function urgentEv(): NodeUrgent | null {
  const ev = urgentStore.getSnapshot().pub?.ev;
  return ev && ev.kind !== "fish" ? { kind: ev.kind, start: ev.start, end: ev.end } : null;
}
const evKey = (ev: NodeUrgent | null) => (ev ? `${ev.kind}|${ev.start}|${ev.end}` : "");

export type ForageSnapshot = { state: ForageState | null; error: string | null };

class ForageStore {
  private snap: ForageSnapshot = { state: null, error: null };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<ForageState | null> | null = null;
  /** 뒤로 간 동안 새 창이 열렸다 (돌아오면 한 번 받는다) */
  private due = false;
  private offVisible: (() => void) | null = null;
  /** 11/22 지금 지점 목록이 기준으로 삼은 시각·긴급 의뢰 (다음에 굴릴 때 지점마다 창이 바뀌었는지 본다) */
  private idsAt = 0;
  private idsEv: NodeUrgent | null = null;
  /** 마지막으로 본 긴급 의뢰 (바뀌면 다시 굴린다) */
  private seenEv = "";

  constructor() {
    urgentStore.subscribe(() => this.onUrgent());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  set(state: ForageState, ev: NodeUrgent | null = state.nodes.ev ?? null): void {
    this.due = false;
    this.snap = { state, error: null };
    // 서버 목록이면 서버가 본 의뢰(nodes.ev), 스스로 굴린 목록이면 굴릴 때 본 의뢰
    this.idsAt = Date.now();
    this.idsEv = ev;
    bridge.emit("forage:nodes", { ids: state.nodes.ids, ev });
    // 도감 100% 배지: 바뀔 때만 게임에 알린다 (내 캐릭터 이름표 옆). 11/26 칭호처럼 한 번 붙으면 남는다 (「전부」 칭호)
    const bits = dexBadgeBits(state.dex, state.titles);
    if (bridge.last("me:dex")?.bits !== bits) bridge.emit("me:dex", { bits });
    // 서버가 의뢰를 아직 몰랐어도(또는 반대로) 화면이 아는 의뢰 경계에서 다시 굴린다
    this.schedule(Math.min(state.nodes.refreshAt, nodeRefreshAt(this.idsAt, urgentEv())));
    this.listeners.forEach((fn) => fn());
  }

  /** 11/22 긴급 의뢰가 열리거나 닫히거나 일찍 끝나면 (사본이 바뀌면) 서버에 묻지 않고 지점을 다시 굴린다 */
  private onUrgent(): void {
    const ev = urgentEv();
    const key = evKey(ev);
    if (key === this.seenEv) return;
    this.seenEv = key;
    const st = this.snap.state;
    const seed = st?.nodes.seed;
    if (!st || !seed || evKey(this.idsEv) === key) return;
    const now = Date.now();
    this.set({ ...st, nodes: { ids: rollNodeIds(seed, st.nodes.ids, { at: this.idsAt, ev: this.idsEv }, { at: now, ev }), refreshAt: nodeRefreshAt(now, ev), seed } }, ev);
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

  /**
   * 창이 바뀌는 시각 at에 서버에 묻지 않고 새 창 지점으로 바꾼다. 서버에서 받을 차례·씨앗 없음·시계가 크게 어긋남(잠자기 등)이면 false.
   * 11/22 지점마다 자기 규칙 창만 새로 굴린다 (긴급 의뢰 5분 창이 바뀌어도 다른 종류는 이번 10분 창 그대로 — 캔 것이 빠진 채). 서버 차례는 10분 창 경계에서만
   */
  private rollLocal(at: number): boolean {
    const st = this.snap.state;
    const seed = st?.nodes.seed;
    const sync = at % NODE_WINDOW_MS === 0 && nodeWindow(at) % NODE_SYNC_WINDOWS === 0;
    if (!st || !seed || sync || Math.abs(Date.now() - at) > 60_000) return false;
    const ev = urgentEv();
    this.set({ ...st, nodes: { ids: rollNodeIds(seed, st.nodes.ids, { at: this.idsAt, ev: this.idsEv }, { at, ev }), refreshAt: nodeRefreshAt(at, ev), seed } }, ev);
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
