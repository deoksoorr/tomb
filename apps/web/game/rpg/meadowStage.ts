import * as Phaser from "phaser";
import type { BugSpawn } from "@/lib/rpg/plan";
import type { MeadowTone } from "@/lib/rpg/types";
import { bugSound, type BugSoundEv, type BugSoundOpt } from "./bugSound";
import { BIT, DECOR_VARIANTS, ensureMeadowTextures, MEADOW_TEXT, MTEX } from "./meadowArt";
import {
  comboShout,
  comboTier,
  flyFrom,
  flyInMs,
  insectArt,
  landEase,
  meadowDecor,
  meadowLayout,
  perchOf,
  pickBush,
  type InsectArt,
  type MeadowLayout,
} from "./meadowLayout";
import type { RpgSfx } from "./sfx";

// 32번 곤충 채집 들판 (BugsScene meadow 테마의 그림·연출·소리). 규칙(출현·점수·콤보)은 BugsScene이 그대로 갖고,
// 여기는 "보이는 것"만 맡는다: 들판 한 장 + 덤불 9개 + 키 팻말, 날아 들어와 앉는 곤충, 잠자리채 잡기·헛치기, 꽃잎·빛 가루, 콤보 외침.
// 곤충은 출현 시각부터 이미 잡힌다(판정은 BugsScene) — 날아오는 그림은 보기만 그렇다.
// 가벼움: 곤충·그물·조각은 풀(pool)에서 꺼내 쓰고 다시 넣는다. 매 프레임 새 객체를 만들지 않는다.
// 움직임 줄이기면 흔들림·풀 살랑임·그물 휘두르기·외침 튀어오르기를 끄고 조각 수를 줄인다.

type Hooks = {
  /** 화면 해상도 글자 (BugsScene.label) */
  label(x: number, y: number, text: string, color: string, px: number): Phaser.GameObjects.Text;
  /** 떠오르며 사라지는 글자 (BugsScene.floatText) */
  float(x: number, y: number, text: string, color: string, px: number): void;
};

type Body = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  free: boolean;
};

type Bug = {
  s: BugSpawn;
  art: InsectArt;
  body: Body;
  from: { x: number; y: number };
  to: { x: number; y: number };
  born: number;
  fly: number;
  /** in: 날아오는 중 · perch: 앉음 · leave: 떠나는 중(트윈) */
  state: "in" | "perch" | "leave";
  /** 날갯짓 박자 어긋남 */
  phase: number;
  trailAt: number;
};

type Bit = { img: Phaser.GameObjects.Image; vx: number; vy: number; g: number; life: number; age: number; spin: number; on: boolean };
type Net = { img: Phaser.GameObjects.Sprite; busy: boolean };
type Mote = { img: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number };

const POOL_BITS = 56;
const NETS = 3;
/** 그물 이미지에서 손잡이 끝 → 테 가운데 (회전 0일 때) */
const HOOP = { dx: -27, dy: -27 };
const D = { ground: -10000, decor: -5000, bug: 5000, net: 7000, bits: 7500, shade: 8000, text: 9000 } as const;

function coarsePointer(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export class MeadowStage {
  layout: MeadowLayout = meadowLayout(false);
  private ground!: Phaser.GameObjects.TileSprite;
  private shade: Phaser.GameObjects.Image | null = null;
  private sun: Phaser.GameObjects.Image | null = null;
  private statics: Phaser.GameObjects.GameObject[] = [];
  private bushImgs: Phaser.GameObjects.Image[] = [];
  private tufts: Phaser.GameObjects.Image[] = [];
  private bodies: Body[] = [];
  private bugs: Bug[] = [];
  private bits: Bit[] = [];
  private nets: Net[] = [];
  private motes: Mote[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private visits = new Array<number>(9).fill(0);
  private readonly touch = coarsePointer();
  /** 연출 시계 (멈춤 동안은 흐르지 않는다) */
  private t = 0;
  private tier = 0;
  private zoom = 0;
  /** 작은 화면(줌이 낮을 때)은 곤충을 조금 크게 그린다 — 휴대폰에서도 무엇이 앉았는지 한눈에 */
  private bugScale = 1;
  private view = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sfx: RpgSfx,
    readonly tone: MeadowTone,
    private readonly reduced: boolean,
    private readonly hooks: Hooks,
  ) {}

  build(): void {
    const sc = this.scene;
    const bgs: Record<MeadowTone, string> = { day: "#55613a", dusk: "#4e4430", night: "#1a2230" };
    sc.cameras.main.setBackgroundColor(bgs[this.tone]);
    ensureMeadowTextures(sc, this.tone, this.layout.bushes);
    this.ground = sc.add.tileSprite(0, 0, 64, 64, MTEX.ground(this.tone)).setDepth(D.ground);
    if (this.tone !== "day") {
      this.shade = sc.add
        .image(0, 0, MTEX.shade)
        .setDepth(D.shade)
        .setTint(this.tone === "night" ? 0x060a1c : 0x401028)
        .setAlpha(this.tone === "night" ? 0.75 : 0.55);
    }
    // 노을: 낮게 기운 해의 주황빛이 왼쪽 위에서 번진다
    if (this.tone === "dusk") this.sun = sc.add.image(0, 0, MTEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7a30).setAlpha(0.32).setDepth(D.shade - 1);
    for (let i = 0; i < POOL_BITS; i++) {
      const img = sc.add.image(0, 0, MTEX.bits, 0).setDepth(D.bits).setVisible(false);
      this.bits.push({ img, vx: 0, vy: 0, g: 0, life: 1, age: 0, spin: 0, on: false });
    }
    for (let i = 0; i < NETS; i++) this.nets.push({ img: sc.add.sprite(0, 0, MTEX.net, 0).setOrigin(40 / 44, 40 / 44).setDepth(D.net).setVisible(false), busy: false });
    this.buildAmbient();
  }

  /** 시간대 분위기: 낮 = 구름 그림자·꽃가루, 노을 = 금빛 먼지, 밤 = 떠다니는 작은 반딧불 (잡는 곤충과 헷갈리지 않게 작고 흐리게) */
  private buildAmbient(): void {
    const sc = this.scene;
    const n = this.reduced ? 4 : this.tone === "night" ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const img =
        this.tone === "night"
          ? sc.add.image(0, 0, MTEX.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(0.22).setAlpha(0.7)
          : sc.add.image(0, 0, MTEX.bits, BIT.dust).setAlpha(this.tone === "dusk" ? 0.75 : 0.5);
      img.setDepth(D.bits - 1);
      this.motes.push({ img, x: (i * 97) % 300, y: (i * 61) % 220, ph: i * 1.7, sp: 0.6 + (i % 3) * 0.25 });
    }
    if (this.tone === "day")
      for (let i = 0; i < 2; i++) this.clouds.push(sc.add.image(0, 0, MTEX.cloud).setScale(4.5, 2.6).setAlpha(0.35).setDepth(D.bug - 1000));
  }

  /** 들판·덤불·팻말을 지금 배치로 놓는다 (가로·세로 화면이 바뀌면 다시) */
  private place(portrait: boolean): void {
    const sc = this.scene;
    for (const o of this.statics) o.destroy();
    this.statics = [];
    this.bushImgs = [];
    this.tufts = [];
    this.layout = meadowLayout(portrait);
    const l = this.layout;
    for (const d of meadowDecor(l)) {
      const img = sc.add.image(d.x, d.y, MTEX.decor(d.kind, d.v % DECOR_VARIANTS, this.tone));
      if (d.kind === "tuft") {
        img.setOrigin(0.5, 1).setDepth(d.y);
        this.tufts.push(img);
      } else img.setDepth(D.decor + d.y);
      this.statics.push(img);
    }
    for (const b of l.bushes) {
      const img = sc.add.image(b.x, b.y, MTEX.bush(b.slot, this.tone)).setDepth(b.y);
      this.bushImgs.push(img);
      this.statics.push(img);
      if (this.touch) continue;
      // 키 팻말 (덤불 오른쪽 앞) — 손가락 화면에서는 숨긴다
      const sx = b.x + Math.round(b.r * 0.78);
      const sy = b.y + Math.round(b.r * 0.86);
      const sign = sc.add.image(sx, sy, MTEX.sign(this.tone)).setOrigin(0.5, 1).setDepth(sy);
      const px = Math.max(10, Math.min(16, Math.round(this.scene.cameras.main.zoom * 4.6)));
      const key = this.hooks.label(sx, sy - 5, "QWEASDZXC"[b.slot], this.tone === "night" ? "#e8dcc0" : "#fff4dc", px).setDepth(sy + 0.5);
      this.statics.push(sign, key);
    }
    // 앉아 있던 곤충은 새 자리로
    for (const bug of this.bugs) {
      const to = perchOf(l.bushes[bug.s.slot]);
      bug.to = to;
      if (bug.state === "perch") bug.body.sprite.setPosition(to.x, to.y);
    }
  }

  /** 카메라 맞추기: 덤불 구역이 HUD(위 점수판·아래 안내)를 피해 다 보이게. 돌려준 값은 줌 */
  fit(): number {
    const cam = this.scene.cameras.main;
    const portrait = cam.height > cam.width * 1.05;
    const l = portrait === this.layout.portrait ? this.layout : meadowLayout(portrait);
    const top = 84;
    const bottom = this.touch ? 20 : 40;
    const z = Math.max(1, Math.floor(Math.min(cam.width / (l.w + 16), (cam.height - top - bottom) / (l.h + 16)) * 8) / 8);
    cam.setZoom(z);
    // 팻말 글자 크기가 줌을 따라가므로 줌이 바뀌어도 다시 놓는다
    if (!this.statics.length || portrait !== this.layout.portrait || z !== this.zoom) this.place(portrait);
    this.zoom = z;
    this.bugScale = z < 2 ? 1.3 : 1;
    const cx = l.w / 2;
    const cy = l.h / 2 - (top - bottom) / 2 / z;
    cam.centerOn(cx, cy);
    const w = cam.width / z;
    const h = cam.height / z;
    this.view = { x: cx - w / 2, y: cy - h / 2, w, h };
    // 바닥은 보이는 만큼만 (무늬는 월드에 고정)
    this.ground.setPosition(cx, cy).setSize(w + 32, h + 32);
    this.ground.setTilePosition(cx - (w + 32) / 2, cy - (h + 32) / 2);
    this.shade?.setPosition(cx, cy).setDisplaySize(w * 1.15, h * 1.15);
    this.sun?.setPosition(cx - w * 0.42, cy - h * 0.45).setDisplaySize(Math.max(w, h) * 1.5, Math.max(w, h) * 1.5);
    return z;
  }

  slotAt(x: number, y: number): number {
    return pickBush(this.layout, x, y);
  }

  // ── 곤충 ──

  private acquire(art: InsectArt): Body {
    let b = this.bodies.find((x) => x.free);
    if (!b) {
      const sc = this.scene;
      b = {
        shadow: sc.add.image(0, 0, MTEX.shadow),
        glow: sc.add.image(0, 0, MTEX.glow).setBlendMode(Phaser.BlendModes.ADD),
        sprite: sc.add.sprite(0, 0, MTEX.insect(art, this.tone), 0),
        free: true,
      };
      this.bodies.push(b);
    }
    b.free = false;
    const k = this.bugScale;
    b.sprite.setTexture(MTEX.insect(art, this.tone), 0).setVisible(true).setAlpha(1).setScale(k).setRotation(0).setDepth(D.bug);
    b.shadow.setVisible(true).setAlpha(0).setScale(k);
    b.glow.setVisible(art === "firefly" || art === "golden").setAlpha(0).setScale((art === "golden" ? 1.1 : 1.9) * k).setDepth(D.bug - 1);
    return b;
  }

  private release(b: Body): void {
    this.scene.tweens.killTweensOf([b.sprite, b.shadow, b.glow]);
    b.sprite.setVisible(false);
    b.shadow.setVisible(false);
    b.glow.setVisible(false);
    b.free = true;
  }

  spawn(s: BugSpawn, now: number): void {
    const art = insectArt(s.kind, this.tone);
    const bush = this.layout.bushes[s.slot];
    const to = perchOf(bush);
    const from = flyFrom(art, to, s.slot, this.visits[s.slot]++);
    const body = this.acquire(art);
    body.sprite.setPosition(from.x, from.y);
    this.bugs.push({ s, art, body, from, to, born: now, fly: this.reduced ? Math.min(140, flyInMs(s.lifeMs)) : flyInMs(s.lifeMs), state: "in", phase: Math.random() * 6, trailAt: 0 });
  }

  private bugOf(s: BugSpawn): Bug | undefined {
    return this.bugs.find((b) => b.s === s);
  }

  private drop(bug: Bug): void {
    this.release(bug.body);
    const i = this.bugs.indexOf(bug);
    if (i >= 0) this.bugs.splice(i, 1);
  }

  /** 잡음: 그물이 덮고 → 담긴 채로 들어 올린다. 꽃잎·빛 가루는 콤보 단계만큼 크게 */
  caught(s: BugSpawn, pts: number, mult: number, combo: number): void {
    const bug = this.bugOf(s);
    const b = this.layout.bushes[s.slot];
    const p = bug ? { x: bug.body.sprite.x, y: bug.body.sprite.y } : perchOf(b);
    const tier = comboTier(combo);
    const golden = s.kind === "golden";
    this.swoop(perchOf(b), true, () => {
      if (bug) this.drop(bug);
      this.rustle(s.slot);
      const n = (this.reduced ? 3 : 6) + tier * (this.reduced ? 1 : 3) + (golden ? 6 : 0);
      this.burst(p.x, p.y, n, golden ? [BIT.sparkle, BIT.dust, BIT.petal[2]] : [...BIT.petal, BIT.dust], 40 + tier * 10, 0.6 + tier * 0.12);
    });
    if (bug) {
      // 그물이 닿기 전까지 잠깐 그대로 (덮이는 순간 사라진다)
      bug.state = "leave";
    }
    this.hooks.float(p.x, p.y - 12, mult > 1 ? `+${pts} ×${mult}` : `+${pts}`, golden ? "#ffd04a" : "#fff4dc", golden ? 18 : 15);
    const opt: BugSoundOpt = { art: bug?.art ?? insectArt(s.kind, this.tone), combo, tier };
    this.sound(golden ? "golden" : "catch", opt);
    if (tier > this.tier) this.sound("tier", { tier });
    this.tier = tier;
    const shout = comboShout(combo);
    if (shout) this.shout(shout, tier);
  }

  /** 벌·낙엽을 건드림 */
  wrong(s: BugSpawn, penalty: number): void {
    const bug = this.bugOf(s);
    const b = this.layout.bushes[s.slot];
    const p = bug ? { x: bug.body.sprite.x, y: bug.body.sprite.y } : perchOf(b);
    const bee = s.kind === "feature";
    this.tier = 0;
    this.swoop(perchOf(b), false, () => {
      this.rustle(s.slot);
      if (!bug) return;
      if (bee) this.flyAway(bug, true);
      else {
        // 낙엽은 바스러진다
        this.burst(p.x, p.y, this.reduced ? 4 : 9, [BIT.leafBit, BIT.leafBit, BIT.grassBit], 36, 0.9);
        this.drop(bug);
      }
    });
    if (bug) bug.state = "leave";
    this.hooks.float(p.x, p.y - 12, `${bee ? MEADOW_TEXT.feature : MEADOW_TEXT.decoy} ${penalty}`, "#ff8a7a", 13);
    if (!this.reduced) this.scene.cameras.main.shake(110, 0.004);
    this.sound(bee ? "bee" : "leaf");
  }

  /** 빈 덤불을 누름: 채가 허공을 휘젓는다 */
  whiff(slot: number): void {
    const b = this.layout.bushes[slot];
    this.tier = 0;
    const net = this.nets.find((n) => !n.busy);
    this.sound("whiff");
    this.rustle(slot);
    if (!net) return;
    const p = perchOf(b);
    net.busy = true;
    const img = net.img;
    this.scene.tweens.killTweensOf(img);
    img.setFrame(0).setVisible(true).setAlpha(1).setPosition(p.x - HOOP.dx, p.y - HOOP.dy).setRotation(this.reduced ? 0 : -0.7);
    this.scene.tweens.add({
      targets: img,
      rotation: this.reduced ? 0 : 0.7,
      alpha: 0,
      duration: this.reduced ? 160 : 190,
      ease: "Quad.easeOut",
      onComplete: () => {
        img.setVisible(false);
        net.busy = false;
      },
    });
    if (!this.reduced) this.burst(p.x, p.y + 6, 3, [BIT.grassBit], 30, 0.5);
  }

  /** 머무는 시간이 지남: 날아가 버린다 (보통 곤충이면 "날아갔다") */
  escape(s: BugSpawn, missed: boolean): void {
    const bug = this.bugOf(s);
    if (!bug) return;
    if (missed) {
      this.tier = 0;
      this.hooks.float(bug.body.sprite.x, bug.body.sprite.y - 10, MEADOW_TEXT.miss, "#c8d0d8", 12);
      this.sound("escape");
    }
    this.flyAway(bug, false);
  }

  private flyAway(bug: Bug, angry: boolean): void {
    bug.state = "leave";
    const sp = bug.body.sprite;
    const leaf = bug.art === "leaf";
    const dx = leaf ? 60 : (sp.x < this.layout.w / 2 ? -1 : 1) * (50 + Math.random() * 40);
    const dy = leaf ? 10 : -90;
    const dur = angry ? 260 : 380;
    this.scene.tweens.add({
      targets: sp,
      x: sp.x + dx,
      y: sp.y + dy,
      alpha: 0,
      rotation: leaf ? 1.6 : Math.atan2(dy, dx) + Math.PI / 2,
      duration: this.reduced ? 200 : dur,
      ease: "Quad.easeIn",
      onComplete: () => this.drop(bug),
    });
    this.scene.tweens.add({ targets: [bug.body.shadow, bug.body.glow], alpha: 0, duration: 200 });
  }

  // ── 연출 조각 ──

  /** 그물 휘두르기: 위에서 덤불로 덮는다. caught면 담긴 채로 들어 올린다 */
  private swoop(at: { x: number; y: number }, caught: boolean, onHit: () => void): void {
    const net = this.nets.find((n) => !n.busy);
    if (!net) {
      onHit();
      return;
    }
    net.busy = true;
    const img = net.img;
    const sc = this.scene;
    sc.tweens.killTweensOf(img);
    img.setFrame(0).setVisible(true).setPosition(at.x - HOOP.dx, at.y - HOOP.dy);
    const lift = () => {
      onHit();
      img.setFrame(caught ? 1 : 0);
      sc.tweens.add({
        targets: img,
        y: img.y - (this.reduced ? 0 : 10),
        rotation: this.reduced ? 0 : 0.22,
        alpha: 0,
        delay: 70,
        duration: 260,
        ease: "Quad.easeIn",
        onComplete: () => {
          img.setVisible(false);
          net.busy = false;
        },
      });
    };
    if (this.reduced) {
      img.setRotation(0).setAlpha(1);
      lift();
      return;
    }
    img.setRotation(-0.95).setAlpha(0.6);
    sc.tweens.add({ targets: img, rotation: 0, alpha: 1, duration: 85, ease: "Quad.easeIn", onComplete: lift });
  }

  /** 덤불 살랑 (눌림) */
  private rustle(slot: number): void {
    const img = this.bushImgs[slot];
    if (!img || this.reduced) return;
    this.scene.tweens.killTweensOf(img);
    img.setScale(1);
    this.scene.tweens.add({ targets: img, scaleX: 1.07, scaleY: 0.93, duration: 70, yoyo: true, ease: "Sine.easeOut" });
  }

  /** 조각 흩뿌리기 (풀에서 꺼내 쓴다, 모자라면 덜 뿌린다) */
  private burst(x: number, y: number, n: number, frames: readonly number[], speed: number, life: number): void {
    let k = 0;
    for (const b of this.bits) {
      if (k >= n) break;
      if (b.on) continue;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.7);
      b.vx = Math.cos(a) * v;
      b.vy = Math.sin(a) * v - speed * 0.6;
      b.g = 90;
      b.life = life * (0.7 + Math.random() * 0.5);
      b.age = 0;
      b.spin = (Math.random() - 0.5) * 8;
      b.on = true;
      b.img
        .setFrame(frames[k % frames.length])
        .setPosition(x, y)
        .setVisible(true)
        .setAlpha(1)
        .setRotation(0)
        .setScale(1 + Math.random() * 0.4);
      k++;
    }
  }

  /** 반짝 꼬리 한 알 (황금 곤충) */
  private trail(x: number, y: number): void {
    const b = this.bits.find((x0) => !x0.on);
    if (!b) return;
    b.vx = (Math.random() - 0.5) * 10;
    b.vy = 8 + Math.random() * 8;
    b.g = 0;
    b.life = 0.5;
    b.age = 0;
    b.spin = 0;
    b.on = true;
    b.img.setFrame(Math.random() < 0.5 ? BIT.sparkle : BIT.dust).setPosition(x + (Math.random() - 0.5) * 8, y + 4).setVisible(true).setAlpha(1).setScale(1).setRotation(0);
  }

  private shout(text: string, tier: number): void {
    const l = this.layout;
    const y = Math.min(...l.bushes.map((b) => b.y - b.r)) - 6;
    const t = this.hooks.label(l.w / 2, y, text, ["#fff4dc", "#ffe9a0", "#ffd870", "#ffc850", "#ffb040"][tier], 24 + tier * 3).setDepth(D.text);
    const base = t.scaleX;
    const sc = this.scene;
    if (this.reduced) {
      sc.tweens.add({ targets: t, alpha: 0, delay: 500, duration: 300, onComplete: () => t.destroy() });
      return;
    }
    t.setScale(base * 0.4);
    sc.tweens.add({ targets: t, scaleX: base, scaleY: base, duration: 180, ease: "Back.easeOut" });
    sc.tweens.add({ targets: t, alpha: 0, y: y - 12, delay: 520, duration: 320, onComplete: () => t.destroy() });
  }

  /** 시작 글자 (준비 → 시작!) · 끝 글자: 화면을 가로지르는 옅은 띠 위에 크게 */
  banner(kind: "ready" | "go" | "end"): Phaser.GameObjects.Text {
    const l = this.layout;
    const v = this.view;
    const sc = this.scene;
    const z = sc.cameras.main.zoom;
    const cy = l.h / 2;
    const band = sc.add
      .rectangle(v.x + v.w / 2, cy - 22 / z, v.w + 8, 64 / z, 0x0a0c08, 0.42)
      .setDepth(D.text - 1);
    sc.tweens.add({ targets: band, alpha: 0, delay: kind === "end" ? 520 : 440, duration: 200, onComplete: () => band.destroy() });
    const t = this.hooks.label(l.w / 2, cy, MEADOW_TEXT[kind], kind === "go" ? "#ffe9a0" : "#fff4dc", 40).setDepth(D.text);
    const base = t.scaleX;
    this.sound(kind);
    if (!this.reduced) {
      t.setScale(base * 0.5);
      sc.tweens.add({ targets: t, scaleX: base, scaleY: base, duration: 200, ease: "Back.easeOut" });
    }
    sc.tweens.add({ targets: t, alpha: 0, delay: kind === "end" ? 500 : 420, duration: 220, onComplete: () => t.destroy() });
    return t;
  }

  /** 끝: 남은 곤충은 날아가고 */
  finish(): void {
    for (const bug of [...this.bugs]) if (bug.state !== "leave") this.flyAway(bug, false);
  }

  private sound(ev: BugSoundEv, o: BugSoundOpt = {}): void {
    this.sfx.synth(`bug:${ev}`, bugSound(ev, o), ev === "catch" || ev === "golden" ? 20 : 40);
  }

  // ── 매 프레임 ──

  /** now: 게임 시간 (ms, 출현 계획과 같은 시계), dt: 이번 프레임 ms */
  update(now: number, dt: number): void {
    this.t += dt;
    const t = this.t;
    const sec = dt / 1000;
    for (const bug of this.bugs) this.moveBug(bug, now);
    for (const b of this.bits) {
      if (!b.on) continue;
      b.age += sec;
      if (b.age >= b.life) {
        b.on = false;
        b.img.setVisible(false);
        continue;
      }
      b.vy += b.g * sec;
      b.img.x += b.vx * sec;
      b.img.y += b.vy * sec;
      b.img.rotation += b.spin * sec;
      b.img.alpha = 1 - (b.age / b.life) ** 2;
    }
    // 풀 살랑 (가끔 바람이 세게)
    if (!this.reduced) {
      const gust = 0.6 + 0.4 * Math.sin(t * 0.0006);
      for (const img of this.tufts) img.rotation = Math.sin(t * 0.0021 + img.x * 0.07) * 0.13 * gust;
    }
    this.ambient(t);
  }

  private moveBug(bug: Bug, now: number): void {
    const { sprite, shadow, glow } = bug.body;
    if (bug.state === "leave") {
      shadow.setPosition(sprite.x + 3, sprite.y + 9);
      glow.setPosition(sprite.x, sprite.y + 6);
      return;
    }
    const age = now - bug.born;
    const art = bug.art;
    let lift = 0;
    if (bug.state === "in") {
      const k = Math.min(1, age / bug.fly);
      const e = landEase(k);
      let x = bug.from.x + (bug.to.x - bug.from.x) * e;
      const y = bug.from.y + (bug.to.y - bug.from.y) * e;
      if (art === "leaf") {
        // 팔랑이며 내려온다
        x += this.reduced ? 0 : Math.sin(k * Math.PI * 3) * 10 * (1 - k);
        sprite.setRotation(this.reduced ? 0 : Math.sin(k * 9) * 0.7 * (1 - k));
        sprite.setFrame([0, 1, 2, 1][Math.floor(k * 10) % 4]);
      } else {
        const dir = Math.atan2(bug.to.y - bug.from.y, bug.to.x - bug.from.x) + Math.PI / 2;
        sprite.setRotation(dir * (1 - e) * 0.6);
        sprite.setFrame([0, 1, 2, 1][Math.floor(age / 45) % 4]);
      }
      sprite.setPosition(x, y);
      lift = (1 - e) * 14;
      if (k >= 1) bug.state = "perch";
    } else {
      // 앉아서: 날개를 천천히 접었다 폈다 (벌은 붕붕 떨고, 낙엽은 살짝 흔들림)
      const p = age / 1000 + bug.phase;
      switch (art) {
        case "bee":
          sprite.setFrame(Math.floor(age / 40) % 3);
          if (!this.reduced) sprite.setPosition(bug.to.x + Math.sin(age * 0.09) * 1.2, bug.to.y + Math.cos(age * 0.13) * 0.8);
          break;
        case "leaf":
          sprite.setFrame(0);
          sprite.setRotation(this.reduced ? 0 : Math.sin(p * 2.4) * 0.08);
          break;
        case "dragonfly":
          sprite.setFrame(Math.sin(p * 9) > 0.85 ? 1 : 0);
          sprite.setRotation(0);
          break;
        case "firefly":
          sprite.setFrame(Math.sin(p * 3) > 0.4 ? 1 : 0);
          sprite.setRotation(0);
          break;
        default:
          sprite.setFrame([0, 0, 1, 2, 2, 1][Math.floor(p * 5) % 6]);
          sprite.setRotation(0);
      }
    }
    shadow.setPosition(sprite.x + 3, sprite.y + 9 + lift).setAlpha(0.55 - lift * 0.025);
    if (art === "firefly" || art === "golden") {
      const pulse = 0.55 + 0.35 * Math.sin(now * (art === "golden" ? 0.012 : 0.006) + bug.phase);
      glow.setPosition(sprite.x, sprite.y + (art === "firefly" ? 6 : 0)).setAlpha(pulse * (this.tone === "day" && art === "firefly" ? 0.5 : 1));
    }
    if (art === "golden" && now - bug.trailAt > (this.reduced ? 200 : 70)) {
      bug.trailAt = now;
      this.trail(sprite.x, sprite.y);
    }
  }

  private ambient(t: number): void {
    const v = this.view;
    if (!v.w) return;
    for (const m of this.motes) {
      // 화면 안을 천천히 떠돈다 (위로 흐르며 좌우로 일렁)
      const speed = this.reduced ? 0.3 : 1;
      const yy = (((m.y - t * 0.006 * m.sp * speed) % v.h) + v.h) % v.h;
      const xx = (m.x / 300) * v.w + Math.sin(t * 0.0007 * m.sp + m.ph) * 18;
      m.img.setPosition(v.x + xx, v.y + yy);
      if (this.tone === "night") m.img.setAlpha(0.35 + 0.35 * Math.sin(t * 0.003 * m.sp + m.ph));
    }
    this.clouds.forEach((c, i) => {
      const span = v.w + 360;
      const x = ((((t * 0.008 * (this.reduced ? 0.3 : 1) + i * span * 0.55) % span) + span) % span) - 180;
      c.setPosition(v.x + x, v.y + v.h * (0.3 + i * 0.4));
    });
  }
}
