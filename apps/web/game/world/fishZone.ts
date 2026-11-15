import { FISH_ARCH, FISH_PIER_HEAD, FISHING_ZONE } from "@tomb/protocol";

// 납품 부두 (11/15, 예전 낚시터 — 호수 북동쪽 물가 + 없앤 11·12번지 자리의 위 마당) 장식 배치 — 순수 데이터 (Phaser 없음 → world.test.ts가 충돌·길을 검사한다).
//  - 위 마당: 의뢰 게시판(E → 수집 의뢰판) + 옆의 빈 현판(나중에 서버 전체 "긴급 의뢰" 진행 막대 자리)
//    + 주말 버스 정류장 (정류장 지붕·벤치 bE·노선 팻말 「언젠가 캠핑장행」·시간표·골목 바닥 정차 칸. E → 아직 준비 중 — 앞으로 캠핑장 버스가 붙을 자리)
//  - 아래 마당: 어부 노점·그물 대·통발·상자·물통, 입구 아치 → 짧은 낚시 잔교
// 그림은 forage/zoneArt.ts + forage/FishZoneView.ts, 판자·자리 좌표 원본은 protocol world.ts(FISH_PIER·FISH_PIER_HEAD·FISHING_SPOTS).
// 충돌은 layout.staticColliders()에 들어가 걷기 격자·고양이 길찾기·새로고침 복원 판정이 모두 같은 상자를 본다.

export type FishDecorKind = "arch" | "netRack" | "traps" | "crates" | "barrel" | "lanternPost" | "questBoard" | "placard" | "busShelter" | "busSign" | "timetable";
export type FishDecor = { kind: FishDecorKind; x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

/** 의뢰 게시판 (받침 가운데). 앞(아래)에서 E → 수집 의뢰판 */
export const WHARF_BOARD = { x: 1186, y: 700 } as const;
export const WHARF_BOARD_W = 56;
export const WHARF_BOARD_H = 48;
/** 게시판 오른쪽 빈 현판 — 나중에 "긴급 의뢰" 진행 막대를 걸 자리 (지금은 비어 있다) */
export const WHARF_PLACARD = { x: 1230, y: 700 } as const;
/** 주말 버스 정류장 지붕 (받침 가운데 — 벤치 bE가 지붕 아래, 골목을 바라본다). 앞에서 E → 상호작용 "bus" */
export const BUS_STOP = { x: 1330, y: 724 } as const;
export const BUS_SHELTER_W = 64;
export const BUS_SHELTER_H = 50;
/** 노선 팻말 (정류장 오른쪽 기둥) · 시간표 (왼쪽) */
export const BUS_SIGN = { x: 1378, y: 730 } as const;
export const BUS_SIGN_H = 44;
export const BUS_TIMETABLE = { x: 1284, y: 728 } as const;
export const BUS_TIMETABLE_H = 28;
/** 골목 바닥의 버스 정차 칸 (노란 칠 — 바닥 장식, 막지 않는다) */
export const BUS_BAY = { x: 1276, y: 756, w: 112, h: 24 } as const;

/** 장식 (x,y = 받침 가운데, 그림 맨 아래 줄) */
export const FISH_DECOR: readonly FishDecor[] = [
  // 위 마당: 의뢰 게시판·긴급 의뢰 현판·주말 버스 정류장
  { kind: "questBoard", x: WHARF_BOARD.x, y: WHARF_BOARD.y },
  { kind: "placard", x: WHARF_PLACARD.x, y: WHARF_PLACARD.y },
  { kind: "busShelter", x: BUS_STOP.x, y: BUS_STOP.y },
  { kind: "busSign", x: BUS_SIGN.x, y: BUS_SIGN.y },
  { kind: "timetable", x: BUS_TIMETABLE.x, y: BUS_TIMETABLE.y },
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
    case "questBoard":
      return { x: d.x - WHARF_BOARD_W / 2 + 2, y: d.y - 6, w: WHARF_BOARD_W - 4, h: 6 };
    case "placard":
      return { x: d.x - 8, y: d.y - 5, w: 16, h: 5 };
    case "busShelter":
      return null; // 뒷벽·기둥은 fishZoneColliders()에서 따로 (가운데 벤치 자리는 비운다)
    case "busSign":
      return { x: d.x - 2, y: d.y - 4, w: 4, h: 4 };
    case "timetable":
      return { x: d.x - 6, y: d.y - 4, w: 12, h: 4 };
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
    if (d.kind === "busShelter") {
      // 뒷벽 (지붕 아래 안쪽) + 앞 기둥 둘
      const half = BUS_SHELTER_W / 2;
      out.push({ x: d.x - half + 2, y: d.y - 22, w: BUS_SHELTER_W - 4, h: 4 }, { x: d.x - half + 2, y: d.y - 5, w: 4, h: 5 }, { x: d.x + half - 6, y: d.y - 5, w: 4, h: 5 });
      continue;
    }
    const c = fishDecorCollider(d);
    if (c) out.push(c);
  }
  return out;
}

/** 밤 등불 (WorldMap.staticLights에 더한다): 아치 양쪽 등, 가로 데크 양 끝 등불 기둥, 게시판 등, 버스 정류장 지붕 등·시간표 불빛 */
export const FISH_ZONE_LIGHTS: readonly { x: number; y: number; scale: number; tint: number; base: number }[] = [
  { x: WHARF_BOARD.x, y: WHARF_BOARD.y - WHARF_BOARD_H + 4, scale: 0.6, tint: 0xffc878, base: 0.8 },
  { x: BUS_STOP.x, y: BUS_STOP.y - BUS_SHELTER_H + 12, scale: 0.85, tint: 0xfff0c8, base: 0.85 },
  { x: BUS_TIMETABLE.x, y: BUS_TIMETABLE.y - 18, scale: 0.4, tint: 0xd8f0ff, base: 0.6 },
  ...[-1, 1].map((s) => ({ x: FISH_ARCH.x + s * (FISH_ARCH_W / 2 - 3), y: FISH_ARCH.y - 26, scale: 0.6, tint: 0xffc070, base: 0.85 })),
  ...FISH_DECOR.filter((d) => d.kind === "lanternPost").map((d) => ({ x: d.x, y: d.y - 18, scale: 0.7, tint: 0xffc070, base: 0.85 })),
];

/** 낚시터 사각형 안인지 (pad만큼 넓혀 본다) — 흩뿌리는 나무가 낚시터를 덮지 않게 */
export function inFishZone(x: number, y: number, pad = 0): boolean {
  const z = FISHING_ZONE;
  return x >= z.x - pad && x <= z.x + z.w + pad && y >= z.y - pad && y <= z.y + z.h + pad;
}
