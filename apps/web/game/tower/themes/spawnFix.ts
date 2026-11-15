// 11/15 테마 지도 공용: 출현 지점이 소품·벽에 걸리면 방 가운데 쪽으로 조금씩 옮긴다 (몸 반지름 12 — 보통 몬스터가 바로 설 수 있게).
// arena/layout을 가져오면 순환이라 Builder가 가진 칸(solids·spawns)만 구조로 받는다. 지도 크기는 layout.ts와 같다.

const AW = 448;
const AH = 288;
const SIDE = 10;

type Solid = { t: "r"; x: number; y: number; w: number; h: number } | { t: "c"; x: number; y: number; r: number };

function fits(solids: readonly Solid[], x: number, y: number, r: number): boolean {
  if (x < SIDE + r || x > AW - SIDE - r || y < SIDE + r + 4 || y > AH - SIDE - 2) return false;
  for (const s of solids) {
    if (s.t === "c") {
      if (Math.hypot(x - s.x, y - s.y) < s.r + r) return false;
    } else if (Math.hypot(x - Math.max(s.x, Math.min(x, s.x + s.w)), y - Math.max(s.y, Math.min(y, s.y + s.h))) < r) return false;
  }
  return true;
}

/** 걸린 출현 지점은 가운데 쪽으로 옮기고, 너무 가까운 것끼리는 하나로 */
export function settleSpawns(b: { solids: readonly Solid[]; spawns: { x: number; y: number }[] }, r = 12): void {
  const out: { x: number; y: number }[] = [];
  for (const s of b.spawns) {
    let { x, y } = s;
    const d = Math.hypot(AW / 2 - x, AH / 2 + 20 - y) || 1;
    const ux = (AW / 2 - x) / d;
    const uy = (AH / 2 + 20 - y) / d;
    for (let k = 0; k < 60 && !fits(b.solids, x, y, r); k++) {
      x += ux * 3;
      y += uy * 3;
    }
    if (!fits(b.solids, x, y, r)) continue;
    x = Math.round(x);
    y = Math.round(y);
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 18)) continue;
    out.push({ x, y });
  }
  b.spawns.splice(0, b.spawns.length, ...out);
}
