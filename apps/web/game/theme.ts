import type * as Phaser from "phaser";
import { THEMES, type ThemeId } from "./bridge";
import { addCanvasTexture, TEX } from "./assets/manifest";
import { graveCanvas, graveTexKey, type GraveStyle } from "./sprites/graves";
import { gothic, sakura } from "./sprites/themeArt";

// 묘지 디자인 테마. 레이아웃·충돌은 같고 타일 색·소품·묘비 모양·빛 색·분위기 파티클만 바뀐다.
// 산사(temple) 텍스처는 부팅 때 만들고, 고딕·벚꽃은 처음 고를 때 한 번만 만든다.

export type Ambient = "none" | "petals" | "crows";

export type ThemeDef = {
  id: ThemeId;
  graveStyle: GraveStyle;
  ambient: Ambient;
  /** 석등·가스등·등롱 빛 색 */
  lightTint: number;
};

export const THEME_DEFS: Record<ThemeId, ThemeDef> = {
  temple: { id: "temple", graveStyle: "temple", ambient: "none", lightTint: 0xffc068 },
  gothic: { id: "gothic", graveStyle: "gothic", ambient: "crows", lightTint: 0xe8f0c8 },
  sakura: { id: "sakura", graveStyle: "sakura", ambient: "petals", lightTint: 0xffb498 },
};

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && THEMES.some((t) => t.id === v);
}

/** 테마마다 모양이 바뀌는 소품 텍스처 */
const THEMED = [
  TEX.tree0,
  TEX.tree1,
  TEX.dead0,
  TEX.dead1,
  TEX.lantern,
  TEX.bench2,
  TEX.bench3,
  TEX.chairDown,
  TEX.chairLeft,
  TEX.chairRight,
  TEX.altar,
  TEX.gate,
  TEX.wallFace,
] as const;
type ThemedKey = (typeof THEMED)[number];

export function themedKey(base: string, theme: ThemeId): string {
  return theme === "temple" || !(THEMED as readonly string[]).includes(base) ? base : `${base}@${theme}`;
}

function builders(theme: "gothic" | "sakura"): Record<ThemedKey, () => HTMLCanvasElement> {
  const a = theme === "gothic" ? gothic : sakura;
  return {
    [TEX.tree0]: () => a.tree(0),
    [TEX.tree1]: () => a.tree(1),
    [TEX.dead0]: () => a.dead(0),
    [TEX.dead1]: () => a.dead(1),
    [TEX.lantern]: () => a.lamp(),
    [TEX.bench2]: () => a.bench(40),
    [TEX.bench3]: () => a.bench(56),
    [TEX.chairDown]: () => a.chair("down"),
    [TEX.chairLeft]: () => a.chair("left"),
    [TEX.chairRight]: () => a.chair("right"),
    [TEX.altar]: () => a.altar(),
    [TEX.gate]: () => a.gate(),
    [TEX.wallFace]: () => a.wallFace(),
  } as Record<ThemedKey, () => HTMLCanvasElement>;
}

/** 테마 텍스처 준비 (이미 있으면 아무것도 안 한다). 걸린 시간(ms)을 돌려준다 */
export function installTheme(scene: Phaser.Scene, theme: ThemeId): number {
  if (theme === "temple") return 0;
  const t0 = performance.now();
  const b = builders(theme);
  for (const base of THEMED) {
    const key = themedKey(base, theme);
    if (!scene.textures.exists(key)) addCanvasTexture(scene, key, { canvas: b[base]() });
  }
  const style = THEME_DEFS[theme].graveStyle;
  for (const tier of ["woodSign", "smallStone", "largeStone", "pagoda"] as const)
    for (let v = 0; v < 3; v++) {
      const key = graveTexKey(tier, v, style);
      if (!scene.textures.exists(key)) addCanvasTexture(scene, key, { canvas: graveCanvas(tier, v, style) });
    }
  return performance.now() - t0;
}
