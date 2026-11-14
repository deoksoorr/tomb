import { describe, expect, it } from "vitest";
import { AVATAR_BODIES } from "@tomb/protocol";
import { HAMMOCK_LIFT } from "../world/layout";
import {
  FABRIC_X0,
  FABRIC_X1,
  fabricBack,
  fabricBottom,
  fabricFront,
  fabricFrontTop,
  HAMMOCK_ANCHOR_UP,
  HAMMOCK_H,
  HAMMOCK_W,
  hammockLieSheet,
  hammockRopes,
  LIE_FRAMES,
  lieFrameOf,
  LIE_ORIGIN_X,
  LIE_ORIGIN_Y,
  SWAY_DX,
} from "./hammockArt";

// F5 해먹: 사람은 해먹 천 "안에" 눕는다 (천 아래 매달린 모습 X)

const frame = (g: { w: number; get(x: number, y: number): number }, f: number) => (x: number, y: number) => g.get(f * HAMMOCK_W + x, y);

describe("해먹에 누운 그림 (몸 6종)", () => {
  const back = fabricBack();
  const front = fabricFront();

  it("누운 텍스처를 앵커에 놓으면 해먹 소품과 픽셀 1:1로 겹친다 (천이 어긋나지 않는다)", () => {
    expect(HAMMOCK_ANCHOR_UP).toBe(HAMMOCK_LIFT);
    // 해먹 소품: 원점 (0.5, 1)로 (p.x, p.y + 1) → 왼쪽 위 = (p.x − W/2, p.y + 1 − H). 누운 사람: 앵커 (p.x, p.y − LIFT)에서 표시 원점만큼
    const p = { x: 500, y: 400 };
    expect(p.x - LIE_ORIGIN_X).toBe(p.x - HAMMOCK_W / 2);
    expect(p.y - HAMMOCK_LIFT - LIE_ORIGIN_Y).toBe(p.y + 1 - HAMMOCK_H);
  });

  for (const { id: body } of AVATAR_BODIES) {
    it(`${body}: 천 곡선 안에 누워 몸 위쪽이 천 위로 보이고, 천 아래로 삐져나오지 않는다 (흔들림 칸마다)`, () => {
      const lie = hammockLieSheet(body, "#9fb8d8", ["hat_straw"]);
      expect(lie.grid.w).toBe(HAMMOCK_W * LIE_FRAMES);
      expect(lie.top).toBeGreaterThanOrEqual(4);
      for (const dx of SWAY_DX) {
        const dy = Math.abs(dx) >= 2 ? -1 : 0;
        const ropes = hammockRopes(dx, dy);
        for (let b = 0; b < 2; b++) {
          const f = lieFrameOf(dx, b);
          const px = frame(lie.grid, f);
          let bodyPx = 0;
          let minX = HAMMOCK_W;
          let maxX = -1;
          for (let y = 0; y < HAMMOCK_H; y++)
            for (let x = 0; x < HAMMOCK_W; x++) {
              const v = px(x, y);
              if ((v & 255) === 0) continue;
              // 앞 천은 맨 위에 그려져 (흔들린 자리의) 해먹 앞 천과 똑같다
              const fr = front.get(x - dx, y - dy);
              if ((fr & 255) > 0) {
                expect(v, `${body} f${f} 앞 천 (${x},${y})`).toBe(fr);
                continue;
              }
              const bk = back.get(x - dx, y - dy);
              if ((bk & 255) > 0 && v === bk) continue;
              if (v === ropes.get(x, y)) continue;
              // 몸 픽셀: 천 주머니 바닥보다 아래로 내려가지 않는다
              bodyPx++;
              minX = Math.min(minX, x - dx);
              maxX = Math.max(maxX, x - dx);
              if (x - dx >= FABRIC_X0 && x - dx <= FABRIC_X1) expect(y - dy, `${body} f${f} (${x},${y})`).toBeLessThanOrEqual(fabricBottom(x - dx));
            }
          // 몸이 꽤 보이고(머리·윗몸), 천 가운데에 가로로 누워 있다
          expect(bodyPx).toBeGreaterThan(90);
          expect(minX).toBeGreaterThanOrEqual(FABRIC_X0 - 1);
          expect(maxX).toBeLessThanOrEqual(FABRIC_X1 + 1);
          expect(Math.abs((minX + maxX) / 2 - (FABRIC_X0 + FABRIC_X1) / 2)).toBeLessThanOrEqual(1.5);
          // 몸 가운데 윗면이 앞 천 윗줄보다 위 (천 위로 몸이 보인다 = 천 "안에" 누움)
          const mid = Math.round((FABRIC_X0 + FABRIC_X1) / 2);
          let topMid = HAMMOCK_H;
          for (let y = 0; y < HAMMOCK_H; y++)
            if ((px(mid + dx, y) & 255) > 0 && (back.get(mid, y - dy) & 255) === 0) {
              topMid = y - dy;
              break;
            }
          expect(topMid).toBeLessThan(fabricFrontTop(mid) - 4);
        }
      }
    });
  }

  it("가운데 칸의 줄·천은 해먹 소품과 같은 자리 (누우면 소품은 기둥만 남는다)", () => {
    const lie = hammockLieSheet("hood", "#9fb8d8");
    const f0 = frame(lie.grid, lieFrameOf(0, 0));
    const ropes = hammockRopes();
    for (let y = 0; y < HAMMOCK_H; y++)
      for (let x = 0; x < HAMMOCK_W; x++) {
        if ((front.get(x, y) & 255) > 0) expect(f0(x, y)).toBe(front.get(x, y));
        else if ((ropes.get(x, y) & 255) > 0 && (back.get(x, y) & 255) === 0) expect(f0(x, y)).toBe(ropes.get(x, y));
      }
  });

  it("흔들려도 줄은 기둥 매듭에 붙어 있다 (기둥 칸 x<6, x>41에는 아무것도 안 그린다)", () => {
    const lie = hammockLieSheet("hood", "#9fb8d8");
    for (const dx of SWAY_DX) {
      const px = frame(lie.grid, lieFrameOf(dx, 0));
      expect(px(6, 8) & 255).toBeGreaterThan(0);
      expect(px(41, 8) & 255).toBeGreaterThan(0);
      for (let y = 0; y < HAMMOCK_H; y++) {
        for (let x = 0; x < 6; x++) expect(px(x, y) & 255, `dx${dx} (${x},${y})`).toBe(0);
        for (let x = 42; x < HAMMOCK_W; x++) expect(px(x, y) & 255, `dx${dx} (${x},${y})`).toBe(0);
      }
    }
  });

  it("숨쉬기 프레임은 몸만 1px 가라앉고 천은 그대로", () => {
    const lie = hammockLieSheet("hood", "#9fb8d8");
    const f0 = frame(lie.grid, lieFrameOf(0, 0));
    const f1 = frame(lie.grid, lieFrameOf(0, 1));
    let diff = 0;
    for (let y = 0; y < HAMMOCK_H; y++)
      for (let x = 0; x < HAMMOCK_W; x++) {
        if ((front.get(x, y) & 255) > 0) expect(f1(x, y)).toBe(f0(x, y));
        if (f0(x, y) !== f1(x, y)) diff++;
      }
    expect(diff).toBeGreaterThan(10);
  });
});
