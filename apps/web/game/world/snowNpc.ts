import type * as Phaser from "phaser";
import type { AvatarView } from "../entities/AvatarView";
import type { SnowBody } from "./snowHit";
import { opaqueRect } from "./snowMask";

// 11/18 눈싸움 (사용자 「모든 사람이 다 맞아야 함, NPC도 ㅋㅋ」 · 「건물에도 박게」):
//  - NPC(마을·캠핑장 주민·강아지·고양이·사육사·관리소 사람들)도 맞는다. NPC 위치는 각 화면이 계산하니 맞음도 각 화면이 판정한다 (서버에 보내지 않는다)
//  - 길을 막는 것(건물·벽·울타리·나무·바위·매대·가로등·벤치…)에 닿으면 거기 박힌다. 맵 충돌 상자를 칸(SnowGrid)으로 한 번 구워 두고 칸만 본다

/** 맞을 수 있는 NPC 하나 (각 무리가 한 번 만들어 들고 있다 — 매 프레임 새로 만들지 않는다) */
export type SnowNpc = {
  /** 지금 몸 상자를 채운다 (화면에 안 보이면 false) */
  box(out: SnowBody): boolean;
  /** AvatarView로 그리는 주민이면 그 그림 (눈 묻은 얼굴·휘청·말풍선을 그대로 쓴다 — 장면 시계) */
  av?(): AvatarView | null;
  /** 그림 한 장으로 그리는 NPC면 그 그림 (머리에 눈을 얹고 움찔) */
  img?(): Phaser.GameObjects.Image | null;
  /** 놀란 한마디 (없으면 SnowFight가 말풍선을 띄운다) */
  say?(text: string): void;
  /** 걷던 걸음을 잠깐 멈춘다 (ms) */
  hold?(ms: number): void;
  /** 한마디 갈래 */
  voice: SnowVoice;
};
export type SnowVoice = "person" | "cat" | "dog";

/** 맞은 NPC의 한마디 (가끔, NPC마다 간격을 두고) */
export const SNOW_NPC_LINES: Readonly<Record<SnowVoice, readonly string[]>> = {
  person: ["앗 차가워요!", "누구예요!", "으앗!", "눈싸움이에요?", "차가워라!", "맞았다!"],
  cat: ["냐앗!", "캬악!", "냥?!"],
  dog: ["왈왈!", "깨갱!", "멍?!"],
};

/**
 * 그림 한 장 NPC의 몸 상자: 그림의 불투명 픽셀 상자로 잰다 (snowMask — 11/18 사용자 「고양이한테 맞춰도 아예 위에 올라가 있네」:
 * 고양이·강아지 그림은 위가 비어 있어 그림 상자로 재면 머리 눈·퍽이 몸 위 허공에 떴다). 안 보이거나 흐리면 false
 */
export function imageBox(img: Phaser.GameObjects.Image | null | undefined, out: SnowBody, halfK = 0.4): boolean {
  if (!img || !img.visible || img.alpha < 0.3 || !img.active) return false;
  const r = opaqueRect(img);
  out.x = (r.left + r.right) / 2;
  out.y = r.bottom - 1;
  out.lift = 0;
  out.top = Math.max(4, r.bottom - r.top);
  out.half = Math.max(4, (r.right - r.left) * halfK);
  return true;
}

/**
 * 막힌 칸 (cell px 칸 하나에 한 바이트). 맵 충돌 상자를 한 번 구워 두고 칸만 본다 (매 프레임 할당 없음).
 * skip(x, y) = 그 칸 가운데가 막힌 것으로 치지 않을 자리 (캠핑장 계곡 물 — 물 위로는 날아간다)
 */
export class SnowGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: Uint8Array;

  constructor(
    private readonly w: number,
    private readonly h: number,
    private readonly cell = 4,
  ) {
    this.cols = Math.ceil(w / cell);
    this.rows = Math.ceil(h / cell);
    this.cells = new Uint8Array(this.cols * this.rows);
  }

  /** 다시 굽는다: 상자 목록 (x,y,w,h) */
  fill(rects: Iterable<{ x: number; y: number; w: number; h: number }>, skip?: (x: number, y: number) => boolean): this {
    const c = this.cell;
    this.cells.fill(0);
    for (const r of rects) {
      if (!(r.w > 0 && r.h > 0)) continue;
      const c0 = Math.max(0, Math.floor(r.x / c));
      const c1 = Math.min(this.cols - 1, Math.floor((r.x + r.w - 0.01) / c));
      const r0 = Math.max(0, Math.floor(r.y / c));
      const r1 = Math.min(this.rows - 1, Math.floor((r.y + r.h - 0.01) / c));
      for (let y = r0; y <= r1; y++)
        for (let x = c0; x <= c1; x++) {
          if (skip?.(x * c + c / 2, y * c + c / 2)) continue;
          this.cells[y * this.cols + x] = 1;
        }
    }
    return this;
  }

  /** 정적 물리 무리(맵 충돌)의 몸으로 굽는다 */
  fillGroups(groups: readonly (Phaser.Physics.Arcade.StaticGroup | null | undefined)[], skip?: (x: number, y: number) => boolean): this {
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    for (const g of groups) {
      if (!g?.children) continue;
      for (const o of g.getChildren()) {
        const b = (o as { body?: Phaser.Physics.Arcade.StaticBody | null }).body;
        if (b && b.enable !== false) rects.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      }
    }
    return this.fill(rects, skip);
  }

  /** 이 자리가 막혔나 (맵 밖도 막힘) */
  blocked(x: number, y: number): boolean {
    if (!(x >= 0 && y >= 0 && x < this.w && y < this.h)) return true;
    return this.cells[Math.floor(y / this.cell) * this.cols + Math.floor(x / this.cell)] === 1;
  }
}
