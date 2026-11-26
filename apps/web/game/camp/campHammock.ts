import { CAMP_HAMMOCKS, CAMP_HAMMOCK_LIFT, type CampHammock } from "@tomb/protocol";
import { fabricBack, fabricFront, HAMMOCK_H, HAMMOCK_W, hammockRopes, type HammockSkin } from "../sprites/hammockArt";
import { Grid } from "../sprites/pixel";
import type { Rect } from "./campLayout";

// 11/26 캠핑장 해먹 (운영자 「펜션 해먹·간판 입구 해먹에 누울 수 있게, 모션은 새로」): 마을 해먹과 같은 48×30 칸(누운 사람 그림 hammockLieSheet과 1:1)에
// 캠핑장 해먹 색 천(campSun·campMint)과 통나무 기둥을 그린다. 누가 누우면 기둥만 남기고(줄·천·몸은 누운 사람 그림이 흔들리며 그린다 —
// AvatarView 해먹 자세: 천에 휜 몸 · 앞 천이 하체를 덮음 · 좌우 −2..2px 진자 · 숨쉬기). 자리·서버 좌석은 protocol CAMP_HAMMOCKS (qM1~4)

const LOG = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228 } as const;
const OUT = 0x2c2018;

function posts(g: Grid): void {
  g.rect(3, 6, 3, 21, LOG.mid);
  g.vline(3, 6, 26, LOG.hi);
  g.rect(42, 6, 3, 21, LOG.lo);
  g.rect(2, 4, 5, 2, LOG.lo);
  g.rect(41, 4, 5, 2, LOG.lo);
}

/** 해먹 그림 (skin = 천 무늬, null = 기둥만 — 누가 누워 있을 때). 원점 (0.5, 1)을 받침 (x, y + 1)에 놓는다 */
export function campHammockGrid(skin: HammockSkin | null): Grid {
  const g = new Grid(HAMMOCK_W, HAMMOCK_H);
  posts(g);
  g.outline(OUT);
  if (skin) {
    g.draw(hammockRopes(0, 0, skin), 0, 0);
    g.draw(fabricBack(skin), 0, 0);
    g.draw(fabricFront(skin), 0, 0);
  }
  // 바닥 그림자 (기둥 사이 타원)
  for (let y = 26; y <= HAMMOCK_H - 1; y++)
    for (let x = 6; x <= 42; x++) {
      const dx = (x + 0.5 - 24) / 18;
      const dy = (y + 0.5 - 27.5) / 1.6;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x1a1006, 55);
    }
  return g;
}

/** 해먹 기둥 두 개 막기 (가운데는 비워 해먹 앞으로 다가가 눕는다) */
export function campHammockColliders(h: Pick<CampHammock, "x" | "y">): Rect[] {
  return [
    { x: h.x - 21, y: h.y - 3, w: 4, h: 4 },
    { x: h.x + 18, y: h.y - 3, w: 4, h: 4 },
  ];
}

/** 눕는 자리 (앵커 — 서버 좌석 위치) · 해먹에 누운 사람 깊이 */
export const campHammockAnchor = (h: Pick<CampHammock, "x" | "y">) => ({ x: h.x, y: h.y - CAMP_HAMMOCK_LIFT });

/** 맵에 늘 있는 해먹 (14번 터 마당 해먹 qM4는 집 화면이 그 단계에만 그린다) */
export const MAP_HAMMOCKS: readonly CampHammock[] = CAMP_HAMMOCKS.filter((h) => !h.lot);
