import { WorldTintControl } from "../world/worldTint";

// 11/16 바닷가 색조: 마을과 같은 한국 시간 색조(skyGrade)를 받아 바닷가에서만 살짝 바꿔요 (사용자: "노을은 부드러운 라벤더, 밤은 깊은 파랑").
// 따뜻한 노을빛(빨강이 파랑보다 센 색)은 라벤더 쪽으로, 밤 색은 푸른 쪽으로 조금 더. 낮의 흰색에 가까운 색은 거의 그대로예요.

const ch = (v: number, s: number) => ((v >> s) & 255) / 255;
const pack = (r: number, g: number, b: number) => (Math.round(Math.max(0, Math.min(1, r)) * 255) << 16) | (Math.round(Math.max(0, Math.min(1, g)) * 255) << 8) | Math.round(Math.max(0, Math.min(1, b)) * 255);

/** 바닷가에서 곱할 색조 (0xRRGGBB → 0xRRGGBB) */
export function seaTone(c: number): number {
  let r = ch(c, 16);
  let g = ch(c, 8);
  let b = ch(c, 0);
  const warm = r - b;
  if (warm > 0.04) {
    // 노을: 파랑을 끌어올리고 빨강을 조금 눌러 라벤더로
    b += warm * 0.55;
    g += (r - g) * 0.12;
    r -= warm * 0.12;
  }
  const lum = (r + g + b) / 3;
  if (lum < 0.55 && b >= r) {
    // 밤: 깊은 파랑 쪽으로
    b = Math.min(1, b * 1.08);
    r *= 0.94;
  }
  return pack(r, g, b);
}

/** 월드 색조 셰이더 손잡이를 감싸 바닷가 색조로 바꿔 넘겨요 (Atmosphere에 이걸 줘요) */
export class SeaToneTint extends WorldTintControl {
  constructor(private readonly inner: WorldTintControl) {
    super();
  }

  override set(world: number, char: number): void {
    this.inner.set(seaTone(world), seaTone(char));
  }
}
