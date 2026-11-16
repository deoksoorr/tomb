import { SEA_JETSKIS, SEA_BREAKWATER, SEA_BREAKWATER_TIP, SEA_LIGHTHOUSE, SEA_PIER, SEA_PIER_END, SEA_ROCKS, SEA_SPOTS } from "@tomb/protocol";
import { SEA_TEX } from "./seaArt";

// 11/16 바다 보기 장면의 원근 계산 (순수 — Phaser 없음, seaViewGeom.test).
// 앉은 사람은 바다(지도 아래·남쪽)를 봐요 → 지도 동쪽(+x)이 장면 왼쪽, 서쪽이 오른쪽 (사용자 확정, 눈으로 보는 그대로).
// dx = 물체 x − 앉은 자리 x, d = 물체 y − 앉은 자리 y (바다 쪽 앞 거리, 0 이하는 뒤라 안 보여요)

/** 11/16 벤치 앞 줄 (벤치에서 본 파라솔·선베드 — 앉은 자리에서 월드 px만큼 옆 dx, 앞(바다 쪽) d) */
export type SeaViewFore = { parasols: readonly { dx: number; d: number; v: number }[]; loungers: readonly { dx: number; d: number }[] };
/**
 * 11/16 앉은 자리에서 보이는 것 (선착장·방파제·등대·낚싯배·갯바위) — 앉은 자리 기준 dx(동쪽 +), d(바다 쪽 앞 거리).
 * 띠(선착장·방파제)는 가까운 끝 d0 ~ 먼 끝 d1, 폭 w
 */
export type SeaViewLandmarks = {
  strips: readonly { kind: "pier" | "breakwater"; dx: number; w: number; d0: number; d1: number }[];
  sprites: readonly { key: string; dx: number; d: number; scale: number }[];
};

/**
 * 원근: 가까울수록 크고 아래, 멀수록 작고 수평선 가까이.
 * 11/16 사용자 확정: 앉은 사람은 바다(지도 아래·남쪽)를 보고 있어서 지도 동쪽(+x)이 장면 왼쪽, 서쪽이 오른쪽이에요 (눈으로 보는 그대로)
 */
export const VIEW_FOCAL = 140;
const VIEW_NEAR = 60;
export function seaViewProject(dx: number, d: number, VW: number, VH: number, hz: number): { x: number; y: number; s: number } | null {
  if (d < 12) return null;
  const s = VIEW_FOCAL / d;
  return { x: VW / 2 - dx * s, y: hz + (VH - hz) * Math.min(1.08, VIEW_NEAR / d), s };
}


/** 보이는 부채꼴 (앞 거리 d에서 옆으로 이만큼까지 — 장면 화면 폭과 비슷하게) */
const inCone = (dx: number, d: number) => d > 8 && Math.abs(dx) < 40 + d * 1.25;

/** 벤치 앞(남쪽) 선베드 줄·파라솔 (벤치 바로 앞 두 줄만, 부채꼴 안) · ids = 선베드 쉴거리 자리 id (누운 사람 머리) */
export function seaViewFore(bx: number, by: number): { spec: SeaViewFore; ids: string[] } {
  const ids: string[] = [];
  const loungers: { dx: number; d: number }[] = [];
  SEA_SPOTS.loungers.forEach((l, i) => {
    const dx = l.x - bx;
    const d = l.y - by;
    if (!inCone(dx, d) || Math.abs(dx) > 170) return;
    loungers.push({ dx, d });
    ids.push(`pZ${i + 1}`);
  });
  const parasols = SEA_SPOTS.parasols
    .map((p, i) => ({ dx: p.x - bx, d: p.y - by, v: i % 2 }))
    .filter((p) => inCone(p.dx, p.d) && Math.abs(p.dx) <= 170);
  return { spec: { parasols, loungers }, ids };
}

/** 앉은 자리에서 앞(남쪽)에 보이는 선착장·방파제·등대·낚싯배·갯바위 */
export function seaViewLandmarks(sx: number, sy: number): SeaViewLandmarks {
  const strips: { kind: "pier" | "breakwater"; dx: number; w: number; d0: number; d1: number }[] = [];
  const sprites: { key: string; dx: number; d: number; scale: number }[] = [];
  const strip = (kind: "pier" | "breakwater", x: number, w: number, y0: number, y1: number) => {
    const dx = x - sx;
    const d0 = Math.max(y0 - sy, 12);
    const d1 = y1 - sy;
    if (d1 <= 20) return;
    if (!inCone(dx, d1) && !inCone(dx, Math.max(d0, 20))) return;
    strips.push({ kind, dx, w, d0, d1 });
  };
  strip("pier", SEA_PIER.x + SEA_PIER.w / 2, SEA_PIER.w, SEA_PIER.y, SEA_PIER.y + SEA_PIER.h);
  strip("pier", SEA_PIER_END.x + SEA_PIER_END.w / 2, SEA_PIER_END.w, SEA_PIER_END.y, SEA_PIER_END.y + SEA_PIER_END.h);
  strip("breakwater", SEA_BREAKWATER.x + SEA_BREAKWATER.w / 2, SEA_BREAKWATER.w, SEA_BREAKWATER.y, SEA_BREAKWATER.y + SEA_BREAKWATER.h);
  strip("breakwater", SEA_BREAKWATER_TIP.x + SEA_BREAKWATER_TIP.w / 2, SEA_BREAKWATER_TIP.w, SEA_BREAKWATER_TIP.y, SEA_BREAKWATER_TIP.y + SEA_BREAKWATER_TIP.h);
  const sprite = (key: string, x: number, y: number, scale: number) => {
    const dx = x - sx;
    const d = y - sy;
    if (inCone(dx, d) && d > 20) sprites.push({ key, dx, d, scale });
  };
  sprite(SEA_TEX.lighthouse, SEA_LIGHTHOUSE.x, SEA_LIGHTHOUSE.y, 0.9);
  // 11/16 r13 낚싯배 대신 선착장 끝에 매어 둔 제트스키
  SEA_JETSKIS.forEach((j, i) => sprite(SEA_TEX.jetski("front", i), j.x, j.y, 0.8));
  SEA_ROCKS.forEach((r, i) => {
    if (!r.small) sprite(SEA_TEX.rock(i), r.x, r.y + r.ry * 0.7, 0.9);
  });
  return { strips, sprites };
}
