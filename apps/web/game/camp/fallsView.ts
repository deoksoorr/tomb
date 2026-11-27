import * as Phaser from "phaser";
import { DEPTH } from "../config";
import type { CameraRig } from "../world/CameraRig";
import { CINE_FADE_MS, letterboxHeight } from "../world/campfireMath";
import { FALLS_VIEW_CENTER, fallsZoom } from "./campWater";

// 11/26 「폭포 멍」: 폭포 다리 긴 의자(qW1·qW2)에 앉으면 모닥불 불멍·관람차 하늘 보기처럼 시점을 바꾼다 (view:mode "falls").
//  - 카메라가 폭포와 달그늘 소가 한 프레임에 들어오게 천천히 다가가고(위아래 레터박스), 화면에 차가운 물안개 빛이 옅게 깔린다
//  - 물보라·물안개는 CampMap.setFallsFocus가 짙게, 물소리는 장면이 크게 (Sfx.fallsRush — 폭포 전용 루프 falls-loop.mp3)
// reduced-motion이면 카메라는 미끄러지지 않고 바로 바뀐다.

export class FallsView {
  private on = false;
  private t = 0;
  private dir: 1 | -1 | 0 = 0;
  private readonly top: Phaser.GameObjects.Rectangle;
  private readonly bottom: Phaser.GameObjects.Rectangle;
  private readonly tint: Phaser.GameObjects.Rectangle;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rig: CameraRig,
    private readonly reduced: boolean,
  ) {
    const bar = (): Phaser.GameObjects.Rectangle =>
      scene.add.rectangle(0, 0, 4, 4, 0x06080c, 1).setScrollFactor(0).setOrigin(0.5, 0.5).setDepth(DEPTH.tooltip + 50).setVisible(false);
    this.top = bar();
    this.bottom = bar();
    this.tint = scene.add.rectangle(0, 0, 4, 4, 0x8ac8f0, 1).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 5).setVisible(false);
  }

  get active(): boolean {
    return this.on;
  }

  enter(): void {
    if (this.on && this.dir !== -1) return;
    this.on = true;
    this.dir = 1;
    const cam = this.scene.cameras.main;
    this.rig.cinematic({ ...FALLS_VIEW_CENTER, zoom: fallsZoom(cam.width, cam.height) }, this.reduced);
    if (this.reduced) this.t = 1;
  }

  exit(): void {
    if (!this.on) return;
    this.on = false;
    this.dir = -1;
    this.rig.cinematic(null, this.reduced);
    if (this.reduced) this.t = 0;
  }

  resize(): void {
    if (!this.on) return;
    const cam = this.scene.cameras.main;
    this.rig.cinematic({ ...FALLS_VIEW_CENTER, zoom: fallsZoom(cam.width, cam.height) }, true);
  }

  update(dt: number): void {
    if (this.dir !== 0) {
      this.t = Math.max(0, Math.min(1, this.t + (this.dir * dt) / CINE_FADE_MS));
      if ((this.dir === 1 && this.t >= 1) || (this.dir === -1 && this.t <= 0)) this.dir = 0;
    }
    const t = this.t;
    const show = t > 0.001;
    for (const o of [this.top, this.bottom, this.tint]) if (o.visible !== show) o.setVisible(show);
    if (!show) return;
    const cam = this.scene.cameras.main;
    const z = cam.zoom;
    const ox = cam.width / 2;
    const oy = cam.height / 2;
    const w = cam.width / z + 4;
    const lh = letterboxHeight(cam.height, t) / z + 1;
    this.top.setPosition(ox, oy + (0 - oy) / z + lh / 2 - 1).setSize(w, lh);
    this.bottom.setPosition(ox, oy + (cam.height - oy) / z - lh / 2 + 1).setSize(w, lh);
    this.tint.setPosition(ox, oy).setSize(w, cam.height / z + 4).setAlpha(0.035 * t);
  }

  destroy(): void {
    this.top.destroy();
    this.bottom.destroy();
    this.tint.destroy();
  }
}
