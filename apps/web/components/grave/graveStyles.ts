import { GRAVE_STYLES, graveTier, isFreeStyle, itemById, styleItemId, type GraveTier } from "@tomb/protocol";

// 묘비 디자인 고르기: 무료 디자인 + 가방의 디자인권(유료). 디자인권은 그 디자인으로 저장할 때 1개 쓰인다.

export const DEFAULT_STYLE = "auto";

export type StyleChoice = {
  id: string;
  name: string;
  free: boolean;
  /** 가방에 있는 디자인권 수 (무료는 0) */
  owned: number;
  /** 디자인권 가격 (무료는 null) */
  price: number | null;
  /** 고를 수 없음: 유료인데 디자인권이 없고, 지금 묘비의 디자인도 아님 */
  locked: boolean;
};

/** current: 고치는 묘비의 지금 디자인 (이미 적용된 유료 디자인은 디자인권 없이도 그대로 둘 수 있다) */
export function styleChoices(inventory: Readonly<Record<string, number>>, current?: string): StyleChoice[] {
  return GRAVE_STYLES.map((s) => {
    const itemId = styleItemId(s.id);
    const owned = itemId ? (inventory[itemId] ?? 0) : 0;
    return {
      id: s.id,
      name: s.name,
      free: s.free,
      owned,
      price: itemId ? (itemById(itemId)?.price ?? null) : null,
      locked: !s.free && owned === 0 && s.id !== current,
    };
  });
}

/** 이 디자인으로 저장하면 디자인권이 1개 쓰이는지 */
export function spendsTicket(style: string, current?: string): boolean {
  return !isFreeStyle(style) && style !== (current ?? DEFAULT_STYLE);
}

export function styleName(id: string | undefined): string {
  return GRAVE_STYLES.find((s) => s.id === (id ?? DEFAULT_STYLE))?.name ?? "묘비";
}

/** 지금 있는 픽셀 그림으로 그릴 수 있는 모양 */
export type ArtShape = GraveTier | "cross";

const SHAPES: Partial<Record<string, ArtShape>> = {
  wood: "woodSign",
  stone: "smallStone",
  tall: "largeStone",
  cross: "cross",
  pagoda: "pagoda",
};

/** 디자인 → 그릴 모양. "auto"는 생존 기간 규칙, 유료 디자인은 null (게임 쪽 미리보기가 들어올 때까지 이름 칩으로) */
export function styleShape(style: string | undefined, ageDays: number): ArtShape | null {
  if (!style || style === DEFAULT_STYLE) return graveTier(ageDays);
  return SHAPES[style] ?? null;
}
