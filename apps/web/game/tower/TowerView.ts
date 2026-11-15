import * as Phaser from "phaser";
import { DEPTH } from "../config";
import {
  BEACON_AT,
  DOOR_BOX,
  ensureTowerSign,
  ensureTowerTextures,
  SIGN_BOX,
  TOWER_H,
  TOWER_W,
  towerFlickers,
  TTEX,
  whenTowerFont,
} from "./towerArt";
import { TOWER, towerColliders } from "./towerLayout";

// 11/15 마을의 야근 빌딩 (정문 옆 고층 빌딩). 그림 + 몸체 충돌 + 움직이는 장식:
//  - 불 켜진 창 빛 층: 밤이 깊을수록 진해진다 (낮에도 은은하게 — 야근은 낮에도 한다)
//  - 밤에는 창 몇 개가 가끔 꺼졌다 켜진다 (퇴근하는 사람·형광등 깜빡임)
//  - 옥상 분홍 네온 간판 "야근 빌딩" (가끔 고장 난 듯 깜빡) · 안테나 빨간 항공등 (천천히 깜빡)
//  - 로비 회전문이 천천히 돈다
// 매 프레임 갱신 없이 씬 타이머로만 움직인다. 움직임 줄이기면 깜빡임·회전문 없이 정지 그림 (빛 층은 밤 정도만 따른다).

export class TowerView {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private alive = true;
  private glow: Phaser.GameObjects.Image;
  private panes: { img: Phaser.GameObjects.Image; off: number }[] = [];
  private signLit: Phaser.GameObjects.Image | null = null;
  private signBoard: Phaser.GameObjects.Image | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    colliders: Phaser.Physics.Arcade.StaticGroup,
    private readonly reduced: boolean,
    /** 지금 밤 정도 0..1 (Atmosphere levels.darkness) */
    private readonly darkness: () => number = () => 0,
  ) {
    ensureTowerTextures(scene);
    const { x, y } = TOWER;
    const left = x - TOWER_W / 2;
    const top = y - TOWER_H;
    this.objs.push(
      scene.add.image(x, y, TTEX.body).setOrigin(0.5, 1).setDepth(y),
    );
    for (const r of towerColliders()) {
      const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      z.removeFromDisplayList();
      colliders.add(z);
      this.objs.push(z);
    }
    // 불 켜진 창 빛 (어둠 위)
    this.glow = scene.add
      .image(x, y, TTEX.glow)
      .setOrigin(0.5, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights)
      .setAlpha(0.2);
    this.objs.push(this.glow);
    // 회전문
    const door = scene.add
      .sprite(left + DOOR_BOX.x, top + DOOR_BOX.y, TTEX.door, 0)
      .setOrigin(0, 0)
      .setDepth(y + 0.3);
    this.objs.push(door);
    if (!reduced) {
      let f = 0;
      this.every(260, () => door.setFrame((f = (f + 1) % 3)));
    }
    // 깜빡이는 창: 켜진 앞면 창 중 몇 개 (빛 층에서 빠져 있다 — 여기서 하나씩 켠다)
    for (const w of towerFlickers()) {
      const img = scene.add
        .image(left + w.x - 1, top + w.y - 1, TTEX.pane)
        .setOrigin(0, 0)
        .setTint(w.lit === "cool" ? 0xcfe6ff : 0xffd890)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.lights + 0.1)
        .setAlpha(0);
      this.panes.push({ img, off: 0 });
      this.objs.push(img);
    }
    // 항공등
    const beacon = scene.add
      .image(left + BEACON_AT.x, top + BEACON_AT.y + 1, TTEX.beacon)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights + 0.2);
    this.objs.push(beacon);
    let blink = 0;
    this.every(500, () => {
      blink = (blink + 1) % 4;
      beacon.setAlpha(
        this.reduced ? 0.8 : blink === 0 ? 1 : blink === 1 ? 0.5 : 0.08,
      );
    });
    // 밤 정도 따라 빛 층·간판·깜빡이는 창
    this.every(160, () => this.tick());
    this.tick();
    whenTowerFont(() => {
      if (!this.alive) return;
      ensureTowerSign(scene);
      this.signBoard = scene.add
        .image(left + SIGN_BOX.x, top + SIGN_BOX.y, TTEX.sign)
        .setOrigin(0, 0)
        .setDepth(y + 0.2);
      this.signLit = scene.add
        .image(left + SIGN_BOX.x - 3, top + SIGN_BOX.y - 3, TTEX.signGlow)
        .setOrigin(0, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.lights + 0.1);
      this.objs.push(this.signBoard, this.signLit);
      this.tick();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private every(delay: number, callback: () => void): void {
    this.timers.push(this.scene.time.addEvent({ delay, loop: true, callback }));
  }

  private tick(): void {
    const night = Math.min(1, Math.max(0, this.darkness()) * 2.2);
    this.glow.setAlpha(0.18 + 0.72 * night);
    // 간판: 낮엔 은은하게, 밤엔 환하게. 가끔 툭 꺼졌다 켜진다
    if (this.signLit && this.signBoard) {
      const broke = !this.reduced && Math.random() < 0.025;
      this.signLit.setAlpha(
        broke
          ? 0.05
          : 0.35 + 0.55 * night + (this.reduced ? 0 : Math.random() * 0.08),
      );
      this.signBoard.setAlpha(broke ? 0.7 : 1);
    }
    // 깜빡이는 창: 평소엔 다른 창처럼 켜져 있고, 밤엔 가끔 한동안 꺼지거나(퇴근) 형광등처럼 파르르 떤다
    const on = 0.85 * (0.18 + 0.72 * night);
    for (const p of this.panes) {
      if (this.reduced || night < 0.3) {
        p.img.setAlpha(on);
        continue;
      }
      if (p.off > 0) {
        p.off--;
        p.img.setAlpha(0);
        continue;
      }
      const r = Math.random();
      if (r < 0.012) p.off = 15 + Math.floor(Math.random() * 40);
      p.img.setAlpha(r < 0.06 ? Math.random() * on : on);
    }
  }

  destroy(): void {
    this.alive = false;
    for (const t of this.timers.splice(0)) t.remove();
    for (const o of this.objs.splice(0)) o.destroy();
  }
}
