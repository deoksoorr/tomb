import { AV_ANIM, AV_W, avatarFrameGrid } from "./avatar";
import { darken, Grid, lighten, type Color } from "./pixel";

// 해먹 천과 "해먹에 누운 사람" 그림 (F5). 해먹 소품(worldProps.hammock)과 누운 사람 텍스처가 같은 천 모양을 쓴다.
//  - 천 = 늘어진 주머니: 먼 쪽 테(뒤) + 안쪽 그늘 + 가까운 쪽 겉면(앞). 가운데가 처진다
//  - 누운 사람 텍스처(해먹 텍스처와 같은 48×30 칸, 픽셀 1:1로 겹친다) = 뒤 천 → 천 곡선을 따라 휜 몸 → 앞 천.
//    몸 아래쪽은 앞 천에 가려 "천 안에 누운" 모습이 된다. 몸은 서 있는 프레임(AV_ANIM.hammock)을 90° 눕혀(머리 왼쪽)
//    천 곡선만큼 세로줄마다 내려 휘게 만든다 → 몸 6종·시트 꾸미기(모자·목도리·손등불)가 그대로 따라온다.
//  - 11/15 흔들림: 누가 누우면 해먹 소품은 기둥만 남기고(hammockPosts) 줄·천·몸은 누운 텍스처가 그린다. 프레임 = 흔들림 칸
//    (천이 좌우 −2..2px, 양 끝에서 1px 들림 — 진자) × 숨쉬기 2장 (1 = 몸이 1px 더 가라앉음). 줄은 늘 기둥 매듭에서 천 끝까지
//    이어져 기둥과 어긋나지 않는다. 가운데 칸(dx 0)의 천·줄은 해먹 소품과 픽셀 1:1로 같다.
// 좌표: 해먹 텍스처 왼쪽 위 기준 (tx, ty). 해먹 소품은 원점 (0.5, 1)로 받침(p.x, p.y + 1)에 놓인다.

export const HAMMOCK_W = 48;
export const HAMMOCK_H = 30;
/** 누운 사람 앵커(layout HAMMOCK_LIFT: 받침 p.y보다 5px 위)에서 텍스처 왼쪽 위까지 → 누운 텍스처의 표시 원점 */
export const HAMMOCK_ANCHOR_UP = 5;
export const LIE_ORIGIN_X = HAMMOCK_W / 2;
export const LIE_ORIGIN_Y = HAMMOCK_H - 1 - HAMMOCK_ANCHOR_UP;
/** 흔들림 칸 (천 가로 이동 px): 프레임 = (칸 번호) × 2 + 숨쉬기 */
export const SWAY_DX = [-2, -1, 0, 1, 2] as const;
export const LIE_FRAMES = SWAY_DX.length * 2;
/** 흔들림 dx(−2..2)와 숨쉬기(0|1) → 누운 텍스처 프레임 번호 */
export const lieFrameOf = (dx: number, breath: number) => (dx + 2) * 2 + breath;
/** 진자: 양 끝에서는 천이 1px 들린다 */
const swayLift = (dx: number) => (Math.abs(dx) >= 2 ? -1 : 0);

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

const ROPE = 0xc8b894;

/**
 * 11/16 해먹 천 무늬 (기본 = 마을 해먹 빨강·크림 줄무늬).
 * "sea" = 포구 오두막 바닷가 세트 해먹: 산호·조개·물빛 넓은 띠 + 옅은 줄 + 부드러운 갈색 테 (game/housing/seaFurnitureArt 해먹과 같은 색)
 */
export type HammockSkin = "village" | "sea";
type SkinDef = { stripe: (tx: number) => Color; rope: Color; out: Color };
const SEA_BANDS: readonly Color[] = [0xf4b1a0, 0xfbe0cc, 0xade6e4];
const SKINS: Record<HammockSkin, SkinDef> = {
  village: { stripe: (tx) => stripe(tx), rope: ROPE, out: OUT },
  sea: { stripe: (tx) => SEA_BANDS[Math.floor((tx - FABRIC_X0) / 4) % 3], rope: 0xd8c8a8, out: 0x5c4a42 },
};
/** 기둥 매듭 (해먹 소품의 기둥 x=3..5, 42..44 바로 안쪽) */
const KNOT_L = { x: 6, y: 8 };
const KNOT_R = { x: 41, y: 8 };

/** 줄: 기둥 매듭 → 천 끝 (천이 dx, dy만큼 움직인 자리). 테두리는 기둥 위로 번지지 않게 기둥 칸에서 지운다 */
export function hammockRopes(dx = 0, dy = 0, skin: HammockSkin = "village"): Grid {
  const K = SKINS[skin];
  const g = new Grid(HAMMOCK_W, HAMMOCK_H);
  const rope = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), K.rope);
  };
  rope(KNOT_L.x, KNOT_L.y, FABRIC_X0 + dx, fabricBackTop(FABRIC_X0) + dy);
  rope(KNOT_R.x, KNOT_R.y, FABRIC_X1 + dx, fabricBackTop(FABRIC_X1) + dy);
  g.outline(K.out);
  for (let y = 0; y < HAMMOCK_H; y++)
    for (let x = 0; x < HAMMOCK_W; x++) if ((x < KNOT_L.x || x > KNOT_R.x) && g.get(x, y) !== 0) g.px[y * HAMMOCK_W + x] = 0;
  return g;
}

/** 뒤 천: 먼 쪽 테 + 주머니 안쪽 그늘 (테두리 포함) */
export function fabricBack(skin: HammockSkin = "village"): Grid {
  const K = SKINS[skin];
  const g = new Grid(HAMMOCK_W, HAMMOCK_H);
  for (let tx = FABRIC_X0; tx <= FABRIC_X1; tx++) {
    const c = K.stripe(tx);
    const yb = fabricBackTop(tx);
    const yf = fabricFrontTop(tx);
    g.set(tx, yb, darken(c, 0.12));
    for (let y = yb + 1; y < yf; y++) g.set(tx, y, darken(c, 0.42));
  }
  g.outline(K.out);
  return g;
}

/** 앞 천: 가까운 쪽 겉면 (윗줄 밝게, 아랫줄 그늘, 테두리 포함) */
export function fabricFront(skin: HammockSkin = "village"): Grid {
  const K = SKINS[skin];
  const g = new Grid(HAMMOCK_W, HAMMOCK_H);
  for (let tx = FABRIC_X0; tx <= FABRIC_X1; tx++) {
    const c = K.stripe(tx);
    const yf = fabricFrontTop(tx);
    const yb = fabricBottom(tx);
    for (let y = yf; y <= yb; y++) g.set(tx, y, y === yf ? lighten(c, 0.14) : y === yb ? darken(c, 0.3) : c);
    // 바닷가 해먹: 천 아래 술 장식 (가구 그림과 같다)
    if (skin === "sea" && (tx - FABRIC_X0) % 3 === 1 && tx > FABRIC_X0 + 3 && tx < FABRIC_X1 - 3) g.set(tx, yb + 1, 0xf6efe2);
  }
  g.outline(K.out);
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
export function hammockLieSheet(body: string, color: string, look: readonly string[] = [], skin: HammockSkin = "village"): HammockLie {
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
  const back = fabricBack(skin);
  const front = fabricFront(skin);
  const sheet = new Grid(HAMMOCK_W * LIE_FRAMES, HAMMOCK_H);
  const ox = Math.round(FABRIC_CX - (y0 + y1) / 2);
  const midTop = fabricBackTop(Math.round(FABRIC_CX)) - BODY_ABOVE_RIM - BODY_SAG;
  let top = HAMMOCK_H;
  for (const dx of SWAY_DX) {
    const dy = swayLift(dx);
    const ropes = hammockRopes(dx, dy, skin);
    for (let b = 0; b < 2; b++) {
      const g = new Grid(HAMMOCK_W, HAMMOCK_H);
      g.draw(ropes, 0, 0);
      g.draw(back, dx, dy);
      // 90° 눕히기 (반시계: 머리 → 왼쪽, 그림 오른쪽 → 위) + 천 곡선만큼 세로줄마다 내리기. 주머니 바닥 아래는 천에 가려 안 보인다
      for (let y = y0; y <= y1; y++) {
        const tx = y + ox;
        const drop = Math.round(BODY_SAG * sag(tx)) + b;
        for (let x = x0; x <= x1; x++) {
          const v = src.get(x, y);
          if ((v & 255) === 0) continue;
          const ty = midTop + (x1 - x) + drop;
          if (ty > fabricBottom(tx) && tx >= FABRIC_X0 && tx <= FABRIC_X1) continue;
          const px = tx + dx;
          const py = ty + dy;
          if (py < 0 || py >= HAMMOCK_H || px < 0 || px >= HAMMOCK_W) continue;
          g.px[py * HAMMOCK_W + px] = v;
          if (dx === 0 && b === 0) top = Math.min(top, ty);
        }
      }
      g.draw(front, dx, dy);
      sheet.draw(g, lieFrameOf(dx, b) * HAMMOCK_W, 0);
    }
  }
  return { grid: sheet, top };
}

/**
 * 누운 사람 텍스처 키 (아바타 시트 키 + 접미사).
 * 11/16 "-hammock": 예전 "-lie"는 집 침대 자세(indoorPoseKey(key, "lie"))와 키가 같아, 해먹에 한 번 누운(또는 해먹에 누운 같은 생김새를 본)
 * 화면에서는 침대에 누워도 이미 만든 해먹 그림이 그대로 쓰였다 (텍스처는 씬끼리 같이 쓴다)
 */
export const hammockLieKey = (avatarKey: string, skin: HammockSkin = "village") => (skin === "sea" ? `${avatarKey}-hammock-sea` : `${avatarKey}-hammock`);
