import * as Phaser from "phaser";
import { DEPTH } from "../config";
import { ensureHouseTextures, HOUSE_H, HOUSE_W, HTEX } from "./hauntArt";
import { HAUNT_HOUSE, hauntColliders } from "./hauntLayout";

// 마을의 귀신의집 건물 (언덕 위 낡은 2층 집). 그림 + 몸체 충돌 + 깨진 창의 흔들리는 불빛.
// 가끔 둥근 창에 하얀 얼굴이 잠깐 비친다 (움직임 줄이기면 빼고). 매 프레임 갱신 없이 씬 타이머로만 움직인다.

export class HauntHouseView {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];

  constructor(scene: Phaser.Scene, colliders: Phaser.Physics.Arcade.StaticGroup, reduced: boolean) {
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
    // 깨진 창(오른쪽 아래)의 주황 불빛 — 어둠 위에 번진다
    const glow = scene.add
      .image(left + HOUSE_W - 17, top + 45, HTEX.houseGlow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.lights)
      .setAlpha(0.35);
    this.objs.push(glow);
    // 탑의 둥근 창에 비치는 얼굴
    const face = scene.add.rectangle(left + 21, top + 22, 2, 3, 0xe8eef0).setDepth(y + 0.5).setAlpha(0);
    this.objs.push(face);
    this.timers.push(
      scene.time.addEvent({
        delay: 140,
        loop: true,
        callback: () => glow.setAlpha(reduced ? 0.32 : 0.22 + Math.random() * 0.2),
      }),
    );
    if (!reduced) {
      this.timers.push(
        scene.time.addEvent({
          delay: 17_000,
          loop: true,
          callback: () => {
            if (Math.random() < 0.6) scene.tweens.add({ targets: face, alpha: 0.9, duration: 500, yoyo: true, hold: 1200 });
          },
        }),
      );
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  destroy(): void {
    for (const t of this.timers.splice(0)) t.remove();
    for (const o of this.objs.splice(0)) o.destroy();
  }
}
