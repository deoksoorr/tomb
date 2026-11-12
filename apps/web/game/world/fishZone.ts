import { FISH_ARCH, FISH_PIER_HEAD, FISHING_ZONE } from "@tomb/protocol";

// 낚시터 (호수 북동쪽 물가, 나루터 동쪽) 장식 배치 — 순수 데이터 (Phaser 없음 → world.test.ts가 충돌·길을 검사한다).
// 그림은 forage/zoneArt.ts + forage/FishZoneView.ts, 판자·자리 좌표 원본은 protocol world.ts(FISH_PIER·FISH_PIER_HEAD·FISHING_SPOTS).
// 충돌은 layout.staticColliders()에 들어가 걷기 격자·고양이 길찾기·새로고침 복원 판정이 모두 같은 상자를 본다.

export type FishDecorKind = "arch" | "netRack" | "traps" | "crates" | "barrel" | "lanternPost";
export type FishDecor = { kind: FishDecorKind; x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

/** 장식 (x,y = 받침 가운데, 그림 맨 아래 줄) */
export const FISH_DECOR: readonly FishDecor[] = [
  // 입구 아치: 데크 북쪽 끝에 "낚시터" 현판 + 양쪽 기둥에 등불
  { kind: "arch", x: FISH_ARCH.x, y: FISH_ARCH.y },
  // 어부 노점 마당: 그물 말리는 대, 통발 더미 (서쪽) · 물고기 상자, 물통 (동쪽, 어부 노점 옆)
  { kind: "netRack", x: 1292, y: 800 },
  { kind: "traps", x: 1284, y: 816 },
  { kind: "crates", x: 1396, y: 826 },
  { kind: "barrel", x: 1398, y: 792 },
  // 가로 데크 양 끝 등불 기둥 (난간 위)
  { kind: "lanternPost", x: FISH_PIER_HEAD.x + 2, y: FISH_PIER_HEAD.y + 1 },
  { kind: "lanternPost", x: FISH_PIER_HEAD.x + FISH_PIER_HEAD.w - 2, y: FISH_PIER_HEAD.y + 1 },
];

/** 아치 기둥 사이 폭 (데크 폭 + 양쪽 기둥) */
export const FISH_ARCH_W = 44;
export const FISH_ARCH_H = 40;

/** 장식 하나의 충돌 상자 (없으면 null). 데크 끝 등불 기둥은 난간 위에 서 있어 난간이 대신 막는다 */
export function fishDecorCollider(d: FishDecor): Box | null {
  switch (d.kind) {
    case "arch":
      return null; // 기둥 둘은 fishZoneColliders()에서 따로
    case "netRack":
      return { x: d.x - 11, y: d.y - 4, w: 22, h: 4 };
    case "traps":
      return { x: d.x - 7, y: d.y - 4, w: 14, h: 4 };
    case "crates":
      return { x: d.x - 8, y: d.y - 4, w: 16, h: 4 };
    case "barrel":
      return { x: d.x - 5, y: d.y - 4, w: 10, h: 4 };
    case "lanternPost":
      return null;
  }
}

/** 낚시터 장식 충돌 전부 (아치 기둥 둘 + 장식 받침) */
export function fishZoneColliders(): Box[] {
  const out: Box[] = [];
  for (const d of FISH_DECOR) {
    if (d.kind === "arch") {
      const half = FISH_ARCH_W / 2;
      out.push({ x: d.x - half, y: d.y - 5, w: 6, h: 5 }, { x: d.x + half - 6, y: d.y - 5, w: 6, h: 5 });
      continue;
    }
    const c = fishDecorCollider(d);
    if (c) out.push(c);
  }
  return out;
}

/** 밤 등불 (WorldMap.staticLights에 더한다): 아치 양쪽 등, 가로 데크 양 끝 등불 기둥 */
export const FISH_ZONE_LIGHTS: readonly { x: number; y: number; scale: number; tint: number; base: number }[] = [
  ...[-1, 1].map((s) => ({ x: FISH_ARCH.x + s * (FISH_ARCH_W / 2 - 3), y: FISH_ARCH.y - 26, scale: 0.6, tint: 0xffc070, base: 0.85 })),
  ...FISH_DECOR.filter((d) => d.kind === "lanternPost").map((d) => ({ x: d.x, y: d.y - 18, scale: 0.7, tint: 0xffc070, base: 0.85 })),
];

/** 낚시터 사각형 안인지 (pad만큼 넓혀 본다) — 흩뿌리는 나무가 낚시터를 덮지 않게 */
export function inFishZone(x: number, y: number, pad = 0): boolean {
  const z = FISHING_ZONE;
  return x >= z.x - pad && x <= z.x + z.w + pad && y >= z.y - pad && y <= z.y + z.h + pad;
}
