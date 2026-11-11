import { useEffect } from "react";

// "지금 새로고침하면 안 되는 순간" 등록소. 자동 업데이트(UpdateNotice)가 새로고침 전에 확인한다.
//  - hard: 사냥 한 판·미니게임·묘비 작성 폼 → 큰 패치(강제 업데이트)도 끝날 때까지 기다린다
//  - soft: 저장하지 않은 입력이 있는 창 → 평소 패치의 자동 새로고침만 미룬다 (사용자가 직접 누르면 바로)
// 오버레이(React)는 useBusy로, 게임(Phaser)은 setBusy로 직접 등록한다. 사냥·미니게임 장면은
// scene:changed로도 알 수 있어 UpdateNotice가 함께 본다.

export type BusyKind = "hard" | "soft";
export type BusyState = { hard: boolean; soft: boolean };

const entries = new Map<string, BusyKind>();

export function setBusy(key: string, on: boolean, kind: BusyKind = "hard"): void {
  if (on) entries.set(key, kind);
  else entries.delete(key);
}

/** 등록된 것 + (있으면) 지금 장면 + 화면에 남은 입력값 */
export function busyNow(scene?: string | null, doc: Pick<Document, "querySelectorAll"> | null = typeof document === "undefined" ? null : document): BusyState {
  let hard = scene === "hunt" || scene === "minigame";
  let soft = false;
  for (const k of entries.values()) {
    if (k === "hard") hard = true;
    else soft = true;
  }
  if (!soft && doc && hasUnsavedInput(doc)) soft = true;
  return { hard, soft };
}

/** 등록된 것 모두 지우기 (테스트용) */
export function clearBusy(): void {
  entries.clear();
}

const TEXT_INPUTS = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="tel"]';

/**
 * 따로 등록하지 않은 창도 지키기 위한 보조 판정: 화면에 사용자가 바꾼 글자 입력칸이 있는지.
 * React가 처음 넣어 준 값(defaultValue)과 다르고 비어 있지 않으면 "아직 저장 안 한 입력"으로 본다.
 */
export function hasUnsavedInput(doc: Pick<Document, "querySelectorAll">): boolean {
  const list = doc.querySelectorAll(TEXT_INPUTS) as ArrayLike<HTMLInputElement | HTMLTextAreaElement>;
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.disabled || el.readOnly) continue;
    if (el.value.trim() !== "" && el.value !== el.defaultValue) return true;
  }
  return false;
}

/** 컴포넌트가 떠 있는 동안(on) 등록한다 */
export function useBusy(key: string, on: boolean, kind: BusyKind = "hard"): void {
  useEffect(() => {
    setBusy(key, on, kind);
    return () => setBusy(key, false);
  }, [key, on, kind]);
}
