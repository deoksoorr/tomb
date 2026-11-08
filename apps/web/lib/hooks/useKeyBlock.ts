"use client";

import { useEffect } from "react";
import { bridge } from "@/game/bridge";

// 게임 키보드 입력 차단(ui:blockKeys) 판단을 한곳에서 한다:
// 모달·메뉴가 하나라도 떠 있거나, 입력칸에 포커스가 있으면 막는다 (WASD를 타이핑해도 캐릭터가 움직이지 않게).

const layers = new Set<symbol>();
let lastBlocked: boolean | null = null;

function isFormField(el: Element | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"));
}

function sync() {
  const blocked = layers.size > 0 || isFormField(document.activeElement);
  if (blocked === lastBlocked) return;
  lastBlocked = blocked;
  bridge.emit("ui:blockKeys", { blocked });
}

/** 모달·메뉴가 떠 있는 동안 게임 키 입력을 막는다 */
export function useBlockingLayer(active = true): void {
  useEffect(() => {
    if (!active) return;
    const key = Symbol();
    layers.add(key);
    sync();
    return () => {
      layers.delete(key);
      sync();
    };
  }, [active]);
}

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyE",
  "KeyX",
  "KeyC",
]);

/**
 * 게임 화면 전체에 한 번 건다.
 * - 입력칸 포커스를 따라 ui:blockKeys를 갱신한다.
 * - 오버레이 버튼을 마우스로 누른 뒤 포커스가 남아 있으면 Space(상호작용)가 그 버튼을 다시 누르게 된다.
 *   그래서 게임 키를 누르면 버튼 포커스를 놓아 키가 게임으로만 가게 한다. 키보드 사용자는 Tab + Enter로 버튼을 쓴다.
 */
export function useGameKeyboardGuard(): void {
  useEffect(() => {
    lastBlocked = null;
    sync();
    const onFocusOut = () => setTimeout(sync, 0);
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || !el.matches("button, a[href]") || el.closest("dialog")) return;
      if (GAME_KEYS.has(e.code)) el.blur();
    };
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}
