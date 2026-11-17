import { darken, Grid, lighten, mix, type Color } from "./pixel";

// 11/17 NPC 계절 옷 (겨울·크리스마스판 — 맵 컨셉). 돌아다니는 주민(마을 Residents·바닷가·캠핑장 Folk)만 입는다. 플레이어 꾸미기와는 따로.
//  착용 목록에 "nw.{키}" 한 줄을 넣으면 avatar.ts drawFrame이 시트에 같이 그린다 (키 → 옷 한 벌은 registerNpcWear로 등록, 시트 키에도 들어간다).
//  한 벌 = 모자 + 목도리 + 외투 + 벙어리장갑 + 장화 (+ 크리스마스 앞치마·브로치·루돌프 코·선물 상자). 몸 기준점(GearM과 같은 모양)에 맞춰 6가지 뼈대에 다 맞는다.
//  그리는 차례: 외투(몸통 위·팔 전) → 목도리(기본 천 목도리 자리) → 위 덧그림(얼굴·머리 꾸미기 다음: 앞치마·장갑·모자·브로치·코) → 외곽선 → 유령 모자(반투명, 외곽선 없이)

export const NW_PREFIX = "nw.";

export type NwHatKind = "beanie" | "bobble" | "earmuff" | "trapper" | "santa" | "elf" | "antler" | "holly" | "ghostSanta";
export type NwPattern = "solid" | "stripe" | "dots" | "check" | "rib";
export type NwCoatKind = "puffer" | "duffle" | "long" | "sweater" | "poncho" | "vest";

export type NpcWear = {
  /** 모자 (c 겉감 · c2 무늬·방울 · c3 털 단) */
  hat?: { kind: NwHatKind; c?: Color; c2?: Color; c3?: Color };
  /** 목도리 (c 바탕 · c2 무늬, thick = 두툼하게 두 줄, tail = 늘어진 끝) */
  scarf?: { c: Color; c2?: Color; pat?: NwPattern; thick?: boolean; tail?: boolean };
  /** 외투 (몸통을 덮는다 — 상자·머그잔·튜브 몸은 건너뛴다) */
  coat?: { kind: NwCoatKind; c: Color; c2?: Color };
  /** 벙어리장갑 색 (손 흔들기·환호 손도 이 색) */
  mitt?: Color;
  /** 장화 (cuff = 위 단: 털·뜨개) */
  boot?: { c: Color; cuff?: Color };
  /** 크리스마스 앞치마 (상인) — 가슴에 호랑가시 */
  apron?: { c: Color; trim?: Color; holly?: boolean };
  /** 목도리·외투 가슴의 호랑가시 브로치 */
  brooch?: boolean;
  /** 루돌프 빨간 코 */
  nose?: boolean;
  /** 상자 몸: 눈 덮인 뚜껑(snow) · 리본 두른 선물 상자(gift) */
  box?: "snow" | "gift";
  /** 머그잔 몸: 뜨개 덮개(knit) · 사탕 지팡이 줄무늬(candy) */
  cup?: "knit" | "candy";
};

const registry = new Map<string, NpcWear>();

/** 한 벌을 키로 등록하고 착용 목록에 넣을 id를 돌려준다 (같은 키는 덮어쓴다 — 그림은 시트 키로 갈린다) */
export function registerNpcWear(key: string, wear: NpcWear): string {
  registry.set(key, wear);
  return NW_PREFIX + key;
}

/** 착용 목록에서 계절 옷 한 벌 (없으면 null) */
export function npcWearOf(look: readonly string[]): NpcWear | null {
  const id = look.find((x) => x.startsWith(NW_PREFIX));
  return id ? (registry.get(id.slice(NW_PREFIX.length)) ?? null) : null;
}

/** 두건 꼭지·새싹을 덮는 모자인지 */
export function nwHatCovers(w: NpcWear | null): boolean {
  const k = w?.hat?.kind;
  return !!k && k !== "earmuff" && k !== "antler" && k !== "holly";
}

/** 머리 위에 늘 쓰는 것(왕관·갓·우산)을 벗게 하는 모자인지 (귀마개·머리핀은 우산을 접지 않는다) */
export function nwHatWorn(w: NpcWear | null): boolean {
  const k = w?.hat?.kind;
  return !!k && k !== "earmuff" && k !== "holly";
}

type View = "down" | "side" | "up";

/** avatar.ts가 넘기는 그리기 상황 (몸 기준점 + 자세) */
export type NwCtx = {
  view: View;
  /** 뼈대 (hood·cat·bun·sheet·tall·round) */
  fb: string;
  /** 실제 몸 (suit·box·cup … 포함) */
  body: string;
  m: { cx: number; hy: number; rx: number; ry: number; top: number; neck: number; shY: number; shL: number; shR: number; hx: number; hY: number };
  sit: 0 | 1 | 2;
  bob: number;
  hem: number;
  f0: [number, number];
  f1: [number, number];
  lie: boolean;
  sink: boolean;
  arms: string;
  /** 손에 무언가 든다 (등불 등) — 그쪽 장갑은 그리지 않는다 */
  handBusy: boolean;
};

// ── 공용 색 ──
const FUR = 0xfbf7ee;
const FUR_LO = 0xd9dce6;
const HOLLY = 0x2f8a46;
const HOLLY_LO = 0x1f6634;
const BERRY = 0xe0303c;
const BERRY_HI = 0xff7a7a;
const GOLD = 0xf2c84a;
const GOLD_HI = 0xfff2b0;
const ANTLER = 0x9a6a3c;
const ANTLER_HI = 0xc8945a;

const lo = (c: Color) => darken(c, 0.24);
const hi = (c: Color) => lighten(c, 0.3);
const seam = (c: Color) => darken(c, 0.4);

/** 상자·머그잔·튜브: 몸통이 물건이라 외투를 입지 않는다 */
function objectBody(body: string): boolean {
  return body === "box" || body === "cup" || body === "tube";
}

// ── 외투 ──

/** 몸통 한 줄의 [왼쪽, 오른쪽) (두건 뼈대 망토와 같은 사다리꼴 · 정장은 직사각형) */
function cloakSpan(c: NwCtx, y: number): [number, number] {
  const { cx } = c.m;
  if (c.body === "suit") {
    const half = c.view === "side" ? 4 : 5;
    return [cx - half, cx + half];
  }
  const tall = c.fb === "tall";
  const sitDrop = c.sit === 1 ? 3 : c.sit === 2 ? 2 : 0;
  const top = (tall ? 13 : 18) + sitDrop;
  const spread = c.sit === 1 ? (tall ? 0.55 : 0.75) : tall ? 0.3 : 0.5;
  const hw = (tall ? 2.5 : 3) + (y - top) * spread;
  return [Math.floor(cx - hw), Math.ceil(cx + hw)];
}

export function drawNwCoat(g: Grid, c: NwCtx, w: NpcWear): void {
  const coat = w.coat;
  if (!coat || objectBody(c.body)) return;
  if (c.fb === "sheet") return drawPoncho(g, c, coat.c, coat.c2 ?? hi(coat.c));
  if (c.fb === "round") return drawRoundCoat(g, c, coat.kind, coat.c, coat.c2 ?? hi(coat.c));
  const { cx, neck } = c.m;
  const side = c.view === "side";
  const tall = c.fb === "tall";
  const sitDrop = c.sit === 1 ? 3 : c.sit === 2 ? 2 : 0;
  const top = c.body === "suit" ? neck : (tall ? 13 : 18) + sitDrop;
  const bot = c.sit === 1 ? 26 : 24 + (c.sit === 2 ? 1 : 0);
  const base = coat.c;
  const c2 = coat.c2 ?? hi(base);
  const puffer = coat.kind === "puffer";
  for (let y = top; y <= bot; y++) {
    const [l0, r0] = cloakSpan(c, y);
    const k = y - top;
    // 패딩: 세 줄마다 누빔 선, 그 사이 줄은 한 칸씩 부푼다 (뒤쪽은 옆모습에서 덜)
    const bulge = puffer && k % 3 === 1 && y < bot && !c.lie ? 1 : 0;
    const l = l0 - (side ? 0 : bulge);
    const r = r0 + bulge;
    for (let x = l; x < r; x++) {
      // 정장 위 롱코트·패딩: 가슴의 셔츠·넥타이는 보이게 비워 둔다
      if (c.body === "suit" && y < neck + 4 && (c.view === "down" ? x >= cx - 2 && x <= cx + 1 : side && x >= cx + 1)) continue;
      let col = x >= r - 2 || y === bot ? lo(base) : x === l ? hi(base) : base;
      if (puffer && k % 3 === 0 && k > 0 && x > l && x < r - 1) col = seam(base);
      if (coat.kind === "duffle" && (x * 3 + y * 5) % 7 === 0 && x > l && x < r - 2) col = darken(base, 0.08); // 모직 결
      if (coat.kind === "sweater") {
        // 뜨개 스웨터: 가슴에 눈꽃 띠 (무늬 색 · 흰 점), 밑단 골지
        if (k === 2) col = (x + y) % 2 ? c2 : FUR;
        else if (k === 3 || k === 1) col = c2;
        else if (y === bot) col = x % 2 ? lo(base) : base;
      }
      g.set(x, y, col);
    }
  }
  if (c.lie) return;
  const lc = lo(base);
  const deep = seam(base);
  if (coat.kind === "puffer") {
    // 지퍼 (앞: 가운데 은색 줄 + 손잡이, 옆: 앞섶)
    if (c.view === "down") {
      for (let y = top + 1; y < bot; y++) g.set(cx - 1, y, 0xd8dce6);
      g.set(cx - 1, top + 1, 0xa8b0bc);
      g.set(cx, top + 2, 0xa8b0bc);
    } else if (side) for (let y = top + 1; y < bot; y++) g.set(cloakSpan(c, y)[1] - 2, y, deep);
    else {
      // 뒷모습: 등판 가운데 박음질 + 작은 상표
      g.set(cx - 1, top + 2, c2);
      g.set(cx, top + 2, c2);
    }
  } else if (coat.kind === "duffle") {
    // 떡볶이 단추 (크림 막대 + 밧줄 고리) + 주머니
    const tog = 0xf2e2bc;
    if (c.view === "down") {
      for (const y of [top + 1, top + 3, top + 5]) {
        if (y >= bot) continue;
        g.set(cx - 2, y, tog);
        g.set(cx - 1, y, tog);
        g.set(cx, y, deep);
      }
      g.hline(cx - 5, cx - 3, bot - 2, lc);
      g.hline(cx + 2, cx + 4, bot - 2, lc);
    } else if (side) {
      for (const y of [top + 1, top + 4]) if (y < bot) g.set(cloakSpan(c, y)[1] - 2, y, tog);
      g.hline(cx - 1, cx + 1, bot - 2, lc);
    } else g.vline(cx - 1, top + 2, bot - 1, lc);
  } else if (coat.kind === "long") {
    // 롱코트: V 옷깃 + 허리띠 + 단추 두 줄 (정장은 가운데 셔츠·넥타이가 보이게 비워 둔다)
    const beltY = Math.min(bot - 2, top + 4);
    if (c.view === "down") {
      if (c.body !== "suit") {
        g.set(cx - 2, top, lc);
        g.set(cx + 1, top, lc);
        g.set(cx - 1, top + 1, lc);
        g.set(cx, top + 1, lc);
      }
      const [l, r] = cloakSpan(c, beltY);
      g.hline(l, r - 1, beltY, deep);
      g.set(cx - 1, beltY, GOLD);
      g.set(cx - 3, beltY + 1, deep);
      g.set(cx + 2, beltY + 1, deep);
    } else if (side) {
      const [l, r] = cloakSpan(c, beltY);
      g.hline(l, r - 1, beltY, deep);
      g.vline(r - 2, top + 1, bot - 1, lc);
    } else {
      const [l, r] = cloakSpan(c, beltY);
      g.hline(l, r - 1, beltY, deep);
      g.vline(cx - 1, beltY + 1, bot, lc);
    }
  } else if (coat.kind === "sweater" && c.view === "down") {
    // 가운데 작은 나무 (초록 세모 + 별)
    const ty = top + 4;
    if (ty + 1 < bot) {
      g.set(cx - 1, ty, HOLLY);
      g.hline(cx - 2, cx, ty + 1, HOLLY);
      g.set(cx - 1, ty - 1, GOLD);
    }
  }
}

/** 이불 유령: 뜨개 판초 (얼굴 아래부터, 지그재그 띠 + 밑단 술) */
function drawPoncho(g: Grid, c: NwCtx, base: Color, c2: Color): void {
  const { cx, hy } = c.m;
  const y0 = Math.round(hy) + 4;
  for (let y = y0; y < 28; y++)
    for (let x = 0; x < 20; x++) {
      if (!g.filled(x, y)) continue;
      const k = y - y0;
      let col = x >= cx + 4 ? lo(base) : x <= cx - 6 ? hi(base) : base;
      if (k === 2) col = (x + c.hem) % 2 ? c2 : FUR;
      else if (k === 1 || k === 3) col = (x + y + c.hem) % 4 === 0 ? FUR : c2;
      g.set(x, y, col);
    }
  // 밑단 술 (물결 아래 칸마다 한 올)
  const hemY = c.sit === 1 ? 26 : c.sit === 2 ? 24 : 25;
  for (let x = cx - 7; x < cx + 7; x++) if (g.filled(x, hemY) && (x + c.hem) % 2 === 0) g.set(x, hemY, darken(base, 0.32));
}

/** 동글이: 배를 감싸는 조끼·패딩 (공 아래쪽 반) */
function drawRoundCoat(g: Grid, c: NwCtx, kind: NwCoatKind, base: Color, c2: Color): void {
  const { cx, hy } = c.m;
  const ry = c.sit ? 5.5 : 6;
  const inBall = (x: number, y: number) => ((x + 0.5 - cx) / 6.5) ** 2 + ((y + 0.5 - hy) / ry) ** 2 <= 1;
  const y0 = Math.round(hy) + 2;
  for (let y = y0; y < 28; y++)
    for (let x = 0; x < 20; x++) {
      if (!g.filled(x, y) || !inBall(x, y)) continue;
      const k = y - y0;
      let col = x - cx - (y - hy) > 3.5 || y >= hy + ry - 1 ? lo(base) : x - cx < -4 ? hi(base) : base;
      if ((kind === "puffer" || kind === "vest") && k === 2) col = seam(base);
      if (kind === "sweater" && k === 1) col = (x + y) % 2 ? c2 : FUR;
      g.set(x, y, col);
    }
  if (c.view === "down" && !c.lie) {
    if (kind === "sweater") {
      g.set(cx - 1, y0 + 2, HOLLY);
      g.set(cx - 1, y0 + 3, BERRY);
    } else for (let y = y0; y < Math.min(27, y0 + 4); y++) g.set(cx - 1, y, kind === "duffle" ? 0xf2e2bc : 0xd8dce6);
  }
}

// ── 목도리 ──

export function drawNwScarf(g: Grid, c: NwCtx, w: NpcWear): void {
  const s = w.scarf;
  if (!s) return;
  const { cx, neck } = c.m;
  const fb = c.fb;
  const half = fb === "round" || fb === "sheet" ? 6 : fb === "tall" ? 3 : 4;
  const base = s.c;
  const c2 = s.c2 ?? hi(base);
  const pat = s.pat ?? "solid";
  const col = (x: number, row: number): Color => {
    switch (pat) {
      case "stripe":
        return Math.floor((x + 40) / 2) % 2 ? c2 : base;
      case "dots":
        return (x + row * 2) % 3 === 0 ? c2 : base;
      case "check":
        return (x + row) % 2 ? c2 : base;
      case "rib":
        return x % 2 ? lighten(base, 0.12) : base;
      default:
        return base;
    }
  };
  const rows = s.thick ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    const y = neck + r;
    const ext = r === 0 ? 0 : -1;
    for (let x = cx - half - ext; x < cx + half + ext; x++) g.set(x, y, x >= cx + half - 1 + ext ? lo(col(x, r)) : col(x, r));
  }
  // 두툼한 목도리는 위로 한 줄 더 감싸 (턱 밑까지 폭 — 머리가 덮는 곳은 머리가 덮는다)
  if (s.thick) for (let x = cx - half + 1; x < cx + half - 1; x++) if (!g.filled(x, neck - 1) || fb === "round" || fb === "sheet") g.set(x, neck - 1, col(x, 1));
  if (c.lie || s.tail === false) return;
  // 늘어진 끝 (가로 줄무늬 + 끝 술)
  const tailRows = (x: number, y0: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const y = y0 + i;
      const last = i === n - 1;
      for (let dx = 0; dx < 2; dx++) {
        const cc = pat === "stripe" || pat === "check" ? (i % 2 ? c2 : base) : base;
        g.set(x + dx, y, last ? ((x + dx) % 2 ? c2 : lo(base)) : dx === 1 ? lo(cc) : cc);
      }
    }
  };
  const y1 = neck + rows;
  if (c.view === "down") tailRows(cx + 1, y1, fb === "round" || fb === "sheet" ? 3 : 4);
  else if (c.view === "up") tailRows(cx - 3, y1, 4);
  else {
    // 옆모습: 등 뒤로 날리는 끝 (걸음 위상으로 한 칸 들썩)
    const flap = c.hem % 2;
    const bx = cx - half - 1;
    g.set(bx, neck + flap, base);
    g.set(bx - 1, neck + flap, lo(base));
    g.set(bx - 1, neck + 1 + flap, pat === "stripe" ? c2 : base);
    g.set(bx - 2, neck + 1 + flap, lo(base));
  }
}

// ── 위 덧그림 (얼굴·머리 꾸미기 다음) ──

export function drawNwTop(g: Grid, c: NwCtx, w: NpcWear, top: number): void {
  if (w.box && c.body === "box") drawBox(g, c, w.box);
  if (w.cup && c.body === "cup") drawCup(g, c, w.cup);
  if (w.apron) drawApron(g, c, w.apron);
  if (w.mitt) drawMitts(g, c, w.mitt);
  if (w.brooch) drawBrooch(g, c, w);
  if (w.nose) drawNose(g, c);
  if (w.hat && w.hat.kind !== "ghostSanta") drawHat(g, c, w.hat, top);
}

/** 외곽선 다음: 유령 산타 모자(반투명) · 방울 반짝 */
export function drawNwGlow(g: Grid, c: NwCtx, w: NpcWear, top: number): void {
  const h = w.hat;
  if (!h) return;
  if (h.kind === "ghostSanta") drawGhostSanta(g, c, top, h.c ?? 0xf06a7a);
  else if (h.kind === "elf" && c.view !== "up") g.set(c.m.cx + 3, top - 3, GOLD_HI);
}

/** 장화 위 단 (외곽선 전, 서 있는 자세만) */
export function drawNwBoots(g: Grid, c: NwCtx, w: NpcWear): void {
  const b = w.boot;
  if (!b?.cuff || c.sit !== 0 || c.fb === "sheet" || c.body === "cup" || c.arms === "up" || c.lie || c.sink) return;
  const lx = c.fb === "round" ? 6 : 7;
  const rx = c.fb === "round" ? 12 : 11;
  for (const [x, f] of [
    [lx, c.f0],
    [rx, c.f1],
  ] as const) {
    const y = 25 + f[1];
    if (y < 25) continue;
    g.set(x + f[0], y, b.cuff);
    g.set(x + f[0] + 1, y, c.view === "side" ? darken(b.cuff, 0.12) : b.cuff);
  }
}

function drawMitts(g: Grid, c: NwCtx, mitt: Color): void {
  if (c.lie || c.sink || c.arms !== "none" || c.body === "cup" || c.body === "tube") return;
  const { cx, shY } = c.m;
  const mlo = lo(mitt);
  const cuff = lighten(mitt, 0.45);
  const fb = c.fb;
  // 손 높이: 어깨 아래 (동글이·이불 유령은 몸 옆구리)
  const y = fb === "round" ? Math.round(c.m.hy) + 2 : fb === "sheet" ? Math.round(c.m.hy) + 5 : fb === "tall" ? shY + 2 : shY + 1;
  const reach = fb === "round" || fb === "sheet" ? 7 : fb === "tall" ? 4 : c.body === "box" ? 7 : 6;
  const mit = (x: number, yy: number, back: boolean) => {
    g.set(x, yy, back ? mlo : cuff);
    g.set(x + 1, yy, back ? mlo : cuff);
    g.set(x, yy + 1, back ? mlo : mitt);
    g.set(x + 1, yy + 1, mlo);
    g.set(x, yy + 2, back ? darken(mitt, 0.36) : mitt);
    if (!back) g.set(x + 1, yy + 2, mlo);
  };
  if (c.view === "side") {
    // 앞손 하나 (걸음에 맞춰 한 칸 앞뒤로)
    const sw = Math.sign(c.f1[0]);
    if (!c.handBusy) mit(cx + 1 + sw, y + 1, false);
    return;
  }
  const back = c.view === "up";
  mit(cx - reach - 1, y, back);
  if (!c.handBusy || back) mit(cx + reach - 1, y, back);
}

function drawBrooch(g: Grid, c: NwCtx, w: NpcWear): void {
  if (c.lie || c.view === "up") return;
  const { cx, neck } = c.m;
  const side = c.view === "side";
  // 목도리가 있으면 목도리 위, 없으면 외투 가슴 (동글이·이불 유령은 목 줄)
  const y = w.scarf ? neck : neck + 2;
  const x = side ? cx + 1 : cx - 3;
  g.set(x - 1, y, HOLLY);
  g.set(x + 1, y, HOLLY_LO);
  g.set(x, y, BERRY);
  g.set(x, y - (w.scarf ? 0 : 1), BERRY_HI);
  if (!side) g.set(x + 1, y + 1, HOLLY);
}

function drawNose(g: Grid, c: NwCtx): void {
  if (c.view === "up") return;
  const { cx, hy } = c.m;
  const side = c.view === "side";
  const h = Math.round(hy);
  let x: number;
  let y: number;
  switch (c.fb) {
    case "round":
      [x, y] = side ? [cx + 5, h - 1] : [cx - 1, h - 1];
      break;
    case "tall":
      [x, y] = side ? [cx + 3, h + 1] : [cx - 1, h + 1];
      break;
    case "sheet":
      [x, y] = side ? [cx + 5, h] : [cx - 1, h];
      break;
    case "cat":
    case "bun":
      [x, y] = side ? [cx + 4, h + 1] : [cx - 1, h + 1];
      break;
    default:
      [x, y] = side ? [cx + 4, h + 2] : [cx - 1, h + 2];
  }
  g.set(x, y, BERRY);
  if (!side) g.set(x + 1, y, darken(BERRY, 0.18));
}

function drawApron(g: Grid, c: NwCtx, a: NonNullable<NpcWear["apron"]>): void {
  if (c.lie || c.view === "up" || objectBody(c.body)) return;
  const { cx, neck, hy } = c.m;
  const side = c.view === "side";
  const fb = c.fb;
  const y0 = fb === "round" ? Math.round(hy) + 2 : fb === "sheet" ? Math.round(hy) + 5 : neck + 1;
  const y1 = fb === "round" ? Math.min(25, Math.round(hy) + 5) : c.sit === 1 ? 25 : 24;
  const trim = a.trim ?? BERRY;
  if (side) {
    // 옆모습: 앞섶에 세로 띠 + 허리끈 매듭
    for (let y = y0; y <= y1; y++) g.set(cx + 2 + (fb === "round" ? 2 : 0), y, y === y1 ? trim : a.c);
    g.set(cx - 2, y0 + 2, trim);
    g.set(cx - 3, y0 + 3, trim);
    return;
  }
  for (let y = y0; y <= y1; y++) {
    const half = y === y0 ? 2 : 3;
    for (let x = cx - half; x < cx + half; x++) g.set(x, y, y === y1 ? ((x + y) % 2 ? trim : FUR) : x === cx + half - 1 ? lo(a.c) : a.c);
  }
  // 목끈 + 허리끈
  g.set(cx - 3, y0 - 1, trim);
  g.set(cx + 2, y0 - 1, trim);
  g.set(cx - 4, y0 + 2, trim);
  g.set(cx + 3, y0 + 2, trim);
  if (a.holly) {
    g.set(cx - 2, y0 + 1, HOLLY);
    g.set(cx, y0 + 1, HOLLY_LO);
    g.set(cx - 1, y0 + 1, BERRY);
    g.set(cx - 1, y0, BERRY_HI);
  }
}

function drawBox(g: Grid, c: NwCtx, kind: "snow" | "gift"): void {
  if (c.lie) return;
  const { cx } = c.m;
  const side = c.view === "side";
  const sitDrop = c.sit === 1 ? 3 : c.sit === 2 ? 2 : 0;
  const y0 = 18 + sitDrop;
  const bot = c.sit === 1 ? 26 : 24 + (c.sit === 2 ? 1 : 0);
  const x0 = side ? cx - 5 : cx - 6;
  const x1 = side ? cx + 4 : cx + 5;
  if (kind === "snow") {
    // 뚜껑 날개에 소복한 눈 (몽글몽글 끝)
    for (let x = x0 - 1; x <= x1 + 1; x++) g.set(x, y0, (x + 20) % 3 === 0 ? FUR_LO : FUR);
    for (const x of [x0 - 1, x0 + 2, x1 - 1]) g.set(x, y0 + 1, FUR);
    g.set(x0 - 2, y0 - 2, FUR);
    g.set(x1 + 2, y0 - 2, FUR);
    return;
  }
  // 선물 상자: 빨간 리본 십자 + 위에 큰 나비 매듭
  const rib = BERRY;
  const ribLo = darken(BERRY, 0.25);
  const rx = side ? cx - 1 : cx - 1;
  for (let y = y0; y <= bot; y++) {
    g.set(rx, y, rib);
    g.set(rx + 1, y, ribLo);
  }
  const my = Math.round((y0 + bot) / 2);
  for (let x = x0; x <= x1; x++) g.set(x, my, x >= x1 - 1 ? ribLo : rib);
  // 나비 매듭 (상자 윗면 가운데)
  const by = y0 - 1;
  g.set(rx - 2, by - 1, rib);
  g.set(rx - 1, by, rib);
  g.set(rx - 2, by, ribLo);
  g.set(rx + 2, by - 1, rib);
  g.set(rx + 1, by, rib);
  g.set(rx + 3, by, ribLo);
  g.set(rx, by, BERRY_HI);
  if (c.view === "down") {
    // 꼬리표 (송장 자리)
    g.rect(cx + 2, y0 + 2, 3, 2, FUR);
    g.set(cx + 3, y0 + 2, HOLLY);
  }
}

function drawCup(g: Grid, c: NwCtx, kind: "knit" | "candy"): void {
  if (c.lie) return;
  const { cx, hy } = c.m;
  const y0 = Math.round(hy) + 1;
  const y1 = Math.min(26, y0 + 6);
  for (let y = y0 + 2; y <= y0 + 4 && y < y1; y++)
    for (let x = cx - 7; x < cx + 7; x++) {
      if (!g.filled(x, y)) continue;
      let col: Color;
      if (kind === "candy") col = Math.floor((x + y + 40) / 2) % 2 ? BERRY : FUR;
      else col = y === y0 + 3 ? ((x + 40) % 4 < 2 ? 0x2e8a5a : FUR) : (x + y) % 2 ? 0xc8343e : 0xa82a34;
      g.set(x, y, x >= cx + 5 ? darken(col, 0.18) : col);
    }
  if (c.view === "down") {
    g.set(cx - 4, y0 + 1, HOLLY);
    g.set(cx - 3, y0 + 1, BERRY);
    g.set(cx - 2, y0 + 1, HOLLY_LO);
  }
}

// ── 모자 ──

/** 아바타가 아닌 NPC 그림(앞모습 한 장)에도 같은 모자를 씌운다 (머리 가운데 cx·hy, 반폭 rx, 윗면 top) */
export function drawNwHatAt(g: Grid, cx: number, hy: number, rx: number, top: number, hat: NonNullable<NpcWear["hat"]>, view: View = "down"): void {
  const c = { view, m: { cx, hy, rx } } as NwCtx;
  if (hat.kind === "ghostSanta") drawGhostSanta(g, c, top, hat.c ?? 0xf08a9a);
  else drawHat(g, c, hat, top);
}

function drawHat(g: Grid, c: NwCtx, h: NonNullable<NpcWear["hat"]>, top: number): void {
  const { cx, hy } = c.m;
  const view = c.view;
  const side = view === "side";
  const rx = Math.round(c.m.rx);
  // 앞 = 보는 쪽 (옆모습 오른쪽) · 고깔이 넘어가는 쪽은 뒤
  const back = side ? -1 : view === "up" ? -1 : 1;
  switch (h.kind) {
    case "beanie":
    case "bobble": {
      const base = h.c ?? 0xd8743a;
      const c2 = h.c2 ?? FUR;
      const rows: [number, number][] = [
        [top - 2, Math.max(2, Math.round(rx * 0.55))],
        [top - 1, Math.round(rx * 0.85)],
        [top, rx],
        [top + 1, rx],
      ];
      for (const [y, hw] of rows)
        for (let x = cx - hw; x < cx + hw; x++) g.set(x, y, x >= cx + hw - 2 ? lo(base) : x === cx - hw ? hi(base) : y === top - 1 && h.kind === "beanie" ? mix(base, c2, 0.5) : base);
      // 접은 단 (골지)
      const rib = h.c3 ?? lighten(base, 0.25);
      for (let x = cx - rx; x < cx + rx; x++) g.set(x, top + 2, (x + 20) % 2 ? rib : darken(rib, 0.12));
      if (h.kind === "beanie") {
        // 동그란 방울
        const px = side ? cx - 2 : cx - 1;
        g.hline(px - 1, px + 1, top - 3, c2);
        g.set(px, top - 4, c2);
        g.set(px - 1, top - 4, lighten(c2, 0.4));
        g.set(px + 1, top - 3, darken(c2, 0.15));
      } else {
        // 늘어진 긴 뜨개 끝 + 술 방울 (뒤로 넘어간다)
        const tx = cx + back * 3;
        g.set(tx, top - 2, base);
        g.set(tx + back, top - 2, lo(base));
        g.set(tx + back * 2, top - 1, base);
        g.set(tx + back * 3, top, lo(base));
        g.set(tx + back * 3, top + 1, c2);
        g.set(tx + back * 4, top + 1, c2);
        g.set(tx + back * 3, top + 2, darken(c2, 0.12));
        // 가로 줄무늬
        for (let x = cx - rx + 1; x < cx + rx - 1; x++) g.set(x, top, c2);
      }
      return;
    }
    case "earmuff": {
      const fur = h.c ?? 0xf4a6b8;
      const band = h.c2 ?? 0x8a6a8a;
      const furLo = darken(fur, 0.2);
      const cup = (x: number, y: number) => {
        g.set(x, y - 1, fur);
        g.rect(x - 1, y, 3, 2, fur);
        g.set(x, y + 2, furLo);
        g.set(x + 1, y + 1, furLo);
        g.set(x - 1, y, lighten(fur, 0.35));
      };
      const ey = Math.round(hy) - 1;
      if (side) {
        g.vline(cx - 1, top - 1, ey - 2, band);
        g.set(cx, top - 1, band);
        cup(cx - 1, ey);
        return;
      }
      const L = cx - Math.ceil(c.m.rx);
      const R = cx + Math.ceil(c.m.rx) - 1;
      g.hline(L + 2, R - 2, top - 1, band);
      g.set(L + 1, top, band);
      g.set(R - 1, top, band);
      g.vline(L, top + 1, ey - 2, band);
      g.vline(R, top + 1, ey - 2, band);
      cup(L, ey);
      cup(R, ey);
      return;
    }
    case "trapper": {
      const base = h.c ?? 0x7a5236;
      const fur = h.c3 ?? 0xf0e4cc;
      const furLo = darken(fur, 0.14);
      // 둥근 정수리
      const rows: [number, number][] = [
        [top - 2, Math.max(2, Math.round(rx * 0.6))],
        [top - 1, rx],
        [top, rx],
      ];
      for (const [y, hw] of rows) for (let x = cx - hw; x < cx + hw; x++) g.set(x, y, x >= cx + hw - 2 ? lo(base) : x === cx - hw ? hi(base) : base);
      // 앞 털 챙 (도톰)
      for (let x = cx - rx - 1; x < cx + rx + 1; x++) g.set(x, top + 1, (x + 20) % 3 === 0 ? furLo : fur);
      // 귀덮개 (털)
      const flap = (x: number) => {
        g.vline(x, top + 2, Math.round(hy) + 1, fur);
        g.vline(x + 1, top + 2, Math.round(hy) + 1, furLo);
        g.set(x, Math.round(hy) + 2, furLo);
      };
      if (side) flap(cx - 2);
      else {
        flap(cx - rx - 1);
        flap(cx + rx - 1);
      }
      // 꼭대기 끈 매듭
      if (!side) g.set(cx - 1, top - 3, h.c2 ?? lo(base));
      return;
    }
    case "santa": {
      const red = h.c ?? 0xd8323c;
      const redLo = darken(red, 0.25);
      const fur = h.c3 ?? FUR;
      // 몽글몽글 두 줄 털 단
      for (let x = cx - rx; x < cx + rx; x++) {
        g.set(x, top, (x + 20) % 3 === 0 ? FUR_LO : fur);
        if (x > cx - rx && x < cx + rx - 1) g.set(x, top + 1, (x + 21) % 3 === 0 ? FUR_LO : fur);
      }
      g.hline(cx - rx + 1, cx + rx - 2, top - 1, red);
      g.set(cx + rx - 2, top - 1, redLo);
      g.hline(cx - 3, cx + 2, top - 2, red);
      g.set(cx + 2, top - 2, redLo);
      // 고깔이 뒤로 넘어가 늘어진다
      g.hline(cx - 2 + back, cx + 1 + back, top - 3, redLo);
      g.set(cx + 3 * back, top - 3, red);
      g.set(cx + 4 * back, top - 2, red);
      // 방울
      const px = back > 0 ? cx + 4 : cx - 6;
      g.rect(px, top - 1, 2, 2, fur);
      g.set(back > 0 ? px + 1 : px, top, FUR_LO);
      return;
    }
    case "elf": {
      const green = h.c ?? 0x2e9a4e;
      const gLo = darken(green, 0.28);
      const stripe = h.c2 ?? 0xd8323c;
      // 빨강·흰 지그재그 챙
      for (let x = cx - rx; x < cx + rx; x++) g.set(x, top, (x + 20) % 2 ? stripe : FUR);
      for (let x = cx - rx + 1; x < cx + rx - 1; x++) g.set(x, top + 1, (x + 21) % 2 ? stripe : FUR);
      // 뾰족 고깔 (위로 솟다가 끝이 앞으로 말린다)
      const f = view === "up" ? -1 : 1;
      g.hline(cx - rx + 1, cx + rx - 2, top - 1, green);
      g.set(cx + rx - 2, top - 1, gLo);
      g.hline(cx - 2, cx + 1, top - 2, green);
      g.set(cx + 1, top - 2, gLo);
      g.set(cx - 1, top - 3, green);
      g.set(cx, top - 3, gLo);
      g.set(cx + f, top - 4, green);
      g.set(cx + 2 * f, top - 4, gLo);
      // 끝 방울 (금)
      g.set(cx + 3 * f, top - 3, GOLD);
      g.set(cx + 3 * f, top - 2, darken(GOLD, 0.25));
      return;
    }
    case "antler": {
      const band = h.c ?? 0xc8303a;
      // 머리띠 (머리 윗면)
      for (let x = cx - rx + 1; x < cx + rx - 1; x++) g.set(x, top, x >= cx + rx - 3 ? darken(band, 0.2) : band);
      const horn = (x: number, d: number) => {
        g.vline(x, top - 3, top - 1, ANTLER);
        g.set(x + d, top - 2, ANTLER_HI);
        g.set(x + d * 2, top - 3, ANTLER);
        g.set(x, top - 4, ANTLER_HI);
        g.set(x - d, top - 4, ANTLER);
      };
      if (side) {
        horn(cx - 1, -1);
        horn(cx + 2, 1);
      } else {
        horn(cx - 3, -1);
        horn(cx + 2, 1);
      }
      // 머리띠 가운데 방울
      if (view === "down") {
        g.set(cx - 1, top - 1, GOLD);
        g.set(cx, top - 1, darken(GOLD, 0.2));
      }
      return;
    }
    case "holly": {
      // 호랑가시 화관: 머리 윗면을 두르는 잎 줄 + 군데군데 빨간 열매 (잎 끝이 위로 삐죽)
      const w = side ? rx - 1 : rx;
      for (let x = cx - w; x < cx + w; x++) {
        const k = x - cx + 20;
        g.set(x, top, k % 2 ? HOLLY : HOLLY_LO);
        if (k % 3 === 0) g.set(x, top - 1, HOLLY);
      }
      const berries = side ? [cx - 1] : [cx - 3, cx + 1];
      for (const bx of berries) {
        g.set(bx, top, BERRY);
        g.set(bx + 1, top, darken(BERRY, 0.2));
        g.set(bx, top - 1, BERRY_HI);
      }
      return;
    }
    default:
      return;
  }
}

/** 유령 산타 모자: 반투명 분홍빛 고깔 + 은은한 털 단 (외곽선 없이 — 비쳐 보이게) */
function drawGhostSanta(g: Grid, c: NwCtx, top: number, tint: Color): void {
  const { cx } = c.m;
  const rx = Math.round(c.m.rx);
  const back = c.view === "down" ? 1 : -1;
  const A = 180;
  const fur = 0xf4f8ff;
  for (let x = cx - rx; x < cx + rx; x++) g.set(x, top, fur, (x + 20) % 3 === 0 ? 150 : 200);
  for (let x = cx - rx + 1; x < cx + rx - 1; x++) g.set(x, top - 1, x === cx - rx + 1 ? lighten(tint, 0.35) : tint, A);
  for (let x = cx - 3; x < cx + 3; x++) g.set(x, top - 2, x === cx - 3 ? lighten(tint, 0.35) : tint, A);
  for (let x = cx - 2 + back; x < cx + 2 + back; x++) g.set(x, top - 3, darken(tint, 0.15), A);
  g.set(cx + 3 * back, top - 3, tint, A);
  g.set(cx + 4 * back, top - 2, tint, A);
  const px = back > 0 ? cx + 4 : cx - 6;
  g.rect(px, top - 1, 2, 2, fur, 220);
  g.set(back > 0 ? px : px + 1, top - 1, 0xffffff, 255);
}
