import * as Phaser from "phaser";
import type { SkillId } from "@/lib/rpg/skillTree";
import { DEPTH_FX, DEPTH_GROUND, PALETTES, pick, rnd, SKT, type SkillFx } from "./skillFx";
import { art } from "./skillArt";

// 스킬 33종의 고유 연출 (판정·수치는 HuntScene/lib/rpg가 하고, 여기는 그림만).
// 같은 갈래라도 모양이 겹치지 않게 연출 키(SKILL_LOOK)로 나눈다:
//   투사체형(불덩이 궤적·꼬리), 부채형, 장판형(바닥이 타오름·얼어붙음), 낙하형(유성·고드름 비), 회오리형,
//   연쇄형(넋이 튀며 이어짐), 돌진형(잔상 줄), 소환형(유령 손·묘비 솟음), 강화형, 궁극기(화면 전체), 패시브 발동
// 특정 게임의 그림·이펙트를 베끼지 않고, 이 마을의 모닥불·서리·넋 이야기에 맞춰 코드로 그린다.
// 스킬마다 고유 그림(skillArt: 모양·색 배합·문양이 다르다)을 주인공으로 쓰고, 작은 빛·불티 입자는 거들기만 한다.
// 단·랭크 강도(skillPower → SkillFx.pw)가 높을수록 크기·층수·입자·광원·흔들림이 커진다.

export type FxKind = "projectile" | "cone" | "ground" | "fall" | "vortex" | "chain" | "dash" | "summon" | "buff" | "ultimate" | "proc" | "passive";

export type SkillLook = {
  /** 연출 키 (스킬마다 다르다) */
  key: string;
  kind: FxKind;
  /** 손맛 무게 0~4 (히트스톱·흔들림·숫자 크기) */
  weight: 0 | 1 | 2 | 3 | 4;
};

/** 스킬 → 연출 키 매핑. 33종 모두 (빠지면 타입 검사가 잡는다) */
export const SKILL_LOOK: Record<SkillId, SkillLook> = {
  // 모닥불지기
  em_kindle: { key: "ember-flick", kind: "projectile", weight: 1 },
  em_hearth: { key: "hearth-glow", kind: "passive", weight: 0 },
  em_fan: { key: "flame-fan", kind: "cone", weight: 2 },
  em_stoke: { key: "stoke-pillar", kind: "buff", weight: 1 },
  em_spark: { key: "spark-crit", kind: "passive", weight: 0 },
  em_ring: { key: "fire-ring", kind: "ground", weight: 2 },
  em_ignite: { key: "ignite-pop", kind: "proc", weight: 1 },
  em_meteor: { key: "meteor-log", kind: "fall", weight: 3 },
  em_brazier: { key: "brazier-ground", kind: "ground", weight: 1 },
  em_bonfire: { key: "bonfire-ult", kind: "ultimate", weight: 4 },
  em_ashheart: { key: "ashheart", kind: "passive", weight: 0 },
  // 서리 묘지기
  fr_breath: { key: "frost-breath", kind: "cone", weight: 1 },
  fr_collar: { key: "collar", kind: "passive", weight: 0 },
  fr_icicle: { key: "icicle-volley", kind: "projectile", weight: 1 },
  fr_brittle: { key: "brittle-crack", kind: "proc", weight: 0 },
  fr_ward: { key: "ice-hex", kind: "buff", weight: 1 },
  fr_nova: { key: "frost-flower", kind: "ground", weight: 2 },
  fr_mist: { key: "mist-dash", kind: "dash", weight: 1 },
  fr_tomb: { key: "icicle-rain", kind: "fall", weight: 3 },
  fr_field: { key: "frost-field", kind: "ground", weight: 1 },
  fr_blizzard: { key: "blizzard-ult", kind: "ultimate", weight: 4 },
  fr_solstice: { key: "solstice", kind: "passive", weight: 0 },
  // 넋 인도자
  so_wisp: { key: "wisp-homing", kind: "projectile", weight: 1 },
  so_lamp: { key: "lamp-prayer", kind: "buff", weight: 0 },
  so_drain: { key: "drain-wisp", kind: "proc", weight: 0 },
  so_swift: { key: "wind-ribbon", kind: "buff", weight: 0 },
  so_friend: { key: "tomb-rise", kind: "summon", weight: 1 },
  so_chain: { key: "soul-chain", kind: "chain", weight: 2 },
  so_veil: { key: "veil-portal", kind: "dash", weight: 1 },
  so_harvest: { key: "soul-vortex", kind: "vortex", weight: 2 },
  so_lantern: { key: "lantern-hands", kind: "summon", weight: 1 },
  so_procession: { key: "procession-ult", kind: "ultimate", weight: 4 },
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

/**
 * 단·랭크 강도 계수: 1단 1랭크 ≈ 0.75 (단정) → 단마다 +0.15, 같은 스킬도 랭크가 오르면 최대 +0.15 (랭크별 강도).
 * 5단 만랭크 ≈ 1.5. 크기·층수·입자·광원·화면 흔들림이 이 값을 따른다
 */
export function skillPower(tier: number, lv: number, maxLevel: number): number {
  const rank = maxLevel > 1 ? (Math.max(1, Math.min(maxLevel, lv)) - 1) / (maxLevel - 1) : 1;
  return 0.75 + 0.15 * (Math.max(1, Math.min(5, tier)) - 1) + 0.15 * rank;
}

export class SkillMoves {
  /** 서리 방패 육각 껍질 (방패가 있는 동안) */
  private wardG: Phaser.GameObjects.Graphics | null = null;
  private drainAt = 0;
  private brittleAt = 0;
  /** 여러 발이 한꺼번에 맞을 때 폭발 꽃을 너무 많이 피우지 않게 (마지막으로 피운 시각) */
  private bloomAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: SkillFx,
  ) {}

  private get add() {
    return this.scene.add;
  }

  /** 단·랭크 강도 (SkillFx.pw) */
  private get P(): number {
    return this.fx.pw;
  }

  /** 스킬 고유 그림 텍스처 키 */
  private art(name: string): string {
    return art(this.scene, name);
  }

  /** 그림을 길이 len(px)으로 보이게 하는 배율 */
  private fit(key: string, len: number): number {
    return len / this.fx.texSize(key);
  }

  /** 폭발 꽃을 피워도 되나 (gap ms 안에 이미 피웠으면 건너뛴다) */
  private bloomReady(gap: number): boolean {
    const now = performance.now();
    if (now - this.bloomAt < gap) return false;
    this.bloomAt = now;
    return true;
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

  /** 불씨 화살: 금빛 다트가 포물선으로 날아가며 (진행 방향으로 머리를 돌린다) 금빛 꼬리를 남긴다 (ms 동안) */
  kindleFly(from: Pt, to: Pt, ms: number): void {
    const f = this.fx;
    const P = this.P;
    const dartKey = this.art("kindle-dart");
    const dart = this.add.image(from.x, from.y - 8, dartKey).setDepth(DEPTH_FX + 4).setBlendMode(Phaser.BlendModes.ADD).setOrigin(0.85, 0.5).setScale(this.fit(dartKey, 26 * P));
    const halo = this.add.image(from.x, from.y - 8, SKT.glow).setDepth(DEPTH_FX + 2).setTint(0xffb040).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9 * P).setAlpha(0.6);
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
        const a = Math.atan2(y - ly, x - lx);
        dart.setPosition(x, y).setRotation(a);
        halo.setPosition(x, y);
        // 진행 방향 꼬리: 지나간 자리에 금빛 다트 잔상 + 불티
        f.emit({ x, y, tex: dartKey, life: 160, s0: this.fit(dartKey, 20 * P), s1: this.fit(dartKey, 8), rot: a, alpha: 0.5, fade: 1 });
        f.emit({ x: (x + lx) / 2, y: (y + ly) / 2, tex: SKT.ember, tint: pick(FIRE), vx: rnd(-20, 20), vy: rnd(-30, 0), life: 300, s0: 1.2, s1: 0.3 });
        lx = x;
        ly = y;
      },
      onComplete: () => {
        dart.destroy();
        halo.destroy();
      },
    });
  }

  /** 불씨 화살 착탄: 여섯 잎 금빛 불꽃 꽃 + 불씨 점 고리 */
  kindleHit(x: number, y: number, r: number): void {
    const f = this.fx;
    f.bloom(x, y - 6, r * 1.2, "ember", 1, { flare: "kindle-burst" });
    f.sparks(x, y - 6, 10, [0xfff8d0, 0xffd27a], 200, { life: 300, ay: 60 });
    f.light(x, y, r * 1.4, 0xffc04a, 480);
    f.scar(x, y, r * 0.7, 0x1a0a04, 800, 0.45);
  }

  /** 불꽃 부채: 진홍 주름 부채가 바라보는 쪽으로 활짝 펼쳐지고, 끝에서 열기 물결이 밀려간다 */
  fan(x: number, y: number, ang: number, range: number, arcDeg: number): void {
    const f = this.fx;
    const P = this.P;
    const sheet = this.art("fan-sheet");
    // 부채 그림의 반쪽 각도는 0.9 rad (≈103°): 판정 부채꼴(arcDeg)에 맞춰 세로 배율을 맞춘다
    const k = range / 120;
    const sy = Math.tan(((arcDeg / 2) * Math.PI) / 180) / Math.tan(0.9);
    f.big({ tex: sheet, x, y, ox: 0.03, oy: 0.5, rot: ang, life: 360, s0: k * 0.25, s1: k, grow: "out", sy: Math.min(1.4, sy), alpha: 0.95, fadeIn: 0.05, fadeOut: 0.55, depth: DEPTH_FX + 3 });
    if (P > 1) f.big({ tex: sheet, x, y, ox: 0.03, oy: 0.5, rot: ang, life: 300, delay: 80, s0: k * 0.4, s1: k * 1.1, grow: "out", sy: Math.min(1.4, sy) * 0.8, alpha: 0.5, fadeOut: 0.6, depth: DEPTH_FX + 4 });
    const wave = this.art("fan-wave");
    f.emit({ x: x + Math.cos(ang) * 6, y: y + Math.sin(ang) * 6, tex: wave, vx: Math.cos(ang) * range * 4, vy: Math.sin(ang) * range * 4, drag: 4.5, life: 340, delay: 60, s0: this.fit(wave, range * 0.4), s1: this.fit(wave, range * 0.9 * P), rot: ang, fade: 1.3 });
    const half = (arcDeg / 2) * (Math.PI / 180);
    f.sparks(x + Math.cos(ang) * 10, y, Math.round(10 * P), [0xff4a2a, 0xffb060, 0xffe0a0], range * 5, { ang, spread: half * 2, life: 360 });
    for (let i = 0; i < Math.round(4 * P); i++) {
      const a = ang + (Math.random() - 0.5) * half * 2;
      const d = range * rnd(0.4, 1);
      f.light(x + Math.cos(a) * d, y + Math.sin(a) * d, 14, 0xff3a2a, 480, 0.55, 60);
      f.scar(x + Math.cos(a) * d, y + Math.sin(a) * d, 9, 0x1a0606, 900, 0.4, 150);
    }
  }

  /** 장작 더 넣기: 발밑에 장작 삼각 문양이 깔리고, 머리 위에 호박색 불꽃 왕관이 솟는다 */
  stoke(x: number, y: number): void {
    const f = this.fx;
    const P = this.P;
    const sig = this.art("stoke-sigil");
    f.big({ tex: sig, x, y, sy: 0.6, depth: DEPTH_GROUND + 3, life: 820, s0: this.fit(sig, 20), s1: this.fit(sig, 46 * P), grow: "back", vr: 1.2, alpha: 0.95, fadeOut: 0.5 });
    const crown = this.art("stoke-crown");
    f.big({ tex: crown, x, y: y - 26, oy: 0.8, life: 900, delay: 120, s0: this.fit(crown, 8), s1: this.fit(crown, 30 * P), grow: "back", alpha: 1, fadeIn: 0.1, fadeOut: 0.4, flick: 0.06, depth: DEPTH_FX + 6 });
    for (let i = 0; i < 5; i++) this.tongue(x + (i - 2) * 4, y + 1, 14 + (2 - Math.abs(i - 2)) * 6, 480, i * 20, [0xfff0c0, 0xffb040, 0xc86020, 0xa04010]);
    for (let i = 0; i < f.n(14); i++)
      f.emit({ x, y, tex: SKT.ember, tint: pick([0xffd27a, 0xffb040, 0xc86020]), orb: { ox: x, oy: y - 2, r: 14, a: (i / 14) * TAU * 2, v: 9, dr: -6, lift: 60 }, life: 700, delay: i * 18, s0: 1.4, s1: 0.4, fade: 1.5 });
    f.light(x, y, 30 * P, 0xffa040, 800, 0.85);
  }

  /** 불의 고리 기 모으기: 바닥에 불꽃 화환이 희미하게 그려지고 둘레 숯불이 하나씩 켜진다 */
  ringCharge(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    const wr = this.art("ring-wreath");
    f.big({ tex: wr, x, y, depth: DEPTH_GROUND + 3, life: ms + 80, s0: (r / 60) * 0.9, s1: r / 60, alpha: 0.35, fadeIn: 0.6, vr: 0.8 });
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      f.emit({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, tex: SKT.flame, tint: pick([0xff3a20, 0xff7a2e]), life: ms + 60, delay: (i / n) * ms * 0.8, s0: 0.15, s1: 0.3, originY: 1, fade: 3 });
    }
  }

  /** 불의 고리 폭발: 불꽃 화환이 판정 원 그대로 확 타오르고 (단·랭크가 높으면 두 겹) 붉은 불 물결이 바깥으로 밀려난다 */
  ringBlast(x: number, y: number, r: number): void {
    const f = this.fx;
    const P = this.P;
    const wr = this.art("ring-wreath");
    f.big({ tex: wr, x, y, depth: DEPTH_FX + 3, life: 560, s0: (r / 60) * 0.5, s1: r / 60, grow: "back", vr: 1.6, alpha: 1, fadeOut: 0.5, flick: 0.04 });
    if (P > 1.05) f.big({ tex: wr, x, y, depth: DEPTH_FX + 2, life: 640, delay: 90, s0: (r / 60) * 0.7, s1: (r / 60) * 1.15, rot: 0.17, vr: -1.2, alpha: 0.55, fadeOut: 0.6 });
    f.bloom(x, y - 8, r * 0.55, "ember", 2, {});
    const n = Math.round(12 * P);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.tongue(x + Math.cos(a) * r, y + Math.sin(a) * r, rnd(18, 30) * P, 480, (i % 4) * 25, [0xffd0a0, 0xff6a30, 0xe8301a, 0xb01810]);
    }
    f.light(x, y, r * 1.4, 0xff4a20, 800, 0.9);
    f.scar(x, y, r, 0x1a0604, 1400, 0.5);
  }

  /** 장작 유성 낙하 (ms 동안): 용암이 갈라진 불덩이가 검붉은 불꼬리를 끌며 떨어지고, 땅에 그림자가 커진다 */
  meteorFall(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    const P = this.P;
    const shadow = this.add.image(x, y, SKT.glow).setDepth(DEPTH_GROUND + 1).setTint(0x000000).setAlpha(0).setScale(0.1, 0.06);
    this.scene.tweens.add({ targets: shadow, alpha: 0.6, scaleX: r / 32, scaleY: (r / 32) * 0.55, duration: ms, ease: "Quad.easeIn", onComplete: () => shadow.destroy() });
    const sx = x + 90;
    const sy = y - 200;
    const ang = Math.atan2(y - sy, x - sx);
    const ck = this.art("meteor-comet");
    const comet = this.add.image(sx, sy, ck).setDepth(DEPTH_FX + 11).setOrigin(0.82, 0.5).setRotation(ang).setScale(this.fit(ck, r * 1.4 * P)).setBlendMode(Phaser.BlendModes.NORMAL);
    const head = this.add.image(sx, sy, SKT.glow).setDepth(DEPTH_FX + 10).setTint(0xff5a20).setBlendMode(Phaser.BlendModes.ADD).setScale(1.0);
    const st = { t: 0 };
    this.scene.tweens.add({
      targets: st,
      t: 1,
      duration: ms,
      ease: "Quad.easeIn",
      onUpdate: () => {
        const hx = sx + (x - sx) * st.t;
        const hy = sy + (y - 6 - sy) * st.t;
        comet.setPosition(hx, hy).setScale(this.fit(ck, r * (0.9 + st.t * 0.6) * P));
        head.setPosition(hx, hy).setScale(0.8 + st.t * 1.4);
        f.emit({ x: hx - Math.cos(ang) * 10, y: hy - Math.sin(ang) * 10, tex: SKT.flame, tint: pick([0xff3a10, 0xc82010, 0xffa040]), life: 360, s0: 0.8 + st.t, s1: 0.2, rot: ang + Math.PI / 2, sy: 1.6, fade: 1.2 });
        if (Math.random() < 0.5) f.emit({ x: hx, y: hy, tex: SKT.cloud, tint: 0x2a1410, add: false, vx: rnd(-10, 10), vy: rnd(-20, -5), life: 700, s0: 0.5, s1: 1.3, alpha: 0.5 });
      },
      onComplete: () => {
        comet.destroy();
        head.destroy();
      },
    });
  }

  /** 장작 유성 대폭발: 용암 왕관이 튀어 오르고 → 갈라진 구덩이가 남고 → 장작 파편·연기 */
  meteorImpact(x: number, y: number, r: number): void {
    const f = this.fx;
    const P = this.P;
    f.bloom(x, y + 2, r * 1.1, "ember", 3, { flare: "meteor-splash", spin: false, oy: 0.95 });
    const cr = this.art("meteor-crater");
    f.big({ tex: cr, x, y, depth: DEPTH_GROUND + 2, life: 2200, s0: this.fit(cr, r * 1.2), s1: this.fit(cr, r * 2.1 * Math.min(P, 1.3)), grow: "out", alpha: 0.95, fadeOut: 0.4 });
    for (let i = 0; i < 3; i++) f.ring(x, y, r * (1.1 + i * 0.3), i === 0 ? 0xffffff : i === 1 ? 0xff8a3c : 0xc82010, 360 + i * 120, 3, i * 60, DEPTH_GROUND + 4);
    f.sparks(x, y - 8, 30, [0xffe0a0, 0xff7a2e, 0xc82010], r * 7, { life: 520, ay: 160 });
    this.debris(x, y - 6, 8, SKT.log, [0xffffff], 260, false, 1.2);
    for (let i = 0; i < f.n(8); i++) f.emit({ x: x + rnd(-r, r) * 0.6, y: y - rnd(0, 20), tex: SKT.cloud, tint: 0x2a1410, add: false, vx: rnd(-30, 30), vy: rnd(-50, -20), life: rnd(900, 1400), delay: rnd(80, 260), s0: 0.8, s1: 2.2, alpha: 0.55, fadeIn: 0.15 });
    f.light(x, y, r * 2.2, 0xff4a1a, 1100, 1);
  }

  /** 화톳불 놓기: 숯 바닥이 판정 원 그대로 깔리고, 밑동이 푸른 불꽃이 확 솟는다 */
  brazierPlace(x: number, y: number, r: number): void {
    const f = this.fx;
    const P = this.P;
    const lick = this.art("brazier-lick");
    for (let i = 0; i < Math.round(4 * P); i++) f.emit({ x: x + (i - 1.5) * 4, y: y - 2, tex: lick, life: 520, delay: i * 40, s0: this.fit(lick, 10), s1: this.fit(lick, 30 * P), originY: 1, vy: -10, fade: 1.4, depth: DEPTH_FX + 3 });
    f.ring(x, y, r, 0x8ad0ff, 420, 2, 0, DEPTH_GROUND + 4);
    f.sparks(x, y - 12, 12, [0xffe0a0, 0x8ad0ff, 0xffa040], 180, { ang: -Math.PI / 2, spread: 2 });
  }

  /** 화톳불 숯 바닥 그림 (머무는 동안 남는다, 판정 원 크기) */
  brazierGround(x: number, y: number, r: number): Phaser.GameObjects.Image {
    const key = this.art("brazier-coals");
    const k = r / 61;
    const deco = this.add.image(x, y, key).setDepth(DEPTH_GROUND - 1).setAlpha(0).setScale(k * 0.3).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: deco, alpha: 0.85, scale: k, duration: 380, ease: "Cubic.easeOut" });
    return deco;
  }

  /** 화톳불 바닥 (매 프레임): 바닥 곳곳에서 밑동이 푸른 불꽃이 솟고 불티가 오른다 */
  brazierIdle(x: number, y: number, r: number): void {
    const f = this.fx;
    if (Math.random() < (f.reduced ? 0.12 : 0.4)) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * r * 0.95;
      const lick = this.art("brazier-lick");
      f.emit({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, tex: lick, life: rnd(420, 600), s0: this.fit(lick, 6), s1: this.fit(lick, rnd(12, 20)), originY: 1, vy: -8, fade: 1.4, depth: DEPTH_GROUND + 6 });
    }
    if (Math.random() < 0.4) f.emit({ x: x + rnd(-4, 4), y: y - 12, tex: SKT.ember, tint: pick(FIRE), vx: rnd(-12, 12), vy: rnd(-60, -35), life: 700, s0: 1.2, s1: 0.3 });
  }

  /** 화톳불 한 번 칠 때: 판정 원을 따라 열기 고리 */
  brazierTick(x: number, y: number, r: number): void {
    this.fx.emit({ x, y, tex: SKT.ringThin, tint: 0x8ad0ff, life: 320, s0: (r * 0.6) / 46, s1: r / 46, depth: DEPTH_GROUND + 4, alpha: 0.6 });
    this.fx.light(x, y, r * 1.1, E.main, 360, 0.5);
  }

  /** 큰 모닥불 (궁극) 박자 하나: 화면 안 적마다 발밑에서 나선 불기둥이 솟는다 */
  bonfireHit(victims: Pt[], i: number, last: boolean): void {
    const f = this.fx;
    const pk = this.art("bonfire-pillar");
    for (const v of victims) {
      const h = (last ? 70 : 48 + i * 4) * Math.min(1.3, this.P);
      f.emit({ x: v.x + rnd(-3, 3), y: v.y + 2, tex: pk, life: last ? 620 : 460, s0: this.fit(pk, h * 0.3), s1: this.fit(pk, h), originY: 1, fade: 1.4, depth: DEPTH_FX + 8 });
      f.glow(v.x, v.y - h * 0.3, h * 0.35, E.main, 300, 0.3, 0.7);
      f.light(v.x, v.y, 22, E.main, 500, 0.8);
      if (last) f.scar(v.x, v.y, 12, 0x120604, 1600, 0.6, 100);
    }
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

  /** 서리 입김: 민트빛 안개 덩어리(말림 무늬)가 부채꼴로 밀려가고, 지나간 바닥에 서리 바늘이 돋는다 */
  breath(x: number, y: number, ang: number, range: number, arcDeg: number): void {
    const f = this.fx;
    const P = this.P;
    const half = (arcDeg / 2) * (Math.PI / 180);
    const plume = this.art("breath-plume");
    const n = Math.round(3 + 2 * P);
    for (let i = 0; i < n; i++) {
      const a = ang + (i / (n - 1) - 0.5) * half * 1.6;
      const v = range * rnd(3, 3.8);
      f.emit({ x: x + Math.cos(ang) * 4, y: y - 4, tex: plume, add: false, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4.4, life: rnd(460, 620), delay: i * 18, s0: this.fit(plume, 10), s1: this.fit(plume, range * 0.7 * P), rot: a, alpha: 0.8, fade: 1.6 });
    }
    const rime = this.art("breath-rime");
    for (let i = 0; i < f.n(8); i++) {
      const a = ang + (Math.random() - 0.5) * half * 1.8;
      const d = range * rnd(0.35, 1);
      f.emit({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, tex: rime, add: false, life: 800, delay: (d / range) * 140 + 40, s0: this.fit(rime, 3), s1: this.fit(rime, rnd(9, 13)), originY: 1, fade: 4, depth: DEPTH_GROUND + 6 });
    }
    f.sparks(x + Math.cos(ang) * 6, y - 6, 8, [0xe8fff8, 0xbff0e0], range * 5, { ang, spread: half * 2, life: 360 });
  }

  /** 고드름 발사: 손끝에서 얼음 조각 별이 반짝이고 찬 김이 터진다 */
  icicleLaunch(x: number, y: number, ang: number): void {
    const f = this.fx;
    const hx = x + Math.cos(ang) * 8;
    const hy = y - 8 + Math.sin(ang) * 5;
    const b = this.art("icicle-burst");
    f.emit({ x: hx, y: hy, tex: b, life: 260, s0: this.fit(b, 4), s1: this.fit(b, 18 * this.P), vr: 6, fade: 1.2 });
    f.glow(hx, hy, 14, F.main, 220, 0.3);
  }

  /** 고드름 꼬리 (투사체가 날아가는 매 프레임): 진행 방향으로 늘어진 고드름 잔상 + 하얀 줄 */
  icicleTrail(x: number, y: number, vx: number, vy: number): void {
    const f = this.fx;
    const a = Math.atan2(vy, vx);
    const lk = this.art("icicle-lance");
    f.emit({ x, y, tex: lk, add: true, life: 150, s0: this.fit(lk, 16), s1: this.fit(lk, 6), rot: a, alpha: 0.45, fade: 1 });
    f.emit({ x, y, tex: SKT.streak, tint: 0xffffff, vx: vx * 0.2, vy: vy * 0.2, drag: 8, life: 140, s0: 0.7, s1: 0.3, sy: 0.6, stretch: 0.012 });
  }

  /** 고드름이 맞고 깨짐: 십자로 튀는 얼음 조각 별 */
  icicleHit(x: number, y: number): void {
    const f = this.fx;
    if (this.bloomReady(70)) f.bloom(x, y, 14, "frost", 1, { flare: "icicle-burst" });
    this.debris(x, y, 4, SKT.shard, ICE, 110, false, 0.9);
  }

  /** 서리 방패: 남색 유리 육각 판 여섯 장이 날아와 맞물리고, 큰 육각 판이 한 번 빛난다 */
  wardForm(x: number, y: number): void {
    const f = this.fx;
    const cy = y - 9;
    const hk = this.art("ward-hex");
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const sx = x + Math.cos(a) * 46;
      const sy = cy + Math.sin(a) * 34;
      const tx = x + Math.cos(a) * 12;
      const ty = cy + Math.sin(a) * 11;
      f.emit({ x: sx, y: sy, tex: hk, add: false, vx: (tx - sx) * 6, vy: (ty - sy) * 6, drag: 7.5, life: 300, s0: this.fit(hk, 10), s1: this.fit(hk, 8), rot: a, fade: 4 });
    }
    this.scene.time.delayedCall(240, () => {
      f.emit({ x, y: cy, tex: hk, life: 420, s0: this.fit(hk, 20), s1: this.fit(hk, 34 * this.P), fade: 1.2, alpha: 0.9 });
      f.glow(x, cy, 26, F.dark, 360, 0.3);
      f.twinkle(x, cy, 6, 16, 0xffffff, 500, 0.4);
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
    g.fillStyle(0x2850b0, 0.1 + 0.05 * pulse).beginPath().moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts) g.lineTo(px, py);
    g.closePath().fillPath();
    g.lineStyle(1, 0xc8ebff, 0.45 + 0.35 * pulse).strokePoints([...pts, pts[0]]);
    if (Math.random() < 0.06) this.fx.twinkle(x, cy, 1, 12, 0xffffff, 400, 0.3);
  }

  /** 서리 방패가 깨짐 */
  wardBreak(x: number, y: number): void {
    this.wardG?.clear();
    const hk = this.art("ward-hex");
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      this.fx.emit({ x, y: y - 9, tex: hk, add: false, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60 - 30, ay: 300, life: 520, s0: this.fit(hk, 8), s1: this.fit(hk, 4), vr: rnd(-8, 8), fade: 2 });
    }
    this.fx.glow(x, y - 9, 24, F.main, 260, 0.3);
  }

  /** 서리꽃 기 모으기: 판정 원 크기의 눈송이가 바닥에 희미하게 비치고 찬 기운이 안으로 빨려 든다 */
  novaCharge(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    const fk = this.art("nova-flake");
    f.big({ tex: fk, x, y, add: true, depth: DEPTH_GROUND + 3, life: ms + 60, s0: this.fit(fk, r * 2 * 0.9), s1: this.fit(fk, r * 2), alpha: 0.35, fadeIn: 0.6, vr: 1 });
    for (let i = 0; i < f.n(14); i++) {
      const a = (i / 14) * TAU;
      f.emit({ x: x + Math.cos(a) * r, y: y - 6 + Math.sin(a) * r, tex: SKT.streak, tint: pick([0xffffff, 0xd8d0ff]), vx: -Math.cos(a) * r * (1000 / ms), vy: -Math.sin(a) * r * (1000 / ms), life: ms, s0: 0.6, s1: 0.3, stretch: 0.012, fadeIn: 0.3 });
    }
  }

  /** 서리꽃 폭발: 판정 원 그대로 거대한 여섯 갈래 눈송이가 피고, 얼음 꽃잎이 사방으로 흩날린다 */
  novaBloom(x: number, y: number, r: number): void {
    const f = this.fx;
    const P = this.P;
    const fk = this.art("nova-flake");
    f.big({ tex: fk, x, y, depth: DEPTH_GROUND + 5, life: 900, s0: this.fit(fk, r * 0.4), s1: this.fit(fk, r * 2), grow: "back", vr: 0.6, alpha: 0.95, fadeOut: 0.45 });
    if (P > 1.05) f.big({ tex: fk, x, y: y - 16, depth: DEPTH_FX + 4, life: 520, s0: this.fit(fk, 8), s1: this.fit(fk, 46 * P), rot: Math.PI / 6, vr: -2, alpha: 0.8, fadeOut: 0.6 });
    f.bloom(x, y - 8, r * 0.6, "frost", 2, { petal: "nova-petal" });
    const rays = Math.round(6 * P);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU;
      this.spikeUp(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, 10 + P * 4, 700, 120);
    }
    f.light(x, y, r * 1.4, 0xb8b0ff, 800, 0.8);
    f.scar(x, y, r, 0xe8f0ff, 1600, 0.35, 160);
  }

  /** 얼어붙은 적: 발밑에 얼음 결정이 감싼다 */
  freezeOn(x: number, y: number, size: number): void {
    for (let i = 0; i < 3; i++) this.spikeUp(x + (i - 1) * size * 0.35, y + 1, size * (i === 1 ? 0.9 : 0.6), 900, i * 30, (i - 1) * 0.35);
    this.fx.twinkle(x, y - size * 0.5, 3, size * 0.5, 0xffffff, 600, 0.35);
  }

  /** 안개 걸음: 지나간 길에 은빛 안개 띠가 깔리고 (판정 띠와 같은 길이), 잔상이 줄지어 남는다 */
  mistDash(from: Pt, to: Pt): void {
    const f = this.fx;
    const P = this.P;
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const len = Math.max(8, Math.hypot(to.x - from.x, to.y - from.y));
    const rib = this.art("mist-ribbon");
    for (let k = 0; k < (P > 1.1 ? 2 : 1); k++)
      f.big({ tex: rib, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 6 - k * 4, rot: ang, life: 520 + k * 120, delay: k * 50, s0: len / 160, s1: (len * 1.08) / 160, sy: 1.2 + k * 0.6, alpha: 0.95 - k * 0.35, fadeIn: 0.05, fadeOut: 0.6, depth: DEPTH_FX + 1 });
    for (let i = 0; i < f.n(8); i++) {
      const t = i / 8;
      f.emit({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - 6, tex: SKT.cloud, tint: pick([0xe0e8f0, 0xc8d4e4]), add: false, vx: rnd(-14, 14), vy: rnd(-12, 0), life: rnd(600, 900), delay: t * 60, s0: 0.5, s1: 1.2, alpha: 0.5, fadeIn: 0.15 });
    }
  }

  /** 지나치며 벤 자국 (은빛 X자 베기) */
  slashMark(x: number, y: number, ang: number): void {
    const ck = this.art("mist-cut");
    this.fx.emit({ x, y, tex: ck, life: 260, s0: this.fit(ck, 10), s1: this.fit(ck, 24 * this.P), rot: ang, fade: 2 });
  }

  /** 얼음 무덤 낙하 (ms 동안): 판정 원 위로 모난 청록 얼음 덩이가 쏟아진다 */
  tombRain(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    const ch = this.art("tomb-chunk");
    const n = f.n(9);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * r * 0.9;
      const tx = x + Math.cos(a) * d;
      const ty = y + Math.sin(a) * d;
      const t = (i / n) * ms * 0.85;
      const fall = 260;
      const delay = Math.max(0, t - fall);
      const h = 150;
      f.emit({ x: tx + 10, y: ty - h, tex: ch, add: false, vx: -10 / (fall / 1000), vy: h / (fall / 1000), life: fall, delay, s0: this.fit(ch, 12), s1: this.fit(ch, 12), vr: 8, fade: 8 });
      f.emit({ x: tx + 10, y: ty - h, tex: SKT.streak, tint: 0x6ad0d0, vx: -10 / (fall / 1000), vy: h / (fall / 1000), life: fall, delay, s0: 1.2, s1: 1.2, stretch: 0.005, fade: 8 });
      this.scene.time.delayedCall(delay + fall, () => {
        f.glow(tx, ty - 2, 10, 0x6ad0d0, 180, 0.3);
        this.debris(tx, ty - 2, 2, ch, [0xffffff], 90, false, this.fit(ch, 6));
      });
    }
  }

  /** 얼음 무덤 솟음: 청록 얼음 비석 무리가 판정 원 안에서 땅을 뚫고 솟았다가 덩이로 깨진다 */
  tombRise(x: number, y: number, r: number): void {
    const f = this.fx;
    const P = this.P;
    const sl = this.art("tomb-slab");
    const slabs: [number, number, number][] = [
      [0, 2, 44],
      [-r * 0.45, -4, 30],
      [r * 0.45, -2, 32],
      [-r * 0.2, 10, 26],
      [r * 0.25, 12, 28],
    ];
    const m = P > 1.2 ? slabs.length : 3;
    slabs.slice(0, m).forEach(([dx, dy, h], i) => f.big({ tex: sl, x: x + dx, y: y + dy, oy: 1, add: false, rot: (dx / r) * 0.25, depth: y + dy, life: 620, delay: i * 30, s0: this.fit(sl, h * 0.2), s1: this.fit(sl, h * P), grow: "back", alpha: 1, fadeOut: 0.2 }));
    f.bloom(x, y - 16, r * 0.8, "frost", 3, {});
    f.light(x, y, r * 1.8, 0x6ad0d0, 1000, 0.9);
    const ch = this.art("tomb-chunk");
    this.scene.time.delayedCall(560, () => {
      this.debris(x, y - 18, 16, ch, [0xffffff], 240, false, this.fit(ch, 9));
      for (let i = 0; i < f.n(6); i++) f.emit({ x: x + rnd(-r, r) * 0.6, y: y - rnd(0, 18), tex: SKT.cloud, tint: 0xd8f8f8, add: false, vx: rnd(-30, 30), vy: rnd(-24, -6), life: 1000, s0: 0.8, s1: 2, alpha: 0.5, fadeIn: 0.15 });
    });
    f.scar(x, y, r * 1.1, 0xd8f8f8, 2000, 0.4, 100);
  }

  /** 고요한 서리밭 깔기: 판정 원 그대로 서리 고사리 무늬가 바깥으로 번진다 (스킬이 끝날 때까지 남는다) */
  fieldPlace(x: number, y: number, r: number): Phaser.GameObjects.Image {
    const f = this.fx;
    const key = this.art("field-ferns");
    const k = r / 92;
    const deco = this.add.image(x, y, key).setDepth(DEPTH_GROUND - 1).setAlpha(0).setScale(k * 0.1).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: deco, alpha: 0.85, scale: k, duration: 520, ease: "Cubic.easeOut" });
    f.twinkle(x, y, 10, r, 0xffffff, 700, 0.4);
    return deco;
  }

  /** 서리밭 (매 프레임): 낮게 깔린 찬 안개 + 반짝임 */
  fieldIdle(x: number, y: number, r: number): void {
    const f = this.fx;
    if (Math.random() < (f.reduced ? 0.1 : 0.25)) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * r;
      f.emit({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, tex: SKT.cloud, tint: 0xe8f8ff, add: false, vx: rnd(-8, 8), vy: -4, life: 1200, s0: 0.5, s1: 1.2, alpha: 0.3, fadeIn: 0.3, depth: DEPTH_GROUND + 6 });
    }
    if (Math.random() < 0.2) {
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * r;
      f.emit({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, tex: SKT.star, tint: 0xffffff, life: 500, s0: 0.35, s1: 0.05, vr: 3 });
    }
  }

  /** 서리밭 한 번 칠 때: 판정 원 테두리에서 안으로 오므라드는 서리 */
  fieldTick(x: number, y: number, r: number): void {
    this.fx.emit({ x, y, tex: SKT.ringThin, tint: 0xffffff, life: 380, s0: r / 46, s1: (r * 0.3) / 46, alpha: 0.7, fade: 3, fadeIn: 0.2, depth: DEPTH_GROUND + 4 });
  }

  /** 한겨울 눈보라 (궁극) 박자 하나: 화면 안 적마다 발밑에서 세 갈래 얼음 첨탑이 솟고 깨진다 */
  blizzardHit(victims: Pt[], i: number, last: boolean): void {
    const f = this.fx;
    const sp = this.art("blizzard-spire");
    const fl = this.art("blizzard-flake");
    for (const v of victims) {
      const h = (last ? 54 : 34 + (i % 3) * 4) * Math.min(1.3, this.P);
      f.emit({ x: v.x + rnd(-2, 2), y: v.y + 2, tex: sp, add: false, life: last ? 640 : 420, s0: this.fit(sp, h * 0.2), s1: this.fit(sp, h), originY: 1, fade: 5, depth: v.y + 3 });
      f.glow(v.x, v.y - h * 0.4, h * 0.3, F.main, 260, 0.3, 0.6);
      if (last) for (let k = 0; k < 3; k++) f.emit({ x: v.x, y: v.y - h * 0.5, tex: fl, vx: rnd(-60, 60), vy: rnd(-70, -20), ay: 120, life: 600, s0: 0.5, s1: 0.2, vr: 6, delay: 300 });
    }
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

  /** 도깨비불 부르기: 손 앞에 청록 넋불이 맴돌다 흩어진다 */
  wispCast(x: number, y: number): void {
    const f = this.fx;
    const wk = this.art("wisp-orb");
    f.glow(x, y - 10, 16, 0x5ad8b8, 300, 0.3);
    for (let i = 0; i < 5; i++) f.emit({ x, y, tex: wk, orb: { ox: x, oy: y - 10, r: 12, a: (i / 5) * TAU, v: 8, dr: 30 }, life: 380, s0: this.fit(wk, 10 * this.P), s1: this.fit(wk, 3) });
  }

  /** 넋불 꼬리 (투사체가 날아가는 매 프레임): 진행 방향 뒤로 늘어지는 청록 넋불 잔상 */
  wispTrail(x: number, y: number, vx: number, vy: number, pale = false): void {
    const f = this.fx;
    const a = Math.atan2(vy, vx);
    const wk = this.art("wisp-orb");
    f.emit({ x, y, tex: wk, tint: pale ? 0xf2ecff : 0xffffff, life: 220, s0: this.fit(wk, 12), s1: this.fit(wk, 3), rot: a - Math.PI / 2, vx: -vx * 0.1, vy: -vy * 0.1 - 10, fade: 1.2 });
    if (Math.random() < 0.4) f.emit({ x: x + rnd(-3, 3), y: y + rnd(-3, 3), tex: SKT.wisp, tint: 0x9ff0dc, vy: -18, life: 360, s0: 0.35, s1: 0.1 });
  }

  /** 넋불이 맞음: 나선으로 풀리는 청록 넋 연기 */
  wispHit(x: number, y: number, big = true): void {
    const f = this.fx;
    if (big && this.bloomReady(70)) f.bloom(x, y, 16, "soul", 1, { flare: "wisp-burst" });
    else f.glow(x, y, 12, 0x5ad8b8, 220, 0.3);
  }

  /** 넋불 빛줄 (길동무·초롱이 쏘는 짧은 넋불) */
  soulBolt(x0: number, y0: number, x1: number, y1: number, pale = false): void {
    const f = this.fx;
    const ms = 150;
    const vx = (x1 - x0) / (ms / 1000);
    const vy = (y1 - y0) / (ms / 1000);
    f.emit({ x: x0, y: y0, tex: SKT.flame, tint: pale ? 0xfff0c0 : 0xd8c0ff, vx, vy, life: ms, s0: 0.5, s1: 0.5, rot: Math.atan2(vy, vx) + Math.PI / 2, fade: 8 });
    f.emit({ x: x0, y: y0, tex: SKT.streak, tint: pale ? 0xffe8a0 : S.light, vx, vy, life: ms, s0: 0.8, s1: 0.8, stretch: 0.006, fade: 8 });
    this.scene.time.delayedCall(ms, () => f.glow(x1, y1, 10, pale ? 0xffd27a : S.main, 200, 0.3));
  }

  /** 등불 기도: 발밑에 금빛 연꽃 등이 피고, 따뜻한 빛 알갱이가 오른다 */
  lamp(x: number, y: number): void {
    const f = this.fx;
    const lk = this.art("lamp-lotus");
    f.big({ tex: lk, x, y: y + 3, oy: 0.9, depth: DEPTH_FX + 2, life: 1000, s0: this.fit(lk, 10), s1: this.fit(lk, 36 * this.P), grow: "back", alpha: 1, fadeIn: 0.1, fadeOut: 0.4 });
    f.light(x, y, 30, 0xffd27a, 900, 0.8);
    for (let i = 0; i < f.n(14); i++) f.emit({ x: x + rnd(-12, 12), y: y + rnd(-3, 3), tex: SKT.star, tint: pick([0xffe8a0, 0xffffff]), vx: rnd(-6, 6), vy: rnd(-55, -30), life: rnd(700, 1000), delay: i * 30, s0: 0.35, s1: 0.1, vr: 2 });
  }

  /** 바람 넋: 민트빛 잎이 몸을 감아 오르며 흩날린다 */
  swift(x: number, y: number): void {
    const f = this.fx;
    const lf = this.art("swift-leaf");
    for (let arm = 0; arm < 3; arm++)
      for (let i = 0; i < f.n(5); i++)
        f.emit({ x, y, tex: lf, orb: { ox: x, oy: y - 2, r: 15 - i * 0.8, a: (arm / 3) * TAU + i * 0.4, v: 10, lift: 50 }, life: 560, delay: i * 30, s0: this.fit(lf, 9), s1: this.fit(lf, 5), vr: 8 });
    f.ring(x, y, 26, 0x9ff0dc, 380, 2, 0, DEPTH_GROUND + 4, 0.3);
  }

  /** 길동무 넋 (묘비 소환): 새김 글자가 보랏빛으로 빛나는 돌 묘비가 땅을 뚫고 솟는다 */
  friend(x: number, y: number): void {
    const f = this.fx;
    const sk = this.art("friend-stone");
    const k = this.fit(sk, 22 * this.P);
    const stone = this.add.image(x, y + 1, sk).setOrigin(0.5, 1).setDepth(DEPTH_FX + 3).setScale(k, 0);
    this.scene.tweens.add({ targets: stone, scaleY: k, duration: 260, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: stone, scaleY: 0, alpha: 0, delay: 1100, duration: 300, ease: "Quad.easeIn", onComplete: () => stone.destroy() });
    this.debris(x, y, 6, SKT.ember, [0x6a5a4a, 0x8a7a6a], 90, false, 1.2);
    this.scene.time.delayedCall(220, () => {
      f.glow(x, y - 14, 20, 0x9a6ae0, 400, 0.3, 0.7);
      f.twinkle(x, y - 14, 5, 10, 0xd8c0ff, 500, 0.4);
    });
  }

  /**
   * 넋 사슬: 보랏빛 쇠사슬이 나 → 적 → 적… 으로 이어지고 (연쇄), 끌어모은 자리에 봉인 고리가 찍힌다.
   * targets: 걸린 적 자리 (몸 가운데)
   */
  chain(from: Pt, targets: Pt[], gather: Pt): void {
    const f = this.fx;
    const lk = this.art("chain-link");
    let prev = { x: from.x, y: from.y - 8 };
    const hop = 55;
    targets.forEach((t, i) => {
      const d = i * hop;
      const ang = Math.atan2(t.y - prev.y, t.x - prev.x);
      const len = Math.hypot(t.x - prev.x, t.y - prev.y);
      const step = 9;
      for (let s = step / 2; s < len; s += step) {
        const k = s / len;
        f.emit({ x: prev.x + (t.x - prev.x) * k, y: prev.y + (t.y - prev.y) * k, tex: lk, add: false, life: 520, delay: d + k * hop, s0: this.fit(lk, 10), s1: this.fit(lk, 10), rot: ang, fade: 4 });
      }
      f.glow(t.x, t.y, 14, S.main, 300, 0.3, 1, DEPTH_FX, d + hop);
      prev = { x: t.x, y: t.y };
    });
    const end = targets.length * hop + 60;
    this.scene.time.delayedCall(end, () => f.bloom(gather.x, gather.y - 4, 34, "soul", 2, { flare: "chain-seal" }));
  }

  /** 저승 너울 (떠남): 검보라 장막이 위에서 드리워 나를 덮는다 */
  veilOut(x: number, y: number): void {
    const f = this.fx;
    const vk = this.art("veil-drape");
    f.emit({ x, y: y - 26, tex: vk, add: false, vy: 40, life: 420, s0: this.fit(vk, 22), s1: this.fit(vk, 30 * this.P), originY: 0, alpha: 0.95, fade: 2 });
    for (let i = 0; i < f.n(10); i++) f.emit({ x: x + rnd(-8, 8), y: y - rnd(0, 20), tex: SKT.wisp, tint: pick(SOUL), vx: rnd(-40, 40), vy: rnd(-70, -20), drag: 2, life: 600, delay: 100, s0: 0.5, s1: 0.1 });
  }

  /** 저승 너울 (나타남): 장막이 걷히듯 위로 올라가며 사라진다 */
  veilIn(x: number, y: number): void {
    const f = this.fx;
    const vk = this.art("veil-drape");
    f.emit({ x, y: y - 26, tex: vk, add: false, vy: -60, life: 460, s0: this.fit(vk, 30 * this.P), s1: this.fit(vk, 18), originY: 0, alpha: 0.85, fade: 1.5 });
    f.twinkle(x, y - 10, 6, 14, 0xd8c0ff, 500, 0.35);
  }

  /** 넋 소용돌이 열기 (ms): 판정 원 크기의 자홍·보라 은하 소용돌이가 바닥에서 돈다 */
  vortexOpen(x: number, y: number, r: number, ms: number): void {
    const f = this.fx;
    const vk = this.art("harvest-vortex");
    f.big({ tex: vk, x, y, depth: DEPTH_GROUND + 2, life: ms + 3 * 400 + 200, s0: this.fit(vk, r * 0.6), s1: this.fit(vk, r * 2.1), grow: "out", vr: -3.4 * Math.min(1.3, this.P), alpha: 0.9, fadeIn: 0.1, fadeOut: 0.2 });
  }

  /** 넋 소용돌이 한 바퀴: 걸린 적에게서 입을 벌린 넋이 끌려 나와 가운데로 빨려 든다 */
  vortexTick(x: number, y: number, r: number, i: number, last: boolean, victims: Pt[]): void {
    const f = this.fx;
    const sk = this.art("harvest-soul");
    for (const v of victims) f.emit({ x: v.x, y: v.y, tex: sk, orb: { ox: x, oy: y - 6, r: Math.hypot(v.x - x, v.y - y), a: Math.atan2(v.y - y, v.x - x), v: 5, dr: -r * 2, flat: 1 }, life: 420, s0: this.fit(sk, 12 * this.P), s1: this.fit(sk, 4), fade: 1.5 });
    f.glow(x, y - 6, r * (last ? 1 : 0.6), 0xd060e0, 360, 0.3, 0.7);
    if (last) {
      this.scene.time.delayedCall(160, () => f.bloom(x, y - 6, r, "soul", 3, { flare: "harvest-vortex" }));
      f.scar(x, y, r, 0x2a0a3a, 1400, 0.5, 200);
    } else f.emit({ x, y, tex: SKT.ringThin, tint: 0xf080e0, life: 360, s0: r / 46, s1: (r * 0.2) / 46, alpha: 0.8, fade: 3, depth: DEPTH_GROUND + 4 });
    void i;
  }

  /** 거둔 넋이 나에게 흘러든다 */
  absorb(from: Pt, to: Pt): void {
    for (let i = 0; i < this.fx.n(4); i++) {
      const a = Math.random() * TAU;
      this.fx.emit({ x: from.x, y: from.y - 6, tex: SKT.wisp, tint: pick([0xf080e0, 0xe86a8a]), orb: { ox: from.x, oy: from.y - 6, r: 6, a, v: 10, flat: 1 }, vx: (to.x - from.x) * 2.4, vy: (to.y - 10 - from.y) * 2.4, life: 420, delay: i * 40, s0: 0.6, s1: 0.3 });
    }
  }

  /** 넋 거두기 (패시브 발동): 붉은 넋이 나에게 날아든다 (자주 띄우지 않는다) */
  drainWisp(from: Pt, to: Pt): void {
    const now = performance.now();
    if (now - this.drainAt < 260) return;
    this.drainAt = now;
    this.fx.emit({ x: from.x, y: from.y, tex: SKT.wisp, tint: 0xe86a8a, vx: (to.x - from.x) * 2.6, vy: (to.y - 10 - from.y) * 2.6 - 30, life: 380, s0: 0.6, s1: 0.3 });
  }

  /** 망자의 초롱 (유령 손): 땅에서 연보라 유령 손 둘이 솟아 금빛 초롱을 받쳐 든다 */
  lantern(x: number, y: number): void {
    const f = this.fx;
    const hk = this.art("lantern-hand");
    const P = this.P;
    for (const s of [-1, 1]) f.emit({ x: x + s * 6, y: y + 2, tex: hk, life: 1000, s0: this.fit(hk, 8), s1: this.fit(hk, 24 * P), originY: 1, rot: -s * 0.3, fade: 3, alpha: 0.9 });
    const lk = this.art("lantern-lamp");
    f.emit({ x, y: y - 22 * P, tex: lk, add: false, life: 900, delay: 200, s0: this.fit(lk, 4), s1: this.fit(lk, 12 * P), fade: 3 });
    f.light(x, y, 24, 0xffd27a, 900, 0.7);
  }

  /** 별빛 행렬 (궁극) 박자 하나: 화면 안 적마다 하늘에서 금빛 별빛이 내리꽂히고 작은 별이 핀다 */
  processionHit(victims: Pt[], i: number, last: boolean): void {
    const f = this.fx;
    const bk = this.art("proc-beam");
    const sk = this.art("proc-star");
    for (const v of victims) {
      const h = 110 * Math.min(1.3, this.P);
      f.emit({ x: v.x, y: v.y + 2, tex: bk, life: last ? 560 : 380, s0: this.fit(bk, h), s1: this.fit(bk, h), sy: 1, originY: 1, fade: 2, depth: DEPTH_FX + 8, alpha: 0.95 });
      f.emit({ x: v.x, y: v.y - 6, tex: sk, life: 420, s0: this.fit(sk, 6), s1: this.fit(sk, last ? 34 : 22), vr: 2, fade: 1.4, depth: DEPTH_FX + 9 });
      f.light(v.x, v.y, 18, 0xfff3c8, 400, 0.7);
    }
    void i;
  }
}
