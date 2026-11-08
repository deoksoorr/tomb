import { bridge, THEMES, type ThemeId } from "@/game/bridge";
import { readItem, writeItem } from "@/lib/storage";
import { LS } from "@/lib/types";

export const DEFAULT_THEME: ThemeId = "temple";

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

/** 저장된 묘지 디자인 (없거나 모르는 값이면 기본) */
export function savedTheme(): ThemeId {
  const v = readItem(LS.theme);
  return isThemeId(v) ? v : DEFAULT_THEME;
}

/** 고른 디자인을 기억하고 게임에 알린다 (sticky라 게임이 뜨기 전에 보내도 된다) */
export function chooseTheme(theme: ThemeId): void {
  writeItem(LS.theme, theme);
  bridge.emit("theme:set", { theme });
}
