import type { MapConcept } from "@/lib/mapConcept";
import { seasonHat, seasonScarf } from "./npcSeasonArt";
import { darken, Grid, hash2, lighten, makeCanvas, type Color } from "./pixel";
import { ICE, SNOW } from "./winterArt";

// 11/20 시안: 「총무팀 비품 카트」 — 사무실 가구를 파는 노점과 주인 NPC (그림만, 게임 연결 전).
//  야근 빌딩 바로 오른쪽 풀밭(빌딩 ~ 까마귀 연못 마른 나무 사이)에 선다. 다른 노점과 한눈에 갈리게:
//  - 노점은 회색 철제 「사무용 이동 카트」: 바퀴 넷, 자작 무늬 상판, 청록 앞판(흰 의자 무늬), 아래 칸엔 색색 바인더·A4 묶음·서랍.
//    지붕은 크림색 「블라인드」 차양(줄 끈·도토리 손잡이), 그 아래 형광등 한 줄. 왼쪽 기둥엔 6시(칼퇴)를 가리키는 벽시계,
//    상판엔 초록 은행원 스탠드·호출벨·고무나무 화분, 오른쪽 바닥엔 A4 상자.
//  - 맵 컨셉마다: 기본 / 겨울 = 블라인드·상판에 눈, 고드름, A4 상자 대신 주황 전기난로, 화분에 뜨개 덮개 /
//    크리스마스 = 블라인드 아래 솔가지 장식 + 전구, 기둥에 사탕 줄무늬 리본, 고무나무에 방울, 아래 칸 선물 상자, 시계에 산타 모자.
//  - 주인은 「총무팀」 유령: 오트밀 카디건·남색 넥타이·사원증 목걸이·팔토시, 왼손 커피 텀블러, 오른손 결재판.
//    카트 뒤에 서서 상판 너머로 몸을 내민다 (NPC 원점을 노점보다 12px 뒤에 두면 아래 자락이 상판에 가려진다). 2프레임 숨쉬기.
//  - 그림에 글씨는 넣지 않는다 (이름표는 게임이 따로 띄운다).
// 모든 그림은 원점 = 바닥 가운데 (0.5, 1), 맨 아래 줄 근처는 그림자 (furnitureStall.ts·seasonStall.ts와 같은 규칙).

const OUT = 0x1f1d1a;
/** NPC 윤곽 (다른 노점 NPC와 같은 색) */
const NPC_OUT = 0x16121a;
/** 눈 윤곽 (winterArt·다른 노점과 같은 색) */
const SNOW_EDGE = 0x55606c;

/** 알루미늄 (기둥·블라인드 레일) */
const ALU = { hi: 0xeef1f5, mid: 0xc4cad3, lo: 0x8e96a2, deep: 0x626a76 };
/** 블라인드 날개 (크림) */
const BLIND = { hi: 0xfdf9ef, mid: 0xefe6d2, lo: 0xd6c9ad };
/** 카트 철제 몸 */
const STEEL = { hi: 0xa4acb8, mid: 0x78808e, lo: 0x535a66, deep: 0x3a3f4a };
/** 상판 (자작 무늬 합판) */
const BIRCH = { hi: 0xf4e0ba, mid: 0xe0c290, lo: 0xb8955f };
/** 회사 청록 (앞판) */
const TEAL = { hi: 0x7cc8c4, mid: 0x3f9c9c, lo: 0x2c7a7c, deep: 0x1f5a5e };
const NAVY = { hi: 0x6478a8, mid: 0x3e5082, lo: 0x2a3860 };
const PAPER = { hi: 0xffffff, mid: 0xf2efe6, lo: 0xd8d2c2 };
/** 은행원 스탠드 초록 유리 갓 */
const LAMPG = { hi: 0x8ee0a2, mid: 0x3fa462, lo: 0x267642 };
const BRASS = { hi: 0xffe6a0, mid: 0xd8b056, lo: 0x9a7630 };
/** 고무나무 잎 (윤이 나는 짙은 초록) */
const RUBBER = { hi: 0x7cc486, mid: 0x3a8650, lo: 0x245e38 };
const KRAFT = { hi: 0xe2bc84, mid: 0xc89a5e, lo: 0x9a7240 };
const RED = { hi: 0xf0505a, mid: 0xd42c3c, lo: 0x9a1c2c };
const GOLD = { hi: 0xfff2b0, mid: 0xf2c84a, lo: 0xb88a22 };
const PINE = { hi: 0x5aa86a, mid: 0x2e8a4e, lo: 0x1f6634 };
/** 불빛 */
const FLAME = { hi: 0xfff4c8, mid: 0xffd27a, lo: 0xe8a040 };
/** 형광등 (낮엔 연한 회백, 밤엔 푸르스름한 흰 빛) */
const TUBE = { hi: 0xffffff, mid: 0xeaf4fa, lo: 0xbcccd8 };
const BULB_COLORS: readonly Color[] = [0xff5a5a, 0xffd84a, 0x5adc7a, 0x5ab0ff, 0xfff4e0];
/** 바인더 등 색 (빨강·겨자·파랑·초록·보라) */
const BINDERS: readonly Color[] = [0xd8504a, 0xe8b440, 0x4a7ed0, 0x4aa46a, 0x8a6ac0];

export const OFFICE_STALL_W = 44;
export const OFFICE_STALL_H = 48;
export const OFFICE_CLERK_W = 30;
export const OFFICE_CLERK_H = 32;
/** NPC는 카트 뒤에 선다: NPC 원점 = 노점 원점 + 이 값 (상판 너머로 윗몸만 보인다) */
export const OFFICE_CLERK_OFFSET = { x: -1, y: -12 } as const;

/** 빛 한 점 (그림 왼쪽 위 기준 픽셀 좌표 + 색 + 크기). tube = 늘 켜진 형광등 조각 (깜빡이지 않는다) */
export type OfficeLight = { x: number; y: number; c: Color; big: boolean; tube?: boolean };

type Drawn = { g: Grid; lights: OfficeLight[] };

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 70): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, a);
    }
}

/** 윗면에 눈을 한 겹 (외곽선 다음에): 윗면 윤곽 칸은 눈으로, 그 위 빈칸은 눈 윤곽. y0~y1 사이만 */
function topSnow(g: Grid, y0: number, y1: number, seed: number, skip = 0.2, x0 = 1, x1 = g.w - 2): void {
  const hits: [number, number][] = [];
  for (let x = x0; x <= x1; x++)
    for (let y = Math.max(1, y0); y <= y1; y++) {
      if (!g.filled(x, y) || g.filled(x, y - 1) || !g.filled(x, y + 1)) continue;
      if ((g.get(x, y) >>> 8) !== OUT || (g.get(x, y + 1) >>> 8) === OUT) continue;
      if (hash2(x, y, seed) < skip) continue;
      hits.push([x, y]);
    }
  for (const [x, y] of hits) {
    g.set(x, y, hash2(x, y, seed + 1) < 0.25 ? SNOW.mid : SNOW.hi);
    g.set(x, y - 1, SNOW_EDGE);
  }
}

// ── 카트 뼈대 ──
// 세로: (눈 얹을 자리 0~2) · 블라인드 3~11 · 형광등 12~13 · 기둥 11~28 · 상판 28~30 · 앞판 31~35 · 아래 칸 36~40 · 바퀴 41~44 · 그림자 45~47
const BLIND_TOP = 3;
const BLIND_BOT = 11;
const TOP = 28;
const APRON = 31;
const SHELF = 36;
const BASE = 41;
const CART_X0 = 3;
const CART_X1 = 40;
const POST_L = 3;
const POST_R = 39;

/** 뒤 기둥 둘 (알루미늄, 블라인드를 받친다) */
function posts(g: Grid): void {
  for (const x of [POST_L, POST_R]) {
    g.vline(x, BLIND_BOT, TOP - 1, ALU.hi);
    g.vline(x + 1, BLIND_BOT, TOP - 1, ALU.lo);
  }
}

/** 블라인드 차양: 위 레일 + 날개 셋 반 + 아래 레일, 사다리 끈 둘, 오른쪽 줄 끈과 도토리 손잡이 */
function blind(g: Grid): void {
  for (let y = BLIND_TOP; y <= BLIND_BOT; y++) {
    const inset = y <= BLIND_TOP + 1 ? 2 : y <= 4 ? 1 : 0; // 아래로 갈수록 살짝 넓게 (사다리꼴)
    for (let x = 1 + inset; x <= 42 - inset; x++) {
      let c: Color;
      if (y <= BLIND_TOP + 1) c = y === BLIND_TOP ? ALU.hi : ALU.mid; // 위 레일
      else if (y === BLIND_BOT) c = ALU.lo; // 아래 레일
      else c = (y - BLIND_TOP) % 2 === 0 ? BLIND.hi : BLIND.lo; // 날개 (밝은 면 + 그늘 줄)
      g.set(x, y, c);
    }
  }
  // 위 레일 양끝 마개
  g.set(3, BLIND_TOP, ALU.deep);
  g.set(40, BLIND_TOP, ALU.deep);
  // 사다리 끈 (날개를 세로로 꿰는 가는 끈)
  for (const x of [11, 32]) for (let y = BLIND_TOP + 2; y < BLIND_BOT; y++) if ((y - BLIND_TOP) % 2 === 1) g.set(x, y, 0xb8a888);
  // 줄 끈 + 도토리 손잡이 (오른쪽 기둥 앞)
  g.vline(37, BLIND_BOT + 1, BLIND_BOT + 6, 0xd8ccb0);
  g.set(37, BLIND_BOT + 7, BLIND.mid);
  g.hline(36, 38, BLIND_BOT + 8, BLIND.lo);
  g.set(37, BLIND_BOT + 9, darken(BLIND.lo, 0.15));
}

/** 블라인드 밑 형광등 (받침 쇠 둘 + 긴 관). 빛 자리 넷을 돌려준다 */
function tube(g: Grid): OfficeLight[] {
  const y = BLIND_BOT + 1;
  const x0 = 10;
  const x1 = 33;
  g.set(x0 + 1, y, ALU.deep);
  g.set(x1 - 1, y, ALU.deep);
  g.hline(x0, x1, y + 1, TUBE.mid);
  g.hline(x0 + 2, x1 - 4, y + 1, TUBE.hi);
  g.set(x0, y + 1, ALU.lo);
  g.set(x1, y + 1, ALU.lo);
  const out: OfficeLight[] = [];
  for (let x = x0 + 3; x <= x1 - 2; x += 7) out.push({ x, y: y + 1, c: 0xe8f4ff, big: false, tube: true });
  return out;
}

/** 왼쪽 기둥에 건 동그란 벽시계 — 바늘이 6시 정각(칼퇴)을 가리킨다. santa면 꼭대기에 작은 산타 모자 */
function clock(g: Grid, cx: number, cy: number, santa: boolean): void {
  g.ellipse(cx + 0.5, cy + 0.5, 3.6, 3.6, NAVY.mid);
  g.ellipse(cx + 0.5, cy + 0.5, 2.6, 2.6, PAPER.hi);
  g.set(cx - 1, cy - 1, PAPER.hi);
  // 눈금 (12·3·6·9)
  g.set(cx, cy - 2, 0x8a8a96);
  g.set(cx + 2, cy, 0x8a8a96);
  g.set(cx - 2, cy, 0x8a8a96);
  // 분침 위로, 시침 아래로 = 6:00
  g.vline(cx, cy - 2, cy, 0x2a2a34);
  g.vline(cx, cy + 1, cy + 2, RED.mid);
  g.set(cx + 1, cy - 3, NAVY.hi); // 테 반짝
  // 걸이 끈
  g.vline(cx, cy - 5, cy - 4, ALU.deep);
  if (santa) {
    g.hline(cx - 2, cx + 2, cy - 4, 0xffffff);
    g.hline(cx - 1, cx + 1, cy - 5, RED.mid);
    g.set(cx + 1, cy - 6, RED.mid);
    g.set(cx + 2, cy - 6, 0xffffff);
  }
}

/** 초록 은행원 스탠드 (놋 받침·기둥 + 초록 유리 갓). 빛 자리를 돌려준다 */
function bankerLamp(g: Grid, x0: number): OfficeLight {
  const by = TOP - 1;
  g.hline(x0, x0 + 6, by, BRASS.lo);
  g.hline(x0 + 1, x0 + 5, by - 1, BRASS.mid);
  g.set(x0 + 1, by - 1, BRASS.hi);
  g.vline(x0 + 3, by - 5, by - 2, BRASS.mid);
  g.set(x0 + 4, by - 3, BRASS.lo);
  // 당김 줄
  g.vline(x0 + 5, by - 5, by - 4, BRASS.lo);
  g.set(x0 + 5, by - 3, BRASS.hi);
  // 갓 (반원통 초록 유리): 위 둥글게, 아래 놋 테
  const sy = by - 8;
  g.hline(x0 + 2, x0 + 4, sy, LAMPG.hi);
  g.hline(x0 + 1, x0 + 5, sy + 1, LAMPG.mid);
  g.set(x0 + 2, sy + 1, LAMPG.hi);
  g.hline(x0, x0 + 6, sy + 2, LAMPG.lo);
  g.set(x0 + 1, sy + 2, LAMPG.mid);
  g.hline(x0, x0 + 6, sy + 3, BRASS.mid);
  // 갓 밑 불빛
  g.hline(x0 + 2, x0 + 4, sy + 4, FLAME.hi);
  return { x: x0 + 3, y: sy + 4, c: 0xffd890, big: true };
}

/** 은빛 호출벨 (딩동) */
function deskBell(g: Grid, x0: number): void {
  const by = TOP - 1;
  g.hline(x0, x0 + 4, by, STEEL.lo);
  g.hline(x0 + 1, x0 + 3, by - 1, ALU.mid);
  g.set(x0 + 1, by - 1, ALU.hi);
  g.set(x0 + 2, by - 2, ALU.hi);
}

/** 흰 사기 화분 고무나무 (잎 다섯, 윤이 나는 잎맥). knit = 겨울 뜨개 덮개, baubles = 크리스마스 방울 */
function rubberPlant(g: Grid, cx: number, opts: { knit?: boolean; baubles?: boolean } = {}): void {
  const by = TOP - 1;
  // 화분
  for (let y = by - 4; y <= by; y++)
    for (let x = cx - 3; x <= cx + 2; x++) {
      const inset = y === by ? 1 : 0;
      if (x < cx - 3 + inset || x > cx + 2 - inset) continue;
      let c: Color = x >= cx + 1 ? PAPER.lo : PAPER.mid;
      if (opts.knit) c = (x + y) % 2 ? 0xd65a54 : 0xf0ece0;
      g.set(x, y, c);
    }
  g.hline(cx - 3, cx + 2, by - 4, opts.knit ? 0xf6f2e8 : PAPER.hi);
  // 줄기
  g.vline(cx, by - 11, by - 5, 0x6a5a3a);
  // 잎 (타원 잎 다섯: 왼·오 번갈아 위로)
  const leaf = (x: number, y: number, dir: number) => {
    g.hline(x, x + 2 * dir, y, RUBBER.mid);
    g.hline(x + dir, x + 3 * dir, y - 1, RUBBER.hi);
    g.hline(x, x + 2 * dir, y + 1, RUBBER.lo);
    g.set(x + 3 * dir, y, RUBBER.mid);
  };
  leaf(cx - 1, by - 7, -1);
  leaf(cx + 1, by - 9, 1);
  leaf(cx - 1, by - 11, -1);
  leaf(cx + 1, by - 13, 1);
  // 꼭대기 새순 (붉은 잎집)
  g.vline(cx, by - 15, by - 12, RUBBER.mid);
  g.set(cx, by - 16, 0xc8645a);
  if (opts.baubles) {
    g.set(cx - 4, by - 6, RED.mid);
    g.set(cx + 4, by - 8, GOLD.mid);
    g.set(cx - 4, by - 10, 0x5ab0ff);
    g.set(cx + 3, by - 12, RED.hi);
    g.set(cx, by - 17, GOLD.hi); // 꼭대기 별
  }
}

/** 상판 + 청록 앞판(흰 의자 무늬) + 아래 칸 (바인더·A4 묶음·서랍) + 철제 다리·바퀴 넷 */
function cartBody(g: Grid, lower: "binders" | "gifts"): void {
  // 상판 (자작 합판: 윗면 두 줄 + 두께 한 줄)
  g.hline(CART_X0 + 1, CART_X1 - 1, TOP, BIRCH.hi);
  g.hline(CART_X0, CART_X1, TOP + 1, BIRCH.mid);
  g.hline(CART_X0, CART_X1, TOP + 2, BIRCH.lo);
  for (let x = CART_X0 + 3; x < CART_X1; x += 9) g.set(x, TOP + 1, darken(BIRCH.mid, 0.08)); // 나뭇결
  // 앞판 (청록 철판, 위 밝은 줄 + 아래 그늘)
  for (let y = APRON; y < SHELF; y++)
    for (let x = CART_X0; x <= CART_X1; x++) {
      let c = y === APRON ? TEAL.hi : y === SHELF - 1 ? TEAL.lo : TEAL.mid;
      if (x >= CART_X1 - 5 && y > APRON) c = darken(c, 0.12);
      g.set(x, y, c);
    }
  // 앞판 가운데 흰 의자 무늬 (사무 의자 옆모습: 등받이·방석·기둥·바퀴 받침) — 글씨 대신
  const ex = 19;
  const ey = APRON;
  g.vline(ex, ey, ey + 2, PAPER.hi);
  g.hline(ex, ex + 3, ey + 2, PAPER.hi);
  g.set(ex + 2, ey + 3, PAPER.hi);
  g.hline(ex + 1, ex + 3, ey + 4, PAPER.mid);
  // 앞판 양옆 나사
  g.set(CART_X0 + 2, APRON + 2, TEAL.deep);
  g.set(CART_X1 - 2, APRON + 2, TEAL.deep);
  // 아래 칸 (어두운 안쪽)
  for (let y = SHELF; y < BASE - 1; y++) for (let x = CART_X0 + 2; x <= CART_X1 - 2; x++) g.set(x, y, y === SHELF ? 0x2a2c34 : 0x3a3d48);
  if (lower === "binders") {
    // 색색 바인더 (등에 흰 이름표 칸)
    BINDERS.forEach((c, i) => {
      const x = CART_X0 + 3 + i * 2;
      g.vline(x, SHELF + 1, BASE - 2, c);
      g.vline(x + 1, SHELF + 1, BASE - 2, darken(c, 0.18));
      g.set(x, SHELF + 2, lighten(c, 0.6));
    });
    // 기울어진 바인더 하나
    g.set(CART_X0 + 14, SHELF + 2, 0x4a7ed0);
    g.vline(CART_X0 + 13, SHELF + 3, BASE - 2, 0x3a64a8);
    // A4 묶음 (흰 종이 + 파란 띠지)
    for (let y = SHELF + 1; y <= BASE - 2; y++)
      for (let x = 19; x <= 26; x++) g.set(x, y, y === SHELF + 1 ? PAPER.hi : (y - SHELF) % 2 ? PAPER.mid : PAPER.lo);
    g.vline(22, SHELF + 1, BASE - 2, 0x5a8ad8);
  } else {
    // 선물 상자 셋 (리본 십자)
    const box = (x0: number, w: number, h: number, c: Color, rb: Color) => {
      for (let y = BASE - 1 - h; y <= BASE - 2; y++) for (let x = x0; x < x0 + w; x++) g.set(x, y, y === BASE - 1 - h ? lighten(c, 0.25) : c);
      g.vline(x0 + Math.floor(w / 2), BASE - 1 - h, BASE - 2, rb);
      g.set(x0 + Math.floor(w / 2) - 1, BASE - 2 - h, rb);
      g.set(x0 + Math.floor(w / 2) + 1, BASE - 2 - h, rb);
    };
    box(CART_X0 + 3, 7, 3, RED.mid, GOLD.hi);
    box(CART_X0 + 11, 6, 2, PINE.mid, RED.hi);
    box(19, 8, 3, 0xf4f0e6, RED.mid);
  }
  // 서랍 둘 (남색, 은 손잡이)
  for (let y = SHELF; y < BASE - 1; y++) for (let x = 28; x <= CART_X1 - 2; x++) g.set(x, y, y === SHELF ? NAVY.hi : x >= CART_X1 - 4 ? NAVY.lo : NAVY.mid);
  g.hline(28, CART_X1 - 2, SHELF + 2, NAVY.lo);
  g.hline(31, 34, SHELF + 1, ALU.mid);
  g.hline(31, 34, SHELF + 3, ALU.mid);
  // 철제 다리 (네 모서리 기둥) + 바닥 판
  for (const x of [CART_X0, CART_X0 + 1]) g.vline(x, SHELF, BASE - 1, x === CART_X0 ? STEEL.hi : STEEL.mid);
  for (const x of [CART_X1 - 1, CART_X1]) g.vline(x, SHELF, BASE - 1, x === CART_X1 ? STEEL.lo : STEEL.mid);
  g.hline(CART_X0, CART_X1, BASE - 1, STEEL.lo);
  // 바퀴 넷: 뒤 둘은 안쪽에 살짝 보이고, 앞 둘은 모서리 다리 밑 (검은 고무 + 은 굴대)
  for (const x of [CART_X0 + 6, CART_X1 - 7]) g.hline(x, x + 1, BASE, 0x26262c);
  for (const x of [CART_X0, CART_X1 - 1]) {
    g.hline(x, x + 1, BASE, STEEL.deep); // 바퀴 받침
    g.hline(x, x + 1, BASE + 1, 0x26262c);
    g.set(x, BASE + 1, 0x9a9aa6); // 굴대
    g.hline(x, x + 1, BASE + 2, 0x26262c);
  }
}

/** 오른쪽 바닥 A4 상자 (뚜껑 살짝 열림, 종이 한 장 삐죽) */
function paperBox(g: Grid, x0: number): void {
  const by = BASE + 2;
  for (let y = by - 6; y <= by; y++) for (let x = x0; x <= x0 + 6; x++) g.set(x, y, x >= x0 + 5 ? KRAFT.lo : y === by - 6 ? KRAFT.hi : KRAFT.mid);
  g.hline(x0, x0 + 6, by - 4, KRAFT.lo); // 테이프 자리
  g.hline(x0 + 1, x0 + 4, by - 7, PAPER.hi); // 삐죽 나온 종이
  g.set(x0 + 2, by - 8, PAPER.mid);
  g.hline(x0 + 2, x0 + 4, by - 2, 0x5a8ad8); // 상자 옆 파란 상표 줄 (글씨 없이)
}

/** 주황 전기난로 (겨울: 둥근 반사판 + 빨간 열선 셋). 빛 자리를 돌려준다 */
function heater(g: Grid, x0: number): OfficeLight {
  const by = BASE + 2;
  g.ellipse(x0 + 3.5, by - 5.5, 3.5, 4.2, ALU.mid);
  g.ellipse(x0 + 3.5, by - 5.5, 2.5, 3.2, 0xf0a050);
  for (const y of [by - 8, by - 6, by - 4]) g.hline(x0 + 2, x0 + 5, y, 0xff6a3a);
  g.set(x0 + 2, by - 6, FLAME.hi);
  g.vline(x0 + 3, by - 1, by, ALU.deep);
  g.hline(x0 + 1, x0 + 6, by, ALU.lo);
  return { x: x0 + 3, y: by - 6, c: 0xff9a50, big: true };
}

/** 고드름 (블라인드 아래 레일 밑, 형광등·줄 끈 자리는 비운다) */
function icicles(g: Grid, seed: number): void {
  let last = -9;
  for (let x = 2; x <= 41; x++) {
    if (x - last < 2 || hash2(x, 5, seed) < 0.45) continue;
    if ((x >= 9 && x <= 34) || (x >= 36 && x <= 38)) continue;
    last = x;
    const len = 1 + Math.floor(hash2(x, 9, seed) * 3);
    for (let k = 0; k < len; k++) g.set(x, BLIND_BOT + 1 + k, k === len - 1 ? ICE.lo : k === 0 ? ICE.hi : ICE.mid);
  }
}

/** 블라인드 아래 레일을 따라 솔가지 장식 + 전구 (크리스마스) */
function garland(g: Grid, lights: OfficeLight[]): void {
  let n = 0;
  for (let x = 1; x <= 42; x++) {
    const sag = Math.round(Math.sin(((x - 1) / 41) * Math.PI * 3) ** 2 * 1.5);
    const y = BLIND_BOT + sag;
    g.set(x, y, (x + sag) % 3 ? PINE.mid : PINE.lo);
    if (x % 2 === 0) g.set(x, y + 1, PINE.lo);
    if (x % 5 === 2) {
      const c = BULB_COLORS[n++ % BULB_COLORS.length];
      g.set(x, y + 1, c);
      lights.push({ x, y: y + 1, c, big: false });
    }
  }
}

/** 기둥 사탕 줄무늬 리본 (크리스마스) */
function candyPosts(g: Grid): void {
  for (const x of [POST_L, POST_R])
    for (let y = BLIND_BOT + 1; y < TOP; y++) if ((y + (x === POST_L ? 0 : 1)) % 3 === 0) {
      g.set(x, y, RED.mid);
      g.set(x + 1, y + 1, RED.lo);
    }
  // 리본 매듭 (기둥 위)
  for (const x of [POST_L, POST_R]) {
    g.set(x - 1, BLIND_BOT + 2, RED.hi);
    g.set(x + 2, BLIND_BOT + 2, RED.hi);
    g.set(x, BLIND_BOT + 3, RED.lo);
    g.set(x + 1, BLIND_BOT + 3, RED.lo);
  }
}

function stall(concept: MapConcept): Drawn {
  const g = new Grid(OFFICE_STALL_W, OFFICE_STALL_H);
  const lights: OfficeLight[] = [];
  const winter = concept === "winter";
  const xmas = concept === "christmas";
  posts(g);
  if (xmas) candyPosts(g);
  blind(g);
  lights.push(...tube(g));
  clock(g, 4, BLIND_BOT + 5, xmas);
  cartBody(g, xmas ? "gifts" : "binders");
  lights.push(bankerLamp(g, CART_X0 + 2));
  deskBell(g, 19);
  rubberPlant(g, 36, { knit: winter, baubles: xmas });
  if (winter) lights.push(heater(g, 37));
  else paperBox(g, 37);
  if (xmas) garland(g, lights);
  g.outline(OUT);
  if (winter || xmas) {
    topSnow(g, 1, 4, 41, 0.04);
    topSnow(g, TOP - 2, TOP + 1, 43, 0.35, CART_X0, 12);
    topSnow(g, TOP - 2, TOP + 1, 47, 0.35, 26, CART_X1);
    if (winter) icicles(g, 53);
  }
  shadow(g, 22, BASE + 3, 21, 2.2, 70);
  return { g, lights };
}

const cache = new Map<MapConcept, Drawn>();
function drawn(concept: MapConcept): Drawn {
  let d = cache.get(concept);
  if (!d) {
    d = stall(concept);
    cache.set(concept, d);
  }
  return d;
}

/** 총무팀 비품 카트 (44×48, 원점 바닥 가운데) */
export function officeStall(concept: MapConcept = "default"): HTMLCanvasElement {
  return drawn(concept).g.toCanvas();
}

/** 노점 불빛 자리 (은행원 스탠드·형광등·난로·전구) */
export function officeStallLights(concept: MapConcept = "default"): readonly OfficeLight[] {
  return drawn(concept).lights;
}

/**
 * 노점 불빛 겹 (가산 섞기로 위에 얹는다): 노점과 같은 크기 두 장을 가로로.
 * 스탠드·난로는 은은히 일렁이고, 형광등은 늘 고르게, 전구는 절반씩 번갈아 밝다 (furnitureStallGlowSheet와 같은 짜임).
 */
export function officeStallGlowSheet(concept: MapConcept = "default"): HTMLCanvasElement {
  const W = OFFICE_STALL_W;
  const H = OFFICE_STALL_H;
  const { canvas, ctx } = makeCanvas(W * 2, H);
  const lights = officeStallLights(concept);
  for (let f = 0; f < 2; f++)
    lights.forEach((l, i) => {
      const on = l.big || l.tube ? true : (i + f) % 2 === 0;
      const R = l.big ? (f ? 9 : 8) : l.tube ? 6 : on ? 4 : 2.5;
      const a = l.big ? 0.75 : l.tube ? 0.55 : on ? 0.95 : 0.45;
      const rgb = `${(l.c >> 16) & 255},${(l.c >> 8) & 255},${l.c & 255}`;
      const cx = f * W + l.x + 0.5;
      const cy = l.y + 0.5;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, `rgba(${rgb},${a})`);
      gr.addColorStop(0.35, `rgba(${rgb},${a * 0.45})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    });
  return canvas;
}

// ── 총무팀 유령 ──

/** 커피 텀블러 (청록 몸 + 흰 뚜껑, 겨울엔 뜨개 덮개) */
function tumbler(g: Grid, x0: number, y0: number, knit: boolean): void {
  g.hline(x0, x0 + 2, y0, PAPER.hi);
  g.hline(x0, x0 + 2, y0 + 1, PAPER.lo);
  for (let y = y0 + 2; y <= y0 + 6; y++) {
    g.set(x0, y, knit ? ((y % 2) ? 0xd65a54 : 0xf0ece0) : TEAL.hi);
    g.set(x0 + 1, y, knit ? ((y % 2) ? 0xf0ece0 : 0xd65a54) : TEAL.mid);
    g.set(x0 + 2, y, knit ? 0xb8463e : TEAL.lo);
  }
}

/** 결재판 (남색 판 + 흰 서류 + 은 집게 + 빨간 도장 자국) */
function clipboard(g: Grid, x0: number, y0: number): void {
  g.rect(x0, y0 + 1, 5, 8, NAVY.mid);
  g.vline(x0 + 4, y0 + 1, y0 + 8, NAVY.lo);
  g.rect(x0 + 1, y0 + 2, 3, 6, PAPER.hi);
  g.hline(x0 + 1, x0 + 3, y0 + 4, PAPER.lo);
  g.hline(x0 + 1, x0 + 2, y0 + 6, PAPER.lo);
  g.set(x0 + 3, y0 + 6, RED.mid); // 도장
  g.hline(x0 + 1, x0 + 3, y0, ALU.mid);
  g.set(x0 + 2, y0 + 1, ALU.lo);
}

/** 총무팀 유령: 30×32. frame 0·1 = 숨쉬기 (위 몸이 한 칸 내려앉고 자락이 일렁인다) */
export function officeClerk(frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const b = frame ? 1 : 0;
  const xmas = concept === "christmas";
  const winter = concept === "winter";
  const g = new Grid(OFFICE_CLERK_W, OFFICE_CLERK_H);
  const body = 0xf0ebe0;
  const shade = darken(body, 0.16);
  const hy = 17 + b; // 머리 가운데
  // 유령 몸 (머리 + 몸 + 물결 자락) — 다른 보따리상과 같은 몸
  g.ellipse(15, hy, 6, 6.2, body);
  g.rect(9, hy, 13, 27 - hy, body);
  for (let x = 9; x <= 21; x++) if ((x + frame) % 3 !== 0) g.set(x, 27, body);
  g.recolor((x, y) => x >= 19 && y > hy - 3, shade);
  g.recolor((x, y) => y >= 26 && x >= 17, shade);
  // 눈·볼·입 (살짝 웃는 입)
  for (const ex of [13, 17]) {
    g.set(ex, hy, 0x1a1620);
    g.set(ex, hy + 1, 0x1a1620);
  }
  g.set(11, hy + 2, 0xf0a0a8);
  g.set(19, hy + 2, 0xf0a0a8);
  g.set(14, hy + 3, 0x8a4a50);
  g.set(16, hy + 3, 0x8a4a50);
  g.set(15, hy + 4, 0x8a4a50);
  // 오트밀 카디건: 양옆 판은 목부터, 가운데 셔츠 앞섶(흰 몸)은 가슴까지만 보이고 아래는 여민다
  const cardi = winter ? 0x8a9ab4 : xmas ? 0x3e8a58 : 0xd8c39c;
  const cLo = darken(cardi, 0.18);
  const cy = hy + 5;
  for (let y = cy; y <= 26; y++)
    for (let x = 9; x <= 21; x++) {
      if (x >= 13 && x <= 17 && y <= cy + 1) continue; // 셔츠 앞섶
      if (x === 13 || x === 17) if (y === cy + 2) continue; // V 목 끝
      g.set(x, y, x >= 19 ? cLo : cardi);
    }
  g.vline(15, cy + 5, 26, cLo); // 여밈 선
  // 셔츠 깃 + 넥타이 (매듭 + 한 칸)
  const tie = xmas ? RED.mid : NAVY.mid;
  g.set(14, cy, 0xffffff);
  g.set(16, cy, 0xffffff);
  g.set(15, cy, tie);
  g.set(15, cy + 1, darken(tie, 0.15));
  // 사원증 목걸이 (끈이 목 양옆에서 가슴으로) + 흰 카드 3×3 (사진 칸)
  const strap = xmas ? GOLD.lo : TEAL.mid;
  g.set(13, cy, strap);
  g.set(17, cy, strap);
  g.set(13, cy + 1, strap);
  g.set(17, cy + 1, strap);
  g.rect(14, cy + 2, 3, 3, PAPER.hi);
  g.set(16, cy + 3, PAPER.lo);
  g.set(16, cy + 4, PAPER.lo);
  g.set(14, cy + 3, 0x7a98c0); // 사진 칸
  g.set(15, cy + 4, 0xb8c0c8);
  // 목도리 (겨울·크리스마스): 넥타이 위로 두툼하게
  if (winter) seasonScarf(g, 9, 21, hy + 5, { c: 0xf0ece0, c2: 0xd65a54, pat: "dots", thick: true, tail: 10 });
  else if (xmas) seasonScarf(g, 9, 21, hy + 5, { c: RED.mid, c2: 0xf6f2e8, pat: "stripe", thick: true, tail: 10 });
  // 왼손: 커피 텀블러 (손 끝에 검은 팔토시 한 칸)
  tumbler(g, 5, hy + 1, winter);
  g.rect(7, hy + 5, 2, 2, body);
  g.set(8, hy + 6, shade);
  g.set(8, hy + 4, 0x2e3240); // 팔토시
  // 오른손: 결재판
  clipboard(g, 21, hy + 1);
  g.rect(21, hy + 6, 2, 2, body);
  g.set(22, hy + 7, shade);
  g.set(21, hy + 5, 0x2e3240); // 팔토시
  g.outline(NPC_OUT);
  // 머리: 겨울 = 방울 털모자, 크리스마스 = 루돌프 머리띠 (송년회 필수품)
  if (winter || xmas) {
    const hat = new Grid(OFFICE_CLERK_W, OFFICE_CLERK_H);
    seasonHat(hat, 15, hy, 6, hy - 6, winter ? { kind: "beanie", c: 0xd65a54, c2: 0xf6f2e8 } : { kind: "antler" });
    hat.outline(NPC_OUT);
    g.draw(hat, 0, 0);
  }
  shadow(g, 15, 29.5, 9, 1.3, 50);
  return g.toCanvas();
}

/** 두 프레임을 가로로 붙인 시트 (60×32) */
export function officeClerkSheet(concept: MapConcept = "default"): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(OFFICE_CLERK_W * 2, OFFICE_CLERK_H);
  for (let f = 0; f < 2; f++) ctx.drawImage(officeClerk(f, concept), f * OFFICE_CLERK_W, 0);
  return canvas;
}
