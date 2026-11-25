import type { GearM } from "./avatarGear";
import { darken, Grid, hash2, lighten, type Color } from "./pixel";
import { bigBody, clampX, dot, FIT_X0, FIT_X1, FIT_Y1, halfAt, iconOf, neckHalf as kitNeckHalf, objectBody, over, safe, SAFE_TOP, type FB, type SsItem, type V } from "./seasonSetKit";

// 11/22 골목 붕어빵 수레 한정 꾸미기 중 "아바타 시트에 같이 그려지는 것" + 새 외형 「붕어빵 장수 유령」(vendor) 덧그림.
// 코디 기획안 시안(cos-korea items/set1·set2·solo·vendor) 코드를 옮겼다 — 모양·색은 시안 그대로 (헤드폰·비니·옆모습 리본만 다듬었다).
//  「캠퍼스 후드핏」 워싱 볼캡 · 오버핏 후드티 · 목에 건 헤드폰 · 얼죽아 컵 (운동화 발자국은 bungeoFx.ts)
//  「겨울 데이트룩」 골지 니트 비니 · 캐멀 롱코트 · 체크 머플러 · 붕어빵 봉투 (거리 전구 오라는 bungeoFx.ts)
//  낱개 겉옷 꽈배기 니트 · 뽀글이 플리스
//  외형 「붕어빵 장수 유령」: bd_vendor_base(누빔 조끼 — 몸통) · bd_vendor(앞치마·머리 수건·집게 붕어빵) — avatarCore drawFrame이
//  vendor 몸이면 이 두 가짜 id를 붙여 그린다 (착용 목록에는 오지 않는다). 프레임마다 색·착용 상태는 setBungeoCtx로 받는다.
// 시트 칠은 모두 아바타 칸 안 (x 1~18, y 26 이하 — seasonSetBounds.test). seasonSetGear.ts가 GEAR4·ICONS4를 합친다.

// ── 그림 도우미 (시안 pk.ts·wear.ts와 같다) ──

/** 안전 범위 밖 칠은 버린다 (앉은 자세처럼 몸이 내려가는 드문 프레임용 마지막 안전망) */
function fit(g: Grid): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, {
    set: (x: number, y: number, c: Color, a?: number) => (x >= FIT_X0 && x <= FIT_X1 && y <= FIT_Y1 && y >= SAFE_TOP ? set(x, y, c, a) : undefined),
  });
}
const brush = (g: Grid) => fit(safe(g));

type W = { v: V; m: GearM; fb: FB; body: string; hem: number; sit: number };

/** 사다리꼴 몸통 위·아래 줄 */
function torsoTB(w: W, long = 0): { top: number; bot: number } {
  const tall = w.fb === "tall";
  const sitDrop = w.sit === 1 ? 3 : w.sit === 2 ? 2 : 0;
  const top = w.body === "suit" ? w.m.neck : (tall ? 13 : 18) + sitDrop;
  const bot = Math.min(26, (w.sit === 1 ? 26 : 24 + (w.sit === 2 ? 1 : 0)) + (w.sit ? 0 : long));
  return { top, bot };
}

/** 사다리꼴 몸통 한 줄의 [왼쪽, 오른쪽) — npcWear cloakSpan과 같다 */
function span(w: W, y: number): [number, number] {
  const { cx } = w.m;
  if (w.body === "suit") {
    const half = w.v === "side" ? 4 : 5;
    return [cx - half, cx + half];
  }
  const tall = w.fb === "tall";
  const sitDrop = w.sit === 1 ? 3 : w.sit === 2 ? 2 : 0;
  const top = (tall ? 13 : 18) + sitDrop;
  const spread = w.sit === 1 ? (tall ? 0.55 : 0.75) : tall ? 0.3 : 0.5;
  const hw = (tall ? 2.5 : 3) + (y - top) * spread;
  return [Math.floor(cx - hw), Math.ceil(cx + hw)];
}

/** 동글이 공 안인지 */
function inBall(w: W, x: number, y: number): boolean {
  const ry = w.sit ? 5.5 : 6;
  return ((x + 0.5 - w.m.cx) / 6.5) ** 2 + ((y + 0.5 - w.m.hy) / ry) ** 2 <= 1;
}

/** 큰 몸(동글이·이불)에서 겉옷이 시작하는 줄 */
const bigTop = (w: W) => Math.round(w.m.hy) + (w.fb === "round" ? 2 : 4);

type Cell = { x: number; y: number; k: number; l: number; r: number; top: number; bot: number };

/**
 * 몸통을 겉옷으로 칠한다 (큰 몸은 이미 칠해진 칸만). col이 null이면 그 칸은 건너뛴다.
 * pad(y) = 그 줄에서 사다리꼴보다 양옆으로 더 넓힐 칸 (오버핏)
 */
function paintTorso(g: Grid, w: W, col: (c: Cell) => Color | null, opt: { long?: number; pad?: (y: number, k: number, bot: number) => number } = {}): { top: number; bot: number } {
  if (w.fb === "sheet" || w.fb === "round") {
    const top = bigTop(w);
    let bot = top;
    for (let y = top; y < 27; y++) for (let x = 1; x <= 18; x++) if (g.filled(x, y) && (w.fb === "sheet" || inBall(w, x, y))) bot = Math.max(bot, y);
    for (let y = top; y <= bot; y++) {
      let l = 99;
      let r = -1;
      for (let x = 1; x <= 18; x++)
        if (g.filled(x, y) && (w.fb === "sheet" || inBall(w, x, y))) {
          l = Math.min(l, x);
          r = Math.max(r, x + 1);
        }
      for (let x = l; x < r; x++) {
        if (!g.filled(x, y)) continue;
        const c = col({ x, y, k: y - top, l, r, top, bot });
        if (c !== null) g.set(x, y, c);
      }
    }
    return { top, bot };
  }
  const { top, bot } = torsoTB(w, opt.long ?? 0);
  for (let y = top; y <= bot; y++) {
    const [l0, r0] = span(w, y);
    const p = opt.pad?.(y, y - top, bot) ?? 0;
    const l = Math.max(1, l0 - (w.v === "side" ? Math.min(p, 1) : p));
    const r = Math.min(19, r0 + p);
    for (let x = l; x < r; x++) {
      const c = col({ x, y, k: y - top, l, r, top, bot });
      if (c !== null) g.set(x, y, c);
    }
  }
  return { top, bot };
}

const neckHalf = (fb: FB) => kitNeckHalf(fb);
/** 목 줄 (큰 몸은 얼굴 아래) */
const neckY = (w: { m: GearM; fb: FB }) => (w.fb === "round" ? Math.round(w.m.hy) + 2 : w.fb === "sheet" ? Math.round(w.m.hy) + 4 : w.m.neck);

/** 두건·키다리의 기본 천 목도리 늘어진 끝(포인트 색 두 점)을 겉옷 색으로 덮는다 (겉옷 깃 안으로 들어간 것처럼) */
function hideScarfTail(g: Grid, v: V, m: GearM, body: string, c: Color): void {
  if (body !== "hood" && body !== "tall") return;
  const { cx, neck } = m;
  if (v === "down") {
    g.set(cx + 2, neck + 1, c);
    g.set(cx + 2, neck + 2, c);
  } else if (v === "up") {
    g.set(cx - 2, neck + 1, c);
    g.set(cx - 2, neck + 2, c);
  } else {
    const half = body === "tall" ? 3 : 4;
    if (g.filled(cx - half, neck + 1)) g.set(cx - half, neck + 1, c);
    if (g.filled(cx - half, neck)) g.set(cx - half, neck, c);
  }
}

// ── 프레임 상태 (외형 덧그림이 읽는다 — avatarCore drawFrame 시작에 seasonSetGear ssFrameCtx가 넣는다) ──

export type BungeoCtx = {
  /** 포인트 색 (염색 전이면 null → 앞치마 기본 다홍) */
  accent: Color | null;
  /** 몸 부위 색 (염색 전이면 외형 기본 남색) */
  body: Color | null;
  /** 이 프레임에 그리는 계절·골목 꾸미기 id */
  ids: readonly string[];
  /** 다른 머리 꾸미기·모자를 썼다 (수건을 벗는다) */
  headBusy: boolean;
  /** 손에 다른 것을 들었다 (집게 붕어빵을 내려놓는다) */
  handBusy: boolean;
  /** 목에 다른 것을 했다 (조끼 깃을 그리지 않는다) */
  neckBusy: boolean;
};
const CTX: BungeoCtx = { accent: null, body: null, ids: [], headBusy: false, handBusy: false, neckBusy: false };
export function setBungeoCtx(c: BungeoCtx): void {
  Object.assign(CTX, c);
}

// ══ 「캠퍼스 후드핏」 ══

// ── 워싱 볼캡 ──
const CAP = 0x6f84a6;
const CAP_HI = 0x93a6c4;
const CAP_LO = 0x55688c;
const CAP_DEEP = 0x40506e;
const CAP_WASH = 0xa6b5cc;
const STITCH = 0xdfe6ef;
const EMB = 0xf6efdc;
const EMB_PINK = 0xf2a0b4;

/** 물 빠진 얼룩: 칸마다 정해진 자리만 살짝 밝게 */
const washed = (x: number, y: number, c: Color) => (hash2(x, y, 71) < 0.16 ? CAP_WASH : hash2(x, y, 73) < 0.12 ? CAP_HI : c);

function capHead(g0: Grid, v: V, m: GearM, top: number, fb: FB): void {
  const g = brush(g0);
  const { cx } = m;
  // 11/25 운영자 「귀 빠져나오는 모양이 다르다·뒷모습 원근감이 이상함」: 고양이 귀(위 세 줄, 바깥 끝이 뾰족)가 크라운 안에 덮여
  // 모자에 붙인 무늬처럼 보였다 → 고양이 몸이면 크라운 위 두 줄을 비워 양쪽 귀만 모자 위로 솟게 한다 (가운데 돔도 더듬이처럼 보여 뺐다)
  const catEars = fb === "cat";
  // 낮은 크라운: 머리 윗면 위로 두 줄 돔이 솟고, 아래 세 줄은 머리 폭 그대로 감싼다
  // 11/25 운영자 「너무 넙대대」→ 머리보다 한 칸씩 넓던 폭을 머리 폭으로 (세 줄 돔은 「너무 둥글다」로 두 줄 유지, 시안 A)
  const back = v === "side" ? -1 : 0;
  const H = Math.round(m.rx);
  const rowsH: [number, number][] = [
    [top - 2, H - 2],
    [top - 1, H - 1],
    [top, H],
    [top + 1, H],
    [top + 2, H],
  ];
  for (const [y, h] of rowsH)
    for (let x = cx - h + back; x < cx + h + back; x++) {
      if (catEars && y < top) continue;
      const edgeL = x === cx - h + back;
      const edgeR = x >= cx + h + back - 2;
      g.set(x, y, edgeR ? (x === cx + h + back - 1 ? CAP_DEEP : CAP_LO) : edgeL ? CAP_HI : y === top - 2 ? CAP_HI : washed(x, y, CAP));
    }
  // 꼭지 단추 (고양이 귀 사이 낮은 돔이면 없다 — 귀보다 솟아 보인다)
  if (!catEars) {
    g.set(cx - 1 + back, top - 3, CAP_LO);
    g.set(cx + back, top - 3, CAP_DEEP);
  }
  const by = top + 3;
  if (v === "down") {
    // 앞판 가운데 박음질. 꽃 자수는 11/25 운영자 「캡 가운데 뭐가 보인다」로 뺐다 — 크림·분홍 세 땀이 이 크기에선 얼룩·더듬이처럼 보였다 (상점 아이콘에는 그대로)
    if (!catEars) {
      g.set(cx - 1, top - 2, CAP_LO);
      g.set(cx - 1, top - 1, CAP_LO);
    }
    g.set(cx - 1, top, CAP_LO);
    // 둥근 챙: 크라운보다 양옆 한 칸씩 튀어나오고 + 가운데가 한 줄 더 내려온다 (위 박음질 선, 아래 그늘)
    // 11/25 운영자 「챙 약간 튀어나와 있는 건?」: 예전엔 크라운과 폭이 같아 띠처럼 보였다
    for (let x = cx - H - 1; x <= cx + H; x++) g.set(x, by, x === cx - H - 1 ? CAP_HI : x >= cx + H ? CAP_DEEP : (x + 40) % 2 === 0 ? 0x8a9cbc : CAP);
    for (let x = cx - H + 1; x < cx + H - 1; x++) g.set(x, by + 1, x >= cx + H - 3 ? CAP_DEEP : CAP_LO);
  } else if (v === "side") {
    // 옆: 챙이 얼굴 앞으로 길게 뻗는다 (위 박음질, 아래 그늘)
    const x1 = Math.min(18, cx + H + 2);
    for (let x = cx - 1; x <= x1; x++) {
      g.set(x, by, x === x1 ? CAP_LO : (x + 40) % 2 === 0 ? 0x8a9cbc : CAP);
      if (x > cx + 1 && x < x1) g.set(x, by + 1, CAP_DEEP);
    }
    g.set(cx - 3, top + 1, CAP_DEEP);
  } else {
    // 뒤: 조절 끈 반달 구멍 + 은색 버클
    g.set(cx - 2, top + 2, CAP_DEEP);
    g.set(cx - 1, top + 1, CAP_DEEP);
    g.set(cx, top + 1, CAP_DEEP);
    g.set(cx + 1, top + 2, CAP_DEEP);
    g.set(cx - 1, top + 2, 0xd4d8e0);
    g.set(cx, top + 2, 0x9aa0aa);
  }
}
function capIcon(): Grid {
  return iconOf(
    [
      ".....dd.......",
      "...hhhhhhh....",
      "..hcccwcccl...",
      ".hcwccccwccl..",
      ".hcepcccccll..",
      ".hcecccwccdl..",
      ".hccccccccdl..",
      "sbsbsbsbsbsbd.",
      "..bbbbbbbbbbbd",
      "...ddddddddd..",
    ],
    { c: CAP, h: CAP_HI, l: CAP_LO, d: CAP_DEEP, w: CAP_WASH, e: EMB, p: EMB_PINK, s: STITCH, b: CAP },
  );
}

// ── 오버핏 후드티 ──
const HD = 0xa9abb2;
const HD_HI = 0xc8cad0;
const HD_LO = 0x868891;
const HD_DEEP = 0x676973;
const CORD = 0xf2eee6;
const CORD_LO = 0xc8c2b6;

const heather = (x: number, y: number, c: Color) => (hash2(x, y, 91) < 0.14 ? HD_HI : hash2(x, y, 93) < 0.12 ? HD_LO : c);

function hoodieBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  const { cx, neck } = m;
  const w: W = { v, m, fb, body, hem, sit };
  if (layer === "back") {
    // 옆모습: 등 뒤로 넘긴 후드 뭉치 (안쪽 그늘이 보인다)
    if (v === "side" && !bigBody(fb)) {
      const y0 = neck - 3;
      for (let y = y0; y <= neck; y++) for (let x = cx - 6; x <= cx - 4; x++) g.set(x, y, x === cx - 6 ? HD_HI : y === y0 ? HD : heather(x, y, HD));
      g.set(cx - 5, y0 + 1, HD_DEEP);
      g.set(cx - 4, y0 + 1, HD_DEEP);
      g.set(cx - 6, y0, HD);
    }
    return;
  }
  if (objectBody(body)) return;
  const big = bigBody(fb);
  // 몸통: 오버핏 (양옆으로 한 칸씩 넓게, 밑단 두 줄은 골지) + 소매가 손을 덮는다
  const { top, bot } = paintTorso(
    g,
    w,
    ({ x, y, l, r, bot }) => {
      if (y === bot) return (x + 40) % 2 ? HD_LO : HD;
      if (x === l) return HD_HI;
      if (x >= r - 2) return HD_LO;
      return heather(x, y, HD);
    },
    { pad: (_y, k, b) => (k >= 1 && _y <= b - 2 ? 1 : 0) },
  );
  if (big) {
    // 큰 몸: 가운데 끈 두 줄 + 캥거루 주머니 선
    if (v === "down") {
      for (const x of [cx - 2, cx + 1]) {
        g.set(x, top, CORD);
        g.set(x, top + 1, CORD);
        g.set(x, top + 2, CORD_LO);
      }
      g.hline(cx - 3, cx + 2, Math.min(bot - 1, top + 3), HD_DEEP);
    } else if (v === "up") g.hline(cx - 3, cx + 2, top, HD_DEEP);
    return;
  }
  // 소매 경계(안쪽 박음질)와 소매 끝 골지 — 손이 소매 속에 쏙
  const cuffY = bot - 2;
  if (v !== "side") {
    for (let y = top + 2; y <= cuffY; y++) {
      const [l0, r0] = span(w, y);
      g.set(l0, y, HD_LO);
      g.set(r0 - 1, y, HD_DEEP);
    }
    const [l0, r0] = span(w, cuffY);
    g.set(clampX(l0 - 1), cuffY, HD_DEEP);
    g.set(clampX(l0 - 1), cuffY - 1, HD_LO);
    g.set(clampX(r0), cuffY, HD_DEEP);
    g.set(clampX(r0), cuffY - 1, HD_LO);
  } else {
    // 옆: 몸 가운데로 내려오는 소매 + 앞으로 둥근 소매 끝
    for (let y = top + 2; y < cuffY; y++) g.set(cx - 1, y, HD_LO);
    g.set(cx, cuffY, HD_DEEP);
    g.set(cx - 1, cuffY, HD_DEEP);
    g.set(cx + 1, cuffY, HD_LO);
  }
  if (v === "down") {
    // 캥거루 주머니 (윗선 + 양옆 비스듬한 입구)
    const py = bot - 2;
    g.hline(cx - 2, cx + 1, py - 1, HD_LO);
    g.set(cx - 3, py, HD_DEEP);
    g.set(cx + 2, py, HD_DEEP);
  } else if (v === "side") {
    const [, r0] = span(w, bot - 2);
    g.set(r0 - 2, bot - 3, HD_DEEP);
  } else {
    // 뒤: 등에 늘어진 후드 (방패 모양 + 안쪽 그늘 선)
    const ys = [neck, neck + 1, neck + 2, neck + 3];
    const halfs = [4, 4, 3, 2];
    ys.forEach((y, i) => {
      const h = halfs[i] - (fb === "tall" ? 1 : 0);
      for (let x = cx - h; x < cx + h; x++) g.set(x, y, x === cx - h || x === cx + h - 1 || i === ys.length - 1 ? HD_LO : i === 0 ? HD_HI : heather(x, y, HD));
    });
    g.set(cx - 1, neck + 3, HD_DEEP);
    g.set(cx, neck + 3, HD_DEEP);
  }
}

/** 목: 두툼한 후드 목둘레 + 끈 두 줄(끝 마개) — 앞을 가리는 몸은 목깃만 */
function hoodieNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const big = bigBody(fb);
  const y = neckY({ m, fb });
  const half = neckHalf(fb) + (objectBody(body) ? 1 : 0);
  if (big && !objectBody(body)) return; // 큰 몸은 몸통에서 다 그렸다
  if (!objectBody(body)) hideScarfTail(g, v, m, body, HD);
  if (v === "up") {
    for (let x = cx - half; x < cx + half; x++) {
      g.set(x, y, x >= cx + half - 2 ? HD_LO : HD_HI);
      g.set(x, y - 1, (x + 40) % 2 ? HD : HD_HI);
    }
    return;
  }
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  const x1 = cx + half - 1;
  for (let x = x0; x <= x1; x++) g.set(x, y, x === x0 ? HD_HI : x >= x1 - 1 ? HD_LO : HD);
  // 후드가 목 양옆에서 불룩 (뒤로 넘긴 후드 가장자리)
  if (v === "down") {
    g.set(x0, y - 1, HD_HI);
    g.set(x1, y - 1, HD_LO);
    for (const x of [cx - 2, cx + 1]) {
      g.set(x, y, CORD_LO);
      g.set(x, y + 1, CORD);
      g.set(x, y + 2, CORD);
    }
    g.set(cx - 2, y + 3, CORD_LO);
    g.set(cx + 1, y + 2, CORD_LO);
  } else {
    g.set(x1 - 1, y + 1, CORD);
    g.set(x1 - 1, y + 2, CORD_LO);
  }
}
function hoodieIcon(): Grid {
  // 앞에서 본 오버핏 후드티: 위로 넘긴 후드 테 · 끈 두 줄 · 처진 어깨와 긴 소매(골지 소매 끝) · 캥거루 주머니 · 골지 밑단
  return iconOf(
    [
      "....hHHHHl....",
      "...hHkkkkHl...",
      "..hhHHkkHHll..",
      ".hhHHHcHcHHll.",
      "hhHHHHcHcHHHll",
      "hHlHHHCHCHHlLl",
      "hHlHHHHHHHHlLl",
      "hHlHHHHHHHHlLl",
      "hHlHdddddHHlLl",
      "rrlHdHHHHdHlrr",
      "rr.HHHHHHHH.rr",
      "...rrrrrrrr...",
    ],
    { h: HD_HI, H: HD, l: HD_LO, L: HD_DEEP, d: HD_DEEP, k: 0x5a5c66, c: CORD, C: CORD_LO, r: HD_LO },
  );
}

// ── 목에 건 큰 무선 헤드폰 ──
// 11/22 다듬기: 시안 컵(3×3)이 1배에서 작게 읽혀 → 컵을 한 줄 길게(3×4) + 쿠션을 더 짙게, 바깥 판에 밝은 테,
//  목 앞 밴드는 짙은 색이면 외곽선·허리띠처럼 묻혀 → 크림 밴드(아래 그늘)로 컵과 한 덩어리로 읽히게
const PH = 0xf0e9dc;
const PH_HI = 0xffffff;
const PH_LO = 0xc8bca8;
const PH_CUSH = 0x2c2826;
const PH_BAND = 0x2c2826;
const PH_BAND_HI = 0x4a4440;
const PH_METAL = 0xaab0ba;

function phonesNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const y = neckY({ m, fb });
  const half = neckHalf(fb) + (objectBody(body) && !bigBody(fb) ? 1 : 0);
  // 귀 컵 (3×4): 둥근 바깥 판(크림 + 밝은 테) + 목 쪽·아래로 짙은 쿠션, 위에 은색 슬라이더 (밴드는 목 뒤로 넘어가 안 보인다)
  const cup = (x: number, d: 1 | -1) => {
    // d = 쿠션이 보이는 쪽 (1 = 오른쪽)
    const X = (i: number) => (d > 0 ? x + i : x + 2 - i);
    g.set(X(1), y - 1, PH_METAL);
    g.set(X(0), y, PH_HI);
    g.set(X(1), y, PH);
    g.set(X(2), y, PH_CUSH);
    g.set(X(0), y + 1, PH_HI);
    g.set(X(1), y + 1, PH);
    g.set(X(2), y + 1, PH_CUSH);
    g.set(X(0), y + 2, PH);
    g.set(X(1), y + 2, PH_LO);
    g.set(X(2), y + 2, PH_CUSH);
    g.set(X(0), y + 3, PH_LO);
    g.set(X(1), y + 3, PH_CUSH);
  };
  if (v === "down") {
    // 목 앞으로 늘어진 짙은 밴드 (U자) — 크림 컵 두 개를 아래에서 잇는다
    const l = cx - half - 1;
    const r = cx + half;
    for (let x = l + 1; x <= r - 1; x++) {
      const d = Math.min(x - l, r - x);
      g.set(x, y + 2 + (d >= 3 ? 1 : 0), d >= 3 ? PH_LO : PH);
    }
    cup(clampX(l), 1);
    cup(Math.min(FIT_X1 - 2, r - 2), -1);
  } else if (v === "side") {
    // 옆: 앞쪽 컵 하나가 턱 밑 가슴에, 뒤로 밴드 한 줄
    const x = Math.min(16, cx + half - 3);
    for (let xx = cx - half; xx < x; xx++) g.set(xx, y + 2, PH_BAND);
    cup(x, -1);
  } else {
    // 뒤: 목 뒤로 두른 밴드 + 양옆 컵 끝
    for (let x = cx - half; x < cx + half; x++) g.set(x, y, x === cx - half ? PH_BAND_HI : PH_BAND);
    for (const x of [clampX(cx - half - 1), Math.min(FIT_X1, cx + half)]) {
      g.set(x, y - 1, PH_METAL);
      g.set(x, y, PH);
      g.set(x, y + 1, PH_LO);
      g.set(x, y + 2, PH_CUSH);
    }
  }
}
function phonesIcon(): Grid {
  return iconOf(
    [
      "....bbbbbb....",
      "..bBBBBBBBBb..",
      ".bB........Bb.",
      ".b..........b.",
      ".m..........m.",
      "hpp........pph",
      "hpk........kph",
      "hpk........kph",
      "hpk........kph",
      "lpp........ppl",
      ".ll........ll.",
    ],
    { b: PH_BAND, B: PH_HI, m: PH_METAL, h: PH_HI, p: PH, k: PH_CUSH, l: PH_LO },
  );
}

// ── 얼죽아 컵 (크게): 투명 테이크아웃 컵 + 얼음 가득 아이스 아메리카노 + 빨대 ──
const GLASS = 0xe4eef5;
const GLASS_HI = 0xffffff;
const GLASS_LO = 0xaec2d2;
const COF = 0x5a3322;
const COF_LO = 0x3a1e14;
const ICE = 0xb88c68;
const ICE_HI = 0xf4ebe2;
const STRAW = 0x2f5f4a;
const STRAW_HI = 0x4f8a6c;

/** 컵 그림 (가로 5 · 세로 10, 빨대 포함 12) — x = 왼쪽 끝, y = 맨 위 뚜껑 줄. 벽은 얇은 유리빛, 속은 얼음 가득 아메리카노 */
const CUP_ART = ["....S", "...s.", "lLLLL", "gIbIG", "gcIiG", "giccG", "gcIcG", "gccCG", "giCcG", ".cCC.", ".dCd."];
const CUP_PAL: Record<string, Color> = { s: STRAW, S: STRAW_HI, l: GLASS_HI, L: GLASS, g: 0xd2e2ee, G: GLASS_LO, I: ICE_HI, b: 0xc4d8e8, i: ICE, c: COF, C: COF_LO, d: GLASS_LO };

function cupPlace(v: V, m: GearM): { x: number; y: number } {
  // 손 자리에 컵 아래쪽 1/3을 쥔다. 오른쪽 끝은 칸 안(x 18), 얼굴(머리 오른쪽 끝)과 겹치지 않게 머리 옆으로
  const bottom = Math.min(26, m.hY + 3);
  let x = Math.min(m.hx - 1, 14);
  const headR = Math.ceil(m.cx + m.rx);
  // 컵 윗부분이 머리 높이에 걸리면 머리 오른쪽 끝 바깥으로
  if (bottom - 10 < m.hy + m.ry) x = Math.max(x, Math.min(14, headR));
  if (v === "side") x = Math.min(14, Math.max(x, headR));
  return { x, y: bottom - 10 };
}
function cupHand(g0: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const g = brush(g0);
  const { x: x0, y } = cupPlace(v, m);
  // 넓은 머리(동글이·이불·머그잔·튜브) 옆모습: 얼굴을 덮지 않게 한 칸 좁힌 그림을 한 칸 오른쪽에
  const narrow = v === "side" && m.cx + m.rx > 15;
  const x = narrow ? x0 + 1 : x0;
  (narrow ? CUP_ART.map((r) => r.slice(0, 2) + r.slice(3)) : CUP_ART).forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === "." || CUP_PAL[ch] === undefined) return;
      g.set(x + i, y - 1 + j, CUP_PAL[ch]);
    }),
  );
}
function cupGlow(g: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const { x: x0, y } = cupPlace(v, m);
  const x = v === "side" && m.cx + m.rx > 15 ? x0 + 1 : x0;
  // 유리 반짝 + 물방울 (외곽선 위에 밝게)
  if (y + 3 >= SAFE_TOP) g.set(x, y + 3, 0xffffff);
  dot(g, x + 3, y + 7, 0xffffff, 150);
}
function cupIcon(): Grid {
  return iconOf(
    [
      "......sS..",
      "......s...",
      ".....s....",
      ".lLLLLLLl.",
      ".LLLLLLLG.",
      ".gIiIIiIG.",
      ".gIIiIIiG.",
      ".gcIcIIcG.",
      ".gCcIcIcG.",
      ".gcIcCcCG.",
      "..ccCcCc..",
      "..cCcCcC..",
      "..ccCcCC..",
      "...dCCd...",
    ],
    { ...CUP_PAL },
    (g, ox, oy) => {
      g.set(ox + 1, oy + 5, 0xffffff);
      g.set(ox + 1, oy + 6, 0xffffff);
      g.set(ox + 8, oy + 9, 0xffffff, 170);
    },
  );
}

// ── 운동화 발자국 (그림 재료 — 움직임은 bungeoFx.ts): 물결 무늬 밑창 + 뒤꿈치 ──
const SOLE = [".aa.", "abba", "aaaa", "abba", ".aa.", "....", ".aa.", ".ba."];
/** 밑창 자국 한 장 (4×8) */
export function soleGrid(flip: boolean, a: number): Grid {
  const g = new Grid(4, 8);
  SOLE.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === ".") return;
      g.set(flip ? 3 - x : x, y, ch === "a" ? 0x7a8292 : 0xc8ccd6, ch === "a" ? a : a - 30);
    }),
  );
  return g;
}
function sneakerIcon(): Grid {
  const g = new Grid(16, 16);
  const big = [".aaaa.", "abbbba", "aaaaaa", "abbbba", "aaaaaa", "abbbba", ".aaaa.", "..aa..", ".aaaa.", ".abba.", ".aaaa."];
  const draw = (ox: number, oy: number) => big.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && g.set(ox + x, oy + y, ch === "a" ? 0xf4f6fa : 0xb6bcc8)));
  draw(1, 1);
  draw(8, 4);
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ══ 「겨울 데이트룩」 ══

// ── 골지 니트 비니 (접어 올린 단) ──
const BN = 0xdccfb6;
const BN_HI = 0xf0e6d2;
const BN_LO = 0xb9aa8e;
const BN_DEEP = 0x968669;
const BN_TAG = 0xb8583a;
const BN_RIB = 0xcbbea2;

function beanieHead(g0: Grid, v: V, m: GearM, top: number, fb: FB): void {
  const g = brush(g0);
  const { cx } = m;
  // 11/25 운영자 「니트 비니도 오른쪽 귀랑 왼쪽 귀가 안 맞음」: 볼캡과 같이 고양이 귀(위 세 줄)가 정수리 안에 덮이고 라벨이 오른쪽 귀 밑이었다
  // → 고양이 몸이면 정수리 위 줄들을 비워 양쪽 귀만 솟게, 라벨은 뺀다
  const catEars = fb === "cat";
  // 11/22 다듬기: 머리가 넓은 몸(동글이·이불·머그잔·튜브)에서 버섯처럼 넓던 것을 한 칸 줄인다 (머리 윗면을 덮는 만큼만)
  const R = Math.min(Math.round(m.rx), 5);
  const back = v === "side" ? -1 : 0;
  const rib = (x: number) => (x + 40) % 2 === 0;
  // 머리를 감싸는 둥근 정수리 네 줄 (은은한 세로 골지) + 접어 올린 단 두 줄 (머리보다 한 칸씩 넓게)
  const dome: [number, number][] = [
    [top - 3, Math.max(2, R - 2)],
    [top - 2, R - 1],
    [top - 1, R],
    [top, R],
  ];
  for (const [y, h] of dome)
    for (let x = cx - h + back; x < cx + h + back; x++) {
      if (catEars && y < top) continue;
      const l = x === cx - h + back;
      const r = x >= cx + h + back - 2;
      g.set(x, y, l ? BN_HI : r ? (x === cx + h + back - 1 ? BN_LO : rib(x) ? BN_LO : BN) : rib(x) ? BN_RIB : y === top - 3 ? BN_HI : BN);
    }
  const cuff = R + 1;
  for (let x = cx - cuff + back; x < cx + cuff + back; x++) {
    const r = x >= cx + cuff + back - 2;
    g.set(x, top + 1, r ? BN_LO : x === cx - cuff + back ? BN_HI : rib(x) ? BN : BN_HI);
    g.set(x, top + 2, r ? BN_DEEP : rib(x) ? BN_LO : BN_RIB);
  }
  if (catEars) return;
  // 정수리 꼭지 한 땀
  g.set(cx - 1 + back, top - 4, BN_LO);
  // 단 끝 작은 무지 라벨 (글자 없는 천 조각 한 칸) — 토끼는 오른쪽 귀 바로 밑이라 귀가 길어 보여 뺀다
  if (fb === "bun") return;
  if (v === "down") g.set(cx + 2, top + 1, BN_TAG);
  else if (v === "side") g.set(cx + 1 + back, top + 1, BN_TAG);
}
function beanieIcon(): Grid {
  return iconOf(
    ["....hhhhh.....", "..hbBbBbBbl...", ".hbBbBbBbBbl..", ".hbBbBbBbBbl..", "hbBbBbBbBbBll.", "hbBbBbBbBbBll.", "HHhHhHhHhtHhLl", "bBbBbBbBbBbBLl", "LLLLLLLLLLLLLL"],
    { h: BN_HI, b: BN, B: BN_LO, l: BN_LO, L: BN_DEEP, H: BN_HI, t: BN_TAG },
  );
}

// ── 캐멀 롱코트 (싱글, 단추, 주머니에 손 넣은 느낌) ──
const CM = 0xc28c52;
const CM_HI = 0xdcaa72;
const CM_LO = 0x9a6a3a;
const CM_DEEP = 0x744c28;
const BTN = 0x4a2c18;
const INNER = 0x3a3440;

function coatBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, hem, sit };
  const big = bigBody(fb);
  const wool = (x: number, y: number, c: Color) => (hash2(x, y, 131) < 0.1 ? CM_HI : c);
  // 몸통: 무릎 아래까지 (한 줄 더 길게), 밑단은 한 칸씩 퍼진다
  const { top, bot } = paintTorso(
    g,
    w,
    ({ x, y, l, r, bot }) => {
      if (y === bot) return x >= r - 2 ? CM_DEEP : CM_LO;
      if (x === l) return CM_HI;
      if (x >= r - 2) return CM_LO;
      return wool(x, y, CM);
    },
    { long: 1 },
  );
  if (big) {
    if (v === "down") {
      for (let y = top; y <= bot - 1; y++) g.set(cx - 1, y, CM_DEEP);
      g.set(cx, top + 1, BTN);
      if (top + 3 < bot) g.set(cx, top + 3, BTN);
      g.set(cx - 4, top + 3, CM_DEEP);
      g.set(cx + 3, top + 3, CM_DEEP);
    } else if (v === "up") for (let y = top + 1; y <= bot; y++) g.set(cx - 1, y, CM_LO);
    return;
  }
  if (v === "down") {
    // 앞여밈 선 + 밤색 단추 셋 + 양옆 주머니 (손을 넣어 살짝 불룩, 소매가 주머니로 들어간다)
    for (let y = top + 2; y < bot; y++) g.set(cx, y, CM_DEEP);
    for (const y of [top + 3, top + 5]) if (y < bot - 1) g.set(cx - 1, y, BTN);
    const py = bot - 2;
    const [l0, r0] = span(w, py);
    g.hline(l0 + 1, l0 + 2, py, CM_DEEP);
    g.hline(r0 - 3, r0 - 2, py, CM_DEEP);
    g.set(l0 + 1, py - 1, CM_HI);
    g.set(r0 - 3, py - 1, CM_HI);
    // 소매: 어깨에서 주머니로 비스듬히 (안쪽 그늘 선)
    for (let y = top + 3; y < py; y++) {
      const [a, b] = span(w, y);
      g.set(a + 1, y, CM_LO);
      g.set(b - 2, y, CM_DEEP);
    }
  } else if (v === "side") {
    // 옆: 앞여밈 + 주머니에 넣은 소매 (어깨에서 내려와 주머니로)
    for (let y = top + 2; y < bot; y++) {
      const [, r] = span(w, y);
      g.set(r - 2, y, CM_DEEP);
    }
    const py = bot - 2;
    for (let y = top + 2; y < py; y++) g.set(cx - 1, y, CM_LO);
    g.set(cx, py - 1, CM_LO);
    g.hline(cx - 1, cx + 1, py, CM_DEEP);
    g.set(cx + 2, py - 1, CM_HI);
  } else {
    // 뒤: 가운데 등솔기 + 밑단 트임
    for (let y = top + 2; y <= bot; y++) g.set(cx - 1, y, y >= bot - 1 ? CM_DEEP : CM_LO);
    g.set(cx, bot - 1, CM_HI);
  }
}

/** 목: 노치 라펠 (가운데 V로 짙은 안옷이 보인다) */
function coatNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const y = neckY({ m, fb });
  const half = neckHalf(fb) + (objectBody(body) ? 1 : 0);
  if (bigBody(fb) && !objectBody(body)) {
    if (v === "down") {
      g.set(cx - 2, y, CM_HI);
      g.set(cx - 1, y, INNER);
      g.set(cx, y, INNER);
      g.set(cx + 1, y, CM_LO);
    }
    return;
  }
  if (!objectBody(body)) hideScarfTail(g, v, m, body, CM);
  if (v === "up") {
    for (let x = cx - half; x < cx + half; x++) g.set(x, y, x >= cx + half - 2 ? CM_LO : CM_HI);
    return;
  }
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  const x1 = cx + half - 1;
  for (let x = x0; x <= x1; x++) g.set(x, y, x === x0 ? CM_HI : x >= x1 - 1 ? CM_LO : CM);
  if (v === "down") {
    // V 깃: 가운데 두 칸은 안옷, 양옆 라펠은 밝게 + 노치 한 칸
    g.set(cx - 1, y, INNER);
    g.set(cx, y, INNER);
    g.set(cx - 1, y + 1, INNER);
    g.set(cx - 2, y, CM_HI);
    g.set(cx + 1, y, CM_HI);
    g.set(cx - 3, y + 1, CM_DEEP);
    g.set(cx + 2, y + 1, CM_DEEP);
  } else g.set(x1 - 1, y + 1, CM_DEEP);
}
function coatIcon(): Grid {
  // 캐멀 싱글 롱코트: 노치 라펠 V · 밤색 단추 셋 · 긴 소매 · 비스듬한 주머니 · 무릎 아래 길이
  return iconOf(
    [
      "...hhckkchl...",
      "..hhcHkkHcll..",
      ".hhccHdkHccll.",
      ".hcccchdcccll.",
      "hhcccccdccclll",
      "hhcccccbcccLll",
      "hhcccccdcccLll",
      "hhcDcccbccDLll",
      ".hccDccdcDcll.",
      ".hcccccbcccll.",
      ".hcccccdcccll.",
      ".hcccccdcccll.",
      ".LLLLLLLLLLLL.",
    ],
    { h: CM_HI, c: CM, l: CM_LO, d: CM_DEEP, D: CM_DEEP, L: CM_DEEP, b: BTN, k: INNER, H: 0xe8c08a },
  );
}

// ── 체크 머플러 (일반 타탄: 빨강 바탕 + 남색 굵은 줄 + 초록 + 겨자 실선) ──
const TR = 0xc23a44;
const TR_LO = 0x92283a;
const TN = 0x2c3456;
const TG = 0x2e6a4c;
const TY = 0xe8c25a;
function tartan(x: number, y: number): Color {
  const cx = ((x % 4) + 4) % 4;
  const cy = ((y % 3) + 3) % 3;
  if (cx === 0 && cy === 0) return 0x1e2440;
  if (cx === 0 || cy === 0) return cy === 0 && cx === 2 ? TG : TN;
  if (cx === 2 && cy === 2) return TY;
  return TR;
}
const tartanLo = (x: number, y: number) => {
  const c = tartan(x, y);
  return c === TR ? TR_LO : c === TY ? 0xb8923a : 0x1a1e34;
};

function mufflerNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const big = bigBody(fb);
  const y = neckY({ m, fb });
  const half = neckHalf(fb) + (objectBody(body) && !big ? 1 : 0);
  // 두툼하게 두 줄 감고 (턱 밑 한 줄 더), 오른쪽 끝 두 칸은 그늘
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  const x1 = cx + half - 1;
  for (let yy = y - 1; yy <= y + 1; yy++)
    for (let x = x0 - (yy === y ? 1 : 0); x <= x1 + (yy === y ? 1 : 0); x++) {
      if (yy === y - 1 && (x === x0 || x === x1) && !big) continue;
      g.set(clampX(x), yy, x >= x1 ? tartanLo(x, yy) : tartan(x, yy));
    }
  // 늘어진 끝 (앞으로 두 갈래, 하나는 길게) + 끝 술
  const tail = (tx: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const yy = y + 2 + i;
      const last = i === n - 1;
      g.set(tx, yy, last ? (i % 2 ? TY : 0xf2e6c8) : tartan(tx, yy));
      g.set(tx + 1, yy, last ? 0xd8c8a4 : tartanLo(tx + 1, yy));
    }
  };
  if (v === "down") {
    tail(cx - 3, big ? 3 : 4);
    tail(cx, big ? 2 : 3);
  } else if (v === "side") {
    // 옆: 앞으로 늘어진 끝 하나 + 등 뒤로 짧게 날리는 끝
    tail(x1 - 2, big ? 2 : 3);
    const bx = x0 - 2;
    g.set(clampX(bx), y, tartan(bx, y));
    g.set(clampX(bx - 1), y + 1, tartanLo(bx - 1, y + 1));
  } else {
    // 뒤: 목 뒤로 감은 매듭 (가운데 불룩)
    g.set(cx - 1, y + 2, tartan(cx - 1, y + 2));
    g.set(cx, y + 2, tartanLo(cx, y + 2));
  }
}
function mufflerIcon(): Grid {
  // 둥글게 한 번 감은 고리 + 앞으로 늘어진 두 끝 (하나는 길게) + 크림 술
  const g = new Grid(16, 16);
  const put = (x: number, y: number, lo = false) => g.set(x, y, lo ? tartanLo(x, y) : tartan(x, y));
  for (let y = 1; y <= 6; y++)
    for (let x = 1; x <= 14; x++) {
      const d = ((x - 7.5) / 6.6) ** 2 + ((y - 3.5) / 2.8) ** 2;
      const hole = ((x - 7.5) / 3.4) ** 2 + ((y - 3.2) / 1.2) ** 2 < 1;
      if (d <= 1 && !hole) put(x, y, x >= 12 || y === 6);
    }
  for (let y = 6; y <= 13; y++) {
    put(4, y);
    put(5, y);
    put(6, y, true);
  }
  for (let y = 6; y <= 11; y++) {
    put(8, y);
    put(9, y);
    put(10, y, true);
  }
  g.outline(0x1e1c1a, false, 170);
  for (const x of [4, 6]) g.set(x, 14, 0xf2e6c8);
  g.set(5, 14, 0xd8c8a4);
  for (const x of [8, 10]) g.set(x, 12, 0xf2e6c8);
  g.set(9, 12, 0xd8c8a4);
  return g;
}

// ── 붕어빵 봉투 (크게): 크림 종이봉투 + 노릇한 붕어빵 세 마리 + 모락모락 김 ──
const PB = 0xf4ecda;
const PB_LO = 0xd4c6a8;
const PB_DEEP = 0xb09c78;
const STAMP = 0xc8463c;
const FISH = 0xe0a048;
const FISH_HI = 0xf6cc78;
const FISH_LO = 0xb4742e;
const FISH_DEEP = 0x8a5222;

/** 봉투 그림 (가로 5 · 세로 10): 위 네 줄 = 붕어빵 머리·꼬리, 아래 = 봉투 (접힌 입구 + 빨간 물고기 도장) */
const BAG_ART = [".h.T.", "hfhtT", "effFt", "fFfFf", "LPPPd", "pppsd", "psspd", "pppsd", "ppppd", "PPPdd"];
const BAG_PAL: Record<string, Color> = { h: FISH_HI, f: FISH, F: FISH_LO, e: FISH_DEEP, t: FISH_LO, T: FISH, L: FISH_DEEP, p: PB, P: PB_LO, d: PB_DEEP, s: STAMP };

function bagPlace(v: V, m: GearM): { x: number; y: number } {
  const bottom = Math.min(26, m.hY + 3);
  let x = Math.min(m.hx - 1, 14);
  const headR = Math.ceil(m.cx + m.rx);
  if (bottom - 9 < m.hy + m.ry) x = Math.max(x, Math.min(14, headR));
  if (v === "side") x = Math.min(14, Math.max(x, headR));
  return { x, y: bottom - 9 };
}
function bungeoHand(g0: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const g = brush(g0);
  const { x: x0, y } = bagPlace(v, m);
  const narrow = v === "side" && m.cx + m.rx > 15;
  const x = narrow ? x0 + 1 : x0;
  (narrow ? BAG_ART.map((r) => r.slice(0, 2) + r.slice(3)) : BAG_ART).forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === "." || BAG_PAL[ch] === undefined) return;
      g.set(x + i, y + j, BAG_PAL[ch]);
    }),
  );
}
function bungeoGlow(g: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const { x: x0, y } = bagPlace(v, m);
  const x = v === "side" && m.cx + m.rx > 15 ? x0 + 1 : x0;
  // 김 (외곽선 밖 반투명, 위로 흔들리며)
  dot(g, x + 1, y - 2, 0xffffff, 170);
  dot(g, x + 2, y - 3, 0xffffff, 130);
  dot(g, x + 1, y - 4, 0xffffff, 90);
  dot(g, x + 3, y - 1, 0xffffff, 140);
  dot(g, x + 3, y - 3, 0xffffff, 90);
  // 붕어빵 눈 반짝
  if (y + 2 >= SAFE_TOP) g.set(x + 1, y + 2, FISH_DEEP);
}
function bungeoIcon(): Grid {
  return iconOf(
    [
      "..hh......tt..",
      ".hffh....tfT..",
      ".fefhh..hfft..",
      ".fffFf.hffFT..",
      "hfFfffhfeffh..",
      "LfFfLfFfffFf..",
      "pPPPPPPPPPPPd.",
      "pppppppppppPd.",
      "ppppsssppsppd.",
      "pppsPsssssppd.",
      "ppppsssppsPPd.",
      "pppppppppppPd.",
      "PPPPPPPPPPPdd.",
    ],
    BAG_PAL,
    (g, ox, oy) => {
      for (const [x, y, a] of [
        [3, -1, 150],
        [4, -2, 110],
        [9, -1, 130],
      ] as const)
        if (oy + y >= 0) g.set(ox + x, oy + y, 0xffffff, a);
    },
  );
}

// ── 거리 전구 오라 (그림 재료 — 움직임은 bungeoFx.ts): 머리 위로 늘어진 노란 전구 줄 두 가닥 ──
const WIRE = 0x3a3438;
const BULB = 0xffd77a;
const BULB_HI = 0xfff6d0;
const BULB_LO = 0xe0a040;
/** 전구 줄 한 가닥: (x0..x1, y0)에서 가운데가 sag만큼 처진다. 전구 자리 [x, y(알 위 칸)]를 돌려준다. dim = 1이면 전구 심을 어둡게 (반짝 번갈이) */
export function lightStrand(g: Grid, x0: number, x1: number, y0: number, sag: number, phase: number, back: boolean, dim = 0): [number, number][] {
  const bulbs: [number, number][] = [];
  const n = x1 - x0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + i;
    const y = Math.round(y0 + Math.sin(t * Math.PI) * sag);
    dot(g, x, y, WIRE, back ? 150 : 220);
    if ((i + phase) % 4 === 0 && i > 0 && i < n) {
      // 전구: 꼭지(짙게) + 둥근 알 두 칸 + 밝은 심
      const off = dim && (i + phase) % 8 === 0;
      dot(g, x, y + 1, 0x8a7a5a, 230);
      dot(g, x, y + 2, BULB, 255);
      dot(g, x, y + 3, BULB_LO, 255);
      dot(g, x - 1, y + 2, BULB, 200);
      dot(g, x, y + 2, off ? BULB : BULB_HI, 255);
      bulbs.push([x, y + 2]);
    }
  }
  return bulbs;
}
/** 전구 오라 빛 번짐 한 칸 (전구 둘레 반투명 노랑) */
export function lightHalo(g: Grid, bulbs: readonly [number, number][], a = 46): void {
  const halo = new Grid(g.w, g.h);
  for (const [x, y] of bulbs) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5 && dx * dx + dy * dy > 0) halo.set(x + dx, y + dy, 0xffe8a0, a);
  over(g, halo, 0, 0);
}
function lightsIcon(): Grid {
  const g = new Grid(16, 16);
  for (let x = 0; x < 16; x++) {
    const y = Math.round(3 + Math.sin((x / 15) * Math.PI) * 5);
    g.set(x, y, WIRE);
    if (x % 4 === 2) {
      g.set(x, y + 1, 0x8a7a5a);
      g.set(x, y + 2, BULB_HI);
      g.set(x + 1, y + 2, BULB);
      g.set(x, y + 3, BULB);
      g.set(x + 1, y + 3, BULB_LO);
      for (const [dx, dy] of [
        [-1, 2],
        [2, 2],
        [0, 4],
        [1, 4],
        [-1, 3],
        [2, 3],
      ])
        if (!(g.get(x + dx, y + dy) & 255)) g.set(x + dx, y + dy, 0xffe8a0, 90);
    }
  }
  return g;
}

// ══ 낱개 겉옷 ══

// ── 꽈배기 니트 ──
const KN = 0xefe6d2;
const KN_HI = 0xfffaee;
const KN_LO = 0xd0c3a6;
const KN_DEEP = 0xae9f80;

/** 꽈배기 무늬: 두 칸 폭 꼬임 (줄마다 밝은 칸이 비스듬히 건너간다) + 양옆 안뜨기 골 (짙게) */
function cable(x: number, y: number, c0: number): Color | null {
  const k = ((y % 2) + 2) % 2;
  if (x === c0) return k === 0 ? KN_HI : KN_DEEP;
  if (x === c0 + 1) return k === 0 ? KN_DEEP : KN_HI;
  if (x === c0 - 1 || x === c0 + 2) return KN_LO;
  return null;
}

function knitBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, hem, sit };
  const big = bigBody(fb);
  const { top, bot } = paintTorso(g, w, ({ x, y, l, r, bot }) => {
    if (y === bot) return (x + 40) % 2 ? KN_LO : KN;
    if (x === l) return KN_HI;
    if (x >= r - 2) return x === r - 1 ? KN_DEEP : KN_LO;
    if (v === "side") return cable(x, y, cx) ?? ((x + 40) % 2 ? KN : KN_HI);
    // 가운데 굵은 꽈배기 + 양옆 가는 골 (아래로 갈수록 넓어지는 몸에 맞춰)
    const c = cable(x, y, cx - 1);
    if (c !== null) return c;
    if (x === cx - 4 || x === cx + 3) return y % 2 ? KN_HI : KN_LO;
    return KN;
  });
  if (!big && v !== "side") {
    // 소매 경계 (어깨에서 밑단 위까지)
    for (let y = top + 3; y < bot - 1; y++) {
      const [a, b] = span(w, y);
      g.set(a + 1, y, KN_LO);
      g.set(b - 2, y, KN_DEEP);
    }
  }
}
/** 목: 두 번 접은 폴라 (턱 밑까지 도톰하게, 세로 골지) */
function knitNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const big = bigBody(fb);
  const y = neckY({ m, fb });
  const half = neckHalf(fb) + (objectBody(body) && !big ? 1 : 0) - (big ? 1 : 0);
  if (!objectBody(body)) hideScarfTail(g, v, m, body, KN);
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  const x1 = cx + half - 1;
  for (const yy of [y - 1, y]) for (let x = x0; x <= x1; x++) g.set(x, yy, x >= x1 - 1 ? KN_LO : (x + 40) % 2 ? (yy === y - 1 ? KN_HI : KN) : yy === y - 1 ? KN : KN_LO);
  // 접힌 아랫단 그늘
  for (let x = x0; x <= x1; x++) g.set(x, y + 1, x >= x1 - 1 ? KN_DEEP : KN_LO);
}
function knitIcon(): Grid {
  const out: string[] = [];
  for (let y = 0; y < 13; y++) {
    let r = "";
    for (let x = 0; x < 14; x++) {
      const inBody = y <= 2 ? x >= 4 && x <= 9 : y < 4 ? x >= 1 && x <= 12 : x >= 0 && x <= 13;
      if (!inBody) {
        r += ".";
        continue;
      }
      if (y <= 2) r += (x + y) % 2 ? "h" : "k";
      else if (y === 12) r += x % 2 ? "l" : "k";
      else if (x === 0 || x === 13) r += x === 0 ? "h" : "d";
      else if (x === 3 || x === 10) r += "l";
      else if (x === 6 || x === 7) r += ["h", "l", "k"][(y + (x === 7 ? 1 : 0)) % 3];
      else r += "k";
    }
    out.push(r);
  }
  return iconOf(out, { k: KN, h: KN_HI, l: KN_LO, d: KN_DEEP });
}

// ── 뽀글이 플리스 ──
const FL = 0xebe1cc;
const FL_HI = 0xfbf5e8;
const FL_LO = 0xcdbfa4;
const FL_DEEP = 0xaa9a7e;
const TRIM = 0x5e4230;
const TRIM_HI = 0x7e5a40;
const ZIP = 0xc8ccd4;

/** 양털 결: 몽글몽글 (밝은 점·그늘 점이 섞인다) */
const boucle = (x: number, y: number): Color => {
  const h = hash2(x, y, 211);
  return h < 0.22 ? FL_HI : h < 0.4 ? FL_LO : (x + y * 2) % 5 === 0 ? FL_HI : FL;
};

function fleeceBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, hem, sit };
  const big = bigBody(fb);
  const { top, bot } = paintTorso(g, w, ({ x, y, l, r, bot }) => {
    if (y === bot) return TRIM;
    if (x === l) return FL_HI;
    if (x >= r - 2) return hash2(x, y, 223) < 0.3 ? FL_LO : FL_DEEP;
    return boucle(x, y);
  });
  // 울퉁불퉁 가장자리: 몸 밖 빈칸 몇 군데에 양털 뭉치 한 칸 (외곽선이 따라 울퉁불퉁)
  if (!big)
    for (let y = top + 2; y < bot; y++) {
      const [a, b] = span(w, y);
      if (hash2(y, 1, 227) < 0.45 && !g.filled(a - 1, y)) g.set(a - 1, y, FL_HI);
      if (hash2(y, 2, 229) < 0.45 && !g.filled(b, y) && v !== "side") g.set(b, y, FL_LO);
    }
  if (v === "down") {
    // 앞 지퍼 (가운데 짙은 선 + 위 은색 손잡이) + 왼가슴 밤색 덧댄 주머니
    for (let y = top; y < bot; y++) g.set(cx - 1, y, FL_DEEP);
    const py = big ? top + 1 : Math.max(top + 3, m.neck + 1);
    const px = cx - 4 + (big ? 0 : 1);
    g.set(px, py, TRIM_HI);
    g.set(px + 1, py, TRIM);
    g.set(px, py + 1, TRIM);
    g.set(px + 1, py + 1, TRIM);
  } else if (v === "side") {
    for (let y = top + 2; y < bot; y++) {
      const [, r] = span(w, y);
      if (!big) g.set(r - 2, y, FL_DEEP);
    }
  }
}
/** 목: 세운 양털 깃 + 지퍼 손잡이 (밤색 테두리) */
function fleeceNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const big = bigBody(fb);
  const y = neckY({ m, fb });
  const half = neckHalf(fb) + (objectBody(body) && !big ? 1 : 0) - (big ? 1 : 0);
  if (!objectBody(body)) hideScarfTail(g, v, m, body, FL);
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  const x1 = cx + half - 1;
  for (let x = x0; x <= x1; x++) {
    g.set(x, y - 1, x === x0 || x === x1 ? TRIM : x >= x1 - 1 ? FL_LO : boucle(x, y - 1));
    g.set(x, y, x >= x1 - 1 ? FL_DEEP : boucle(x, y + 7));
  }
  if (v === "down") {
    g.set(cx - 1, y - 1, ZIP);
    g.set(cx - 1, y, 0x9aa0aa);
    g.set(cx - 1, y + 1, ZIP);
  } else if (v === "side") g.set(x1 - 1, y, ZIP);
}
function fleeceIcon(): Grid {
  const out: string[] = [];
  for (let y = 0; y < 13; y++) {
    let r = "";
    for (let x = 0; x < 14; x++) {
      const inBody = y <= 1 ? x >= 4 && x <= 9 : y < 3 ? x >= 1 && x <= 12 : true;
      if (!inBody) r += ".";
      else if (y <= 1) r += x === 4 || x === 9 ? "t" : x === 6 && y === 0 ? "z" : "f";
      else if (y === 12) r += "t";
      else if (x === 6) r += y === 2 ? "z" : "d";
      else if ((x === 2 || x === 3) && (y === 4 || y === 5)) r += "t";
      else if (x === 0) r += "h";
      else if (x === 13) r += "d";
      else r += hash2(x, y, 211) < 0.25 ? "h" : hash2(x, y, 213) < 0.2 ? "l" : "f";
    }
    out.push(r);
  }
  return iconOf(out, { f: FL, h: FL_HI, l: FL_LO, d: FL_DEEP, t: TRIM, z: ZIP });
}

// ══ 외형 「붕어빵 장수 유령」 (두건 유령 바탕) ══
//  몸 부위(염색 몸) = 누빔 조끼 (염색 전 기본 남색 — avatarCore BODY_DEFAULT) · 포인트 색 = 앞치마 (염색 전 기본 다홍)
//  머리 = 하늘색 줄 하나 들어간 하얀 목욕탕 수건을 이마에 질끈 (옆에 매듭) — 머리 꾸미기를 쓰면 벗는다
//  손 = 은색 집게로 갓 구운 붕어빵 한 마리 + 김 — 손에 다른 것을 들면 내려놓는다

const APRON_DEF = 0xd0483e;
const VEST_DEF = 0x3e4c6a;
const TOWEL = 0xf6f3ea;
const TOWEL_LO = 0xd4d0c4;
const TOWEL_LINE = 0x7aa4d8;
const TONG = 0xc4c8d0;
const TONG_LO = 0x8a909a;
const VF_HI = 0xf8d080;
const VF_DEEP = 0x7a4a1e;

const apronC = () => CTX.accent ?? APRON_DEF;

// ── 누빔 조끼 (몸통 — avatarCore가 몸통 덧그림 다음에 부른다) ──
function vestBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  if (layer !== "front") return;
  const g = brush(g0);
  const base = CTX.body ?? VEST_DEF;
  const hi = lighten(base, 0.22);
  const lo = darken(base, 0.24);
  const seam = darken(base, 0.42);
  const w: W = { v, m, fb, body, hem, sit };
  paintTorso(g, w, ({ x, y, k, l, r, bot }) => {
    if (y === bot) return lo;
    if (k > 0 && k % 2 === 0 && x > l && x < r - 1) return seam;
    return x === l ? hi : x >= r - 2 ? lo : base;
  });
}

// ── 앞치마 (겉옷 위에 두른다) ──
function apronBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  if (layer !== "front") return;
  const g = brush(g0);
  const a = apronC();
  const hi = lighten(a, 0.28);
  const lo = darken(a, 0.22);
  const deep = darken(a, 0.42);
  const { cx, neck } = m;
  const w: W = { v, m, fb, body, hem, sit };
  const { bot } = torsoTB(w, CTX.ids.includes("kd_coat") ? 1 : 0);
  const y0 = neck + 1;
  if (v === "down") {
    for (let y = y0; y <= bot; y++) {
      const skirt = y >= y0 + 2;
      const x0 = skirt ? cx - 4 : cx - 3;
      const x1 = skirt ? cx + 3 : cx + 2;
      for (let x = x0; x <= x1; x++) g.set(x, y, y === bot ? deep : x === x0 ? hi : x >= x1 - 1 ? lo : a);
    }
    // 허리끈 (양옆으로 살짝) + 앞주머니 윗선 + 붕어빵 자수 (크림 두 칸 + 꼬리)
    const [l, r] = span(w, y0 + 2);
    g.set(Math.max(l, cx - 5), y0 + 2, lo);
    g.set(Math.min(r - 1, cx + 4), y0 + 2, deep);
    g.hline(cx - 3, cx + 2, y0 + 2, lo);
    g.set(cx - 2, y0 + 1, 0xfff0d0);
    g.set(cx - 1, y0 + 1, 0xf0c070);
    g.set(cx, y0, 0xf0c070);
    g.set(cx, y0 + 1, lo);
    // 목끈 (V)
    g.set(cx - 3, neck, deep);
    g.set(cx + 2, neck, deep);
  } else if (v === "side") {
    // 옆: 앞판이 몸 앞쪽에 + 등 쪽 허리 리본 매듭
    // 11/22 다듬기: 시안의 리본 두 가닥이 몸 밖으로 꼬리처럼 튀어 → 몸 안쪽 가장자리에 작은 매듭 두 칸만
    for (let y = y0; y <= bot; y++) {
      const [, r] = span(w, y);
      const w0 = y >= y0 + 2 ? 3 : 2;
      for (let x = r - w0; x < r; x++) g.set(x, y, y === bot ? deep : x === r - 1 ? lo : a);
    }
    const [l] = span(w, y0 + 2);
    g.set(l, y0 + 2, a);
    g.set(l, y0 + 3, deep);
  } else {
    // 뒤: 어깨에서 내려오는 끈 둘 + 허리 리본 (양쪽 고리 + 늘어진 끈)
    for (let k = 0; k <= 2; k++) {
      g.set(cx - 3 + k, y0 + k, lo);
      g.set(cx + 2 - k, y0 + k, lo);
    }
    const by = y0 + 2;
    g.set(cx - 3, by - 1, a);
    g.set(cx - 2, by, a);
    g.set(cx - 1, by, deep);
    g.set(cx, by, deep);
    g.set(cx + 1, by, a);
    g.set(cx + 2, by - 1, a);
    g.set(cx - 2, by + 1, lo);
    g.set(cx + 1, by + 1, lo);
    g.set(cx - 2, by + 2, a);
    g.set(cx + 1, by + 2, a);
  }
}

// ── 머리 수건 (이마에 질끈 + 옆 매듭) ──
function towelHead(g0: Grid, v: V, m: GearM, top: number): void {
  if (CTX.headBusy) return;
  const g = brush(g0);
  const { cx } = m;
  for (let k = 0; k < 3; k++) {
    const y = top + 1 + k;
    const h = Math.round(halfAt(m, y) + 0.6);
    for (let x = cx - h; x < cx + h; x++) g.set(x, y, k === 1 ? ((x + 40) % 3 === 0 ? TOWEL : TOWEL_LINE) : x >= cx + h - 2 ? TOWEL_LO : TOWEL);
  }
  // 매듭 (앞: 왼쪽 · 옆/뒤: 머리 뒤쪽) + 아래로 축 늘어진 두 끝
  const d = v === "up" ? 1 : -1;
  const hx = Math.round(halfAt(m, top + 2) + 0.6);
  const kx = v === "up" ? cx + hx : cx - hx - 1;
  g.set(kx, top + 1, TOWEL);
  g.set(kx, top + 2, TOWEL_LO);
  g.set(kx + d, top + 1, TOWEL_LO);
  g.set(kx + d, top + 2, TOWEL);
  g.set(kx + d, top + 3, TOWEL);
  g.set(kx + d, top + 4, TOWEL_LO);
  g.set(kx, top + 3, TOWEL_LO);
}

// ── 집게 + 붕어빵 ──
function fishAt(m: GearM): { x: number; y: number } {
  // 머리 오른쪽 옆에 세워 든다 (얼굴은 가리지 않는다)
  return { x: Math.min(16, Math.ceil(m.cx + m.rx)), y: m.hY - 9 };
}
/** 세워 든 붕어빵 3×6: 둥근 머리(눈) · 배 비늘 · 아래 갈래 꼬리를 집게가 문다 */
const VFISH_ART = [".h.", "hef", "fhF", "fFF", ".F.", "T.T"];
const VFISH_PAL: Record<string, Color> = { h: VF_HI, f: FISH, F: FISH_LO, e: VF_DEEP, T: FISH_LO };
function tongHand(g0: Grid, v: V, m: GearM): void {
  if (v === "up" || CTX.handBusy) return;
  const g = brush(g0);
  const { x, y } = fishAt(m);
  VFISH_ART.forEach((r, j) => [...r].forEach((ch, i) => ch !== "." && g.set(x + i, y + j, VFISH_PAL[ch])));
  // 은색 집게 (꼬리를 문 두 끝 → 손까지)
  g.set(x, y + 6, TONG);
  g.set(x + 2, y + 6, TONG_LO);
  g.set(x + 1, y + 7, TONG);
  g.set(x + 1, y + 8, TONG_LO);
  g.set(x, y + 9, TONG);
}
function tongGlow(g: Grid, v: V, m: GearM): void {
  if (v === "up" || CTX.handBusy) return;
  const { x, y } = fishAt(m);
  dot(g, x + 1, y - 2, 0xffffff, 170);
  dot(g, x + 2, y - 3, 0xffffff, 120);
  dot(g, x + 1, y - 4, 0xffffff, 80);
  if (y >= SAFE_TOP) g.set(x + 1, y, VF_HI);
}

/** 목: 조끼 깃 (겉옷·목 꾸미기를 하면 그 깃 그대로) + 앞치마 목끈 두 점 */
function vendorNeck(g0: Grid, v: V, m: GearM): void {
  const g = brush(g0);
  const { cx, neck } = m;
  const a = apronC();
  if (!CTX.neckBusy) {
    const base = CTX.body ?? VEST_DEF;
    const x0 = v === "side" ? cx - 3 : cx - 4;
    for (let x = x0; x < cx + 4; x++) g.set(x, neck, x === x0 ? lighten(base, 0.22) : x >= cx + 2 ? darken(base, 0.24) : base);
    if (v === "side") g.set(cx - 4, neck, darken(base, 0.24));
  }
  if (v === "side") g.set(cx + 2, neck, darken(a, 0.2));
  else {
    g.set(cx - 3, neck, darken(a, 0.2));
    g.set(cx + 2, neck, darken(a, 0.2));
  }
}

// ── 등록 ──

/** 그리는 차례 = 키 순서 (조끼 → 겉옷 → 목 → 머리 → 손 → 앞치마·수건·집게). bd_*는 외형 덧그림 (착용 목록에 오지 않는다) */
export const GEAR4: Readonly<Record<string, SsItem>> = {
  bd_vendor_base: { headWorn: false, back: vestBack },
  kc_hoodie: { back: hoodieBack, neck: hoodieNeck },
  kd_coat: { back: coatBack, neck: coatNeck },
  kn_cable: { back: knitBack, neck: knitNeck },
  kn_fleece: { back: fleeceBack, neck: fleeceNeck },
  kc_phones: { neck: phonesNeck },
  kd_muffler: { neck: mufflerNeck },
  kc_cap: { covers: true, head: (g, v, m, fb, top) => capHead(g, v, m, top, fb) },
  kd_beanie: { covers: true, head: (g, v, m, fb, top) => beanieHead(g, v, m, top, fb) },
  kc_icecoffee: { hand: (g, v, m) => cupHand(g, v, m), glow: (g, v, m) => cupGlow(g, v, m) },
  kd_bungeo: { hand: (g, v, m) => bungeoHand(g, v, m), glow: (g, v, m) => bungeoGlow(g, v, m) },
  bd_vendor: {
    covers: true,
    headWorn: false,
    back: apronBack,
    neck: (g, v, m) => vendorNeck(g, v, m),
    head: (g, v, m, _fb, top) => towelHead(g, v, m, top),
    hand: (g, v, m) => tongHand(g, v, m),
    glow: (g, v, m) => tongGlow(g, v, m),
  },
};

/** 16×16 아이콘 (12점 모두 — 운동화 발자국·거리 전구 오라 포함) */
export const ICONS4: Readonly<Record<string, () => Grid>> = {
  kc_cap: capIcon,
  kc_hoodie: hoodieIcon,
  kc_phones: phonesIcon,
  kc_icecoffee: cupIcon,
  kc_sneaker: sneakerIcon,
  kd_beanie: beanieIcon,
  kd_coat: coatIcon,
  kd_muffler: mufflerIcon,
  kd_bungeo: bungeoIcon,
  kd_lights: lightsIcon,
  kn_cable: knitIcon,
  kn_fleece: fleeceIcon,
};
