// 안내 화살표의 순수 계산 (Phaser 없이 테스트한다)

/** 화면 가장자리 여백 (화면 px) */
export const EDGE = 34;

/** 화면 밖 대상을 가리킬 가장자리 위치와 각도 (순수 계산: 화면 px 기준). inside면 null */
export function edgePoint(sx: number, sy: number, w: number, h: number, margin = EDGE): { x: number; y: number; angle: number } | null {
  if (sx >= margin && sx <= w - margin && sy >= margin && sy <= h - margin) return null;
  const cx = w / 2;
  const cy = h / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  const kx = dx !== 0 ? (cx - margin) / Math.abs(dx) : Infinity;
  const ky = dy !== 0 ? (cy - margin) / Math.abs(dy) : Infinity;
  const k = Math.min(kx, ky);
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

