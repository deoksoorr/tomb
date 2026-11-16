import { spotSeatId, type SpotKind } from "./world";

// 11/16 사용자 "망원경 갯수를 여기저기 좀 늘렸으면" — 캠핑장·바닷가 망원경 자리 (마을 망원경은 world.ts TELESCOPES).
// 모두 마을 망원경과 같은 1인 자리(좌석 체계): 자리 id = spotSeatId(kind, ax, ay), 서버는 형식과 거리만 본다(camp.ts seatSlotIn) —
// 그래서 서버가 이 목록을 알 필요는 없고, 테스트와 화면(apps/web/game/scopes)이 같은 좌표를 쓰려고 여기 둔다.
//  - 캠핑장: 별 보는 망원경 (kind telescope, 앞자리 = 받침 + 10, 하늘(위)을 본다). 전망대 계단 아래 · 계곡 통나무 다리 동쪽 둑
//    (전망대 데크 위는 망원경 받침·벤치·별지기·캠핑장 주민 자리로 꽉 차서 계단 아래 산책로 옆에)
//  - 바닷가: 동전 넣는 쌍안 망원경 (kind binocular, 앵커 = 망원경 뒤 10px, 바다(아래)를 본다). 밤엔 별자리 잇기, 낮엔 바다 보기
// 바닷가 배치 원본(sea.ts)과 따로 둔다 (바닷가 맵 모듈을 건드리지 않고 덧붙이는 자리).

export type ScopeSpot = {
  /** 화면 상호작용 id */
  id: string;
  kind: Extract<SpotKind, "telescope" | "binocular">;
  /** 받침 가운데 (발 위치) */
  x: number;
  y: number;
  /** 서서 보는 자리 (1인 자리 앵커) */
  ax: number;
  ay: number;
  /** 미니맵·안내 이름 */
  name: string;
};

const telescope = (id: string, x: number, y: number, name: string): ScopeSpot => ({ id, kind: "telescope", x, y, ax: x, ay: y + 10, name });
const binocular = (id: string, x: number, y: number, name: string): ScopeSpot => ({ id, kind: "binocular", x, y, ax: x, ay: y - 10, name });

/** 캠핑장 별 망원경 (전망대 계단 아래 · 계곡 통나무 다리 건너 산책로 옆) */
export const CAMP_SCOPES: readonly ScopeSpot[] = [
  telescope("scope:lookout", 1150, 236, "전망대 별 망원경"),
  telescope("scope:trail", 1124, 330, "계곡 별 망원경"),
];

/**
 * 바닷가 동전 망원경. 11/16 r19 사용자 "바닷가 별자리는 어디서 해? 안 보여" → 눈에 띄는 자리로:
 * 버스에서 내려 백사장으로 내려오는 길목 산책로 · 방파제 들머리 · 선착장 머리 (서쪽 끝 모래 언덕은 너무 외져서 뺐어요)
 */
export const SEA_SCOPES: readonly ScopeSpot[] = [
  binocular("scope:boardwalk", 1628, 341, "산책로 망원경"),
  binocular("scope:breakwater", 1372, 482, "방파제 망원경"),
  binocular("scope:pier", 900, 484, "선착장 망원경"),
];

/** 그 망원경의 1인 자리 id */
export function scopeSeatId(s: ScopeSpot): string {
  return spotSeatId(s.kind, s.ax, s.ay);
}
