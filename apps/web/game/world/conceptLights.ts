import * as Phaser from "phaser";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import { DEPTH } from "../config";

// 11/17 크리스마스 전구 빛 겹 (트리·처마·거리 전구 줄): 장면마다 타이머 하나가 모든 빛 겹을 함께 돌린다.
//  - 0.7초마다 프레임 두 장을 번갈아 (전구 절반씩 밝아져 반짝인다). 움직임 줄이기면 바꾸지 않고 한 장 그대로
//  - 2초마다 시간대 빛 세기(lightGlow)를 보고 알파: 낮엔 은은하게(전구 색만 보일 만큼), 해 질 녘·밤엔 환하게
//  빛 겹은 가산 섞기 + 빛 층(DEPTH.lights 위)이라 밤 어둠에 묻히지 않는다. 그림은 각자 굽는다 (winterArt.bulbGlowSheet)

type Reg = { imgs: Set<Phaser.GameObjects.Image>; tick: number; alpha: number };
const regs = new WeakMap<Phaser.Scene, Reg>();

function nightAlpha(): number {
  const search = typeof location === "undefined" ? "" : location.search;
  const glow = ambienceAt(Date.now(), parseAmbienceOverride(search)).palette.lightGlow;
  return 0.22 + 0.78 * Math.max(0, Math.min(1, (glow - 0.1) / 0.6));
}

function regOf(scene: Phaser.Scene, reduced: boolean): Reg {
  let r = regs.get(scene);
  if (r) return r;
  const reg: Reg = { imgs: new Set(), tick: 0, alpha: nightAlpha() };
  regs.set(scene, reg);
  r = reg;
  if (!reduced)
    scene.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        reg.tick++;
        for (const img of reg.imgs) if (img.active && img.visible) img.setFrame((reg.tick + ((img.getData("tw") as number) ?? 0)) % 2);
      },
    });
  scene.time.addEvent({
    delay: 2000,
    loop: true,
    callback: () => {
      reg.alpha = nightAlpha();
      for (const img of reg.imgs) if (img.active) img.setAlpha(reg.alpha * ((img.getData("ta") as number) ?? 1));
    },
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => regs.delete(scene));
  return r;
}

/**
 * 빛 겹 이미지를 하나 세운다 (texKey = 프레임 0·1이 있는 시트). 원점·자리는 밑그림과 같게 준다.
 * phase = 이웃 빛 겹과 반짝임을 어긋나게 (0·1), alpha = 이 겹의 세기 배율
 */
export function addTwinkle(scene: Phaser.Scene, texKey: string, x: number, y: number, ox: number, oy: number, o: { reduced: boolean; phase?: number; alpha?: number }): Phaser.GameObjects.Image {
  const reg = regOf(scene, o.reduced);
  const img = scene.add.image(x, y, texKey, (o.phase ?? 0) % 2).setOrigin(ox, oy).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 2);
  img.setData("tw", o.phase ?? 0);
  img.setData("ta", o.alpha ?? 1);
  img.setAlpha(reg.alpha * (o.alpha ?? 1));
  reg.imgs.add(img);
  img.once(Phaser.GameObjects.Events.DESTROY, () => reg.imgs.delete(img));
  return img;
}
