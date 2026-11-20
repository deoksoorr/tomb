import type { MapConcept } from "@/lib/mapConcept";
import { seasonHat, seasonHolly, seasonScarf } from "./npcSeasonArt";
import { BREED_ART, type BreedArtId } from "./petBreeds";
import { darken, Grid, hash2, makeCanvas, type Color } from "./pixel";
import { ICE, SNOW } from "./winterArt";

// 11/19 「분양사 보리」(멍냥 분양사) — 동물원 정문 옆에 서서 품종 강아지·고양이(petBreeds 12종)와 집 가구를 파는 사람 NPC.
//  월드 배치·움직임은 game/world/MungnyangView.ts (자리 mungnyangLayout.ts), 판매 창 components/mungnyang, 서버 /api/mungnyang.
//  건물 없이 사람 한 명 + 발치 펫 + 작은 소품 둘:
//  - 분양사: 기존 마을 NPC와 같은 유령 몸(30×32). 고양이 귀 달린 버터색 뜨개 모자, 민트 앞치마(주머니에 뼈다귀 간식이 삐죽),
//    품에 안은 초코 푸들 강아지(가끔 꼬리 살랑), 오른손에 감아 쥔 알록달록 목줄 세 가닥(끝마다 놋쇠 고리).
//    프레임 0·1 = 숨쉬기, 2·3 = 숨쉬기 + 품의 강아지 꼬리 흔들기 (MUNGNYANG_SELLER_ANIM 참고).
//  - 소품: 펫 방석(치즈냥이 식빵 굽는 자리), 간식 상자(유리 간식 통 + 기둥에 매단 작은 등불 — 밤 불빛은 이것 하나).
//  - 발치 펫은 BREED_ART 그림을 그대로 쓰고, 겨울엔 목도리·크리스마스엔 산타 모자를 얹는다 (mungnyangPet).
//  - 맵 컨셉마다: 기본 / 겨울 = 고양이 귀 방울 털모자·체크 목도리·벙어리장갑, 방석에 체크 담요, 소품에 눈 /
//    크리스마스 = 산타 모자·빨강초록 목도리·호랑가시 브로치, 산타 털 방석·방울, 간식 통 리본.
//  - 간판 글씨는 넣지 않는다 (이름표는 게임이 따로 띄운다).
// 모든 그림은 원점 = 바닥 가운데 (0.5, 1), 맨 아래 줄 근처는 그림자 (seasonStall.ts·furnitureStall.ts와 같은 규칙).

/** NPC 윤곽 (forage/art·zooArt·seasonStall의 NPC와 같은 색) */
const NPC_OUT = 0x16121a;
/** 소품 윤곽 (props·seasonStall과 같은 색) */
const OUT = 0x1f1d1a;
/** 눈 윤곽 (winterArt·seasonStall과 같은 색) */
const SNOW_EDGE = 0x55606c;

/** 앞치마: 민트 청록 */
const TEAL = { hi: 0xaee4d8, mid: 0x6cc4b4, lo: 0x4a9a8c, deep: 0x2e6e64 };
/** 방석·간식 통 뚜껑: 장밋빛 */
const ROSE = { hi: 0xf6b4c2, mid: 0xe8869e, lo: 0xc0607c, deep: 0x8e4460 };
/** 모자: 버터색 뜨개 */
const BUTTER = { hi: 0xfff0b8, mid: 0xf6d886, lo: 0xd8b260 };
/** 겨울 털모자: 빨간 뜨개 */
const WOOL = { hi: 0xec7a6a, mid: 0xcc4a40, lo: 0x9a2e2e };
/** 고양이 귀 (생강색) */
const GINGER = { hi: 0xf6b06a, mid: 0xe08c42, lo: 0xb4682a };
const EAR_PINK = 0xf6a8b8;
/** 품의 강아지: 살구색 아기 강아지 */
const PUPPY = { hi: 0xf8d49a, mid: 0xeab26a, lo: 0xc88a44, deep: 0x9a6430 };
const CREAM = { hi: 0xfff8e8, mid: 0xf2e4c4, lo: 0xd8c49c };
/** 상자·기둥: 밝은 소나무 */
const PINE = { hi: 0xe8c08a, mid: 0xcc9a5e, lo: 0x9a6c3a, deep: 0x6a4626 };
const BRASS = { hi: 0xffe6a0, mid: 0xd8b056, lo: 0x9a7630 };
const RED = { hi: 0xf0505a, mid: 0xd42c3c, lo: 0x9a1c2c };
const GREEN = { hi: 0x4aa868, mid: 0x2e8a4e, lo: 0x1f6634 };
const SAGE = { hi: 0xa8cca0, mid: 0x76a07a, lo: 0x527a5a };
const MINT = { hi: 0x9ce6d0, mid: 0x4cc0a4, lo: 0x2e8a76 };
const SKY = { hi: 0xa8d8ff, mid: 0x5aa8e8, lo: 0x3a74b0 };
const CORAL = { hi: 0xffa890, mid: 0xf06a5a, lo: 0xb04438 };
/** 등불 */
const FLAME = { hi: 0xfff4c8, mid: 0xffd27a, lo: 0xe8a040 };
/** 펫 눈 (petBreeds EYE와 같은 색 — 눈 자리를 찾아 모자·목도리를 얹는다) */
const PET_EYE = 0x2a1e18;

export const MUNGNYANG_SELLER_W = 30;
export const MUNGNYANG_SELLER_H = 32;
/** 0·1 숨쉬기 · 2·3 숨쉬기 + 꼬리 살랑 */
export const MUNGNYANG_SELLER_FRAMES = 4;
/** 제안 재생 순서 (650ms마다 한 칸): 숨쉬기 세 번에 한 번 품의 강아지가 꼬리를 흔든다 */
export const MUNGNYANG_SELLER_ANIM: readonly number[] = [0, 1, 0, 1, 0, 1, 2, 3, 2, 3];
export const MUNGNYANG_CUSHION_W = 22;
export const MUNGNYANG_CUSHION_H = 10;
export const MUNGNYANG_STAND_W = 18;
export const MUNGNYANG_STAND_H = 26;

/** 빛 한 점 (그림 왼쪽 위 기준 픽셀 좌표 + 색 + 크기). 원점 기준 위치는 x - W/2, y - H */
export type MungnyangLight = { x: number; y: number; c: Color; big: boolean };

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 70): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, a);
    }
}

/** 윗면에 눈을 한 겹 얹는다 (외곽선 다음에): 윗면 윤곽 칸은 눈으로, 그 위 빈칸은 눈 윤곽 (furnitureStall topSnow와 같은 규칙) */
function topSnow(g: Grid, y0: number, y1: number, seed: number, skip = 0.2, x0 = 1, x1 = g.w - 2): void {
  const hits: [number, number][] = [];
  for (let x = x0; x <= x1; x++)
    for (let y = Math.max(1, y0); y <= y1; y++) {
      if (!g.filled(x, y) || g.filled(x, y - 1) || !g.filled(x, y + 1)) continue;
      if (g.get(x, y) >>> 8 !== OUT || g.get(x, y + 1) >>> 8 === OUT) continue;
      if (hash2(x, y, seed) < skip) continue;
      hits.push([x, y]);
    }
  for (const [x, y] of hits) {
    g.set(x, y, hash2(x, y, seed + 1) < 0.25 ? SNOW.mid : SNOW.hi);
    g.set(x, y - 1, SNOW_EDGE);
  }
}

// ── 분양사 NPC ──

/** 고양이 귀 두 개 (모자 위). top = 모자 맨 윗줄 */
function catEars(g: Grid, top: number): void {
  // 왼쪽 귀 (밖은 생강색, 안은 분홍)
  g.set(10, top - 2, GINGER.hi);
  g.set(10, top - 1, GINGER.mid);
  g.set(11, top - 1, EAR_PINK);
  g.set(11, top, GINGER.mid);
  g.set(10, top, GINGER.mid);
  // 오른쪽 귀
  g.set(20, top - 2, GINGER.mid);
  g.set(20, top - 1, GINGER.lo);
  g.set(19, top - 1, EAR_PINK);
  g.set(19, top, GINGER.lo);
  g.set(20, top, GINGER.lo);
}

/** 고양이 귀 뜨개 모자. hy = 머리 가운데 줄. 기본 = 버터색 골지 단, 겨울 = 빨간 털모자 + 몽글한 크림 털 단 */
function knitCap(g: Grid, hy: number, winter: boolean): void {
  const C = winter ? WOOL : BUTTER;
  const y = hy - 6;
  g.hline(12, 18, y, C.hi);
  g.hline(10, 20, y + 1, C.mid);
  g.set(12, y + 1, C.hi);
  g.set(13, y + 1, C.hi);
  g.hline(9, 21, y + 2, C.mid);
  g.set(20, y + 1, C.lo);
  g.set(21, y + 2, C.lo);
  if (winter) {
    // 털 단 (크림, 군데군데 그늘) — 한 칸 넓게
    for (let x = 8; x <= 22; x++) g.set(x, y + 3, (x + 1) % 4 === 0 ? CREAM.lo : CREAM.hi);
    for (let x = 9; x <= 21; x++) g.set(x, y + 4, x % 3 === 0 ? CREAM.mid : CREAM.hi);
  } else for (let x = 9; x <= 21; x++) g.set(x, y + 3, x % 2 ? C.lo : C.mid); // 접은 단 (세로 골 무늬)
  catEars(g, y);
}

/** 품에 안은 살구색 아기 강아지 (앞모습, 몸 왼쪽 아래). 감싸 안은 팔까지 한 겹으로 그려 따로 윤곽을 두른다. wag = 꼬리 쪽 */
function heldPuppy(hy: number, wag: number, concept: MapConcept): Grid {
  const g = new Grid(MUNGNYANG_SELLER_W, MUNGNYANG_SELLER_H);
  const P = PUPPY;
  const py = hy + 3; // 강아지 머리 맨 윗줄
  // 꼬리 (몸 오른쪽으로 삐죽 — 흔들면 위·아래로)
  const tail: readonly [number, number][] = wag === 0 ? [[12, py + 6], [13, py + 6]] : wag === 1 ? [[12, py + 6], [13, py + 5], [14, py + 4]] : [[12, py + 6], [13, py + 6], [14, py + 7]];
  for (const [x, y] of tail) g.set(x, y, P.hi);
  // 몸통 (팔 위로 보이는 가슴)
  g.rect(7, py + 5, 5, 2, P.mid);
  g.hline(8, 10, py + 5, CREAM.mid);
  // 머리
  g.hline(8, 10, py, P.hi);
  g.rect(7, py + 1, 5, 4, P.mid);
  g.hline(8, 10, py + 1, P.hi);
  g.set(11, py + 4, P.lo);
  // 늘어진 귀 (양옆 진한 털)
  for (const x of [6, 12]) {
    g.vline(x, py + 1, py + 3, P.lo);
    g.set(x, py + 4, P.deep);
  }
  // 얼굴: 눈 둘 · 크림 주둥이 · 코 · 분홍 혀
  g.set(8, py + 2, 0x1a1210);
  g.set(10, py + 2, 0x1a1210);
  g.hline(8, 10, py + 3, CREAM.hi);
  g.set(9, py + 3, 0x1a1210);
  g.set(9, py + 4, 0xf07a8a);
  g.set(8, py + 4, CREAM.mid);
  g.set(10, py + 4, CREAM.mid);
  // 크리스마스: 목에 빨간 리본 · 겨울: 작은 체크 목도리
  if (concept === "christmas") {
    g.hline(7, 11, py + 5, RED.mid);
    g.set(9, py + 5, RED.hi);
  } else if (concept === "winter") {
    for (let x = 7; x <= 11; x++) g.set(x, py + 5, x % 2 ? MINT.mid : CREAM.hi);
  }
  // 앞발 (팔 위에 얹은 크림 발)
  g.set(8, py + 6, CREAM.hi);
  g.set(10, py + 6, CREAM.hi);
  g.outline(NPC_OUT);
  return g;
}
/** 오른팔에 건 목줄 꾸러미 (둥글게 감은 산호색 줄 + 늘어진 하늘색 줄 끝 놋쇠 고리) */
function leashes(g: Grid, hy: number, body: Color): void {
  const y = hy + 5;
  // 오른손 (몸 옆으로 내민 뭉툭한 손)
  g.set(22, y, body);
  g.set(22, y + 1, darken(body, 0.12));
  // 감은 줄 고리 (손목에 걸려 아래로 둥글게)
  for (const [x, yy] of [[20, y + 2], [21, y + 2], [22, y + 3], [22, y + 4], [21, y + 5], [20, y + 5], [19, y + 4], [19, y + 3]] as const) g.set(x, yy, CORAL.mid);
  g.set(21, y + 2, CORAL.hi);
  g.set(19, y + 3, CORAL.hi);
  g.set(21, y + 5, CORAL.lo);
  g.set(22, y + 4, CORAL.lo);
  // 늘어진 하늘색 줄 + 놋쇠 고리
  g.vline(23, y + 6, y + 8, SKY.mid);
  g.set(23, y + 7, SKY.lo);
  g.set(23, y + 9, BRASS.hi);
  g.set(24, y + 9, BRASS.lo);
}

/** 멍냥 분양사: 30×32. frame 0·1 = 숨쉬기 (위 몸이 한 칸 내려앉고 자락이 일렁인다), 2·3 = 같은 숨쉬기 + 품의 강아지 꼬리 살랑 */
export function mungnyangSeller(frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const b = frame % 2;
  const wag = frame >= 2 ? 1 + b : 0;
  const xmas = concept === "christmas";
  const winter = concept === "winter";
  const g = new Grid(MUNGNYANG_SELLER_W, MUNGNYANG_SELLER_H);
  const body = 0xf0ebe0;
  const shade = darken(body, 0.16);
  const hy = 16 + b; // 머리 가운데
  // 유령 몸 (머리 + 몸 + 물결 자락) — 보따리상·목수 유령과 같은 몸
  g.ellipse(15, hy, 6, 6.2, body);
  g.rect(9, hy, 13, 27 - hy, body);
  for (let x = 9; x <= 21; x++) if ((x + frame) % 3 !== 0) g.set(x, 27, body);
  g.recolor((x, y) => x >= 19 && y > hy - 3, shade);
  g.recolor((x, y) => y >= 26 && x >= 17, shade);
  // 눈·볼·입 (웃는 입)
  for (const ex of [13, 17]) {
    g.set(ex, hy, 0x1a1620);
    g.set(ex, hy + 1, 0x1a1620);
  }
  g.set(12, hy + 2, 0xf0a0a8);
  g.set(18, hy + 2, 0xf0a0a8);
  g.set(14, hy + 3, 0x8a4a50);
  g.set(16, hy + 3, 0x8a4a50);
  g.set(15, hy + 4, 0x8a4a50);
  // 민트 앞치마 (가슴 받이 + 아래 넓게) · 앞주머니에 뼈다귀 간식
  const ap = TEAL;
  const ay = hy + 6;
  g.hline(12, 18, ay, ap.mid);
  g.rect(11, ay + 1, 9, 26 - ay, ap.mid);
  g.hline(12, 18, ay, ap.hi);
  g.vline(19, ay + 1, 26, ap.lo);
  g.hline(11, 19, 26, ap.lo);
  g.set(11, ay - 1, ap.lo);
  g.set(19, ay - 1, ap.lo);
  // 주머니 (오른쪽 아래) + 삐죽 나온 뼈다귀 간식 (양끝 혹)
  g.rect(14, ay + 3, 5, 26 - ay - 3, ap.lo);
  g.hline(14, 18, ay + 3, ap.deep);
  g.hline(15, 18, ay + 2, CREAM.mid);
  g.set(15, ay + 1, CREAM.hi);
  g.set(18, ay + 1, CREAM.hi);
  g.set(16, ay + 2, CREAM.hi);
  g.set(18, ay + 2, CREAM.lo);
  // 목도리 (겨울·크리스마스)
  if (winter) seasonScarf(g, 9, 21, hy + 5, { c: SAGE.mid, c2: CREAM.hi, pat: "check", thick: true });
  else if (xmas) seasonScarf(g, 9, 21, hy + 5, { c: RED.mid, c2: GREEN.mid, pat: "stripe", thick: true });
  // 강아지를 받친 왼팔 (몸에서 왼쪽으로 둥글게 — 강아지 엉덩이 아래)
  g.hline(6, 10, hy + 9, body);
  g.hline(7, 10, hy + 10, darken(body, 0.08));
  g.set(5, hy + 8, body);
  g.set(6, hy + 8, body);
  // 오른팔에 건 목줄
  leashes(g, hy, body);
  // 모자: 기본·겨울 = 고양이 귀 뜨개 모자 (외곽선 전에 — 몸과 한 덩이), 크리스마스 = 산타 모자
  if (!xmas) knitCap(g, hy, winter);
  g.outline(NPC_OUT);
  if (xmas) {
    const hat = new Grid(MUNGNYANG_SELLER_W, MUNGNYANG_SELLER_H);
    seasonHat(hat, 15, hy, 6, hy - 6, { kind: "santa" });
    hat.outline(NPC_OUT);
    g.draw(hat, 0, 0);
  }
  // 품에 안은 강아지 (몸 앞, 따로 윤곽)
  g.draw(heldPuppy(hy, wag, concept), 0, 0);
  shadow(g, 15, 29.5, 10, 1.4, 55);
  return g.toCanvas();
}

/** 네 프레임을 가로로 붙인 시트 (120×32) */
export function mungnyangSellerSheet(concept: MapConcept = "default"): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(MUNGNYANG_SELLER_W * MUNGNYANG_SELLER_FRAMES, MUNGNYANG_SELLER_H);
  for (let f = 0; f < MUNGNYANG_SELLER_FRAMES; f++) ctx.drawImage(mungnyangSeller(f, concept), f * MUNGNYANG_SELLER_W, 0);
  return canvas;
}

// ── 소품: 펫 방석 ──

/** 동그란 펫 방석 22×10 (치즈냥 식빵 자리). 겨울 = 체크 담요, 크리스마스 = 산타 털 테두리 + 금방울 */
export function mungnyangCushion(concept: MapConcept = "default"): HTMLCanvasElement {
  const W = MUNGNYANG_CUSHION_W;
  const g = new Grid(W, MUNGNYANG_CUSHION_H);
  const xmas = concept === "christmas";
  const rim = xmas ? RED : ROSE;
  // 테두리 (도넛) — 뒤쪽은 밝게, 앞쪽은 그늘
  g.ellipse(11, 5, 10, 3.9, rim.mid);
  g.recolor((_x, y) => y <= 2, rim.hi);
  g.recolor((_x, y) => y >= 7, rim.lo);
  // 안쪽 쿠션
  g.ellipse(11, 4.6, 7, 2.2, CREAM.mid);
  g.recolor((x, y) => y <= 3 && x > 5 && x < 16 && g.get(x, y) >>> 8 === CREAM.mid, CREAM.hi);
  if (concept === "winter") {
    // 체크 담요 (안쪽을 덮고 앞으로 한 자락)
    for (let y = 3; y <= 6; y++)
      for (let x = 4; x <= 17; x++) if (g.get(x, y) >>> 8 === CREAM.mid || g.get(x, y) >>> 8 === CREAM.hi) g.set(x, y, (x + y) % 2 ? SAGE.mid : CREAM.hi);
    g.set(15, 7, SAGE.mid);
    g.set(16, 7, CREAM.hi);
    g.set(15, 8, CREAM.hi);
  }
  if (xmas) {
    // 산타 털 테두리 (앞쪽 아랫단) + 금방울
    for (let x = 3; x <= 18; x++) if (g.filled(x, 8)) g.set(x, 8, hash2(x, 8, 3) < 0.3 ? 0xe6e2da : 0xfbf8f2);
    // 앞쪽 금방울 (2×2 + 가운데 홈)
    g.set(10, 7, BRASS.hi);
    g.set(11, 7, BRASS.mid);
    g.set(10, 8, BRASS.mid);
    g.set(11, 8, BRASS.lo);
  } else {
    // 앞쪽 발바닥 자수 (발가락 셋 + 발볼)
    for (const [x, y] of [[9, 7], [11, 7], [13, 7]] as const) g.set(x, y, CREAM.hi);
    g.hline(10, 12, 8, CREAM.hi);
  }
  g.outline(OUT, false, 230);
  // 겨울: 뒤쪽 테두리에 소복한 눈
  if (concept === "winter") topSnow(g, 0, 3, 7, 0.15);
  return g.toCanvas();
}

// ── 소품: 간식 상자 + 등불 ──

/** 간식 상자 18×26: 나무 상자(발바닥 도장) 위 유리 간식 통, 오른쪽 기둥에 매단 작은 등불 (밤 불빛 하나) */
export function mungnyangStand(concept: MapConcept = "default"): HTMLCanvasElement {
  const g = new Grid(MUNGNYANG_STAND_W, MUNGNYANG_STAND_H);
  const xmas = concept === "christmas";
  const winter = concept === "winter";
  // 나무 상자 (앞면 판자 셋)
  g.rect(1, 16, 15, 8, PINE.mid);
  g.hline(1, 15, 16, PINE.hi);
  g.hline(1, 15, 17, PINE.hi);
  g.hline(1, 15, 20, PINE.lo);
  g.vline(15, 17, 23, PINE.lo);
  g.vline(1, 18, 23, PINE.hi);
  g.hline(2, 14, 23, PINE.lo);
  // 앞면 발바닥 도장 (장밋빛, 발가락 셋 + 발볼)
  for (const [x, y] of [[6, 18], [8, 18], [10, 18]] as const) g.set(x, y, ROSE.mid);
  g.hline(7, 9, 19, ROSE.mid);
  g.set(8, 19, ROSE.lo);
  // 등불 기둥 (상자 오른쪽 뒤에 꽂아 위로 올린 막대 + 왼쪽으로 뻗은 고리 팔)
  g.vline(14, 3, 15, PINE.deep);
  g.vline(15, 3, 15, PINE.lo);
  g.hline(11, 14, 3, PINE.deep);
  g.set(14, 2, PINE.lo);
  g.set(15, 2, PINE.lo);
  // 매단 등불 (놋쇠 갓 + 유리 + 불꽃)
  const lx = 11;
  g.vline(lx, 4, 4, 0x3a3434);
  g.hline(lx - 1, lx + 1, 5, BRASS.lo);
  g.rect(lx - 1, 6, 3, 3, BRASS.mid);
  g.set(lx, 6, FLAME.hi);
  g.set(lx, 7, FLAME.mid);
  g.set(lx + 1, 7, BRASS.lo);
  g.hline(lx - 1, lx + 1, 9, BRASS.lo);
  // 유리 간식 통 (장밋빛 뚜껑 · 뼈다귀·생선 과자)
  g.rect(3, 10, 6, 6, ICE.mid);
  g.vline(3, 10, 15, ICE.hi);
  g.vline(8, 10, 15, ICE.lo);
  g.hline(3, 8, 9, ROSE.mid);
  g.hline(4, 7, 8, ROSE.hi);
  g.set(5, 7, ROSE.lo);
  g.set(6, 7, ROSE.lo);
  for (const [x, y, c] of [
    [4, 14, CREAM.mid],
    [5, 14, CREAM.lo],
    [6, 15, 0xc88a52],
    [7, 14, 0xc88a52],
    [5, 12, CREAM.hi],
    [6, 12, CREAM.mid],
    [7, 12, 0xe0a060],
    [4, 13, 0xc88a52],
    [6, 13, CREAM.lo],
  ] as const)
    g.set(x, y, c);
  g.set(4, 11, 0xffffff);
  if (xmas) {
    // 간식 통 빨간 리본 + 상자 모서리 호랑가시 + 기둥에 감은 빨강 줄
    g.hline(3, 8, 11, RED.mid);
    g.set(5, 10, RED.hi);
    g.set(6, 10, RED.mid);
    g.set(4, 10, RED.lo);
    g.set(7, 10, RED.lo);
    seasonHolly(g, 3, 17);
    for (let y = 5; y <= 14; y += 3) g.set(14, y, RED.mid);
  }
  g.outline(OUT, false, 235);
  if (winter) topSnow(g, 0, 17, 11, 0.1, 1, 16);
  if (winter) {
    // 상자 앞 아랫단에 작은 고드름
    for (const x of [4, 9, 12]) g.set(x, 24, ICE.hi);
  }
  shadow(g, 9, 24.6, 9, 1.3, 55);
  return g.toCanvas();
}

/** 간식 상자 불빛 (등불 하나) */
export function mungnyangStandLight(): MungnyangLight {
  return { x: 11, y: 7, c: 0xffb868, big: true };
}

/** 등불 빛무리 두 장 (가산 섞기로 얹는다, 은은히 일렁임 — seasonStallGlowSheet와 같은 짜임). 밤에만 쓰는 쪽에서 알파를 조절한다 */
export function mungnyangStandGlowSheet(): HTMLCanvasElement {
  const W = MUNGNYANG_STAND_W;
  const H = MUNGNYANG_STAND_H;
  const { canvas, ctx } = makeCanvas(W * 2, H);
  const l = mungnyangStandLight();
  for (let f = 0; f < 2; f++) {
    const R = f ? 9 : 8;
    const rgb = `${(l.c >> 16) & 255},${(l.c >> 8) & 255},${l.c & 255}`;
    const cx = f * W + l.x + 0.5;
    const cy = l.y + 0.5;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, `rgba(${rgb},0.8)`);
    gr.addColorStop(0.35, `rgba(${rgb},0.36)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  return canvas;
}

// ── 발치 펫 (BREED_ART 그림 + 계절 옷) ──

/** 펫 그림 위 여백 (산타 모자 끝이 잘리지 않게) — 원점이 바닥 가운데라 배치는 그대로 */
export const MUNGNYANG_PET_PAD = 3;

const sheetCache = new Map<BreedArtId, Grid>();
function breedSheet(id: BreedArtId): Grid {
  let s = sheetCache.get(id);
  if (!s) {
    s = BREED_ART[id].build();
    sheetCache.set(id, s);
  }
  return s;
}

/** 눈 자리 찾기: 옆모습은 눈 하나(또는 감은 눈 두 칸 붙음), 앞모습은 두 눈이 떨어져 있다 */
function findEyes(g: Grid): { side: boolean; x0: number; x1: number; y: number } | null {
  const pts: [number, number][] = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const v = g.get(x, y);
      if ((v & 255) === 255 && v >>> 8 === PET_EYE) pts.push([x, y]);
    }
  if (!pts.length) return null;
  const y = Math.min(...pts.map((p) => p[1]));
  const row = pts.filter((p) => p[1] === y).map((p) => p[0]);
  const x0 = Math.min(...row);
  const x1 = Math.max(...row);
  return { side: x1 - x0 <= 2, x0, x1, y };
}

/** 머리 가운데를 손볼 프레임 (식빵 굽는 치즈냥은 눈이 머리 가운데) */
const HEAD_NUDGE: Partial<Record<BreedArtId, Partial<Record<number, number>>>> = { pbCatCheese: { 4: 1, 5: 1 } };

/** 겨울 목도리 색 (품종마다 조금씩) */
const PET_SCARF: Partial<Record<BreedArtId, [Color, Color]>> = {
  pbCatCheese: [MINT.mid, CREAM.hi],
  pbDogShiba: [0xc8463c, CREAM.hi],
  pbDogCorgi: [SKY.mid, CREAM.hi],
};

/** 산타 모자 (꼭지는 뒤로 — 옆모습은 왼쪽, 앞모습은 오른쪽으로 늘어진다) */
function petSanta(g: Grid, cx: number, brim: number, side: boolean, wide: number): void {
  const fur = 0xfbf8f2;
  for (let x = cx - wide; x <= cx + wide; x++) g.set(x, brim, (x + brim) % 3 === 0 ? 0xe6e2da : fur);
  g.hline(cx - wide + 1, cx + wide - 1, brim - 1, RED.mid);
  g.set(cx + wide - 1, brim - 1, RED.lo);
  if (side) {
    g.hline(cx - 1, cx + 1, brim - 2, RED.mid);
    g.set(cx + 1, brim - 2, RED.lo);
    g.set(cx - 2, brim - 2, RED.hi);
    g.set(cx - 3, brim - 1, fur); // 방울
  } else {
    g.hline(cx - 1, cx + 1, brim - 2, RED.mid);
    g.set(cx - 1, brim - 2, RED.hi);
    g.set(cx + 2, brim - 2, RED.lo);
    g.set(cx + 3, brim - 1, fur); // 방울
  }
}

/** 펫 목도리: 머리 아래 한두 줄을 칠해진 털 칸만 덮고, 한 자락을 늘어뜨린다 */
function petScarf(g: Grid, xs: number, xe: number, y: number, rows: number, c: Color, c2: Color, tailX: number): void {
  const solid = (x: number, yy: number) => (g.get(x, yy) & 255) === 255;
  for (let r = 0; r < rows; r++)
    for (let x = xs; x <= xe; x++) if (solid(x, y + r)) g.set(x, y + r, (x + r) % 2 ? c2 : c);
  for (let i = 1; i <= 2; i++) if (solid(tailX, y + rows - 1 + i) || i === 1) g.set(tailX, y + rows - 1 + i, i === 2 ? c2 : darken(c, 0.15));
}

/**
 * 발치 펫 한 장: BREED_ART 시트의 frame 칸을 잘라, 겨울엔 목도리·크리스마스엔 산타 모자를 얹는다.
 * 크기 = 품종 프레임 (w) × (h + MUNGNYANG_PET_PAD), 원점 = 바닥 가운데 (그림은 오른쪽을 본다 — 왼쪽은 좌우 반전).
 */
export function mungnyangPet(id: BreedArtId, frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const art = BREED_ART[id];
  const sheet = breedSheet(id);
  const P = MUNGNYANG_PET_PAD;
  const g = new Grid(art.w, art.h + P);
  for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) g.px[(y + P) * art.w + x] = sheet.px[y * sheet.w + frame * art.w + x];
  if (concept === "default") return g.toCanvas();
  const eye = findEyes(g);
  if (!eye) return g.toCanvas();
  const acc = new Grid(g.w, g.h);
  const nudge = HEAD_NUDGE[id]?.[frame] ?? 0;
  const cx = eye.side ? eye.x0 - 1 + nudge : Math.round((eye.x0 + eye.x1) / 2);
  if (concept === "christmas") {
    petSanta(acc, cx, eye.y - 2, eye.side, eye.side ? 2 : 3);
    acc.outline(NPC_OUT, false, 220);
    g.draw(acc, 0, 0);
  } else {
    const [c, c2] = PET_SCARF[id] ?? [0xc8463c, CREAM.hi];
    if (eye.side) petScarf(g, cx - 2, cx + 0, eye.y + 2, 2, c, c2, cx - 2);
    else petScarf(g, eye.x0 - 1, eye.x1 + 1, eye.y + 3, 1, c, c2, eye.x1);
  }
  return g.toCanvas();
}

export type MungnyangPetSpot = {
  art: BreedArtId;
  /** 분양사 발 기준 자리 (원점 = 바닥 가운데) */
  dx: number;
  dy: number;
  /** 제자리 프레임 순서 + 한 칸 시간 */
  idle: readonly number[];
  ms: number;
  /** 가끔 하는 동작 (every ms마다 한 번) */
  act?: { frames: readonly number[]; ms: number; every: number };
  /** 돌아다니기 (분양사 앞을 좌우로 오가다 끝에서 쉬고 가끔 동작) */
  wander?: { x0: number; x1: number; speed: number; walk: readonly number[]; walkMs: number; restMs: number };
  /** 그림 좌우 반전 (왼쪽을 본다) */
  flip?: boolean;
};

/**
 * 발치 펫 세 마리 배치·움직임 제안 (시안에서 쓴 값, 분양사 자리 (96,764) 기준 — 왼쪽부터 간식 상자 · 시바 · 분양사 · 방석 치즈냥):
 *  - 시바: 분양사 왼쪽에 앉아 손님을 본다 (앞모습 앉기 8·9 깜빡), 9초마다 옆으로 앉았다 엎드려 빼꼼 (2·4·5)
 *  - 치즈냥: 오른쪽 방석에서 분양사 쪽을 보고 식빵 굽다 꾸벅 (옆모습 4·5, 좌우 반전)
 *  - 코기: 분양사 앞을 좌우로 종종 오가다(걷기 0·1, 14px/s) 끝에서 앉아 쉬고(2·3) 두 번에 한 번 엎드려 꼬리 흔들기(4·5)
 */
// 이름: protocol의 MUNGNYANG_PETS(판매 목록)와 헷갈리지 않게 「마당 펫」으로 부른다
export const MUNGNYANG_YARD_PETS: readonly MungnyangPetSpot[] = [
  { art: "pbDogShiba", dx: -20, dy: 3, idle: [8, 8, 8, 9, 8, 8], ms: 560, act: { frames: [2, 4, 5, 4, 5, 4, 2], ms: 420, every: 9000 } },
  { art: "pbCatCheese", dx: 26, dy: 1, idle: [4, 4, 4, 4, 5, 5, 4, 4], ms: 520, flip: true },
  { art: "pbDogCorgi", dx: 0, dy: 9, idle: [2, 2, 3, 2], ms: 500, act: { frames: [4, 5, 4, 5, 4, 5, 4], ms: 200, every: 2 }, wander: { x0: -26, x1: 10, speed: 14, walk: [0, 1], walkMs: 110, restMs: 2600 } },
];
/** 방석·간식 상자 자리 (분양사 발 기준) */
export const MUNGNYANG_CUSHION_AT = { dx: 26, dy: 2 } as const;
export const MUNGNYANG_STAND_AT = { dx: -38, dy: 1 } as const;
