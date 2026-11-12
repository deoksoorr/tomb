import { AV_ANIM, AV_W, avatarFrameGrid } from "./avatar";
import { darken, Grid, lighten, type Color } from "./pixel";

// 해먹 천과 "해먹에 누운 사람" 그림 (F5). 해먹 소품(worldProps.hammock)과 누운 사람 텍스처가 같은 천 모양을 쓴다.
//  - 천 = 늘어진 주머니: 먼 쪽 테(뒤) + 안쪽 그늘 + 가까운 쪽 겉면(앞). 가운데가 처진다
//  - 누운 사람 텍스처(해먹 텍스처와 같은 48×30 칸, 픽셀 1:1로 겹친다) = 뒤 천 → 천 곡선을 따라 휜 몸 → 앞 천.
//    몸 아래쪽은 앞 천에 가려 "천 안에 누운" 모습이 된다. 몸은 서 있는 프레임(AV_ANIM.hammock)을 90° 눕혀(머리 왼쪽)
//    천 곡선만큼 세로줄마다 내려 휘게 만든다 → 몸 6종·시트 꾸미기(모자·목도리·손등불)가 그대로 따라온다.
//  - 프레임 2장: 0 = 쉬는 자세, 1 = 몸이 1px 더 가라앉음 (AvatarView가 천천히 번갈아 → 흔들흔들). 천은 두 프레임이 같아
//    밑에 깔린 해먹 소품과 어긋나지 않는다.
// 좌표: 해먹 텍스처 왼쪽 위 기준 (tx, ty). 해먹 소품은 원점 (0.5, 1)로 받침(p.x, p.y + 1)에 놓인다.

export const HAMMOCK_W = 48;
export const HAMMOCK_H = 30;
/** 누운 사람 앵커(layout HAMMOCK_LIFT: 받침 p.y보다 5px 위)에서 텍스처 왼쪽 위까지 → 누운 텍스처의 표시 원점 */
export const HAMMOCK_ANCHOR_UP = 5;
export const LIE_ORIGIN_X = HAMMOCK_W / 2;
export const LIE_ORIGIN_Y = HAMMOCK_H - 1 - HAMMOCK_ANCHOR_UP;
export const LIE_FRAMES = 2;

/** 천 가로 범위 (양 끝 = 줄이 묶이는 곳) */
export const FABRIC_X0 = 10;
export const FABRIC_X1 = 37;
const FABRIC_CX = (FABRIC_X0 + FABRIC_X1) / 2;
const FABRIC_HALF = (FABRIC_X1 - FABRIC_X0) / 2;

/** 처짐 정도 0(끝)..1(가운데) */
function sag(tx: number): number {
  const u = (tx - FABRIC_CX) / FABRIC_HALF;
  return Math.max(0, 1 - u * u);
}
/** 먼 쪽 테 (뒤) */
export const fabricBackTop = (tx: number) => 14 + Math.round(2 * sag(tx));
/** 가까운 쪽 테 (앞 천 윗줄) */
export const fabricFrontTop = (tx: number) => 15 + Math.round(4 * sag(tx));
/** 앞 천 아랫줄 (주머니 바닥) */
export const fabricBottom = (tx: number) => 16 + Math.round(7 * sag(tx));

const OUT = 0x1f1d1a;
const STRIPE_A = 0xc85a46;
const STRIPE_B = 0xe8d6b0;
const stripe = (tx: number): Color => (Math.floor((tx - FABRIC_X0) / 3) % 2 ? STRIPE_A : STRIPE_B);

/** 뒤 천: 먼 쪽 테 + 주머니 안쪽 그늘 (테두리 포함) */
export function fabricBack(): Grid {
  const g = new Grid(HAMMOCK_W, HAMMOCK_H);
  for (let tx = FABRIC_X0; tx <= FABRIC_X1; tx++) {
    const c = stripe(tx);
    const yb = fabricBackTop(tx);
    const yf = fabricFrontTop(tx);
    g.set(tx, yb, darken(c, 0.12));
    for (let y = yb + 1; y < yf; y++) g.set(tx, y, darken(c, 0.42));
  }
  g.outline(OUT);
  return g;
}

/** 앞 천: 가까운 쪽 겉면 (윗줄 밝게, 아랫줄 그늘, 테두리 포함) */
export function fabricFront(): Grid {
  const g = new Grid(HAMMOCK_W, HAMMOCK_H);
  for (let tx = FABRIC_X0; tx <= FABRIC_X1; tx++) {
    const c = stripe(tx);
    const yf = fabricFrontTop(tx);
    const yb = fabricBottom(tx);
    for (let y = yf; y <= yb; y++) g.set(tx, y, y === yf ? lighten(c, 0.14) : y === yb ? darken(c, 0.3) : c);
  }
  g.outline(OUT);
  return g;
}

/** 몸이 천 곡선을 따라 휘는 정도 (가운데에서 이만큼 더 내려간다) */
const BODY_SAG = 4;
/** 가운데에서 몸 윗면 = 먼 쪽 테보다 이만큼 위 (몸 위쪽이 천 위로 보인다) */
const BODY_ABOVE_RIM = 6;

export type HammockLie = { grid: Grid; /** 몸 맨 윗줄 (텍스처 y, 프레임 0) — 이름표 자리 */ top: number };

/**
 * 해먹에 누운 사람 시트 (LIE_FRAMES장 가로로, 프레임 = HAMMOCK_W×HAMMOCK_H).
 * 몸 종류마다 그림 길이가 달라(동글이 18 … 키다리 26px) 몸 가운데를 천 가운데에 맞춘다.
 */
export function hammockLieSheet(body: string, color: string, look: readonly string[] = []): HammockLie {
  const src = avatarFrameGrid(body, "down", AV_ANIM.hammock.col, color, look);
  // 그림이 있는 범위
  let x0 = AV_W;
  let x1 = -1;
  let y0 = src.h;
  let y1 = -1;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++)
      if (src.filled(x, y)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const back = fabricBack();
  const front = fabricFront();
  const sheet = new Grid(HAMMOCK_W * LIE_FRAMES, HAMMOCK_H);
  const ox = Math.round(FABRIC_CX - (y0 + y1) / 2);
  const midTop = fabricBackTop(Math.round(FABRIC_CX)) - BODY_ABOVE_RIM - BODY_SAG;
  let top = HAMMOCK_H;
  for (let f = 0; f < LIE_FRAMES; f++) {
    const g = new Grid(HAMMOCK_W, HAMMOCK_H);
    g.draw(back, 0, 0);
    // 90° 눕히기 (반시계: 머리 → 왼쪽, 그림 오른쪽 → 위) + 천 곡선만큼 세로줄마다 내리기. 주머니 바닥 아래는 천에 가려 안 보인다
    for (let y = y0; y <= y1; y++) {
      const tx = y + ox;
      const drop = Math.round(BODY_SAG * sag(tx)) + f;
      for (let x = x0; x <= x1; x++) {
        const v = src.get(x, y);
        if ((v & 255) === 0) continue;
        const ty = midTop + (x1 - x) + drop;
        if (ty > fabricBottom(tx) && tx >= FABRIC_X0 && tx <= FABRIC_X1) continue;
        if (ty < 0 || ty >= HAMMOCK_H) continue;
        g.px[ty * HAMMOCK_W + tx] = v;
        if (f === 0) top = Math.min(top, ty);
      }
    }
    g.draw(front, 0, 0);
    sheet.draw(g, f * HAMMOCK_W, 0);
  }
  return { grid: sheet, top };
}

/** 누운 사람 텍스처 키 (아바타 시트 키 + 접미사) */
export const hammockLieKey = (avatarKey: string) => `${avatarKey}-lie`;
