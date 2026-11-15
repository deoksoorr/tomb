"use client";

import { useSyncExternalStore } from "react";
import { errorMessage } from "@/lib/api";
import { questApi } from "@/lib/forage/quests/client";
import type { QuestBoard } from "@/lib/forage/quests/types";

// 11/15: 수집 의뢰판(오늘의 의뢰·이번 주 큰 의뢰·도장)의 클라이언트 사본. 의뢰판·교환소·가방이 같이 본다.
// 서버 응답의 board로 통째로 바꾼다. 날짜가 바뀌면(새벽 5시) 다음에 열 때 다시 받는다.

export type QuestSnapshot = { board: QuestBoard | null; error: string | null };

class QuestClientStore {
  private snap: QuestSnapshot = { board: null, error: null };
  private listeners = new Set<() => void>();
  private inflight: Promise<QuestBoard | null> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snap;

  set(board: QuestBoard): void {
    this.snap = { board, error: null };
    this.listeners.forEach((fn) => fn());
  }

  /** 없거나 날짜가 지났으면 받는다 (force면 늘) */
  refresh(force = false): Promise<QuestBoard | null> {
    const b = this.snap.board;
    if (!force && b && Date.now() < Math.min(b.dayResetAt, b.weekResetAt)) return Promise.resolve(b);
    this.inflight ??= questApi
      .board()
      .then((x) => {
        this.set(x);
        return x;
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
}

export const questStore = new QuestClientStore();

export function useQuests(): QuestSnapshot {
  return useSyncExternalStore(questStore.subscribe, questStore.getSnapshot, questStore.getSnapshot);
}
