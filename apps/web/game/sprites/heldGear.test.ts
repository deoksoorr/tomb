import { describe, expect, it, vi } from "vitest";
import { AVATAR_BODIES, ITEMS } from "@tomb/protocol";
import { AV_COLS, AV_H, AV_W, avatarFrameGrid } from "./avatar";
import { COSMETIC_FX } from "./cosmeticFx";
import { HELD_ART, heldOrigin } from "./heldGear";
import { Grid } from "./pixel";

// 칸 검사: heldGear가 그림을 레이어에 칠하는 동안만 Grid.set을 가로챈다 (seasonSetBounds.test와 같은 방식)
const watch = vi.hoisted(() => ({ on: false }));
vi.mock("./heldGear", async (importOriginal) => {
  const m = await importOriginal<typeof import("./heldGear")>();
  return {
    ...m,
    paintHeld: (...a: Parameters<typeof m.paintHeld>) => {
      watch.on = true;
      try {
        m.paintHeld(...a);
      } finally {
        watch.on = false;
      }
    },
  };
});

// 11/22 손 꾸미기 크게 (운영자 「손 파츠 아이템들 다 크게 — 티가 하나도 안 난다」)

const COLOR = "#9fb8d8";
const HAND_IDS = ITEMS.filter((i) => i.slot === "hand").map((i) => i.id);
/** 시트에 그리는 손 꾸미기 (우산·풍선은 시트 밖에 따로 크게 — cosmeticFx held) */
const SHEET_HAND = HAND_IDS.filter((id) => COSMETIC_FX[id]?.kind !== "held");
/** 꾸미기를 들었을 때 바뀐 칸 수 (그림 + 몸과 갈라 주는 외곽선) — 예전 3×3 점은 15~30칸 */
const MIN_VISIBLE = 30;

const changed = (a: ReturnType<typeof avatarFrameGrid>, b: ReturnType<typeof avatarFrameGrid>) => {
  const out: [number, number][] = [];
  for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) out.push([i % AV_W, Math.floor(i / AV_W)]);
  return out;
};

describe("손 꾸미기 크게 (heldGear)", () => {
  it("손 칸 꾸미기는 전부 새 그림이거나(heldGear) 따로 크게 그리는 것(우산·풍선)이거나 골목 수레 큰 그림", () => {
    for (const id of HAND_IDS) expect(!!HELD_ART[id] || COSMETIC_FX[id]?.kind === "held" || id === "kc_icecoffee" || id === "kd_bungeo", id).toBe(true);
  });

  it(`모든 몸 · 앞·옆에서 ${MIN_VISIBLE}칸 넘게 보인다`, () => {
    const weak: string[] = [];
    for (const id of SHEET_HAND)
      for (const b of AVATAR_BODIES)
        for (const view of ["down", "side"] as const) {
          const n = changed(avatarFrameGrid(b.id, view, 0, COLOR), avatarFrameGrid(b.id, view, 0, COLOR, [id])).length;
          if (n < MIN_VISIBLE) weak.push(`${id} ${b.id}/${view}: ${n}`);
        }
    expect(weak).toEqual([]);
  });

  it("뒷모습은 몸 뒤 — 몸 칸은 그대로, 반대편(왼쪽) 손 자리에만 삐져나온다", () => {
    const bad: string[] = [];
    for (const id of SHEET_HAND)
      // 고양이 탈은 손 꾸미기를 들면 서류 가방을 내려놓는다 (뒷모습 왼쪽 가방 칸이 바뀐다)
      for (const b of AVATAR_BODIES.filter((b) => b.id !== "catmask"))
        for (const col of [0, 3, 12, 13]) {
          const plain = avatarFrameGrid(b.id, "up", col, COLOR);
          const worn = avatarFrameGrid(b.id, "up", col, COLOR, [id]);
          for (const [x, y] of changed(plain, worn)) {
            const was = plain.get(x, y);
            // 몸(외곽선 안쪽) 칸이 바뀌었거나, 오른쪽 절반에 무언가 생겼다
            if (((was & 255) === 255 && plain.filled(x - 1, y) && plain.filled(x + 1, y) && plain.filled(x, y - 1) && plain.filled(x, y + 1)) || x >= AV_W / 2) {
              bad.push(`${id} ${b.id}/${col} (${x},${y})`);
              break;
            }
          }
        }
    expect(bad).toEqual([]);
  });

  it("칸 밖으로 잘리지 않는다 — 그림 칸은 x 1~18 · y 3~26 (둘레 한 칸은 외곽선 자리)", () => {
    const bad: string[] = [];
    let hits: string[] = [];
    const orig = Grid.prototype.set;
    Grid.prototype.set = function (this: Grid, x: number, y: number, c: number, a = 255) {
      if (watch.on && this.w === AV_W && this.h === AV_H && a > 0 && (x < 1 || x > AV_W - 2 || y < 3 || y > AV_H - 2)) hits.push(`${x},${y}`);
      return orig.call(this, x, y, c, a);
    };
    try {
      for (const id of SHEET_HAND)
        for (const b of AVATAR_BODIES)
          for (const view of ["down", "side", "up"] as const)
            for (let col = 0; col < AV_COLS; col++) {
              hits = [];
              avatarFrameGrid(b.id, view, col, COLOR, [id]);
              if (hits.length) bad.push(`${id} ${b.id}/${view}/${col}: ${[...new Set(hits)].slice(0, 3).join(" ")}`);
            }
    } finally {
      Grid.prototype.set = orig;
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it("자리 잡기: 손 자리에 쥐는 칸을 맞추고, 칸 안으로 밀고, 눈 칸을 비킨다", () => {
    const rows = ["xxx", "xxx", "xxx"];
    expect(heldOrigin(rows, [1, 1], 10, 10, [])).toEqual({ x: 9, y: 9 });
    // 오른쪽 끝 (x 18까지)
    expect(heldOrigin(rows, [0, 1], 18, 10, [])).toEqual({ x: 16, y: 9 });
    // 아래 끝 (y 26까지)
    expect(heldOrigin(rows, [1, 0], 10, 26, [])).toEqual({ x: 9, y: 24 });
    // 눈이 그림 왼쪽 위에 걸리면 비킨다 (그림 칸이 눈에 안 닿게)
    const at = heldOrigin(rows, [1, 1], 10, 10, [[9, 9]]);
    expect(at.x > 9 || at.y > 9).toBe(true);
    // 띄운 것(소원 등불)은 위로 먼저
    const up = heldOrigin(rows, [1, 1], 10, 10, [[9, 11]], true);
    expect(up.y).toBeLessThan(9);
  });

  it("앞모습 걷기·앉기에서도 손 꾸미기가 그려진다 (프레임마다 사라지지 않는다)", () => {
    for (const id of SHEET_HAND)
      for (const b of AVATAR_BODIES)
        for (const col of [2, 3, 4, 5, 12, 13]) expect(changed(avatarFrameGrid(b.id, "down", col, COLOR), avatarFrameGrid(b.id, "down", col, COLOR, [id])).length, `${id} ${b.id} ${col}`).toBeGreaterThan(MIN_VISIBLE - 6);
  });
});
