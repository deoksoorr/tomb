import * as Phaser from "phaser";
import type { SkillId } from "@/lib/rpg/skillTree";
import { DEPTH_FX, DEPTH_GROUND, PALETTES, pick, rnd, SKT, type SkillFx } from "./skillFx";

// 스킬 33종의 고유 연출 (판정·수치는 HuntScene/lib/rpg가 하고, 여기는 그림만).
// 같은 갈래라도 모양이 겹치지 않게 연출 키(SKILL_LOOK)로 나눈다:
//   투사체형(불덩이 궤적·꼬리), 부채형, 장판형(바닥이 타오름·얼어붙음), 낙하형(유성·고드름 비), 회오리형,
//   연쇄형(넋이 튀며 이어짐), 돌진형(잔상 줄), 소환형(유령 손·묘비 솟음), 강화형, 궁극기(화면 전체), 패시브 발동
// 특정 게임의 그림·이펙트를 베끼지 않고, 이 마을의 모닥불·서리·넋 이야기에 맞춰 코드로 그린다.

export type FxKind = "projectile" | "cone" | "ground" | "fall" | "vortex" | "chain" | "dash" | "summon" | "buff" | "ultimate" | "proc" | "passive";

/** 스킬별 합성음 차이 (sfx.burst의 결) */
export type Tone = { pitch?: number; sweep?: number; noise?: number; len?: number };

export type SkillLook = {
  /** 연출 키 (스킬마다 다르다) */
  key: string;
  kind: FxKind;
  /** 손맛 무게 0~4 (히트스톱·흔들림·숫자 크기) */
  weight: 0 | 1 | 2 | 3 | 4;
  tone?: Tone;
};

/** 스킬 → 연출 키 매핑. 33종 모두 (빠지면 타입 검사가 잡는다) */
export const SKILL_LOOK: Record<SkillId, SkillLook> = {
  // 모닥불지기
  em_kindle: { key: "ember-flick", kind: "projectile", weight: 1, tone: { pitch: 1.3, len: -0.05 } },
  em_hearth: { key: "hearth-glow", kind: "passive", weight: 0 },
  em_fan: { key: "flame-fan", kind: "cone", weight: 2, tone: { pitch: 1.1, noise: 1.3 } },
  em_stoke: { key: "stoke-pillar", kind: "buff", weight: 1, tone: { pitch: 0.8, sweep: 1.6 } },
  em_spark: { key: "spark-crit", kind: "passive", weight: 0 },
  em_ring: { key: "fire-ring", kind: "ground", weight: 2, tone: { pitch: 0.9, len: 0.1 } },
  em_ignite: { key: "ignite-pop", kind: "proc", weight: 1, tone: { pitch: 1.5, len: -0.1 } },
  em_meteor: { key: "meteor-log", kind: "fall", weight: 3, tone: { pitch: 0.7, len: 0.25, noise: 1.4 } },
  em_brazier: { key: "brazier-ground", kind: "ground", weight: 1, tone: { pitch: 1.0, noise: 0.8 } },
  em_bonfire: { key: "bonfire-ult", kind: "ultimate", weight: 4, tone: { pitch: 0.6, len: 0.35, noise: 1.5 } },
  em_ashheart: { key: "ashheart", kind: "passive", weight: 0 },
  // 서리 묘지기
  fr_breath: { key: "frost-breath", kind: "cone", weight: 1, tone: { pitch: 0.9, noise: 1.6 } },
  fr_collar: { key: "collar", kind: "passive", weight: 0 },
  fr_icicle: { key: "icicle-volley", kind: "projectile", weight: 1, tone: { pitch: 1.35, len: -0.05 } },
  fr_brittle: { key: "brittle-crack", kind: "proc", weight: 0 },
  fr_ward: { key: "ice-hex", kind: "buff", weight: 1, tone: { pitch: 1.2, sweep: 1.2 } },
  fr_nova: { key: "frost-flower", kind: "ground", weight: 2, tone: { pitch: 1.0, len: 0.1 } },
  fr_mist: { key: "mist-dash", kind: "dash", weight: 1, tone: { pitch: 0.8, noise: 1.5, sweep: 0.7 } },
  fr_tomb: { key: "icicle-rain", kind: "fall", weight: 3, tone: { pitch: 0.75, len: 0.25 } },
  fr_field: { key: "frost-field", kind: "ground", weight: 1, tone: { pitch: 1.1, noise: 0.7 } },
  fr_blizzard: { key: "blizzard-ult", kind: "ultimate", weight: 4, tone: { pitch: 0.85, len: 0.35, noise: 1.8 } },
  fr_solstice: { key: "solstice", kind: "passive", weight: 0 },
  // 넋 인도자
  so_wisp: { key: "wisp-homing", kind: "projectile", weight: 1, tone: { pitch: 1.25 } },
  so_lamp: { key: "lamp-prayer", kind: "buff", weight: 0, tone: { pitch: 1.5, sweep: 1.3 } },
  so_drain: { key: "drain-wisp", kind: "proc", weight: 0 },
  so_swift: { key: "wind-ribbon", kind: "buff", weight: 0, tone: { pitch: 1.3, sweep: 1.8, noise: 1.2 } },
  so_friend: { key: "tomb-rise", kind: "summon", weight: 1, tone: { pitch: 0.8 } },
  so_chain: { key: "soul-chain", kind: "chain", weight: 2, tone: { pitch: 1.1, len: 0.1 } },
  so_veil: { key: "veil-portal", kind: "dash", weight: 1, tone: { pitch: 0.7, sweep: 0.6 } },
  so_harvest: { key: "soul-vortex", kind: "vortex", weight: 2, tone: { pitch: 0.9, len: 0.15 } },
  so_lantern: { key: "lantern-hands", kind: "summon", weight: 1, tone: { pitch: 1.1 } },
  so_procession: { key: "procession-ult", kind: "ultimate", weight: 4, tone: { pitch: 0.75, len: 0.35 } },
  so_kinship: { key: "kinship", kind: "passive", weight: 0 },
};

const TAU = Math.PI * 2;
const E = PALETTES.ember;
const F = PALETTES.frost;
const S = PALETTES.soul;
const FIRE = [0xfff0b0, 0xffc04a, 0xff7a2e, 0xff4a1a] as const;
const ICE = [0xffffff, 0xe8f8ff, 0xbfe8ff, 0x8fd8ff] as const;
const SOUL = [0xf2ecff, 0xd8c0ff, 0xb98aff, 0x9ff0dc] as const;
type Pt = { x: number; y: number };

export class SkillMoves {
  /** 서리 방패 육각 껍질 (방패가 있는 동안) */
  private wardG: Phaser.GameObjects.Graphics | null = null;
  private drainAt = 0;
  private brittleAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: SkillFx,
  ) {}

  private get add() {
    return this.scene.add;
  }

  /** 불꽃 혀 하나 (바닥에서 솟아 흔들리며 사그라짐) */
  private tongue(x: number, y: number, h: number, ms: number, delay = 0, tints: readonly number[] = FIRE, depth = DEPTH_FX + 1): void {
    const f = this.fx;
    f.emit({ x, y, tex: SKT.flame, tint: pick(tints.slice(1)), life: ms, delay, s0: (h / 48) * 0.5, s1: h / 48, sy: 1.25, originY: 1, vy: -h * 0.6, fade: 1.3, depth });
    f.emit({ x, y, tex: SKT.flame, tint: tints[0], life: ms * 0.75, delay, s0: (h / 48) * 0.25, s1: (h / 48) * 0.55, sy: 1.15, originY: 1, vy: -h * 0.5, fade: 1.5, depth: depth + 0.5 });
  }

  /** 얼음 가시 하나 (바닥에서 솟았다 깨짐) */
  private spikeUp(x: number, y: number, h: number, ms: number, delay = 0, ang = 0): void {
    this.fx.emit({ x, y, tex: SKT.spike, add: false, life: ms, delay, s0: (h / 42) * 0.2, s1: h / 42, sy: 1, originY: 1, rot: ang, fade: 5, depth: y });
    this.fx.emit({ x, y: y - h * 0.4, tex: SKT.glow, tint: F.dark, life: ms * 0.5, delay, s0: 0.2, s1: h / 50, alpha: 0.5 });
  }

  /** 파편 (중력으로 떨어짐) */
  private debris(x: number, y: number, n: number, tex: string, tints: readonly number[], speed: number, add = false, s = 1): void {
    for (let i = 0; i < this.fx.n(n); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = speed * rnd(0.5, 1.1);
      this.fx.emit({ x, y, tex, tint: pick(tints), add, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: 520, life: rnd(500, 800), s0: s * rnd(0.8, 1.3), s1: s * 0.6, vr: rnd(-12, 12), rot: Math.random() * 3, fade: 3 });
    }
  }

  // ════════ 모닥불지기 ════════

  /** 불씨 튕기기: 불씨가 포물선으로 튕겨 날아가며 불꼬리를 남긴다 (ms 동안) */
  kindleFly(from: Pt, to: Pt, ms: number): void {
    const f = this.fx;
    const ball = this.add.image(from.x, from.y - 8, SKT.glow).setDepth(DEPTH_FX + 3).setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setScale(0.45);
    const core = this.add.image(from.x, from.y - 8, SKT.star).setDepth(DEPTH_FX + 4).setTint(0xfff0b0).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55);
    const st = { t: 0 };
    let lx = from.x;
    let ly = from.y - 8;
    this.scene.tweens.add({
      targets: st,
      t: 1,
      duration: ms,
      ease: "Sine.easeIn",
      onUpdate: () => {
        const x = from.x + (to.x - from.x) * st.t;
        const y = from.y - 8 + (to.y - 4 - (from.y - 8)) * st.t - Math.sin(st.t * Math.PI) * 26;
        ball.setPosition(x, y);
        core.setPosition(x, y).setRotation(st.t * 12);
        // 꼬리: 불꽃 + 불티가 지나간 자리에 남아 사그라진다
        f.emit({ x, y, tex: SKT.flame, tint: pick(FIRE.slice(1)), life: 260, s0: 0.42, s1: 0.1, rot: Math.atan2(y - ly, x - lx) - Math.PI / 2, vy: -20 });
        f.emit({ x: (x + lx) / 2, y: (y + ly) / 2, tex: SKT.streak, tint: 0xffd27a, vx: (x - lx) * 30, vy: (y - ly) * 30, drag: 6, life: 200, s0: 0.5, s1: 0.2, stretch: 0.006 });
        lx = x;
        ly = y;
      },
      onComplete: () => {
        ball.destroy();
        core.destroy();
      },
    });
  }

  /** 불씨 튕기기 착탄: 여섯 잎 불꽃 꽃이 피고 불티가 튄다 */
  kindleHit(x: number, y: number, r: number): void {
    const f = this.fx;
    f.glow(x, y - 6, r * 1.6, E.main, 300, 0.3, 0.65);
    f.glow(x, y - 6, r * 0.5, 0xffffff, 140, 0.4, 0.5);
    f.light(x, y, r * 1.6, E.main, 520);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.random() * 0.3;
      f.emit({ x: x + Math.cos(a) * 3, y: y - 6 + Math.sin(a) * 2, tex: SKT.flame, tint: pick(FIRE.slice(1)), vx: Math.cos(a) * 60, vy: Math.sin(a) * 40, drag: 5, life: 320, s0: 0.25, s1: 0.6, rot: a + Math.PI / 2, fade: 1.6 });
    }
    f.sparks(x, y - 6, 12, FIRE, 240, { life: 340, ay: 60 });
    f.ring(x, y, r * 1.3, E.light, 260, 2, 0, DEPTH_GROUND + 4);
    f.scar(x, y, r * 0.8, 0x1a0a04, 900, 0.5);
  }

  /** 불꽃 부채: 부채살 불길이 한쪽 끝에서 다른 끝으로 차례로 펼쳐진다 + 열기 초승달이 밀려간다 */
  fan(x: number, y: number, ang: number, range: number, arcDeg: number): void {
    const f = this.fx;
    const half = (arcDeg / 2) * (Math.PI / 180);
    f.cone(x, y + 2, ang, range, arcDeg, "ember", 110);
    const blades = 9;
    for (let i = 0; i < blades; i++) {
      const a = ang - half + (i / (blades - 1)) * half * 2;
      const d = range * 0.5;
      const delay = i * 13;
      f.emit({ x: x + Math.cos(a) * 6, y: y - 4 + Math.sin(a) * 4, tex: SKT.flame, tint: pick(FIRE.slice(1)), vx: Math.cos(a) * range * 3, vy: Math.sin(a) * range * 2.2, drag: 6, life: 340, delay, s0: 0.35, s1: (range / 48) * 0.9, sy: 1.5, rot: a + Math.PI / 2, fade: 1.8 });
      f.emit({ x: x + Math.cos(a) * d, y: y - 4 + Math.sin(a) * d * 0.75, tex: SKT.glow, tint: E.dark, life: 300, delay: delay + 40, s0: 0.3, s1: 0.7, alpha: 0.45 });
    }
    // 열기 초승달 (부채 끝까지 밀려간다)
    f.emit({ x: x + Math.cos(ang) * 8, y: y - 4 + Math.sin(ang) * 6, tex: SKT.crescent, tint: E.main, alpha: 0.75, vx: Math.cos(ang) * range * 4.5, vy: Math.sin(ang) * range * 3.4, drag: 5, life: 300, s0: 0.4, s1: (range / 40) * (arcDeg / 100), rot: ang, fade: 1.2 });
    f.sparks(x + Math.cos(ang) * 10, y - 4, 16, FIRE, range * 5, { ang, spread: half * 2, life: 380 });
    for (let i = 0; i < 6; i++) {
      const a = ang + (Math.random() - 0.5) * half * 2;
      const d = range * rnd(0.4, 1);
      f.light(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 16, E.main, 500, 0.6, 60);
      f.scar(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 10, 0x1a0a04, 1000, 0.45, 150);
    }
  }

  /** 장작 더 넣기: 발밑에서 불기둥이 솟고 불티가 나선으로 감아 오른다, 머리 위 불꽃 문양 */
  stoke(x: number, y: number): void {
    const f = this.fx;
    f.emit({ x, y: y + 2, tex: SKT.pillar, tint: E.main, life: 620, s0: 0.5, s1: 1.2, sy: 1.6, originY: 1, alpha: 0.95 });
    f.emit({ x, y: y + 2, tex: SKT.pillar, tint: 0xfff0b0, life: 420, s0: 0.25, s1: 0.5, sy: 2.2, originY: 1 });
    for (let i = 0; i < 7; i++) this.tongue(x + (i - 3) * 4, y + 1, 18 + (3 - Math.abs(i - 3)) * 7, 520, i * 20);
    for (let i = 0; i < f.n(22); i++)
      f.emit({ x, y, tex: SKT.ember, tint: pick(FIRE), orb: { ox: x, oy: y - 2, r: 14, a: (i / 22) * TAU * 2, v: 9, dr: -6, lift: 60 }, life: 700, delay: i * 18, s0: 1.4, s1: 0.4, fade: 1.5 });
    f.ring(x, y, 26, E.light, 360, 3, 0, DEPTH_GROUND + 4);
    f.light(x, y, 36, E.main, 800, 0.85);
    // 머리 위 불꽃 문양 (작은 모닥불 바퀴)
    f.emit({ x, y: y - 34, tex: SKT.emEmber, tint: E.light, life: 700, s0: 0.05, s1: 0.2, vr: 2, vy: -10, fade: 2.2 });
  }

  /** 불의 고리 기 모으기: 마법진 + 둘레 불씨가 하나씩 켜진다 */
  ringCharge(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    f.circle(x, y, r, "ember", ms);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      f.emit({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.62, tex: SKT.flame, tint: pick(FIRE.slice(1)), life: ms + 60, delay: (i / n) * ms * 0.8, s0: 0.15, s1: 0.32, originY: 1, fade: 3 });
    }
  }

  /** 불의 고리 폭발: 둘레를 따라 불기둥이 솟고 불 물결이 바깥으로 밀려난다 */
  ringBlast(x: number, y: number, r: number): void {
    const f = this.fx;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.tongue(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.56, rnd(26, 40), 520, (i % 4) * 25);
    }
    for (let i = 0; i < f.n(24); i++) {
      const a = (i / 24) * TAU;
      f.emit({ x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 4 - 4, tex: SKT.streak, tint: pick(FIRE), vx: Math.cos(a) * r * 4.2, vy: Math.sin(a) * r * 2.6, drag: 4, life: 420, s0: 0.9, s1: 0.4, stretch: 0.01 });
    }
    f.glow(x, y - 8, r * 1.1, E.dark, 420, 0.3, 0.6);
    f.glow(x, y - 8, r * 0.4, 0xffffff, 180, 0.3, 0.4);
    f.ring(x, y, r * 1.15, E.light, 380, 3, 0, DEPTH_GROUND + 4);
    f.ring(x, y, r * 1.35, E.main, 480, 3, 70, DEPTH_GROUND + 4);
    f.ring(x, y - 10, r * 0.9, E.light, 260, 2);
    f.light(x, y, r * 1.5, E.main, 800, 0.9);
    f.scar(x, y, r * 1.1, 0x1a0a04, 1400, 0.55);
    for (let i = 0; i < f.n(14); i++) f.emit({ x: x + rnd(-r, r), y: y + rnd(-r, r) * 0.6, tex: SKT.ember, tint: pick(FIRE), vy: rnd(-70, -30), life: rnd(800, 1300), delay: rnd(100, 400), s0: 1.3, s1: 0.3 });
  }

  /** 별똥 장작 낙하 (ms 동안): 하늘에서 불붙은 장작이 긴 불꼬리를 끌며 떨어지고, 땅에 그림자가 커진다 */
  meteorFall(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    f.circle(x, y, r, "ember", ms);
    const shadow = this.add.image(x, y, SKT.glow).setDepth(DEPTH_GROUND + 1).setTint(0x000000).setAlpha(0).setScale(0.1, 0.06);
    this.scene.tweens.add({ targets: shadow, alpha: 0.6, scaleX: r / 32, scaleY: (r / 32) * 0.55, duration: ms, ease: "Quad.easeIn", onComplete: () => shadow.destroy() });
    const sx = x + 90;
    const sy = y - 200;
    const ang = Math.atan2(y - sy, x - sx);
    const head = this.add.image(sx, sy, SKT.glow).setDepth(DEPTH_FX + 10).setTint(0xff8a3c).setBlendMode(Phaser.BlendModes.ADD).setScale(1.0);
    const log = this.add.image(sx, sy, SKT.log).setDepth(DEPTH_FX + 11).setScale(2.2).setRotation(ang);
    const st = { t: 0 };
    this.scene.tweens.add({
      targets: st,
      t: 1,
      duration: ms,
      ease: "Quad.easeIn",
      onUpdate: () => {
        const hx = sx + (x - sx) * st.t;
        const hy = sy + (y - 6 - sy) * st.t;
        head.setPosition(hx, hy).setScale(0.8 + st.t * 1.2);
        log.setPosition(hx, hy).setRotation(ang + st.t * 4);
        // 긴 불꼬리 (뒤로 길게 늘어지는 불꽃 + 연기)
        f.emit({ x: hx, y: hy, tex: SKT.flame, tint: pick(FIRE), life: 380, s0: 0.9 + st.t, s1: 0.2, rot: ang + Math.PI / 2, sy: 1.6, fade: 1.2 });
        f.emit({ x: hx - Math.cos(ang) * 10, y: hy - Math.sin(ang) * 10, tex: SKT.streak, tint: 0xffd27a, vx: -Math.cos(ang) * 200, vy: -Math.sin(ang) * 200, drag: 5, life: 260, s0: 1.2, s1: 0.5, stretch: 0.01 });
        if (Math.random() < 0.5) f.emit({ x: hx, y: hy, tex: SKT.cloud, tint: 0x3a2a24, add: false, vx: rnd(-10, 10), vy: rnd(-20, -5), life: 700, s0: 0.5, s1: 1.3, alpha: 0.5 });
      },
      onComplete: () => {
        head.destroy();
        log.destroy();
      },
    });
    // 작은 별똥 둘 (먼저 근처에 떨어진다)
    for (const [dx, dy, d] of [
      [-r * 0.7, r * 0.2, ms * 0.55],
      [r * 0.6, -r * 0.25, ms * 0.75],
    ] as const) {
      f.emit({ x: x + dx + 60, y: y + dy - 140, tex: SKT.streak, tint: 0xffb040, vx: -60 / (d / 1000) / 1.0, vy: 140 / (d / 1000), life: d, s0: 1, s1: 1, stretch: 0.004 });
      this.scene.time.delayedCall(d, () => {
        f.glow(x + dx, y + dy - 4, 16, E.main, 260, 0.3);
        f.sparks(x + dx, y + dy - 4, 6, FIRE, 160, { ang: -Math.PI / 2, spread: 2 });
      });
    }
  }

  /** 별똥 장작 대폭발: 하얀 번쩍 → 불 돔 → 불기둥 → 장작 파편·불티 → 연기 → 불씨 남은 구덩이 */
  meteorImpact(x: number, y: number, r: number): void {
    const f = this.fx;
    f.glow(x, y - 10, r * 1.2, 0xffffff, 180, 0.4, 0.6);
    f.glow(x, y - 10, r * 1.8, E.dark, 520, 0.3, 0.75);
    f.emit({ x, y: y + 4, tex: SKT.pillar, tint: E.main, life: 520, s0: 1.4, s1: 2.2, sy: 1.1, originY: 1, alpha: 0.85 });
    f.emit({ x, y: y + 4, tex: SKT.pillar, tint: 0xffd27a, life: 300, s0: 0.5, s1: 0.9, sy: 1.4, originY: 1, alpha: 0.6 });
    for (let i = 0; i < 3; i++) f.ring(x, y, r * (1.2 + i * 0.35), i === 0 ? 0xffffff : i === 1 ? E.light : E.main, 360 + i * 120, 3, i * 60, DEPTH_GROUND + 4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      this.tongue(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.35, rnd(30, 52), 620, rnd(0, 120));
    }
    f.sparks(x, y - 8, 34, FIRE, r * 7, { life: 520, ay: 140 });
    this.debris(x, y - 6, 9, SKT.log, [0xffffff], 260, false, 1.3);
    for (let i = 0; i < f.n(10); i++) f.emit({ x: x + rnd(-r, r) * 0.6, y: y - rnd(0, 20), tex: SKT.cloud, tint: 0x2a1e1a, add: false, vx: rnd(-30, 30), vy: rnd(-50, -20), life: rnd(900, 1400), delay: rnd(80, 260), s0: 0.8, s1: 2.2, alpha: 0.55, fadeIn: 0.15 });
    f.light(x, y, r * 2.2, E.main, 1100, 1);
    f.scar(x, y, r * 1.2, 0x120604, 2000, 0.7, 120);
    for (let i = 0; i < f.n(18); i++) f.emit({ x: x + rnd(-r, r) * 0.8, y: y + rnd(-r, r) * 0.45, tex: SKT.ember, tint: pick(FIRE), vy: rnd(-40, -10), life: rnd(1000, 1800), delay: rnd(200, 600), s0: 1.3, s1: 0.3, fade: 2 });
  }

  /** 화톳불 놓기: 화톳불이 확 타오르고 바닥에 불이 번진다 */
  brazierPlace(x: number, y: number, r: number): void {
    const f = this.fx;
    f.glow(x, y - 10, 30, E.main, 380, 0.3);
    for (let i = 0; i < 5; i++) this.tongue(x + (i - 2) * 3, y - 2, 22 + (2 - Math.abs(i - 2)) * 8, 480, i * 30);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      for (const k of [0.45, 0.85]) this.tongue(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * 0.62, rnd(10, 18), 420, k * 260 + rnd(0, 60));
    }
    f.ring(x, y, r, E.light, 420, 2, 0, DEPTH_GROUND + 4);
    f.sparks(x, y - 12, 12, FIRE, 180, { ang: -Math.PI / 2, spread: 2 });
  }

  /** 화톳불 바닥 (매 프레임): 바닥 곳곳에서 불꽃 혀가 솟고 불티가 오른다 */
  brazierIdle(x: number, y: number, r: number): void {
    const f = this.fx;
    if (Math.random() < (f.reduced ? 0.15 : 0.55)) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * r * 0.95;
      this.tongue(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.62, rnd(8, 16), rnd(380, 560), 0, FIRE, DEPTH_GROUND + 6);
    }
    if (Math.random() < 0.5) f.emit({ x: x + rnd(-4, 4), y: y - 12, tex: SKT.ember, tint: pick(FIRE), vx: rnd(-12, 12), vy: rnd(-60, -35), life: 700, s0: 1.2, s1: 0.3 });
  }

  /** 화톳불 한 번 칠 때: 열기 고리 */
  brazierTick(x: number, y: number, r: number): void {
    this.fx.ring(x, y, r, E.light, 320, 2, 0, DEPTH_GROUND + 4, 0.5);
    this.fx.light(x, y, r * 1.1, E.main, 360, 0.5);
  }

  /** 큰 모닥불 (궁극) 한 번: 거대한 불기둥 + 둘레를 따라 솟는 불길 + 불 물결 */
  bonfirePulse(x: number, y: number, r: number, i: number, last: boolean): void {
    const f = this.fx;
    f.emit({ x, y: y + 4, tex: SKT.pillar, tint: E.main, life: 620, s0: 1 + i * 0.4, s1: 1.8 + i * 0.5, sy: 1.6, originY: 1, alpha: 0.75 });
    f.emit({ x, y: y + 4, tex: SKT.pillar, tint: 0xffd27a, life: 420, s0: 0.5, s1: 1 + i * 0.3, sy: 1.8, originY: 1, alpha: 0.6 });
    for (let k = 0; k < 9; k++) this.tongue(x + (k - 4) * 5, y + 2, 34 + (4 - Math.abs(k - 4)) * 12 + i * 10, 640, k * 12);
    const n = 18 + i * 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      this.tongue(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.57, rnd(24, 40) + i * 6, 560, (k % 6) * 22);
    }
    for (let k = 0; k < f.n(26); k++) {
      const a = (k / 26) * TAU;
      f.emit({ x, y: y - 4, tex: SKT.streak, tint: pick(FIRE), vx: Math.cos(a) * r * 4.6, vy: Math.sin(a) * r * 2.8, drag: 3.6, life: 480, s0: 1.1, s1: 0.4, stretch: 0.01 });
    }
    f.ring(x, y, r * 1.1, 0xffffff, 380, 3, 0, DEPTH_GROUND + 4);
    f.ring(x, y, r * 1.3, E.main, 520, 3, 80, DEPTH_GROUND + 4);
    f.glow(x, y - 16, r * (last ? 1.6 : 1.1), E.dark, 520, 0.3, 0.6);
    f.light(x, y, r * 1.6, E.main, 900, 1);
    f.scar(x, y, r * 1.1, 0x120604, 1800, 0.55);
    f.sparks(x, y - 30, last ? 30 : 16, FIRE, 300, { ang: -Math.PI / 2, spread: 1.6, life: 700, ay: 80 });
  }

  /** 불씨 옮기기 (패시브 발동): 세로로 확 솟는 작은 불씨 기둥 + 네 갈래 불티 */
  ignitePop(x: number, y: number, r: number): void {
    const f = this.fx;
    this.tongue(x, y, 26, 360);
    f.glow(x, y - 8, r * 1.2, E.main, 240, 0.3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      f.emit({ x, y: y - 6, tex: SKT.streak, tint: 0xffd27a, vx: Math.cos(a) * 160, vy: Math.sin(a) * 110, drag: 5, life: 260, s0: 0.8, s1: 0.3, stretch: 0.012 });
    }
    f.ring(x, y, r, E.light, 240, 2, 0, DEPTH_GROUND + 4);
  }

  // ════════ 서리 묘지기 ════════

  /** 서리 입김: 찬 안개 덩어리가 앞으로 밀려나가고, 지나간 바닥에 서리 가시가 돋는다 */
  breath(x: number, y: number, ang: number, range: number, arcDeg: number): void {
    const f = this.fx;
    const half = (arcDeg / 2) * (Math.PI / 180);
    f.cone(x, y + 2, ang, range, arcDeg, "frost", 120);
    for (let i = 0; i < f.n(16); i++) {
      const a = ang + (Math.random() - 0.5) * half * 1.8;
      const v = range * rnd(3, 4.5);
      f.emit({ x: x + Math.cos(ang) * 5, y: y - 8, tex: SKT.cloud, tint: pick([0xd8f4ff, 0x9fdcff, 0x6ab8f0]), add: i % 2 === 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, drag: 4.2, life: rnd(420, 620), delay: i * 9, s0: 0.3, s1: (range / 48) * rnd(0.8, 1.2), alpha: i % 2 ? 0.55 : 0.45, fade: 1.6 });
    }
    f.sparks(x + Math.cos(ang) * 6, y - 8, 14, ICE, range * 5, { ang, spread: half * 2, life: 380 });
    for (let i = 0; i < f.n(10); i++) {
      const a = ang + (Math.random() - 0.5) * half * 1.7;
      const d = range * rnd(0.35, 1);
      this.spikeUp(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, rnd(7, 12), 700, (d / range) * 140 + 40);
    }
    f.twinkle(x + Math.cos(ang) * range * 0.6, y - 4 + Math.sin(ang) * range * 0.4, 6, range * 0.4, 0xffffff, 500, 0.4);
  }

  /** 고드름 부채 발사: 손끝에 서리꽃 문양이 반짝이고 찬 김이 터진다 */
  icicleLaunch(x: number, y: number, ang: number): void {
    const f = this.fx;
    const hx = x + Math.cos(ang) * 8;
    const hy = y - 8 + Math.sin(ang) * 5;
    f.emit({ x: hx, y: hy, tex: SKT.flower, tint: F.light, life: 300, s0: 0.05, s1: 0.28, vr: 6, fade: 1.2 });
    f.glow(hx, hy, 16, F.main, 220, 0.3);
    for (let i = 0; i < 5; i++) f.emit({ x: hx, y: hy, tex: SKT.cloud, tint: 0xffffff, add: false, vx: Math.cos(ang + rnd(-0.8, 0.8)) * 90, vy: Math.sin(ang + rnd(-0.8, 0.8)) * 60, drag: 5, life: 380, s0: 0.2, s1: 0.6, alpha: 0.6 });
  }

  /** 고드름 꼬리 (투사체가 날아가는 매 프레임) */
  icicleTrail(x: number, y: number, vx: number, vy: number): void {
    const f = this.fx;
    f.emit({ x, y, tex: SKT.streak, tint: 0xe8f8ff, vx: vx * 0.25, vy: vy * 0.25, drag: 8, life: 160, s0: 0.7, s1: 0.3, stretch: 0.012 });
    if (Math.random() < 0.35) f.emit({ x, y, tex: SKT.star, tint: 0xffffff, life: 300, s0: 0.25, s1: 0.05, vy: 10 });
  }

  /** 고드름이 맞고 깨짐 */
  icicleHit(x: number, y: number): void {
    const f = this.fx;
    f.glow(x, y, 12, F.main, 180, 0.3);
    this.debris(x, y, 6, SKT.shard, ICE, 120, false, 1);
    f.emit({ x, y, tex: SKT.star, tint: 0xffffff, life: 200, s0: 0.3, s1: 1.1, fade: 1 });
  }

  /** 서리 방패: 얼음 판 여섯 장이 날아와 육각 껍질로 맞물린다 */
  wardForm(x: number, y: number): void {
    const f = this.fx;
    const cy = y - 9;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const sx = x + Math.cos(a) * 46;
      const sy = cy + Math.sin(a) * 34;
      const tx = x + Math.cos(a) * 13;
      const ty = cy + Math.sin(a) * 12;
      f.emit({ x: sx, y: sy, tex: SKT.icicle, tint: 0xffffff, add: false, vx: (tx - sx) * 6, vy: (ty - sy) * 6, drag: 7.5, life: 300, s0: 0.9, s1: 0.7, rot: a + Math.PI / 2, fade: 4 });
      f.emit({ x: sx, y: sy, tex: SKT.streak, tint: F.light, vx: (tx - sx) * 6, vy: (ty - sy) * 6, drag: 7.5, life: 260, s0: 0.8, s1: 0.3, stretch: 0.01 });
    }
    this.scene.time.delayedCall(240, () => {
      f.glow(x, cy, 30, F.main, 360, 0.3);
      f.emit({ x, y: cy, tex: SKT.star, tint: 0xffffff, life: 320, s0: 0.4, s1: 2.0, fade: 1 });
      f.ring(x, cy, 26, 0xffffff, 300, 2, 0, DEPTH_FX - 1, 0.5);
      f.twinkle(x, cy, 8, 16, 0xffffff, 500, 0.4);
    });
  }

  /** 서리 방패가 있는 동안 (매 프레임): 일렁이는 육각 껍질 */
  wardIdle(x: number, y: number, now: number, on: boolean): void {
    if (!on) {
      this.wardG?.clear();
      return;
    }
    const g = (this.wardG ??= this.add.graphics().setDepth(DEPTH_FX - 2).setBlendMode(Phaser.BlendModes.ADD));
    const cy = y - 9;
    const pulse = 0.5 + 0.5 * Math.sin(now / 160);
    g.clear();
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6 + now / 2400;
      pts.push([x + Math.cos(a) * 13, cy + Math.sin(a) * 12]);
    }
    g.fillStyle(F.main, 0.08 + 0.05 * pulse).beginPath().moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts) g.lineTo(px, py);
    g.closePath().fillPath();
    g.lineStyle(1, 0xffffff, 0.45 + 0.35 * pulse).strokePoints([...pts, pts[0]]);
    if (Math.random() < 0.06) this.fx.twinkle(x, cy, 1, 12, 0xffffff, 400, 0.3);
  }

  /** 서리 방패가 깨짐 */
  wardBreak(x: number, y: number): void {
    this.wardG?.clear();
    this.debris(x, y - 9, 14, SKT.shard, ICE, 160, false, 1.2);
    this.fx.glow(x, y - 9, 24, F.main, 260, 0.3);
  }

  /** 서리꽃 폭발 기 모으기: 둘레의 찬 기운이 안으로 빨려 든다 */
  novaCharge(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    f.circle(x, y, r, "frost", ms);
    for (let i = 0; i < f.n(18); i++) {
      const a = (i / 18) * TAU;
      f.emit({ x: x + Math.cos(a) * r, y: y - 6 + Math.sin(a) * r * 0.62, tex: SKT.streak, tint: pick(ICE), vx: -Math.cos(a) * r * (1000 / ms), vy: -Math.sin(a) * r * 0.62 * (1000 / ms), life: ms, s0: 0.6, s1: 0.3, stretch: 0.012, fadeIn: 0.3 });
    }
  }

  /** 서리꽃 폭발: 발밑에서 거대한 서리꽃이 피고, 얼음 가시가 바깥으로 줄지어 돋는다 */
  novaBloom(x: number, y: number, r: number): void {
    const f = this.fx;
    f.emit({ x, y, tex: SKT.flower, tint: F.main, life: 800, s0: 0.1, s1: (r * 2.1) / 128, sy: 0.62, vr: 0.6, depth: DEPTH_GROUND + 5, fade: 2, alpha: 0.9 });
    f.emit({ x, y, tex: SKT.flower, tint: 0x5a9ae0, life: 600, s0: 0.1, s1: (r * 1.5) / 128, sy: 0.62, rot: Math.PI / 6, vr: -0.8, depth: DEPTH_GROUND + 5 });
    f.emit({ x, y: y - 14, tex: SKT.flower, tint: F.light, life: 420, s0: 0.05, s1: 0.5, vr: 2, fade: 1.2, alpha: 0.9 });
    f.glow(x, y - 8, r * 1.1, F.dark, 420, 0.3, 0.7);
    f.glow(x, y - 8, r * 0.4, 0xffffff, 200, 0.3, 0.35);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      for (const k of [0.35, 0.65, 0.95]) this.spikeUp(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * 0.62, 8 + k * 9, 760, k * 160);
    }
    f.ring(x, y, r * 1.1, 0xffffff, 380, 3, 0, DEPTH_GROUND + 4);
    f.ring(x, y, r * 1.25, F.main, 480, 2, 90, DEPTH_GROUND + 4);
    f.sparks(x, y - 6, 22, ICE, r * 5, { life: 420, ay: 160 });
    for (let i = 0; i < f.n(8); i++) f.emit({ x: x + rnd(-r, r) * 0.7, y: y + rnd(-r, r) * 0.4, tex: SKT.cloud, tint: 0xffffff, add: false, vx: rnd(-20, 20), vy: rnd(-16, -4), life: 900, delay: 160, s0: 0.6, s1: 1.6, alpha: 0.45, fadeIn: 0.2 });
    f.light(x, y, r * 1.4, F.main, 800, 0.8);
    f.scar(x, y, r, 0xe8f8ff, 1600, 0.35, 160);
  }

  /** 얼어붙은 적: 발밑에 얼음 결정이 감싼다 */
  freezeOn(x: number, y: number, size: number): void {
    for (let i = 0; i < 3; i++) this.spikeUp(x + (i - 1) * size * 0.35, y + 1, size * (i === 1 ? 0.9 : 0.6), 900, i * 30, (i - 1) * 0.35);
    this.fx.twinkle(x, y - size * 0.5, 3, size * 0.5, 0xffffff, 600, 0.35);
  }

  /** 안개 걸음: 줄지은 잔상 + 지나간 길에 빛줄·안개가 남는다 */
  mistDash(from: Pt, to: Pt): void {
    const f = this.fx;
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    f.emit({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 8, tex: SKT.streak, tint: 0xffffff, life: 300, s0: 1, s1: 1, sy: 2.4, rot: ang, alpha: 0.95, stretch: 0 });
    f.emit({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 8, tex: SKT.streak, tint: F.main, life: 420, s0: 1, s1: 1, sy: 4, rot: ang, alpha: 0.6 });
    // 늘어나는 빛줄 (선 길이에 맞춰 가로로 늘인다)
    f.emit({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 8, tex: SKT.pillar, tint: F.light, life: 360, s0: 1, s1: 0.4, sy: 0.25, rot: ang + Math.PI / 2, alpha: 0.9 });
    f.beam(from.x, from.y - 8, to.x, to.y - 8, "frost", 320, Math.max(2, len / 30));
    for (let i = 0; i < f.n(12); i++) {
      const t = i / 12;
      f.emit({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - 6, tex: SKT.cloud, tint: pick([0xffffff, 0xe8f8ff]), add: false, vx: rnd(-14, 14), vy: rnd(-12, 0), life: rnd(600, 900), delay: t * 60, s0: 0.5, s1: 1.3, alpha: 0.6, fadeIn: 0.15 });
    }
    f.sparks(to.x, to.y - 8, 10, ICE, 200, { ang: ang + Math.PI, spread: 1.2, life: 300 });
    f.twinkle((from.x + to.x) / 2, (from.y + to.y) / 2 - 6, 8, len / 2, 0xffffff, 500, 0.35);
  }

  /** 지나치며 벤 자국 (X자 얼음 베기) */
  slashMark(x: number, y: number, ang: number): void {
    const f = this.fx;
    for (const d of [-0.7, 0.7]) f.emit({ x, y, tex: SKT.streak, tint: 0xffffff, life: 220, s0: 1.5, s1: 1.8, sy: 0.8, rot: ang + d, fade: 2 });
    f.glow(x, y, 12, F.main, 200, 0.3);
  }

  /** 얼음 무덤 낙하 (ms 동안): 마법진 위로 고드름이 비처럼 쏟아진다 */
  tombRain(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    f.circle(x, y, r, "frost", ms);
    const n = f.n(11);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * r * 0.9;
      const tx = x + Math.cos(a) * d;
      const ty = y + Math.sin(a) * d * 0.62;
      const t = (i / n) * ms * 0.85;
      const fall = 280;
      const delay = Math.max(0, t - fall);
      const h = 150;
      f.emit({ x: tx + 20, y: ty - h, tex: SKT.icicle, tint: 0xd8f4ff, add: false, vx: -20 / (fall / 1000), vy: h / (fall / 1000), life: fall, delay, s0: 1.7, s1: 1.7, sy: 1.3, rot: Math.atan2(h, -20), fade: 8 });
      f.emit({ x: tx + 20, y: ty - h, tex: SKT.streak, tint: F.main, vx: -20 / (fall / 1000), vy: h / (fall / 1000), life: fall, delay, s0: 1.4, s1: 1.4, stretch: 0.005, fade: 8 });
      this.scene.time.delayedCall(delay + fall, () => {
        f.glow(tx, ty - 2, 10, F.main, 180, 0.3);
        this.debris(tx, ty - 2, 3, SKT.shard, ICE, 90);
        this.spikeUp(tx, ty, rnd(8, 13), ms - t + 300, 0);
      });
    }
  }

  /** 얼음 무덤 솟음: 거대한 얼음 결정 무리가 땅을 뚫고 솟았다가 산산이 깨진다 */
  tombRise(x: number, y: number, r: number): void {
    const f = this.fx;
    const crystals: [number, number, number][] = [
      [0, 0, 46],
      [-r * 0.35, 4, 30],
      [r * 0.35, 3, 32],
      [-r * 0.18, -6, 24],
      [r * 0.2, -7, 26],
      [-r * 0.55, -2, 18],
      [r * 0.58, -1, 20],
    ];
    crystals.forEach(([dx, dy, h], i) => this.spikeUp(x + dx, y + dy, h * 1.2, 700, i * 18, (dx / r) * 0.5));
    f.glow(x, y - 20, r * 1.4, F.dark, 520, 0.3, 0.8);
    f.glow(x, y - 20, r * 0.5, 0xffffff, 220, 0.3, 0.4);
    f.emit({ x, y: y + 4, tex: SKT.pillar, tint: F.main, life: 420, s0: 1.4, s1: 2, sy: 0.9, originY: 1, alpha: 0.7 });
    for (let i = 0; i < 3; i++) f.ring(x, y, r * (1.1 + i * 0.3), i ? F.main : 0xffffff, 380 + i * 110, 3, i * 60, DEPTH_GROUND + 4);
    f.light(x, y, r * 1.8, F.main, 1000, 0.9);
    this.scene.time.delayedCall(430, () => {
      this.debris(x, y - 20, 24, SKT.shard, ICE, 260, false, 1.4);
      f.sparks(x, y - 20, 20, ICE, 260, { life: 420, ay: 200 });
      f.emit({ x, y: y - 18, tex: SKT.star, tint: 0xffffff, life: 300, s0: 0.5, s1: 3, fade: 1 });
      for (let i = 0; i < f.n(8); i++) f.emit({ x: x + rnd(-r, r) * 0.6, y: y - rnd(0, 18), tex: SKT.cloud, tint: 0xffffff, add: false, vx: rnd(-30, 30), vy: rnd(-24, -6), life: 1000, s0: 0.8, s1: 2, alpha: 0.5, fadeIn: 0.15 });
    });
    f.scar(x, y, r * 1.1, 0xe8f8ff, 2000, 0.4, 100);
  }

  /** 고요한 서리밭 깔기: 서리 금이 바깥으로 번지며 땅이 얼어붙는다 (바닥 무늬는 스킬이 끝날 때까지 남는다) */
  fieldPlace(x: number, y: number, r: number): Phaser.GameObjects.Image {
    const f = this.fx;
    const k = (r * 2.1) / 128;
    const deco = this.add.image(x, y, SKT.crack).setDepth(DEPTH_GROUND - 1).setTint(0xe8f8ff).setAlpha(0).setScale(0.05, 0.03).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: deco, alpha: 0.85, scaleX: k, scaleY: k * 0.62, duration: 420, ease: "Cubic.easeOut" });
    f.ring(x, y, r, 0xffffff, 460, 3, 0, DEPTH_GROUND + 4);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      this.spikeUp(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.57, rnd(6, 10), 900, 260 + (i % 3) * 40);
    }
    f.twinkle(x, y, 14, r, 0xffffff, 700, 0.4);
    return deco;
  }

  /** 서리밭 (매 프레임): 낮게 깔린 찬 안개 + 반짝임 */
  fieldIdle(x: number, y: number, r: number): void {
    const f = this.fx;
    if (Math.random() < (f.reduced ? 0.1 : 0.3)) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * r;
      f.emit({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.62, tex: SKT.cloud, tint: 0xe8f8ff, add: false, vx: rnd(-8, 8), vy: -4, life: 1200, s0: 0.5, s1: 1.2, alpha: 0.35, fadeIn: 0.3, depth: DEPTH_GROUND + 6 });
    }
    if (Math.random() < 0.2) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * r;
      f.emit({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.62, tex: SKT.star, tint: 0xffffff, life: 500, s0: 0.35, s1: 0.05, vr: 3 });
    }
  }

  /** 서리밭 한 번 칠 때 */
  fieldTick(x: number, y: number, r: number): void {
    this.fx.implode(x, y, r, F.light, 380);
  }

  /** 눈보라 (궁극, 매 프레임): 나를 감싸 도는 눈 줄 + 화면에 흩날리는 눈 */
  blizzardIdle(x: number, y: number, r: number): void {
    const f = this.fx;
    const k = f.reduced ? 1 : f.mobile ? 2 : 4;
    for (let i = 0; i < k; i++) {
      const a = Math.random() * TAU;
      f.emit({ x, y, tex: SKT.streak, tint: pick(ICE), orb: { ox: x, oy: y - rnd(4, 20), r: rnd(r * 0.3, r), a, v: rnd(5, 8), dr: -8 }, life: rnd(380, 600), s0: rnd(0.5, 0.9), s1: 0.3, stretch: 0.008, alpha: 0.9 });
    }
    if (Math.random() < 0.6) {
      const v = this.scene.cameras.main.worldView;
      f.emit({ x: v.x + rnd(-40, v.width), y: v.y + rnd(-30, v.height * 0.7), tex: SKT.streak, tint: 0xffffff, vx: 300, vy: 130, life: 700, s0: 0.6, s1: 0.4, stretch: 0.005, alpha: 0.7 });
    }
  }

  /** 눈보라 한 번 칠 때: 휘도는 고리 */
  blizzardTick(x: number, y: number, r: number): void {
    const f = this.fx;
    f.ring(x, y, r * 0.95, 0xffffff, 320, 2, 0, DEPTH_GROUND + 4, 0.6);
    for (let i = 0; i < f.n(8); i++) f.emit({ x, y, tex: SKT.cloud, tint: 0xffffff, add: false, orb: { ox: x, oy: y - 8, r: r * rnd(0.5, 0.9), a: (i / 8) * TAU, v: 6 }, life: 500, s0: 0.6, s1: 1.2, alpha: 0.5 });
  }

  /** 살얼음 (패시브 발동): 언 적이 맞으면 금이 쩍 간다 */
  brittleCrack(x: number, y: number): void {
    const now = performance.now();
    if (now - this.brittleAt < 140) return;
    this.brittleAt = now;
    this.fx.emit({ x, y, tex: SKT.crack, tint: 0xffffff, life: 260, s0: 0.05, s1: 0.22, rot: Math.random() * 3, fade: 2 });
    this.debris(x, y, 3, SKT.shard, ICE, 80, false, 0.8);
  }

  // ════════ 넋 인도자 ════════

  /** 도깨비불 부르기: 손 앞에 넋불이 맴돌다 흩어진다 */
  wispCast(x: number, y: number): void {
    const f = this.fx;
    f.glow(x, y - 10, 18, S.main, 300, 0.3);
    for (let i = 0; i < 8; i++) f.emit({ x, y, tex: SKT.wisp, tint: pick(SOUL), orb: { ox: x, oy: y - 10, r: 12, a: (i / 8) * TAU, v: 8, dr: 30 }, life: 380, s0: 0.7, s1: 0.2 });
    f.ring(x, y, 18, S.light, 300, 2, 0, DEPTH_GROUND + 4);
  }

  /** 넋불 꼬리 (투사체가 날아가는 매 프레임): 너울거리는 청록·보라 불꽃 */
  wispTrail(x: number, y: number, vx: number, vy: number, pale = false): void {
    const f = this.fx;
    const a = Math.atan2(vy, vx);
    f.emit({ x, y, tex: SKT.flame, tint: pale ? 0xf2ecff : pick([0x9ff0dc, 0xb98aff]), life: 240, s0: 0.38, s1: 0.08, rot: a - Math.PI / 2, vx: -vx * 0.1, vy: -vy * 0.1 - 10, fade: 1.2 });
    if (Math.random() < 0.5) f.emit({ x: x + rnd(-3, 3), y: y + rnd(-3, 3), tex: SKT.wisp, tint: pick(SOUL), vy: -18, life: 380, s0: 0.35, s1: 0.1 });
  }

  /** 넋불이 맞음: 넋 빛이 터지고 작은 넋이 나선으로 피어오른다 */
  wispHit(x: number, y: number): void {
    const f = this.fx;
    f.glow(x, y, 16, S.main, 260, 0.3);
    f.emit({ x, y, tex: SKT.ringThin, tint: S.light, life: 260, s0: 0.05, s1: 0.4, sy: 0.7 });
    for (let i = 0; i < 6; i++) f.emit({ x, y, tex: SKT.wisp, tint: pick(SOUL), orb: { ox: x, oy: y, r: 3, a: (i / 6) * TAU, v: 7, dr: 22, lift: 30 }, life: 500, s0: 0.5, s1: 0.1 });
  }

  /** 넋불 빛줄 (길동무·초롱이 쏘는 짧은 넋불) */
  soulBolt(x0: number, y0: number, x1: number, y1: number, pale = false): void {
    const f = this.fx;
    const ms = 150;
    const vx = (x1 - x0) / (ms / 1000);
    const vy = (y1 - y0) / (ms / 1000);
    f.emit({ x: x0, y: y0, tex: SKT.flame, tint: pale ? 0xf2ecff : 0x9ff0dc, vx, vy, life: ms, s0: 0.5, s1: 0.5, rot: Math.atan2(vy, vx) + Math.PI / 2, fade: 8 });
    f.emit({ x: x0, y: y0, tex: SKT.streak, tint: pale ? 0xffffff : S.light, vx, vy, life: ms, s0: 0.8, s1: 0.8, stretch: 0.006, fade: 8 });
    this.scene.time.delayedCall(ms, () => this.wispHit(x1, y1));
  }

  /** 등불 기도: 위에서 따뜻한 빛기둥이 내려오고, 발밑 후광 + 빛 알갱이가 오른다 */
  lamp(x: number, y: number): void {
    const f = this.fx;
    f.emit({ x, y: y + 2, tex: SKT.pillar, tint: 0xffe8a0, life: 820, s0: 0.9, s1: 1.4, sy: 2.4, originY: 1, alpha: 0.75, fadeIn: 0.15 });
    f.emit({ x, y: y - 30, tex: SKT.emSoul, tint: 0xfff3c8, life: 820, s0: 0.05, s1: 0.16, vy: -6, fade: 2.4 });
    f.ring(x, y, 24, 0xffe8a0, 520, 3, 0, DEPTH_GROUND + 4, 0.4);
    f.ring(x, y, 30, S.light, 640, 2, 120, DEPTH_GROUND + 4, 0.4);
    f.light(x, y, 30, 0xffd27a, 900, 0.8);
    for (let i = 0; i < f.n(20); i++) f.emit({ x: x + rnd(-14, 14), y: y + rnd(-3, 3), tex: i % 3 ? SKT.wisp : SKT.star, tint: pick([0xffe8a0, 0x9ff0dc, 0xffffff]), vx: rnd(-6, 6), vy: rnd(-55, -30), life: rnd(700, 1000), delay: i * 25, s0: i % 3 ? 0.5 : 0.35, s1: 0.1, vr: 2 });
  }

  /** 바람 넋: 몸을 감아 오르는 바람 띠 세 갈래 + 흩날리는 넋 잎 */
  swift(x: number, y: number): void {
    const f = this.fx;
    for (let arm = 0; arm < 3; arm++)
      for (let i = 0; i < f.n(10); i++)
        f.emit({ x, y, tex: SKT.streak, tint: arm === 1 ? 0xffffff : pick([0x9ff0dc, 0xd8c0ff]), orb: { ox: x, oy: y - 2, r: 16 - i * 0.6, a: (arm / 3) * TAU + i * 0.25, v: 10, lift: 50 }, life: 520, delay: i * 22, s0: 0.7, s1: 0.3, stretch: 0.01 });
    f.ring(x, y, 30, S.light, 380, 2, 0, DEPTH_GROUND + 4, 0.3);
    for (let i = 0; i < f.n(8); i++) {
      const a = Math.random() * TAU;
      f.emit({ x: x + Math.cos(a) * 10, y: y - 8, tex: SKT.flame, tint: 0x9ff0dc, vx: Math.cos(a) * 80, vy: Math.sin(a) * 40 - 20, drag: 3, life: 600, s0: 0.2, s1: 0.05, vr: 6 });
    }
  }

  /** 길동무 넋: 묘비가 땅을 뚫고 솟고, 넋 기둥 속에서 길동무가 나온다 */
  friend(x: number, y: number): void {
    const f = this.fx;
    const tomb = this.add.image(x, y + 1, SKT.tomb).setOrigin(0.5, 1).setDepth(DEPTH_FX + 3).setScale(1.6, 0);
    this.scene.tweens.add({ targets: tomb, scaleY: 1.6, duration: 260, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: tomb, scaleY: 0, alpha: 0, delay: 1100, duration: 300, ease: "Quad.easeIn", onComplete: () => tomb.destroy() });
    this.debris(x, y, 8, SKT.ember, [0x6a5a4a, 0x8a7a6a], 90, false, 1.2);
    for (let i = 0; i < f.n(6); i++) f.emit({ x: x + rnd(-8, 8), y: y, tex: SKT.cloud, tint: 0x6a6070, add: false, vx: rnd(-30, 30), vy: -8, life: 600, s0: 0.3, s1: 0.8, alpha: 0.5 });
    this.scene.time.delayedCall(220, () => {
      f.emit({ x, y: y + 2, tex: SKT.pillar, tint: S.main, life: 640, s0: 0.6, s1: 1, sy: 1.4, originY: 1, alpha: 0.6 });
      f.glow(x, y - 14, 22, S.dark, 400, 0.3, 0.7);
      for (let i = 0; i < 10; i++) f.emit({ x, y, tex: SKT.wisp, tint: pick(SOUL), orb: { ox: x, oy: y - 4, r: 10, a: (i / 10) * TAU, v: 6, lift: 40 }, life: 700, s0: 0.6, s1: 0.1 });
    });
  }

  /**
   * 넋 사슬: 넋불이 나 → 적 → 적… 으로 튀며 번개 사슬을 잇고 (연쇄), 마지막에 끌어모은 자리에서 오므라들었다 터진다.
   * targets: 걸린 적 자리 (몸 가운데)
   */
  chain(from: Pt, targets: Pt[], gather: Pt): void {
    const f = this.fx;
    let prev = { x: from.x, y: from.y - 8 };
    const hop = 55;
    targets.forEach((t, i) => {
      const d = i * hop;
      f.beam(prev.x, prev.y, t.x, t.y, "soul", 380, 2, 4, d);
      const p0 = prev;
      // 튀어 가는 넋불
      f.emit({ x: p0.x, y: p0.y, tex: SKT.wisp, tint: 0xffffff, vx: (t.x - p0.x) / (hop / 1000), vy: (t.y - p0.y) / (hop / 1000), life: hop, delay: d, s0: 1.2, s1: 1.2, fade: 8 });
      f.emit({ x: p0.x, y: p0.y, tex: SKT.streak, tint: S.light, vx: (t.x - p0.x) / (hop / 1000), vy: (t.y - p0.y) / (hop / 1000), life: hop, delay: d, s0: 1.2, s1: 1.2, stretch: 0.004, fade: 8 });
      f.glow(t.x, t.y, 16, S.main, 300, 0.3, 1, DEPTH_FX, d + hop);
      f.emit({ x: t.x, y: t.y, tex: SKT.hand, tint: S.light, life: 420, delay: d + hop, s0: 0.4, s1: 0.8, vy: -20, fade: 1.6 });
      prev = { x: t.x, y: t.y };
    });
    const end = targets.length * hop + 60;
    f.implode(gather.x, gather.y, 46, S.light, 260, end);
    this.scene.time.delayedCall(end + 240, () => {
      f.glow(gather.x, gather.y - 8, 34, S.main, 360, 0.3);
      f.glow(gather.x, gather.y - 8, 16, 0xffffff, 160, 0.3);
      f.ring(gather.x, gather.y, 40, S.light, 360, 3, 0, DEPTH_GROUND + 4);
      f.sparks(gather.x, gather.y - 8, 16, SOUL, 220, { life: 360 });
      f.scar(gather.x, gather.y, 24, 0x2a1a4a, 1000, 0.5, 0);
    });
  }

  /** 저승 너울 (떠남): 검보라 장막이 감싸고 넋 조각으로 흩어진다 */
  veilOut(x: number, y: number): void {
    const f = this.fx;
    for (let i = 0; i < 5; i++) f.emit({ x: x + (i - 2) * 5, y: y + 2, tex: SKT.pillar, tint: i % 2 ? 0x2a1450 : 0x4a2a8a, add: false, life: 420, delay: Math.abs(i - 2) * 30, s0: 0.25, s1: 0.4, sy: 1.1, originY: 1, alpha: 0.85, vy: -30, fade: 2 });
    f.emit({ x, y: y - 10, tex: SKT.glow, tint: 0x1a0a30, add: false, life: 360, s0: 0.4, s1: 1, alpha: 0.7 });
    for (let i = 0; i < f.n(14); i++) f.emit({ x: x + rnd(-8, 8), y: y - rnd(0, 20), tex: SKT.wisp, tint: pick(SOUL), vx: rnd(-40, 40), vy: rnd(-70, -20), drag: 2, life: 600, delay: 100, s0: 0.5, s1: 0.1 });
  }

  /** 저승 너울 (나타남): 바닥에 저승 문이 열리고 유령 손이 솟았다 가라앉는다 */
  veilIn(x: number, y: number): void {
    const f = this.fx;
    f.emit({ x, y, tex: SKT.glow, tint: 0x1a0a30, add: false, life: 600, s0: 0.2, s1: 1.1, sy: 0.55, alpha: 0.85, depth: DEPTH_GROUND + 2 });
    f.emit({ x, y, tex: SKT.ringThin, tint: S.light, life: 520, s0: 0.1, s1: 0.5, sy: 0.55, depth: DEPTH_GROUND + 3 });
    f.emit({ x, y, tex: SKT.rune, tint: S.main, life: 600, s0: 0.1, s1: 0.4, sy: 0.55, vr: 3, depth: DEPTH_GROUND + 3 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      f.emit({ x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 7 + 2, tex: SKT.hand, tint: pick([0xd8c0ff, 0x9ff0dc]), life: 520, delay: i * 40, s0: 0.3, s1: 0.75, originY: 1, sy: 1.2, rot: Math.cos(a) * 0.4, fade: 2 });
    }
    f.emit({ x, y: y + 2, tex: SKT.pillar, tint: S.light, life: 380, s0: 0.5, s1: 0.3, sy: 1.2, originY: 1 });
    f.twinkle(x, y - 10, 6, 14, 0x9ff0dc, 500, 0.35);
  }

  /** 넋 소용돌이 열기 (ms): 검보라 소용돌이 눈 + 도는 마법진 */
  vortexOpen(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    f.circle(x, y, r, "soul", ms);
    f.emit({ x, y, tex: SKT.glow, tint: 0x0a0412, add: false, life: ms + 3 * 400 + 200, s0: 0.3, s1: (r * 1.5) / 32, sy: 0.6, alpha: 0.9, fadeIn: 0.15, fade: 4, depth: DEPTH_GROUND + 1 });
    f.emit({ x, y, tex: SKT.rune, tint: S.main, life: ms + 3 * 400 + 200, s0: (r * 1.6) / 128, s1: (r * 1.8) / 128, sy: 0.62, vr: -3, alpha: 0.85, fade: 5, depth: DEPTH_GROUND + 2 });
  }

  /** 넋 소용돌이 한 바퀴: 나선 팔 세 개가 안으로 휘감기고, 적에게서 넋이 빨려 나온다 */
  vortexTick(x: number, y: number, r: number, i: number, last: boolean, victims: Pt[]): void {
    const f = this.fx;
    for (let arm = 0; arm < 3; arm++)
      for (let k = 0; k < f.n(9); k++)
        f.emit({ x, y, tex: k % 2 ? SKT.streak : SKT.flame, tint: k % 3 ? pick(SOUL) : 0xffffff, orb: { ox: x, oy: y - 6, r: r * (1.05 - k * 0.06), a: (arm / 3) * TAU + k * 0.35 + i, v: 6.5, dr: -r * 1.4, lift: 8 }, life: 560, delay: k * 12, s0: k % 2 ? 1.1 : 0.55, s1: 0.25, stretch: k % 2 ? 0.01 : 0, rot: 0, vr: 6 });
    f.implode(x, y, r * 1.2, S.light, 360);
    f.emit({ x, y, tex: SKT.crescent, tint: S.light, life: 420, s0: (r * 2) / 64, s1: (r * 1) / 64, sy: 0.62, rot: i * 2, vr: 9, alpha: 0.8 });
    f.emit({ x, y, tex: SKT.crescent, tint: S.main, life: 420, s0: (r * 2.2) / 64, s1: (r * 1.2) / 64, sy: 0.62, rot: i * 2 + Math.PI, vr: 9, alpha: 0.8 });
    f.glow(x, y - 8, r * (last ? 1.2 : 0.7), S.main, 380, 0.3, 0.9);
    for (const v of victims) {
      f.emit({ x: v.x, y: v.y, tex: SKT.wisp, tint: 0xffffff, vx: (x - v.x) * 3, vy: (y - 8 - v.y) * 3, drag: 1, life: 320, s0: 0.9, s1: 0.3 });
      f.emit({ x: v.x, y: v.y, tex: SKT.streak, tint: S.light, vx: (x - v.x) * 3, vy: (y - 8 - v.y) * 3, drag: 1, life: 320, s0: 0.9, s1: 0.3, stretch: 0.01 });
    }
    if (last) {
      f.ring(x, y, r * 1.3, 0xffffff, 420, 3, 160, DEPTH_GROUND + 4);
      f.sparks(x, y - 8, 26, SOUL, r * 6, { life: 460, delay: 160 });
      f.glow(x, y - 8, r * 1.5, S.light, 360, 0.3, 0.9, DEPTH_FX, 160);
      f.scar(x, y, r, 0x2a1a4a, 1400, 0.5, 200);
    }
  }

  /** 거둔 넋이 나에게 흘러든다 */
  absorb(from: Pt, to: Pt): void {
    for (let i = 0; i < this.fx.n(5); i++) {
      const a = Math.random() * TAU;
      this.fx.emit({ x: from.x, y: from.y - 6, tex: SKT.wisp, tint: pick([0x9ff0dc, 0xe86a8a]), orb: { ox: from.x, oy: from.y - 6, r: 6, a, v: 10, flat: 1 }, vx: (to.x - from.x) * 2.4, vy: (to.y - 10 - from.y) * 2.4, life: 420, delay: i * 40, s0: 0.6, s1: 0.3 });
    }
  }

  /** 넋 거두기 (패시브 발동): 붉은 넋이 나에게 날아든다 (자주 띄우지 않는다) */
  drainWisp(from: Pt, to: Pt): void {
    const now = performance.now();
    if (now - this.drainAt < 260) return;
    this.drainAt = now;
    this.fx.emit({ x: from.x, y: from.y, tex: SKT.wisp, tint: 0xe86a8a, vx: (to.x - from.x) * 2.6, vy: (to.y - 10 - from.y) * 2.6 - 30, life: 380, s0: 0.6, s1: 0.3 });
  }

  /** 망자의 초롱: 땅에서 유령 손 둘이 솟아 초롱을 받쳐 든다 */
  lantern(x: number, y: number): void {
    const f = this.fx;
    for (const s of [-1, 1]) f.emit({ x: x + s * 7, y: y + 2, tex: SKT.hand, tint: 0xd8c0ff, life: 900, s0: 0.3, s1: 0.85, originY: 1, sy: 1.4, rot: -s * 0.35, fade: 3 });
    f.glow(x, y - 12, 26, S.light, 600, 0.3);
    f.ring(x, y, 22, S.light, 420, 2, 0, DEPTH_GROUND + 4);
    f.light(x, y, 26, S.main, 900, 0.7);
    for (let i = 0; i < 10; i++) f.emit({ x, y, tex: SKT.wisp, tint: pick(SOUL), orb: { ox: x, oy: y - 12, r: 14, a: (i / 10) * TAU, v: 5, dr: -14 }, life: 600, s0: 0.5, s1: 0.1 });
  }

  /** 별빛 행렬 (궁극) 한 번 휩쓸기: 넋 행렬이 둘레를 가로지르고, 별빛 기둥이 쏟아진다 */
  processionSweep(x: number, y: number, r: number, dir: 1 | -1): void {
    const f = this.fx;
    const rows = 4;
    for (let row = 0; row < rows; row++) {
      const yy = y + (row / (rows - 1) - 0.5) * r * 1.1;
      for (let k = 0; k < f.n(9); k++) {
        const sx = x - dir * (r + k * 14);
        f.emit({ x: sx, y: yy, tex: SKT.flame, tint: k % 3 ? 0x9ff0dc : 0xfff3c8, vx: dir * r * 3.2, orb: { ox: sx, oy: yy, r: 4, a: k + row, v: 10, flat: 1 }, life: 700, delay: row * 40, s0: 0.55, s1: 0.4, rot: dir * Math.PI / 2 });
        f.emit({ x: sx, y: yy, tex: SKT.wisp, tint: 0xf2ecff, vx: dir * r * 3.2, life: 700, delay: row * 40 + 20, s0: 0.7, s1: 0.4 });
      }
    }
    for (let k = 0; k < f.n(10); k++) {
      const px = x + rnd(-r, r);
      const py = y + rnd(-r, r) * 0.6;
      const d = rnd(0, 300);
      f.emit({ x: px, y: py + 2, tex: SKT.pillar, tint: pick([0xfff3c8, 0x9ff0dc]), life: 500, delay: d, s0: 0.4, s1: 0.8, sy: 2, originY: 1, alpha: 0.9 });
      f.twinkle(px, py - 12, 2, 6, 0xfff3c8, 600, 0.5);
    }
    f.ring(x, y, r, S.light, 520, 3, 0, DEPTH_GROUND + 4, 0.4);
    f.glow(x, y - 12, r * 0.9, S.main, 520, 0.3, 0.8);
    f.light(x, y, r * 1.2, S.main, 900, 0.8);
  }
}
