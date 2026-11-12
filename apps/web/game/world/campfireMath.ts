import { CAMPFIRES, type Campfire } from "@tomb/protocol";
import { ZOOM_MAX } from "../config";

// 모닥불 불멍의 순수 계산 (소리 크기·구도·레터박스). Phaser 없이 테스트한다.

/** 이 거리(월드 px) 밖이면 모닥불 소리가 안 들린다 */
export const CAMPFIRE_HEAR_PX = 240;
/** 근처를 지날 때 최대 크기 (앉으면 1) */
export const CAMPFIRE_NEAR_MAX = 0.45;
/** 불멍 줌 범위 */
export const CINE_ZOOM_MIN = 4;
export const CINE_ZOOM_MAX = Math.min(5, ZOOM_MAX);
/** 레터박스 한 줄 높이 (화면 높이 비율) */
export const LETTERBOX = 0.11;
/** 레터박스·온기 오버레이가 들어오고 나가는 시간 */
export const CINE_FADE_MS = 400;

/** 가장 가까운 모닥불과 거리 */
export function nearestCampfire(x: number, y: number, fires: readonly Campfire[] = CAMPFIRES): { fire: Campfire; dist: number } | null {
  let best: Campfire | null = null;
  let bd = Infinity;
  for (const f of fires) {
    const d = Math.hypot(f.x - x, f.y - y);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best ? { fire: best, dist: bd } : null;
}

/** 모닥불 소리 크기 0..1: 앉아 있으면 1, 아니면 거리에 따라 부드럽게 (가까울수록 크게, 최대 CAMPFIRE_NEAR_MAX) */
export function campfireLevel(dist: number, seated: boolean): number {
  if (seated) return 1;
  if (!Number.isFinite(dist) || dist >= CAMPFIRE_HEAR_PX) return 0;
  const t = 1 - Math.max(0, dist - 24) / (CAMPFIRE_HEAR_PX - 24);
  // smoothstep: 멀리서는 천천히 커지고 가까이선 평평하게
  const s = Math.max(0, Math.min(1, t));
  return CAMPFIRE_NEAR_MAX * s * s * (3 - 2 * s);
}

/** 큰 모닥불(광장) 불멍 줌 하한: 둘러앉은 자리가 넓어서 좁은 화면에서도 불과 맞은편 사람이 같이 보이게 */
export const CINE_ZOOM_MIN_BIG = 2.5;

/**
 * 불멍 줌: 둘러앉은 자리(가로 약 120, 세로 약 100 월드 px)가 레터박스 안에 들어오게, 4~5.
 * big = 광장의 아주 큰 모닥불 (가로 약 180, 세로 약 140 월드 px — 2.5~5)
 */
export function cineZoom(camW: number, camH: number, big = false): number {
  const fit = Math.min(camW / (big ? 184 : 124), (camH * (1 - 2 * LETTERBOX)) / (big ? 140 : 100));
  return Math.max(big ? CINE_ZOOM_MIN_BIG : CINE_ZOOM_MIN, Math.min(CINE_ZOOM_MAX, Math.floor(fit * 4) / 4));
}

/** 불멍 카메라 중심: 불보다 살짝 위 (위쪽 통나무에 앉은 사람 머리·이름표까지 프레임에) */
export function cineCenter(fire: Pick<Campfire, "x" | "y">): { x: number; y: number } {
  return { x: fire.x, y: fire.y - 6 };
}

/** 레터박스 한 줄 높이 (화면 px). t: 0..1 진행 (ease-out) */
export function letterboxHeight(camH: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return Math.round(camH * LETTERBOX * (1 - (1 - u) * (1 - u)));
}
