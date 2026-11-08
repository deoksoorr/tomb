"use client";

import { useEffect, useSyncExternalStore } from "react";
import { hasUnread, latestNotice, sortNotices } from "@/components/notice/notices";
import { api } from "@/lib/api";
import { readItem, UI_KEYS, writeItem } from "@/lib/storage";
import type { Notice } from "@/lib/types";

// 공지 목록은 탭에서 한 번만 받는다. 마지막으로 본 공지 id를 기억해 새 공지 점을 띄운다.

type State = { notices: Notice[] | null; seenId: string | null };
const INITIAL: State = { notices: null, seenId: null };

let state = INITIAL;
let requested = false;
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

function load() {
  if (requested) return;
  requested = true;
  update({ seenId: readItem(UI_KEYS.noticeSeen) });
  api
    .notices()
    .then((r) => update({ notices: sortNotices(r.notices) }))
    .catch(() => update({ notices: [] }));
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
