import { BOSS_W, pangyo, POSES } from "@/game/chairman/chairmanPixels";

// 11/20 입장 창 카드 초상: 싸움과 같은 판교 회장님 도트 (game/chairman/chairmanPixels).
// 노멀 = 0단계 (패딩 조끼 · 사원증 · 텀블러), 헬 = 5단계 (빨간 눈 · 곤두선 머리 · 머리띠, 화난 얼굴). 48×48 칸, 화면 2배.

export const PORTRAIT = 48;

const cache = new Map<string, HTMLCanvasElement>();

/** up = 숨쉬기 (0·1), blink = 눈 감기 (노멀), glow = 눈빛 번쩍 (헬) */
export function chairPortrait(hell: boolean, up: number, blink: boolean, glow: boolean): HTMLCanvasElement {
  const key = `${+hell}${up}${+blink}${+glow}`;
  let c = cache.get(key);
  if (!c) {
    const pose = hell ? { ...POSES.idle0, f: up, brow: 1, mouth: 2, glint: glow ? 2 : 0, red: glow ? 1 : 0 } : { ...POSES[up ? "idle1" : "idle0"], blink };
    const { g, em } = pangyo(pose, hell ? 5 : 0);
    c = document.createElement("canvas");
    c.width = c.height = PORTRAIT;
    const x = c.getContext("2d")!;
    x.imageSmoothingEnabled = false;
    // 몸 40×50 → 가운데, 위 빈 줄 하나 잘라 48칸에
    const ox = (PORTRAIT - BOSS_W) / 2;
    x.drawImage(g.toCanvas(), ox, -1);
    if (hell) x.drawImage(em.toCanvas(), ox, -1);
    cache.set(key, c);
  }
  return c;
}
