import { HOUSE_LOT_H, HOUSE_LOT_W } from "@tomb/protocol";
import type { HouseExteriorMap } from "@/lib/housing/catalog";

// 11/20 집 배치·정보만 (그림 없음). 마을 충돌·빛 계산(game/world/layout.ts)이 이것만 가져가
// 첫 화면 미리보기 묶음에 가구·외관 그림이 딸려 들어가지 않게 exterior.ts에서 떼어 냈다.

/** 기본 필지 크기 (프로토콜 HOUSE_LOT_W/H) */
export const FACADE_W = HOUSE_LOT_W;
export const FACADE_H = HOUSE_LOT_H;

export type LotSize = { w: number; h: number };
export const DEFAULT_SIZE: LotSize = { w: FACADE_W, h: FACADE_H };

export type Rect = { x: number; y: number; w: number; h: number };
export type Block = { x: number; w: number; wallH: number; roof: "gable" | "hip"; roofH: number; over: number; wins: Rect[]; main?: boolean };

/** 집 배치 계획 (필지 좌표) */
export type HousePlan = {
  tier: "small" | "wide" | "manor";
  W: number;
  H: number;
  cx: number;
  /** 집 밑변 y (문 아래) */
  baseY: number;
  blocks: Block[];
  door: Rect & { double: boolean };
  chimneys: Rect[];
  /** 지붕·굴뚝 맨 위 y (문패를 그 위에) */
  roofTop: number;
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function housePlan(tierId: string, size: LotSize = DEFAULT_SIZE): HousePlan {
  const W = size.w;
  const H = size.h;
  const tier = tierId === "manor" || tierId === "wide" ? tierId : "small";
  // 기준 필지(128×104) 대비 배율. 그림이 너무 작아지거나 커지지 않게 묶는다
  const k = Math.max(0.75, Math.min(1.6, Math.min(W / 128, H / 104)));
  const s = (n: number) => Math.round(n * k);
  const cx = Math.floor(W / 2);
  const baseY = H - 16;
  const blocks: Block[] = [];
  const chimneys: Rect[] = [];
  let door: HousePlan["door"];
  const win = (x: number, y: number, w = 9, h = 10): Rect => ({ x, y, w: s(w), h: s(h) });

  if (tier === "small") {
    const w = even(s(54));
    const x = cx - w / 2;
    const wallH = s(26);
    const top = baseY - wallH;
    blocks.push({ x, w, wallH, roof: "gable", roofH: s(20), over: 4, main: true, wins: [win(x + s(7), top + s(7)), win(x + w - s(7) - s(9), top + s(7))] });
    chimneys.push({ x: cx + s(11), y: top - s(19), w: 6, h: s(13) });
    door = { x: cx - 5, y: baseY - s(16), w: 10, h: s(16), double: false };
  } else if (tier === "wide") {
    const w = even(s(58));
    const x = cx - w / 2;
    const wallH = s(30);
    const top = baseY - wallH;
    // 오른쪽 별채 (낮은 모임지붕) — 본채보다 먼저 그려 본채가 겹친다
    const ww = s(28);
    const wx = x + w - 2;
    const wH = s(22);
    blocks.push({ x: wx, w: ww, wallH: wH, roof: "hip", roofH: s(12), over: 3, wins: [win(wx + Math.round((ww - s(14)) / 2) + 1, baseY - wH + s(6), 14, 9)] });
    blocks.push({ x, w, wallH, roof: "gable", roofH: s(24), over: 4, main: true, wins: [win(x + s(7), top + s(9)), win(x + w - s(7) - s(9), top + s(9))] });
    chimneys.push({ x: wx + ww - s(10), y: baseY - wH - s(16), w: 6, h: s(12) });
    door = { x: cx - 5, y: baseY - s(17), w: 10, h: s(17), double: false };
  } else {
    const w = even(s(50));
    const x = cx - w / 2;
    const wallH = s(48);
    const top = baseY - wallH;
    const ww = s(26);
    const wH = s(34);
    const wTop = baseY - wH;
    const lx = x - ww + 2;
    const rx = x + w - 2;
    const wingWins = (bx: number) => [win(bx + s(5), wTop + s(8), 7, 13), win(bx + ww - s(5) - s(7), wTop + s(8), 7, 13)];
    blocks.push({ x: lx, w: ww, wallH: wH, roof: "hip", roofH: s(14), over: 3, wins: wingWins(lx) });
    blocks.push({ x: rx, w: ww, wallH: wH, roof: "hip", roofH: s(14), over: 3, wins: wingWins(rx) });
    const up = top + s(6);
    blocks.push({
      x,
      w,
      wallH,
      roof: "gable",
      roofH: s(22),
      over: 4,
      main: true,
      wins: [win(x + s(5), up), win(cx - Math.round(s(9) / 2), up), win(x + w - s(5) - s(9), up), win(x + s(4), baseY - s(19), 8, 11), win(x + w - s(4) - s(8), baseY - s(19), 8, 11)],
    });
    chimneys.push({ x: lx + s(6), y: wTop - s(17), w: 6, h: s(13) }, { x: rx + ww - s(12), y: wTop - s(17), w: 6, h: s(13) });
    door = { x: cx - 7, y: baseY - s(19), w: 14, h: s(19), double: true };
  }
  let roofTop = Infinity;
  for (const b of blocks) roofTop = Math.min(roofTop, baseY - b.wallH - b.roofH);
  for (const c of chimneys) roofTop = Math.min(roofTop, c.y - 2);
  return { tier, W, H, cx, baseY, blocks, door, chimneys, roofTop: Math.max(0, roofTop) };
}

// ── 정보 (충돌·빛·문·연기) ──

export type FacadeInfo = {
  /** 문 앞 (필지 좌표, 발밑) */
  door: { x: number; y: number };
  /** 집 발 자리 (충돌용) */
  body: { x: number; y: number; w: number; h: number };
  lights: { x: number; y: number; r: number; color: number }[];
  /** 굴뚝 꼭대기 (연기) */
  chimneys: { x: number; y: number }[];
  /** 지붕 맨 위 y (문패 자리) */
  roofTop: number;
  /** 집 밑변 y (깊이 정렬) */
  baseY: number;
};

/** 집 발 자리 깊이 (앞에서 본 그림이라 몸체 높이보다 얕게: 그 뒤로 걸어가면 지붕에 가려진다) */
const FOOT_DEPTH = 26;

export function facadeInfo(ext: Partial<HouseExteriorMap>, tier: string, size: LotSize = DEFAULT_SIZE): FacadeInfo {
  const p = housePlan(tier, size);
  const x0 = Math.min(...p.blocks.map((b) => b.x));
  const x1 = Math.max(...p.blocks.map((b) => b.x + b.w));
  const lights: FacadeInfo["lights"] = [];
  // 창 불빛: 채마다 하나 (창 여러 개의 가운데). 빛이 너무 많으면 밤 화면이 무거워진다
  for (const b of p.blocks) {
    if (!b.wins.length) continue;
    const wx0 = Math.min(...b.wins.map((w) => w.x));
    const wx1 = Math.max(...b.wins.map((w) => w.x + w.w));
    const wy = b.wins.reduce((s, w) => s + w.y + w.h / 2, 0) / b.wins.length;
    lights.push({ x: (wx0 + wx1) / 2, y: wy + 2, r: Math.min(26, 10 + (wx1 - wx0) / 3), color: 0xffc070 });
  }
  const f = front(p);
  if (ext.garden === "garden_lanterns") for (const lx of f.lanterns) lights.push({ x: lx, y: p.baseY + 2, r: 18, color: 0xffb060 });
  if (ext.sign === "sign_neon") lights.push({ x: Math.min(f.signX, p.W - 21) + 8, y: p.H - 18, r: 20, color: 0xff7ac0 });
  lights.push({ x: f.lampX, y: p.H - 19, r: 26, color: 0xffd080 });
  if (p.tier === "manor") for (const gx of f.pillars) lights.push({ x: gx, y: p.H - 19, r: 18, color: 0xffd080 });
  return {
    door: { x: p.cx, y: p.baseY + 4 },
    body: { x: x0, y: p.baseY - FOOT_DEPTH, w: x1 - x0, h: FOOT_DEPTH },
    lights,
    chimneys: p.chimneys.map((c) => ({ x: c.x + c.w / 2, y: c.y - 1 })),
    roofTop: p.roofTop,
    baseY: p.baseY,
  };
}

/** 앞마당 물건 자리 */
/** 11/19 앞마당 물건 자리 (겨울 장식 winterLots도 같은 자리에 얹는다) */
export const lotFront = (p: HousePlan) => front(p);

/** 앞마당 파츠 자리 (exterior.ts 그림도 같은 값) */
export function front(p: HousePlan) {
  const gap = p.tier === "manor" ? 11 : 9;
  return {
    /** 길 반폭 (울타리·담이 비우는 곳) */
    gap,
    mailX: p.cx - gap - 16,
    signX: p.cx + gap + 4,
    lampX: 4,
    lanterns: [p.cx - gap + 1, p.cx + gap - 2],
    pillars: [p.cx - gap - 2, p.cx + gap + 1],
  };
}
