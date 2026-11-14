import { useSyncExternalStore } from "react";
import { readItem, writeItem } from "./storage";

// 사냥터·미니게임 화면 흔들림 끄기 (기기의 '동작 줄이기'와 따로, 게임 안에서 고른다). 이 기기에만 기억한다.

const KEY = "tomb.ui.shakeOff";
const subs = new Set<() => void>();
let off: boolean | null = null;

/** 화면 흔들림을 켜 두었는지 (처음엔 켜짐) */
export function shakeEnabled(): boolean {
  if (off === null) off = readItem(KEY) === "1";
  return !off;
}

export function setShakeEnabled(on: boolean): void {
  off = !on;
  writeItem(KEY, on ? "0" : "1");
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

/** 화면용: [켜짐 여부, 바꾸기] */
export function useShakeEnabled(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, shakeEnabled, () => true);
  return [on, setShakeEnabled];
}
