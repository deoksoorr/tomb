import { Grid, mix } from "./pixel";

// 11/15 운영자 이름표 판 (픽셀 아트, 화면 1px = 그림 1px — 이름표와 같이 labelScale로 키운다).
// 짙은 자줏빛 판 + 금빛 겹테두리(위 밝게·아래 어둡게) + 양 끝 창끝 마개에 보랏빛 보석 + 위 가운데 금관(양옆 금빛 덩굴).
// 글자 크기(폭·높이)가 바뀔 때만 다시 그린다. 지나가는 빛줄기는 같은 크기 프레임 여러 장(shine)으로 미리 그려 둔다.
// 순수 함수 (Grid만) — 테스트·오프라인 그림으로도 쓴다.

/** 글자 ↔ 안쪽 테두리 여백 (px) */
const PAD_X = 4;
const PAD_Y = 1;
/** 바깥 어두운 외곽선 자리 */
const M = 1;
/** 마개 끝 창끝 장식 길이 */
const TIP = 2;

/** 금관 (위 가운데, 아랫줄이 판 윗변에 붙는다). o 금 구슬, V 보석, W 보석 반짝, Y 밝은 금, y 금, d 어두운 금 */
const CROWN = [
  "o.....W.....o", //
  "Y....YVY....Y",
  "YY..YYVYY..YY",
  "YyY.YyyyY.YyY",
  "YyyYyyyyyYyyY",
  "dVdydyVydydVd",
];
const CROWN_W = CROWN[0].length;
const CROWN_H = CROWN.length;
/** 금관 양옆 덩굴 (왼쪽 것, 오른쪽은 뒤집어 쓴다). 아랫줄이 판 윗변 바로 위 */
const VINE = [
  "y....", //
  ".Y...",
  "..YYy",
];
const VINE_W = VINE[0].length;

const GOLD = 0xffd36a;
const GOLD_HI = 0xfff2bd;
const GOLD_MID = 0xf0b444;
const GOLD_LO = 0xb9792a;
const GOLD_DIM = 0x7a5524;
const PLUM_TOP = 0x37214f;
const PLUM_BOT = 0x170c24;
const GEM = 0xb98cff;
const GEM_HI = 0xf6ecff;
const GEM_LO = 0x6a3cc0;
const INK = 0x120a06;

const PAL: Record<string, number> = { o: GOLD_HI, W: GEM_HI, V: GEM, Y: GOLD_HI, y: GOLD, d: GOLD_LO };

/** 지나가는 빛줄기 프레임 수 */
export const STAFF_SHINE_FRAMES = 10;

export type StaffPlateLayout = {
  /** 그림 전체 크기 */
  w: number;
  h: number;
  /** 글자(보이는 획) 상자의 왼쪽 위가 그림 안 어디인지 */
  inkX: number;
  inkY: number;
  /** 판 몸통(테두리 포함) 위·아래 줄, 왼쪽·오른쪽 테두리 줄, 양 끝 마개 길이 */
  top: number;
  bottom: number;
  left: number;
  right: number;
  cap: number;
};

/** 글자 폭 tw·보이는 글자 높이 th (화면 px) → 판 배치 */
export function staffPlateLayout(tw: number, th: number): StaffPlateLayout {
  const top = M + CROWN_H;
  const bottom = top + 1 + PAD_Y + th + PAD_Y;
  const cap = Math.max(2, Math.floor((bottom - top) / 4));
  const left = M + TIP + cap;
  const right = left + 1 + PAD_X + tw + PAD_X;
  return { w: right + cap + TIP + M + 1, h: bottom + M + 1, inkX: left + 1 + PAD_X, inkY: top + 1 + PAD_Y, top, bottom, left, right, cap };
}

/** (x, y)가 판 몸통(테두리 포함) 안인지: 위아래 가운데로 갈수록 양 끝이 뾰족하게 나온다 (2줄에 1px) */
function inBody(L: StaffPlateLayout, x: number, y: number): boolean {
  if (y < L.top || y > L.bottom) return false;
  const e = Math.min(L.cap, Math.floor(Math.min(y - L.top, L.bottom - y) / 2));
  return x >= L.left - e && x <= L.right + e;
}

function stamp(g: Grid, art: readonly string[], x0: number, y0: number, flip = false): void {
  const w = art[0].length;
  art.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      const c = PAL[ch];
      if (c !== undefined) g.set(x0 + (flip ? w - 1 - i : i), y0 + j, c);
    }),
  );
}

/** 판 그림 */
export function staffPlateGrid(tw: number, th: number): Grid {
  const L = staffPlateLayout(tw, th);
  const g = new Grid(L.w, L.h);
  const mid = (L.top + L.bottom) / 2;
  const span = Math.max(1, L.bottom - L.top);
  for (let y = L.top; y <= L.bottom; y++)
    for (let x = 0; x < L.w; x++) {
      if (!inBody(L, x, y)) continue;
      const edge = !inBody(L, x - 1, y) || !inBody(L, x + 1, y) || !inBody(L, x, y - 1) || !inBody(L, x, y + 1);
      if (edge) {
        // 금빛 테두리: 맨 윗줄 가장 밝게, 위쪽 비탈 금, 아래쪽 비탈 짙은 금, 맨 아랫줄 가장 어둡게
        const c = y === L.top ? GOLD_HI : y === L.bottom ? GOLD_LO : y < mid ? GOLD : GOLD_MID;
        g.set(x, y, c);
      } else {
        // 바탕: 위가 조금 밝은 자줏빛 (밤낮 어디서나 글자가 또렷하게 — 거의 불투명)
        const t = (y - L.top) / span;
        g.set(x, y, mix(PLUM_TOP, PLUM_BOT, t), 236);
      }
    }
  // 안쪽 겹테두리: 위·아랫변 곧은 부분 1px 안쪽에 어두운 금줄 (끝은 1px씩 비워 둔다)
  for (let x = L.left + 2; x <= L.right - 2; x++) {
    g.set(x, L.top + 1, GOLD_DIM, 220);
    g.set(x, L.bottom - 1, GOLD_DIM, 170);
  }
  // 양 끝 창끝 (마개 뾰족한 끝에서 바깥으로 금빛 2px) + 마개 보석 (십자 + 가운데 반짝)
  const my = Math.floor(mid);
  const odd = (L.bottom - L.top) % 2 === 1;
  for (const s of [-1, 1]) {
    const tipX = s < 0 ? L.left - L.cap : L.right + L.cap;
    for (let k = 1; k <= TIP; k++) {
      g.set(tipX + s * k, my, k === TIP ? GOLD_HI : GOLD);
      if (odd) g.set(tipX + s * k, my + 1, GOLD_MID);
    }
    const cx = s < 0 ? L.left - L.cap + 2 : L.right + L.cap - 2;
    g.set(cx - 1, my, GEM_LO);
    g.set(cx + 1, my, GEM_LO);
    g.set(cx, my - 1, GEM);
    g.set(cx, my + 1, GEM_LO);
    g.set(cx, my, GEM_HI);
  }
  // 위 가운데 금관 + 양옆 덩굴
  const cx0 = Math.floor((L.left + L.right + 1) / 2 - CROWN_W / 2);
  stamp(g, CROWN, cx0, M);
  if (L.right - L.left > CROWN_W + VINE_W * 2 + 4) {
    const vy = L.top - VINE.length;
    stamp(g, VINE, cx0 - VINE_W, vy);
    stamp(g, VINE, cx0 + CROWN_W, vy, true);
  }
  g.outline(INK, false, 235);
  return g;
}

/**
 * 지나가는 빛줄기 프레임 (가로로 STAFF_SHINE_FRAMES장, 한 장 = 판 크기). 판 위(외곽선 빼고)에만 비스듬한 흰 금빛 띠.
 * 가산 섞기로 판 위에 얹는다
 */
export function staffShineGrid(tw: number, th: number): Grid {
  const L = staffPlateLayout(tw, th);
  const base = staffPlateGrid(tw, th);
  const n = STAFF_SHINE_FRAMES;
  const g = new Grid(L.w * n, L.h);
  for (let f = 0; f < n; f++) {
    // 띠 위치: 왼쪽 밖 → 오른쪽 밖
    const pos = -L.h + ((L.w + L.h * 2) * f) / (n - 1);
    for (let y = 0; y < L.h; y++)
      for (let x = 0; x < L.w; x++) {
        const v = base.px[y * L.w + x];
        if ((v & 255) === 0 || v >>> 8 === INK) continue;
        const s = x + y * 0.6 - pos;
        const a = s >= 0 && s < 3 ? 150 : (s >= -2 && s < 0) || (s >= 3 && s < 4) ? 60 : 0;
        if (a) g.set(f * L.w + x, y, 0xfff6d8, a);
      }
  }
  return g;
}
