import { drunkNoSea, seaWet, type DrunkState } from "@tomb/protocol";

// 11/17 사용자: 술에 취한 채로는 바다에 들어가거나 튜브·제트스키·카약을 타지 못해요 (순수 — 시험은 seaDrunk.test).
//  - 물가에서 막기: 이번 걸음이 마른 곳 → 물이면 그 걸음을 되돌려요 (데크 난간처럼)
//  - 물에 있는 동안 취하면(물이 차올라 젖거나, 물에서 음료를 받은 경우) 바로 가까운 뭍으로 올려 보내요
//  - 놀거리 자리는 서버도 거절해요 (realtime channel onSit · protocol drunkNoSea)

export { SEA_DRUNK_MSG } from "@tomb/protocol";

/** 물이 막혀 있어요 (취기가 한 단계라도 남았으면) */
export function seaDrunkBlocked(drunk: DrunkState | null | undefined, now: number): boolean {
  return drunkNoSea(drunk, now);
}

export type SeaDrunkStep = { kind: "ok" } | { kind: "back"; x: number; y: number } | { kind: "shore"; x: number; y: number } | { kind: "stuck" };

/**
 * 취한 사람의 이번 걸음. last = 지난 마른 자리(없으면 null), level = 물 높이, standable = 걸을 수 있는 칸.
 * ok = 그대로 · back = 물에 막 들어섰어요 → 지난 마른 자리로 · shore = 이미 물속 → 가까운 뭍으로 · stuck = 뭍을 못 찾았어요
 */
export function seaDrunkStep(x: number, y: number, last: { x: number; y: number } | null, level: number, standable: (x: number, y: number) => boolean): SeaDrunkStep {
  if (!seaWet(x, y, level)) return { kind: "ok" };
  if (last && Math.hypot(x - last.x, y - last.y) <= 24 && !seaWet(last.x, last.y, level)) return { kind: "back", x: last.x, y: last.y };
  const p = seaShorePoint(x, y, level, standable);
  return p ? { kind: "shore", ...p } : { kind: "stuck" };
}

/**
 * (x,y) 물속에서 가장 가까운 마른 뭍 (물 위 데크도 마른 자리). 위(뭍 쪽)로 먼저, 그다음 옆으로 넓혀 가며 찾아요.
 * 물가 바로 위가 아니라 물가에서 8px 더 올라간 곳 (물결에 다시 젖지 않게)
 */
export function seaShorePoint(x: number, y: number, level: number, standable: (x: number, y: number) => boolean): { x: number; y: number } | null {
  const dry = (px: number, py: number) => !seaWet(px, py, level) && !seaWet(px, py + 8, level, 0) && standable(px, py);
  for (let r = 0; r <= 480; r += 16)
    for (const dx of r === 0 ? [0] : [0, -r, r])
      for (let dy = 0; dy <= 640; dy += 4) {
        const px = x + dx;
        const py = y - dy;
        if (py < 60) break;
        if (dry(px, py)) return { x: Math.round(px), y: Math.round(py - 8 > 60 && dry(px, py - 8) ? py - 8 : py) };
      }
  return null;
}
