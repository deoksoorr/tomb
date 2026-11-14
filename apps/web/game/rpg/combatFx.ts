import * as Phaser from "phaser";
import type { WeaponStyleId } from "@/lib/rpg/weapons";
import { shakeEnabled } from "@/lib/shakePref";
import { Grid, type Color } from "../sprites/pixel";
import { bandTex, cardSheet, coinSheet, crackSheet, crossSheet, heavyArcSheet, impactSheet, inkBoltTex, inkSheet, orbTex, puffSheet, shardTex, streakSheet, swingArcSheet } from "./fxArt";

// 16번 타격·처치 이펙트 (옛 2D MMORPG의 손맛을 참고한 자체 그림 — 다른 게임 그림·소리는 쓰지 않는다).
//  - 맞으면: 흰 번쩍임 + 별 모양 충격 + 파편, 숫자가 튀어 올랐다 떠오른다 (치명타는 크고 주황, "치명!" 꼬리표)
//  - 빗나가면: MISS가 옆으로 흘러간다
//  - 처치: 몸 색 파편이 터지고 고리가 퍼진 뒤, 동전·경험치 구슬이 튀어나왔다가 나에게 빨려 온다
//  - 연속 타격: 머리 위 "N 콤보" (10·25·50에서 색이 바뀐다)
//  - 무기 동작: 공격 방식마다 다른 궤적 (휘두르기 초승달, 내려찍기 두꺼운 호 + 바닥 금, 찌르기 긴 줄, 연타 X자, 쏘기 총구 연기, 마법 잉크)
//  - 화면 흔들림은 움직임 줄이기(prefers-reduced-motion)면 끈다

export const FXT = {
  impact: "fx-impact",
  shard: "fx-shard",
  coin: "fx-coin",
  orb: "fx-orb",
  arc: "fx-arc",
  heavy: "fx-heavy",
  crack: "fx-crack",
  streak: "fx-streak",
  cross: "fx-cross",
  puff: "fx-puff",
  band: "fx-band",
  card: "fx-card",
  ink: "fx-ink",
  inkBolt: "fx-ink-bolt",
} as const;

const FONT = '"Galmuri11", "Galmuri9", monospace';
const DEPTH_TOP = 1e6;

function addSheet(scene: Phaser.Scene, key: string, g: Grid, fw: number, fh: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, g.toCanvas());
  if (!tex) return;
  const cols = Math.floor(g.w / fw);
  for (let c = 0; c < cols; c++) tex.add(c, 0, c * fw, 0, fw, fh);
}

export function ensureFxTextures(scene: Phaser.Scene): void {
  addSheet(scene, FXT.impact, impactSheet(), 24, 24);
  addSheet(scene, FXT.shard, shardTex(), 3, 3);
  addSheet(scene, FXT.coin, coinSheet(), 7, 7);
  addSheet(scene, FXT.orb, orbTex(), 7, 7);
  addSheet(scene, FXT.arc, swingArcSheet(), 40, 40);
  addSheet(scene, FXT.heavy, heavyArcSheet(), 40, 40);
  addSheet(scene, FXT.crack, crackSheet(), 32, 32);
  const st = streakSheet();
  if (!scene.textures.exists(FXT.streak)) {
    const tex = scene.textures.addCanvas(FXT.streak, st.toCanvas());
    if (tex) for (let f = 0; f < 3; f++) tex.add(f, 0, 0, f * 8, 56, 8);
  }
  addSheet(scene, FXT.cross, crossSheet(), 16, 16);
  addSheet(scene, FXT.puff, puffSheet(), 12, 12);
  addSheet(scene, FXT.band, bandTex(), 7, 5);
  addSheet(scene, FXT.card, cardSheet(), 8, 6);
  addSheet(scene, FXT.ink, inkSheet(), 40, 40);
  addSheet(scene, FXT.inkBolt, inkBoltTex(), 6, 6);
}

/** 프레임을 차례로 넘기고 사라지는 스프라이트 (애니메이션 등록 없이 타이머로) */
function playFrames(scene: Phaser.Scene, s: Phaser.GameObjects.Sprite, frames: number, frameMs: number, fadeLast = true): void {
  let f = 0;
  s.setFrame(0);
  const ev = scene.time.addEvent({
    delay: frameMs,
    repeat: frames - 1,
    callback: () => {
      f++;
      if (f >= frames) {
        if (fadeLast) scene.tweens.add({ targets: s, alpha: 0, duration: frameMs, onComplete: () => s.destroy() });
        else s.destroy();
        ev.remove();
        return;
      }
      if (s.active) s.setFrame(f);
    },
  });
}

export type ComboTier = { at: number; color: string };
export const COMBO_TIERS: readonly ComboTier[] = [
  { at: 50, color: "#ff8ad0" },
  { at: 25, color: "#ff9a3c" },
  { at: 10, color: "#ffd04a" },
  { at: 0, color: "#f2ead3" },
];
/** 마지막으로 맞힌 뒤 이 시간이 지나면 콤보가 끊긴다 */
export const COMBO_RESET_MS = 2200;

export class CombatFx {
  private comboText: Phaser.GameObjects.Text | null = null;
  private comboShown = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {
    ensureFxTextures(scene);
  }

  private get zoom(): number {
    return this.scene.cameras.main.zoom || 1;
  }

  private text(x: number, y: number, s: string, color: string, px: number, stroke = "#0a0b10"): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, s, { fontFamily: FONT, fontSize: `${px}px`, color, stroke, strokeThickness: 3, resolution: 1 })
      .setOrigin(0.5, 1)
      .setScale(1 / this.zoom)
      .setDepth(DEPTH_TOP);
  }

  /** 작은 흔들림 (움직임 줄이기거나 게임 안 설정에서 흔들림을 껐으면 안 흔든다) */
  shake(ms: number, intensity: number): void {
    if (this.reduced || !shakeEnabled()) return;
    this.scene.cameras.main.shake(ms, intensity);
  }

  /**
   * 피해 숫자: 튀어 올랐다가(팝) 살짝 옆으로 흐르며 떠오른다. crit이면 크고 주황 + "치명!".
   * skillColor가 있으면 스킬 피해: 더 큰 글씨·갈래 색, 치명타는 좌우로 흔들린다
   */
  damage(x: number, y: number, n: number, crit: boolean, nth = 0, skillColor?: string): void {
    const base = 1 / this.zoom;
    const drift = ((nth % 3) - 1) * 4 + (Math.random() - 0.5) * 3;
    const big = !!skillColor;
    const color = crit ? "#ffb02e" : (skillColor ?? "#fff7e6");
    const t = this.text(x + ((nth % 3) - 1) * 3, y - (nth % 2) * 4, String(n), color, crit ? (big ? 21 : 17) : big ? 15 : 12, crit ? "#3a1004" : "#0a0b10");
    t.setScale(base * (crit ? 2 : 1.5) * (big ? 1.2 : 1));
    if (big && crit && !this.reduced) this.scene.tweens.add({ targets: t, x: t.x + 2, duration: 40, yoyo: true, repeat: 3 });
    this.scene.tweens.add({ targets: t, scale: base, duration: crit ? 140 : 90, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: t, x: t.x + drift, y: t.y - (crit ? 18 : 14), alpha: { from: 1, to: 0 }, delay: crit ? 260 : 160, duration: crit ? 640 : 520, ease: "Quad.easeIn", onComplete: () => t.destroy() });
    if (crit) {
      const tag = this.text(x, y - 11, "치명!", "#ff5a3c", 9, "#2a0804");
      tag.setScale(base * 0.4);
      this.scene.tweens.add({ targets: tag, scale: base, duration: 120, ease: "Back.easeOut" });
      this.scene.tweens.add({ targets: tag, y: tag.y - 16, alpha: 0, delay: 280, duration: 600, onComplete: () => tag.destroy() });
    }
  }

  /** 빗나감 */
  miss(x: number, y: number): void {
    const t = this.text(x, y, "MISS", "#9ab8d8", 10);
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.scene.tweens.add({ targets: t, x: x + dir * 10, y: y - 8, alpha: 0, duration: 620, ease: "Sine.easeOut", onComplete: () => t.destroy() });
  }

  /** 내가 맞음 */
  playerHurt(x: number, y: number, n: number): void {
    const t = this.text(x, y, `-${n}`, "#ff6a6a", 13, "#2a0606");
    t.setScale((1 / this.zoom) * 1.6);
    this.scene.tweens.add({ targets: t, scale: 1 / this.zoom, duration: 100, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: t, y: y - 14, alpha: 0, delay: 200, duration: 560, onComplete: () => t.destroy() });
  }

  /** 맞은 자리 충격 (별 + 파편). heavy면 크게 */
  impact(x: number, y: number, crit: boolean, heavy = false, tint = 0xffffff): void {
    const s = this.scene.add.sprite(x, y, FXT.impact, 0).setDepth(DEPTH_TOP - 10).setBlendMode(Phaser.BlendModes.ADD);
    s.setScale(crit || heavy ? 1.15 : 0.75).setRotation(Math.random() * Math.PI);
    if (tint !== 0xffffff) s.setTint(tint);
    playFrames(this.scene, s, 4, crit ? 45 : 35);
    const n = crit ? 7 : heavy ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = (crit ? 14 : 9) + Math.random() * 6;
      const p = this.scene.add.image(x, y, FXT.shard).setDepth(DEPTH_TOP - 9).setTint(crit ? 0xffd04a : 0xffffff);
      this.scene.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.4, duration: 220 + Math.random() * 120, ease: "Quad.easeOut", onComplete: () => p.destroy() });
    }
  }

  /** 처치: 몸 색 파편 + 고리 + 번쩍임, 동전·경험치 구슬이 튀어나왔다가 to(나)에게 날아온다 */
  killBurst(x: number, y: number, color: Color, accent: Color, size: number, to: () => { x: number; y: number }, coins: number, orbs: number, onCollect?: () => void): void {
    const sc = this.scene;
    const flash = sc.add.image(x, y - size / 2, FXT.impact, 1).setDepth(DEPTH_TOP - 8).setScale(size / 12).setBlendMode(Phaser.BlendModes.ADD);
    sc.tweens.add({ targets: flash, alpha: 0, scale: size / 8, duration: 220, onComplete: () => flash.destroy() });
    const ring = sc.add.graphics().setDepth(DEPTH_TOP - 8);
    const ringR = { r: size * 0.3, a: 1 };
    sc.tweens.add({
      targets: ringR,
      r: size * 1.3,
      a: 0,
      duration: 320,
      ease: "Quad.easeOut",
      onUpdate: () => ring.clear().lineStyle(2, 0xfff3c8, ringR.a).strokeCircle(x, y - size / 2, ringR.r),
      onComplete: () => ring.destroy(),
    });
    const n = Math.min(16, 8 + Math.round(size / 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = size * 0.8 + Math.random() * size * 0.7;
      const p = sc.add.image(x, y - size / 2, FXT.shard).setDepth(DEPTH_TOP - 7).setTint(i % 3 === 0 ? accent : color).setScale(1 + Math.random() * 0.8);
      sc.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y - size / 2 + Math.sin(a) * d * 0.7 + 4,
        angle: Math.random() * 360,
        alpha: 0,
        duration: 380 + Math.random() * 220,
        ease: "Cubic.easeOut",
        onComplete: () => p.destroy(),
      });
    }
    // 동전·구슬: 튀어나와 잠깐 떠 있다가 나에게 빨려 온다
    const items: { tex: string; frame: number }[] = [];
    for (let i = 0; i < coins; i++) items.push({ tex: FXT.coin, frame: 0 });
    for (let i = 0; i < orbs; i++) items.push({ tex: FXT.orb, frame: 0 });
    let collected = 0;
    items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i - (items.length - 1) / 2) * 0.6 + (Math.random() - 0.5) * 0.3;
      const o = sc.add.sprite(x, y - size / 2, it.tex, it.frame).setDepth(DEPTH_TOP - 6);
      const hop = { x: x + Math.cos(a) * (8 + Math.random() * 6), y: y - size / 2 + Math.sin(a) * 10 };
      sc.tweens.add({
        targets: o,
        x: hop.x,
        y: hop.y,
        duration: 220,
        ease: "Quad.easeOut",
        onComplete: () => {
          if (it.tex === FXT.coin) {
            const spin = sc.time.addEvent({ delay: 90, loop: true, callback: () => o.active && o.setFrame((Number(o.frame.name) + 1) % 2) });
            o.once(Phaser.GameObjects.Events.DESTROY, () => spin.remove());
          }
          sc.tweens.add({ targets: o, y: hop.y + 3, duration: 160, yoyo: true, ease: "Sine.easeInOut" });
          const state = { t: 0 };
          const sx = hop.x;
          const sy = hop.y;
          sc.tweens.add({
            targets: state,
            t: 1,
            delay: 260 + i * 50,
            duration: 300,
            ease: "Quad.easeIn",
            onUpdate: () => {
              const p = to();
              o.setPosition(sx + (p.x - sx) * state.t, sy + (p.y - 10 - sy) * state.t);
            },
            onComplete: () => {
              const sp = sc.add.image(o.x, o.y, FXT.impact, 3).setDepth(DEPTH_TOP - 5).setScale(0.5).setTint(it.tex === FXT.coin ? 0xffe39a : 0xbaffb0);
              sc.tweens.add({ targets: sp, alpha: 0, scale: 0.8, duration: 160, onComplete: () => sp.destroy() });
              o.destroy();
              if (++collected === 1) onCollect?.();
            },
          });
        },
      });
    });
    this.shake(90, 0.0025);
  }

  /** 머리 위 "N 콤보" (늘 때마다 톡 튄다). n<2면 숨김 */
  combo(n: number, x: number, y: number): void {
    if (n < 2) {
      if (this.comboText) {
        const t = this.comboText;
        this.comboText = null;
        this.scene.tweens.add({ targets: t, alpha: 0, duration: 200, onComplete: () => t.destroy() });
      }
      this.comboShown = 0;
      return;
    }
    const color = COMBO_TIERS.find((c) => n >= c.at)!.color;
    if (!this.comboText) this.comboText = this.text(x, y, "", color, 11);
    const t = this.comboText;
    t.setPosition(x, y);
    if (n !== this.comboShown) {
      this.comboShown = n;
      t.setText(`${n} 콤보`).setColor(color).setAlpha(1);
      const base = 1 / this.zoom;
      t.setScale(base * (n % 10 === 0 ? 1.8 : 1.35));
      this.scene.tweens.killTweensOf(t);
      this.scene.tweens.add({ targets: t, scale: base, duration: 140, ease: "Back.easeOut" });
    }
  }

  /** 무기 동작 궤적. (x,y)는 손 위치, ang은 바라보는 각도, reach는 범위(px) */
  motion(style: WeaponStyleId, x: number, y: number, ang: number, reach: number, finisher: boolean, arcDeg = 120): Phaser.GameObjects.Sprite | null {
    const sc = this.scene;
    switch (style) {
      case "swing":
      case "smash": {
        const heavy = style === "smash";
        const s = sc.add.sprite(x, y, heavy ? FXT.heavy : FXT.arc, 0).setRotation(ang).setDepth(DEPTH_TOP - 20);
        // 범위·펼친 각도에 맞춰 크기를 맞춘다 (그림의 호 반지름 16px)
        const k = Math.max(0.8, reach / 18);
        s.setScale(k, k * Math.min(1.5, Math.max(0.8, arcDeg / 130)));
        if (finisher) s.setTint(heavy ? 0xffb060 : 0xbfe8ff);
        playFrames(sc, s, 4, heavy ? 40 : 30);
        return s;
      }
      case "thrust": {
        const s = sc.add.sprite(x, y, FXT.streak, 0).setOrigin(0, 0.5).setRotation(ang).setDepth(DEPTH_TOP - 20);
        s.setScale(reach / 52, finisher ? 1.6 : 1);
        if (finisher) s.setTint(0xbfe8ff);
        playFrames(sc, s, 3, 40);
        return s;
      }
      case "combo": {
        const s = sc.add.sprite(x + Math.cos(ang) * reach * 0.55, y + Math.sin(ang) * reach * 0.55, FXT.cross, 0).setDepth(DEPTH_TOP - 20);
        s.setScale(reach / 16).setRotation(ang);
        playFrames(sc, s, 2, 45);
        return s;
      }
      case "shot":
      case "card": {
        const s = sc.add.sprite(x + Math.cos(ang) * 6, y + Math.sin(ang) * 6, FXT.puff, 0).setDepth(DEPTH_TOP - 20);
        playFrames(sc, s, 3, 50);
        return s;
      }
      case "magic": {
        const s = sc.add.sprite(x, y - 4, FXT.impact, 0).setDepth(DEPTH_TOP - 20).setTint(0x7aa8ff).setScale(0.6);
        playFrames(sc, s, 4, 40);
        return s;
      }
    }
  }

  /** 내려찍기: 바닥 금 + 먼지 */
  crack(x: number, y: number, scale = 1): void {
    const s = this.scene.add.sprite(x, y, FXT.crack, 0).setDepth(-450).setScale(scale);
    playFrames(this.scene, s, 3, 70);
  }

  /** 마무리 땅 울리기: 퍼지는 충격 고리 */
  shockwave(x: number, y: number, r: number, color = 0xffd9a0): void {
    const g = this.scene.add.graphics().setDepth(-440);
    const st = { r: 4, a: 0.9 };
    this.scene.tweens.add({
      targets: st,
      r,
      a: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onUpdate: () => g.clear().lineStyle(3, color, st.a).strokeEllipse(x, y, st.r * 2, st.r * 1.3),
      onComplete: () => g.destroy(),
    });
    this.crack(x, y, r / 18);
  }

  /** 잉크 터짐 (마법) */
  ink(x: number, y: number, r: number): void {
    const s = this.scene.add.sprite(x, y, FXT.ink, 0).setDepth(-430).setScale(r / 15);
    playFrames(this.scene, s, 4, 55);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = this.scene.add.image(x, y - 4, FXT.inkBolt).setDepth(DEPTH_TOP - 9).setScale(0.6);
      this.scene.tweens.add({ targets: p, x: x + Math.cos(a) * r, y: y - 4 + Math.sin(a) * r * 0.6 - 6, alpha: 0, duration: 300, ease: "Quad.easeOut", onComplete: () => p.destroy() });
    }
  }

  /** 마법 시전 표시: 목표 지점에 파란 원이 차오른다 (내 공격 미리 보기) */
  castMark(x: number, y: number, r: number, ms: number): void {
    const g = this.scene.add.graphics().setDepth(-440);
    const st = { p: 0 };
    this.scene.tweens.add({
      targets: st,
      p: 1,
      duration: ms,
      onUpdate: () => g.clear().lineStyle(1, 0x7aa8ff, 0.9).strokeEllipse(x, y, r * 2, r * 1.4).fillStyle(0x2a5ac8, 0.35).fillEllipse(x, y, r * 2 * st.p, r * 1.4 * st.p),
      onComplete: () => g.destroy(),
    });
  }

  /** 우두머리 단계 바뀜: 붉은 번쩍임 + 흔들림 */
  bossPhase(x: number, y: number, size: number): void {
    const sc = this.scene;
    const cam = sc.cameras.main;
    if (!this.reduced) cam.flash(180, 120, 20, 20);
    this.shake(260, 0.006);
    const g = sc.add.graphics().setDepth(DEPTH_TOP - 8);
    const st = { r: size * 0.4, a: 1 };
    sc.tweens.add({
      targets: st,
      r: size * 2.4,
      a: 0,
      duration: 500,
      ease: "Cubic.easeOut",
      onUpdate: () => g.clear().lineStyle(3, 0xff5a3c, st.a).strokeCircle(x, y - size / 2, st.r),
      onComplete: () => g.destroy(),
    });
  }

  destroy(): void {
    this.comboText?.destroy();
    this.comboText = null;
  }
}
