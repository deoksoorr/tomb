// 11/16 마을 쪽 바닷가행 버스 정류장 (옛 묘역 아래 강가 띠, 예전 서쪽 모닥불 fireW 자리) — 순수 데이터 (Phaser 없음 → world.test가 충돌·길을 검사한다).
// 묘역 철책(y 544)과 강 사이 띠에 승강장(판석·점자 블록·연석) 위 정류장 지붕·벤치 bU·노선 팻말 「달물결 포구행」·시간표,
// 그 아래 강가 길 바닥에 버스 정차 칸. 버스는 맵 왼쪽 끝(서쪽 담 밖)에서 들어와 오른쪽을 보고 서요 (BusArrival fromLeft).
// 정류장 앞 어디서든 E → 바닷가 버스 (운영에서 닫혀 있으면 안내만). 캠핑장행은 버스 정류장 마당(fishZone.ts) 그대로예요.
// 그림은 forage/FishZoneView(+ zoneArt seaShelter·seaSign), 충돌은 layout.staticColliders()에 들어가요.

type Box = { x: number; y: number; w: number; h: number };

/** 정류장 지붕 (받침 가운데 — 벤치 bU가 지붕 아래, 강가 길을 바라봐요) */
export const SEA_STOP = { x: 108, y: 600 } as const;
/** 지붕 크기 (버스 정류장 마당 지붕과 같아요) */
export const SEA_STOP_SHELTER_W = 64;
export const SEA_STOP_SHELTER_H = 50;
/** 노선 팻말 「달물결 포구행」 (승강장 오른쪽 끝 — 오른쪽을 보는 버스 앞머리 앞) · 시간표 (왼쪽 끝) */
export const SEA_STOP_SIGN = { x: 168, y: 618 } as const;
export const SEA_STOP_TIMETABLE = { x: 54, y: 610 } as const;
/** 승강장 (버스 정류장 마당 승강장과 같은 크기 — 같은 그림을 써요). 바닥 장식, 막지 않아요 */
export const SEA_STOP_PLATFORM = { x: 38, y: 576, w: 146, h: 52 } as const;
/** 정류장 E 범위 */
export const SEA_STOP_E_RADIUS = 56;
/** 버스는 맵 왼쪽 끝에서 들어와 오른쪽을 보고 서요 */
export const SEA_STOP_FROM_LEFT = true;
/**
 * 버스 문이 서는 x: 지붕 오른쪽 끝 조금 안쪽 (오른쪽을 보는 버스는 문이 앞머리 쪽 — 몸은 문 기준 서쪽 89 · 동쪽 19px).
 * 몸 41~149: 서쪽 담(32) 안, 강 건너는 다리(x 164~)와 겹치지 않아요
 */
export const SEA_STOP_DOOR_X = 130;
/** 강가 길 바닥의 버스 정차 칸 (버스 몸에 맞춰요 — 바닥 장식) */
export const SEA_STOP_BAY = { x: SEA_STOP_DOOR_X - 89, y: 632, w: 112, h: 24 } as const;
/** 버스 바퀴가 닿는 줄 (BusArrival laneY) */
export const SEA_STOP_LANE_Y = SEA_STOP_BAY.y + SEA_STOP_BAY.h - 2;
/** 버스 문 앞 (타는 자리) */
export const SEA_STOP_DOOR = { x: SEA_STOP_DOOR_X, y: SEA_STOP_BAY.y - 2 } as const;
/** 버스에서 내려 서는 자리 (지붕 앞 승강장) */
export const SEA_STOP_LAND = { x: SEA_STOP.x, y: SEA_STOP.y + 16 } as const;

/** 정류장 충돌: 지붕 뒷벽·앞 기둥 둘 (가운데 벤치 자리는 비워요) + 팻말·시간표 받침 */
export function seaStopColliders(): Box[] {
  const s = SEA_STOP;
  const half = SEA_STOP_SHELTER_W / 2;
  return [
    { x: s.x - half + 2, y: s.y - 22, w: SEA_STOP_SHELTER_W - 4, h: 4 },
    { x: s.x - half + 2, y: s.y - 5, w: 4, h: 5 },
    { x: s.x + half - 6, y: s.y - 5, w: 4, h: 5 },
    { x: SEA_STOP_SIGN.x - 2, y: SEA_STOP_SIGN.y - 4, w: 4, h: 4 },
    { x: SEA_STOP_TIMETABLE.x - 6, y: SEA_STOP_TIMETABLE.y - 4, w: 12, h: 4 },
  ];
}

/** 밤 등불 (WorldMap.staticLights에 더해요): 지붕 등·시간표 불빛 */
export const SEA_STOP_LIGHTS: readonly { x: number; y: number; scale: number; tint: number; base: number }[] = [
  { x: SEA_STOP.x, y: SEA_STOP.y - SEA_STOP_SHELTER_H + 12, scale: 0.85, tint: 0xe8f4ff, base: 0.85 },
  { x: SEA_STOP_TIMETABLE.x, y: SEA_STOP_TIMETABLE.y - 18, scale: 0.4, tint: 0xd8f0ff, base: 0.6 },
];

/** 흩뿌리는 나무가 정류장·버스 길을 막지 않게 비워 두는 곳 (승강장 + 정차 칸 + 버스가 들어오는 서쪽 길) */
export const SEA_STOP_AREA = { x: 32, y: 548, w: 160, h: 112 } as const;
export function inSeaStop(x: number, y: number, pad = 0): boolean {
  const z = SEA_STOP_AREA;
  return x >= z.x - pad && x <= z.x + z.w + pad && y >= z.y - pad && y <= z.y + z.h + pad;
}
