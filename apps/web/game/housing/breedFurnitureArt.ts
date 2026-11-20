import { darken, Grid, hash2, mix, type Color } from "../sprites/pixel";

// 11/19 품종 펫(sprites/petBreeds.ts 12종)의 집 가구 버전 — 멍냥 분양소 전용 (lib/housing/catalog.ts nap_*, petShop).
// 쓰다듬을 때 설 자리는 시즌 가구와 같은 규칙 (interact.ts seasonStandSpot — 돌린 앞쪽 칸, 위쪽은 마지막, 몸이 그림을 25% 넘게 덮지 않게).
// 규칙은 잠자는 강아지·고양이 쿠션(art.ts)과 같다:
//  - 1×1칸: 그림 16 × (16 + 솟는 높이 BREED_FURN_UP). 테두리는 furnitureGrid처럼 맨 마지막에 OUT(170).
//  - 4방향 가구(catalog spin): d0 앞(아래를 봄) · d1 옆(왼쪽을 봄) · d2 뒤(위를 봄). 오른쪽(d3)은 옆모습을 좌우로 뒤집는다 (art.ts shownItemGrid).
//    빛은 늘 위에서 와서 뒤집어도 어색하지 않다. 방석·바구니는 위에서 내려다본 모양이라 어느 방향이든 같은 자리에 있다.
//  - 펫은 머리 층·몸 층을 따로 그려 겹친 경계에 짙은 털색 테를 두른다 (잠자는 강아지와 같은 방식 → 작은 그림에서도 머리가 또렷).
//  - 움직임: 잠자는 강아지처럼 숨 장면 b1(눈 깜빡 + 꼬리 끝 살랑)과 가끔 하품 y1. 쓰다듬으면 p1·p2 (품종마다 다른 동작).
//
// 글자 지도 (petBreeds와 같은 글자): f 털 · h 밝은 털 · l 그늘 · c 가슴 · m 주둥이 · w 흰 털 · p 발 · t·y 꼬리 · x 꼬리 끝 · r 귀 · i 귀 속
//   z 줄무늬 · e 눈 · q 감은 눈 · n 코 · b 볼터치 · k 혀 · d 입 · o·u 품종 무늬

type Pal = Partial<Record<string, Color>>;
type Art = readonly string[];

/** 솟는 높이 (px). 잠자는 강아지(2)보다 2px 높다: 앉은 귀가 칸 위로 조금 나온다 */
export const BREED_FURN_UP = 4;
const W = 16;
const H = 16 + BREED_FURN_UP;
const OUT = 0x1a1612;

const EYE = 0x2a1e18;
const BLUSH = 0xf6a0b0;
const TONGUE = 0xf07a8a;
const PINK = 0xf2a8b4;

function paint(g: Grid, art: Art, pal: Pal, dx = 0, dy = 0): void {
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (row[x] !== "." && c !== undefined) g.set(x + dx, y + dy, c);
    }
  });
}

type Edit = readonly (readonly [number, number, string])[];
function edit(art: Art, changes: Edit): Art {
  const rows = art.map((r) => [...r]);
  for (const [x, y, ch] of changes) if (rows[y] && x >= 0 && x < rows[y].length) rows[y][x] = ch;
  return rows.map((r) => r.join(""));
}

function check(name: string, a: Art): Art {
  if (a.length !== H || a.some((r) => r.length !== W)) throw new Error(`breedFurnitureArt: ${name} 지도 크기가 ${W}×${H}가 아니에요`);
  return a;
}

/** 빈 줄로 위를 채워 H줄로 (지도는 펫이 있는 줄만 적는다) */
const pad = (name: string, top: number, rows: string[]): Art => check(name, [...Array(top).fill(".".repeat(W)), ...rows, ...Array(H - top - rows.length).fill(".".repeat(W))]);

// ════════════════════ 몸틀 (종류 × 방향) ════════════════════
// 머리(head)·몸(body) 지도 + 작은 움직임 고치기(Edit). 머리는 층이 따로라 고개 숙이기·들기는 머리 층만 옮긴다.

type View = {
  head: Art;
  body: Art;
  /** 눈 깜빡 */
  blink: Edit;
  /** 꼬리 끝 살랑 (몸 층) */
  tail: Edit;
  /** 하품 (머리 층: 눈 감고 입 크게) — 뒷모습은 귀 쫑긋 */
  yawn: Edit;
  /** 입 벌리기 (눈은 뜬 채: 야옹·왈) */
  mouth: Edit;
  /** 행복한 눈 ^^ */
  happy: Edit;
  /** 혀 빼꼼 */
  tongue: Edit;
  /** 가까운 앞발 들기 (몸 층) · 더 높이/앞으로 */
  paw: Edit;
  paw2: Edit;
  /** 반대쪽 앞발 들기 (꾹꾹이) */
  pawOther: Edit;
  /** 흘끔 (눈동자가 옆으로) */
  peek: Edit;
};

// ── 고양이: 방석 위 식빵 자세 (머리 8칸 · 몸 10칸) ──
const CAT_FRONT: View = {
  head: pad("cat front head", 4, [
    ".....r....r.....",
    "....ri....ir....",
    "....fhhzzhhf....",
    "....feffffef....",
    "....fbfnnfbf....",
    ".....fmmmmf.....",
  ]),
  body: pad("cat front body", 7, [
    "...hhhhhhhhhh...",
    "...ffffffffff...",
    "...fzffffffzf...",
    "...ffffccffff...",
    "...fzfppppfzfx..",
    "...llllllllllyt.",
    "....llllllll....",
  ]),
  // 감은 눈은 가로 두 칸 (뜬 눈과 같은 자리 한 칸이면 색이 같아 안 보인다)
  blink: [[4, 7, "q"], [5, 7, "q"], [10, 7, "q"], [11, 7, "q"]],
  tail: [[13, 11, "."], [14, 11, "x"], [14, 12, "y"], [13, 12, "y"]],
  yawn: [[4, 7, "q"], [5, 7, "q"], [10, 7, "q"], [11, 7, "q"], [7, 9, "k"], [8, 9, "k"], [6, 9, "d"], [9, 9, "d"], [7, 10, "d"], [8, 10, "d"]],
  mouth: [[7, 9, "k"], [8, 9, "k"]],
  happy: [[4, 7, "q"], [5, 7, "q"], [10, 7, "q"], [11, 7, "q"]],
  tongue: [[8, 10, "k"]],
  paw: [[9, 11, "c"], [8, 11, "c"], [12, 8, "p"], [13, 8, "p"], [12, 9, "f"]],
  paw2: [[9, 11, "c"], [8, 11, "c"], [13, 6, "p"], [13, 7, "p"], [12, 8, "f"], [12, 9, "f"]],
  pawOther: [[6, 11, "c"], [7, 11, "c"], [3, 8, "p"], [2, 8, "p"], [3, 9, "f"]],
  peek: [[5, 7, "f"], [4, 7, "e"], [10, 7, "f"], [9, 7, "e"]],
};

const CAT_SIDE: View = {
  head: pad("cat side head", 4, [
    "...r..r.........",
    "..ri.ri.........",
    "..fhhhhf........",
    "..feffff........",
    ".nmbffff........",
    "..mmfff.........",
  ]),
  body: pad("cat side body", 6, [
    "......hhhhh.....",
    ".....hhzhhzhh...",
    "....fffffffffff.",
    "....ffzffzfffff.",
    "...cffffffffffl.",
    "..ppcfffffffffl.",
    "....xtytytytyty.",
    ".....llllllllll.",
  ]),
  blink: [[3, 7, "q"], [4, 7, "q"]],
  tail: [[4, 12, "."], [5, 12, "x"]],
  yawn: [[3, 7, "q"], [4, 7, "q"], [2, 9, "k"], [1, 9, "d"], [3, 9, "d"]],
  mouth: [[2, 9, "k"], [1, 9, "d"]],
  happy: [[3, 7, "q"], [4, 7, "f"]],
  tongue: [[1, 9, "k"]],
  paw: [[2, 11, "."], [3, 11, "c"], [1, 10, "p"], [2, 10, "p"]],
  paw2: [[2, 11, "."], [3, 11, "c"], [0, 9, "p"], [0, 10, "p"], [1, 10, "c"], [2, 10, "c"]],
  pawOther: [[2, 11, "."], [2, 12, "p"]],
  peek: [[3, 7, "f"], [5, 7, "e"]],
};

const CAT_BACK: View = {
  head: pad("cat back head", 4, [
    ".....r....r.....",
    "....rr....rr....",
    "....fhhzzhhf....",
    "....ffzffzff....",
    "....ffffffff....",
    ".....ffffff.....",
  ]),
  body: pad("cat back body", 7, [
    "...hhhhhhhhhh...",
    "...ffffffffff...",
    "...fzffzzffzf...",
    "...ffffffffff...",
    "...fzffzzffzftx.",
    "...llllllllllyt.",
    "....llllllll....",
  ]),
  blink: [],
  tail: [[14, 11, "."], [14, 10, "x"], [13, 11, "t"]],
  // 뒷모습 하품 = 귀 쫑긋 (귀 끝이 한 칸 바깥으로)
  yawn: [[5, 4, "."], [4, 4, "r"], [10, 4, "."], [11, 4, "r"]],
  mouth: [[5, 4, "."], [4, 4, "r"]],
  happy: [[5, 4, "."], [4, 4, "r"], [10, 4, "."], [11, 4, "r"]],
  tongue: [],
  paw: [[13, 7, "p"], [13, 6, "p"]],
  paw2: [[13, 5, "p"], [13, 6, "p"], [13, 7, "f"]],
  pawOther: [[2, 7, "p"], [2, 6, "p"]],
  peek: [[5, 4, "."], [4, 4, "r"]],
};

// ── 귀 선 개(시바·백구·코기·포메): 엎드려 앞발 뻗은 자세 (스핑크스) ──
const DOG_FRONT: View = {
  head: pad("dog front head", 3, [
    ".....r....r.....",
    "....ri....ir....",
    "....rhhhhhhr....",
    "....feffffef....",
    "....fwwnnwwf....",
    ".....wmmmmw.....",
    "......wwww......",
  ]),
  body: pad("dog front body", 7, [
    "...hhhhhhhhhh...",
    "...ffffffffff...",
    "...ffffffffff...",
    "...ffccccccff...",
    "...pplcccclpp...",
    "...pplllllllpp..",
    "....llllllll....",
  ]),
  blink: [[4, 6, "q"], [5, 6, "q"], [10, 6, "q"], [11, 6, "q"]],
  tail: [],
  yawn: [[4, 6, "q"], [5, 6, "q"], [10, 6, "q"], [11, 6, "q"], [7, 8, "k"], [8, 8, "k"], [7, 9, "d"], [8, 9, "d"]],
  mouth: [[7, 8, "k"], [8, 8, "k"]],
  happy: [[4, 6, "q"], [5, 6, "q"], [10, 6, "q"], [11, 6, "q"]],
  tongue: [[8, 9, "k"], [8, 10, "k"]],
  paw: [[11, 11, "."], [12, 11, "."], [11, 12, "l"], [12, 12, "l"], [13, 12, "."], [12, 8, "p"], [13, 8, "p"], [12, 9, "f"]],
  paw2: [[11, 11, "."], [12, 11, "."], [11, 12, "l"], [12, 12, "l"], [13, 12, "."], [13, 6, "p"], [13, 7, "p"], [12, 8, "f"], [12, 9, "f"]],
  pawOther: [[3, 11, "."], [4, 11, "."], [3, 12, "l"], [4, 12, "l"], [3, 8, "p"], [2, 8, "p"], [3, 9, "f"]],
  peek: [[5, 6, "f"], [4, 6, "e"], [10, 6, "f"], [9, 6, "e"]],
};

const DOG_SIDE: View = {
  head: pad("dog side head", 3, [
    "...r..r.........",
    "..ri.ri.........",
    "..rhhhf.........",
    "..fefff.........",
    "nwwbfff.........",
    ".wwwff..........",
    "..ww............",
  ]),
  body: pad("dog side body", 6, [
    "......hhhhhh....",
    ".....hffffffh...",
    "....fffffffffft.",
    "....cffffffffff.",
    "...ccffffffffff.",
    "ppwwcfffffffff..",
    "pplllllllllll...",
    "...lllllllll....",
  ]),
  blink: [[3, 6, "q"], [4, 6, "q"]],
  tail: [[14, 8, "."], [14, 7, "t"], [15, 6, "t"]],
  yawn: [[3, 6, "q"], [4, 6, "q"], [1, 8, "k"], [0, 8, "d"]],
  mouth: [[1, 8, "k"], [0, 8, "d"]],
  happy: [[3, 6, "q"], [4, 6, "q"]],
  tongue: [[1, 9, "k"], [1, 8, "k"]],
  paw: [[0, 11, "."], [1, 11, "."], [0, 12, "."], [1, 12, "."], [0, 9, "p"], [1, 9, "p"], [2, 10, "w"]],
  paw2: [[0, 11, "."], [1, 11, "."], [0, 12, "."], [1, 12, "."], [0, 8, "p"], [0, 9, "p"], [1, 10, "w"], [2, 10, "w"]],
  pawOther: [[0, 12, "."], [1, 12, "."], [0, 10, "p"], [1, 10, "p"]],
  peek: [[3, 6, "f"], [5, 6, "e"]],
};

const DOG_BACK: View = {
  head: pad("dog back head", 3, [
    ".....r....r.....",
    "....rr....rr....",
    "....rhhhhhhr....",
    "....ffffffff....",
    "....ffffffff....",
    ".....ffffff.....",
  ]),
  body: pad("dog back body", 7, [
    "...hhhhhhhhhh...",
    "...ffffffffff...",
    "...ffffffffff...",
    "...ffffffffff...",
    "...lffffffffl...",
    "..pplllllllpp...",
    "....llllllll....",
  ]),
  blink: [],
  // 뒷모습 숨: 등의 밝은 띠가 한 줄 내려간다 (등이 부풀었다 가라앉는 것처럼)
  tail: [...[4, 5, 6, 7, 8, 9, 10, 11].map((x) => [x, 7, "f"] as const), ...[4, 5, 6, 7, 8, 9, 10, 11].map((x) => [x, 8, "h"] as const)],
  yawn: [[5, 3, "."], [4, 3, "r"], [10, 3, "."], [11, 3, "r"]],
  mouth: [[5, 3, "."], [4, 3, "r"]],
  happy: [[5, 3, "."], [4, 3, "r"], [10, 3, "."], [11, 3, "r"]],
  tongue: [],
  paw: [[13, 7, "p"], [13, 6, "p"]],
  paw2: [[13, 5, "p"], [13, 6, "p"], [13, 7, "f"]],
  pawOther: [[2, 7, "p"], [2, 6, "p"]],
  peek: [[5, 3, "."], [4, 3, "r"]],
};

// ── 귀 늘어진 개(비숑·닥스훈트): 엎드린 자세, 귀가 볼 옆으로 ──
const FLOP_FRONT: View = {
  ...DOG_FRONT,
  head: pad("flop front head", 3, [
    "......hhhh......",
    ".....hffffh.....",
    "....hffffffh....",
    "...rfeffffefr...",
    "...rfbfnnfbfr...",
    "...rrfmmmmfrr...",
    "......mmmm......",
  ]),
  blink: [[4, 6, "q"], [5, 6, "q"], [10, 6, "q"], [11, 6, "q"]],
  yawn: [[4, 6, "q"], [5, 6, "q"], [10, 6, "q"], [11, 6, "q"], [7, 8, "k"], [8, 8, "k"], [7, 9, "k"], [8, 9, "d"]],
  mouth: [[7, 8, "k"], [8, 8, "k"]],
  happy: [[4, 6, "q"], [5, 6, "q"], [10, 6, "q"], [11, 6, "q"]],
  tongue: [[8, 9, "k"], [8, 10, "k"]],
  peek: [[5, 6, "f"], [4, 6, "e"], [10, 6, "f"], [9, 6, "e"]],
};

const FLOP_SIDE: View = {
  ...DOG_SIDE,
  head: pad("flop side head", 3, [
    "...hhhh.........",
    "..hffffh........",
    "..fefrrf........",
    "nmmbfrrf........",
    ".mmdrrf.........",
    "....rr..........",
  ]),
  blink: [[3, 5, "q"], [2, 5, "q"]],
  yawn: [[3, 5, "q"], [2, 5, "q"], [1, 7, "k"], [2, 7, "k"]],
  mouth: [[1, 7, "k"], [2, 7, "k"]],
  happy: [[3, 5, "q"], [2, 5, "q"]],
  tongue: [[1, 8, "k"]],
  peek: [[3, 5, "f"], [4, 5, "e"]],
};

const FLOP_BACK: View = {
  ...DOG_BACK,
  head: pad("flop back head", 3, [
    "......hhhh......",
    ".....hffffh.....",
    "....hffffffh....",
    "...rffffffffr...",
    "...rrffffffrr...",
    "....r......r....",
  ]),
  yawn: [[3, 8, "."], [3, 7, "r"], [12, 8, "."], [12, 7, "r"]],
  mouth: [[3, 8, "."], [3, 7, "r"]],
  happy: [[3, 8, "."], [3, 7, "r"], [12, 8, "."], [12, 7, "r"]],
  peek: [[3, 8, "."], [3, 7, "r"]],
};

type Kind = "cat" | "dog" | "flop";
const VIEWS: Record<Kind, readonly [View, View, View]> = {
  cat: [CAT_FRONT, CAT_SIDE, CAT_BACK],
  dog: [DOG_FRONT, DOG_SIDE, DOG_BACK],
  flop: [FLOP_FRONT, FLOP_SIDE, FLOP_BACK],
};

// ════════════════════ 잠자리 (방석·바구니·상자…) ════════════════════
// 뒤(펫 아래·뒤에 깔리는 부분)·앞(펫 배를 덮는 앞 테)을 나눠 그린다 → 펫이 쏙 들어앉은 것처럼.

type Bed = { back: (g: Grid) => void; front: (g: Grid) => void };
const BX = 8;
const BY = H - 5;

/** 둥근 방석: 위가 밝은 테 + 오목한 자리, 앞 테에 무늬 */
function roundBed(main: Color, light: Color, deep: Color, motif: (x: number, y: number) => Color | null, rx = 7.4, ry = 4.4): Bed {
  return {
    back: (g) => {
      g.ellipse(BX, BY, rx, ry, main);
      g.recolor((_x, y) => y <= BY - 2.5, light);
      g.ellipse(BX, BY + 0.2, rx - 2, ry - 1.8, deep);
    },
    front: (g) => {
      const top = BY + 1;
      for (let y = top; y < H; y++)
        for (let x = 0; x < W; x++) {
          const dx = (x + 0.5 - BX) / rx;
          const dy = (y + 0.5 - BY) / ry;
          if (dx * dx + dy * dy > 1) continue;
          let c = y === top ? light : main;
          const m = y > top ? motif(x, y) : null;
          if (m !== null) c = m;
          if (y >= top + 3 && (x + y) % 2 === 0) c = darken(main, 0.22);
          g.set(x, y, c);
        }
    },
  };
}

/** 네모 상자 (택배 상자): 뒷벽 윗변이 펫 뒤로, 앞벽이 배를 가린다 */
function boxBed(): Bed {
  const kraft = 0xc8955a;
  const kraftL = 0xdcae74;
  const kraftD = 0x9a6c3c;
  const tape = 0xe8d6a8;
  return {
    back: (g) => {
      g.rect(1, BY - 4, 14, 3, kraftD); // 안쪽 그늘
      g.hline(1, 14, BY - 5, kraftL); // 뒷벽 윗변
      g.set(0, BY - 6, kraftL); // 날개
      g.set(15, BY - 6, kraftL);
      g.rect(0, BY - 5, 1, 4, kraft);
      g.rect(15, BY - 5, 1, 4, kraft);
    },
    front: (g) => {
      g.rect(0, BY - 1, 16, H - BY + 1, kraft);
      g.hline(0, 15, BY - 1, kraftL);
      g.rect(6, BY, 4, H - BY - 1, tape); // 테이프
      g.hline(0, 15, H - 1, kraftD);
      g.set(2, BY + 2, 0x6a4a2a); // 「↑」 표시
      g.set(2, BY + 1, 0x6a4a2a);
      g.set(13, BY + 2, 0x6a4a2a);
      g.hline(12, 14, BY + 1, 0x6a4a2a);
    },
  };
}

/** 키보드 (야근 턱시도): 납작한 판 + 키 줄 */
function keyboardBed(): Bed {
  const base = 0x4a4e5a;
  const key = 0xd8dce4;
  const keyD = 0xa8acb8;
  return {
    back: (g) => {
      g.rect(0, BY - 3, 16, 4, base);
      for (let y = BY - 2; y <= BY; y += 2) for (let x = 1; x < 15; x += 2) g.set(x, y, keyD);
    },
    front: (g) => {
      g.rect(0, BY + 1, 16, H - BY - 1, base);
      for (let y = BY + 1; y < H - 1; y += 2) for (let x = 1 + ((y >> 1) & 1); x < 15; x += 2) g.set(x, y, key);
      g.rect(4, H - 2, 8, 1, key); // 스페이스바
      g.hline(0, 15, H - 1, darken(base, 0.4));
      g.set(14, BY + 1, 0x7ad87a); // 불빛
    },
  };
}

const PLAIN = () => null;
const BEDS = {
  box: boxBed(),
  keyboard: keyboardBed(),
  /** 민트 뜨개 방석 */
  knit: roundBed(0x6aa898, 0x8cc4b4, 0x4a8070, (x, y) => ((x + (y & 1)) % 3 === 0 ? 0x5a9484 : null)),
  /** 라탄 바구니 */
  basket: roundBed(0xb8864a, 0xd4a464, 0x7a5430, (x, y) => ((x + y) % 2 === 0 ? 0x9a6c38 : null), 7.6, 4.6),
  /** 보라 벨벳 쿠션 + 금술 */
  velvet: (() => {
    const b = roundBed(0x6a4a8a, 0x8a68aa, 0x4a3266, PLAIN);
    return {
      back: b.back,
      front: (g: Grid) => {
        b.front(g);
        g.set(1, BY + 2, 0xe8c050);
        g.set(14, BY + 2, 0xe8c050);
        g.set(1, BY + 3, 0xc89a30);
        g.set(14, BY + 3, 0xc89a30);
      },
    } as Bed;
  })(),
  /** 커피콩 자루 */
  sack: roundBed(0xc0a070, 0xd8bc8a, 0x8a6e48, (x, y) => (y === BY + 2 && x >= 6 && x <= 9 ? (x === 7 || x === 8 ? 0x5a3a20 : 0x7a5432) : null), 7.6, 4.4),
  /** 한국 방석 (자주 비단 + 남색 테) */
  bangseok: roundBed(0xb04a6a, 0xd06a88, 0x8a3050, (x, y) => (y === BY + 1 || x === 1 || x === 14 ? 0x34507a : null), 7.8, 4.2),
  /** 현관 매트 (줄무늬) */
  doormat: roundBed(0x8a6a48, 0xa88a62, 0x6a4e32, (_x, y) => (y % 2 === 0 ? 0xb89a6a : null), 7.8, 4),
  /** 노랑 둥근 개 침대 */
  dogbed: roundBed(0xe8b84a, 0xf6d070, 0xb8862a, (x) => (x % 4 === 1 ? 0xf8e0a0 : null)),
  /** 분홍 구름 방석 */
  cloud: roundBed(0xf0b8c8, 0xfcd8e2, 0xd890a8, (x, y) => (hash2(x, y, 7) < 0.18 ? 0xffffff : null)),
  /** 하늘색 솜 담요 */
  blanket: roundBed(0x8ab8e0, 0xaed2f2, 0x6a94c0, (x, y) => ((x + y) % 4 === 0 ? 0xc8e2f8 : null)),
  /** 빨강 체크 담요 */
  plaid: roundBed(0xb84a3a, 0xd46a50, 0x8a3428, (x, y) => (x % 4 === 2 || y === BY + 3 ? 0xe8d0a0 : null)),
} satisfies Record<string, Bed>;
type BedKind = keyof typeof BEDS;

// ════════════════════ 품종 ════════════════════

type React = "nod" | "groom" | "yawn" | "punch" | "knead" | "meow" | "sulk" | "paw" | "sploot" | "bark" | "shake" | "beg";

type Breed = {
  kind: Kind;
  pal: Pal;
  line: Color;
  bed: BedKind;
  react: React;
  /** 품종 생김새 고치기 (방향마다 머리·몸 지도에) */
  shape?: (dir: number, layer: "head" | "body", a: Art) => Art;
};

function catPal(o: Pal & { f: Color; h: Color; l: Color }): Pal {
  return { c: o.f, m: o.f, p: o.f, t: o.f, y: o.f, x: o.f, r: o.f, z: o.f, i: mix(o.f, PINK, 0.45), e: EYE, q: EYE, n: 0xe88a9a, b: BLUSH, k: TONGUE, d: 0x5a2a2a, ...o };
}
function dogPal(o: Pal & { f: Color; h: Color; l: Color }): Pal {
  return { c: o.f, m: o.f, w: o.f, v: o.l, p: o.f, t: o.f, y: o.f, x: o.f, r: o.f, i: mix(o.f, PINK, 0.4), e: EYE, q: EYE, n: 0x2a1a14, b: BLUSH, k: TONGUE, d: 0x5a2a20, ...o };
}

/** 지도에서 글자 바꾸기 (조건 맞는 칸만) */
const recolor = (a: Art, test: (ch: string, x: number, y: number) => string | null): Art => a.map((r, y) => [...r].map((ch, x) => (ch === "." ? ch : (test(ch, x, y) ?? ch))).join(""));

/** 삼색이 얼룩: 머리 위 주황·검정 반반, 몸 왼쪽 주황·오른쪽 검정 덩이, 꼬리 검정에 끝만 주황 */
const calicoShape: Breed["shape"] = (dir, layer, a) =>
  recolor(a, (ch, x, y) => {
    if (ch === "t" || ch === "y") return "u";
    if (ch === "x") return "o";
    if (ch !== "f" && ch !== "h" && ch !== "z") return null;
    if (layer === "head") {
      if (y > 6) return null;
      if (dir === 1) return x >= 5 ? "u" : "o";
      return x <= 7 ? "o" : "u";
    }
    if (dir === 1) return x >= 11 ? "u" : x >= 6 && x <= 9 && y <= 9 ? "o" : null;
    return x <= 6 && y <= 10 ? "o" : x >= 9 && y >= 9 ? "u" : null;
  });

/** 샴 얼굴 가면: 눈·코·주둥이 둘레 진하게, 한 칸 더 바깥 중간 톤 (앞·옆). 귀·발·꼬리는 팔레트에서 진하게 */
const siamShape: Breed["shape"] = (dir, layer, a) => {
  if (layer !== "head" || dir === 2) return a;
  const pts: [number, number][] = [];
  a.forEach((r, y) => [...r].forEach((ch, x) => (ch === "e" || ch === "n" || ch === "m") && pts.push([x, y])));
  return recolor(a, (ch, x, y) => {
    if (ch !== "f" && ch !== "h" && ch !== "z" && ch !== "b") return null;
    const d = Math.min(...pts.map(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y))));
    return d <= 1 ? "u" : d === 2 ? "o" : null;
  });
};

/** 턱시도: 앞모습은 미간에 흰 줄 */
const tuxShape: Breed["shape"] = (dir, layer, a) => (layer === "head" && dir === 0 ? edit(a, [[7, 7, "m"], [8, 7, "m"]]) : a);

/** 등에 말린 꼬리: 앞 = 오른쪽 어깨 너머 빼꼼 · 옆 = 엉덩이 위 고리 · 뒤 = 허리에 얹은 고리. ring = 가운데가 뚫린 고리(백구) */
const curlTail = (dir: number, a: Art, ring: boolean): Art => {
  if (dir === 0) return edit(a, [[12, 6, "t"], [13, 6, "t"], [13, 7, ring ? "t" : "w"], [13, 5, "t"]]);
  if (dir === 1)
    return edit(a, [
      [14, 8, "."],
      [11, 4, "t"],
      [12, 4, "t"],
      [10, 5, "t"],
      [11, 5, ring ? "." : "w"],
      [12, 5, ring ? "." : "w"],
      [13, 5, "t"],
      [13, 6, "t"],
    ]);
  return edit(a, [
    [7, 9, "t"],
    [8, 9, "t"],
    [6, 10, "t"],
    [7, 10, ring ? "o" : "w"],
    [8, 10, ring ? "o" : "w"],
    [9, 10, "t"],
    [7, 11, "t"],
    [8, 11, "t"],
  ]);
};
const shibaShape: Breed["shape"] = (dir, layer, a) => (layer === "body" ? curlTail(dir, a, false) : dir === 0 ? edit(a, [[5, 5, "w"], [10, 5, "w"]]) : a);
const jindoShape: Breed["shape"] = (dir, layer, a) => (layer === "body" ? curlTail(dir, a, true) : a);

/** 코기: 귀가 크다 (한 칸 더 위로) · 흰 이마 줄 · 꼬리 없이 하얀 궁둥이 */
const corgiShape: Breed["shape"] = (dir, layer, a) => {
  if (layer === "head") {
    if (dir === 0) return edit(a, [[5, 2, "r"], [10, 2, "r"], [4, 3, "r"], [11, 3, "r"], [7, 5, "w"], [8, 5, "w"], [7, 6, "w"], [8, 6, "w"]]);
    if (dir === 1) return edit(a, [[3, 2, "r"], [6, 2, "r"]]);
    return edit(a, [[5, 2, "r"], [10, 2, "r"], [4, 3, "r"], [11, 3, "r"], [7, 5, "w"], [8, 5, "w"]]);
  }
  if (dir === 1) return edit(a, [[14, 8, "w"], [14, 9, "w"], [14, 10, "w"], [13, 10, "w"]]);
  if (dir === 2) return edit(a, [[6, 11, "w"], [7, 11, "w"], [8, 11, "w"], [9, 11, "w"], [7, 10, "w"], [8, 10, "w"]]);
  return a;
};

/** 포메: 볼 갈기 · 깃털 꼬리가 등 위로 펼쳐진다 */
const pomShape: Breed["shape"] = (dir, layer, a) => {
  if (layer === "head") return dir === 0 ? edit(a, [[3, 7, "w"], [12, 7, "w"], [3, 8, "w"], [12, 8, "w"], [4, 9, "w"], [11, 9, "w"]]) : dir === 1 ? edit(a, [[6, 8, "w"], [5, 9, "w"], [4, 9, "w"]]) : a;
  if (dir === 0) return edit(a, [[12, 5, "x"], [13, 5, "t"], [13, 6, "t"], [14, 6, "x"], [14, 7, "t"], [2, 9, "f"], [13, 9, "f"]]);
  if (dir === 1) return edit(a, [[14, 8, "."], [10, 4, "x"], [11, 4, "x"], [12, 4, "t"], [10, 5, "t"], [11, 5, "t"], [12, 5, "t"], [13, 5, "x"], [13, 6, "t"]]);
  return edit(a, [[6, 9, "x"], [7, 9, "t"], [8, 9, "t"], [9, 9, "x"], [7, 10, "x"], [8, 10, "t"], [2, 9, "f"], [13, 9, "f"]]);
};

/** 비숑: 머리가 동그란 솜뭉치 (위로 한 칸 부풀림), 꼬리 폼폼 */
const bichonShape: Breed["shape"] = (dir, layer, a) => {
  if (layer === "head") return dir === 1 ? edit(a, [[2, 2, "h"], [7, 4, "h"]]) : edit(a, [[5, 2, "h"], [10, 2, "h"], [6, 2, "h"], [9, 2, "h"]]);
  if (dir === 1) return edit(a, [[14, 8, "."], [14, 7, "h"], [15, 8, "h"]]);
  if (dir === 2) return edit(a, [[7, 10, "h"], [8, 10, "h"], [7, 9, "h"], [8, 9, "h"]]);
  return a;
};

/** 닥스훈트: 긴 주둥이 · 옆은 몸이 길게 · 뒤는 몸통이 넓게 */
const dachsShape: Breed["shape"] = (dir, layer, a) => {
  if (layer === "head") return dir === 0 ? edit(a, [[7, 7, "m"], [8, 7, "m"], [7, 9, "n"], [8, 9, "n"]]) : dir === 1 ? edit(a, [[0, 7, "m"], [0, 6, "m"]]) : a;
  if (dir === 1) return edit(a, [[14, 8, "."], [15, 9, "f"], [15, 10, "f"], [15, 11, "l"], [15, 8, "t"]]);
  if (dir === 2) return edit(a, [[2, 9, "f"], [13, 9, "f"], [2, 10, "f"], [13, 10, "f"]]);
  return a;
};

const BREEDS: Record<string, Breed> = {
  cheese: { kind: "cat", bed: "box", react: "nod", line: 0x6a3410, pal: catPal({ f: 0xf2a84a, h: 0xf8c878, l: 0xd4863a, z: 0xd8742a, y: 0xd8742a, x: 0xd8742a, c: 0xfff4e2, m: 0xfff4e2, p: 0xfff4e2 }) },
  mackerel: { kind: "cat", bed: "knit", react: "groom", line: 0x2a2622, pal: catPal({ f: 0x9a948a, h: 0xb8b2a6, l: 0x7a746a, z: 0x3e3a36, y: 0x3e3a36, x: 0x3e3a36, c: 0xe2dccf, m: 0xe2dccf, p: 0xf0ebe0, r: 0x6e685e }) },
  tux: { kind: "cat", bed: "keyboard", react: "yawn", line: 0x0e0c10, shape: tuxShape, pal: catPal({ f: 0x302e38, h: 0x5a586c, l: 0x1e1c22, c: 0xfbf8f2, m: 0xfbf8f2, p: 0xfbf8f2, i: 0xc87888, n: 0xd87a8a, e: 0xe8c840, q: 0x8a8a96 }) },
  calico: { kind: "cat", bed: "basket", react: "punch", line: 0x3a2c22, shape: calicoShape, pal: catPal({ f: 0xfbf6ec, h: 0xffffff, l: 0xe6dccc, o: 0xe8902a, u: 0x34302c, r: 0x34302c, i: 0x8a6a5a }) },
  blue: { kind: "cat", bed: "velvet", react: "knead", line: 0x2a3242, pal: catPal({ f: 0x8a9ab0, h: 0xaebcd0, l: 0x6a7a90, r: 0x7a8aa0, i: 0xc8a0b0, e: 0x3ab06a, n: 0x6a6a7a, p: 0x7a8aa0 }) },
  siam: { kind: "cat", bed: "sack", react: "meow", line: 0x3a2418, shape: siamShape, pal: catPal({ f: 0xf6ead4, h: 0xfff6e6, l: 0xe2d0b2, c: 0xfff6e6, m: 0x5a3a2a, u: 0x5a3a2a, o: 0xc0a080, r: 0x4a2e22, i: 0x8a5a4a, p: 0x5a3a2a, t: 0x5a3a2a, y: 0x5a3a2a, x: 0x3e2618, e: 0x3a8ae8, n: 0x2e1c14, b: 0x7a4e3a }) },
  shiba: { kind: "dog", bed: "bangseok", react: "sulk", line: 0x5a2c10, shape: shibaShape, pal: dogPal({ t: 0xeea460, f: 0xd8803a, h: 0xe89a52, l: 0xb8642a, w: 0xfaecd2, c: 0xfaecd2, m: 0xfaecd2, v: 0xe6d2b2, p: 0xfaecd2, r: 0xc8702e, i: 0xf6d8c0 }) },
  jindo: { kind: "dog", bed: "doormat", react: "paw", line: 0x5a4a3a, shape: jindoShape, pal: dogPal({ o: 0xdcd0b8, t: 0xeee4d0, f: 0xf8f2e4, h: 0xffffff, l: 0xdcd0b8, v: 0xd0c4aa, w: 0xfffaf0, c: 0xfffaf0, m: 0xfffaf0, r: 0xf0e6d2, i: 0xf2b8b8, p: 0xfffaf0, b: 0xf8c8c8 }) },
  corgi: { kind: "dog", bed: "dogbed", react: "sploot", line: 0x5a2e10, shape: corgiShape, pal: dogPal({ f: 0xe8943e, h: 0xf4b064, l: 0xc8762a, w: 0xfff8ec, c: 0xfff8ec, m: 0xfff8ec, v: 0xe2d6c2, r: 0xd88434, i: 0xf6c8b4, p: 0xfff8ec }) },
  pom: { kind: "dog", bed: "cloud", react: "bark", line: 0x6a3410, shape: pomShape, pal: dogPal({ f: 0xec9844, h: 0xf6b464, l: 0xcc7830, w: 0xfde6b8, c: 0xfde6b8, m: 0xfde6b8, v: 0xcc7830, t: 0xfbcf8e, x: 0xfff2d6, r: 0xe0903e, i: 0xf6c4a8, p: 0xfde6b8, d: 0x8a4a2a }) },
  bichon: { kind: "flop", bed: "blanket", react: "shake", line: 0x6e6058, shape: bichonShape, pal: dogPal({ f: 0xfdfaf4, h: 0xffffff, l: 0xe8dccb, v: 0xd8ccbc, w: 0xfdfaf4, c: 0xfdfaf4, m: 0xfdfaf4, r: 0xf2e2c8, e: 0x1e1814, q: 0x1e1814, n: 0x1e1814, p: 0xf2ece0, b: 0xf8c4c8, d: 0x8a4a4a }) },
  dachs: { kind: "flop", bed: "plaid", react: "beg", line: 0x3a1a0a, shape: dachsShape, pal: dogPal({ f: 0xb05a2c, h: 0xd8864c, l: 0x8a4220, v: 0x7a3a1c, x: 0x8a4220, r: 0x7a3418, c: 0xc46a38, m: 0xc06836, w: 0xc46a38, p: 0x9a4c26, n: 0x1e120c }) },
};

/** 동작 장면 (p1·p2): [머리 고치기, 몸 고치기, 머리 dx·dy, 펫 전체 dx·dy] */
type Pose = { head: Edit; body: Edit; hdy?: number; dx?: number; dy?: number };
function reactPose(v: View, r: React, k: 1 | 2): Pose {
  switch (r) {
    case "nod": // 식빵 굽다 꾸벅: 눈 반쯤 → 고개 푹 + 감은 눈
      // 뒷모습은 감을 눈이 없어 귀를 쫑긋
      return k === 1 ? { head: v.blink.length ? v.blink : v.yawn, body: [] } : { head: v.blink, body: [], hdy: 1 };
    case "groom": // 앞발 핥기 → 문지르기
      return k === 1 ? { head: [...v.blink, ...v.tongue], body: v.paw } : { head: v.blink, body: v.paw2 };
    case "yawn":
      return k === 1 ? { head: v.mouth, body: [] } : { head: v.yawn, body: v.tail, hdy: -1 };
    case "punch": // 냥냥펀치: 들고 → 앞으로
      return k === 1 ? { head: [], body: v.paw } : { head: v.mouth, body: v.paw2 };
    case "knead": // 꾹꾹이: 눈 감고 앞발 번갈아
      return k === 1 ? { head: v.happy, body: v.paw } : { head: v.happy, body: v.pawOther };
    case "meow":
      return k === 1 ? { head: v.mouth, body: [], hdy: -1 } : { head: [...v.mouth, ...v.happy], body: v.tail, hdy: -1 };
    case "sulk": // 납작 버티기 → 흘끔
      return k === 1 ? { head: v.blink, body: [], hdy: 2 } : { head: v.peek, body: v.tail, hdy: 2 };
    case "paw": // 손!
      return k === 1 ? { head: [], body: v.paw } : { head: [...v.happy, ...v.tongue], body: v.paw2 };
    case "sploot": // 납작 + 귀 까딱
      return k === 1 ? { head: v.happy, body: [], hdy: 1, dy: 1 } : { head: [...v.happy, ...v.tongue, ...v.yawn.filter(([, y]) => y <= 3)], body: [], hdy: 1, dy: 1 };
    case "bark": // 폴짝 왈
      return k === 1 ? { head: v.mouth, body: [], dy: -2 } : { head: v.mouth, body: v.tail, dy: 0 };
    case "shake": // 부르르 (좌우로)
      return k === 1 ? { head: v.happy, body: [], dx: -1 } : { head: v.happy, body: [], dx: 1 };
    case "beg": // 고개 들고 앞발 모아 조르기
      return k === 1 ? { head: v.happy, body: v.paw, hdy: -1, dy: -1 } : { head: [...v.happy, ...v.tongue], body: [...v.paw, ...v.pawOther], hdy: -1, dy: -1 };
  }
}

// ════════════════════ 그리기 ════════════════════

/**
 * 11/20 옆모습 줄이기 (사용자 「가구를 옆으로 돌리면 잘린다」): 옆모습 펫은 코끝·앞발(개는 x 0)부터 엉덩이·꼬리(x 14~15)까지
 * 칸 16칸을 꽉 채워, 테가 칸 밖으로 나가 잘리거나 엉덩이가 칸 끝에 곧게 붙어 잘린 듯 보였다 (앞·뒷모습은 가운데 10~12칸이라 멀쩡).
 * 무늬·동작 고치기를 다 얹은 뒤 몸 가운데 두 줄(세로)을 빼고 오른쪽으로 한 칸 옮겨 좌우에 한 칸씩 비운다 (머리·꼬리·발 모양은 그대로).
 * 뺄 줄 = 머리가 없고 무늬가 고른 몸통 가운데 (고양이 줄무늬·개 등에 말린 꼬리를 피했다)
 */
const SIDE_CUT: Readonly<Record<Kind, readonly number[]>> = { cat: [11, 12], dog: [8, 9], flop: [8, 9] };
function slimSide(a: Art, cut: readonly number[]): Art {
  return a.map((r) => "." + [...r].filter((_, x) => !cut.includes(x)).join("") + ".".repeat(cut.length - 1));
}

/**
 * 품종 펫 가구 한 장을 g(16 × 20)에 그린다 (테두리 OUT은 art.ts furnitureGrid가 맨 마지막에 두른다).
 * 변형 토큰: d1(옆)·d2(뒤) · b1 숨(깜빡·꼬리) · y1 하품 · p1·p2 쓰다듬기 동작. art.ts 변형 이름처럼 "-"로 잇는다
 */
export function drawBreedFurniture(g: Grid, breed: string, variant = ""): void {
  const b = BREEDS[breed];
  if (!b) throw new Error(`breedFurnitureArt: 모르는 품종 ${breed}`);
  const tok = variant.split("-");
  const d = Number(tok.find((t) => /^d[0-3]$/.test(t))?.slice(1) ?? 0);
  const dir = d === 3 ? 1 : d; // 오른쪽은 옆모습을 뒤집는다 (shownItemGrid)
  const v = VIEWS[b.kind][dir];
  let head = b.shape ? b.shape(dir, "head", v.head) : v.head;
  let body = b.shape ? b.shape(dir, "body", v.body) : v.body;
  let hdy = 0;
  let dx = 0;
  let dy = 0;
  if (tok.includes("b1")) {
    head = edit(head, v.blink);
    body = edit(body, v.tail);
  } else if (tok.includes("y1")) head = edit(head, v.yawn);
  const pk = tok.includes("p2") ? 2 : tok.includes("p1") ? 1 : 0;
  if (pk) {
    const p = reactPose(v, b.react, pk);
    head = edit(head, p.head);
    body = edit(body, p.body);
    hdy = p.hdy ?? 0;
    dx = p.dx ?? 0;
    dy = p.dy ?? 0;
  }
  if (dir === 1) {
    head = slimSide(head, SIDE_CUT[b.kind]);
    body = slimSide(body, SIDE_CUT[b.kind]);
  }
  const bed = BEDS[b.bed];
  bed.back(g);
  // 펫: 몸 → 머리 (층마다 짙은 털색 테)
  const seam = mix(b.pal.l ?? b.pal.f!, b.line, 0.6);
  const layer = (arts: readonly [Art, number][], line: Color, alpha: number) => {
    const one = new Grid(W, H);
    for (const [a, oy] of arts) paint(one, a, b.pal, dx, dy + oy);
    one.outline(line, false, alpha);
    g.draw(one, 0, 0);
  };
  if (dir === 2) {
    // 뒷모습: 뒤통수와 등이 이어져 보이게 한 층으로 (경계 테가 등을 가로지르지 않게)
    layer([[body, 0], [head, hdy]], b.line, 220);
  } else {
    layer([[body, 0]], b.line, 220);
    layer([[head, hdy]], seam, 210);
  }
  bed.front(g);
}

/** 테두리까지 두른 한 장 (시안·테스트용 — 게임은 art.ts furnitureGrid를 거친다) */
export function breedFurnitureGrid(breed: string, variant = ""): Grid {
  const g = new Grid(W, H);
  drawBreedFurniture(g, breed, variant);
  g.outline(OUT, false, 170);
  return g;
}

// ════════════════════ 카탈로그 연결 (lib/housing/catalog.ts nap_*) ════════════════════

/** 가구 id → 품종 (그림 키) */
const NAP_BREED: Readonly<Record<string, string>> = {
  nap_cheese: "cheese",
  nap_godeung: "mackerel",
  nap_tuxedo: "tux",
  nap_calico: "calico",
  nap_russian: "blue",
  nap_siamese: "siam",
  nap_shiba: "shiba",
  nap_jindo: "jindo",
  nap_corgi: "corgi",
  nap_pom: "pom",
  nap_bichon: "bichon",
  nap_dachs: "dachs",
};
export const BREED_FURN_IDS: readonly string[] = Object.keys(NAP_BREED);
export const isBreedFurniture = (id: string): boolean => id in NAP_BREED;
/** 고양이 가구인지 (쓰다듬을 때 야옹 · 강아지는 한숨 소리) */
export const isCatFurniture = (id: string): boolean => BREEDS[NAP_BREED[id]]?.kind === "cat";

type Draw = (g: Grid, W: number, H: number, v: string) => void;
/** art.ts DRAW·SPIN_ART에 섞는 그림 (앞·옆·뒤 모두 같은 함수 — 변형의 d1·d2로 방향을 고른다) */
export const BREED_FURN_DRAW: Readonly<Record<string, Draw>> = Object.fromEntries(BREED_FURN_IDS.map((id) => [id, (g: Grid, _W: number, _H: number, v: string) => drawBreedFurniture(g, NAP_BREED[id], v)]));
export const BREED_FURN_SPIN: Readonly<Record<string, { side: Draw; back: Draw }>> = Object.fromEntries(BREED_FURN_IDS.map((id) => [id, { side: BREED_FURN_DRAW[id], back: BREED_FURN_DRAW[id] }]));
export const BREED_FURN_UP_MAP: Readonly<Record<string, number>> = Object.fromEntries(BREED_FURN_IDS.map((id) => [id, BREED_FURN_UP]));
/** 쓰다듬기 장면: p1 → (P1_MS 뒤) p2 → (P2_MS 뒤) 원래대로 */
export const BREED_PET_P1_MS = 420;
export const BREED_PET_P2_MS = 900;

// ════════════════════ 기존 잠자는 강아지·잠든 유령 고양이 옆·뒷모습 (11/19 네 방향으로) ════════════════════
// 앞모습은 art.ts 그대로. 같은 색·같은 방석(위에서 내려다본 둥근 방석이라 어느 방향이든 같다). 숨(b1)·꼬리 들썩(wag)도 같이.

const DOG = { fur: 0xd09a52, light: 0xe4b878, dark: 0xa8743a, ear: 0x94592c, cream: 0xf0d6a8, line: 0x4a3020, seam: 0x5e3a1e, bed: 0x3e5a78, bedL: 0x58789a, bedD: 0x2c425a, check: 0xb8a47e };

function dogBed(g: Grid, H: number, front: boolean): void {
  const oy = H - 18;
  const bx = 8;
  const by = oy + 13;
  if (!front) {
    g.ellipse(bx, by, 7.4, 4.2, DOG.bed);
    g.recolor((_x, y) => y <= by - 2.5, DOG.bedL);
    g.ellipse(bx, by + 0.2, 5.4, 2.6, DOG.bedD);
    return;
  }
  const top = oy + 15;
  for (let y = top; y < H; y++)
    for (let x = 0; x < 16; x++) {
      const dx = (x + 0.5 - bx) / 7.4;
      const dy = (y + 0.5 - by) / 4.2;
      if (dx * dx + dy * dy > 1) continue;
      let c = y === top ? DOG.bedL : DOG.bed;
      if (y > top && (x === 4 || x === 8 || x === 12 || y === top + 2)) c = DOG.check;
      if (y >= top + 3 && (x + y) % 2 === 0) c = DOG.bedD;
      g.set(x, y, c);
    }
}
function dogLayer(g: Grid, H: number, paint: (d: Grid) => void): void {
  const d = new Grid(16, H);
  paint(d);
  d.outline(DOG.seam);
  g.draw(d, 0, 0);
}

/** 잠자는 강아지 옆모습 (왼쪽을 봄): 앞발에 턱을 괴고 엎드려 자고, 몸은 뒤(오른쪽)로 둥글게, 꼬리는 엉덩이에서 앞으로 */
export function sleepyDogSide(g: Grid, _W: number, H: number, v: string): void {
  const tok = v.split("-");
  const breath = tok.includes("b1") ? 1 : 0;
  const wag = tok.includes("wag");
  const oy = H - 18;
  dogBed(g, H, false);
  dogLayer(g, H, (d) => {
    const cy = oy + 10.8 - breath * 0.5;
    const ry = 3.2 + breath * 0.5;
    d.ellipse(9.6, cy, 4.8, ry, DOG.fur);
    d.recolor((_x, y) => (y + 0.5 - cy) / ry < -0.5, DOG.light);
    d.recolor((x, y) => (y + 0.5 - cy) / ry > 0.2 && (x + y) % 2 === 0, DOG.dark);
    const ty = oy + 14;
    d.hline(9, 13, ty, DOG.fur);
    d.set(14, ty - 1, DOG.fur);
    d.set(9, wag ? ty - 1 : ty, DOG.cream);
  });
  dogLayer(g, H, (d) => {
    // 옆얼굴: 주둥이가 왼쪽, 늘어진 귀는 뒤통수 쪽
    d.ellipse(5, oy + 11.6, 2.8, 2.3, DOG.fur);
    d.recolor((_x, y) => y < oy + 10, DOG.light);
    d.rect(1, oy + 12, 3, 2, DOG.cream); // 주둥이
    d.set(1, oy + 12, DOG.line); // 코
    d.hline(3, 4, oy + 11, DOG.line); // 감은 눈
    d.hline(1, 4, oy + 14, DOG.cream); // 앞발
    d.vline(6, oy + 9, oy + 13, DOG.ear);
    d.vline(7, oy + 10, oy + 13, DOG.ear);
    d.set(6, oy + 13, DOG.dark);
  });
  dogBed(g, H, true);
}

/** 잠자는 강아지 뒷모습 (위를 봄): 둥글게 만 등 · 뒤통수와 늘어진 두 귀 · 꼬리는 오른쪽으로 감는다 */
export function sleepyDogBack(g: Grid, _W: number, H: number, v: string): void {
  const tok = v.split("-");
  const breath = tok.includes("b1") ? 1 : 0;
  const wag = tok.includes("wag");
  const oy = H - 18;
  dogBed(g, H, false);
  dogLayer(g, H, (d) => {
    const cy = oy + 11.2 - breath * 0.5;
    const ry = 3.4 + breath * 0.5;
    d.ellipse(8, cy, 5.6, ry, DOG.fur);
    d.recolor((_x, y) => (y + 0.5 - cy) / ry < -0.4, DOG.light);
    d.recolor((x, y) => (y + 0.5 - cy) / ry > 0.3 && (x + y) % 2 === 0, DOG.dark);
    // 뒤통수 (얼굴은 안 보인다) + 두 귀
    d.ellipse(8, oy + 9.2, 2.8, 2.2, DOG.fur);
    d.recolor((_x, y) => y < oy + 8.5, DOG.light);
    d.vline(5, oy + 8, oy + 11, DOG.ear);
    d.vline(11, oy + 8, oy + 11, DOG.ear);
    const ty = oy + 14;
    d.hline(10, 13, ty, DOG.fur);
    d.set(13, wag ? ty - 2 : ty - 1, DOG.cream);
  });
  dogBed(g, H, true);
}

const GHOST = { cushion: 0x8a3e4a, body: 0xd8e0f0, line: 0x4a5060 };

/** 잠든 유령 고양이 옆모습 (왼쪽을 봄): 방석 위 반투명 식빵, 귀 둘, 감은 눈, 꼬리는 뒤로 */
export function ghostCatSide(g: Grid, _W: number, H: number): void {
  g.ellipse(8, H - 5, 7, 4, GHOST.cushion);
  g.ellipse(9, H - 8, 5, 3.6, GHOST.body, 200);
  g.ellipse(4.8, H - 9.4, 2.6, 2.4, GHOST.body, 200);
  g.set(3, H - 12, GHOST.body, 200);
  g.set(6, H - 12, GHOST.body, 200);
  g.hline(3, 4, H - 9, GHOST.line);
  g.hline(13, 15, H - 6, GHOST.body);
}

/** 잠든 유령 고양이 뒷모습 (위를 봄): 등과 뒤통수, 귀 둘, 꼬리는 옆으로 */
export function ghostCatBack(g: Grid, _W: number, H: number): void {
  g.ellipse(8, H - 5, 7, 4, GHOST.cushion);
  g.ellipse(8, H - 8, 5, 4, GHOST.body, 200);
  g.set(5, H - 12, GHOST.body, 200);
  g.set(10, H - 12, GHOST.body, 200);
  g.hline(1, 3, H - 6, GHOST.body);
}
