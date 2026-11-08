import { describe, expect, it } from "vitest";
import { DIR, JUMP_HEIGHT, JUMP_MS, RUN_MULTIPLIER, SEATS, WALK_SPEED } from "@tomb/protocol";
import { canJump, escape, jumpHeight, overlaps, pushOut, shadowScale } from "./jump";
import { emptyMove, faceToward, pickDir, resolveMove } from "./movement";
import { pickInteract, pickSeat, standPoint, neighborSeat, sideIntent } from "./sit";
import { nearestObject, pickInteraction } from "./interact";
import type { Interactable } from "../world/layout";
import { NearTracker } from "../world/nearTracker";

describe("movement", () => {
  it("keyboard diagonal is normalized to walk speed", () => {
    const r = resolveMove({ ax: 1, ay: 1, run: false }, DIR.down, emptyMove());
    expect(Math.hypot(r.vx, r.vy)).toBeCloseTo(WALK_SPEED, 5);
    expect(r.moving).toBe(true);
    expect(r.running).toBe(false);
  });

  it("run multiplies speed by 1.8", () => {
    const r = resolveMove({ ax: 1, ay: 0, run: true }, DIR.down, emptyMove());
    expect(r.vx).toBeCloseTo(WALK_SPEED * RUN_MULTIPLIER, 5);
    expect(r.running).toBe(true);
    expect(r.dir).toBe(DIR.right);
  });

  it("deadzone stops movement and keeps direction", () => {
    const r = resolveMove({ ax: 0.1, ay: 0.05, run: false }, DIR.left, emptyMove());
    expect(r.moving).toBe(false);
    expect(r.vx).toBe(0);
    expect(r.dir).toBe(DIR.left);
  });

  it("joystick deadzone has hysteresis (enter 0.2 / exit 0.12)", () => {
    const out = emptyMove();
    expect(resolveMove({ ax: 0.15, ay: 0, run: false }, DIR.down, out).moving).toBe(false);
    expect(resolveMove({ ax: 0.21, ay: 0, run: false }, DIR.down, out).moving).toBe(true);
    // 걷는 중엔 0.15로 떨어져도 계속 걷는다
    expect(resolveMove({ ax: 0.15, ay: 0, run: false }, DIR.right, out).moving).toBe(true);
    expect(resolveMove({ ax: 0.11, ay: 0, run: false }, DIR.right, out).moving).toBe(false);
    expect(resolveMove({ ax: 0.15, ay: 0, run: false }, DIR.right, out).moving).toBe(false);
  });

  it("small analog tilt walks slower but not below 40%", () => {
    const r = resolveMove({ ax: 0.25, ay: 0, run: false }, DIR.down, emptyMove());
    expect(r.vx).toBeGreaterThanOrEqual(WALK_SPEED * 0.4 - 1e-9);
    expect(r.vx).toBeLessThan(WALK_SPEED);
  });

  it("pickDir keeps previous direction near diagonals (no flicker)", () => {
    expect(pickDir(0.7, 0.71, DIR.right)).toBe(DIR.right);
    expect(pickDir(0.7, 0.71, DIR.down)).toBe(DIR.down);
    expect(pickDir(0.7, 0.71, DIR.up)).toBe(DIR.down);
    expect(pickDir(-1, 0.1, DIR.down)).toBe(DIR.left);
    expect(pickDir(0, -1, DIR.left)).toBe(DIR.up);
  });

  it("faceToward picks dominant axis", () => {
    expect(faceToward(0, 0, 10, 2, DIR.down)).toBe(DIR.right);
    expect(faceToward(0, 0, 1, -10, DIR.down)).toBe(DIR.up);
    expect(faceToward(0, 0, 0, 0, DIR.left)).toBe(DIR.left);
  });
});

describe("sit rules", () => {
  const seat = SEATS.find((s) => s.id === "cA")!;

  it("picks the nearest free seat within 24px", () => {
    const s = pickSeat(seat.x + 10, seat.y + 5, new Map(), null);
    expect(s?.id).toBe("cA");
  });

  it("ignores seats beyond the radius → sit on the ground", () => {
    expect(pickSeat(seat.x - 30, seat.y + 20, new Map(), null)).toBeNull();
  });

  it("skips occupied seats, falls back to the next free one", () => {
    // cA와 cB 사이 (둘 다 20px 안쪽)
    const cB = SEATS.find((s) => s.id === "cB")!;
    const mx = (seat.x + cB.x) / 2 - 1;
    const occupied = new Map([["cA", 7]]);
    expect(pickSeat(mx, seat.y, occupied, 1)?.id).toBe("cB");
    const both = new Map([
      ["cA", 7],
      ["cB", 8],
    ]);
    expect(pickSeat(mx, seat.y, both, 1)).toBeNull();
  });

  it("treats my own seat as free", () => {
    const occupied = new Map([["cA", 5]]);
    expect(pickSeat(seat.x, seat.y, occupied, 5)?.id).toBe("cA");
  });

  it("bench has multiple anchors", () => {
    const b = SEATS.filter((s) => s.furnitureId === "bB");
    expect(b.length).toBe(3);
    const occupied = new Map([[b[1].id, 3]]);
    const s = pickSeat(b[1].x, b[1].y, occupied, null);
    expect(s && s.id !== b[1].id && s.furnitureId === "bB").toBe(true);
  });

  it("standPoint steps below the seat", () => {
    expect(standPoint({ x: 10, y: 20 }).y).toBeGreaterThan(20);
  });

  it("interact chooses the closer of grave and seat", () => {
    expect(pickInteract({ id: "g", dist: 5 }, seat, seat.x + 20, seat.y)).toEqual({ kind: "grave", graveId: "g" });
    expect(pickInteract({ id: "g", dist: 25 }, seat, seat.x + 2, seat.y).kind).toBe("seat");
    expect(pickInteract(null, null, 0, 0).kind).toBe("none");
  });
});

describe("jump", () => {
  it("parabola peaks at JUMP_HEIGHT halfway and lands at JUMP_MS", () => {
    expect(jumpHeight(0)).toBe(0);
    expect(jumpHeight(JUMP_MS / 2)).toBeCloseTo(JUMP_HEIGHT, 5);
    expect(jumpHeight(JUMP_MS)).toBe(0);
    expect(jumpHeight(JUMP_MS * 0.25)).toBeCloseTo(JUMP_HEIGHT * 0.75, 5);
    expect(shadowScale(JUMP_HEIGHT)).toBeCloseTo(0.6);
    expect(shadowScale(0)).toBe(1);
  });

  it("no double jump in the air, 150ms cooldown after landing", () => {
    expect(canJump(1000, true, 0)).toBe(false);
    expect(canJump(1000, false, 900)).toBe(false);
    expect(canJump(1000, false, 850)).toBe(true);
  });

  it("landing on a grave pushes out by the shortest way (keeps going forward)", () => {
    const grave = { x: 100, y: 200, w: 12, h: 5 };
    // 위로(북쪽) 뛰어 받침 안쪽 3px에 착지 → 위로 살짝
    const feet = { x: 102, y: 197, w: 8, h: 5 };
    const d = pushOut(feet, grave);
    expect(d.dx).toBe(0);
    expect(d.dy).toBeLessThan(0);
    expect(overlaps({ ...feet, y: feet.y + d.dy }, grave)).toBe(false);
  });

  it("never stays stuck between neighbouring graves", () => {
    const graves = [
      { x: 100, y: 200, w: 12, h: 5 },
      { x: 113, y: 200, w: 12, h: 5 },
    ];
    for (let x = 96; x < 126; x += 1.5) {
      for (let y = 194; y < 206; y += 1.5) {
        const feet = { x, y, w: 8, h: 5 };
        const e = escape(feet, graves);
        expect(e, `${x},${y}`).not.toBeNull();
        const moved = { ...feet, x: feet.x + e!.dx, y: feet.y + e!.dy };
        for (const g of graves) expect(overlaps(moved, g)).toBe(false);
      }
    }
  });
});

describe("bench: move to the next seat while sitting", () => {
  const seat = (id: string) => SEATS.find((s) => s.id === id)!;
  const none = new Map<string, number>();

  it("←/→ picks the adjacent seat of the same bench", () => {
    expect(neighborSeat(seat("lA-1"), 1, none, null)?.id).toBe("lA-2");
    expect(neighborSeat(seat("lA-1"), -1, none, null)?.id).toBe("lA-0");
  });

  it("stays put at the bench end, on a single chair, or when the neighbor is taken", () => {
    expect(neighborSeat(seat("lA-0"), -1, none, null)).toBeNull();
    expect(neighborSeat(seat("lA-3"), 1, none, null)).toBeNull();
    expect(neighborSeat(seat("cA"), 1, none, null)).toBeNull();
    expect(neighborSeat(seat("lA-1"), 1, new Map([["lA-2", 7]]), 3)).toBeNull();
    // 내가 이미 잡아 둔 자리는 괜찮다
    expect(neighborSeat(seat("lA-1"), 1, new Map([["lA-2", 3]]), 3)?.id).toBe("lA-2");
  });

  it("side intent only for clearly horizontal input (up/down stands up)", () => {
    expect(sideIntent(1, 0)).toBe(1);
    expect(sideIntent(-0.9, 0.2)).toBe(-1);
    expect(sideIntent(0, 1)).toBe(0);
    expect(sideIntent(0.6, 0.6)).toBe(0);
    expect(sideIntent(0.3, 0)).toBe(0);
  });
});

describe("interaction picker", () => {
  const tree: Interactable = { id: "t1", kind: "tree", x: 100, y: 100, r: 14, ax: 100, ay: 104, label: "매달리기" };
  const bell: Interactable = { id: "b1", kind: "bell", x: 140, y: 100, r: 16, ax: 140, ay: 100, label: "종 치기" };
  const base = { grave: null, seat: null, objects: [tree, bell], water: null, nearWater: false } as const;

  it("in water E toggles dive/surface", () => {
    expect(pickInteraction({ ...base, px: 0, py: 0, water: "swim" }).kind).toBe("dive");
    expect(pickInteraction({ ...base, px: 0, py: 0, water: "dive" }).kind).toBe("surface");
  });

  it("nearest object within its radius; grave wins when closer", () => {
    const t = pickInteraction({ ...base, px: 104, py: 106 });
    expect(t.kind === "object" && t.obj.id).toBe("t1");
    expect(pickInteraction({ ...base, px: 300, py: 300 }).kind).toBe("none");
    expect(pickInteraction({ ...base, px: 104, py: 106, grave: { id: "g", dist: 3 } }).kind).toBe("grave");
    expect(nearestObject([tree, bell], 135, 100)?.obj.id).toBe("b1");
  });

  it("splash only when nothing else is near and standing by the water", () => {
    expect(pickInteraction({ ...base, px: 300, py: 300, nearWater: true }).kind).toBe("splash");
    expect(pickInteraction({ ...base, px: 104, py: 106, nearWater: true }).kind).toBe("object");
  });
});

describe("near tooltip tracker (removed grave tag bug)", () => {
  it("hides immediately when the near grave disappears from the list", () => {
    const t = new NearTracker();
    expect(t.next("g1")).toBe(true);
    expect(t.next("g1")).toBe(false);
    // 이장/삭제로 목록에서 빠짐 → 바로 숨겨야 하고, 다음 프레임(근처 묘비 없음)에도 한 번 더 갱신된다
    expect(t.invalidate((id) => id !== "g1")).toBe(true);
    expect(t.id).toBeNull();
    expect(t.next(null)).toBe(true);
    expect(t.next(null)).toBe(false);
  });

  it("list change that keeps the grave just refreshes once", () => {
    const t = new NearTracker();
    t.next("g1");
    expect(t.invalidate(() => true)).toBe(false);
    expect(t.next("g1")).toBe(true);
    expect(t.next("g1")).toBe(false);
  });

  it("my own removal drops it right away", () => {
    const t = new NearTracker();
    t.next("g2");
    expect(t.drop("g3")).toBe(false);
    expect(t.drop("g2")).toBe(true);
    expect(t.next(null)).toBe(true);
  });
});
