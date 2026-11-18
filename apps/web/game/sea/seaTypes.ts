import type * as Phaser from "phaser";
import type { ReachZone } from "../logic/reach";

// 11/16 달물결 포구 (game/sea) 모듈 사이 약속. 맵 그림·충돌·물때 그림(SeaMap) ↔ 장면(SeaScene) ↔ 버스(game/bus·camp/CampTrip).
// 바닷가 그림(텍스처)은 정류장 근처·버스 여행 동안 seaPrebake가 조금씩 굽고, 장면을 닫아도 남겨 둬요 (다시 갈 때 멈추지 않게).
// 바닷가 텍스처 키는 모두 SEA_TEX_PREFIX로 시작해요.

export const SEA_TEX_PREFIX = "sea-";

/** E로 쓰는 것 (자리 앉기는 좌석 체계 — SEA_SEATS — 가 따로). 다음 차수에 쉴거리·캐기·등대가 여기 붙어요 */
export type SeaInteractKind = "bus" | "sign" | "lot" | "realty" | "kiosk" | "vending" | "snackVend" | "lighthouse" | "keeper";
export type SeaInteractable = {
  id: string;
  kind: SeaInteractKind;
  /** 상호작용 판정 중심 (발 위치 기준) */
  x: number;
  y: number;
  /** 판정 반지름 */
  r: number;
  /** 11/18 바닥 영역 (있으면 반지름 대신 이 상자 안이 닿는 곳 — 버스 정차 칸, game/logic/reach) */
  zone?: ReachZone;
  /** 화면 안내 ("E 버스 타기") */
  label: string;
  /** 오두막 터 번호 (1~6) */
  lot?: number;
};

/** 밤 빛 (Atmosphere.setStaticLights에 그대로 넘긴다 — CampLight와 같은 모양) */
export type SeaLight = { x: number; y: number; scale: number; tint: number; base: number };

/** 매 프레임 SeaMap.update에 넘기는 시간·날씨·물때 */
export type SeaTime = {
  /** 한국 시각 0~24 (ambienceAt().kstHour — ?time= 덮어쓰기 반영) */
  hour: number;
  /** 0 낮 ~ 1 한밤 (Atmosphere.levels.darkness) */
  darkness: number;
  /** 비 0..1 */
  rain: number;
  /** 안개 0..1 */
  fog: number;
  /** 물 높이 0 간조 ~ 1 만조 (protocol tideLevel, 디버그 물때 덮어쓰기 반영) */
  tide: number;
  /** 물 높이가 오르는 중이면 1, 내리는 중이면 -1 (젖은 모래 마르기·물거품 방향) */
  trend: -1 | 1;
  /** 11/16 저녁 무게 0..1 (seaTone duskWeight) — 노을 물빛·금빛 물결 길 */
  dusk: number;
  /** 근처 사람들 발 위치 (나 + 같은 맵 사람) — 갈매기가 가까이 오면 날아올라요 */
  actors: readonly { x: number; y: number }[];
};

/** SeaMap이 장면에 주는 것 (구현: game/sea/SeaMap.ts) */
export interface SeaMapApi {
  readonly width: number;
  readonly height: number;
  /** 막히는 것 (건물·울타리·바위·난간·먼바다·뒤 언덕·나무). 점프로도 못 넘어요 */
  readonly colliders: Phaser.Physics.Arcade.StaticGroup;
  /** 의자·벤치 (점프 중엔 넘어요) */
  readonly furnitureColliders: Phaser.Physics.Arcade.StaticGroup;
  readonly interactables: readonly SeaInteractable[];
  /** 밤 빛 (정류장·시장·부동산 창·매점·등대·가로등) */
  readonly staticLights: readonly SeaLight[];
  /** 맵을 조금씩 만들어요 (버스 창밖 연출 아래에서 프레임마다 — 다 돌아야 맵이 다 서요) */
  parts(): Generator<void, void>;
  /** 걸을 수 있는 칸인지 (새로고침 자리·친구 옆 자리 판정). 건물·바위·먼바다·맵 밖이면 false. 갯벌은 물때와 상관없이 true */
  standable(x: number, y: number): boolean;
  /** 매 프레임: 화면 근처 컬링, 물가 선·물거품·젖은 모래·물웅덩이·배와 부표 흔들림·파도·물보라·갈매기·밤 불빛 */
  update(time: number, delta: number, view: Phaser.Geom.Rectangle, t: SeaTime): void;
  /** 좌석 점유가 바뀌면 */
  setSeatTaken(seatId: string, taken: boolean): void;
  /** 모든 오브젝트 정리 (sea- 텍스처는 남겨요) */
  destroy(): void;
}
