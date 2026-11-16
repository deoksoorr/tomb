"use client";

import { useEffect, useSyncExternalStore } from "react";

// 11/16 가방 버튼 「새로 생긴 물건」 점 (예전엔 가방 물건 개수를 모두 더한 숫자를 띄웠는데 무슨 숫자인지 알기 어려웠다).
// 가방을 열 때 물건 개수를 이 기기(localStorage, 계정마다)에 적어 두고, 그보다 늘어난 물건이 있으면 점을 켠다.
// 처음 보는 기기·계정은 지금 개수를 바로 적어 두어 점이 켜지지 않는다 (배포하자마자 모두에게 점이 뜨지 않게)

type Counts = Record<string, number>;

const keyOf = (accountId: string) => `tomb:bagSeen:${accountId}`;

function readSeen(accountId: string): Counts | null {
  try {
    const raw = localStorage.getItem(keyOf(accountId));
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Counts) : null;
  } catch {
    return null;
  }
}

/** 적어 둔 개수가 바뀌면 화면을 다시 그리게 (같은 탭 안에서만 — 저장값은 localStorage) */
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getVersion = () => version;

function writeSeen(accountId: string, counts: Counts) {
  try {
    localStorage.setItem(keyOf(accountId), JSON.stringify(counts));
  } catch {
    /* 저장 못 해도 가방을 열어 둔 동안은 점이 꺼져 있다 */
  }
  version++;
  listeners.forEach((fn) => fn());
}

/** 적어 둔 개수보다 늘어난 물건이 하나라도 있는지 */
export function hasNewItems(inventory: Counts, seen: Counts): boolean {
  return Object.entries(inventory).some(([id, n]) => n > 0 && n > (seen[id] ?? 0));
}

/** 가방에 새로 생긴 물건이 있는지. open = 지금 가방이 열려 있음 (열려 있는 동안 늘 지금 개수로 적어 둔다) */
export function useBagNew(accountId: string | null | undefined, inventory: Counts | null | undefined, open: boolean): boolean {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const key = inventory ? JSON.stringify(inventory) : "";

  useEffect(() => {
    if (!accountId || !inventory) return;
    if (open || !readSeen(accountId)) writeSeen(accountId, inventory);
    // key가 inventory 내용을 대신한다 (객체가 새로 와도 내용이 같으면 다시 적지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, key, open]);

  if (!accountId || !inventory || open) return false;
  const seen = readSeen(accountId);
  return seen !== null && hasNewItems(inventory, seen);
}
