import type { PlotTier, PlotTierId } from "./catalog";

// 집 안 방 구조 (3번 집 안 개편). 서버 배치 검증(layout.ts)과 집 씬(game/housing/HouseScene.ts)이 같은 값을 쓴다.
//  - 작은 터: 방 하나 / 넓은 터: 거실 + 침실 / 대저택: 서재 + 거실 + 침실 (세로 칸막이 벽으로 나눈다)
//  - 칸막이 벽은 칸과 칸 사이 경계선(x)에 서는 얇은 벽이다. 칸을 차지하지 않아 옛 배치의 칸 수는 그대로다.
//    대신 물건이 벽을 가로지를 수 없고, 칸막이 문(2칸) 양옆 칸에는 서 있는 물건을 둘 수 없다 (방에 못 들어가게 막지 않도록).
//  - 창문은 방마다 안쪽 벽(위쪽 벽) 가운데에 2칸 폭으로 하나씩 난다.

/** 칸막이 벽: 경계선 x(칸 x-1과 x 사이), door = 문이 뚫린 줄(y) 범위 [시작, 끝] */
export type Partition = { x: number; door: readonly [number, number] };
export type Room = { x0: number; x1: number; name: string };
/** 창문: 위쪽 벽의 칸 x부터 w칸 */
export type WallWindow = { x: number; w: number };
export type RoomPlan = { rooms: Room[]; partitions: Partition[]; windows: WallWindow[] };

const PLANS: Record<PlotTierId, (w: number, h: number) => { rooms: Room[]; partitions: Partition[] }> = {
  small: (w) => ({ rooms: [{ x0: 0, x1: w, name: "방" }], partitions: [] }),
  wide: (w, h) => ({
    rooms: [
      { x0: 0, x1: 9, name: "거실" },
      { x0: 9, x1: w, name: "침실" },
    ],
    partitions: [{ x: 9, door: [h - 4, h - 3] }],
  }),
  manor: (w, h) => ({
    rooms: [
      { x0: 0, x1: 6, name: "서재" },
      { x0: 6, x1: 12, name: "거실" },
      { x0: 12, x1: w, name: "침실" },
    ],
    partitions: [
      { x: 6, door: [h - 5, h - 4] },
      { x: 12, door: [h - 5, h - 4] },
    ],
  }),
};

export function roomPlan(tier: Pick<PlotTier, "id" | "w" | "h">): RoomPlan {
  const { rooms, partitions } = (PLANS[tier.id] ?? PLANS.small)(tier.w, tier.h);
  // 방이 넓으면(8칸 이상) 창문 둘, 아니면 가운데 하나
  const windows: WallWindow[] = [];
  for (const r of rooms) {
    const span = r.x1 - r.x0;
    if (span >= 8) {
      windows.push({ x: r.x0 + Math.floor(span / 4) - 1, w: 2 }, { x: r.x1 - Math.floor(span / 4) - 1, w: 2 });
    } else windows.push({ x: r.x0 + Math.floor(span / 2) - 1, w: 2 });
  }
  return { rooms, partitions, windows };
}

/** 칸막이 문 양옆 칸 (서 있는 물건 금지) */
export function doorwayTiles(plan: RoomPlan): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of plan.partitions) for (let y = p.door[0]; y <= p.door[1]; y++) out.push({ x: p.x - 1, y }, { x: p.x, y });
  return out;
}

/**
 * 칸막이 규칙 위반 이유 (없으면 null). 차지 칸 [x, x+w) × [y, y+h)
 * standing = 서 있는 물건 (바닥층 러그·돌길은 문 앞에 깔아도 된다)
 */
export function partitionViolation(plan: RoomPlan, x: number, y: number, w: number, h: number, standing: boolean): string | null {
  for (const p of plan.partitions) if (x < p.x && p.x < x + w) return "방 사이 벽을 가로질러요.";
  if (standing)
    for (const d of doorwayTiles(plan)) if (d.x >= x && d.x < x + w && d.y >= y && d.y < y + h) return "방 사이 문 앞은 비워 두어야 해요.";
  return null;
}

/** 칸 x가 몇 번째 방인지 */
export function roomIndexAt(plan: RoomPlan, x: number): number {
  const i = plan.rooms.findIndex((r) => x >= r.x0 && x < r.x1);
  return i < 0 ? 0 : i;
}
