"use client";

import { useEffect, useSyncExternalStore } from "react";
import { hasUnread, latestNotice, sortNotices } from "@/components/notice/notices";
import { api } from "@/lib/api";
import { readItem, UI_KEYS, writeItem } from "@/lib/storage";
import type { Notice } from "@/lib/types";
import { onVisibleAgain } from "./visibleAgain";

// 공지 목록은 처음 한 번 받고, 켜 둔 탭에서도 새 공지가 보이게 주기적으로(화면이 보일 때만)·탭으로 돌아올 때(오래됐으면)·공지 창을 열 때 다시 받는다.
// 마지막으로 본 공지 id를 기억해 새 공지 점을 띄운다.

/** 켜 둔 탭에서 다시 받는 간격 (Redis 명령을 아끼려고 10분. 탭 복귀·공지 창 열기에는 바로 받는다) */
const POLL_MS = 10 * 60_000;
/** 탭 복귀·공지 창 열기로 다시 받을 때 최소 간격 (연속 요청 방지) */
const MIN_GAP_MS = 10_000;

type State = { notices: Notice[] | null; seenId: string | null };
const INITIAL: State = { notices: null, seenId: null };

let state = INITIAL;
let lastFetch = 0;
let inflight = false;
let watching = false;
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function fetchNotices(minGap: number) {
  if (inflight || Date.now() - lastFetch < minGap) return;
  inflight = true;
  lastFetch = Date.now();
  api
    .notices()
    .then((r) => update({ notices: sortNotices(r.notices) }))
    .catch(() => {
      if (!state.notices) update({ notices: [] });
    })
    .finally(() => {
      inflight = false;
    });
}

function load() {
  if (!lastFetch) update({ seenId: readItem(UI_KEYS.noticeSeen) });
  fetchNotices(MIN_GAP_MS);
  if (watching) return;
  watching = true;
  // 모듈 수명 동안 하나만 둔다 (구독자가 바뀌어도 그대로)
  setInterval(() => {
    if (document.visibilityState === "visible") fetchNotices(POLL_MS - 1000);
  }, POLL_MS);
  // 탭으로 돌아오면: 마지막으로 받은 지 주기만큼 지났을 때만 (흩어서) 한 번. 숨긴 동안은 받지 않는다
  onVisibleAgain(() => fetchNotices(POLL_MS - 1000));
}

/** 공지 창을 열 때: 방금 쓴 공지도 보이게 다시 받는다 */
export function refreshNotices(): void {
  fetchNotices(MIN_GAP_MS);
}

/** 공지 목록을 열었다: 지금 가장 최근 공지까지 본 것으로 */
export function markNoticesSeen(): void {
  const latest = latestNotice(state.notices ?? []);
  if (!latest) return;
  writeItem(UI_KEYS.noticeSeen, latest.id);
  update({ seenId: latest.id });
}

export function useNotices(): { notices: Notice[] | null; unread: boolean } {
  const snap = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  useEffect(load, []);
  return { notices: snap.notices, unread: snap.notices ? hasUnread(snap.notices, snap.seenId) : false };
}
