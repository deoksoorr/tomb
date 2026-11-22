"use client";

import { useEffect } from "react";

/**
 * 11/22 큰 데스크톱 화면(27인치 2560×1440 @1x 등)에서 HTML HUD·창이 1배라 너무 작았다 → 화면 크기만큼 HUD 전체를 CSS zoom으로 키운다.
 *  - 배율 = min(폭/1600, 높이/900)을 0.05 단위로, 1~1.5 사이 (1600×900 이하 1 · 1920×1080 1.2 · 2560×1440 1.5). 터치 화면은 늘 1
 *  - useUiScale(GameShell)이 html[data-uiz]·:root --ui-scale을 붙이고, 게임 캔버스(data-game)를 뺀 .shell 바로 밑 칸마다 zoom을 건다
 *    (GameShell.module.css — 게임 캔버스·게임 확대는 그대로)
 *  - zoom 안의 CSS px = 화면 px ÷ 배율. getBoundingClientRect·clientX·innerWidth(화면 px)를 HUD의 CSS 변수·style로 넣을 땐 toUi()로 나눈다
 *    (ResizeObserver·offsetHeight·scrollHeight는 이미 CSS px라 그대로. 화면 px끼리 비교·비율만 쓰는 곳도 그대로)
 *  - zoom 안에서는 vw·vh도 배율만큼 커진다 → HUD CSS의 vw·vh는 var(--uz)로 나눈다 (--uz는 zoom 칸 안에서만 배율, 밖은 1 — globals.css)
 */

export const UI_BASE_W = 1600;
export const UI_BASE_H = 900;
export const UI_SCALE_MAX = 1.5;

/** 화면(px)·터치 여부 → HUD 배율 */
export function uiScaleFor(w: number, h: number, coarse: boolean): number {
  if (coarse || !(w > 0) || !(h > 0)) return 1;
  const raw = Math.floor(Math.min(w / UI_BASE_W, h / UI_BASE_H) * 20) / 20;
  return Math.min(UI_SCALE_MAX, Math.max(1, raw));
}

let current = 1;

/** 지금 HUD 배율 (zoom이 걸려 있지 않으면 1) */
export const uiScale = (): number => current;

/** 화면 px(getBoundingClientRect·clientX·innerWidth) → HUD 안 CSS px */
export const toUi = (px: number): number => px / current;

/** 배율을 정하고 html[data-uiz]·--ui-scale을 한 번에 붙인다 (측정 코드가 배율과 zoom을 늘 같이 보게 — React 상태를 거치지 않는다) */
function apply(s: number): void {
  const root = document.documentElement;
  current = s;
  if (s > 1) {
    root.style.setProperty("--ui-scale", String(s));
    root.setAttribute("data-uiz", "");
  } else {
    root.style.removeProperty("--ui-scale");
    root.removeAttribute("data-uiz");
  }
}

/** GameShell: 게임 화면이 떠 있는 동안 창 크기에 맞춰 HUD 배율을 정한다 (터치 화면은 1) */
export function useUiScale(coarse: boolean): void {
  useEffect(() => {
    const fit = () => {
      const s = uiScaleFor(window.innerWidth, window.innerHeight, coarse);
      if (s !== current || (s > 1) !== document.documentElement.hasAttribute("data-uiz")) apply(s);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      apply(1);
    };
  }, [coarse]);
}
