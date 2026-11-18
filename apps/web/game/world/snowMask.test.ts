import { describe, expect, it } from "vitest";
import { markSpot, SnowOccluders, type FrameMask } from "./snowMask";

// 그림 흉내 (마스크를 못 읽으니 그림 상자 전체가 불투명으로 잡힌다)
function img(key: string, x: number, y: number, w: number, h: number, depth = y) {
  return { type: "Image", texture: { key }, frame: {}, x, y, originX: 0.5, originY: 1, displayWidth: w, displayHeight: h, scaleX: 1, scaleY: 1, flipX: false, flipY: false, depth, visible: true, active: true, alpha: 1, rotation: 0, blendMode: 0 };
}

function occluders(list: unknown[], solid: (x: number, y: number) => boolean = () => false) {
  const o = new SnowOccluders({ scene: { children: { list } } as never, solid });
  o.refresh(0);
  return o;
}

describe("눈싸움 공을 막는 그림", () => {
  it("집 그림 뒤로 들어가려는 공은 그 그림 앞면에 박힌다 (밑동에 맵 충돌이 있는 그림)", () => {
    const house = img("lot-house", 100, 200, 80, 90);
    const o = occluders([house], (x, y) => y >= 185 && y < 200 && x > 60 && x < 140);
    // 옆에서 지붕·벽 높이로 날아온 공 (집 깊이 200보다 뒤, 보이는 자리는 그림 안)
    expect(o.hit(70, 170, 10)?.depth).toBe(200);
    // 집 앞(남쪽)을 지나가는 공은 그림 위에 그려지니 박히지 않는다
    expect(o.hit(70, 205, 10)).toBeNull();
  });

  it("맵 충돌이 없는 그림(바닥 장식)은 막지 않는다", () => {
    const o = occluders([img("forage-node-herb-0", 100, 200, 30, 30)]);
    expect(o.hit(100, 190, 5)).toBeNull();
  });

  it("묘비는 충돌이 없어도 막는다 — 얇아서 바로 뒤로 지날 때만", () => {
    const o = occluders([img("grave-largeStone-0", 100, 200, 18, 28)]);
    expect(o.hit(100, 196, 8)?.depth).toBe(200);
    expect(o.hit(100, 180, 2)).toBeNull();
    const old = occluders([img("snow~gy-old-1", 100, 200, 16, 30)]);
    expect(old.hit(100, 197, 10)?.depth).toBe(200);
  });

  it("의자는 그림 상자 전체로 잰다: 등받이 높이를 스치는 공도 맞는다. 의자보다 높이 나는 공은 넘어간다", () => {
    const o = occluders([img("snow~prop-chair-right", 100, 200, 14, 18)]);
    // 의자 꼭대기 182, 보이는 공 아랫가장자리(y − z + 3)가 닿는다
    expect(o.hit(100, 198, 17)?.depth).toBe(200);
    expect(o.hit(100, 198, 30)).toBeNull();
  });

  it("허공의 전구 줄은 막지 않는다", () => {
    const o = occluders([img("concept-string-132-0-9", 100, 200, 130, 17)], () => true);
    expect(o.hit(100, 195, 3)).toBeNull();
  });

  it("벤치처럼 낮은 막힌 자리는 공이 더 높이 날면 위로 지나간다", () => {
    const bench = img("snow~prop-bench-4", 100, 200, 78, 18);
    const o = occluders([bench], (_x, y) => y >= 192 && y < 200);
    expect(o.over(100, 195, 30)).toBe(true);
    expect(o.over(100, 195, 8)).toBe(false);
    // 그림이 없는 막힌 자리(맵 가장자리)는 넘어가지 않는다
    expect(o.over(300, 195, 30)).toBe(false);
  });

  it("움직인 그림은 묶어 둔 자리로 판정하지 않는다", () => {
    const g = img("grave-smallStone-0", 100, 200, 16, 20);
    const o = occluders([g]);
    g.x = 140;
    expect(o.hit(100, 196, 8)).toBeNull();
  });

  it("눈 자국은 그림의 불투명 픽셀 안쪽에만 붙는다: 위 가장자리에 맞으면 안쪽으로 옮기고, 붙일 곳이 없으면 안 붙인다", () => {
    // 5×4 자국 (모두 불투명), 원점 가운데
    const mark: FrameMask = { w: 5, h: 4, a: new Uint8Array(20).fill(1), top: 0, bottom: 3, left: 0, right: 4 };
    // 지붕 그림 상자 x 80~120, y 160~200
    const roof = img("xmas~shop-hut", 100, 200, 40, 40);
    const at = markSpot(roof as never, 100, 158, mark, 0.5, 0.5);
    expect(at).not.toBeNull();
    expect(at!.y - 2).toBeGreaterThanOrEqual(160);
    // 가는 기둥 (폭 2px) — 자국이 들어갈 자리가 없다
    const pole = img("snow~prop-lantern", 100, 200, 2, 40);
    expect(markSpot(pole as never, 100, 180, mark, 0.5, 0.5)).toBeNull();
  });
});
