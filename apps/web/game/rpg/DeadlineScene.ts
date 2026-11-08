import * as Phaser from "phaser";
import { DEADLINE_BLOCKS, DEADLINE_HP, DEADLINE_SCORE, deadlinePlan, type FallSpawn } from "@/lib/rpg/plan";
import type { DeadlineResult, RpgHud } from "@/lib/rpg/types";
import { RpgScene } from "./base";
import { avFrame, ensureRpgTextures, makePlayer, RTEX } from "./sprites";

// 데드라인 피하기: 위에서 쏟아지는 '요구사항 변경'·'긴급 회의' 블록을 좌우로 피하며 마감까지 버틴다.
// 커피는 주우면 점수. 세 번 맞으면 끝. 낙하 계획은 시드(deadlinePlan)대로, AGI는 이동속도를 조금 올린다.

const AW = 200;
const AH = 260;
const FLOOR_Y = 246;
const PW = 10;
const BLOCK_H = 13;
const HIT_IFRAME_MS = 900;

type Fall = { s: FallSpawn; x: number; y: number; obj: Phaser.GameObjects.Container; done: boolean };

export class DeadlineScene extends RpgScene {
  private plan: FallSpawn[] = [];
  private nextIdx = 0;
  private falls: Fall[] = [];
  private px = AW / 2;
  private targetX: number | null = null;
  private hp = DEADLINE_HP;
  private coffees = 0;
  private hits = 0;
  private hurtUntil = 0;
  private survived = 0;
  private dirRow = 3;
  private player!: Phaser.GameObjects.Sprite;
  private hearts: Phaser.GameObjects.Rectangle[] = [];

  constructor() {
    super("rpg-deadline");
  }

  create(): void {
    this.setupCommon();
    ensureRpgTextures(this);
    makePlayer(this, this.data0.color, this.data0.look);
    this.plan = deadlinePlan(this.play.seed, this.play.difficulty, this.play.timeLimitSec);
    this.nextIdx = 0;
    this.falls = [];
    this.px = AW / 2;
    this.targetX = null;
    this.hp = DEADLINE_HP;
    this.coffees = this.hits = 0;
    this.hurtUntil = 0;
    this.survived = 0;
    this.cameras.main.setBackgroundColor("#0e0d12");

    // 사무실 바닥과 벽: 위로 갈수록 어두운 띠, 아래엔 책상 줄
    for (let i = 0; i < 13; i++) this.add.rectangle(0, i * 20, AW, 20, i % 2 ? 0x1c1b22 : 0x1f1e26).setOrigin(0, 0).setDepth(-100);
    this.add.rectangle(0, FLOOR_Y + 1, AW, AH - FLOOR_Y, 0x2a2630).setOrigin(0, 0).setDepth(-90);
    this.add.rectangle(0, 0, 2, AH, 0x3a3f4a).setOrigin(0, 0);
    this.add.rectangle(AW - 2, 0, 2, AH, 0x3a3f4a).setOrigin(0, 0);
    // 판 밖으로 나간 블록은 가린다 (화면이 판보다 클 때)
    for (const [x, y, w, h] of [
      [-400, -400, AW + 800, 400],
      [-400, AH, AW + 800, 400],
      [-400, 0, 400, AH],
      [AW, 0, 400, AH],
    ])
      this.add.rectangle(x, y, w, h, 0x0e0d12).setOrigin(0, 0).setDepth(45);
    // 마감선 (맨 위)
    this.add.rectangle(0, 0, AW, 3, 0xa83c3c).setOrigin(0, 0).setDepth(10);

    this.player = this.add.sprite(this.px, FLOOR_Y, RTEX.player, avFrame(3, 0)).setOrigin(0.5, 19 / 20).setDepth(50);
    this.hearts = [];
    for (let i = 0; i < DEADLINE_HP; i++) this.hearts.push(this.add.rectangle(6 + i * 9, 8, 6, 6, 0xe84040).setOrigin(0, 0).setDepth(60));
    this.fit();
  }

  private fit(): void {
    const cam = this.cameras.main;
    const z = Math.max(1, Math.floor(Math.min(cam.width / (AW + 8), (cam.height - 130) / AH) * 4) / 4);
    cam.setZoom(z);
    cam.centerOn(AW / 2, AH / 2 - 10);
    for (const f of this.falls) f.obj.each((o: Phaser.GameObjects.GameObject) => o instanceof Phaser.GameObjects.Text && o.setScale(1 / z));
  }

  protected onResize(): void {
    this.fit();
  }

  protected onKey(): void {}

  protected onAction(): void {}

  protected onTap(x: number): void {
    this.targetX = Phaser.Math.Clamp(x, PW, AW - PW);
  }

  private spawn(s: FallSpawn): void {
    const x = Phaser.Math.Clamp(s.x * AW, s.w / 2 + 2, AW - s.w / 2 - 2);
    const obj = this.add.container(x, -12).setDepth(40);
    if (s.kind === "coffee") {
      obj.add(this.add.image(0, 0, RTEX.coffee));
    } else {
      const colors = [0xe07a2a, 0xa83c3c, 0x5a6a8a, 0x8a6a4a, 0xc83c5a, 0x3c5a8a];
      obj.add(this.add.rectangle(0, 0, s.w, BLOCK_H, colors[s.label % colors.length]).setStrokeStyle(1, 0x0a0b10));
      const t = this.add
        .text(0, 1, DEADLINE_BLOCKS[s.label], { fontFamily: '"Galmuri11", monospace', fontSize: "11px", color: "#f2ead3", resolution: 1 })
        .setOrigin(0.5, 0.5)
        .setScale(1 / this.cameras.main.zoom);
      // 글자가 블록보다 넓으면 블록 폭에 맞춰 줄인다
      if (t.displayWidth > s.w - 2) t.setScale(t.scaleX * ((s.w - 2) / t.displayWidth));
      obj.add(t);
    }
    this.falls.push({ s, x, y: -12, obj, done: false });
  }

  update(_t: number, delta: number): void {
    if (!this.tickCommon(delta)) return;
    const dt = Math.min(delta, 100) / 1000;
    const now = this.elapsed;
    this.survived = now;

    while (this.nextIdx < this.plan.length && this.plan[this.nextIdx].t <= now) this.spawn(this.plan[this.nextIdx++]);

    // 이동
    const agi = this.play.derived.stats.agi;
    const speed = 120 * (1 + Math.min(0.3, agi * 0.004));
    let ax = this.axis().x;
    if (Math.abs(ax) > 0.1) this.targetX = null;
    else if (this.targetX !== null) {
      const d = this.targetX - this.px;
      ax = Math.abs(d) < 2 ? 0 : Math.sign(d);
      if (!ax) this.targetX = null;
    }
    this.px = Phaser.Math.Clamp(this.px + ax * speed * dt, PW / 2 + 2, AW - PW / 2 - 2);
    if (ax) this.dirRow = ax < 0 ? 1 : 2;
    const col = ax ? 2 + (Math.floor(now / 110) % 4) : Math.floor(now / 500) % 2;
    this.player.setPosition(Math.round(this.px), FLOOR_Y).setFrame(avFrame(ax ? this.dirRow : 3, col));
    this.player.setAlpha(now < this.hurtUntil ? 0.4 + 0.4 * Math.abs(Math.sin(now / 70)) : 1);

    // 낙하·충돌
    for (const f of this.falls) {
      f.y += f.s.speed * dt;
      f.obj.setPosition(f.x, f.y);
      const halfW = (f.s.kind === "coffee" ? 10 : f.s.w) / 2;
      const top = f.y - (f.s.kind === "coffee" ? 5 : BLOCK_H / 2);
      const bottom = f.y + (f.s.kind === "coffee" ? 5 : BLOCK_H / 2);
      const overlap = Math.abs(f.x - this.px) < halfW + PW / 2 - 1 && bottom > FLOOR_Y - 15 && top < FLOOR_Y - 1;
      if (overlap) {
        f.done = true;
        if (f.s.kind === "coffee") {
          this.coffees++;
          this.floatText(this.px, FLOOR_Y - 20, `커피 +${DEADLINE_SCORE.coffee}`, "#ffe39a", 11);
          this.sfx.play("coin-drop", 0.7);
        } else if (now >= this.hurtUntil) {
          this.hp--;
          this.hits++;
          this.hurtUntil = now + HIT_IFRAME_MS;
          this.floatText(this.px, FLOOR_Y - 20, DEADLINE_BLOCKS[f.s.label], "#ff6a6a", 11);
          this.cameras.main.shake(140, 0.006);
          this.sfx.play("hit");
          this.hearts[this.hp]?.setFillStyle(0x3a2a2e);
        } else f.done = false;
      }
      if (f.y > AH + 16) f.done = true;
      if (f.done) f.obj.destroy();
    }
    this.falls = this.falls.filter((f) => !f.done);

    if (this.hp <= 0) {
      this.sfx.play("defeat");
      return this.finish();
    }
    if (now >= this.limitMs) {
      this.sfx.play("victory");
      return this.finish();
    }
  }

  protected hud(): RpgHud {
    return {
      game: "deadline",
      hp: this.hp,
      maxHp: DEADLINE_HP,
      sp: 0,
      maxSp: 0,
      leftMs: Math.max(0, this.limitMs - this.elapsed),
      score: Math.floor(this.survived / 1000) * DEADLINE_SCORE.perSec + this.coffees * DEADLINE_SCORE.coffee,
      kills: this.coffees,
      cooldowns: [],
      potionCooldown: 0,
      potions: {},
      buffs: [],
      boss: null,
    };
  }

  protected result(): DeadlineResult {
    return {
      game: "deadline",
      durationMs: Math.round(this.elapsed),
      survivedMs: Math.round(Math.min(this.survived, this.limitMs)),
      coffees: this.coffees,
      hits: this.hits,
    };
  }
}
