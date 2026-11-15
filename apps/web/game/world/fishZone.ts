import { LAKE_PIER, WHARF_YARD } from "@tomb/protocol";

// 버스 정류장 마당 (11/15, 없앤 11·12번지 자리) + 호수 잔교의 어부 노점 장식 배치 — 순수 데이터 (Phaser 없음 → world.test.ts가 충돌·길을 검사한다).
//  - 마당: 의뢰 게시판(E → 수집 의뢰판) + 옆의 긴급 의뢰 현판(서버 전체 진행 막대)
//    + 주말 버스 정류장 (포장한 승강장·연석 위에 정류장 지붕·벤치 bE·노선 팻말 「언젠가 캠핑장행」·시간표, 골목 바닥 정차 칸.
//      정류장 앞 어디서든 E → 캠핑장 버스 (운영에서 닫혀 있으면 안내만))
//  - 11/15 사용자 요청으로 납품 부두(아래 마당·입구 아치·낚시 잔교·끝 데크·부두 낚시 자리)를 없앴다.
//    어부 영감 노점은 호수 낚시 잔교 서쪽 끝(호박밭 옆)으로 — 노점 옆에 물고기 상자·물통 (어부 영감 자리는 lib/forage/catalog NPCS)
// 그림은 forage/zoneArt.ts + forage/FishZoneView.ts, 낚시 자리 좌표 원본은 protocol world.ts(FISHING_SPOTS).
// 충돌은 layout.staticColliders()에 들어가 걷기 격자·고양이 길찾기·새로고침 복원 판정이 모두 같은 상자를 본다.

export type FishDecorKind = "crates" | "barrel" | "questBoard" | "placard" | "busShelter" | "busSign" | "timetable";
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
/** 노선 팻말 (승강장 오른쪽 끝 — 버스 앞머리 앞) · 시간표 (승강장 왼쪽 끝) */
export const BUS_SIGN = { x: 1378, y: 742 } as const;
/** 노선 팻말 그림 폭 (forage/zoneArt busSign) */
export const BUS_SIGN_W = 18;
export const BUS_SIGN_H = 44;
export const BUS_TIMETABLE = { x: 1270, y: 734 } as const;
export const BUS_TIMETABLE_H = 28;
/**
 * 승강장: 위 마당 오른쪽 아래의 포장한 바닥 (연석은 골목 쪽 아래 변). 지붕·시간표·팻말이 이 위에 선다. 바닥 장식, 막지 않는다
 */
export const BUS_PLATFORM = { x: 1254, y: 700, w: 146, h: 52 } as const;
/** 정류장 E 범위 (승강장 앞 골목·정차 칸·시간표·팻말 앞까지) */
export const BUS_E_RADIUS = 60;
/**
 * 버스는 골목 동쪽(화면 오른쪽 끝)에서 들어와(왼쪽을 보고) 문이 지붕 가운데 앞에 오게 서고, 손님을 내리고 태운 뒤
 * 돌지 않고 그대로 앞(서쪽)으로 떠난다 (11/15 사용자 — game/bus BusArrival fromLeft)
 */
export const BUS_FROM_LEFT = false;
/**
 * 11/15 정류장 가운데 x: 지붕 왼쪽 끝(1298)부터 노선 팻말 오른쪽 끝(1387)까지의 가운데예요.
 * 바닥 정차 칸(노란 칠·BUS 글씨)과 서는 버스가 이 가운데에 맞춰요 (예전엔 칸이 정류장보다 동쪽으로 치우쳤어요)
 */
export const BUS_STOP_MID_X = Math.round((BUS_STOP.x - BUS_SHELTER_W / 2 + BUS_SIGN.x + BUS_SIGN_W / 2) / 2);
/** 왼쪽을 보는 버스의 문에서 몸 가운데까지 (busArt BUS_DOOR_DX — 몸은 문 기준 서쪽 19 · 동쪽 89px) */
const BUS_DOOR_TO_MID = 35;
/**
 * 버스 문이 서는 x: 버스 몸 가운데가 정류장 가운데에 오게 (몸 1289~1397 — 동쪽 담 MAP_WIDTH - WALL_THICKNESS = 1408 안).
 * 문은 지붕 아래 앞이다 (지붕 1298~1362)
 */
export const BUS_DOOR_X = BUS_STOP_MID_X - BUS_DOOR_TO_MID;
/** 골목 바닥의 버스 정차 칸 (노란 칠 — 바닥 장식, 막지 않는다). 정류장 가운데에 맞추고, 버스 몸이 들어가며 담 안에서 끝난다 (1287~1399) */
export const BUS_BAY = { x: BUS_STOP_MID_X - 56, y: 756, w: 112, h: 24 } as const;
/** 버스 바퀴가 닿는 줄 (BusArrival laneY) */
export const BUS_LANE_Y = BUS_BAY.y + BUS_BAY.h - 2;
/** 위 마당 테두리 연석 (자갈 마당이 골목·광장과 갈리는 곳 — 바닥 장식) */
export const WHARF_CURB = WHARF_YARD;

/** 장식 (x,y = 받침 가운데, 그림 맨 아래 줄) */
export const FISH_DECOR: readonly FishDecor[] = [
  // 위 마당: 의뢰 게시판·긴급 의뢰 현판·주말 버스 정류장
  { kind: "questBoard", x: WHARF_BOARD.x, y: WHARF_BOARD.y },
  { kind: "placard", x: WHARF_PLACARD.x, y: WHARF_PLACARD.y },
  { kind: "busShelter", x: BUS_STOP.x, y: BUS_STOP.y },
  { kind: "busSign", x: BUS_SIGN.x, y: BUS_SIGN.y },
  { kind: "timetable", x: BUS_TIMETABLE.x, y: BUS_TIMETABLE.y },
  // 어부 영감 노점 옆 (호수 낚시 잔교 서쪽 끝, 잔교로 가는 흙길 바로 위): 물통 (노점 서쪽) · 물고기 상자 (어부 영감 동쪽)
  { kind: "barrel", x: LAKE_PIER.x - 74, y: LAKE_PIER.y - 4 },
  { kind: "crates", x: LAKE_PIER.x - 8, y: LAKE_PIER.y - 16 },
];

/** 장식 하나의 충돌 상자 (없으면 null) */
export function fishDecorCollider(d: FishDecor): Box | null {
  switch (d.kind) {
    case "crates":
      return { x: d.x - 8, y: d.y - 4, w: 16, h: 4 };
    case "barrel":
      return { x: d.x - 5, y: d.y - 4, w: 10, h: 4 };
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

/** 마당·노점 장식 충돌 전부 (정류장 뒷벽·기둥 + 장식 받침) */
export function fishZoneColliders(): Box[] {
  const out: Box[] = [];
  for (const d of FISH_DECOR) {
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

/** 밤 등불 (WorldMap.staticLights에 더한다): 게시판 등, 버스 정류장 지붕 등·시간표 불빛 (11/15 부두 아치·데크 등불은 부두와 함께 없앴다) */
export const FISH_ZONE_LIGHTS: readonly { x: number; y: number; scale: number; tint: number; base: number }[] = [
  { x: WHARF_BOARD.x, y: WHARF_BOARD.y - WHARF_BOARD_H + 4, scale: 0.6, tint: 0xffc878, base: 0.8 },
  { x: BUS_STOP.x, y: BUS_STOP.y - BUS_SHELTER_H + 12, scale: 0.85, tint: 0xfff0c8, base: 0.85 },
  { x: BUS_TIMETABLE.x, y: BUS_TIMETABLE.y - 18, scale: 0.4, tint: 0xd8f0ff, base: 0.6 },
];

/**
 * 예전 납품 부두 자리 (버스 정류장 마당 + 호수 북동쪽 둑). 흩뿌리는 나무를 계속 비워 둔다 —
 * 부두를 없애도 나무 흩뿌리기 순서가 그대로여야 마을 다른 곳의 나무 자리가 바뀌지 않는다 (예전 FISHING_ZONE과 같은 사각형)
 */
export const OLD_WHARF_AREA = { x: 1144, y: 652, w: 256, h: 260 } as const;
/** 예전 납품 부두 자리 안인지 (pad만큼 넓혀 본다) — 흩뿌리는 나무 비키기 */
export function inFishZone(x: number, y: number, pad = 0): boolean {
  const z = OLD_WHARF_AREA;
  return x >= z.x - pad && x <= z.x + z.w + pad && y >= z.y - pad && y <= z.y + z.h + pad;
}
