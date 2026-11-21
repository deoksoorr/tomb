import type { SeasonKind } from "@/lib/seasonShop/schedule";
import type { Interactable, Rect } from "./layout";

// 11/19 기간 한정 노점 배치 (순수 — layout.ts가 충돌·상호작용·미니맵에 더하고, 그림·이름표·밤 빛·몸 충돌은 SeasonStallView가 놓는다).
//  - 「계절 보따리상」 (기간 한정 코디, kind cos): 북쪽 길 위 풀밭(행운권 가판대와 사냥터 오솔길 사이), 노점 (796,168) + 왼쪽에 보따리상 (753,166)
//  - 「가구 보따리상」 (기간 한정 가구, kind furn): 버스 정류장 마당 예전 의뢰 게시판 자리, 손수레 (1190,700) + 왼쪽에 목수 유령 (1152,698)
//  11/21 계절 보따리상은 예전 가구 보따리상 자리로 (보따리상 몸통 왼쪽 끝은 예전 목수 유령과 같은 746), 가구 보따리상은 정류장 마당으로 (광장 자리는 비움)
//  원점 = 바닥 가운데. 판매 창은 components/seasonShop (portal:open seasonCos · seasonFurn)

export type Pt = { readonly x: number; readonly y: number };

/** 노점 하나 */
export type StallSite = {
  kind: SeasonKind;
  /** 노점 그림 (52×48) · 주인 NPC 그림 (30×32) 원점 */
  stall: Pt;
  npc: Pt;
  /**
   * 충돌: 노점 몸통 (매대·수레 아랫단까지 — 뒤로 숨어들지 않게 깊이만큼)과 NPC 몸통.
   * NPC 상자는 몸통만 (가구 보따리상 의자 다리 왼쪽은 행운권 가는 흙길 가장자리와 3px라 비운다)
   */
  colliders: readonly Rect[];
  /** E 안내 */
  label: string;
};

export const SEASON_STALL = { x: 796, y: 168 } as const;
export const SEASON_PEDDLER = { x: 753, y: 166 } as const;
export const FURN_STALL = { x: 1190, y: 700 } as const;
export const FURN_CRAFTER = { x: 1152, y: 698 } as const;

export const STALL_SITES: readonly StallSite[] = [
  {
    kind: "cos",
    stall: SEASON_STALL,
    npc: SEASON_PEDDLER,
    colliders: [
      { x: SEASON_STALL.x - 22, y: SEASON_STALL.y - 13, w: 46, h: 10 },
      { x: SEASON_PEDDLER.x - 7, y: SEASON_PEDDLER.y - 6, w: 14, h: 6 },
    ],
    label: "계절 보따리상 둘러보기",
  },
  {
    kind: "furn",
    stall: FURN_STALL,
    npc: FURN_CRAFTER,
    colliders: [
      // 손수레 (거울 ~ 화분, 바퀴 줄까지)
      { x: FURN_STALL.x - 24, y: FURN_STALL.y - 12, w: 48, h: 10 },
      // 목수 유령 몸통 (의자 다리 왼쪽은 비운다)
      { x: FURN_CRAFTER.x - 5, y: FURN_CRAFTER.y - 6, w: 12, h: 6 },
    ],
    label: "가구 보따리상 둘러보기",
  },
];

export const stallSite = (kind: SeasonKind): StallSite => STALL_SITES.find((s) => s.kind === kind)!;

export function seasonStallColliders(): Rect[] {
  return STALL_SITES.flatMap((s) => s.colliders.map((r) => ({ ...r })));
}

/** E·[상호작용]: NPC 앞, 노점 앞 (둘 다 같은 창) */
export function seasonStallInteractables(): Interactable[] {
  return STALL_SITES.flatMap((s): Interactable[] => {
    const portal = s.kind === "cos" ? "seasonCos" : "seasonFurn";
    const npc = { x: s.npc.x, y: s.npc.y + 12 };
    const stall = { x: s.stall.x, y: s.stall.y + 10 };
    return [
      { id: `portal:${portal}`, kind: "portal", portal, x: npc.x, y: npc.y, r: 18, ax: npc.x, ay: npc.y, label: s.label },
      { id: `portal:${portal}2`, kind: "portal", portal, x: stall.x, y: stall.y, r: 20, ax: stall.x, ay: stall.y, label: s.label },
    ];
  });
}

/**
 * 돌아다니는 주민(칼돌이 등)이 쉬거나 들르는 점으로 고르지 않을 자리: 노점·NPC 그림 둘레 (그림 위에 겹쳐 서 있지 않게).
 * 지나가는 길은 막지 않는다 (몸 충돌은 colliders)
 */
export function nearStall(x: number, y: number): boolean {
  for (const s of STALL_SITES) {
    if (x > s.stall.x - 34 && x < s.stall.x + 34 && y > s.stall.y - 52 && y < s.stall.y + 14) return true;
    if (x > s.npc.x - 22 && x < s.npc.x + 22 && y > s.npc.y - 36 && y < s.npc.y + 14) return true;
  }
  return false;
}
