import type { GearM } from "./avatarGear";
import { Grid, type Color } from "./pixel";
import { art, dot, halfAt, iconOf, line, neckHalf, over, safe, SAFE_TOP, under, type FB, type SsItem, type V } from "./seasonSetKit";

// 11/20 계절 한정 세트 나머지 여섯 벌 중 "아바타 시트에 같이 그려지는 것" (코디 기획안 시안 코드를 그대로 옮겼다 — 모양은 시안 그대로).
// 운영자 결정(11/20): 기획안에서 상설·유령선·동물원·미션 보상이던 것도 모두 계절 보따리상(lib/seasonShop)에서 판다.
//  「야근 요정」 형광등 더듬이 · A4 종이 날개 · 에너지 드링크
//  「안개 묘지기」 달맞이꽃 화관 · 반딧불 유리병 · 이끼 비석 배낭
//  「설날 까치」 복 조바위 · 색동 목도리 · 복주머니
//  「의리 초콜릿」 하트 더듬이 머리띠 · 의리 초콜릿 상자
//  「벚꽃 소풍」 벚꽃 버킷햇 · 돗자리 배낭 · 김밥 도시락
//  「사내 체육대회」 청팀 머리띠 · 계주 바통 · 응원 깃발
// 자리별 그리기(GEAR2)는 seasonSetGear.ts가 첫 두 벌과 함께 부른다. 따로 그리는 연출(오라·발자국·펫·세트 덤)은 seasonSetFx2.ts가
// 여기 그림(포스트잇·편지봉투·발자국·펫)을 가져다 움직인다. 이름 글자·이름표 그림은 lib/nameStyle.ts (아이콘만 여기).
// 이름이 겹치지 않게 세트마다 앞글자를 붙였다 (OF_ 야근 요정 · GK_ 안개 묘지기 · SM_ 설날 까치 · VC_ 의리 초콜릿 · SP_ 벚꽃 소풍 · SD_ 사내 체육대회).

// ══ 「야근 요정」 ══

// ── 한 벌 색: 형광등 하양 · 철사 회색 · 종이 하양 · 검은 집게 · 형광 연두 캔 · 포스트잇 네 빛깔 ──
const OF_BAND = 0x3c3e4c;
const OF_BAND_HI = 0x6a6e82;
const OF_WIRE = 0x4a4c5a;
const OF_TUBE = 0xeef8ff;
const OF_TUBE_HI = 0xffffff;
const OF_TUBE_DIM = 0xc6dbe8;
const OF_CAP = 0x8a909e;
const OF_CAP_LO = 0x5e6472;
const OF_PAPER = 0xfafaf6;
const OF_PAPER_LO = 0xdcdfe6;
const OF_PAPER_SH = 0xbcc2ce;
const OF_INK = 0x8e9ab4;
const OF_CLIP = 0x26262e;
const OF_CLIP_HI = 0xc8ced8;
const OF_CAN = 0x22242c;
const OF_CAN_LO = 0x15161c;
const OF_LIME = 0x9cff3a;
const OF_LIME_LO = 0x5ec01e;
const OF_RIM = 0xc8ccd6;
const OF_NOTES: readonly [Color, Color][] = [
  [0xffe66a, 0xe0bc3a],
  [0xff9ac0, 0xe06a96],
  [0x8fd8ff, 0x58a8e0],
  [0xb8f07a, 0x84c84a],
];

// ── 형광등 더듬이 (머리띠 + 비스듬한 두 가닥 철사 끝에 세운 꼬마 형광등) ──
type OfTube = { x: number; y: number; w: number };
type OfAntenna = {
  tubes: OfTube[];
  stalks: [number, number, number, number][];
};
function ofAntennaGeom(v: V, m: GearM, top: number): OfAntenna {
  const { cx } = m;
  // 형광등(2×3) 맨 윗줄: 머리 위 6칸 (키다리처럼 머리가 높으면 맨 위 안전 줄까지만)
  const ty = Math.max(SAFE_TOP, top - 7);
  const cap = ty + 3;
  if (v === "side") {
    // 옆모습: 앞 가닥은 또렷하게, 뒤 가닥은 한 칸 낮게
    return {
      stalks: [
        [cx + 1, top, cx + 2, cap + 1],
        [cx - 2, top, cx - 3, cap + 2],
      ],
      tubes: [
        { x: cx + 2, y: ty, w: 2 },
        { x: cx - 4, y: ty + 1, w: 1 },
      ],
    };
  }
  return {
    stalks: [
      [cx - 3, top, cx - 5, cap + 1],
      [cx + 2, top, cx + 4, cap + 1],
    ],
    tubes: [
      { x: cx - 6, y: ty, w: 2 },
      { x: cx + 4, y: ty, w: 2 },
    ],
  };
}
function ofAntennaHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  // 머리띠: 머리 윗곡선을 따라 (위 한 줄 + 양옆으로 귀 높이까지)
  const by = top + 1;
  const h = Math.max(2, Math.round(halfAt(m, by)));
  for (let x = cx - h; x < cx + h; x++) g.set(x, by, x === cx - h ? OF_BAND_HI : OF_BAND);
  if (v !== "side") {
    for (let y = by + 1; y <= by + 2; y++) {
      const hh = Math.round(halfAt(m, y));
      if (hh < 1) continue;
      g.set(cx - hh, y, OF_BAND);
      g.set(cx + hh - 1, y, OF_BAND);
    }
  }
  void fb;
  const a = ofAntennaGeom(v, m, top);
  for (const [x0, y0, x1, y1] of a.stalks) line(g, x0, y0, x1, y1, OF_WIRE);
  a.tubes.forEach(({ x, y, w }, i) => {
    // 세운 형광등: 위 둥근 끝(밝은 관) 3줄 + 아래 회색 꽂이 (두 번째 등은 반쯤 흐린 — 깜빡이는 중)
    for (let j = 0; j < 3; j++) for (let k = 0; k < w; k++) g.set(x + k, y + j, i === 1 && j === 2 ? OF_TUBE_DIM : k === w - 1 && w > 1 ? OF_TUBE_DIM : OF_TUBE);
    for (let k = 0; k < w; k++) g.set(x + k, y + 3, k === w - 1 ? OF_CAP_LO : OF_CAP);
  });
}
function ofAntennaGlow(g0: Grid, v: V, m: GearM, _fb: FB, top: number): void {
  const g = safe(g0);
  const a = ofAntennaGeom(v, m, top);
  a.tubes.forEach(({ x, y, w }, i) => {
    for (let j = 0; j < (i === 1 ? 2 : 3); j++) g.set(x, y + j, OF_TUBE_HI);
    // 빛 번짐 (외곽선 바깥 양옆·위, 옅게)
    for (let j = 0; j < 3; j++) {
      dot(g0, x - 2, y + j, 0xdff6ff, 70);
      dot(g0, x + w + 1, y + j, 0xdff6ff, 70);
    }
    if (y - 2 >= SAFE_TOP - 1) dot(g0, x, y - 2, 0xdff6ff, 60);
  });
}
function ofAntennaIcon(): Grid {
  return iconOf(
    [
      ".TT........TT.",
      ".TT........TT.",
      ".Tt........Tt.",
      ".cc........cc.",
      "..w........w..",
      "...w......w...",
      "....w....w....",
      "....bbbbbb....",
      "..bBbbbbbbbb..",
      ".bB........bb.",
      ".b..........b.",
      ".b..........b.",
    ],
    {
      c: OF_CAP,
      t: OF_TUBE_DIM,
      T: OF_TUBE,
      w: OF_WIRE,
      b: OF_BAND,
      B: OF_BAND_HI,
    },
    (g, ox, oy) => {
      for (const [x, y] of [
        [1, 0],
        [1, 1],
        [1, 2],
        [11, 0],
        [11, 1],
      ])
        g.set(ox + x, oy + y, OF_TUBE_HI);
    },
  );
}

// ── A4 종이 날개 ──
/** 날개 하나 (왼쪽 기준, flip = 오른쪽 거울). ax·ay = 날개 뿌리 (등 가운데) */
function ofWing(g: Grid, ax: number, ay: number, dir: 1 | -1, shade: boolean, short = 0): void {
  // 11/20 운영자 「날개 바깥 끝이 일자로 끊겨 보인다」: 끝 두 줄을 위아래로 깎아 둥글게 닫는다 (길이는 그대로 — 칸 안 x 2~17,
  //  한 칸 줄이면 몸에 가려 날개가 거의 안 보였다)
  const span = 7 - short;
  // 윗변: 뿌리(ay-1)에서 끝(ay-6)으로 올라가고, 아랫변: 뿌리(ay+3)에서 끝(ay+1)으로
  for (let i = 0; i <= span; i++) {
    const x = ax + dir * i;
    const yt = Math.round(ay - 1 - (i * 4) / span);
    const yb = Math.round(ay + 3 - (i * 2) / span);
    // 접힌 선: 뿌리 가운데(ay+1)에서 끝 쪽 위(ay-3)로
    const yf = Math.round(ay + 1 - (i * 3) / span);
    const cutTop = i === span ? 2 : i === span - 1 ? 1 : 0;
    const cutBot = i === span ? 1 : 0;
    for (let y = yt + cutTop; y <= yb - cutBot; y++) {
      // 접힌 아랫면은 살짝 그늘, 끝 쪽 아래 모서리만 진하게
      let c: Color = y < yf ? OF_PAPER : y === yf ? OF_PAPER_SH : y === yb && i > 1 ? OF_PAPER_LO : 0xeef0f4;
      if (shade) c = y < yf ? OF_PAPER_LO : OF_PAPER_SH;
      // 글줄 점 (윗면에 두 줄)
      if (!shade && i >= 2 && i <= span - 2 && y < yf - 0 && y > yt && (y - yt) % 2 === 1 && (i + y) % 3 !== 0) c = OF_INK;
      g.set(x, y, c);
    }
  }
}
function ofClip(g: Grid, x: number, y: number): void {
  g.set(x, y, OF_CLIP);
  g.set(x + 1, y, OF_CLIP);
  g.set(x, y + 1, OF_CLIP);
  g.set(x + 1, y + 1, OF_CLIP);
  g.set(x, y - 1, OF_CLIP_HI);
  g.set(x + 1, y - 1, OF_CLIP_HI);
}
function ofWingAnchor(m: GearM, fb: FB): number {
  if (fb === "round") return Math.round(m.hy) - 2;
  if (fb === "sheet") return Math.round(m.hy) + 1;
  return m.shY - 2;
}
function ofA4Draw(g0: Grid, v: V, m: GearM, fb: FB): void {
  const { cx } = m;
  const ay = ofWingAnchor(m, fb);
  if (v === "down") {
    const g = under(g0);
    ofWing(g, cx - 1, ay, -1, false);
    ofWing(g, cx, ay, 1, false);
  } else if (v === "side") {
    const g = under(g0);
    // 가까운 날개 먼저(빈칸을 먼저 차지), 먼 날개는 그 위로 삐죽
    ofWing(g, cx - 2, ay - 2, -1, false);
    ofWing(g, cx - 1, ay - 3, -1, true, 1);
  } else {
    // 뒷모습: 등판은 덮고(머리 아래 줄부터), 머리 둘레는 빈칸에만 + 뿌리의 검은 집게 둘
    const headBot = Math.round(m.hy + m.ry);
    const g = under(g0, (_x, y) => y >= headBot);
    ofWing(g, cx - 1, ay, -1, false);
    ofWing(g, cx, ay, 1, false);
    ofClip(g, cx - 2, ay + 1);
    ofClip(g, cx, ay + 1);
  }
}
function ofA4Icon(): Grid {
  return iconOf(
    [
      "w..............w",
      "ww............ww",
      "wiw..........wiw",
      "wwiw........wiww",
      "wiwww......wwwiw",
      "lwiwww....wwwiwl",
      ".lwwwws..swwwwl.",
      ".llllllkkllllll.",
      "..lllllkkllllll.",
      "...llll..llll...",
    ],
    { w: OF_PAPER, i: OF_INK, l: OF_PAPER_LO, s: OF_PAPER_SH, k: OF_CLIP },
    (g, ox, oy) => {
      g.set(ox + 7, oy + 6, OF_CLIP_HI);
      g.set(ox + 8, oy + 6, OF_CLIP_HI);
    },
  );
}

// ── 에너지 드링크 (번개 무늬 캔) ──
function ofDrinkIcon(): Grid {
  return iconOf(
    [".rrRrr.", "rRrrrrr", "kkkkkkK", "kkkLLkK", "kkLLkkK", "kLLLLkK", "kkkLLkK", "kkLLkkK", "kkLkkkK", "kkkkkkK", "gggggggg", "kkkkkkK", ".KKKKK."].map((r) => r.slice(0, 7)),
    {
      r: OF_RIM,
      R: 0xf4f6fa,
      k: OF_CAN,
      K: OF_CAN_LO,
      L: OF_LIME,
      g: OF_LIME_LO,
    },
  );
}

// ── 포스트잇 소용돌이 (머리 둘레를 도는 메모지) ──
function ofNote(g: Grid, x: number, y: number, pal: [Color, Color], fold: boolean): void {
  const s = new Grid(5, 5);
  const [c, lo] = pal;
  s.rect(1, 1, 3, 3, c);
  // 위 끈끈이 띠 · 글줄 한 줄 · 아래 오른쪽 접힌 귀
  s.hline(1, 3, 1, lo);
  s.set(1, 2, 0x7a7a88);
  s.set(2, 2, 0x7a7a88);
  if (fold) s.set(3, 3, 0xffffff);
  s.outline(0x5a5244, false, 140);
  over(g, s, Math.round(x - 2), Math.round(y - 2));
}
function ofPostitIcon(): Grid {
  const g = new Grid(16, 16);
  const big = (x: number, y: number, pal: [Color, Color], fold: boolean) => {
    const n = new Grid(8, 8);
    const [c, lo] = pal;
    n.rect(1, 1, 6, 6, c);
    n.hline(1, 6, 1, lo);
    n.hline(2, 5, 3, 0x7a7a88);
    n.hline(2, 4, 5, 0x9a9aa8);
    if (fold) {
      n.set(6, 6, 0xffffff);
      n.set(5, 6, lo);
      n.set(6, 5, lo);
    }
    n.outline(0x4a4438, false, 190);
    over(g, n, x, y);
  };
  big(0, 0, OF_NOTES[0] as [Color, Color], true);
  big(8, 2, OF_NOTES[1] as [Color, Color], false);
  big(1, 8, OF_NOTES[2] as [Color, Color], false);
  big(8, 8, OF_NOTES[3] as [Color, Color], true);
  return g;
}

// ── 블루라이트 이름 (아이콘만 — 이름표 글자는 compose.py) ──
const OF_GA = [
  "............",
  "######...##.",
  "######...##.",
  "....##...##.",
  "....##...##.",
  "....##...####",
  "...##....####",
  "...##....##.",
  "..##.....##.",
  ".##......##.",
  "##.......##.",
  ".........##.",
];
function ofBlueIcon(): Grid {
  const g = new Grid(16, 16);
  // 모니터 빛 번짐 (뒤)
  const halo = new Grid(16, 16);
  halo.ellipse(8, 8, 7.5, 7, 0x5fc8ff, 60);
  halo.ellipse(8, 8, 5, 4.5, 0x8fe0ff, 50);
  over(g, halo, 0, 0);
  const t = new Grid(16, 16);
  const stops = [0xc8f4ff, 0x9ae8ff, 0x6fb8ff];
  OF_GA.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== "#") return;
      const k = (x / 12) * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(k));
      const f = k - i;
      const a = stops[i];
      const b = stops[i + 1];
      const c =
        (Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * f) << 16) |
        (Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * f) << 8) |
        Math.round((a & 255) + ((b & 255) - (a & 255)) * f);
      t.set(x + 2, y + 2, c);
    }),
  );
  t.outline(0x0a0b10, true, 235);
  over(g, t, 0, 0);
  // 반짝 한 점
  g.set(1, 1, 0xffffff);
  g.set(0, 1, 0xa8e8ff, 160);
  g.set(2, 1, 0xa8e8ff, 160);
  g.set(1, 0, 0xa8e8ff, 160);
  g.set(1, 2, 0xa8e8ff, 160);
  return g;
}

// ══ 「안개 묘지기」 ══

// ── 한 벌 색: 달맞이꽃 하양 · 꽃술 연노랑 · 이끼 초록 · 비석 회색 · 촛불 · 반딧불 · 유령 푸른빛 · 부엉이 청회색 ──
const GK_PETAL = 0xf8f6ea;
const GK_PETAL_LO = 0xd6dae6;
const GK_STAMEN = 0xffe88a;
const GK_STAMEN_HI = 0xfff8d0;
const GK_LEAF = 0x5f8a52;
const GK_LEAF_HI = 0x86b06a;
const GK_LEAF_LO = 0x3e6440;
const GK_RIBBON = 0xb8a8d8;
const GK_RIBBON_LO = 0x8a7ab0;
const GK_STONE = 0x8e97a4;
const GK_STONE_HI = 0xb6bec8;
const GK_STONE_LO = 0x646d7c;
const GK_STONE_DEEP = 0x4c5462;
const GK_MOSS = 0x6f9a48;
const GK_MOSS_HI = 0x9cc464;
const GK_MOSS_LO = 0x4a7236;
const GK_STRAP = 0x5a4632;
const GK_WAX = 0xf4ecd8;
const GK_WAX_LO = 0xd0c4a8;
const GK_FLAME = 0xffc24a;
const GK_FLAME_HI = 0xfff4c0;
const GK_CORK = 0xa8784a;
const GK_CORK_HI = 0xcca070;
const GK_CORK_LO = 0x7a5232;
const GK_GLASS = 0x9fd0dc;
const GK_GLASS_HI = 0xe8fbff;
const GK_GLASS_IN = 0x2c4c58;
const GK_FLY = 0xfff27a;
const GK_FLY_HI = 0xffffe0;
const GK_GHOST = 0x8ad6ff;
const GK_GHOST_HI = 0xd8f4ff;
const GK_GHOST_LO = 0x4a9ad8;

// ── 달맞이꽃 화관 (머리를 덮지 않는 꽃 띠) ──

/** 꽃 한 송이: 가운데 꽃술 + 네 꽃잎 (작은 꽃은 꽃잎 둘) */
function gkFlower(g: Grid, x: number, y: number, small = false): void {
  g.set(x, y, GK_STAMEN);
  if (small) {
    g.set(x - 1, y, GK_PETAL);
    g.set(x + 1, y, GK_PETAL_LO);
    return;
  }
  g.set(x - 1, y, GK_PETAL);
  g.set(x + 1, y, GK_PETAL_LO);
  g.set(x, y - 1, GK_PETAL);
  g.set(x, y + 1, GK_PETAL_LO);
}

/** 화관 꽃 자리 (머리 윗면 기준, 앞·옆·뒤) — glow가 꽃술을 다시 밝힌다 */
function gkWreathFlowers(v: V, m: GearM, fb: FB, top: number): { x: number; y: number; small: boolean }[] {
  const { cx } = m;
  const rx = Math.round(m.rx);
  const narrow = rx <= 4;
  const y = Math.max(SAFE_TOP + 1, top);
  if (v === "side")
    return [
      { x: cx + 1, y, small: false },
      { x: cx - 3, y: y + 1, small: true },
    ];
  if (v === "up")
    return [
      { x: cx - 2, y, small: true },
      { x: cx + 1, y, small: true },
    ];
  void fb;
  return narrow
    ? [
        { x: cx - 2, y, small: false },
        { x: cx + 1, y, small: false },
      ]
    : [
        { x: cx - 3, y, small: false },
        { x: cx + 2, y, small: false },
        { x: cx, y: y + 1, small: true },
      ];
}

function gkWreathHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  const rx = Math.round(m.rx);
  // 잎 띠: 가운데는 머리 윗면, 양끝은 한 칸 내려와 머리를 감싼다 (잎 색이 번갈아)
  const half = v === "side" ? rx - 1 : rx;
  for (let x = cx - half; x < cx + half; x++) {
    const edge = x <= cx - half + 1 || x >= cx + half - 2;
    const y = edge ? top + 1 : top;
    const c = (x + 40) % 3 === 0 ? GK_LEAF_HI : (x + 40) % 3 === 1 ? GK_LEAF : GK_LEAF_LO;
    g.set(x, y, c);
    if (!edge && (x + 40) % 3 !== 0) g.set(x, y - 1, (x + 40) % 3 === 1 ? GK_LEAF_HI : GK_LEAF);
  }
  // 띠 끝 잎사귀 (아래로 늘어진 덩굴)
  if (v !== "side") {
    g.set(cx - half - 1, top + 2, GK_LEAF);
    g.set(cx + half, top + 2, GK_LEAF_LO);
  }
  for (const f of gkWreathFlowers(v, m, fb, top)) gkFlower(g, f.x, f.y, f.small);
  // 옆·뒤: 뒤로 늘어진 연보라 리본 두 가닥
  const hy = Math.round(m.hy);
  if (v === "side") {
    const bx = cx - half - 1;
    for (let y = top + 1; y <= Math.min(hy + 2, top + 6); y++) g.set(bx - ((y - top) >> 2), y, y % 2 ? GK_RIBBON : GK_RIBBON_LO);
    g.set(bx - 1, top + 2, GK_RIBBON_LO);
  } else if (v === "up") {
    for (let y = top + 1; y <= top + 3; y++) {
      g.set(cx - 3, y, y % 2 ? GK_RIBBON_LO : GK_RIBBON);
      g.set(cx + 2, y + 1, y % 2 ? GK_RIBBON : GK_RIBBON_LO);
    }
  }
}
function gkWreathGlow(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  for (const f of gkWreathFlowers(v, m, fb, top)) g.set(f.x, f.y, f.small ? GK_STAMEN : GK_STAMEN_HI);
}
function gkWreathIcon(): Grid {
  return iconOf(
    [
      "....p....p....",
      "...pSp..pSp...",
      "..lLpLllLpLl..",
      ".lL........Ll.",
      ".L..........L.",
      "pSp........pSp",
      ".p..........p.",
      ".lL........Ll.",
      "..lLlp..pLlL..",
      "....pSpLpSp...",
      ".....p...p....",
      "......r.r.....",
      ".....r...r....",
    ],
    { p: GK_PETAL, S: GK_STAMEN, L: GK_LEAF, l: GK_LEAF_LO, r: GK_RIBBON },
    (g, ox, oy) => {
      for (const [x, y] of [
        [5, 1],
        [10, 1],
        [1, 5],
        [12, 5],
        [6, 9],
        [9, 9],
      ])
        g.set(ox + x, oy + y, GK_STAMEN_HI);
    },
  );
}

// ── 반딧불 유리병 ──

function gkJarIcon(): Grid {
  return iconOf(
    [
      "......s.......",
      ".....s.s......",
      "....hcccl.....",
      "....hcccl.....",
      "...gHGGGGg....",
      "...HiiiiiG....",
      "...Hifiiig....",
      "...Hiiiifg....",
      "...Giifiig....",
      "...Gfiiiig....",
      "...Giiifig....",
      "....GGGGg.....",
    ],
    {
      s: GK_STRAP,
      c: GK_CORK,
      h: GK_CORK_HI,
      l: GK_CORK_LO,
      g: GK_GLASS,
      G: GK_GLASS,
      H: GK_GLASS_HI,
      i: GK_GLASS_IN,
      f: GK_FLY,
    },
    (g, ox, oy) => {
      for (const [x, y] of [
        [5, 6],
        [8, 7],
        [6, 8],
        [4, 9],
        [7, 10],
      ])
        g.set(ox + x, oy + y, GK_FLY_HI);
      g.set(ox + 11, oy + 3, GK_FLY, 230);
      g.set(ox + 12, oy + 1, GK_FLY, 160);
    },
  );
}

// ── 이끼 비석 배낭 ──

/**
 * 작은 비석 하나: (x0, y0) = 왼쪽 위, w = 폭, h = 높이. 둥근 윗머리 · 왼쪽 빛 · 오른쪽 그늘 · 새긴 십자 · 이끼 · 위에 촛불.
 * candle = 촛불 꽂을지, 촛불 자리를 돌려준다 (불꽃 칸)
 */
function gkStone(g: Grid, x0: number, y0: number, w: number, h: number, carve: boolean, candle = true): [number, number] {
  for (let y = y0; y < y0 + h; y++) {
    const inset = y === y0 ? 1 : 0;
    for (let x = x0 + inset; x < x0 + w - inset; x++) {
      const c = x === x0 + inset ? GK_STONE_HI : x >= x0 + w - 1 - inset ? GK_STONE_LO : y === y0 + h - 1 ? GK_STONE_LO : GK_STONE;
      g.set(x, y, c);
    }
  }
  // 아래 받침 (한 줄 짙게)
  g.hline(x0, x0 + w - 1, y0 + h - 1, GK_STONE_DEEP);
  // 새긴 십자 (가운데)
  const mx = x0 + Math.floor((w - 1) / 2);
  if (carve && h >= 6) {
    g.vline(mx, y0 + 2, y0 + 4, GK_STONE_DEEP);
    g.set(mx - 1, y0 + 3, GK_STONE_DEEP);
    if (w >= 6) g.set(mx + 1, y0 + 3, GK_STONE_DEEP);
  }
  // 이끼: 윗머리를 덮고 한쪽으로 흘러내림
  for (let x = x0 + 1; x < x0 + w - 1; x++) g.set(x, y0, (x + y0) % 3 === 0 ? GK_MOSS_HI : GK_MOSS);
  g.set(x0, y0 + 1, GK_MOSS);
  g.set(x0, y0 + 2, GK_MOSS_LO);
  g.set(x0 + 1, y0 + 1, GK_MOSS_LO);
  if (h >= 5) g.set(x0 + w - 1, y0 + h - 2, GK_MOSS_LO);
  // 촛불 (윗머리 가운데)
  const cxx = mx;
  if (candle) {
    g.set(cxx, y0 - 1, GK_WAX);
    g.set(cxx, y0 - 2, GK_WAX);
    g.set(cxx + 1, y0 - 1, GK_WAX_LO);
    g.set(cxx, y0 - 3, GK_FLAME);
  }
  return [cxx, y0 - 3];
}

/** 몸마다 등 비석 자리 */
function gkPackSpot(v: V, m: GearM, fb: FB): { x0: number; y0: number; w: number; h: number } {
  const { cx, shY } = m;
  const round = fb === "round" || fb === "sheet";
  if (v === "up") {
    const w = fb === "tall" ? 5 : 6;
    const y0 = shY - 3;
    // 11/20 칸 검사: 앉은 자세에선 비석 밑을 한 칸 줄여 칸 바닥(y 26) 위에서 닫는다
    return { x0: cx - Math.ceil(w / 2), y0, w, h: Math.min(7, 27 - y0) };
  }
  if (v === "side") {
    // 11/20 칸 검사: 넓은 몸은 한 칸 안쪽(칸 왼쪽 끝 x 1), 앉은 자세에선 밑을 한 칸 줄인다
    const y0 = round ? shY - 5 : shY - 4;
    return { x0: cx - (round ? 9 : 8), y0, w: 4, h: Math.min(8, 27 - y0) };
  }
  // 앞모습: 왼쪽 어깨 너머로 비석이 비스듬히 빼꼼 (손에 든 것과 반대쪽). 11/20 넓은 몸은 칸 왼쪽 끝(x 1)까지만
  const x0 = Math.max(1, Math.floor(cx - m.rx) - 3);
  const y0 = round ? Math.round(m.hy) - 3 : Math.round(m.hy) - 2;
  return { x0, y0, w: 5, h: round ? 9 : shY + 3 - y0 };
}

function gkPackBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front"): void {
  const g = safe(g0);
  const { shY, shL, shR, cx } = m;
  const round = fb === "round" || fb === "sheet";
  const s = gkPackSpot(v, m, fb);
  if (v === "up") return; // 뒷모습은 머리 다음에 (gkPackUp — 머리에 가리지 않게)
  if (v === "side" && layer === "back") {
    gkStone(g, s.x0, s.y0, s.w, s.h, false);
    g.hline(s.x0, s.x0 + s.w - 1, s.y0 + s.h - 3, GK_STRAP);
    return;
  }
  if (v === "side" && layer === "front" && !round) {
    // 옆모습 어깨끈 (몸통 위 비스듬히)
    g.set(cx - 1, shY, GK_STRAP);
    g.set(cx, shY + 1, GK_STRAP);
    return;
  }
  if (v === "down" && layer === "back") {
    gkStone(g, s.x0, s.y0, s.w, s.h, false);
    return;
  }
  if (v === "down" && layer === "front") {
    if (round) {
      g.set(shL + 2, shY - 1, GK_STRAP);
      g.set(shR - 2, shY - 1, GK_STRAP);
    } else {
      g.vline(shL + 1, shY, shY + 2, GK_STRAP);
      g.vline(shR - 1, shY, shY + 2, GK_STRAP);
      g.set(shR - 1, shY + 1, 0xb89a52);
    }
  }
}
/** 뒷모습: 머리를 그린 뒤 등에 비석 (목 그리기 차례에 부른다) */
function gkPackUp(g0: Grid, v: V, m: GearM, fb: FB): void {
  if (v !== "up") return;
  const g = safe(g0);
  const { shY, shL, shR } = m;
  const round = fb === "round" || fb === "sheet";
  const s = gkPackSpot(v, m, fb);
  if (!round) {
    g.set(shL, shY, GK_STRAP);
    g.set(shR, shY, GK_STRAP);
  }
  gkStone(g, s.x0, s.y0, s.w, s.h, true);
  g.hline(s.x0 - 1, s.x0 + s.w, s.y0 + s.h - 3, GK_STRAP);
}

function gkPackFlame(v: V, m: GearM, fb: FB): [number, number] {
  const s = gkPackSpot(v, m, fb);
  return [s.x0 + Math.floor((s.w - 1) / 2), Math.max(SAFE_TOP, s.y0 - 3)];
}
function gkPackGlow(g0: Grid, v: V, m: GearM, fb: FB): void {
  const g = safe(g0);
  const [x, y] = gkPackFlame(v, m, fb);
  g.set(x, y, GK_FLAME_HI);
  dot(g0, x, y - 1, GK_FLAME, 150);
}
function gkPackIcon(): Grid {
  return iconOf(
    [
      "......f.......",
      "......F.......",
      "......w.......",
      "....mMmMm.....",
      "...mmmmmmh....",
      "...hsssssl....",
      "...hssdssl....",
      "...hsdddsl....",
      "...mssdssl....",
      "...bbbbbbb....",
      "...hsssssl....",
      "...mmssssl....",
      "...dddddddd...",
    ],
    {
      f: GK_FLAME_HI,
      F: GK_FLAME,
      w: GK_WAX,
      m: GK_MOSS,
      M: GK_MOSS_HI,
      h: GK_STONE_HI,
      s: GK_STONE,
      l: GK_STONE_LO,
      d: GK_STONE_DEEP,
      b: GK_STRAP,
    },
  );
}

// ── 흐려지는 발자국 ──

/** 유령 발자국 4단계 (또렷 → 안개). 자국 3×4 + 발가락 점 */
function gkSteps(): Grid[] {
  const sole = ["gGg", "gGg", ".g."];
  const out: Grid[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new Grid(6, 7);
    const alpha = [0.85, 0.62, 0.42, 0.26][k];
    const a = art(sole, { g: GK_GHOST, G: k === 0 ? GK_GHOST_HI : GK_GHOST });
    over(g, a, 1, 3, alpha);
    dot(g, 1, 2, GK_GHOST, 220 * alpha);
    dot(g, 3, 2, GK_GHOST, 220 * alpha);
    dot(g, 2, 1, GK_GHOST, 180 * alpha);
    // 흐려질수록 위로 피어오르는 안개 알갱이
    if (k >= 1) dot(g, 4, 2, GK_GHOST_HI, 80);
    if (k >= 2) {
      dot(g, 3, 0, GK_GHOST_HI, 90);
      dot(g, 0, 4, GK_GHOST_HI, 50);
    }
    if (k >= 3) dot(g, 5, 1, 0xffffff, 70);
    if (k === 0) g.outline(GK_GHOST_LO, false, 70);
    out.push(g);
  }
  return out;
}
function gkStepsIcon(): Grid {
  const g = new Grid(16, 16);
  const s = gkSteps();
  over(g, s[0], 2, 9, 1);
  over(g, s[0], 8, 6, 0.85);
  over(g, s[1], 3, 2);
  over(g, s[2], 9, -1);
  for (const [x, y, a] of [
    [13, 1, 160],
    [14, 3, 110],
    [11, 0, 90],
  ] as const)
    dot(g, x, y, GK_GHOST_HI, a);
  return g;
}

// ── 등불 부엉이 (펫) ──
const GK_OWL = [
  "..t.......t..",
  "..tT.....Tt..",
  "..bbbbbbbbb..",
  ".bffffbffffb.",
  ".bfYYfbfYYfl.",
  ".bfYkfbfYkfl.",
  ".bbfffvfffbl.",
  ".WbbbbVbbbWl.",
  "WWWbcbbbcbWWL",
  "WWwbbcbcbbwWL",
  ".WwbcbbbcbwL.",
  "..Lbbbbbbbl..",
  "...lbbbbbl...",
  "....m.m.m....",
  ".....m.m.....",
];
const GK_OWL_PAL: Record<string, Color> = {
  t: 0x7e8eb0,
  T: 0xa8b6d0,
  b: 0xb4c2da,
  f: 0xe2eaf6,
  Y: 0xffd648,
  k: 0x2a1e10,
  v: 0xd8a040,
  V: 0xa87828,
  W: 0x8494b4,
  w: 0x6e7ea0,
  L: 0x5c6a8a,
  l: 0x8a98b6,
  c: 0x8a98b4,
  m: 0xc8d8f0,
};
/** 펫 그림 안 눈 자리 (아래 glow·lights) */
const GK_OWL_EYES: readonly [number, number][] = [
  [4, 4],
  [9, 4],
];
function gkOwl(): Grid {
  const g = new Grid(15, 17);
  const a = art(GK_OWL, GK_OWL_PAL);
  // 유령 몸: 살짝 비치게, 꼬리 안개는 더 옅게
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      const v = a.get(x, y);
      if (!(v & 255)) continue;
      const tail = y >= 13;
      g.set(x + 1, y + 1, v >>> 8, tail ? (y === 13 ? 170 : 110) : 238);
    }
  g.outline(0x34405e, false, 190);
  // 꼬리 안개 테는 지운다 (꼬리 아래는 흐릿하게 사라진다)
  for (let y = 14; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) >>> 8 === 0x34405e) g.set(x, y, 0, 0);
  // 등불 눈 (외곽선 위에서도 밝게) + 눈 위 반짝
  for (const [x, y] of GK_OWL_EYES) {
    g.set(x + 1, y + 1, 0xffe878);
    g.set(x, y + 1, 0xfff6c8);
  }
  return g;
}
function gkOwlIcon(): Grid {
  const g = new Grid(16, 16);
  const o = gkOwl();
  over(g, o, 0, 0);
  return g;
}

// ══ 「설날 까치」 ══

// ── 한 벌 색: 검은 비단 · 다홍 · 금 · 옥 · 색동 다섯 빛깔 ──
const SM_BLK = 0x2c2836;
const SM_BLK_HI = 0x524a66;
const SM_BLK_LO = 0x18161e;
const SM_DAHONG = 0xe24a3c;
const SM_DAHONG_HI = 0xff7c64;
const SM_DAHONG_LO = 0xa82a28;
const SM_GOLD = 0xf2c84a;
const SM_GOLD_HI = 0xfff2b0;
const SM_GOLD_LO = 0xb88a22;
const SM_JADE = 0x4ab89a;
const SM_JADE_HI = 0x9ae8cc;
/** 색동: 빨강 · 노랑 · 초록 · 파랑 · 분홍 (+ 흰 술) */
const SM_SAEK: readonly Color[] = [0xe8404a, 0xf6c844, 0x46ae5c, 0x3a78d8, 0xf08ab8];
const SM_SAEK_LO: readonly Color[] = [0xa82832, 0xc8962a, 0x2c7a3e, 0x2452a0, 0xc05a8a];
const SM_WHITE = 0xf8f4ea;

// ── 복 조바위: 정수리가 트인 검은 비단 모자, 귀를 덮는 둥근 귀가리개, 이마 앞 금 매듭·옥 + 다홍 술, 뒤로 긴 다홍 술 ──
function smJobawiHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  const hy = Math.round(m.hy);
  const rx = Math.round(m.rx);
  const side = v === "side";
  // 위로 살짝 솟은 테 (정수리는 트여 머리가 보인다)
  if (!side) {
    for (const x of [cx - rx + 1, cx + rx - 2]) {
      g.set(x, top - 1, x < cx ? SM_BLK_HI : SM_BLK);
      g.set(x + (x < cx ? 1 : -1), top - 1, SM_BLK);
    }
  } else {
    g.set(cx - rx + 1, top - 1, SM_BLK_HI);
    g.set(cx - rx + 2, top - 1, SM_BLK);
    g.set(cx + rx - 2, top - 1, SM_BLK);
  }
  // 비단 띠 두 줄 (윤기: 왼쪽 밝게, 오른쪽 그늘) + 아랫줄 금박 점
  for (let x = cx - rx; x < cx + rx; x++) {
    const rel = (x - (cx - rx)) / (2 * rx);
    g.set(x, top, rel < 0.3 ? SM_BLK_HI : rel > 0.8 ? SM_BLK_LO : SM_BLK);
    g.set(x, top + 1, (x - cx + 20) % 3 === 1 ? SM_GOLD_LO : rel > 0.8 ? SM_BLK_LO : SM_BLK);
  }
  // 귀가리개: 머리 양옆을 둥글게 감싸 내려온다 (안쪽 윤기 줄 + 끝 금 구슬 · 다홍 술)
  const flapBot = hy + 1;
  const flap = (outer: number, inner: number) => {
    for (let y = top + 2; y <= flapBot; y++) {
      g.set(outer, y, y === flapBot ? SM_BLK_LO : SM_BLK);
      if (y < flapBot) g.set(inner, y, y === top + 2 ? SM_BLK : y >= flapBot - 1 ? SM_DAHONG_LO : SM_BLK_HI);
    }
    g.set(inner, flapBot, SM_GOLD);
    g.set(inner, flapBot + 1, SM_DAHONG);
    g.set(inner, flapBot + 2, SM_DAHONG_LO);
  };
  if (side) {
    for (let y = top + 2; y <= flapBot; y++) {
      g.set(cx - 2, y, SM_BLK);
      g.set(cx - 1, y, y === flapBot ? SM_BLK_LO : SM_BLK_HI);
    }
    g.set(cx - 1, flapBot + 1, SM_GOLD);
    g.set(cx - 1, flapBot + 2, SM_DAHONG);
    // 앞 이마 장식 (앞쪽 끝)
    g.set(cx + rx - 2, top, SM_GOLD);
    g.set(cx + rx - 2, top + 1, SM_DAHONG);
    // 뒤로 늘어진 긴 술
    const tx = cx - rx;
    g.set(tx, top + 1, SM_GOLD_HI);
    for (let y = top + 2; y <= hy + 3; y++) g.set(tx - 1, y, y % 2 ? SM_DAHONG : SM_DAHONG_LO);
    g.set(tx - 1, hy + 4, SM_GOLD);
    return;
  }
  flap(cx - rx - 1, cx - rx);
  flap(cx + rx, cx + rx - 1);
  if (v === "down") {
    // 이마 가운데: 금 매듭 + 옥 구슬, 아래로 짧은 다홍 술
    g.set(cx - 2, top, SM_GOLD);
    g.set(cx - 1, top, SM_JADE);
    g.set(cx, top, SM_GOLD_LO);
    g.set(cx - 1, top - 1, SM_GOLD_HI);
    // 이마를 가로지르는 구슬 줄 (금 · 다홍 번갈아), 가운데 다홍 술 한 가닥
    for (let x = cx - rx + 1; x <= cx + rx - 2; x++) if ((x - cx + 20) % 2 === 1) g.set(x, top + 2, (x - cx + 20) % 4 === 1 ? SM_GOLD : SM_DAHONG_HI);
    g.set(cx - 1, top + 1, SM_DAHONG);
    // 귀가리개 금박 꽃 한 점
    g.set(cx - rx, top + 3, SM_GOLD_LO);
    g.set(cx + rx - 1, top + 3, SM_GOLD_LO);
  } else {
    // 뒷모습: 뒤통수로 길게 늘어진 다홍 술 (금 매듭 + 끝 금 띠)
    g.set(cx - 1, top + 1, SM_GOLD_HI);
    g.set(cx, top + 1, SM_GOLD);
    for (let y = top + 2; y <= hy + 4; y++) {
      g.set(cx - 1, y, SM_DAHONG);
      g.set(cx, y, SM_DAHONG_LO);
    }
    g.hline(cx - 1, cx, hy + 2, SM_GOLD);
    g.set(cx - 1, hy + 5, SM_DAHONG_HI);
    g.set(cx, hy + 5, SM_DAHONG);
  }
}
function smJobawiGlow(g0: Grid, v: V, m: GearM, _fb: FB, top: number): void {
  const g = safe(g0);
  if (v === "down") g.set(m.cx - 1, top, SM_JADE_HI);
}
function smJobawiIcon(): Grid {
  return iconOf(
    [
      "..kh......kk..",
      ".kHhhyjykkkkl.",
      "kHhhhkykkkkkll",
      "khkkkkdkkkkkkl",
      "kgkgkgdgkgkgkl",
      "kh....D.....kl",
      "kh..........kl",
      "kh..........kl",
      "kh..........kl",
      "Ly..........yL",
      ".d..........d.",
      ".D..........D.",
    ],
    {
      k: SM_BLK,
      h: SM_BLK_HI,
      H: 0x6e6488,
      l: SM_BLK_LO,
      L: SM_BLK_LO,
      y: SM_GOLD,
      g: SM_GOLD_LO,
      j: SM_JADE,
      d: SM_DAHONG,
      D: SM_DAHONG_LO,
    },
    (g, ox, oy) => g.set(ox + 6, oy + 1, SM_JADE_HI),
  );
}

// ── 색동 목도리: 다섯 빛깔 줄이 이어지는 두툼한 목도리 + 늘어진 끝(가로 색동) + 흰 술 ──
function smSaekdongNeck(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx, neck } = m;
  const half = neckHalf(fb);
  const col = (x: number, lo: boolean) => (lo ? SM_SAEK_LO : SM_SAEK)[(((x + 40) % 5) + 5) % 5];
  for (let x = cx - half; x < cx + half; x++) {
    const edge = x >= cx + half - 1;
    g.set(x, neck, col(x, edge));
    if (x > cx - half && x < cx + half - 1) g.set(x, neck + 1, col(x + 2, edge || x >= cx + half - 2));
  }
  const tail = (x0: number, y0: number, n0: number) => {
    // 11/20 칸 검사: 앉은 자세·헤엄에선 늘어진 끝을 줄여 하얀 술까지 칸 바닥(y 26) 위에서 닫는다
    const n = Math.max(0, Math.min(n0, 26 - y0));
    for (let i = 0; i < n; i++) {
      g.set(x0, y0 + i, SM_SAEK[i % 5]);
      g.set(x0 + 1, y0 + i, SM_SAEK_LO[i % 5]);
    }
    g.set(x0, y0 + n, SM_WHITE);
    g.set(x0 + 1, y0 + n, (x0 + 1) % 2 ? 0xd8d0c0 : SM_WHITE);
  };
  const short = fb === "round" || fb === "sheet";
  if (v === "down") tail(cx - 3, neck + 2, short ? 2 : 3);
  else if (v === "up") tail(cx + 1, neck + 2, short ? 2 : 3);
  else {
    // 옆모습: 뒤로 날리는 끝
    const bx = cx - half - 1;
    g.set(bx, neck, SM_SAEK[0]);
    g.set(bx - 1, neck + 1, SM_SAEK[1]);
    g.set(bx, neck + 1, SM_SAEK[2]);
    g.set(bx - 1, neck + 2, SM_SAEK[3]);
    g.set(bx - 2, neck + 2, SM_WHITE);
  }
}
function smSaekdongIcon(): Grid {
  // 동그랗게 감은 목도리 + 늘어진 두 끝
  const g = new Grid(16, 16);
  for (let y = 2; y < 9; y++)
    for (let x = 1; x < 15; x++) {
      const dx = (x + 0.5 - 8) / 7;
      const dy = (y + 0.5 - 5.5) / 3.5;
      const d = dx * dx + dy * dy;
      if (d > 1 || d < 0.38) continue;
      g.set(x, y, (dy > 0.3 ? SM_SAEK_LO : SM_SAEK)[(x + 50) % 5]);
    }
  for (let i = 0; i < 5; i++) {
    g.set(4, 8 + i, SM_SAEK[i]);
    g.set(5, 8 + i, SM_SAEK_LO[i]);
    g.set(9, 7 + i, SM_SAEK[(i + 2) % 5]);
    g.set(10, 7 + i, SM_SAEK_LO[(i + 2) % 5]);
  }
  g.outline(0x1e1c1a, false, 170);
  for (const x of [4, 5]) g.set(x, 13, SM_WHITE);
  for (const x of [9, 10]) g.set(x, 12, SM_WHITE);
  g.set(4, 14, SM_WHITE);
  g.set(10, 13, SM_WHITE);
  return g;
}

// ── 복주머니: 다홍 비단 주머니 + 금 끈 매듭 + 가운데 금박 복 무늬 ──
function smPouchIcon(): Grid {
  return iconOf(
    ["...y....y...", "....y..y....", ".....YY.....", "....hddd....", "...dhdddl...", "..hddddddl..", ".hddyyyyddl.", ".hdyYddyydl.", ".hddyyyyddl.", ".hddyddyddl.", "..dddddddl..", "...llllll..."],
    {
      y: SM_GOLD,
      Y: SM_GOLD_HI,
      d: SM_DAHONG,
      h: SM_DAHONG_HI,
      l: SM_DAHONG_LO,
    },
  );
}

// ── 까치 친구 (펫): 검은 머리·등, 흰 배·어깨, 청록 광택 날개·긴 꼬리 ──
const SM_MAGPIE = [
  "..........kk..",
  ".........kKkk.",
  ".........kekkb",
  "TT.......kkkk.",
  ".tTt...kkkkk..",
  "..ttTgwwwwk...",
  "...tgGggwwww..",
  "....kgGgwwwww.",
  ".....kggwwwW..",
  "......kkWWW...",
  ".......l..l...",
  "......ll.ll...",
];
const SM_MAGPIE_PAL: Record<string, Color> = {
  k: 0x1e1e2a,
  K: 0x3a3a52,
  e: 0x1e1e2a,
  b: 0x34343c,
  t: 0x1e2c40,
  T: 0x2e8a96,
  g: 0x24406e,
  G: 0x46b8b0,
  w: 0xf6f6fa,
  W: 0xc8ccdc,
  l: 0x4a4a56,
};
function smMagpie(): Grid {
  const g = new Grid(16, 13);
  g.draw(art(SM_MAGPIE, SM_MAGPIE_PAL), 1, 0);
  g.outline(0x0e0e16, false, 200);
  // 눈 반짝 (외곽선 위)
  g.set(11, 2, 0xffffff);
  return g;
}
function smMagpieIcon(): Grid {
  const g = new Grid(16, 16);
  over(g, smMagpie(), 0, 2);
  return g;
}

// ── 색동 이름 (아이콘만): 이름표 위 글자 「가」가 색동 빛깔로 이어진다 ──
function smSaekNameIcon(): Grid {
  const glyph = ["xxxx.x..", "...x.x..", "...x.xxx", "..x..x..", ".x...x..", "x....x.."];
  const g = new Grid(16, 16);
  // 바탕 이름표 (어두운 판)
  g.rect(1, 3, 14, 10, 0x2a2834, 230);
  g.rect(2, 2, 12, 12, 0x2a2834, 230);
  glyph.forEach((r, y) => [...r].forEach((ch, x) => ch === "x" && g.set(4 + x, 5 + y, SM_SAEK[Math.floor((x * 5) / 8)])));
  // 글자 밑 색동 띠
  for (let x = 3; x < 13; x++) g.set(x, 12, SM_SAEK[(x - 3) % 5]);
  g.outline(0x0a0b10, false, 220);
  void SAFE_TOP;
  return g;
}

// ══ 「의리 초콜릿」 ══

// ── 한 벌 색: 딸기 분홍 · 진분홍 · 다홍 상자 · 금 리본 · 초코 · 편지지 ──
const VC_PINK = 0xff7aa8;
const VC_PINK_HI = 0xffc2d8;
const VC_PINK_LO = 0xd04a7c;
const VC_BAND = 0xc8386a;
const VC_BAND_LO = 0x8e2450;
const VC_SPRING = 0xd8dce6;
const VC_SPRING_LO = 0x9aa2b2;
const VC_BOX = 0xe0323e;
const VC_BOX_HI = 0xff7076;
const VC_BOX_LO = 0x9c1c2a;
const VC_GOLD = 0xf6cc4a;
const VC_GOLD_HI = 0xfff2b0;
const VC_GOLD_LO = 0xbc8c22;
const VC_CHOCO = 0x6e3c22;
const VC_CHOCO_HI = 0xa0603a;
const VC_CHOCO_LO = 0x48240f;
const VC_PAPER = 0xffe6ee;
const VC_PAPER_HI = 0xfff8fa;
const VC_PAPER_LO = 0xf0b8cc;
const VC_SEAL = 0xe8325e;

// ── 하트 더듬이 머리띠 ──
/** 3×3 하트 (아래 끝 x, y) */
function vcHeart(g: Grid, x: number, y: number, hi = true): void {
  g.set(x - 1, y - 2, hi ? VC_PINK_HI : VC_PINK);
  g.set(x + 1, y - 2, VC_PINK);
  g.set(x - 1, y - 1, VC_PINK);
  g.set(x, y - 1, VC_PINK);
  g.set(x + 1, y - 1, VC_PINK_LO);
  g.set(x, y, VC_PINK_LO);
}
function vcHeartbandHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  const rx = Math.round(m.rx);
  // 머리 위를 지나는 진분홍 띠 (앞·뒤 = 넓게, 옆 = 좁게)
  if (v === "side") g.hline(cx - 3, cx + 1, top, VC_BAND);
  else {
    g.hline(cx - rx + 1, cx + rx - 2, top, VC_BAND);
    g.set(cx + rx - 2, top, VC_BAND_LO);
  }
  // 용수철 더듬이: 띠에서 지그재그로 올라가 끝에 하트 (키다리처럼 머리가 높으면 짧게)
  const hb = Math.max(SAFE_TOP + 2, top - 4);
  const stalk = (x: number, lean: number) => {
    for (let y = top - 1; y > hb; y--) g.set(x + ((top - y) % 2 ? 0 : lean), y, (top - y) % 2 ? VC_SPRING : VC_SPRING_LO);
  };
  if (v === "side") {
    stalk(cx - 2, -1);
    stalk(cx + 1, 1);
    vcHeart(g, cx - 3, hb, false);
    vcHeart(g, cx + 2, hb);
  } else {
    stalk(cx - 3, -1);
    stalk(cx + 2, 1);
    vcHeart(g, cx - 4, hb, v === "down");
    vcHeart(g, cx + 3, hb, v === "down");
  }
}
function vcHeartbandGlow(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  // 하트 반짝 (외곽선 뒤에도 밝게)
  const g = safe(g0);
  const hb = Math.max(SAFE_TOP + 2, top - 4);
  if (v === "down") {
    g.set(m.cx - 5, hb - 2, 0xffffff);
    g.set(m.cx + 2, hb - 2, 0xffffff);
  } else if (v === "side") g.set(m.cx + 1, hb - 2, 0xffffff);
}
function vcHeartbandIcon(): Grid {
  return iconOf(
    [
      ".Hp......Hp.",
      "ppPp....ppPp",
      ".pPl....pPl.",
      "..l......l..",
      "..s......s..",
      "...S....S...",
      "...s....s...",
      "....S..S....",
      "...bbbbbb...",
      "..bb....bb..",
      ".bb......bb.",
      ".b........b.",
      "bB........Bb",
    ],
    {
      H: VC_PINK_HI,
      p: VC_PINK,
      P: VC_PINK,
      l: VC_PINK_LO,
      s: VC_SPRING,
      S: VC_SPRING_LO,
      b: VC_BAND,
      B: VC_BAND_LO,
    },
  );
}

// ── 의리 초콜릿 상자 (하트 상자 + 금 리본 매듭) ──
function vcChocoboxIcon(): Grid {
  return iconOf(
    [
      "....gG.Gg.....",
      ".....gGg......",
      "..hhh.g.rrr...",
      ".hhrrrgrrrrl..",
      ".hrrrrgrrrrrl.",
      ".rrrrrgrrrrrl.",
      "..rrrrgrrrrl..",
      "...rrrgrrrl...",
      "....rrgrrl....",
      ".....rkrl.....",
      "......kl......",
    ],
    {
      h: VC_BOX_HI,
      r: VC_BOX,
      l: VC_BOX_LO,
      g: VC_GOLD,
      G: VC_GOLD_HI,
      k: VC_GOLD_LO,
    },
    (g, ox, oy) => g.set(ox + 2, oy + 3, 0xffffff),
  );
}

// ── 러브레터 오라 ──
/** 편지봉투 6×5 (덮개 V선 + 하트 봉인) */
function vcEnvelope(): Grid {
  const g = art(["hhhhhh", "pPhhPp", "ppPPpp", "ppsspp", "llllll"], {
    h: VC_PAPER_HI,
    p: VC_PAPER,
    P: VC_PAPER_LO,
    s: VC_SEAL,
    l: VC_PAPER_LO,
  });
  g.outline(0xb8487a, false, 210);
  return g;
}
/** 열린 편지봉투 + 위로 튀어나온 하트 (7×9) */
function vcOpenEnvelope(): Grid {
  const g = art([".HP.Pp.", "PPPPPPl", ".PPPPl.", "..PPl..", "...l...", "hhhhhhh", "pPpppPp", "ppPpPpp", "lllllll"], { H: 0xffe0ec, P: 0xff5a8e, p: VC_PAPER, l: VC_PAPER_LO, h: VC_PAPER_HI });
  g.outline(0xb8487a, false, 210);
  return g;
}
/** 작은 하트 반짝이 (3×3, 외곽선 없이) */
function vcSparkle(g: Grid, x: number, y: number, a: number): void {
  dot(g, x, y, 0xffffff, a);
  dot(g, x - 1, y, 0xffb8d0, a * 0.6);
  dot(g, x + 1, y, 0xffb8d0, a * 0.6);
  dot(g, x, y - 1, 0xffb8d0, a * 0.6);
  dot(g, x, y + 1, 0xffb8d0, a * 0.6);
}
function vcLettersIcon(): Grid {
  const g = new Grid(16, 16);
  over(g, vcEnvelope(), 0, 9);
  over(g, vcOpenEnvelope(), 7, 2);
  vcSparkle(g, 3, 3, 240);
  vcSparkle(g, 14, 1, 200);
  return g;
}

// ── 녹은 초코 발자국 ──
function vcChocoPrint(drip: boolean): Grid {
  // 하트 자국 (5×4, 왼쪽 위 윤기 · 오른쪽 아래 짙게) + 녹아 흐른 방울
  const g = new Grid(6, 6);
  const a = art(["cc.cc", "cHccl", ".ccl.", "..l.."], {
    c: VC_CHOCO,
    H: VC_CHOCO_HI,
    l: VC_CHOCO_LO,
  });
  g.draw(a, 0, 0);
  g.set(0, 0, VC_CHOCO_HI);
  if (drip) {
    g.set(4, 3, VC_CHOCO);
    g.set(4, 4, VC_CHOCO_LO);
  }
  return g;
}
function vcChocostepsIcon(): Grid {
  const g = new Grid(16, 16);
  const big = art([".cc.cc.", "cHccccc", "cHccccl", ".ccccl.", "..ccl..", "...l..."], { c: VC_CHOCO, H: VC_CHOCO_HI, l: VC_CHOCO_LO });
  big.outline(0x2e160a, false, 170);
  over(g, big, 1, 8);
  const small = art(["cc.cc", "cHccl", ".ccl.", "..l.."], {
    c: VC_CHOCO,
    H: VC_CHOCO_HI,
    l: VC_CHOCO_LO,
  });
  small.outline(0x2e160a, false, 150);
  over(g, small, 8, 1);
  // 녹아 흐른 방울
  g.set(10, 13, VC_CHOCO);
  g.set(10, 14, VC_CHOCO_LO);
  g.set(13, 8, VC_CHOCO_LO);
  return g;
}

// ── 편지봉투 이름표 (아이콘만 — 이름표 그림은 compose.py) ──
function vcEnvelopeIcon(): Grid {
  return iconOf(["llllllllllllll", "lHpppppppppppl", "lpPpppppppppPl", "lpppPppppppPpl", "lppppPppppPppl", "lpppppPssPpppl", "lpppppsssspppl", "lppppppssppppl", "lppppppppppppl", "llllllllllllll"], {
    l: 0xc85a7a,
    H: VC_PAPER_HI,
    p: VC_PAPER,
    P: VC_PAPER_LO,
    s: VC_SEAL,
  });
}

// ══ 「벚꽃 소풍」 ══

// ── 한 벌 색: 크림 버킷햇 · 벚꽃 분홍 · 버터 노랑 배낭 · 빨강·흰 체크 돗자리 · 민트 도시락 · 새싹 연두 · 꿀벌 ──
const SP_CREAM = 0xf6ecd4;
const SP_CREAM_HI = 0xfffbf0;
const SP_CREAM_LO = 0xd6c4a0;
const SP_CREAM_DEEP = 0xb8a47c;
const SP_SAKURA = 0xf690b4;
const SP_SAKURA_HI = 0xffc8da;
const SP_SAKURA_LO = 0xd25a86;
const SP_PACK = 0xe8c060;
const SP_PACK_HI = 0xf8dc92;
const SP_PACK_LO = 0xb48c34;
const SP_STRAP = 0x9a7428;
const SP_MAT_R = 0xe2444a;
const SP_MAT_HI = 0xf27a72;
const SP_MAT_RL = 0xa82a34;
const SP_MAT_W = 0xfaf4ea;
const SP_MAT_WL = 0xd8ccc0;
const SP_MINT = 0x6ccab2;
const SP_MINT_LO = 0x3e9a86;
const SP_LAVER = 0x26322a;
const SP_RICE = 0xf4f0e4;
const SP_EGG = 0xf8d24a;
const SP_CARROT = 0xff8a4a;
const SP_SPINACH = 0x5ab84a;
const SP_LEAF = 0x7ad84a;
const SP_LEAF_HI = 0xb4f27a;
const SP_LEAF_LO = 0x4a9a32;
const SP_DIRT = 0x8a6a44;
const SP_DIRT_LO = 0x6a4e30;

// ── 벚꽃 버킷햇 ──
function spBucketHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  const rx = Math.round(m.rx);
  const side = v === "side";
  // 둥근 몸통 (정수리 3줄) — 왼쪽 밝게, 오른쪽 그늘
  const crown: [number, number][] = [
    [top - 2, Math.max(2, Math.round(rx * 0.7))],
    [top - 1, rx],
    [top, rx],
  ];
  for (const [y, h] of crown) for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? SP_CREAM_LO : x === cx - h ? SP_CREAM_HI : SP_CREAM);
  // 분홍 리본 띠
  for (let x = cx - rx; x < cx + rx; x++) g.set(x, top + 1, x >= cx + rx - 1 ? SP_SAKURA_LO : SP_SAKURA);
  // 벚꽃 무늬 (정수리에 콕콕 — 앞·뒤 둘, 옆 하나)
  const flowers = side
    ? [[cx, top - 1]]
    : [
        [cx - 2, top - 1],
        [cx + 2, top - 2],
      ];
  for (const [x, y] of flowers) {
    g.set(x, y, SP_SAKURA_HI);
    if (y + 1 <= top) g.set(x, y + 1, SP_SAKURA);
  }
  if (!side) g.set(cx - 4, top, SP_SAKURA);
  // 아래로 처진 챙 (앞모습은 양옆 끝이 한 칸 처지고, 옆모습은 앞으로 길게)
  const x0 = cx - rx - 1;
  // 11/20 칸 검사: 머리가 넓은 몸의 옆모습 앞 챙은 칸 오른쪽 끝(x 18)까지만 (끝 한 칸 짙게 닫는다)
  const x1 = side ? Math.min(18, cx + rx + 1) : cx + rx;
  for (let x = x0; x <= x1; x++) g.set(x, top + 2, x === x0 ? SP_CREAM_HI : x >= x1 - 1 ? SP_CREAM_LO : SP_CREAM);
  if (v === "down") for (let x = x0 + 2; x <= x1 - 2; x++) g.set(x, top + 3, SP_CREAM_DEEP, 120);
  g.set(x0, top + 3, SP_CREAM_LO);
  g.set(x1, top + 3, SP_CREAM_DEEP);
  if (side) g.set(x1 - 1, top + 3, SP_CREAM_DEEP);
}
function spBucketIcon(): Grid {
  return iconOf(["....hcPccc....", "...hcSccccl...", "..hccccSPcl...", "..hcPcccccll..", "..sssssssssr..", ".hcccccccccccl", "hccccccccccccl", ".dd........dd."], {
    h: SP_CREAM_HI,
    c: SP_CREAM,
    l: SP_CREAM_LO,
    d: SP_CREAM_DEEP,
    s: SP_SAKURA,
    r: SP_SAKURA_LO,
    S: SP_SAKURA_HI,
    P: SP_SAKURA,
  });
}

// ── 돗자리 배낭 ──
/** 돌돌 만 체크 돗자리 (x0~x1, 세 줄: 위 밝게 · 가운데 · 아래 그늘). 세 칸마다 흰 줄 */
function spMatRoll(g: Grid, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    const white = (x + 30) % 3 === 0;
    g.set(x, y, white ? SP_MAT_W : SP_MAT_HI);
    g.set(x, y + 1, white ? SP_MAT_WL : SP_MAT_R);
    g.set(x, y + 2, white ? SP_MAT_WL : SP_MAT_RL);
  }
}
/** 돗자리 끝 소용돌이 단면 (3×3, 크림 테 + 빨간 속) */
function spRollEnd(g: Grid, x: number, y: number): void {
  const a = ["rwr", "wkw", "rwl"];
  const pal: Record<string, Color> = {
    w: SP_MAT_W,
    r: SP_MAT_R,
    k: SP_MAT_RL,
    l: SP_MAT_WL,
  };
  a.forEach((row, j) => [...row].forEach((ch, i) => g.set(x + i, y + j, pal[ch])));
}
function spMatpackBack(g: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const { cx, shY, shL, shR } = m;
  void hem;
  void sit;
  void body;
  const up = v === "up";
  const side = v === "side";
  if (up && layer === "front") {
    const w = fb === "tall" ? 6 : 7;
    const x0 = Math.round(cx - w / 2);
    // 배낭 몸 + 덮개 + 앞주머니 + 버클 (11/20 칸 검사: 걷기 출렁임·앉은 자세에선 밑을 줄여 칸 바닥 y 26에서 닫는다)
    const ph = Math.min(6, 27 - shY);
    g.rect(x0, shY, w, ph, SP_PACK);
    g.vline(x0, shY, shY + ph - 1, SP_PACK_HI);
    g.vline(x0 + w - 1, shY, shY + ph - 1, SP_PACK_LO);
    g.hline(x0, x0 + w - 1, shY, SP_PACK_HI);
    g.hline(x0 + 1, x0 + w - 2, shY + 1, SP_PACK_LO);
    if (ph >= 4) g.rect(x0 + 1, shY + 3, w - 2, Math.min(2, ph - 4), SP_PACK_LO);
    if (ph >= 4) g.hline(x0 + 2, x0 + w - 3, shY + 3, SP_PACK);
    g.set(cx - 1, shY + 1, 0xf6f0e0);
  } else if (side && layer === "back") {
    // 옆모습: 등 뒤로 튀어나온 배낭 + 위에 돗자리 단면
    const x0 = cx - 9;
    const b = Math.min(shY + 3, 26);
    g.rect(x0, shY - 2, 5, b - shY + 3, SP_PACK);
    g.vline(x0, shY - 2, b, SP_PACK_LO);
    g.hline(x0 + 1, x0 + 4, shY - 2, SP_PACK_HI);
    g.hline(x0 + 1, x0 + 3, shY + 1, SP_PACK_LO);
    g.set(x0 + 2, shY, 0xf6f0e0);
    g.set(x0 + 1, b, SP_PACK_LO);
  } else if (side && layer === "front") {
    // 어깨끈
    g.vline(cx - 1, shY, shY + 2, SP_STRAP);
  } else if (v === "down" && layer === "back") {
    // 앞모습: 어깨 위로 양옆에 삐져나온 돗자리 + 몸 뒤 배낭 가장자리
    g.rect(cx - 4, shY - 1, 8, Math.min(5, 27 - shY), SP_PACK);
  } else if (v === "down" && layer === "front") {
    // 어깨끈 둘 (동글이·이불 유령은 몸통 가장자리)
    const wide = fb === "round" || fb === "sheet";
    const l = wide ? shL + 2 : shL + 1;
    const r = wide ? shR - 2 : shR - 1;
    g.vline(l, shY, shY + 2, SP_STRAP);
    g.vline(r, shY, shY + 2, SP_STRAP);
    g.set(l, shY + 1, SP_PACK_HI);
    g.set(r, shY + 1, SP_PACK_HI);
  }
}
/**
 * 돗자리는 머리를 그린 다음(목 차례)에 "빈 칸에만" 칠한다 — 몸 뒤에 있는 것처럼 보이고,
 * 머리 명암(recolor)이 돗자리 색을 덮어쓰지 않게
 */
function spMatpackNeck(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx, shY, shL, shR } = m;
  const behind = (x: number, y: number, c: Color) => {
    if (!g.filled(x, y)) g.set(x, y, c);
  };
  const roll = (x0: number, x1: number, y: number) => {
    const t = new Grid(20, 28);
    spMatRoll(t, x0, x1, y);
    for (let yy = y; yy < y + 3; yy++) for (let x = x0; x <= x1; x++) behind(x, yy, t.get(x, yy) >>> 8);
  };
  if (v === "down") {
    // 앞모습: 어깨 뒤로 양옆에 삐져나온 돗자리 (끝은 한 칸 짙게)
    // 11/20 칸 검사: 넓은 몸은 돗자리가 칸 밖까지 뻗어 끝이 잘렸다 → 칸 안(x 1~18)까지만 말고 끝은 짙게 닫는다
    const y = shY - 4;
    const [l, r] = [Math.max(1, shL - 5), Math.min(18, shR + 5)];
    roll(l, r, y);
    for (const x of [l, r]) for (let yy = y; yy <= y + 2; yy++) behind(x, yy, yy === y ? SP_MAT_R : SP_MAT_RL);
  } else if (v === "up") {
    const w = fb === "tall" ? 6 : 7;
    const x0 = Math.round(cx - w / 2);
    const y = shY - 3;
    roll(x0 - 3, x0 + w + 2, y);
    const t = new Grid(20, 28);
    spRollEnd(t, x0 - 4, y);
    spRollEnd(t, x0 + w + 2, y);
    for (let yy = y; yy < y + 3; yy++) for (let x = 0; x < 20; x++) if (t.filled(x, yy)) behind(x, yy, t.get(x, yy) >>> 8);
  } else {
    // 옆모습: 배낭 위 돗자리 둥근 단면
    const x0 = cx - 9;
    const t = new Grid(20, 28);
    spRollEnd(t, x0, shY - 5);
    t.hline(x0 + 3, x0 + 4, shY - 5, SP_MAT_HI);
    t.hline(x0 + 3, x0 + 4, shY - 4, SP_MAT_R);
    t.hline(x0 + 3, x0 + 4, shY - 3, SP_MAT_RL);
    for (let yy = shY - 5; yy < shY - 2; yy++) for (let x = 0; x < 20; x++) if (t.filled(x, yy)) behind(x, yy, t.get(x, yy) >>> 8);
  }
}
function spMatpackIcon(): Grid {
  return iconOf(
    [
      "WHHwHHwHHwHHwW",
      "erRvRRvRRvRRve",
      "..hhhhhhhhhh..",
      "..hpppppppppl.",
      "..hllllllllll.",
      "..hppppcpppl..",
      "..hpppppppppl.",
      "..hpllllllllp.",
      "..hplpppppplp.",
      "..hpllllllllp.",
      "..llllllllll..",
    ],
    {
      r: SP_MAT_R,
      w: SP_MAT_W,
      W: SP_MAT_W,
      H: SP_MAT_HI,
      e: SP_MAT_RL,
      R: SP_MAT_R,
      v: SP_MAT_WL,
      h: SP_PACK_HI,
      p: SP_PACK,
      l: SP_PACK_LO,
      c: 0xf6f0e0,
    },
  );
}

// ── 김밥 도시락 ──
function spGimbapIcon(): Grid {
  return iconOf(["...........o.", "..........o..", ".kkk.kkk.o...", "kwyw.wcwko...", "kwew.wsw.k...", ".kkk.kkk.....", "mmmmmmmmmmmm.", "mkkkmkkkmkkkm", "mwswmwywmwcwm", "MMMMMMMMMMMMM"], {
    k: SP_LAVER,
    w: SP_RICE,
    y: SP_EGG,
    e: SP_CARROT,
    c: SP_CARROT,
    s: SP_SPINACH,
    m: SP_MINT,
    M: SP_MINT_LO,
    o: 0xd8a868,
  });
}

// ── 새싹 걸음 ──
function spSprout(big: boolean): Grid {
  const g = new Grid(7, 6);
  const a = big
    ? art(["Gg.gG", ".gsg.", "..s..", ".ddd."], {
        G: SP_LEAF_HI,
        g: SP_LEAF,
        s: SP_LEAF_LO,
        d: SP_DIRT,
      })
    : art([".G.g.", "..s..", ".ddd."], {
        G: SP_LEAF_HI,
        g: SP_LEAF,
        s: SP_LEAF_LO,
        d: SP_DIRT,
      });
  g.draw(a, 1, big ? 1 : 2);
  g.outline(0x2e5a1e, false, 110);
  g.set(big ? 2 : 2, big ? 4 : 4, SP_DIRT_LO);
  return g;
}
function spSproutsIcon(): Grid {
  const g = new Grid(16, 16);
  const big = art([".GG...gg.", "GGgg.gggl", ".Ggglggl.", "...gsl...", "....s....", "..ddddd..", ".dDddDdd."], {
    G: SP_LEAF_HI,
    g: SP_LEAF,
    l: SP_LEAF_LO,
    s: SP_LEAF_LO,
    d: SP_DIRT,
    D: SP_DIRT_LO,
  });
  big.outline(0x2e5a1e, false, 170);
  over(g, big, 1, 7);
  over(g, spSprout(false), 9, 1);
  return g;
}

// ── 꼬마 꿀벌 (펫) ──
function spBee(): Grid {
  const g = new Grid(14, 12);
  // 몸 (노랑 타원 + 검정 줄무늬 + 명암)
  const b = new Grid(14, 12);
  b.ellipse(6, 7, 4.6, 3.2, 0xffd23a);
  b.recolor((x, y) => x - 6 + (y - 7) < -3, 0xfff08a);
  b.recolor((x, y) => x - 6 + (y - 7) > 3 || y >= 9, 0xd8a01a);
  for (const sx of [4, 6]) b.recolor((x) => x === sx, 0x2a2420);
  b.recolor((x, y) => x === 4 && y === 5, 0x4a3a30);
  // 침
  b.set(1, 7, 0x2a2420);
  // 더듬이
  b.set(9, 3, 0x2a2420);
  b.set(10, 2, 0x2a2420);
  b.set(11, 3, 0x2a2420);
  b.set(12, 2, 0x2a2420);
  // 다리
  b.set(5, 10, 0x2a2420);
  b.set(7, 10, 0x2a2420);
  b.outline(0x3a2410, false, 230);
  // 눈 · 볼 (외곽선 위)
  b.set(9, 6, 0x1a1418);
  b.set(10, 8, 0xff9aa8);
  g.draw(b, 0, 0);
  // 반투명 날개 두 장 (몸 위, 옅은 하늘빛)
  const w = new Grid(14, 12);
  w.ellipse(4, 1.9, 1.8, 1.6, 0xeaf8ff);
  w.ellipse(6.8, 2.3, 1.4, 1.2, 0xd6eefc);
  w.set(3, 1, 0xffffff);
  w.outline(0x7a9ab8, false, 170);
  over(g, w, 0, 0, 0.7);
  return g;
}
function spBeeIcon(): Grid {
  const g = new Grid(16, 16);
  over(g, spBee(), 1, 2);
  for (const [x, y] of [
    [2, 14],
    [5, 15],
    [8, 14],
  ] as const)
    g.set(x, y, SP_SAKURA, 200);
  return g;
}

// ══ 「사내 체육대회」 ══

// ── 한 벌 색: 청팀 파랑 · 흰 이름 띠 · 빨간 바통 · 나무 장대 · 호랑이 노랑 · 흙먼지 ──
const SD_BLUE = 0x2f6ee0;
const SD_BLUE_HI = 0x5a96ff;
const SD_BLUE_LO = 0x1c46a8;
const SD_WHITE = 0xf8f8f4;
const SD_BAT = 0xe03a3a;
const SD_BAT_HI = 0xff7a6a;
const SD_BAT_LO = 0xa02028;
const SD_WOOD = 0xb07a40;
const SD_WOOD_LO = 0x7a5028;
const SD_KNOB = 0xf2c84a;
const SD_KNOB_HI = 0xfff0a8;
const SD_TIGER = 0xffc23a;
const SD_STRIPE = 0x2a1e18;
const SD_DUST = 0xeee2c6;
const SD_DUST_HI = 0xfaf4e8;
const SD_DUST_LO = 0xc8a87c;
const SD_DUST_DEEP = 0x8e6c48;

// ── 청팀 머리띠 (이마에 두 줄 + 가운데 흰 이름 띠 + 뒤로 휘날리는 끝자락) ──
function sdHeadbandHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  // 이마 줄: 동글이·이불 유령은 머리 위쪽이 넓어 한 줄 아래로
  const y0 = top + (fb === "round" || fb === "sheet" ? 2 : 2);
  for (let r = 0; r < 2; r++) {
    const y = y0 + r;
    const h = Math.round(halfAt(m, y) + 0.2);
    for (let x = cx - h; x < cx + h; x++) g.set(x, y, r === 0 ? (x === cx - h ? SD_BLUE_HI : x >= cx + h - 1 ? SD_BLUE_LO : SD_BLUE) : x >= cx + h - 2 ? SD_BLUE_LO : SD_BLUE);
  }
  if (v === "down") {
    // 가운데 흰 이름 띠 (「청」 자리) + 파란 점
    g.set(cx - 2, y0, SD_WHITE);
    g.set(cx - 1, y0, SD_WHITE);
    g.set(cx, y0, SD_WHITE);
    g.set(cx - 2, y0 + 1, SD_WHITE);
    g.set(cx - 1, y0 + 1, SD_BLUE_LO);
    g.set(cx, y0 + 1, SD_WHITE);
    // 머리 오른쪽 뒤로 살짝 보이는 끝자락
    const h = Math.round(halfAt(m, y0) + 0.2);
    g.set(cx + h, y0 + 1, SD_BLUE);
    g.set(cx + h + 1, y0 + 2, SD_BLUE_LO);
  } else if (v === "side") {
    // 옆모습: 이마 앞쪽 흰 띠 · 뒤통수 매듭에서 두 끝자락이 뒤로 휘날린다
    const h = Math.round(halfAt(m, y0) + 0.2);
    g.set(cx + h - 2, y0, SD_WHITE);
    g.set(cx + h - 3, y0, SD_WHITE);
    const kx = cx - h;
    g.set(kx, y0, SD_BLUE_LO);
    g.set(kx - 1, y0, SD_BLUE);
    g.set(kx - 2, y0 - 1, SD_BLUE_HI);
    g.set(kx - 3, y0 - 1, SD_BLUE);
    g.set(kx - 4, y0 - 2, SD_BLUE_LO);
    g.set(kx - 1, y0 + 1, SD_BLUE);
    g.set(kx - 2, y0 + 2, SD_BLUE);
    g.set(kx - 3, y0 + 2, SD_BLUE_LO);
  } else {
    // 뒷모습: 가운데 매듭 + 아래로 비스듬히 늘어진 두 끝자락
    g.set(cx - 1, y0, SD_BLUE_HI);
    g.set(cx, y0, SD_BLUE_LO);
    g.set(cx - 2, y0 + 2, SD_BLUE);
    g.set(cx - 3, y0 + 3, SD_BLUE);
    g.set(cx - 3, y0 + 4, SD_BLUE_LO);
    g.set(cx + 1, y0 + 2, SD_BLUE);
    g.set(cx + 2, y0 + 3, SD_BLUE_LO);
  }
  void SAFE_TOP;
}
function sdHeadbandIcon(): Grid {
  return iconOf(["....bbbbbbbb....", "..bBbbwwwbbbbb..", ".bBbbbwbwbbbbbl.", ".bbbbbbbbbbbbbl.", "..lllllllllll...", "............bb..", "............lbb.", ".............lb.", "..............l."], {
    b: SD_BLUE,
    B: SD_BLUE_HI,
    l: SD_BLUE_LO,
    w: SD_WHITE,
  });
}

// ── 계주 바통 ──
function sdBatonIcon(): Grid {
  return iconOf(["........Rr", ".......Rrl", "......Rrl.", ".....wwd..", "....Rrl...", "...Rrl....", "..Rrl.....", ".Rrl......", "Rrl.......", "rl........"], {
    R: SD_BAT_HI,
    r: SD_BAT,
    l: SD_BAT_LO,
    w: SD_WHITE,
    d: 0xd8d8d0,
  });
}

// ── 응원 깃발 (등에 꽂은 장대 + 파란 깃발에 노란 호랑이) ──
// 11/20 칸 검사: 일곱 칸 깃발 끝이 칸 밖(x 19·0)으로 나가 잘렸다 → 여섯 칸(호랑이 얼굴은 귀·눈·흰 주둥이로 줄임)
const SD_FLAG = ["Bbbbbd", "bYbbYd", "bYYYYd", "bkYYkd", "bbwwbd", "dddddd"];
const SD_FLAG_PAL: Record<string, Color> = {
  B: SD_BLUE_HI,
  b: SD_BLUE,
  d: SD_BLUE_LO,
  Y: SD_TIGER,
  k: SD_STRIPE,
  w: SD_WHITE,
};
/** 깃발 (dir = 1 오른쪽으로 펄럭, -1 왼쪽으로). x = 장대 옆 첫 칸 */
function sdFlag(g: Grid, x: number, y: number, dir: 1 | -1): void {
  SD_FLAG.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      const c = SD_FLAG_PAL[ch];
      if (c === undefined) return;
      // 끝 쪽이 한 칸 처지게 (바람 결)
      const sag = i >= 4 ? 1 : 0;
      g.set(x + dir * i, y + j + sag, c);
    }),
  );
}
function sdPole(g: Grid, x: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) g.set(x, y, (y - y0) % 4 === 3 ? SD_WOOD_LO : SD_WOOD);
}
function sdFlagDraw(g0: Grid, v: V, m: GearM, fb: FB): void {
  const { cx } = m;
  const ft = SAFE_TOP + 1; // 깃발 위 (꼭지 구슬은 그 위 줄)
  const base = fb === "round" ? Math.round(m.hy) + 2 : fb === "sheet" ? Math.round(m.hy) + 5 : m.shY + 2;
  if (v === "down") {
    const g = safe(under(g0));
    const px = cx + 2;
    g.set(px, ft - 1, SD_KNOB);
    sdFlag(g, px + 1, ft, 1);
    sdPole(g, px, ft, base);
  } else if (v === "side") {
    const g = safe(under(g0));
    const px = cx - 3;
    g.set(px, ft - 1, SD_KNOB);
    sdFlag(g, px - 1, ft, -1);
    sdPole(g, px, ft, base);
  } else {
    // 뒷모습: 등판 위로는 덮고(머리 아래 줄부터), 머리 뒤로는 빈칸에만
    const headBot = Math.round(m.hy + m.ry);
    const g = safe(under(g0, (_x, y) => y >= headBot));
    const px = cx - 4;
    g.set(px, ft - 1, SD_KNOB);
    sdFlag(g, px + 1, ft, 1);
    sdPole(g, px, ft, base);
    // 등에 맨 꽂이 (가죽 주머니)
    g.set(px - 1, base - 1, SD_WOOD_LO);
    g.set(px, base - 1, 0x5a3a20);
    g.set(px + 1, base - 1, SD_WOOD_LO);
    g.set(px, base, 0x5a3a20);
  }
}
function sdFlagGlow(g0: Grid, v: V, m: GearM): void {
  const g = safe(g0);
  const px = v === "down" ? m.cx + 2 : v === "side" ? m.cx - 3 : m.cx - 4;
  g.set(px, SAFE_TOP, SD_KNOB_HI);
}
function sdFlagIcon(): Grid {
  const g = new Grid(16, 16);
  const a = new Grid(16, 16);
  for (let y = 2; y <= 15; y++) a.set(3, y, (y - 2) % 4 === 3 ? SD_WOOD_LO : SD_WOOD);
  a.set(3, 1, SD_KNOB);
  const big = art(["BBbbbbbbbd", "bbYbbbbYbd", "bbYYkkYYbd", "bYYkYYkYYd", "bYkkYYkkYd", "bYYYwwYYYd", "bbYYYYYYbd", "bbbbbbbbbbd", "ddddddddddd"], {
    B: SD_BLUE_HI,
    b: SD_BLUE,
    d: SD_BLUE_LO,
    Y: SD_TIGER,
    k: SD_STRIPE,
    w: SD_WHITE,
  });
  a.draw(big, 4, 2);
  a.outline(0x1e1c1a, false, 170);
  a.set(3, 1, SD_KNOB_HI);
  g.draw(a, 0, 0);
  return g;
}

// ── 흙먼지 질주 (발자국 대신 뽀얀 흙먼지 뭉치) ──
function sdDustPuff(w: number, h: number, seed: number): Grid {
  const g = new Grid(w + 2, h + 2);
  const cx = (w + 2) / 2;
  const cy = (h + 2) / 2;
  g.ellipse(cx, cy, w / 2, h / 2, SD_DUST);
  // 작은 혹 둘 (몽글몽글)
  g.ellipse(cx - w / 4, cy - h / 4, w / 4 + 0.3, h / 4 + 0.3, SD_DUST);
  g.ellipse(cx + w / 4, cy - h / 5 + (seed % 2), w / 4, h / 4, SD_DUST);
  // 명암: 위 밝게, 아래 갈색 그늘
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (!g.filled(x, y)) continue;
      if (!g.filled(x, y - 1)) g.set(x, y, SD_DUST_HI);
      else if (!g.filled(x, y + 1) || y >= cy + h / 4) g.set(x, y, SD_DUST_LO);
    }
  g.outline(SD_DUST_DEEP, false, 90);
  // 튀는 흙 알갱이
  g.set(0, g.h - 1, SD_DUST_DEEP, 220);
  if (seed % 2) g.set(g.w - 1, g.h - 2, SD_DUST_LO, 200);
  return g;
}
function sdDashFeet(): Grid[] {
  return [sdDustPuff(3, 2, 1), sdDustPuff(4, 3, 2), sdDustPuff(5, 3, 3), sdDustPuff(5, 4, 4)];
}
function sdDashIcon(): Grid {
  const g = new Grid(16, 16);
  g.draw(sdDustPuff(4, 3, 1), 11, 11);
  g.draw(sdDustPuff(6, 4, 2), 5, 8);
  g.draw(sdDustPuff(8, 5, 3), 0, 2);
  // 달린 자국 (짧은 줄)
  for (const [x, y] of [
    [13, 7],
    [14, 7],
    [12, 4],
    [13, 4],
  ] as const)
    g.set(x, y, SD_DUST_LO, 200);
  return g;
}

// ══ 등록 ══

/** 시트에 그려지는 여섯 벌 꾸미기 (자리별 그리기) */
export const GEAR2: Readonly<Record<string, SsItem>> = {
  of_antenna: {
    headWorn: true,
    head: (g, v, m, fb, top) => ofAntennaHead(g, v, m, fb, top),
    glow: (g, v, m, fb, top) => ofAntennaGlow(g, v, m, fb, top),
  },
  // A4 날개는 머리를 다 그린 뒤(목 차례) 몸 뒤 빈칸에 (뒷모습은 등판을 덮는다)
  of_a4wings: { neck: (g, v, m, fb) => ofA4Draw(g, v, m, fb) },
  of_drink: {} /* 11/22 손 그림은 heldGear.ts */,
  gk_moonwreath: {
    head: (g, v, m, fb, top) => gkWreathHead(g, v, m, fb, top),
    glow: (g, v, m, fb, top) => gkWreathGlow(g, v, m, fb, top),
  },
  gk_firefly: {} /* 11/22 손 그림은 heldGear.ts */,
  // 비석 배낭: 앞·옆은 몸 뒤(back), 뒷모습은 머리를 그린 뒤 등에 (neck 차례)
  gk_stonepack: {
    back: (g, v, m, fb, layer) => gkPackBack(g, v, m, fb, layer),
    neck: (g, v, m, fb) => gkPackUp(g, v, m, fb),
    glow: (g, v, m, fb) => gkPackGlow(g, v, m, fb),
  },
  sm_jobawi: {
    covers: true,
    head: (g, v, m, fb, top) => smJobawiHead(g, v, m, fb, top),
    glow: (g, v, m, fb, top) => smJobawiGlow(g, v, m, fb, top),
  },
  sm_saekdong: { neck: (g, v, m, fb) => smSaekdongNeck(g, v, m, fb) },
  sm_pouch: {} /* 11/22 손 그림은 heldGear.ts */,
  vc_heartband: {
    head: (g, v, m, fb, top) => vcHeartbandHead(g, v, m, fb, top),
    glow: (g, v, m, fb, top) => vcHeartbandGlow(g, v, m, fb, top),
  },
  vc_chocobox: {} /* 11/22 손 그림은 heldGear.ts */,
  sp_buckethat: {
    covers: true,
    head: (g, v, m, fb, top) => spBucketHead(g, v, m, fb, top),
  },
  // 돗자리는 머리를 다 그린 뒤(목 차례) 빈칸에만
  sp_matpack: {
    back: spMatpackBack,
    neck: (g, v, m, fb) => spMatpackNeck(g, v, m, fb),
  },
  sp_gimbap: {} /* 11/22 손 그림은 heldGear.ts */,
  sd_headband: {
    headWorn: true,
    head: (g, v, m, fb, top) => sdHeadbandHead(g, v, m, fb, top),
  },
  sd_baton: {} /* 11/22 손 그림은 heldGear.ts */,
  // 응원 깃발은 head 자리에서 "머리 다 그린 뒤 몸 뒤 빈칸"에 꽂는다 (모자를 쓴 것은 아니다)
  sd_flag: {
    headWorn: false,
    head: (g, v, m, fb) => sdFlagDraw(g, v, m, fb),
    glow: (g, v, m) => sdFlagGlow(g, v, m),
  },
};

/** 시트 그림 꾸미기·이름 글자·이름표 아이콘 16×16 */
export const ICONS2: Readonly<Record<string, () => Grid>> = {
  of_antenna: ofAntennaIcon,
  of_a4wings: ofA4Icon,
  of_drink: ofDrinkIcon,
  of_blueglow: ofBlueIcon,
  gk_moonwreath: gkWreathIcon,
  gk_firefly: gkJarIcon,
  gk_stonepack: gkPackIcon,
  sm_jobawi: smJobawiIcon,
  sm_saekdong: smSaekdongIcon,
  sm_pouch: smPouchIcon,
  sm_saekname: smSaekNameIcon,
  vc_heartband: vcHeartbandIcon,
  vc_chocobox: vcChocoboxIcon,
  vc_envelope: vcEnvelopeIcon,
  sp_buckethat: spBucketIcon,
  sp_matpack: spMatpackIcon,
  sp_gimbap: spGimbapIcon,
  sd_headband: sdHeadbandIcon,
  sd_baton: sdBatonIcon,
  sd_flag: sdFlagIcon,
};

/** 따로 그리는 연출(오라·발자국·펫)의 아이콘 16×16 (seasonSetFx2가 쓴다) */
export const FX_ICONS2: Readonly<Record<string, () => Grid>> = {
  of_postit: ofPostitIcon,
  gk_fadesteps: gkStepsIcon,
  gk_owl: gkOwlIcon,
  sm_magpie: smMagpieIcon,
  vc_letters: vcLettersIcon,
  vc_chocosteps: vcChocostepsIcon,
  sp_sprouts: spSproutsIcon,
  sp_bee: spBeeIcon,
  sd_dash: sdDashIcon,
};

/** 따로 그리는 연출의 그림 재료 (seasonSetFx2가 프레임으로 굽는다) */
export const SS2_PARTS = {
  note: ofNote,
  notes: OF_NOTES,
  owl: gkOwl,
  owlEyes: GK_OWL_EYES,
  fadeSteps: gkSteps,
  ghost: GK_GHOST,
  ghostHi: GK_GHOST_HI,
  tubeHi: OF_TUBE_HI,
  magpie: smMagpie,
  magpieArt: SM_MAGPIE,
  magpiePal: SM_MAGPIE_PAL,
  gold: SM_GOLD,
  goldHi: SM_GOLD_HI,
  dahong: SM_DAHONG,
  envelope: vcEnvelope,
  openEnvelope: vcOpenEnvelope,
  sparkle: vcSparkle,
  chocoPrint: vcChocoPrint,
  pink: VC_PINK,
  pinkHi: VC_PINK_HI,
  pinkLo: VC_PINK_LO,
  sprout: spSprout,
  bee: spBee,
  sakura: SP_SAKURA,
  sakuraHi: SP_SAKURA_HI,
  sakuraLo: SP_SAKURA_LO,
  dustPuff: sdDustPuff,
  dashFeet: sdDashFeet,
} as const;
