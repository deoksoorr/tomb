import type { Placed } from "@/lib/housing/types";

// 하우징 bridge 이벤트 payload (bridge.ts의 "하우징" 구역이 쓴다)

export type HouseEditState = {
  editing: boolean;
  items: Placed[];
  floor: string;
  wall: string;
  /** 고른 물건의 배치 id (없으면 null) */
  selected: string | null;
  /** 마지막 저장 이후 바뀌었는지 */
  dirty: boolean;
};

export type HouseTool =
  | { action: "place"; itemId: string }
  | { action: "rotate" }
  | { action: "remove" }
  | { action: "deselect" }
  | { action: "nudge"; dx: number; dy: number }
  | { action: "skin"; floor?: string; wall?: string };
