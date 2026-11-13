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
vi.mock("./sfx", () => ({ RpgSfx: class { play() {} burst() {} destroy() {} } }));
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
