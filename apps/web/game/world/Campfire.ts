import * as Phaser from "phaser";
import type { Campfire } from "@tomb/protocol";
import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import type { CameraRig } from "./CameraRig";
import { CINE_FADE_MS, cineCenter, cineZoom, letterboxHeight } from "./campfireMath";
import type { WorldMap } from "./WorldMap";

// 모닥불 "불멍" 연출: 모닥불 둘레에 앉으면
//  - 카메라가 모닥불 중심(살짝 위)으로 천천히 미끄러지며 4~5배로 다가간다 (둘러앉은 사람들과 불이 한 프레임에)
//  - 위아래 시네마 레터박스, 불 둘레의 따뜻한 빛, 불티가 더 많이
//  - 일어나면 원래 줌으로 돌아가 다시 캐릭터를 따라간다
// reduced-motion이면 카메라는 미끄러지지 않고 바로 바뀌고, 일렁임이 없다.

export class CampfireView {
  private fire: Campfire | null = null;
  /** 0..1 연출 진행 (들어가면 1로, 나오면 0으로) */
  private t = 0;
  private dir: 1 | -1 | 0 = 0;
  private readonly top: Phaser.GameObjects.Rectangle;
  private readonly bottom: Phaser.GameObjects.Rectangle;
  private readonly warm: Phaser.GameObjects.Image;
  private readonly tint: Phaser.GameObjects.Rectangle;
  private warmX = 0;
  private warmY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rig: CameraRig,
    private readonly map: WorldMap,
    private readonly reduced: boolean,
  ) {
    const bar = (): Phaser.GameObjects.Rectangle =>
      scene.add.rectangle(0, 0, 4, 4, 0x07060a, 1).setScrollFactor(0).setOrigin(0.5, 0.5).setDepth(DEPTH.tooltip + 50).setVisible(false);
    this.top = bar();
    this.bottom = bar();
    // 불 둘레 온기 (월드 고정, 가산)
    this.warm = scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa050).setDepth(DEPTH.lights + 4).setVisible(false);
    // 화면 전체 아주 옅은 주황 (카메라 고정)
    this.tint = scene.add
      .rectangle(0, 0, 4, 4, 0xff8a40, 1)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights + 5)
      .setVisible(false);
  }

  private warmScale = 2.6;

  /** 지금 불멍 중인 모닥불 (없으면 null) */
  get active(): Campfire | null {
    return this.fire;
  }

  /** 모닥불 둘레에 앉음 */
  enter(fire: Campfire): void {
    if (this.fire?.id === fire.id && this.dir !== -1) return;
    this.fire = fire;
    this.dir = 1;
    const cam = this.scene.cameras.main;
    const c = cineCenter(fire);
    this.rig.cinematic({ x: c.x, y: c.y, zoom: cineZoom(cam.width, cam.height, !!fire.big) }, this.reduced);
    this.map.boostCampfire(fire.id);
    this.warmX = fire.x;
    this.warmY = fire.y - 6;
    this.warmScale = fire.big ? 4.4 : 2.6;
    if (this.reduced) this.t = 1;
  }

  /** 일어남 / 다른 곳으로 순간이동 */
  exit(): void {
    if (!this.fire) return;
    this.fire = null;
    this.dir = -1;
    this.rig.cinematic(null, this.reduced);
    this.map.boostCampfire(null);
    if (this.reduced) this.t = 0;
  }

  /** 화면 크기가 바뀌면 구도(줌)를 다시 */
  resize(): void {
    if (!this.fire) return;
    const cam = this.scene.cameras.main;
    const c = cineCenter(this.fire);
    this.rig.cinematic({ x: c.x, y: c.y, zoom: cineZoom(cam.width, cam.height, !!this.fire.big) }, true);
  }

  update(now: number, dt: number): void {
    if (this.dir !== 0) {
      this.t = Math.max(0, Math.min(1, this.t + (this.dir * dt) / CINE_FADE_MS));
      if ((this.dir === 1 && this.t >= 1) || (this.dir === -1 && this.t <= 0)) this.dir = 0;
    }
    const t = this.t;
    const show = t > 0.001;
    for (const o of [this.top, this.bottom, this.warm, this.tint]) if (o.visible !== show) o.setVisible(show);
    if (!show) return;
    const cam = this.scene.cameras.main;
    const z = cam.zoom;
    // 카메라 고정 오브젝트는 줌 중심 기준 좌표: 화면 (sx,sy) → (ox + (sx-ox)/z, oy + (sy-oy)/z)
    const ox = cam.width / 2;
    const oy = cam.height / 2;
    const w = cam.width / z + 4;
    const h = letterboxHeight(cam.height, t);
    const lh = h / z + 1;
    this.top.setPosition(ox, oy + (0 - oy) / z + lh / 2 - 1).setSize(w, lh);
    this.bottom.setPosition(ox, oy + (cam.height - oy) / z - lh / 2 + 1).setSize(w, lh);
    this.tint.setPosition(ox, oy).setSize(w, cam.height / z + 4).setAlpha(0.045 * t);
    const flick = this.reduced ? 1 : 0.88 + 0.08 * Math.sin(now / 170) + 0.05 * Math.sin(now / 63);
    this.warm.setPosition(this.warmX, this.warmY).setScale(this.warmScale * (0.96 + 0.04 * flick)).setAlpha(0.42 * t * flick);
  }

  destroy(): void {
    this.top.destroy();
    this.bottom.destroy();
    this.warm.destroy();
    this.tint.destroy();
  }
}
