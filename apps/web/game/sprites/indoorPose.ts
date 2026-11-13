import { AV_ANIM, AV_H, AV_W, avatarFrameGrid, BODY_METRICS, bodyOf } from "./avatar";
import { darken, Grid, lighten, type Color } from "./pixel";

// 3번 집 안 가구 자세 그림: 아바타 시트의 서 있는 프레임 위에 이불·책·거품을 덧그린 2프레임 시트 (프레임 = AV_W×AV_H).
//  - lie  (침대): 머리만 베개 위로 나오고 어깨 아래는 누빈 이불. 프레임 1은 이불이 숨 쉬듯 1px 내려가고 작은 "z"
//  - read (책장): 가슴 앞에 펼친 책. 프레임 1은 넘기는 책장
//  - bath (욕조): 어깨 아래가 타원 수면 속에 잠긴다(물결·거품·김). 프레임마다 거품 방울 자리가 바뀐다
// 몸 6종·시트 꾸미기(모자 등)는 원본 프레임에서 그대로 따라온다. 표시 원점은 아바타와 같다(발바닥).

export type IndoorPose = "lie" | "read" | "bath";
export const INDOOR_POSES: readonly IndoorPose[] = ["lie", "read", "bath"];
export const INDOOR_POSE_FRAMES = 2;
/** 프레임 크기 (아바타 프레임과 같다) */
export const POSE_W = AV_W;
export const POSE_H = AV_H;
/** 이불 색 (침대 그림과 같은 보라) */
export const QUILT = 0x6a4a7a;
const FOAM = 0xeef4fa;
const FOAM_D = 0xb8c8d8;
const WATER = 0x7ab0d0;

export const isIndoorPose = (s: string): s is IndoorPose => (INDOOR_POSES as readonly string[]).includes(s);

/** 아바타 그림이 있는 가로 범위 */
function span(g: Grid): { x0: number; x1: number; y0: number } {
  let x0 = AV_W;
  let x1 = -1;
  let y0 = AV_H;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.filled(x, y)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
      }
  return { x0: Math.max(0, x0), x1: Math.min(AV_W - 1, x1), y0 };
}

function quilt(g: Grid, top: number): void {
  for (let y = top; y < AV_H; y++)
    for (let x = 1; x < AV_W - 1; x++) {
      const edge = y === top;
      const c: Color = edge ? lighten(QUILT, 0.35) : (x + y) % 6 === 0 ? darken(QUILT, 0.2) : (x - y + 30) % 6 === 0 ? lighten(QUILT, 0.12) : QUILT;
      g.set(x, y, c);
    }
  // 접힌 이불 깃 (흰 시트)
  g.hline(1, AV_W - 2, top + 1, 0xe8e0d0);
  g.hline(0, AV_W - 1, AV_H - 1, darken(QUILT, 0.35));
}

function book(g: Grid, y: number, cx: number, f: number): void {
  // 표지(빨강) 테두리 + 펼친 두 쪽 + 가운데 접힘
  g.rect(cx - 6, y, 13, 7, 0x8a3e3a);
  g.rect(cx - 5, y + 1, 5, 5, 0xf2ead8);
  g.rect(cx + 1, y + 1, 5, 5, 0xf2ead8);
  g.vline(cx, y, y + 6, 0x5a2a26);
  for (let i = 0; i < 3; i++) {
    g.hline(cx - 4, cx - 2, y + 2 + i, 0x9a9488);
    g.hline(cx + 2, cx + 4, y + 2 + i, 0x9a9488);
  }
  if (f === 1) {
    // 넘기는 책장
    g.rect(cx + 1, y - 1, 3, 5, 0xffffff);
    g.set(cx + 4, y, 0xd8d0c0);
  }
}

// 욕조 물은 프레임 안 타원으로만 그린다. 자리 앵커(칸 밑변 − 5)에 서면 욕조 그림의 물 타원이 프레임 16~23줄,
// 가로 −3~22칸에 온다 → 그보다 작은 타원(가로 1~18칸)이라 욕조 테두리 밖으로 물이 새지 않는다
const TUB_CX = AV_W / 2;
const TUB_RX = 9;
const TUB_RY = 3;

/** 욕조에 잠긴 몸: 수면 뒤쪽 반은 몸 뒤, 앞쪽 반은 몸을 덮고 그 아래는 지운다 (물결·거품·김 약간) */
function bathe(g: Grid, neck: number, f: number): void {
  // 수면 가운데 줄: 어깨 조금 아래, 욕조 물 타원 안 (20~21)
  const cy = Math.min(21, Math.max(20, neck + 2));
  // 물을 칠하기 전의 몸 자리 (물 위 거품·방울·김이 몸을 덮지 않게)
  const orig = g.px.slice();
  const body = (x: number, y: number) => x >= 0 && y >= 0 && x < AV_W && y < AV_H && (orig[y * AV_W + x] & 255) > 0;
  const tub = (x: number, y: number) => ((x + 0.5 - TUB_CX) / TUB_RX) ** 2 + ((y + 0.5 - cy) / TUB_RY) ** 2 <= 1;
  // 물결·거품은 수면 타원 안에만 (욕조 테두리 밖으로 새지 않게)
  const wet = (x: number, y: number, c: Color) => {
    if (tub(x, y) && (y >= cy || !body(x, y))) g.set(x, y, c);
  };
  // 물결 고리를 그릴 몸 가장자리 (수면 줄 바로 위)
  let bx0 = AV_W;
  let bx1 = -1;
  for (let x = 0; x < AV_W; x++)
    if (body(x, cy - 1)) {
      bx0 = Math.min(bx0, x);
      bx1 = Math.max(bx1, x);
    }
  for (let y = Math.floor(cy - TUB_RY); y < AV_H; y++)
    for (let x = 0; x < AV_W; x++) {
      const inWater = tub(x, y);
      if (y >= cy) {
        // 앞쪽 반: 몸은 물속 (수면 밖 아래는 비워 욕조 그림이 보이게)
        if (inWater) g.set(x, y, y === Math.ceil(cy + TUB_RY) - 1 ? darken(WATER, 0.12) : WATER);
        else g.set(x, y, 0, 0);
      } else if (inWater && !body(x, y)) {
        // 뒤쪽 반: 몸 뒤로 보이는 수면 (먼 가장자리는 조금 어둡게)
        g.set(x, y, tub((x - TUB_CX) * 1.35 + TUB_CX, (y - cy) * 1.35 + cy) ? WATER : darken(WATER, 0.1));
      }
    }
  // 몸이 물에 닿는 물결 (밝은 고리, 프레임마다 1px 흔들림)
  if (bx1 >= bx0) {
    const w = f === 0 ? 1 : 2;
    for (let x = bx0 - w; x <= bx1 + w; x++) wet(x, cy, lighten(WATER, 0.35));
    wet(bx0 - w - 1, cy + 1, lighten(WATER, 0.2));
    wet(bx1 + w + 1, cy + 1, lighten(WATER, 0.2));
  }
  // 수면 거품 (타원 안쪽 가장자리)
  const puffs = f === 0 ? [[3, cy + 1], [15, cy], [8, cy + 2]] : [[4, cy], [16, cy + 1], [12, cy + 2]];
  for (const [x, y] of puffs) {
    for (let j = -1; j <= 0; j++) for (let i = -1; i <= 1; i++) wet(x + i, y + j, FOAM);
    wet(x - 1, y - 1, FOAM_D);
  }
  // 떠오르는 방울
  const bubbles = f === 0 ? [[5, cy - 3], [14, cy - 5]] : [[6, cy - 5], [15, cy - 3]];
  for (const [x, y] of bubbles) if (!body(x, y)) g.set(x, y, 0xdff0ff);
  // 김 (반투명, 머리 양옆으로 피어오름)
  const steam = f === 0 ? [[2, cy - 6], [2, cy - 7], [17, cy - 9], [18, cy - 10]] : [[1, cy - 8], [2, cy - 9], [17, cy - 6], [17, cy - 7]];
  for (const [x, y] of steam) if (!body(x, y)) g.set(x, y, 0xffffff, 110);
}

/** 자세 시트 (가로 INDOOR_POSE_FRAMES장) */
export function indoorPoseSheet(kind: IndoorPose, body: string, color: string, look: readonly string[] = []): Grid {
  const b = bodyOf(body);
  const shoulder = BODY_METRICS[b].shoulder;
  const col = kind === "read" ? AV_ANIM.idle.col : AV_ANIM.hammock.col;
  const sheet = new Grid(AV_W * INDOOR_POSE_FRAMES, AV_H);
  for (let f = 0; f < INDOOR_POSE_FRAMES; f++) {
    const g = avatarFrameGrid(b, "down", col, color, look);
    const s = span(g);
    // 어깨선 (발바닥 y=27에서 shoulder만큼 위). 머리가 작은 몸도 얼굴은 보이게 머리 맨 위에서 최소 7px 아래
    const neck = Math.max(AV_H - 1 - shoulder - 1, s.y0 + 7);
    if (kind === "lie") {
      quilt(g, neck + f);
      if (f === 1) {
        // 작은 z
        g.hline(16, 18, 1, 0xdfe6f0);
        g.set(17, 2, 0xdfe6f0);
        g.hline(16, 18, 3, 0xdfe6f0);
      }
    } else if (kind === "read") {
      book(g, neck - 1, Math.round((s.x0 + s.x1) / 2), f);
    } else {
      bathe(g, neck, f);
    }
    sheet.draw(g, f * AV_W, 0);
  }
  return sheet;
}

/** 자세 텍스처 키 (아바타 시트 키 + 접미사) */
export const indoorPoseKey = (avatarKey: string, kind: IndoorPose) => `${avatarKey}-${kind}`;

/** 자세마다 프레임 바꾸는 주기 (ms) */
export const INDOOR_POSE_PERIOD: Record<IndoorPose, number> = { lie: 2600, read: 3200, bath: 900 };
