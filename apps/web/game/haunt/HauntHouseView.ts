import * as Phaser from "phaser";
import { DEPTH } from "../config";
import {
  ensureHouseTextures,
  ensureSignTextures,
  HOUSE_FACE_WINDOWS,
  HOUSE_H,
  HOUSE_LIT_WINDOW,
  HOUSE_SIGN_Y,
  HOUSE_W,
  HTEX,
  whenSignFont,
} from "./hauntArt";
import { HAUNT_DOOR, HAUNT_HOUSE, HAUNT_LAMPS, hauntColliders } from "./hauntLayout";
import { HauntYardSound } from "./hauntYardSound";

// 마을의 귀신의집 건물 (광장 입구의 낡은 2층 집). 그림 + 몸체 충돌 + 눈에 띄는 장식:
//  - 처마에 매단 "귀신의집" 간판 (바람에 흔들리고, 글씨 빛이 고장 난 네온처럼 가끔 깜빡인다)
//  - 문 양옆 보라·초록 벽등 (일렁임) — 밤 빛은 HAUNT_LIGHTS를 WorldMap이 staticLights에 더해 어둠을 밝힌다
//  - 문틈에서 새어 나오는 안개, 깨진 창의 주황 불빛, 가끔 창에 비치는 귀신 얼굴
//  - 가까이 가면 가끔 아주 작은 킥킥 웃음·먼 비명 (효과음 볼륨을 따른다)
// 매 프레임 갱신 없이 씬 타이머·트윈으로만 움직인다. 움직임 줄이기면 흔들림·안개 흐름·얼굴을 빼고 정지 그림만.

/** 소리가 들리기 시작하는 거리 (px) */
const HEAR_FAR = 110;
/** 소리가 가장 크게 들리는 거리 (px) */
const HEAR_NEAR = 36;

export class HauntHouseView {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly sound = new HauntYardSound();
  private alive = true;

  constructor(
    private readonly scene: Phaser.Scene,
    colliders: Phaser.Physics.Arcade.StaticGroup,
    private readonly reduced: boolean,
    private readonly listener: () => { x: number; y: number } | null = () => null,
  ) {
    ensureHouseTextures(scene);
    const { x, y } = HAUNT_HOUSE;
    const left = x - HOUSE_W / 2;
    const top = y - HOUSE_H;
    this.objs.push(scene.add.image(x, y, HTEX.house).setOrigin(0.5, 1).setDepth(y));
    for (const r of hauntColliders()) {
      const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      z.removeFromDisplayList();
      colliders.add(z);
      this.objs.push(z);
    }
    // 깨진 창의 주황 불빛 — 어둠 위에 번진다
    const glow = scene.add
      .image(left + HOUSE_LIT_WINDOW.x, top + HOUSE_LIT_WINDOW.y, HTEX.houseGlow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights)
      .setAlpha(0.35);
    this.objs.push(glow);
    this.every(140, () => glow.setAlpha(reduced ? 0.32 : 0.22 + Math.random() * 0.2));

    this.addLamps();
    this.addMist();
    this.addFaces(left, top);
    whenSignFont(() => {
      if (!this.alive) return;
      ensureSignTextures(scene);
      this.addSign(top + HOUSE_SIGN_Y);
    });
    // 가까이 있으면 가끔 킥킥 웃음 (드물게 먼 비명)
    this.timers.push(scene.time.addEvent({ delay: 2600, loop: true, callback: () => this.maybeSound() }));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private every(delay: number, callback: () => void): void {
    this.timers.push(this.scene.time.addEvent({ delay, loop: true, callback }));
  }

  /** 문 양옆 보라·초록 벽등 + 둘레 번짐 (일렁임) */
  private addLamps(): void {
    const { x, y } = HAUNT_HOUSE;
    for (const [i, l] of HAUNT_LAMPS.entries()) {
      const lx = x + l.dx;
      const ly = y - l.dy;
      this.objs.push(this.scene.add.image(lx, ly, i === 0 ? HTEX.lampP : HTEX.lampG).setOrigin(0.5, 0.5).setDepth(y + 0.4));
      const halo = this.scene.add
        .image(lx, ly + 1, HTEX.lampGlow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.lights)
        .setTint(l.tint)
        .setScale(0.9)
        .setAlpha(0.55);
      this.objs.push(halo);
      if (!this.reduced) {
        this.every(110 + i * 37, () => halo.setAlpha(0.42 + Math.random() * 0.25).setScale(0.82 + Math.random() * 0.16));
      }
    }
  }

  /** 문틈에서 새어 나와 땅에 깔리며 흩어지는 안개 */
  private addMist(): void {
    const { x, y } = HAUNT_DOOR;
    const scene = this.scene;
    if (this.reduced) {
      // 움직이지 않는 옅은 안개 두 덩이
      for (const dx of [-6, 7]) this.objs.push(scene.add.image(x + dx, y - 2, HTEX.mist).setDepth(y - 6).setAlpha(0.32));
      return;
    }
    const puff = () => {
      if (!this.alive) return;
      const side = Math.random() < 0.5 ? -1 : 1;
      const img = scene.add
        .image(x + (Math.random() * 8 - 4), y - 4, HTEX.mist)
        .setDepth(y - 6)
        .setAlpha(0)
        .setScale(0.45, 0.5);
      this.objs.push(img);
      scene.tweens.add({
        targets: img,
        x: img.x + side * (14 + Math.random() * 22),
        y: img.y + 5 + Math.random() * 8,
        scaleX: 1.3 + Math.random() * 0.5,
        scaleY: 1 + Math.random() * 0.3,
        duration: 3400 + Math.random() * 1600,
        ease: "Sine.easeOut",
      });
      scene.tweens.add({
        targets: img,
        alpha: { from: 0, to: 0.4 + Math.random() * 0.15 },
        duration: 900,
        yoyo: true,
        hold: 1300,
        onComplete: () => {
          const k = this.objs.indexOf(img);
          if (k >= 0) this.objs.splice(k, 1);
          img.destroy();
        },
      });
    };
    for (let i = 0; i < 3; i++) scene.time.delayedCall(i * 500, puff);
    this.every(700, puff);
  }

  /** 가끔 창 하나에 하얀 얼굴이 떠올랐다 사라진다 */
  private addFaces(left: number, top: number): void {
    if (this.reduced) return;
    const scene = this.scene;
    const faces = HOUSE_FACE_WINDOWS.map((w) => scene.add.image(left + w.x, top + w.y, HTEX.windowFace).setDepth(HAUNT_HOUSE.y + 0.5).setAlpha(0));
    this.objs.push(...faces);
    this.every(6500, () => {
      if (Math.random() > 0.55) return;
      const f = faces[Math.floor(Math.random() * faces.length)];
      if (scene.tweens.isTweening(f)) return;
      scene.tweens.add({ targets: f, alpha: 0.95, duration: 380, yoyo: true, hold: 900 + Math.random() * 900 });
    });
  }

  /** 처마에 매단 간판: 바람에 흔들리고 글씨 빛이 고장 난 네온처럼 가끔 깜빡인다 */
  private addSign(hangY: number): void {
    const scene = this.scene;
    const { x, y } = HAUNT_HOUSE;
    const board = scene.add.image(0, 0, HTEX.sign).setOrigin(0.5, 0);
    const lit = scene.add.image(x, hangY, HTEX.signGlow).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights).setAlpha(0.55);
    const box = scene.add.container(x, hangY, [board]).setDepth(y + 0.6);
    this.objs.push(box, lit);
    if (this.reduced) return;
    // 흔들림 (판과 빛 층이 같이)
    scene.tweens.add({ targets: [box, lit], angle: { from: -3, to: 3 }, duration: 1900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    // 깜빡임: 평소엔 은은하게 일렁이다 가끔 툭 꺼졌다 켜진다
    this.every(120, () => {
      const r = Math.random();
      lit.setAlpha(r < 0.04 ? 0.05 : 0.45 + Math.random() * 0.2);
      board.setAlpha(r < 0.04 ? 0.82 : 1);
    });
  }

  private maybeSound(): void {
    const me = this.listener();
    if (!me || Math.random() > 0.45) return;
    const dx = HAUNT_DOOR.x - me.x;
    const d = Math.hypot(dx, HAUNT_DOOR.y - me.y);
    if (d > HEAR_FAR) return;
    const v = d <= HEAR_NEAR ? 1 : 1 - (d - HEAR_NEAR) / (HEAR_FAR - HEAR_NEAR);
    const pan = Math.max(-0.8, Math.min(0.8, dx / 120));
    if (Math.random() < 0.22) this.sound.shriek(v, pan);
    else this.sound.giggle(v, pan);
  }

  destroy(): void {
    this.alive = false;
    for (const t of this.timers.splice(0)) t.remove();
    for (const o of this.objs.splice(0)) o.destroy();
    this.sound.destroy();
  }
}
