import type { AvatarBody } from "@tomb/protocol";
import type { GearM, GearView } from "./avatarGear";
import { Grid, type Color } from "./pixel";

// 12월 크리스마스 이벤트 한정 꾸미기 중 "아바타 시트에 같이 그려지는 것" (avatarGear.ts의 머리·목·손·등 그리기가 여기로 넘긴다).
//  한 벌 색: 빨간 벨벳 · 흰 털 · 금빛 · 얼음빛. 눈꽃 왕관 · 리본 목도리 · 별 지팡이 사탕 · 털 달린 빨간 망토.
//  그림 규칙은 avatarGear와 같다 (몸 기준점 GearM에 맞춰 여섯 몸 모두에, 외곽선은 avatar.ts가 프레임 전체에 한 번 두른다).
//  반짝임(왕관 보석·지팡이 별)은 외곽선 뒤에 drawXmasGlow로 밝게 다시 찍고, 움직이는 빛은 xmasFx XMAS_GEAR_FX.

export const XMAS_HEAD = ["xm_crown"] as const;
export const XMAS_NECK = ["xm_scarf"] as const;
export const XMAS_HAND = ["xm_cane"] as const;
export const XMAS_BACK = ["xm_cape"] as const;
/** 두건 꼭지·새싹을 덮는 모자 (털 띠 + 벨벳 모자) */
export const XMAS_COVERING = ["xm_crown"] as const;

// ── 한 벌 색 ──
const RED = 0xd42c3c;
const RED_HI = 0xf0505a;
const RED_LO = 0x9a1c2c;
const RED_DEEP = 0x74121e;
const FUR = 0xfbf8f2;
const FUR_LO = 0xd8dce6;
const GOLD = 0xf2c84a;
const GOLD_HI = 0xfff2b0;
const GOLD_LO = 0xb88a22;
const SILVER = 0xd8e2ee;
const SILVER_HI = 0xf8fcff;
const SILVER_LO = 0x9aa8bc;
const ICE = 0x8fdcff;
const ICE_HI = 0xe8faff;
const ICE_LO = 0x4aa8e0;

/** 프레임 맨 위 세 줄은 비워 둔다 (외곽선 + 등급 외곽선 자리 — 키다리·왕관 외형에서 왕관 끝이 잘리지 않게) */
const SAFE_TOP = 3;
function safe(g: Grid): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, { set: (x: number, y: number, c: Color, a?: number) => (y >= SAFE_TOP ? set(x, y, c, a) : undefined) });
}

// ── 머리: 눈꽃 왕관 ──

/** 왕관 꼭대기 얼음 결정의 맨 윗줄 (키다리처럼 머리가 높으면 결정을 낮춘다) */
function crystalTop(top: number): number {
  return Math.max(SAFE_TOP, top - 8);
}

export function drawXmasHead(g0: Grid, view: GearView, id: string, m: GearM, top: number): void {
  if (id !== "xm_crown") return;
  const g = safe(g0);
  const { cx } = m;
  const side = view === "side";
  const rx = Math.round(m.rx);
  // 1) 머리를 감싸는 흰 털 띠 (몽글몽글 — 군데군데 한 칸 처진 털 뭉치). 폭은 머리 윗곡선에 맞춘다 (동글이는 좁게)
  const d = (top + 2.5 - m.hy) / m.ry;
  const bw = Math.min(rx, Math.round(m.rx * Math.sqrt(Math.max(0, 1 - d * d))) + 1);
  for (let x = cx - bw; x < cx + bw; x++) {
    g.set(x, top, (x + top) % 3 === 0 ? FUR_LO : FUR);
    if ((x - cx + 20) % 3 === 1 && x > cx - bw && x < cx + bw - 1) g.set(x, top + 1, FUR_LO);
  }
  // 2) 은빛 왕관 띠 두 줄 (앞·뒤 = 넓게, 옆 = 좁게). 띠 보석: 앞은 얼음 보석 둘 + 가운데 빨간 보석, 옆은 하나
  const half = side ? 3 : 4;
  const x0 = cx - half;
  const x1 = cx + half - 1;
  for (let x = x0; x <= x1; x++) {
    g.set(x, top - 1, x === x0 ? SILVER : x === x1 ? SILVER_LO : (x - x0) % 2 ? SILVER_LO : SILVER);
    g.set(x, top - 2, x === x0 ? SILVER_HI : x === x1 ? SILVER_LO : SILVER_HI);
  }
  if (view === "down") {
    g.set(x0 + 1, top - 1, ICE);
    g.set(x1 - 1, top - 1, ICE);
    g.set(cx - 1, top - 1, RED_HI);
    g.set(cx, top - 1, RED);
  } else if (side) g.set(cx + 1, top - 1, ICE);
  // 3) 띠 위: 은빛 가시(끝에 흰 진주) 사이로 빨간 벨벳 모자가 봉긋
  const spikes = side ? [x0, x1] : [x0, x0 + 2, x1 - 2, x1];
  for (let x = x0 + 1; x < x1; x++) if (!spikes.includes(x)) g.set(x, top - 3, x >= x1 - 1 ? RED_LO : x === x0 + 1 ? RED_HI : RED);
  for (let x = x0 + 2; x < x1 - 1; x++) g.set(x, top - 4, x >= x1 - 2 ? RED_LO : RED);
  for (const x of spikes) {
    g.set(x, top - 3, x === x1 ? SILVER_LO : SILVER);
    g.set(x, top - 4, x === x1 ? FUR_LO : FUR);
  }
  // 4) 가운데 얼음 결정 (눈꽃 보석): 벨벳 위로 솟은 마름모 (키다리처럼 머리가 높으면 작게)
  const c = side ? cx : cx - 1;
  const w2 = side ? 0 : 1; // 결정 가운데 폭 (앞·뒤 2칸, 옆 1칸)
  const ct = crystalTop(top);
  if (top - 5 - ct >= 2) {
    g.set(c, ct, ICE_HI);
    if (w2) g.set(c + 1, ct, ICE);
    for (let y = ct + 1; y <= top - 5; y++) {
      const wide = y < top - 5;
      const l = c - (wide ? 1 : 0);
      const r = c + w2 + (wide ? 1 : 0);
      for (let x = l; x <= r; x++) g.set(x, y, x === l ? ICE_HI : x === r && r > c ? ICE_LO : ICE);
    }
  } else {
    g.set(c, top - 5, ICE_HI);
    if (w2) g.set(c + 1, top - 5, ICE);
  }
}

// ── 목: 리본 목도리 ──

export function drawXmasNeck(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody): void {
  if (id !== "xm_scarf") return;
  const { cx, neck } = m;
  const side = view === "side";
  const wide = body === "round" || body === "sheet";
  const half = wide ? 5 : body === "tall" ? 3 : 4;
  // 빨간 털실 목도리 (뜨개 무늬) + 아래 흰 털 단
  for (let x = cx - half; x < cx + half; x++) {
    g.set(x, neck, (x + neck) % 2 ? RED : RED_HI);
    g.set(x, neck + 1, (x + 1) % 3 === 0 ? FUR_LO : FUR);
  }
  g.set(cx + half - 1, neck, RED_LO);
  if (view === "up") {
    // 뒷모습: 등으로 늘어진 목도리 끝 + 털 끝단
    const tx = cx - 2;
    g.rect(tx, neck + 2, 2, 3, RED);
    g.vline(tx + 1, neck + 2, neck + 4, RED_LO);
    g.hline(tx, tx + 1, neck + 5, FUR);
    return;
  }
  if (side) {
    // 옆모습: 앞쪽(+x)에 금방울 리본, 뒤로 날리는 목도리 끝
    const bx = cx + half - 2;
    g.set(bx - 1, neck, GOLD);
    g.set(bx + 1, neck, GOLD);
    g.set(bx, neck, GOLD_HI);
    g.set(bx, neck + 1, GOLD);
    g.set(bx, neck + 2, GOLD_LO);
    const tx = cx - half - 1;
    g.set(tx, neck + 1, RED);
    g.set(tx - 1, neck + 2, RED);
    g.set(tx, neck + 2, RED_LO);
    g.set(tx - 1, neck + 3, FUR);
    return;
  }
  // 앞모습: 가운데 금 리본(고리 둘 + 매듭) 아래 금방울, 왼쪽으로 늘어진 목도리 끝
  g.set(cx - 3, neck, GOLD);
  g.set(cx - 2, neck, GOLD_HI);
  g.set(cx + 1, neck, GOLD_HI);
  g.set(cx + 2, neck, GOLD);
  g.set(cx - 3, neck + 1, GOLD_LO);
  g.set(cx + 2, neck + 1, GOLD_LO);
  g.set(cx - 1, neck, GOLD_LO);
  g.set(cx, neck, GOLD_LO);
  // 방울
  g.set(cx - 1, neck + 1, GOLD_HI);
  g.set(cx, neck + 1, GOLD);
  g.set(cx - 1, neck + 2, GOLD);
  g.set(cx, neck + 2, GOLD_LO);
  // 목도리 끝 (왼쪽 아래로)
  const tx = cx - half;
  g.rect(tx, neck + 2, 2, 3, RED);
  g.set(tx + 1, neck + 3, RED_LO);
  g.hline(tx, tx + 1, neck + 5, FUR);
}

// ── 손: 별 지팡이 사탕 (뒷모습은 몸에 가려 그리지 않는다) ──

export function drawXmasHand(g: Grid, view: GearView, id: string, m: GearM): void {
  if (id !== "xm_cane" || view === "up") return;
  const x = m.hx;
  const y = m.hY;
  // 빨강·하양 줄무늬 막대 (손에서 위아래로) + 바깥쪽으로 둥글게 굽은 손잡이 (∩)
  for (let yy = y - 4; yy <= y + 2; yy++) g.set(x, yy, (yy - y + 10) % 2 ? FUR : RED);
  g.set(x, y - 5, FUR);
  g.set(x + 1, y - 6, RED);
  g.set(x + 2, y - 5, FUR);
  g.set(x + 2, y - 4, RED);
  // 손잡이 위 금별 (+ 모양, 가운데가 밝다)
  const sx = x + 1;
  const sy = y - 8;
  g.set(sx, sy, GOLD_HI);
  g.set(sx - 1, sy, GOLD);
  g.set(sx + 1, sy, GOLD);
  g.set(sx, sy - 1, GOLD);
  g.set(sx, sy + 1, GOLD_LO);
}

// ── 등: 털 달린 빨간 망토 (layer "back" = 몸보다 먼저, "front" = 몸 다음) ──

/** 등 가운데 금실 눈꽃 자수 (5×5) */
function snowflakeEmbroidery(g: Grid, c: number, y: number): void {
  for (let i = -2; i <= 2; i++) {
    g.set(c + i, y, GOLD);
    g.set(c, y + i, GOLD);
  }
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.set(c + dx, y + dy, GOLD_LO);
  g.set(c, y, GOLD_HI);
}

export function drawXmasBack(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody, layer: "back" | "front", hem: number, sit: number): void {
  if (id !== "xm_cape") return;
  const { cx, shY, shL, shR } = m;
  const side = view === "side";
  const up = view === "up";
  const bottom = sit === 1 ? 26 : 25;
  /** 털 밑단: 몽글몽글 (물결 위상에 따라 한 칸씩 들쭉날쭉) */
  const furHem = (x: number, y: number) => {
    g.set(x, y - 1, (x + hem) % 4 === 0 ? FUR_LO : FUR);
    if ((x + hem) % 3 !== 2) g.set(x, y, (x + hem) % 2 ? FUR : FUR_LO);
  };
  if (up && layer === "front") {
    // 뒷모습: 등을 덮는 넓은 망토 + 흰 털 깃 + 털 밑단 + 금실 눈꽃 자수
    for (let y = shY; y <= bottom - 2; y++) {
      const spread = Math.round((y - shY) * 0.45);
      const x0 = shL - spread;
      const x1 = shR + spread;
      for (let x = x0; x <= x1; x++) g.set(x, y, x <= x0 + 1 ? RED_HI : x >= x1 - 1 ? RED_LO : (x - cx + 20) % 5 === 0 && y > shY + 1 ? RED_LO : RED);
    }
    const spreadB = Math.round((bottom - shY) * 0.45);
    for (let x = shL - spreadB; x <= shR + spreadB; x++) furHem(x, bottom);
    // 털 깃 (어깨를 감싼다)
    for (let x = shL - 1; x <= shR + 1; x++) {
      g.set(x, shY - 1, (x + 1) % 3 === 0 ? FUR_LO : FUR);
      g.set(x, shY, x === shL - 1 || x === shR + 1 ? FUR_LO : (x + 2) % 3 === 0 ? FUR_LO : FUR);
    }
    const midY = Math.round((shY + bottom) / 2);
    if (bottom - shY >= 8) snowflakeEmbroidery(g, cx - 1, midY);
    else g.set(cx - 1, midY, GOLD);
  } else if (side && layer === "back") {
    // 옆모습: 뒤로 날리는 망토 자락 + 털 밑단, 목 뒤 털 깃
    for (let y = shY; y <= bottom; y++) {
      const t = (y - shY) / Math.max(1, bottom - shY);
      const back = Math.round(2 + t * 4 + (y >= bottom - 1 ? hem % 2 : 0));
      for (let x = cx - back - 2; x <= cx; x++) {
        if (y >= bottom - 1) g.set(x, y, (x + hem + y) % 3 === 0 ? FUR_LO : FUR);
        else g.set(x, y, x === cx - back - 2 ? RED_LO : x === cx - back - 1 ? RED_DEEP : RED);
      }
    }
    for (let x = cx - 3; x <= cx - 1; x++) g.set(x, shY - 1, FUR);
    g.set(cx - 4, shY, FUR_LO);
  } else if (view === "down" && layer === "back") {
    // 앞모습: 몸 뒤로 보이는 망토 (안감은 짙은 빨강) + 털 밑단
    for (let y = shY; y <= bottom; y++) {
      const spread = 1 + Math.round((y - shY) * 0.5);
      for (let x = shL - spread; x <= shR + spread; x++) {
        if (y >= bottom - 1) furHem(x, bottom);
        else g.set(x, y, x < cx ? RED_LO : RED_DEEP);
      }
    }
  } else if (view === "down" && layer === "front") {
    // 앞모습 어깨: 털 깃 + 가운데 금 걸쇠 (얼굴이 몸통에 있는 동글이·이불 유령은 어깨 털 뭉치만)
    if (body === "round" || body === "sheet") {
      for (const x of [shL - 1, shR + 1]) {
        g.set(x, shY - 1, FUR);
        g.set(x, shY, FUR_LO);
      }
      g.set(shL + 1, shY - 1, GOLD);
      g.set(shR - 1, shY - 1, GOLD);
    } else {
      for (let x = shL - 1; x <= shR + 1; x++) g.set(x, shY - 1, (x + 1) % 3 === 0 ? FUR_LO : FUR);
      g.set(shL - 1, shY, FUR_LO);
      g.set(shR + 1, shY, FUR_LO);
      g.set(cx - 1, shY - 1, GOLD_HI);
      g.set(cx, shY - 1, GOLD);
    }
  }
}

// ── 외곽선 뒤에도 밝게 남는 점 ──

/** 왕관 얼음 결정·지팡이 별의 가운데 빛 (avatar.ts가 외곽선을 두른 뒤에 부른다) */
export function drawXmasGlow(g0: Grid, view: GearView, head: string | null, hand: string | null, m: GearM, top: number): void {
  const g = safe(g0);
  if (head === "xm_crown") {
    const c = view === "side" ? m.cx : m.cx - 1;
    const ct = crystalTop(top);
    if (top - 5 - ct >= 2) g.set(c, ct + 1, 0xffffff);
    else g.set(c, top - 5, 0xffffff);
    if (view === "down") {
      g.set(m.cx - 1, top - 1, 0xff8a90);
    }
  }
  if (hand === "xm_cane" && view !== "up") g.set(m.hx + 1, m.hY - 8, 0xffffff);
}

// ── 아이콘 (16×16) ──

type Ascii = { rows: readonly string[]; pal: Record<string, Color> };
const ICONS: Record<string, Ascii> = {
  xm_crown: {
    rows: [
      ".......Ii.......",
      "......IiiL......",
      "......iiiL......",
      ".f.....LL.....f.",
      ".s..f.rrrr.f..s.",
      ".srrsrrrrrrsrrs.",
      ".hhhhhhhhhhhhhs.",
      ".sbsssRrsssbsSs.",
      "wwvwwwvwwwvwwwvw",
      ".v...v...v...v..",
    ],
    pal: { I: ICE_HI, i: ICE, L: ICE_LO, f: FUR, s: SILVER, S: SILVER_LO, h: SILVER_HI, b: ICE, r: RED, R: RED_HI, w: FUR, v: FUR_LO },
  },
  xm_scarf: {
    rows: [
      "....rRrRrRrR....",
      "..rRw......wRr..",
      ".rRw........wRr.",
      ".rRw........wRr.",
      "..rRw......wRr..",
      "...rRwyyyywRr...",
      "....yYyGGyYy....",
      "....rr.gBg.rr...",
      "....rR.bBb.Rr...",
      "....rr.....rr...",
      "....ww.....ww...",
    ],
    pal: { r: RED, R: RED_HI, w: FUR, y: GOLD, Y: GOLD_HI, G: GOLD_LO, g: GOLD, B: GOLD_HI, b: GOLD_LO },
  },
  xm_cane: {
    rows: [
      ".......y........",
      "......yYy.......",
      ".......y........",
      "......wrw.......",
      ".....r...r......",
      ".....w...w......",
      ".....r..........",
      ".....w..........",
      ".....r..........",
      ".....w..........",
      ".....r..........",
      ".....w..........",
    ],
    pal: { r: RED, w: FUR, y: GOLD, Y: GOLD_HI },
  },
  xm_cape: {
    rows: [
      "...wwwwwwwwww...",
      "..wvwwyywwwvw...",
      "..hrrrrrrrrrrl..",
      ".hrrrrryrrrrrrl.",
      ".hrrrryyyrrrrrl.",
      "hrrrrrryrrrrrrrl",
      "hrrrrrrrrrrrrrrl",
      "wwwvwwwwvwwwwvww",
      "w.ww.ww.ww.ww.ww",
    ],
    pal: { w: FUR, v: FUR_LO, y: GOLD, h: RED_HI, r: RED, l: RED_LO },
  },
};

/** 시트에 그려지는 크리스마스 꾸미기 아이콘 (해당 없으면 null) */
export function xmasGearIcon(id: string): Grid | null {
  const a = ICONS[id];
  if (!a) return null;
  const g = new Grid(16, 16);
  const oy = Math.max(0, Math.floor((16 - a.rows.length) / 2) + 1);
  a.rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && a.pal[ch] !== undefined && g.set(x, y + oy, a.pal[ch])));
  g.outline(0x1e1c1a, false, 170);
  // 결정·별은 외곽선 위에서도 밝게
  if (id === "xm_crown") g.set(7, oy + 1, 0xffffff);
  if (id === "xm_cane") g.set(7, oy + 1, 0xffffff);
  return g;
}
