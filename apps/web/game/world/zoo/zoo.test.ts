import { describe, expect, it } from "vitest";
import { DIR, FURNITURE, SPAWN, ZOO, ZOO_EAST_GATE, ZOO_GATE, ZOOKEEPER, ZOO_PETS, isRideablePet, type DirId } from "@tomb/protocol";
import { SHOP_COSMETICS, entryStatus, wearAction } from "@/components/account/wardrobe";
import { COSMETIC_FX, CosmeticFxSim, FX_ART, fxIconGrid, mountOf, petPoseFrame, riderLift, UNKNOWN_PET_STANDIN, type FxCmd, type FxInput } from "../../sprites/cosmeticFx";
import { MOUNT_FRAMES, MOUNT_H, MOUNT_W, mountFrames } from "../../sprites/mountArt";
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
      { x: 354, y: 999, what: "벤치 bX 앞 (동문 밖 오리 연못 둑)" },
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
    expect(groundKind(20, 55)).toBe("dirt");
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
    // 11/15 동물원을 줄여 벤치 bX는 동문 밖 오리 연못 둑이 됐다 (자리는 그대로)
    const bx = FURNITURE.find((f) => f.id === "bX")!;
    expect(inside(ZOO, bx.x, bx.y)).toBe(false);
    expect(ZOO.w).toBeLessThan(300);
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
        // 11/17 알파카·북극곰은 기본 10장 뒤에 멈춤·동작 옆모습을 덧붙인다
        expect([art.w, art.h]).toEqual([MOUNT_W, MOUNT_H]);
        expect(art.frames).toBe(mountFrames(mountOf(p.id)!));
        expect(art.frames).toBeGreaterThanOrEqual(MOUNT_FRAMES);
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

describe("11/17 새 펫: 멈춤·귀여운 동작·옛 화면 호환", () => {
  const base = (o: Partial<FxInput> = {}): FxInput => ({
    now: 1000,
    dt: 16,
    x: 100,
    y: 200,
    headY: 200,
    dir: DIR.right,
    moving: false,
    hidden: false,
    artTop: 18,
    shoulder: 7,
    hand: { dx: 5, up: 8 },
    reduced: false,
    ...o,
  });
  const NEW = ["pet_hog", "pet_ducks", "pet_gull", "pet_jelly", "pet_snowy", "pet_fly", "pet_otter", "pet_panda", "pet_paca", "pet_polar"];

  it("새 펫은 모두 멈춤·동작 프레임이 시트 안에 있다", () => {
    for (const id of NEW) {
      const s = COSMETIC_FX[id];
      expect(s?.kind, id).toBe("pet");
      if (s?.kind !== "pet" || !s.pose) throw new Error(id);
      const n = FX_ART[s.art].frames;
      for (const f of [...s.pose.idle, ...s.pose.act]) expect(f, id).toBeLessThan(n);
      expect(s.pose.act.length * s.pose.actMs, id).toBeLessThan(s.pose.every);
      if (s.pose.lift) expect(s.pose.lift.length, id).toBe(s.pose.act.length);
    }
  });

  it("멈추자마자는 앉아 쉬고, 오래 서 있으면 가끔 동작, 움직임 줄이기는 첫 멈춤 프레임", () => {
    const pose = { idle: [2, 3], act: [4, 5], actMs: 100, every: 1000, lift: [0, 2] };
    expect(petPoseFrame(pose, 2, 0)).toEqual([2, 0]);
    expect(petPoseFrame(pose, 2, 600)).toEqual([3, 0]);
    expect(petPoseFrame(pose, 2, 850)).toEqual([4, 0]);
    expect(petPoseFrame(pose, 2, 950)).toEqual([5, 2]);
    expect(petPoseFrame(pose, 2, -1)).toEqual([2, 0]);
  });

  it("걸으면 걷기 두 장, 오래 멈추면 동작 프레임", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["pet_hog"]);
    const out: FxCmd[] = [];
    sim.step(base({ moving: true }), out);
    expect(out.find((c) => c.art === "pkHedgehog")!.frame).toBeLessThan(2);
    const seen = new Set<number>();
    for (let t = 0; t < 9000; t += 50) {
      out.length = 0;
      sim.step(base({ now: 1000 + t }), out);
      seen.add(out.find((c) => c.art === "pkHedgehog")!.frame);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it("12월 루돌프 썰매: 옆모습은 탄 사람 앞에 썰매 옆판을 덧그리고, 탄 채로 멈추면 루돌프가 쉬다가 눈을 긁는다", () => {
    expect(mountOf("xm_sleigh")).toBe("sleigh");
    const spec = COSMETIC_FX.xm_sleigh;
    if (spec?.kind !== "pet" || !spec.pose) throw new Error("xm_sleigh");
    const art = FX_ART[spec.art];
    // 11/17 52칸: 루돌프가 옆으로 눌려 보였다
    expect([art.w, art.h, art.frames]).toEqual([52, MOUNT_H, mountFrames("sleigh")]);
    expect(riderLift("xm_sleigh")).toBeGreaterThan(0);
    const sim = new CosmeticFxSim();
    sim.setLook(["xm_sleigh"]);
    const out: FxCmd[] = [];
    // 옆으로 달리기: 썰매(탄 사람 뒤) + 옆판(앞)
    sim.step(base({ riding: true, moving: true }), out);
    const ride = out.filter((c) => c.art === "mountSleigh");
    expect(ride.map((c) => [c.frame < 2, c.depth > 200])).toEqual([
      [true, false],
      [false, true],
    ]);
    // 11/17 옆모습에선 썰매를 앞으로 밀어 탄 사람이 뒤칸 쪽에 앉는다 (오른쪽을 보면 +, 썰매와 옆판이 같이)
    expect(ride.map((c) => c.x - Math.round(base({}).x))).toEqual([13, 13]);
    // 앞·뒷모습은 기존처럼 덧그림 6·8번대
    out.length = 0;
    sim.step(base({ riding: true, moving: true, dir: DIR.down }), out);
    expect(out.filter((c) => c.art === "mountSleigh").map((c) => c.frame >= 6)).toEqual([false, true]);
    // 탄 채로 멈춰 오래 있으면 멈춤·동작 프레임 (긁기 포함)
    const seen = new Set<number>();
    for (let t = 0; t < 6000; t += 50) {
      out.length = 0;
      sim.step(base({ riding: true, moving: false, now: 2000 + t }), out);
      seen.add(out.filter((c) => c.art === "mountSleigh")[0].frame);
    }
    for (const f of spec.pose.act) expect(seen.has(f), String(f)).toBe(true);
    expect(seen.has(spec.pose.idle[0])).toBe(true);
  });

  it("11/17 타는 펫은 주인을 따라 위아래로 걸으면 앞·뒷모습(몸+덧그림), 옆으로 걸으면 옆모습 · 옆모습 그림만 있는 펫은 늘 옆모습", () => {
    const frames = (id: string, dir: DirId) => {
      const sim = new CosmeticFxSim();
      sim.setLook([id]);
      const out: FxCmd[] = [];
      sim.step(base({ moving: true, dir }), out);
      out.length = 0;
      sim.step(base({ moving: true, dir, now: 1100 }), out);
      return out.filter((c) => c.layer === "body").map((c) => c.frame);
    };
    expect(frames("pet_hound", DIR.down).map((f) => Math.floor(f / 2) * 2)).toEqual([2, 6]);
    expect(frames("pet_hound", DIR.up).map((f) => Math.floor(f / 2) * 2)).toEqual([4, 8]);
    expect(frames("pet_hound", DIR.right).every((f) => f < 2)).toBe(true);
    expect(frames("pet_cat", DIR.down).every((f) => f < 2)).toBe(true);
  });

  it("11/17 탈것에 타 있으면(petOff) 걷는 펫도 타는 펫도 안 그리고, 내리면 바로 옆에서 다시 나와요", () => {
    for (const id of ["pet_hound", "xm_sleigh"]) {
      const sim = new CosmeticFxSim();
      sim.setLook([id]);
      const out: FxCmd[] = [];
      sim.step(base({ x: 100, y: 200 }), out);
      expect(out.length, id).toBeGreaterThan(0);
      out.length = 0;
      sim.step(base({ x: 600, y: 300, petOff: true, riding: true }), out);
      expect(out, id).toEqual([]);
      out.length = 0;
      sim.step(base({ x: 600, y: 300 }), out);
      const p = out[0];
      expect(Math.hypot(p.x - 600, p.y - 300), id).toBeLessThan(40);
    }
  });

  it("실시간 서버가 덧붙인 옛 화면용 펫은 그리지 않고, 모르는 새 펫만 오면 기본 펫", () => {
    const sim = new CosmeticFxSim();
    const out: FxCmd[] = [];
    sim.setLook(["pet_otter", "pet_cat"]);
    sim.step(base(), out);
    expect(out.map((c) => c.art).filter((a) => a === "pkOtter" || a === "petCat")).toEqual(["pkOtter"]);
    out.length = 0;
    sim.setLook(["hat_crown", "pet_from_future"]);
    sim.step(base(), out);
    const standin = COSMETIC_FX[UNKNOWN_PET_STANDIN];
    expect(out.some((c) => standin.kind === "pet" && c.art === standin.art)).toBe(true);
    out.length = 0;
    // 더 새 펫 + 덧붙인 옛 펫이면 아는 펫(덧붙인 것)을 그린다
    sim.setLook(["pet_from_future", "pet_cat"]);
    sim.step(base(), out);
    expect(out.filter((c) => c.art === "petCat")).toHaveLength(1);
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
