import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../config";

// 카메라 줌·경계 계산 (순수).

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

export function snapZoom(z: number): number {
  return clampZoom(Math.round(z / ZOOM_STEP) * ZOOM_STEP);
}

/**
 * 11/16 이 화면에서 맵 밖(빈 곳)이 안 보이는 가장 작은 줌 (사용자: 32인치 모니터에서 가장 멀리 보면 양옆이 비어요).
 * 전체 최소 줌보다 작아지지는 않아요. 화면이 맵보다 아주 크면 이 값이 커져서 덜 멀리 보여요
 */
export function fitMinZoom(viewW: number, viewH: number, mapW: number, mapH: number): number {
  if (!(viewW > 0 && viewH > 0 && mapW > 0 && mapH > 0)) return ZOOM_MIN;
  return Math.max(ZOOM_MIN, viewW / mapW, viewH / mapH);
}

/** 휠·버튼 한 칸: 현재 목표에서 0.5 단계 이동 */
export function stepZoom(target: number, delta: number): number {
  if (!delta) return snapZoom(target);
  return clampZoom(snapZoom(target) + Math.sign(delta) * ZOOM_STEP);
}

/** 핀치: 시작 줌 × 손가락 거리 비율 (단계 없이 연속) */
export function pinchZoom(startZoom: number, startDist: number, dist: number): number {
  if (startDist <= 0) return clampZoom(startZoom);
  return clampZoom((startZoom * dist) / startDist);
}

/** 지수 감쇠로 목표에 다가간다 (프레임레이트와 무관한 부드러운 tween) */
export function approach(cur: number, target: number, dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return target;
  return target + (cur - target) * Math.exp(-Math.max(0, dtMs) / tauMs);
}

/**
 * 카메라 경계. 화면(월드 단위)이 맵보다 넓거나 길면 맵이 가운데 오도록 경계를 넓힌다.
 * (Phaser는 경계가 화면보다 작으면 왼쪽/위에 붙여 버린다)
 */
export function cameraBounds(viewW: number, viewH: number, mapW: number, mapH: number) {
  const x = viewW > mapW ? (mapW - viewW) / 2 : 0;
  const w = Math.max(mapW, viewW);
  const y = viewH > mapH ? (mapH - viewH) / 2 : 0;
  const h = Math.max(mapH, viewH);
  return { x, y, w, h };
}

/** 저장된 줌이 없을 때: 짧은 변이 500px 미만인 작은 화면(휴대폰)은 2.5로 조금 넓게 본다 */
export function defaultZoom(width: number, height: number): number {
  return Math.min(width, height) < 500 ? 2.5 : ZOOM_DEFAULT;
}

/** localStorage 값 → 줌 (없거나 이상하면 기본값) */
export function parseStoredZoom(raw: string | null): number {
  if (raw == null) return ZOOM_DEFAULT;
  const z = Number(raw);
  return Number.isFinite(z) ? snapZoom(z) : ZOOM_DEFAULT;
}
