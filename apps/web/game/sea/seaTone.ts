import { WorldTintControl } from "../world/worldTint";

// 11/16 바닷가 색조 (사용자 확정 시안 seaside-mock의 저녁·밤). 마을과 같은 한국 시간 색조(skyGrade)를 받아 바닷가에서만 바꿔요.
//  - 저녁(dusk 0..1): 땅은 낮게 들어오는 주황 햇빛을 곱해요 (r×0.98·g×0.82·b×0.60, 다시 ×0.9 — 잔디는 초록, 모래는 금빛으로 남게).
//    물은 이 곱하기에서 빼고(SeaMap이 물 층 앞뒤로 색조를 껐다 켜요) 노을 하늘이 비친 물 그림(seaArt duskWaterArt)으로 바꿔요.
//  - 밤: 마을 색조를 푸른 쪽으로 조금 더 (깊은 파랑).
// 낮의 흰색에 가까운 색은 거의 그대로예요.

const ch = (v: number, s: number) => ((v >> s) & 255) / 255;
const pack = (r: number, g: number, b: number) => (Math.round(Math.max(0, Math.min(1, r)) * 255) << 16) | (Math.round(Math.max(0, Math.min(1, g)) * 255) << 8) | Math.round(Math.max(0, Math.min(1, b)) * 255);

/** 시안의 저녁 땅 곱하기 (0.98·0.9, 0.82·0.9, 0.60·0.9) */
export const DUSK_LAND: readonly [number, number, number] = [0.882, 0.738, 0.54];

/** 한국 시각 → 저녁 무게 0..1 (18시 24분쯤 가장 짙고, 앞뒤 1시간 12분에 걸쳐 오르내려요) */
export function duskWeight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return Math.max(0, Math.min(1, 1 - Math.abs(h - 18.4) / 1.2));
}

/** 바닷가에서 곱할 색조 (0xRRGGBB → 0xRRGGBB). dusk = 저녁 무게 */
export function seaTone(c: number, dusk = 0): number {
  let r = ch(c, 16);
  let g = ch(c, 8);
  let b = ch(c, 0);
  if (dusk > 0) {
    // 마을 노을 색조(짙은 주황) 대신 시안의 저녁 햇빛으로
    r += (DUSK_LAND[0] - r) * dusk;
    g += (DUSK_LAND[1] - g) * dusk;
    b += (DUSK_LAND[2] - b) * dusk;
  }
  const lum = (r + g + b) / 3;
  if (dusk < 0.5 && lum < 0.55 && b >= r) {
    // 밤: 깊은 파랑 쪽으로
    b = Math.min(1, b * 1.08);
    r *= 0.94;
  }
  return pack(r, g, b);
}

/** 월드 색조 셰이더 손잡이를 감싸 바닷가 색조로 바꿔 넘겨요 (Atmosphere에 이걸 줘요). dusk는 장면이 매 프레임 넣어요 */
export class SeaToneTint extends WorldTintControl {
  dusk = 0;

  constructor(private readonly inner: WorldTintControl) {
    super();
  }

  override set(world: number, char: number): void {
    this.world = seaTone(world, this.dusk);
    this.char = seaTone(char, this.dusk * 0.5);
    this.inner.set(this.world, this.char);
  }
}
