import type { Placed } from "@/lib/housing/types";

// 하우징 bridge 이벤트 payload (bridge.ts의 "하우징" 구역이 쓴다)

export type HouseEditState = {
  editing: boolean;
  items: Placed[];
  floor: string;
  wall: string;
  /** 고른 물건의 배치 id (없으면 null) */
  selected: string | null;
  /** 마지막 저장 이후 바뀌었는지 (놓아 보는 물건은 빼고 본다) */
  dirty: boolean;
  /** 상점에서 "놓아 보기"로 얹어 본 물건 (items에는 없다: 저장·점수에서 빠진다) */
  trial: { u: string; itemId: string } | null;
};

export type HouseTool =
  | { action: "place"; itemId: string }
  /** 상점 "놓아 보기": 사지 않고 반투명으로 얹어 본다 */
  | { action: "try"; itemId: string }
  /** 놓아 보기 끝: keep이면 진짜 물건으로 (산 뒤·가방에 남은 게 있을 때), 아니면 치운다 */
  | { action: "tryEnd"; keep: boolean }
  | { action: "rotate" }
  | { action: "remove" }
  | { action: "deselect" }
  | { action: "nudge"; dx: number; dy: number }
  | { action: "skin"; floor?: string; wall?: string };
