import { beforeAll, describe, expect, it, vi } from "vitest";
import { newCharacter } from "@/lib/rpg/character";
import { derive } from "@/lib/rpg/formulas";
import type { Difficulty } from "@/lib/rpg/catalog";
import type { RpgPlay } from "@/lib/rpg/types";

// 회귀: 어려움을 클리어한 뒤(판 막바지에 제자리 멈춤 스킬을 씀) 다음 판부터 방향키·공격키가 안 먹혔다.
// Phaser는 같은 씬 인스턴스를 다시 띄우는데 create()가 rootUntil 같은 "판 시간 기준 시각"을 0으로 되돌리지 않아,
// 경과 시간이 0부터 다시 세는 다음 판에서 지난 판의 제자리 멈춤이 이어졌다.
// 씬을 실제로 돌리지 않고 Phaser·그리기는 모두 가짜로 바꾼 뒤, 입력→이동·공격 로직만 본다.

/** 무엇을 부르든 자기 자신을 돌려주는 가짜 (this.add.image(...).setDepth(...) 같은 사슬용). 숫자로 쓰면 0 */
function stub(): unknown {
  const f = function () {};
  return new Proxy(f, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : stub()),
    apply: () => stub(),
    construct: () => stub() as object,
  });
}

vi.mock("phaser", () => {
  class Scene {
    constructor() {
      // 씬 시스템(add·cameras·tweens·time…)은 모두 가짜. 클래스에 있는 필드·메서드는 그대로
      return new Proxy(this, { get: (t, k, r) => (k in t ? Reflect.get(t, k, r) : stub()) });
    }
  }
  return {
    Scene,
    Math: { Clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)), RandomDataGenerator: stub() },
    Display: stub(),
    // 40번 사냥터 지도(arena/Arena.ts)의 조명·입자 혼합 모드
    BlendModes: stub(),
    Scale: { Events: { RESIZE: "resize" } },
    Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
  };
});
vi.mock("./sprites", () => ({ RTEX: stub(), avFrame: () => 0, ensureFloor: () => "floor", ensureRpgTextures: () => {}, makePlayer: () => {} }));
vi.mock("./sfx", () => ({ RpgSfx: class { play() {} skill() {} synth() {} destroy() {} } }));
vi.mock("../entities/AvatarView", () => ({ AvatarView: class {} }));
vi.mock("../net/RoomPresence", () => ({ RoomPresence: class {} }));

type Scene = {
  init(d: unknown): void;
  create(): void;
  step(delta: number): void;
  onKey(code: string): void;
  keys: Set<string>;
  elapsed: number;
  px: number;
  py: number;
  atkReadyAt: number;
  rootUntil: number;
  regenAt: number;
  hurtUntil: number;
  sp: number;
  play: RpgPlay;
};

let HuntScene: new () => Scene;

beforeAll(async () => {
  // base.ts가 window에 키 리스너를 단다 (node 환경이라 가짜로)
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  ({ HuntScene } = (await import("./HuntScene")) as unknown as { HuntScene: new () => Scene });
});

function play(difficulty: Difficulty): RpgPlay {
  const c = newCharacter();
  return {
    game: "hunt",
    difficulty,
    seed: 42,
    timeLimitSec: difficulty === "hard" ? 210 : 150,
    level: 5,
    derived: derive(5, c.stats, c.equip),
    skills: { so_lamp: 1 },
    hotbar: ["so_lamp", null, null, null, null, null],
    potions: {},
    equip: c.equip,
  };
}

function launch(scene: Scene, difficulty: Difficulty): void {
  scene.init({ play: play(difficulty), color: "#fff", name: "검수", body: "hood", look: [], atlas: null, reduced: false, onEnd: () => {} });
  scene.create();
}

describe("사냥터: 판을 다시 띄워도 지난 판의 시간 상태가 남지 않는다", () => {
  it("지난 판 막바지에 등불 기도(잠깐 멈춤)를 썼어도 다음 판은 바로 움직이고 때릴 수 있다", () => {
    const scene = new HuntScene();
    launch(scene, "hard");
    // 어려움 판 200초쯤: 등불 기도(1번 칸) → 0.5초 제자리 + 재생·무적 시각도 판 시간 기준으로 앞에 있다
    scene.elapsed = 200_000;
    scene.onKey("Digit1");
    expect(scene.rootUntil).toBeGreaterThan(200_000);
    scene.regenAt = 201_000;
    scene.hurtUntil = 200_450;

    // 같은 씬 인스턴스로 다음 판 (한 판 더 / 로비로 → 출발)
    launch(scene, "easy");
    expect(scene.elapsed).toBe(0);
    expect(scene.rootUntil).toBe(0);
    expect(scene.regenAt).toBe(0);
    expect(scene.hurtUntil).toBe(0);

    // 방향키 → 움직인다
    const x0 = scene.px;
    scene.keys.add("ArrowRight");
    for (let i = 0; i < 30; i++) scene.step(16);
    scene.keys.delete("ArrowRight");
    expect(scene.px).toBeGreaterThan(x0 + 5);

    // 공격키 → 공격이 나간다 (쿨다운이 걸린다)
    scene.onKey("Space");
    expect(scene.atkReadyAt).toBeGreaterThan(scene.elapsed);
  });
});

describe("궁극기 판정: 지금 화면(카메라에 보이는 영역) 안", () => {
  it("화면 안·가장자리에 몸이 걸친 적은 맞고, 화면 밖 적은 안 맞는다", async () => {
    const { inView } = (await import("./HuntScene")) as unknown as { inView: (v: { x: number; y: number; width: number; height: number }, x: number, y: number, pad?: number) => boolean };
    const view = { x: 100, y: 50, width: 220, height: 140 };
    expect(inView(view, 210, 120)).toBe(true);
    expect(inView(view, 100, 50)).toBe(true);
    expect(inView(view, 95, 120, 6)).toBe(true);
    expect(inView(view, 90, 120, 6)).toBe(false);
    expect(inView(view, 330, 120, 6)).toBe(false);
    expect(inView(view, 210, 196, 4)).toBe(false);
  });
});

describe("단·랭크 강도", () => {
  it("1단보다 높은 단이, 같은 스킬도 랭크가 높을수록 화려하다", async () => {
    const { skillPower } = await import("./skillMoves");
    expect(skillPower(1, 1, 5)).toBeCloseTo(0.75);
    expect(skillPower(5, 3, 3)).toBeCloseTo(1.5);
    for (let t = 1; t < 5; t++) expect(skillPower(t + 1, 1, 5)).toBeGreaterThan(skillPower(t, 1, 5));
    for (let lv = 1; lv < 5; lv++) expect(skillPower(3, lv + 1, 5)).toBeGreaterThan(skillPower(3, lv, 5));
  });
});

describe("바닥 드롭: 판이 끝나면 받을 드롭을 바닥에 떨구고, 다 주운 뒤 끝낸다 (결과는 끝난 순간 그대로)", () => {
  type Ended = { result: { durationMs: number; died: boolean; wavesCleared: number }; aborted: boolean };
  type Inner = Scene & {
    plan: unknown[];
    nextWave: number;
    waveAlive: number[];
    kills: Record<string, number>;
    killCount: number;
    mons: unknown[];
    pendingSpawns: number;
    loot: { count: number };
    endSnap: unknown;
    finish(aborted?: boolean): void;
  };

  async function clearAll(seed: number, reduced = false): Promise<{ scene: Inner; ends: Ended[]; detectAt: number }> {
    const { huntPlan } = await import("@/lib/rpg/plan");
    const scene = new HuntScene() as Inner;
    const ends: Ended[] = [];
    scene.init({ play: { ...play("easy"), seed }, color: "#fff", name: "검수", body: "hood", look: [], atlas: null, reduced, onEnd: (result: Ended["result"], aborted: boolean) => ends.push({ result, aborted }) });
    scene.create();
    // 모든 웨이브를 다 잡은 상태로 만든다 (60초쯤)
    const plan = huntPlan(seed, "easy");
    const kills: Record<string, number> = {};
    for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
    scene.kills = kills;
    scene.killCount = Object.values(kills).reduce((a, b) => a + b, 0);
    scene.nextWave = plan.length;
    scene.waveAlive = plan.map(() => 0);
    scene.mons = [];
    scene.pendingSpawns = 0;
    scene.elapsed = 60_000;
    scene.step(16);
    return { scene, ends, detectAt: 60_016 };
  }

  it("드롭이 있으면 바닥에서 다 들어온 뒤 끝나고, 걸린 시간은 예전처럼 승리 1.2초 뒤로 잡힌다", async () => {
    const { huntDropsFor } = await import("@/lib/rpg/rewards");
    const { huntPlan } = await import("@/lib/rpg/plan");
    // 깔끔하게 다 깨면 드롭이 나오는 시드
    const seed = Array.from({ length: 400 }, (_, i) => i + 1).find((s) => {
      const p = huntPlan(s, "easy");
      const kills: Record<string, number> = {};
      for (const w of p) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
      return huntDropsFor({ game: "hunt", difficulty: "easy", seed: s }, { game: "hunt", durationMs: 61_216, kills, wavesCleared: p.length, died: false, potionsUsed: {} }).length > 0;
    })!;
    expect(seed).toBeDefined();
    const { scene, ends, detectAt } = await clearAll(seed);
    expect(scene.endSnap).toBeTruthy();
    expect(scene.loot.count).toBeGreaterThan(0);
    // 1.2초가 지나도 바닥에 남아 있으면 기다린다
    for (let t = 0; t < 1300; t += 16) scene.step(16);
    expect(ends).toHaveLength(scene.loot.count > 0 ? 0 : 1);
    // 놓쳐도 스스로 날아와 들어오고 끝난다 (6초 안)
    for (let t = 0; t < 6000 && !ends.length; t += 16) scene.step(16);
    expect(ends).toHaveLength(1);
    expect(scene.loot.count).toBe(0);
    expect(ends[0].aborted).toBe(false);
    expect(ends[0].result.durationMs).toBe(detectAt + 1200);
    expect(ends[0].result.died).toBe(false);
  });

  it("드롭이 없으면 예전처럼 승리 1.2초 뒤 바로 끝난다", async () => {
    const { huntDropsFor } = await import("@/lib/rpg/rewards");
    const { huntPlan } = await import("@/lib/rpg/plan");
    const seed = Array.from({ length: 400 }, (_, i) => i + 1).find((s) => {
      const p = huntPlan(s, "easy");
      const kills: Record<string, number> = {};
      for (const w of p) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
      return huntDropsFor({ game: "hunt", difficulty: "easy", seed: s }, { game: "hunt", durationMs: 61_216, kills, wavesCleared: p.length, died: false, potionsUsed: {} }).length === 0;
    })!;
    const { scene, ends, detectAt } = await clearAll(seed);
    expect(scene.loot.count).toBe(0);
    for (let t = 0; t < 1150; t += 16) scene.step(16);
    expect(ends).toHaveLength(0);
    for (let t = 0; t < 100; t += 16) scene.step(16);
    expect(ends).toHaveLength(1);
    expect(ends[0].result.durationMs).toBe(detectAt + 1200);
  });

  it("시험 드롭이 실린 판은 예측 대신 그 드롭을 떨군다 (처치가 없거나 일찍 쓰러져도)", () => {
    const scene = new HuntScene() as Inner & { endRun(r: unknown, freeze: boolean, minMs: number): void; result(): unknown };
    const testDrops = [
      { kind: "gear" as const, id: "w_tie", qty: 1 },
      { kind: "gear" as const, id: "w_legacy_axe", qty: 1 },
    ];
    scene.init({ play: { ...play("easy"), testDrops }, color: "#fff", name: "검수", body: "hood", look: [], atlas: null, reduced: false, onEnd: () => {} });
    scene.create();
    scene.elapsed = 3000;
    scene.endRun(scene.result(), true, 0);
    expect(scene.loot.count).toBe(2);
  });

  it("동작 줄이기에서도 같은 흐름으로 끝난다", async () => {
    const { scene, ends } = await clearAll(160, true);
    for (let t = 0; t < 8000 && !ends.length; t += 16) scene.step(16);
    expect(ends).toHaveLength(1);
    expect(scene.loot.count).toBe(0);
  });

  it("드롭을 줍는 중에 나가도 '중간에 나옴'이 아니라 끝난 판 그대로", async () => {
    const { scene, ends } = await clearAll(7);
    scene.finish(true);
    expect(ends).toHaveLength(1);
    expect(ends[0].aborted).toBe(false);
    expect(ends[0].result.wavesCleared).toBeGreaterThan(0);
  });
});

describe("우두머리를 잡는 순간 그 자리에 우두머리 몫이 떨어진다", () => {
  type Boss = Scene & {
    plan: { monsters: string[] }[];
    nextWave: number;
    waveAlive: number[];
    kills: Record<string, number>;
    killCount: number;
    mons: { id: string; alive: boolean }[];
    pendingSpawns: number;
    zone: { boss: string };
    loot: { count: number };
    endSnap: unknown;
    spawn(id: string, x: number, y: number, wave: number): void;
    killMonster(m: unknown): void;
    endRun(r: unknown, freeze: boolean, minMs: number): void;
    result(): import("@/lib/rpg/types").HuntResult;
  };

  it("남은 몬스터와 싸우는 중에도 바닥에 있고(입력 그대로), 뒤에 쓰러져도 판 끝에는 나머지만 — 서버 지급 맨 앞과 같다", async () => {
    const { huntBossDrop, huntDropsFor, evaluate } = await import("@/lib/rpg/rewards");
    const { huntPlan } = await import("@/lib/rpg/plan");
    const t = (seed: number) => ({ game: "hunt" as const, difficulty: "easy" as const, seed });
    const seed = Array.from({ length: 500 }, (_, i) => i + 1).find((s) => huntBossDrop(t(s)) !== null)!;
    const scene = new HuntScene() as Boss;
    scene.init({ play: { ...play("easy"), seed }, color: "#fff", name: "검수", body: "hood", look: [], atlas: null, reduced: false, onEnd: () => {} });
    scene.create();
    const plan = huntPlan(seed, "easy");
    const last = plan.length - 1;
    const boss = scene.zone.boss;
    const other = plan[last].monsters.find((m) => m !== boss)!;
    const kills: Record<string, number> = {};
    for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
    kills[boss]--;
    kills[other]--;
    scene.kills = kills;
    scene.killCount = Object.values(kills).reduce((a, b) => a + b, 0);
    scene.nextWave = plan.length;
    scene.waveAlive = plan.map(() => 0);
    scene.waveAlive[last] = 2;
    scene.mons = [];
    scene.pendingSpawns = 0;
    scene.elapsed = 60_000;
    scene.spawn(boss, 200, 150, last);
    scene.spawn(other, 300, 150, last);
    scene.killMonster(scene.mons.find((m) => m.id === boss));
    // 그 순간 우두머리 몫 하나가 바닥에, 판은 계속
    expect(scene.loot.count).toBe(1);
    expect(scene.endSnap).toBeNull();
    for (let i = 0; i < 10; i++) scene.step(16);
    const before = scene.atkReadyAt;
    scene.onKey("Space");
    expect(scene.atkReadyAt).toBeGreaterThan(before);
    // 남은 몬스터를 못 잡고 쓰러져 끝남 → 서버 드롭 맨 앞은 우두머리 몫, 판 끝에는 나머지만 더 떨어진 것
    const r = { ...scene.result(), died: true };
    const v = evaluate({ ...t(seed), level: 5, st: { agi: 1, dex: 1, luk: 1 } }, r, r.durationMs + 1000);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.drops[0]).toEqual(huntBossDrop(t(seed)));
    expect(huntDropsFor(t(seed), r)).toEqual(v.drops);
    const onFloor = scene.loot.count;
    scene.endRun(r, true, 0);
    expect(scene.loot.count).toBe(onFloor + v.drops.length - 1);
  });

  it("운영자 시험 드롭이 실린 판은 우두머리를 잡는 순간 묶음 전부가 떨어지고, 판 끝에는 더 없다", async () => {
    const { huntPlan } = await import("@/lib/rpg/plan");
    const testDrops = [
      { kind: "cosmetic" as const, id: "hat_party", qty: 1 },
      { kind: "gear" as const, id: "w_legacy_axe", qty: 1 },
    ];
    const scene = new HuntScene() as Boss;
    scene.init({ play: { ...play("easy"), seed: 3, testDrops }, color: "#fff", name: "검수", body: "hood", look: [], atlas: null, reduced: false, onEnd: () => {} });
    scene.create();
    const plan = huntPlan(3, "easy");
    scene.nextWave = plan.length;
    scene.waveAlive = plan.map(() => 0);
    scene.waveAlive[plan.length - 1] = 1;
    scene.mons = [];
    scene.elapsed = 20_000;
    scene.spawn(scene.zone.boss, 200, 150, plan.length - 1);
    scene.killMonster(scene.mons[0]);
    expect(scene.loot.count).toBe(2);
    scene.endRun(scene.result(), false, 1200);
    expect(scene.loot.count).toBe(2);
  });
});
