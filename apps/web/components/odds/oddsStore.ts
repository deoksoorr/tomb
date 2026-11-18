"use client";

import { useSyncExternalStore } from "react";

// 11/18 확률 안내 창 열기 (어느 창에서든 [확률 보기]를 누르면 그 칸으로). 창은 OddsLayer(GameShell)가 그린다 — 다른 창 위에 겹쳐 뜬다

export type OddsSection = "top" | "hunt" | "stars" | "tower" | "enhance" | "forage" | "gull" | "wish" | "goblin" | "xmas" | "lottery" | "dye";

let open: OddsSection | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function openOdds(section: OddsSection = "top"): void {
  open = section;
  emit();
}

export function closeOdds(): void {
  open = null;
  emit();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

export function useOddsOpen(): OddsSection | null {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => null,
  );
}
