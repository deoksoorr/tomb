"use client";

import { useSyncExternalStore } from "react";

// 가방 [칭호] 칸에서 아직 안 본 칭호 (서버 GET /api/me/titles의 unseen). 칭호 알림(TitleNotice)이 채우고,
// 가방 단추·메뉴의 점과 [칭호] 칸의 "새로!" 표시가 읽는다. 칸을 열면 본 것으로 비운다.

let unseen: readonly string[] = [];
const subs = new Set<() => void>();

export const titleNews = {
  set(ids: readonly string[]) {
    if (ids.length === unseen.length && ids.every((id, i) => id === unseen[i])) return;
    unseen = [...ids];
    subs.forEach((f) => f());
  },
  get: () => unseen,
  subscribe(f: () => void) {
    subs.add(f);
    return () => void subs.delete(f);
  },
};

const EMPTY: readonly string[] = [];
export function useTitleNews(): readonly string[] {
  return useSyncExternalStore(titleNews.subscribe, titleNews.get, () => EMPTY);
}
