import { describe, expect, it } from "vitest";
import { DIR, FURNITURE, SPAWN, ZOO, ZOO_EAST_GATE, ZOO_GATE, ZOOKEEPER, ZOO_PETS, isRideablePet } from "@tomb/protocol";
import { SHOP_COSMETICS, entryStatus, wearAction } from "@/components/account/wardrobe";
import { COSMETIC_FX, CosmeticFxSim, FX_ART, fxIconGrid, mountOf, riderLift, type FxCmd, type FxInput } from "../../sprites/cosmeticFx";
import { MOUNT_FRAMES, MOUNT_H, MOUNT_W } from "../../sprites/mountArt";
import { groundKind, interactables, LANDMARKS, staticColliders, walkableGrid, WALK } from "../layout";
import { ZOO_DECOR, ZOO_FENCES, ZOO_PENS, zooColliders, ZOOKEEPER_SPOT } from "./zooLayout";
import { roamRect, ZOO_ANIMALS, zooPose } from "./zooSim";

// 동물원 (예전 버드나무 묘역 자리): 배치·충돌·걸어서 닿기·동물 시뮬레이션·펫 그림·타는 모습

type Box = { x: number; y: number; w: number; h: number };
const inside = (r: Box, x: number, y: number, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** 스폰에서 물을 건너지 않고 걸어서 닿는 칸 (8px) */
function reachable(): (x: number, y: number) => boolean {
  const g = walkableGrid(8);
  const seen = new Uint8Array(g.cells.length);
  const start = Math.floor(SPAWN.y / g.cell) * g.cols + Math.floor(SPAWN.x / g.cell);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
      const j = ny * g.cols + nx;
      if (seen[j] || g.cells[j] !== WALK.open) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return (x, y) => seen[Math.floor(y / g.cell) * g.cols + Math.floor(x / g.cell)] === 1;
}

describe("동물원 배치", () => {
  const ok = reachable();

  it("우리 다섯 곳은 동물원 안, 서로 겹치지 않는다", () => {
    expect(ZOO_PENS.length).toBe(5);
    for (const p of ZOO_PENS) {
      expect(inside(ZOO, p.rect.x, p.rect.y)).toBe(true);
      expect(inside(ZOO, p.rect.x + p.rect.w, p.rect.y + p.rect.h)).toBe(true);
      for (const q of ZOO_PENS) {
        if (p === q) continue;
        const overlap = p.rect.x < q.rect.x + q.rect.w && q.rect.x < p.rect.x + p.rect.w && p.rect.y < q.rect.y + q.rect.h && q.rect.y < p.rect.y + p.rect.h;
        expect(overlap, `${p.id} ${q.id}`).toBe(false);
      }
    }
  });

  it("정문(서쪽 다리에서 곧장)·동문(안개 숲)으로 들어가 사육사·벤치·우리 팻말 앞까지 걸어서 간다", () => {
    const gx = (ZOO_GATE.x0 + ZOO_GATE.x1) / 2;
    const targets = [
      { x: gx, y: ZOO_GATE.y + 12, what: "정문 안" },
      { x: ZOO_EAST_GATE.x + 12, y: (ZOO_EAST_GATE.y0 + ZOO_EAST_GATE.y1) / 2, what: "동문 밖" },
      { x: ZOO_EAST_GATE.x - 12, y: (ZOO_EAST_GATE.y0 + ZOO_EAST_GATE.y1) / 2, what: "동문 안" },
      { x: ZOOKEEPER_SPOT.x, y: ZOOKEEPER_SPOT.y, what: "사육사 앞" },
      { x: 354, y: 999, what: "벤치 bX 앞" },
      ...ZOO_DECOR.filter((d) => d.kind === "sign").map((d) => ({ x: d.x, y: d.y < 890 ? d.y + 8 : d.y - 18, what: `팻말 ${d.label}` })),
    ];
    const miss = targets.filter((t) => !ok(t.x, t.y) && !ok(t.x, t.y + 4) && !ok(t.x - 4, t.y + 4) && !ok(t.x + 4, t.y + 4)).map((t) => t.what);
    expect(miss).toEqual([]);
  });

  it("사람은 우리 안에 들어갈 수 없다 (울타리로 네 변이 막혔다)", () => {
    for (const p of ZOO_PENS) {
      const r = p.rect;
      for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.4], [0.75, 0.7]]) expect(ok(r.x + r.w * fx, r.y + r.h * fy), p.id).toBe(false);
    }
  });

  it("바닥: 자갈길·우리 안 흙바닥, 동문 밖 흙길", () => {
    expect(groundKind(Math.floor((ZOO_GATE.x0 + 8) / 16), Math.floor((ZOO.y + 20) / 16))).toBe("gravel");
    expect(groundKind(Math.floor(300 / 16), Math.floor(888 / 16))).toBe("gravel");
    expect(groundKind(26, 55)).toBe("dirt");
    for (const p of ZOO_PENS) expect(groundKind(Math.floor((p.rect.x + p.rect.w / 2) / 16), Math.floor((p.rect.y + p.rect.h / 2) / 16)), p.id).toBe("dirt");
  });

  it("사육사 상호작용·미니맵 표시·충돌이 정적 충돌 목록에 들어 있다", () => {
    const keeper = interactables().find((i) => i.kind === "zoo");
    expect(keeper).toMatchObject({ id: "zoo:keeper", ax: ZOOKEEPER_SPOT.x, ay: ZOOKEEPER_SPOT.y });
    expect(LANDMARKS.some((l) => l.kind === "zoo" && l.label === "동물원")).toBe(true);
    const all = staticColliders();
    for (const c of zooColliders()) expect(all).toContainEqual(c);
    expect(zooColliders().some((c) => inside(c, ZOOKEEPER.x, ZOOKEEPER.y - 2))).toBe(true);
    expect(ZOO_FENCES.every((f) => f.x0 === f.x1 || f.y0 === f.y1)).toBe(true);
    // 동물원 벤치 (예전 버드나무 묘역 벤치를 옮겼다)
    const bx = FURNITURE.find((f) => f.id === "bX")!;
    expect(inside(ZOO, bx.x, bx.y)).toBe(true);
  });
});

describe("동물 (결정적 시뮬레이션)", () => {
  it("같은 시드·시각이면 같은 자리, 항상 제 우리 안에 머문다", () => {
    for (let i = 0; i < ZOO_ANIMALS.length; i++) {
      const a = ZOO_ANIMALS[i];
      const r = roamRect(a);
      const pen = ZOO_PENS.find((p) => p.id === a.pen)!.rect;
      let walked = 0;
      for (let t = 0; t < 600_000; t += 997) {
        const p = zooPose(a, i, 3, t);
        expect(zooPose(a, i, 3, t)).toEqual(p);
        expect(p.x >= r.x0 - 0.01 && p.x <= r.x1 + 0.01 && p.y >= r.y0 - 0.01 && p.y <= r.y1 + 0.01, `${a.id} ${t}`).toBe(true);
        // 그림 폭까지 울타리 안
        expect(p.x - a.w / 2).toBeGreaterThan(pen.x);
        expect(p.x + a.w / 2).toBeLessThan(pen.x + pen.w);
        if (p.walking) walked++;
      }
      expect(walked, a.id).toBeGreaterThan(20); // 가만히만 있지 않다
    }
  });

  it("채널(시드)이 다르면 다른 자리", () => {
    const a = ZOO_ANIMALS[0];
    const diff = [0, 50_000, 100_000, 150_000].filter((t) => {
      const p = zooPose(a, 0, 1, t);
      const q = zooPose(a, 0, 2, t);
      return p.x !== q.x || p.y !== q.y;
    }).length;
    expect(diff).toBeGreaterThan(1);
  });

  it("동물원 동물은 분양하는 펫 그림을 같이 쓴다", () => {
    for (const a of ZOO_ANIMALS) expect(FX_ART[a.art], a.art).toBeTruthy();
  });
});

describe("펫 그림·타는 모습", () => {
  const base = (o: Partial<FxInput> = {}): FxInput => ({
    now: 1000,
    dt: 16,
    x: 100,
    y: 200,
    headY: 200,
    dir: DIR.right,
    moving: true,
    hidden: false,
    artTop: 18,
    shoulder: 7,
    hand: { dx: 5, up: 8 },
    reduced: false,
    ...o,
  });

  it("동물원 펫은 모두 그림·아이콘이 있고, 타는 펫은 옆·앞·뒤 + 덧그림 10장 시트", () => {
    for (const p of ZOO_PETS) {
      expect(fxIconGrid(p.id) ?? p.id === "pet_ghost", p.id).toBeTruthy();
      if (p.id !== "pet_ghost") expect(COSMETIC_FX[p.id]?.kind, p.id).toBe("pet");
      expect(!!mountOf(p.id), p.id).toBe(isRideablePet(p.id));
      if (isRideablePet(p.id)) {
        const spec = COSMETIC_FX[p.id];
        const art = FX_ART[(spec as { art: keyof typeof FX_ART }).art];
        expect([art.w, art.h, art.frames]).toEqual([MOUNT_W, MOUNT_H, MOUNT_FRAMES]);
        expect(riderLift(p.id)).toBeGreaterThanOrEqual(8);
        expect(riderLift(p.id)).toBeLessThanOrEqual(14);
      }
    }
    expect(riderLift("pet_cat")).toBe(0);
  });

  it("올라타면 펫을 발밑(점프하면 같이 뜬다)에 탄 사람 뒤로 그리고, 앞·뒷모습은 머리·엉덩이를 앞에 덧그린다", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["pet_deer"]);
    const out: FxCmd[] = [];
    sim.step(base({ riding: true, dir: DIR.right }), out);
    const side = out.filter((c) => c.art === "mountDeer");
    expect(side).toHaveLength(1);
    expect(side[0]).toMatchObject({ x: 100, y: 200, flip: false });
    expect(side[0].frame).toBeLessThan(2);
    expect(side[0].depth).toBeLessThan(200);
    out.length = 0;
    sim.step(base({ riding: true, dir: DIR.down, hop: 6 }), out);
    const front = out.filter((c) => c.art === "mountDeer");
    expect(front.map((c) => [c.frame >= 6, c.depth > 200])).toEqual([
      [false, false],
      [true, true],
    ]);
    expect(front[0].y).toBe(194);
    out.length = 0;
    sim.step(base({ riding: true, dir: DIR.left }), out);
    expect(out.find((c) => c.art === "mountDeer")?.flip).toBe(true);
  });

  it("내리면 그 자리에서부터 다시 뒤따라오고, 큰 펫은 몸집만큼 더 떨어져 걷는다", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["pet_hound"]);
    const out: FxCmd[] = [];
    sim.step(base({ riding: true }), out);
    out.length = 0;
    sim.step(base({ riding: false, x: 101 }), out);
    const pet = out.find((c) => c.art === "mountHound")!;
    expect(Math.abs(pet.x - 100)).toBeLessThan(4); // 막 내린 자리 근처에서 출발
    for (let i = 0; i < 200; i++) {
      out.length = 0;
      sim.step(base({ riding: false, now: 1000 + i * 16, moving: false }), out);
    }
    const settled = out.find((c) => c.art === "mountHound")!;
    expect(100 - settled.x).toBeGreaterThan(16); // 뒤쪽으로 넉넉히
  });
});

describe("상점·가방의 펫", () => {
  it("상점 꾸미기 목록에 펫이 없다 (동물원에서만)", () => {
    expect(SHOP_COSMETICS.some((i) => i.slot === "pet")).toBe(false);
    expect(SHOP_COSMETICS.length).toBeGreaterThan(20);
  });

  it("가방 펫 칸: 데리고 다니기·집에 두기", () => {
    expect(wearAction({ state: "worn", slot: "pet" }).label).toBe("집에 두기");
    expect(wearAction({ state: "stash", slot: "pet" }).label).toBe("데리고 다니기");
    expect(wearAction({ state: "worn", slot: "head" }).label).toBe("벗기");
    expect(entryStatus({ state: "stash", until: 9_999_999_999_999, slot: "pet" }, 0)).toBe("집에서 쉬는 중 · 영구");
  });
});
