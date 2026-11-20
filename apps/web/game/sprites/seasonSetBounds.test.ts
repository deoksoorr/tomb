import { describe, expect, it, vi } from "vitest";
import { AVATAR_BODIES } from "@tomb/protocol";
import { AV_COLS, AV_H, AV_W, avatarFrameGrid } from "./avatar";
import { Grid } from "./pixel";
import { SEASON_SHEET_IDS } from "./seasonSetGear";

// 11/20 계절 코디 시트 그림 칸 검사 (운영자 「A4 종이 날개가 칸 가장자리에서 일자로 잘린다」):
// 아바타 한 칸(20×28)은 둘레에 외곽선 한 칸이 둘러져야 하므로, 계절 코디가 칠하는 칸은 x 1~18, y 26 이하여야 한다
// (칸 밖으로 나간 칠은 잘려 테두리 없이 일자로 끊긴다). 15가지 몸 × 앞·옆·뒤 × 시트 28장 전부에서 계절 코디 자리별 그리기
// (등·목·머리·손·빛 점)가 Grid.set으로 칠하려 한 칸을 가로채 센다. 오라·펫·발자국은 시트 밖에 따로 그리므로 여기 없다.

const watch = vi.hoisted(() => ({ on: false }));

vi.mock("./seasonSetGear", async (importOriginal) => {
  const m = await importOriginal<typeof import("./seasonSetGear")>();
  const wrap =
    <A extends unknown[]>(f: (...a: A) => void) =>
    (...a: A) => {
      watch.on = true;
      try {
        f(...a);
      } finally {
        watch.on = false;
      }
    };
  return { ...m, drawSsBack: wrap(m.drawSsBack), drawSsNeck: wrap(m.drawSsNeck), drawSsHead: wrap(m.drawSsHead), drawSsHand: wrap(m.drawSsHand), drawSsGlow: wrap(m.drawSsGlow) };
});

describe("계절 코디 시트 그림은 아바타 칸 안 (x 1~18, y 26 이하)", () => {
  it("모든 계절 코디 × 15가지 몸 × 앞·옆·뒤 × 28장", () => {
    const bad: string[] = [];
    let hits: string[] = [];
    const orig = Grid.prototype.set;
    Grid.prototype.set = function (this: Grid, x: number, y: number, c: number, a = 255) {
      if (watch.on && this.w === AV_W && this.h === AV_H && a > 0 && (x < 1 || x > AV_W - 2 || y > AV_H - 2)) hits.push(`${x},${y}`);
      return orig.call(this, x, y, c, a);
    };
    try {
      for (const id of SEASON_SHEET_IDS)
        for (const { id: body } of AVATAR_BODIES)
          for (const view of ["down", "side", "up"] as const)
            for (let col = 0; col < AV_COLS; col++) {
              hits = [];
              avatarFrameGrid(body, view, col, "#c3a6d9", [id]);
              if (hits.length) bad.push(`${id} ${body}/${view}/${col}: ${[...new Set(hits)].slice(0, 4).join(" ")}`);
            }
    } finally {
      Grid.prototype.set = orig;
    }
    expect(bad).toEqual([]);
    // 64점 × 15몸 × 3방향 × 28장을 다 그려 보므로 전체 테스트 중에는 몇 초 걸린다
  }, 60_000);
});
