import { Grid } from "../sprites/pixel";

// 11/26 운영자 「도트 잘린 게 중간중간 있다」 (캠핑장 → 바닷가도): 그림을 캔버스 끝 열·줄까지 칠하면 윤곽(제 색 테두리)을 둘 자리가 없고,
// 캔버스 밖으로 나간 칠은 아예 사라져 칼로 자른 듯 평평하게 보인다. 바닷가 그림은 물건마다 제 색에서 나온 테두리(toneOutline)라
// 한 가지 색으로 끝을 닫을 수 없다 → 같은 그림 함수를 둘레 여백을 둔 큰 칸에 그대로 그린다 (그리는 좌표는 원래 그림 좌표 그대로).
// 원점이 바닥 가운데(0.5, 1)인 그림은 좌우 같은 폭·위만(아래 0) 넓히면 맵 자리가 픽셀 그대로, 가운데 원점(0.5, 0.5)이면 사방 같은 폭.

/** 둘레 여백 (좌우 각 x · 위 top · 아래 bottom) */
export type SeaPad = { readonly x: number; readonly top: number; readonly bottom: number };
export const NO_PAD: SeaPad = { x: 0, top: 0, bottom: 0 };

/** 그 그림에 둘린 여백 (결 넣기 detailPass가 결 무늬를 원래 그림 좌표로 맞추는 데 쓴다) */
const pads = new WeakMap<Grid, SeaPad>();
export const padOfGrid = (g: Grid): SeaPad => pads.get(g) ?? NO_PAD;

/**
 * 여백 둔 그리드: set·get·filled·rect·hline·vline·ellipse·recolor·outline·draw는 원래 그림 좌표(여백 밖 음수·w 넘는 칸도 그려진다),
 * px·w·h는 여백까지 넣은 실제 칸 (toneOutline·detailPass처럼 px를 바로 읽는 단계는 큰 칸 전체를 본다)
 */
export class PadGrid extends Grid {
  constructor(
    readonly lw: number,
    readonly lh: number,
    readonly pad: SeaPad,
  ) {
    super(lw + pad.x * 2, lh + pad.top + pad.bottom);
    pads.set(this, pad);
  }
  override set(x: number, y: number, c: number, a = 255): void {
    super.set((x | 0) + this.pad.x, (y | 0) + this.pad.top, c, a);
  }
  override get(x: number, y: number): number {
    return super.get(x + this.pad.x, y + this.pad.top);
  }
  override recolor(test: (x: number, y: number) => boolean, c: number): void {
    for (let y = -this.pad.top; y < this.h - this.pad.top; y++)
      for (let x = -this.pad.x; x < this.w - this.pad.x; x++) if (this.filled(x, y) && test(x, y)) this.set(x, y, c);
  }
  override outline(c: number, diagonal = false, a = 255): void {
    // 큰 칸 전체에서 (여백이 있어 끝 열을 닫는 예외는 필요 없다)
    const raw = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && (this.px[y * this.w + x] & 255) > 0;
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (raw(x, y)) continue;
        const n = raw(x - 1, y) || raw(x + 1, y) || raw(x, y - 1) || raw(x, y + 1) || (diagonal && (raw(x - 1, y - 1) || raw(x + 1, y - 1) || raw(x - 1, y + 1) || raw(x + 1, y + 1)));
        if (n) add.push(x, y);
      }
    for (let i = 0; i < add.length; i += 2) this.px[add[i + 1] * this.w + add[i]] = Grid.rgba(c, a);
  }
  override draw(src: Grid, ox: number, oy: number): void {
    super.draw(src, ox + this.pad.x, oy + this.pad.top);
  }
  /** 다 그린 뒤 보통 그리드로 (좌표를 큰 칸 그대로 쓰는 쪽 — 텍스처·테스트·결 넣기) */
  done(): Grid {
    const g = new Grid(this.w, this.h);
    g.px.set(this.px);
    pads.set(g, this.pad);
    return g;
  }
}

/** 여백 둔 그리드 만들기 (art 함수 안 `new Grid(W, H)` 자리에) */
export const padded = (w: number, h: number, pad: SeaPad): PadGrid => new PadGrid(w, h, pad);
