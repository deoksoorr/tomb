import type * as Phaser from "phaser";
import { SPROUT_H, SPROUT_W, sproutPixels } from "@/lib/sproutArt";

// 11/22 새싹 표시 텍스처 (lib/sproutArt 픽셀 그대로, 1:1). 이름표처럼 1/zoom 배율로 놓아 화면에서 11×11 px로 보인다

export const SPROUT_TEX = "sprout-mark";
export { SPROUT_H, SPROUT_W };

/** 처음 쓸 때 한 번 굽는다 (씬마다 텍스처 관리자가 같아 게임에 하나) */
export function ensureSproutTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(SPROUT_TEX)) return SPROUT_TEX;
  const c = document.createElement("canvas");
  c.width = SPROUT_W;
  c.height = SPROUT_H;
  const g = c.getContext("2d");
  if (g) {
    const px = sproutPixels();
    for (let y = 0; y < SPROUT_H; y++)
      for (let x = 0; x < SPROUT_W; x++) {
        const col = px[y][x];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
  }
  scene.textures.addCanvas(SPROUT_TEX, c);
  return SPROUT_TEX;
}
