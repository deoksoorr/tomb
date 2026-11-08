import { ZOOM } from "@tomb/protocol";

// 게임 전역 상수. 프로토콜(맵·속도)은 @tomb/protocol, 여기는 렌더링/연출 전용 값만 둔다.

/**
 * 그리기 순서. 월드 오브젝트는 depth = 발밑 y (0..65535)로 정렬하고,
 * 그 위에 톤(곱하기)·어둠 → 빛(가산) → 날씨 → 라벨 순으로 쌓는다.
 */
export const DEPTH = {
  ground: -100_000,
  decal: -50_000,
  /** 월드 y 정렬 구간의 상한 (u16 좌표) */
  worldMax: 0xffff,
  tint: 100_000,
  dark: 100_001,
  lights: 100_100,
  fireflies: 100_150,
  weather: 100_200,
  fog: 100_300,
  vignette: 100_400,
  bubble: 109_000,
  labels: 110_000,
  tooltip: 111_000,
} as const;

export const ZOOM_DEFAULT = ZOOM;
export const ZOOM_MIN = 1.5;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 0.5;
/** localStorage: 마지막 줌 */
export const LS_ZOOM = "tomb.zoom";

/** 라벨 색 (내 라벨은 촛불빛으로 구분) */
export const LABEL_ME = 0xffe39a;
export const LABEL_OTHER = 0xd9dccf;
export const TOOLTIP_NAME = 0xf2ead3;
export const TOOLTIP_EPITAPH = 0xb9b4a4;

/** 묘비 근접 판정 반경 (툴팁·E 상호작용) */
export const GRAVE_NEAR_RADIUS = 26;
/** 이만큼 앉아 있으면 "…" 말풍선 + 반딧불 */
export const SIT_IDLE_MS = 10_000;
/** 카메라 추적 lerp (프레임당) */
export const CAMERA_LERP = 0.12;
/** 카메라가 캐릭터의 발이 아닌 몸 중앙을 보도록 */
export const CAMERA_FOLLOW_OFFSET_Y = 10;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}
