// 폭죽 무늬의 순수 계산: 어떤 불티가 어느 방향·속도로 언제 나오는지 (Phaser 없이).
// 게임(Fireworks.ts)과 상점·폭죽 창의 미리보기(components/shop/FireworkPreview)가 같은 코드로 터뜨리고,
// 불티 처음 상태(sparkState)·움직임(stepSpark)·꼬리(sparkTrail)·밝기(sparkLook)·로켓 꼬리(rocketTrail)도 함께 쓴다.

import { fireworkShowMs } from "@tomb/protocol";
import { burstSpeed, finaleTimes, FW_BASE_RADIUS, heartPoint, sampleTextMask, type FireworkPlan } from "./fxMath";

export type FwPattern =
  | "peony"
  | "ring"
  | "heart"
  | "willow"
  | "double"
  | "brocade"
  | "letters"
  | "star"
  | "spiral"
  | "crossette"
  | "fountain"
  | "waterfall"
  | "smile"
  | "twinring"
  | "butterfly"
  | "snow"
  | "strobe"
  | "chameleon"
  | "glitter"
  | "palm"
  // 11/20 새 무늬: 터지는 방식이 저마다 다르다
  | "kiku"
  | "niagara"
  | "kamuro"
  | "rainbow"
  | "crackle"
  | "whistle"
  | "fish"
  | "parachute"
  | "cascade"
  | "pinwheel"
  | "emoji";

/** 프레임이 느릴 때 입자 수 배율 (dtAvg = 프레임 시간 이동 평균 ms). 게임과 미리보기가 같은 기준으로 줄인다 */
export function slowFactor(dtAvg: number): number {
  return dtAvg > 24 ? 0.55 : dtAvg > 19 ? 0.8 : 1;
}

/** 불티 기본 중력 (월드 px/s²) */
export const FW_GRAVITY = 26;
/** 로켓이 솟는 시간 / 발밑에서 터지는 높이 */
export const FW_RISE_MS = 720;
export const FW_BURST_H = 96;
/** 피날레 로켓이 지평선에서 솟는 시간 */
export const FW_SKY_RISE_MS = 520;
/** 분수 폭죽이 뿜는 시간 */
export const FOUNTAIN_MS = 2200;

export const FW_COLORS = {
  gold: [0xffe08a, 0xfff4d0, 0xffb860],
  pink: [0xff8fb8, 0xffc2d6, 0xff6f9f],
  cyan: [0x8fe0ff, 0xd8f6ff, 0x6ab8f0],
  violet: [0xd0a0ff, 0xf0dcff, 0xa070e8],
  red: [0xff7a62, 0xffc0a8, 0xff4a4a],
  green: [0xa6ff9a, 0xe4ffd8, 0x62e07e],
  silver: [0xffffff, 0xe2ecff, 0xbcd0ff],
  yellow: [0xffe45a, 0xfff6b0, 0xffc830],
} as const;
/** 무지개 아치 띠 색 (안쪽 보라 → 바깥 빨강) */
export const FW_RAINBOW: readonly number[] = [0xb070ff, 0x6a7cff, 0x5ad0ff, 0x7aff8a, 0xfff060, 0xffa040, 0xff5a5a];
export const FINALE_COLORS: readonly (readonly number[])[] = [
  FW_COLORS.gold,
  FW_COLORS.pink,
  FW_COLORS.cyan,
  FW_COLORS.violet,
  FW_COLORS.red,
  FW_COLORS.green,
  FW_COLORS.silver,
];
const FINALE_PATTERNS: readonly FwPattern[] = ["peony", "ring", "double", "willow", "peony", "double", "ring", "heart"];

/** 불티 하나의 처음 상태. 터진 자리에서 (ox,oy)만큼 떨어진 곳에 at(ms) 뒤에 생긴다 */
export type SparkSpec = {
  vx: number;
  vy: number;
  life: number;
  color: number;
  size: number;
  drag: number;
  grav: number;
  at?: number;
  ox?: number;
  oy?: number;
  /** 이 나이(ms)에 공기 저항·중력을 바꿔 흘러내린다 (글자 폭죽) */
  swapAt?: number;
  /** 수명의 이 비율까지는 밝게 유지 */
  fadeFrom?: number;
  /** 이 불티가 생길 때 작은 터지는 소리 (늦게 터지는 반짝이의 첫 불티) */
  pop?: boolean;
  /** 이 나이(ms)가 되면 색이 color2로 바뀐다 (색이 바뀌는 국화) */
  color2?: number;
  colorAt?: number;
  /** 꼬리: 이 간격(ms)마다 지나간 자리에 작은 불티를 남긴다 (버드나무 가지·야자수 잎·금가루) */
  trail?: number;
  /** 꼬리 불티 수명(ms)·색(없으면 그때 불티 색)·중력(금가루는 떨어진다)·점멸 */
  trailLife?: number;
  trailColor?: number;
  trailFall?: number;
  trailStrobe?: number;
  /** 밝기 배율 (꼬리처럼 은은한 불티) */
  bright?: number;
  /** 점멸 주기(ms)와 어긋남(0..1): 처음부터 깜빡인다 (별빛 점멸·금가루) */
  strobe?: number;
  strobeOff?: number;
  /** 꿈틀: 가는 방향의 옆으로 이 세기(px/s)만큼 흔들린다 (물고기 떼). 거의 멈췄으면 좌우로 (낙하산 별) */
  wig?: number;
  wigHz?: number;
  wigOff?: number;
};

export type BurstOpts = {
  /** 수명 배율 (plan.life) */
  life: number;
  /** 불티 크기 */
  size: number;
  /** 원하는 입자 수 → 실제로 쓸 수 있는 수 (풀 한도·느린 프레임·reduced) */
  budget: (want: number) => number;
  reduced?: boolean;
  rand?: () => number;
};

/** 오각별 둘레 위의 점 (t: 0..2π, 반지름 대략 1, 위 꼭짓점부터) */
export function starPoint(t: number, points = 5, inner = 0.45): { x: number; y: number } {
  const n = points * 2;
  const u = ((((t / (Math.PI * 2)) % 1) + 1) % 1) * n;
  const i = Math.floor(u);
  const f = u - i;
  const corner = (k: number) => {
    const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
    const r = k % 2 === 0 ? 1 : inner;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  };
  const a = corner(i);
  const b = corner(i + 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** 웃는 얼굴 점들 (얼굴 둘레 + 두 눈 + 입), 반지름 1 기준 */
export function smilePoints(face: number, eye: number, mouth: number): { x: number; y: number; part: "face" | "eye" | "mouth" }[] {
  const out: { x: number; y: number; part: "face" | "eye" | "mouth" }[] = [];
  for (let i = 0; i < face; i++) {
    const a = (i / face) * Math.PI * 2;
    out.push({ x: Math.cos(a), y: Math.sin(a), part: "face" });
  }
  for (const ex of [-0.36, 0.36]) {
    for (let i = 0; i < eye; i++) {
      const a = (i / eye) * Math.PI * 2;
      out.push({ x: ex + Math.cos(a) * 0.09, y: -0.3 + Math.sin(a) * 0.12, part: "eye" });
    }
  }
  for (let i = 0; i < mouth; i++) {
    const a = Math.PI * (0.18 + 0.64 * (mouth > 1 ? i / (mouth - 1) : 0.5));
    out.push({ x: Math.cos(a) * 0.56, y: 0.02 + Math.sin(a) * 0.5, part: "mouth" });
  }
  return out;
}

/** 나비 날개 둘레 위의 점 (t: 0..2π, 반지름 대략 1). 위 날개가 크고 아래 날개가 작다, 몸은 세로 */
export function butterflyPoint(t: number): { x: number; y: number } {
  const up = Math.sin(t) < 0;
  const r = Math.pow(Math.abs(Math.sin(2 * t)), 0.7) * (up ? 1 : 0.68);
  return { x: Math.cos(t) * r * 1.12, y: Math.sin(t) * r * 0.86 + (up ? -0.04 : 0.06) };
}

/** 눈꽃 점들: 여섯 갈래 줄기 + 줄기마다 양옆 잔가지 두 쌍 (반지름 1 기준, k = 촘촘함) */
export function snowPoints(k: number): { x: number; y: number; tip: boolean }[] {
  const out: { x: number; y: number; tip: boolean }[] = [];
  const stem = Math.max(3, Math.round(7 * k));
  for (let a = 0; a < 6; a++) {
    const ang = -Math.PI / 2 + (a / 6) * Math.PI * 2;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    for (let i = 1; i <= stem; i++) out.push({ x: (ux * i) / stem, y: (uy * i) / stem, tip: i === stem });
    for (const [at, len] of [
      [0.48, 0.32],
      [0.74, 0.2],
    ] as const) {
      const bn = Math.max(1, Math.round(3 * k * (len / 0.32)));
      for (const side of [-1, 1]) {
        const b = ang + (side * Math.PI) / 3;
        for (let j = 1; j <= bn; j++) out.push({ x: ux * at + (Math.cos(b) * len * j) / bn, y: uy * at + (Math.sin(b) * len * j) / bn, tip: j === bn });
      }
    }
  }
  return out;
}

/** 공기 저항 drag·중력 grav에서 t초 뒤 불티가 처음 자리에서 움직인 거리 */
export function sparkOffset(vx: number, vy: number, drag: number, grav: number, t: number): { x: number; y: number } {
  const d = Math.max(0.01, drag);
  const e = 1 - Math.exp(-d * t);
  const term = grav / d;
  return { x: (vx / d) * e, y: term * t + ((vy - term) / d) * e };
}

/**
 * 반경 R(월드 px)로 퍼지는 불꽃의 불티 목록.
 * 게임은 이걸 Phaser 이미지로, 미리보기는 캔버스로 그린다.
 */
export function burstSparks(pattern: FwPattern, R: number, colors: readonly number[], o: BurstOpts): SparkSpec[] {
  const rnd = o.rand ?? Math.random;
  const rand = (a: number, b: number) => a + rnd() * (b - a);
  const { life, size } = o;
  const g = FW_GRAVITY * Math.pow(R / FW_BASE_RADIUS, 0.8);
  const s = R / FW_BASE_RADIUS;
  const out: SparkSpec[] = [];
  const add = (sp: SparkSpec) => out.push(sp);
  switch (pattern) {
    case "heart": {
      // 하트 모양 그대로 커지도록 공기 저항을 작게
      const n = o.budget(60);
      const sp = 52 * (R / (FW_BASE_RADIUS * 1.15));
      for (let i = 0; i < n; i++) {
        const h = heartPoint((i / n) * Math.PI * 2);
        add({ vx: h.x * sp, vy: h.y * sp, life: (1500 + rnd() * 300) * life, color: colors[i % colors.length], size, drag: 0.5, grav: g * 0.45 });
      }
      break;
    }
    case "star": {
      // 오각별: 하트처럼 모양을 유지하며 커진다. 가운데에 흰 반짝이
      const n = o.budget(70);
      const sp = 56 * (R / (FW_BASE_RADIUS * 1.15));
      const tilt = (rnd() - 0.5) * 0.4;
      for (let i = 0; i < n; i++) {
        const p = starPoint((i / n) * Math.PI * 2);
        const x = p.x * Math.cos(tilt) - p.y * Math.sin(tilt);
        const y = p.x * Math.sin(tilt) + p.y * Math.cos(tilt);
        add({ vx: x * sp, vy: y * sp, life: (1500 + rnd() * 300) * life, color: colors[i % colors.length], size, drag: 0.5, grav: g * 0.4 });
      }
      const m = o.budget(8);
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2;
        add({ vx: Math.cos(a) * 8 * s, vy: Math.sin(a) * 8 * s, life: 900 * life, color: 0xffffff, size: size * 0.8, drag: 1.5, grav: g * 0.3 });
      }
      break;
    }
    case "smile": {
      // 웃는 얼굴: 얼굴 둘레(노랑) + 눈·입(흰빛)
      const k = o.budget(80) / 80;
      const pts = smilePoints(Math.max(8, Math.round(44 * k)), Math.max(3, Math.round(6 * k)), Math.max(5, Math.round(18 * k)));
      const sp = 50 * (R / (FW_BASE_RADIUS * 1.15));
      pts.forEach((p, i) => {
        const c = p.part === "face" ? colors[i % colors.length] : i % 2 ? 0xffffff : 0xfff0c0;
        add({ vx: p.x * sp, vy: p.y * sp, life: (1700 + rnd() * 250) * life, color: c, size: p.part === "face" ? size : size * 0.9, drag: 0.5, grav: g * 0.35 });
      });
      break;
    }
    case "twinring": {
      // 고리 두 겹: 비스듬히 누운 바깥 고리(토성 고리처럼 납작) + 안쪽 동그란 고리, 가운데 반짝
      const n = o.budget(46);
      const m = o.budget(30);
      const L = 1500 * life;
      const sp = burstSpeed(R, 1.1, (L * 0.8) / 1000);
      const tilt = (rnd() - 0.5) * 0.5 + 0.25;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a);
        const y = Math.sin(a) * 0.36;
        add({ vx: (x * ct - y * st) * sp, vy: (x * st + y * ct) * sp, life: L + rnd() * 200, color: colors[i % 2], size, drag: 1.1, grav: g * 0.55 });
      }
      const inner = FW_COLORS.cyan;
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2;
        add({ vx: Math.cos(a) * sp * 0.52, vy: Math.sin(a) * sp * 0.52, life: L * 0.9 + rnd() * 150, color: inner[i % 2], size: size * 0.9, drag: 1.1, grav: g * 0.55 });
      }
      const c = o.budget(6);
      for (let i = 0; i < c; i++) {
        const a = (i / c) * Math.PI * 2;
        add({ vx: Math.cos(a) * 6 * s, vy: Math.sin(a) * 6 * s, life: 800 * life, color: 0xffffff, size: size * 0.8, drag: 1.5, grav: g * 0.3 });
      }
      break;
    }
    case "butterfly": {
      // 나비: 하트처럼 모양을 지키며 커진다. 날개 둘레(보라·분홍) + 금빛 몸통과 더듬이
      const n = o.budget(76);
      const sp = 54 * (R / (FW_BASE_RADIUS * 1.15));
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const p = butterflyPoint(t);
        const edge = Math.abs(Math.sin(2 * t)) > 0.8;
        add({ vx: p.x * sp, vy: p.y * sp, life: (1550 + rnd() * 300) * life, color: edge ? FW_COLORS.pink[i % 2] : colors[i % colors.length], size, drag: 0.5, grav: g * 0.4 });
      }
      const body = Math.max(3, Math.round(o.budget(10) * 0.6));
      for (let i = 0; i < body; i++) {
        const y = -0.28 + (0.56 * i) / Math.max(1, body - 1);
        add({ vx: 0, vy: y * sp, life: (1500 + rnd() * 200) * life, color: FW_COLORS.gold[i % 2], size: size * 0.9, drag: 0.5, grav: g * 0.4 });
      }
      for (const side of [-1, 1]) {
        for (const d of [0.16, 0.3]) add({ vx: side * d * 0.5 * sp, vy: (-0.3 - d) * sp, life: 1400 * life, color: 0xfff4d0, size: size * 0.75, drag: 0.5, grav: g * 0.4 });
      }
      break;
    }
    case "snow": {
      // 눈꽃: 여섯 갈래 줄기와 잔가지가 모양 그대로 커진다. 가지 끝은 처음부터 반짝인다
      const k = Math.min(1, o.budget(100) / 100);
      const pts = snowPoints(k);
      const sp = 52 * (R / (FW_BASE_RADIUS * 1.15));
      const tilt = (rnd() - 0.5) * 0.3;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      pts.forEach((p, i) => {
        const x = p.x * ct - p.y * st;
        const y = p.x * st + p.y * ct;
        add({
          vx: x * sp,
          vy: y * sp,
          life: (1700 + rnd() * 250) * life,
          color: p.tip ? 0xffffff : colors[i % colors.length],
          size: p.tip ? size * 1.1 : size * 0.85,
          drag: 0.5,
          grav: g * 0.3,
          strobe: p.tip && !o.reduced ? 160 : undefined,
          strobeOff: (i * 0.37) % 1,
        });
      });
      const c = o.budget(6);
      for (let i = 0; i < c; i++) {
        const a = (i / c) * Math.PI * 2 + Math.PI / 6;
        add({ vx: Math.cos(a) * 5 * s, vy: Math.sin(a) * 5 * s, life: 1100 * life, color: FW_COLORS.cyan[i % 2], size: size * 0.9, drag: 1.2, grav: g * 0.2 });
      }
      break;
    }
    case "strobe": {
      // 별빛 점멸: 둥글게 흩어져 금방 멈추고, 저마다 다른 박자로 오래 깜빡인다
      const n = o.budget(56);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const d = R * Math.sqrt(rand(0.1, 1));
        const sp = burstSpeed(d, 3, 0.55);
        add({
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: (2000 + rnd() * 600) * life,
          color: i % 4 === 0 ? colors[2] : i % 4 === 1 ? FW_COLORS.violet[1] : 0xffffff,
          size: size * rand(0.8, 1.05),
          drag: 3,
          grav: g * 0.22,
          fadeFrom: 0.55,
          strobe: o.reduced ? undefined : rand(110, 180),
          strobeOff: rnd(),
        });
      }
      break;
    }
    case "chameleon": {
      // 색바꿈 국화: 짧은 꼬리를 끌며 퍼지다가 가는 길 중간에 빨강 → 초록, 안쪽은 보라 → 금빛으로 바뀐다
      const n = o.budget(54);
      const m = o.budget(24);
      const L = 1550 * life;
      for (let i = 0; i < n; i++) {
        // 공 모양: 3차원으로 고르게 퍼진 방향을 화면에 비춘다 (가장자리가 짙고 안쪽도 찬 국화)
        const a = (i / n) * Math.PI * 2 + rnd() * 0.08;
        const z = ((i * 0.618) % 1) * 2 - 1;
        const sp = burstSpeed(R * Math.sqrt(1 - z * z * 0.85) * rand(0.95, 1.04), 1.3, 1.2);
        add({
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: L + rnd() * 300,
          color: colors[i % 2],
          color2: FW_COLORS.green[i % 2],
          colorAt: 520 + rnd() * 90,
          size,
          drag: 1.3,
          grav: g * 0.8,
          trail: 60,
          trailLife: 300,
        });
      }
      const sp2 = burstSpeed(R * 0.48, 1.3, 1.1);
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2 + 0.13;
        add({
          vx: Math.cos(a) * sp2,
          vy: Math.sin(a) * sp2,
          life: L * 0.85,
          color: FW_COLORS.violet[i % 2],
          color2: FW_COLORS.gold[i % 2],
          colorAt: 760 + rnd() * 80,
          size: size * 0.9,
          drag: 1.3,
          grav: g * 0.7,
        });
      }
      break;
    }
    case "glitter": {
      // 금가루: 금빛으로 퍼진 불티가 지나가며 반짝이는 금가루를 흘리고, 금가루는 깜빡이며 천천히 떨어진다
      const n = o.budget(34);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.1;
        const sp = burstSpeed(R * rand(0.75, 1), 2, 0.9);
        add({
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: (1900 + rnd() * 300) * life,
          color: colors[i % colors.length],
          size,
          drag: 2,
          grav: g * 0.5,
          trail: 85,
          trailLife: 1450,
          trailColor: i % 2 ? 0xfff4d0 : 0xffd070,
          trailFall: 30,
          trailStrobe: 90,
        });
      }
      break;
    }
    case "palm": {
      // 야자수: 굵은 잎 일곱 장이 위·옆으로 뻗었다가 무겁게 휘어 내린다 (꼬리가 잎이 된다). 가운데 금빛 열매
      const fronds = 7;
      for (let f = 0; f < fronds; f++) {
        const a = -Math.PI / 2 + (f / (fronds - 1) - 0.5) * Math.PI * 1.45 + (rnd() - 0.5) * 0.08;
        const sp = burstSpeed(R * rand(0.92, 1.05), 1.2, 1);
        add({
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: (1500 + rnd() * 200) * life,
          color: colors[f % 2],
          size: size * 1.45,
          drag: 1.2,
          grav: g * 2,
          trail: 32,
          trailLife: 680,
          trailColor: colors[2],
        });
      }
      const c = o.budget(12);
      for (let i = 0; i < c; i++) {
        const a = (i / c) * Math.PI * 2;
        const sp = burstSpeed(R * 0.22, 1.6, 0.8);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 900 * life, color: FW_COLORS.gold[i % 3], size: size * 0.9, drag: 1.6, grav: g * 0.8 });
      }
      break;
    }
    case "ring": {
      const n = o.budget(56);
      const L = 1500 * life;
      const sp = burstSpeed(R, 1.1, (L * 0.8) / 1000);
      const tilt = rnd() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + tilt;
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: L + rnd() * 200, color: colors[i % 2], size, drag: 1.1, grav: g * 0.6 });
      }
      break;
    }
    case "willow": {
      // 금빛 버드나무: 빠르게 퍼졌다가 공기에 붙잡혀 멈추고, 천천히 떨어지며 지나간 자리에 꼬리를 남긴다.
      // 꼬리가 바깥으로 뻗었다 아래로 휘는 길을 그대로 그려서 축 늘어진 가지가 된다
      const n = o.budget(34);
      const L = 2700 * life;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.12;
        const sp = burstSpeed(R * rand(0.8, 1.02), 2.4, 0.9);
        add({
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: L + rnd() * 500,
          color: colors[i % colors.length],
          size: size * 0.85,
          drag: 2.4,
          grav: g * 1.25,
          trail: 60,
          trailLife: 950,
          trailColor: i % 3 === 0 ? 0xffd070 : 0xd8963c,
        });
      }
      break;
    }
    case "double": {
      const n = o.budget(48);
      const m = o.budget(30);
      const L = 1600 * life;
      const sp = burstSpeed(R, 1.2, (L * 0.8) / 1000);
      const inner = FINALE_COLORS[(FINALE_COLORS.indexOf(colors) + 3) % FINALE_COLORS.length] ?? FW_COLORS.silver;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: L + rnd() * 300, color: colors[i % colors.length], size, drag: 1.2, grav: g * 0.6 });
      }
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2 + 0.1;
        add({ vx: Math.cos(a) * sp * 0.5, vy: Math.sin(a) * sp * 0.5, life: L * 0.8, color: inner[i % inner.length], size: size * 0.85, drag: 1.2, grav: g * 0.5 });
      }
      break;
    }
    case "spiral": {
      // 나선: 팔 4개가 가운데에서 돌며 풀려 나온다 (바깥 불티일수록 늦게·빠르게)
      const arms = 4;
      const per = Math.max(4, Math.floor(o.budget(64) / arms));
      for (let a = 0; a < arms; a++) {
        const col = a % 2 ? colors : FW_COLORS.cyan;
        for (let j = 0; j < per; j++) {
          const f = (j + 1) / per;
          const ang = (a / arms) * Math.PI * 2 + f * 2.4;
          const sp = burstSpeed(R * (0.2 + 0.85 * f), 1.1, 1.2);
          add({
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            life: (1100 + 500 * f) * life,
            color: col[j % col.length],
            size: size * (0.8 + 0.3 * f),
            drag: 1.1,
            grav: g * 0.45,
            at: j * 22,
          });
        }
      }
      break;
    }
    case "crossette": {
      // 이중 폭발: 첫 불꽃이 짧게 날아가다가, 그 끝에서 저마다 다시 작은 십자로 터진다
      const n = Math.max(4, o.budget(12));
      const T = 0.62;
      const sp = burstSpeed(R * 0.6, 1.3, T);
      const sub = Math.max(2, Math.min(5, Math.floor(o.budget(n * 5) / n)));
      const sp2 = burstSpeed(R * 0.42, 1.4, 1);
      const second = colors === FW_COLORS.silver ? FW_COLORS.gold : FW_COLORS.silver;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
        const vx = Math.cos(a) * sp;
        const vy = Math.sin(a) * sp;
        add({ vx, vy, life: T * 1000 + 40, color: colors[i % colors.length], size: size * 1.1, drag: 1.3, grav: g * 0.5 });
        const p = sparkOffset(vx, vy, 1.3, g * 0.5, T);
        for (let q = 0; q < sub; q++) {
          const b = a + (q / sub) * Math.PI * 2 + Math.PI / 4;
          add({
            vx: Math.cos(b) * sp2,
            vy: Math.sin(b) * sp2,
            life: (1000 + rnd() * 300) * life,
            color: q % 2 ? second[0] : colors[(i + q) % colors.length],
            size: size * 0.85,
            drag: 1.4,
            grav: g * 0.7,
            at: T * 1000,
            ox: p.x,
            oy: p.y,
            pop: i === 0 && q === 0,
          });
        }
      }
      break;
    }
    case "fountain": {
      // 분수: 땅에서 위로 FOUNTAIN_MS 동안 뿜어 올린다 (터지는 자리 = 발밑)
      const n = o.budget(120);
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI / 2 + (rnd() - 0.5) * 0.55;
        const sp = 135 * s * rand(0.78, 1.05);
        add({
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: rand(850, 1250) * life,
          color: i % 4 === 0 ? 0xffffff : colors[i % colors.length],
          size: size * rand(0.7, 1),
          drag: 0.7,
          grav: 150 * s,
          at: (i / n) * FOUNTAIN_MS,
          ox: (rnd() - 0.5) * 2,
        });
      }
      break;
    }
    case "waterfall": {
      // 폭포: 먼저 가로로 불꽃 줄이 펼쳐지고, 그 줄에서 불티가 커튼처럼 흘러내린다
      const half = R * 1.15;
      const lineN = o.budget(16);
      for (let i = 0; i < lineN; i++) {
        const x = ((i + 0.5) / lineN - 0.5) * 2 * half;
        // 0.5초 만에 그 자리까지 가서 거의 멈춘다
        const k = 6 / (1 - Math.exp(-6 * 0.5));
        add({ vx: x * k, vy: 0, life: 900 * life, color: 0xffffff, size: size * 1.1, drag: 6, grav: 0 });
      }
      const cols = 14;
      const rows = Math.max(2, Math.floor(o.budget(cols * 9) / cols));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          add({
            vx: (rnd() - 0.5) * 4,
            vy: rand(2, 8),
            life: rand(1500, 2100) * life,
            color: (r + c) % 3 === 0 ? 0xffffff : colors[(r + c) % colors.length],
            size: size * 0.85,
            drag: 0.9,
            grav: g * 0.9,
            at: 380 + r * 110 + rnd() * 60,
            ox: ((c + 0.5) / cols - 0.5) * 2 * half + (rnd() - 0.5) * 3,
            oy: rand(-1, 1),
          });
        }
      }
      break;
    }
    case "brocade": {
      // 대형: 금·흰 바깥 불꽃(길게 늘어지는 잔상) + 안쪽 청록 고리 + 뒤늦게 터지는 반짝이
      const n = o.budget(130);
      const m = o.budget(40);
      const L = 1450 * life;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.06;
        const sp = burstSpeed(R * rand(0.86, 1.08), 1.2, 1.5);
        const c = i % 3 === 0 ? 0xffffff : colors[i % colors.length];
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: L + rnd() * 700, color: c, size: size * 1.25, drag: 1.2, grav: g * 0.55 });
      }
      const sp2 = burstSpeed(R * 0.45, 1.3, 1.1);
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2;
        add({ vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, life: 1500 * life * 0.6, color: FW_COLORS.cyan[i % 3], size, drag: 1.3, grav: g * 0.4 });
      }
      // 잔상 속 반짝이: 1초 뒤 바깥 둘레 여기저기서 작게 톡톡
      const pops = o.reduced ? 4 : 10;
      for (let j = 0; j < pops; j++) {
        const a = rnd() * Math.PI * 2;
        const d = R * rand(0.55, 0.95);
        const k = o.budget(6);
        for (let q = 0; q < k; q++) {
          const b = (q / k) * Math.PI * 2;
          add({
            vx: Math.cos(b) * 14,
            vy: Math.sin(b) * 14,
            life: 520,
            color: q % 2 ? 0xffffff : 0xfff0b0,
            size: size * 0.7,
            drag: 2.2,
            grav: 6,
            at: 950,
            ox: Math.cos(a) * d,
            oy: Math.sin(a) * d + R * 0.15,
            pop: j === 0 && q === 0,
          });
        }
      }
      break;
    }
    case "kiku": {
      // 국화 겹꽃: 꼬리 끄는 큰 국화(공 모양으로 고르게) + 안쪽에 다른 색 꽃술, 가운데 흰 심
      const n = o.budget(84);
      const m = o.budget(34);
      const L = 1700 * life;
      const pistil = FINALE_COLORS[(Math.max(0, FINALE_COLORS.indexOf(colors)) + 1) % FINALE_COLORS.length];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.05;
        const z = ((i * 0.618) % 1) * 2 - 1;
        const sp = burstSpeed(R * Math.sqrt(1 - z * z * 0.8) * rand(0.96, 1.04), 1.4, 1.2);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: L + rnd() * 250, color: colors[i % 2], size, drag: 1.4, grav: g * 0.7, trail: 40, trailLife: 340, trailColor: i % 3 ? colors[2] : undefined });
      }
      const sp2 = burstSpeed(R * 0.42, 1.5, 1);
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2 + 0.11;
        add({ vx: Math.cos(a) * sp2 * rand(0.9, 1.05), vy: Math.sin(a) * sp2 * rand(0.9, 1.05), life: L * 0.75, color: pistil[i % 2], size: size * 1.1, drag: 1.5, grav: g * 0.5 });
      }
      const c = o.budget(8);
      for (let i = 0; i < c; i++) {
        const a = (i / c) * Math.PI * 2;
        add({ vx: Math.cos(a) * 5 * s, vy: Math.sin(a) * 5 * s, life: 900 * life, color: 0xffffff, size: size * 0.9, drag: 1.6, grav: g * 0.3 });
      }
      break;
    }
    case "niagara": {
      // 나이아가라: 왼쪽부터 불꽃 줄이 차례로 붙고, 붙은 자리마다 금빛 불티가 폭포처럼 쏟아진다
      const half = R * 1.5;
      const cols = Math.max(8, o.budget(30));
      const ignite = 520;
      const rows = Math.max(3, Math.floor(o.budget(cols * 9) / cols));
      for (let c = 0; c < cols; c++) {
        const x = ((c + 0.5) / cols - 0.5) * 2 * half;
        const at = (c / cols) * ignite;
        add({ vx: 0, vy: 0, life: 2600 * life, color: c % 3 ? 0xfff4d0 : 0xffffff, size: size * 1.15, drag: 3, grav: 1.5, at, ox: x, oy: rand(-1, 1), fadeFrom: 0.4 });
        for (let r = 0; r < rows; r++) {
          add({
            vx: (rnd() - 0.5) * 4,
            vy: rand(10, 22) * Math.min(2, Math.sqrt(s)),
            life: rand(1500, 2100) * life,
            color: (r + c) % 4 === 0 ? 0xffffff : colors[(r + c) % colors.length],
            size: size * rand(0.8, 1),
            drag: 1,
            grav: g * 0.75,
            at: at + 120 + r * 190 + rnd() * 90,
            ox: x + (rnd() - 0.5) * 4,
            oy: rand(-1, 1),
            trail: (r + c) % 2 === 0 ? 45 : undefined,
            trailLife: 320,
            trailColor: (r + c) % 3 ? 0xd8963c : 0xffd070,
          });
        }
      }
      break;
    }
    case "kamuro": {
      // 왕관 버드나무: 굵은 금빛 가지가 위·옆으로 퍼져 왕관 모양이 되고, 반짝이는 금가루 꼬리를 늘어뜨리며 아주 천천히 내려앉는다
      const n = o.budget(64);
      const L = 3400 * life;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.06;
        const down = Math.sin(a) > 0.3;
        const sp = burstSpeed(R * rand(0.86, 1) * (down ? 0.72 : 1), 2, 1);
        add({
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: L + rnd() * 500,
          color: i % 4 === 0 ? 0xfff4d0 : colors[i % 2],
          size: size * 1.1,
          drag: 2,
          grav: g * 0.95,
          trail: 52,
          trailLife: 1350,
          trailColor: i % 2 ? 0xffc860 : 0xe0a040,
          trailFall: 9,
          trailStrobe: o.reduced ? undefined : 150,
        });
      }
      break;
    }
    case "rainbow": {
      // 무지개 아치: 일곱 색 띠가 모양을 지키며 커진다 (안쪽 보라 → 바깥 빨강), 양 끝에 흰 구름 반짝이
      const per = Math.max(5, Math.round(o.budget(18 * 7) / 7));
      const sp = 52 * (R / (FW_BASE_RADIUS * 1.15));
      for (let k = 0; k < 7; k++) {
        const r = 0.6 + k * 0.068;
        for (let i = 0; i < per; i++) {
          const a = Math.PI + (i / (per - 1)) * Math.PI;
          add({ vx: Math.cos(a) * r * sp, vy: Math.sin(a) * r * sp * 0.92, life: (2000 + rnd() * 250) * life, color: FW_RAINBOW[k], size: size * 1.05, drag: 0.5, grav: g * 0.22, fadeFrom: 0.25 });
        }
      }
      const cl = o.budget(10);
      for (const side of [-1, 1]) {
        for (let i = 0; i < cl; i++) {
          const a = rnd() * Math.PI * 2;
          add({ vx: side * 0.82 * sp + Math.cos(a) * 6 * s, vy: Math.sin(a) * 4 * s, life: 1700 * life, color: 0xffffff, size: size * 0.9, drag: 0.55, grav: g * 0.2, strobe: o.reduced ? undefined : 130, strobeOff: rnd() });
        }
      }
      break;
    }
    case "crackle": {
      // 반짝 팝콘: 금빛 불티가 퍼지다가 저마다 다른 때에 톡톡 작게 다시 터진다 (몇 개는 타닥 소리)
      const n = o.budget(44);
      const sub = o.reduced ? 3 : 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
        const sp = burstSpeed(R * rand(0.6, 0.9), 1.5, 0.8);
        const vx = Math.cos(a) * sp;
        const vy = Math.sin(a) * sp;
        const T = rand(0.45, 0.95);
        add({ vx, vy, life: T * 1000, color: colors[i % colors.length], size: size * 0.95, drag: 1.5, grav: g * 0.6, trail: 45, trailLife: 220 });
        const p = sparkOffset(vx, vy, 1.5, g * 0.6, T);
        const k = Math.min(sub, o.budget(sub));
        for (let q = 0; q < k; q++) {
          const b = rnd() * Math.PI * 2;
          const v = rand(26, 60) * Math.min(1.6, Math.sqrt(s));
          add({ vx: Math.cos(b) * v, vy: Math.sin(b) * v, life: rand(320, 520), color: q % 3 === 2 ? colors[0] : q % 2 ? 0xffffff : 0xfff0b0, size: size * 0.95, drag: 4, grav: 8, strobe: o.reduced ? undefined : 60, strobeOff: rnd(), at: T * 1000 + q * 15, ox: p.x, oy: p.y, pop: q === 0 && i % 4 === 0 });
        }
      }
      break;
    }
    case "whistle": {
      // 휘슬 로켓: 하얗게 번쩍하는 티타늄 섬광 (빠르고 짧은 흰 불티) + 오래 남아 반짝이는 은가루
      const n = o.budget(96);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.1;
        const sp = burstSpeed(R * rand(0.6, 1.15), 2.6, 0.5);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(650, 1000) * life, color: i % 3 ? 0xffffff : 0xe2ecff, size: size * 1.05, drag: 2.6, grav: g * 0.5 });
      }
      const m = o.budget(34);
      for (let i = 0; i < m; i++) {
        const a = rnd() * Math.PI * 2;
        const sp = burstSpeed(R * rand(0.2, 0.8), 2.5, 0.6);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(1500, 2100) * life, color: colors[i % colors.length], size: size * 0.8, drag: 2.5, grav: g * 0.3, strobe: o.reduced ? undefined : rand(90, 140), strobeOff: rnd() });
      }
      break;
    }
    case "fish": {
      // 물고기 떼: 터진 불티가 저마다 꼬리를 흔들며 헤엄치듯 꿈틀꿈틀 흩어진다
      const n = o.budget(54);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
        const sp = burstSpeed(R * rand(0.55, 1), 1.2, 1.7);
        add({
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rand(2000, 2600) * life,
          color: i % 3 === 0 ? 0xffffff : colors[i % colors.length],
          size: size * 0.95,
          drag: 1.2,
          grav: g * 0.22,
          wig: (o.reduced ? 14 : 30) * Math.min(1.8, Math.sqrt(s)),
          wigHz: rand(2.4, 3.6),
          wigOff: rnd(),
          trail: 30,
          trailLife: 380,
        });
      }
      break;
    }
    case "parachute": {
      // 낙하산 별: 작게 터진 뒤 밝은 별 몇 개가 둥실 떠서 좌우로 흔들리며 아주 천천히 내려온다
      const n = o.budget(20);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const sp = burstSpeed(R * 0.55, 1.6, 0.8);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 800 * life, color: 0xe2ecff, size: size * 0.8, drag: 1.6, grav: g * 0.4 });
      }
      const m = Math.max(3, o.budget(14));
      const warm = [0xfff4d0, 0xffd0e0, 0xffe08a, 0xd8f0ff];
      for (let i = 0; i < m; i++) {
        const a = -Math.PI / 2 + ((i / Math.max(1, m - 1)) - 0.5) * 2.6;
        const sp = burstSpeed(R * rand(0.45, 0.8), 2.6, 0.7);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(4600, 5600) * life, color: warm[i % warm.length], size: size * 2.3, drag: 2.6, grav: 4.5, wig: 9, wigHz: rand(0.45, 0.7), wigOff: rnd(), fadeFrom: 0.5, trail: 90, trailLife: 600, trailColor: 0xfff0c0, trailStrobe: o.reduced ? undefined : 120 });
      }
      break;
    }
    case "cascade": {
      // 연쇄 국화: 큰 금빛 국화 + 밝은 씨앗 네 개가 날아가 그 자리에서 작은 국화가 저마다 다른 색으로 다시 핀다
      const n = o.budget(40);
      const L = 1350 * life;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.08;
        const sp = burstSpeed(R * rand(0.85, 1.02), 1.3, 1.1);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: L + rnd() * 200, color: colors[i % colors.length], size, drag: 1.3, grav: g * 0.7 });
      }
      const seeds = 4;
      const T = 0.72;
      const pal = [FW_COLORS.pink, FW_COLORS.cyan, FW_COLORS.violet, FW_COLORS.green];
      const per = Math.max(6, Math.floor(o.budget(seeds * 30) / seeds));
      for (let j = 0; j < seeds; j++) {
        const a = -Math.PI / 2 + (j - 1.5) * 0.95 + (rnd() - 0.5) * 0.15;
        const sp = burstSpeed(R * 0.62, 1.3, T);
        const vx = Math.cos(a) * sp;
        const vy = Math.sin(a) * sp;
        add({ vx, vy, life: T * 1000, color: 0xffffff, size: size * 1.3, drag: 1.3, grav: g * 0.5 });
        const p = sparkOffset(vx, vy, 1.3, g * 0.5, T);
        for (let q = 0; q < per; q++) {
          const b = (q / per) * Math.PI * 2 + rnd() * 0.1;
          const sp2 = burstSpeed(R * 0.6 * rand(0.55, 1.05), 1.4, 0.9);
          add({ vx: Math.cos(b) * sp2, vy: Math.sin(b) * sp2, life: (1100 + rnd() * 250) * life, color: pal[j][q % 2], size: size * 0.95, drag: 1.4, grav: g * 0.6, at: T * 1000 + j * 70, ox: p.x, oy: p.y, pop: q === 0 });
        }
      }
      break;
    }
    case "pinwheel": {
      // 회전 바람개비: 터진 자리 둘레를 빙글빙글 돌며 두 팔로 불티를 뿌리고, 끝에 고리로 펑
      const dur = 1700;
      const steps = Math.max(10, o.budget(130));
      const rr = R * 0.2;
      const sp = R * 2.1;
      for (let j = 0; j < steps; j++) {
        const t = (j / steps) * dur;
        const arm = j % 2;
        const ang = (t / 1000) * Math.PI * 2 * 1.5 + arm * Math.PI;
        const tx = -Math.sin(ang);
        const ty = Math.cos(ang);
        add({
          vx: tx * sp + Math.cos(ang) * sp * 0.25,
          vy: ty * sp + Math.sin(ang) * sp * 0.25,
          life: rand(750, 1050) * life,
          color: arm ? FW_COLORS.red[j % 3] : colors[j % colors.length],
          size: size * 0.95,
          drag: 2.2,
          grav: g * 0.6,
          at: t,
          ox: Math.cos(ang) * rr,
          oy: Math.sin(ang) * rr,
        });
      }
      const k = o.budget(28);
      const sp2 = burstSpeed(R * 0.8, 1.2, 1);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        add({ vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, life: 1200 * life, color: i % 2 ? 0xffffff : colors[0], size, drag: 1.2, grav: g * 0.5, at: dur, pop: i === 0 });
      }
      break;
    }
    case "emoji": {
      // 하늘 이모티콘: ^^ · 하트 · 별 중 하나가 픽셀 불꽃으로 서서 머물다 흘러내린다
      const glyph = FW_EMOJI[Math.floor(rnd() * FW_EMOJI.length) % FW_EMOJI.length];
      const mask = emojiMask(glyph.rows);
      const f = (R * 2.3) / Math.max(mask.w, mask.h);
      for (const sp of letterSparks(mask, f, size * 1.15, o.budget(mask.pts.length), rnd, glyph.pal)) add(sp);
      break;
    }
    default: {
      const n = o.budget(44);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.15;
        const sp = burstSpeed(R * rand(0.75, 1.25), 1.3, 1.23);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: (1200 + rnd() * 500) * life, color: colors[i % colors.length], size, drag: 1.3, grav: g });
      }
    }
  }
  return out;
}

// ── 아이템 → 발사 계획 ──

/** 로켓 한 발: 발밑 기준 가로 dx, 지연 delay(ms), 솟는 높이 h(월드 px), 반경 배율 scale (3단 불꽃탑) */
export type FwShot = { dx: number; delay: number; h: number; colors: readonly number[]; pattern: FwPattern; ground?: boolean; scale?: number };

/** 특별 연출 (로켓이 아닌 것) */
export type FwSpecial = "meteor" | "letter" | "finale" | "aurora" | "show";

export function fireworkSpecial(item: string, plan: FireworkPlan): FwSpecial | null {
  if (item === "fw_meteor") return "meteor";
  if (item === "fw_letter") return "letter";
  if (item === "fw_aurora") return "aurora";
  if (fireworkShowMs(item) > 0) return "show";
  return plan.sky ? "finale" : null;
}

/**
 * 로켓 폭죽(특별 연출이 아닌 것)의 발 목록. 모르는 아이템은 power로 고른다
 * (옛 클라이언트가 새 폭죽을 모르면 itemById가 없어 power 1 = 기본 금빛 폭죽이 된다).
 */
export function fireworkShots(item: string, plan: FireworkPlan, bigH = FW_BURST_H): FwShot[] {
  const H = FW_BURST_H;
  const one = (pattern: FwPattern, colors: readonly number[], h = H): FwShot[] => [{ dx: 0, delay: 0, h, colors, pattern }];
  switch (item) {
    case "fw_ring":
      return one("ring", FW_COLORS.cyan, H + 4);
    case "fw_fountain":
      return [{ dx: 0, delay: 0, h: 4, colors: FW_COLORS.gold, pattern: "fountain", ground: true }];
    case "fw_heart":
      return one("heart", FW_COLORS.pink, H + 6);
    case "fw_star":
      return one("star", FW_COLORS.yellow, H + 6);
    case "fw_spiral":
      return one("spiral", FW_COLORS.violet, H + 4);
    case "fw_willow":
      return one("willow", FW_COLORS.gold, H + 12);
    case "fw_crossette":
      return one("crossette", FW_COLORS.red, H + 6);
    case "fw_smile":
      return one("smile", FW_COLORS.yellow, H + 8);
    case "fw_waterfall":
      return one("waterfall", FW_COLORS.silver, H + 14);
    case "fw_big":
      return one("brocade", FW_COLORS.gold, bigH);
    case "fw_twinring":
      return one("twinring", FW_COLORS.pink, H + 6);
    case "fw_butterfly":
      return one("butterfly", FW_COLORS.violet, H + 6);
    case "fw_snow":
      return one("snow", FW_COLORS.silver, H + 8);
    case "fw_strobe":
      return one("strobe", FW_COLORS.silver, H + 6);
    case "fw_chameleon":
      return one("chameleon", FW_COLORS.red, H + 8);
    case "fw_glitter":
      return one("glitter", FW_COLORS.gold, H + 12);
    case "fw_palm":
      return one("palm", FW_COLORS.green, H + 8);
    case "fw_crackle":
      return [{ dx: 0, delay: 0, h: H + 8, colors: FW_COLORS.gold, pattern: "crackle", scale: 1.5 }];
    case "fw_emoji":
      return one("emoji", FW_COLORS.pink, H + 12);
    case "fw_parachute":
      return one("parachute", FW_COLORS.silver, H + 16);
    case "fw_whistle":
      return one("whistle", FW_COLORS.silver, H + 12);
    case "fw_fish":
      return one("fish", FW_COLORS.cyan, H + 6);
    case "fw_pinwheel":
      return one("pinwheel", FW_COLORS.gold, H + 6);
    case "fw_rainbow":
      return one("rainbow", FW_COLORS.red, H + 2);
    case "fw_kiku":
      return one("kiku", FW_COLORS.red, H + 10);
    case "fw_cascade":
      return [{ dx: 0, delay: 0, h: H + 14, colors: FW_COLORS.gold, pattern: "cascade", scale: 1.25 }];
    case "fw_kamuro":
      return one("kamuro", FW_COLORS.gold, bigH);
    case "fw_niagara":
      return one("niagara", FW_COLORS.gold, bigH);
    case "fw_fountainrow": {
      // 분수 다섯 줄: 발밑 왼쪽부터 차례로
      const cols = [FW_COLORS.gold, FW_COLORS.pink, FW_COLORS.silver, FW_COLORS.cyan, FW_COLORS.yellow];
      return cols.map((colors, i) => ({ dx: (i - 2) * 36, delay: i * 260, h: 4, colors, pattern: "fountain" as const, ground: true }));
    }
    case "fw_tower": {
      // 3단 불꽃탑: 한 자리에서 세 발이 점점 높이, 점점 크게
      const gap = plan.spanMs / 2;
      return [
        { dx: 0, delay: 0, h: H - 44, colors: FW_COLORS.red, pattern: "peony", scale: 0.45 },
        { dx: 0, delay: gap, h: H - 14, colors: FW_COLORS.gold, pattern: "ring", scale: 0.62 },
        { dx: 0, delay: gap * 2, h: H + 18, colors: FW_COLORS.silver, pattern: "double", scale: 0.85 },
      ];
    }
  }
  switch (plan.power) {
    case 2:
      return one("heart", FW_COLORS.pink, H + 6);
    case 3: {
      const gap = plan.spanMs / 2;
      return [
        { dx: -16, delay: 0, h: H - 10, colors: FW_COLORS.cyan, pattern: "peony" },
        { dx: 0, delay: gap, h: H + 8, colors: FW_COLORS.gold, pattern: "peony" },
        { dx: 16, delay: gap * 2, h: H, colors: FW_COLORS.violet, pattern: "peony" },
      ];
    }
    case 4:
      return one("brocade", FW_COLORS.gold, bigH);
    default:
      return one("peony", FW_COLORS.gold);
  }
}

/** 솟는 로켓이 한 번(35ms마다) 남기는 꼬리 불티 (로켓 머리 기준). 대형은 굵게 두 줄, 야자수는 오래 남는 금빛 줄기 */
export function rocketTrail(pattern: FwPattern, power: number, rnd: () => number = Math.random): SparkSpec[] {
  const out: SparkSpec[] = [{ vx: (rnd() - 0.5) * 6, vy: 8 + rnd() * 8, life: 380, color: 0xffe8b0, size: 1, drag: 1.3, grav: FW_GRAVITY }];
  if (power >= 4) out.push({ ox: (rnd() - 0.5) * 2, oy: 2, vx: (rnd() - 0.5) * 10, vy: 10 + rnd() * 10, life: 520, color: 0xffc070, size: 1.2, drag: 1.3, grav: FW_GRAVITY });
  if (pattern === "whistle") out.push({ ox: (rnd() - 0.5) * 1.5, oy: 1, vx: (rnd() - 0.5) * 3, vy: 3 + rnd() * 4, life: 520, color: 0xffffff, size: 1.15, drag: 2, grav: 8 });
  if (pattern === "palm") out.push({ ox: (rnd() - 0.5) * 1.5, oy: 1, vx: (rnd() - 0.5) * 2, vy: 2 + rnd() * 3, life: 950, color: 0xffb860, size: 1.3, drag: 2, grav: 6, bright: 0.85 });
  return out;
}

/** 피날레 한 발: 화면 비율 자리 (fx,fy), 반경 h(화면 짧은 변 비율) */
export type FinaleShot = { fx: number; fy: number; delay: number; h: number; colors: readonly number[]; pattern: FwPattern; big: boolean };

/** 피날레 발 목록 (lead: 첫 발 전 기다림 ms) */
export function finaleShots(plan: FireworkPlan, lead: number, rnd: () => number = Math.random): FinaleShot[] {
  const rand = (a: number, b: number) => a + rnd() * (b - a);
  const times = finaleTimes(plan.shots, plan.spanMs, rnd);
  const climaxAt = plan.spanMs * 0.85;
  const phase = rnd();
  let last = -1;
  const out: FinaleShot[] = [];
  for (let i = 0; i < times.length; i++) {
    const big = i === 0 || times[i] >= climaxAt;
    // 황금비로 가로 자리를 흩어 겹치지 않게, 몰아치기는 가운데 쪽에 크게
    const fx = big && i > 0 ? 0.25 + 0.5 * ((phase + i * 0.618) % 1) : 0.12 + 0.76 * ((phase + i * 0.618) % 1);
    const fy = big ? rand(0.2, 0.34) : rand(0.13, 0.42);
    let ci = Math.floor(rnd() * FINALE_COLORS.length);
    if (ci === last) ci = (ci + 1) % FINALE_COLORS.length;
    last = ci;
    const pattern: FwPattern = big ? (i === 0 ? "double" : i % 2 ? "peony" : "willow") : FINALE_PATTERNS[(i + Math.floor(phase * 8)) % FINALE_PATTERNS.length];
    out.push({
      fx,
      fy,
      delay: lead + times[i],
      h: big ? rand(0.3, 0.38) : rand(0.17, 0.27),
      colors: pattern === "willow" ? FW_COLORS.gold : pattern === "heart" ? FW_COLORS.pink : FINALE_COLORS[ci],
      pattern,
      big,
    });
  }
  return out;
}

// ── 글자 폭죽 ──

/** 글자를 그릴 글꼴 크기(px)와 불꽃 점 최대 수 */
export const LETTER_PX = 16;
export const LETTER_POINTS = 160;
export const LETTER_FALLBACK = "추모";
/** 글자 모양으로 날아가 서는 시간 / 머무는 시간 / 흘러내리며 사라지는 시간 (ms) */
export const LETTER_FLY = 650;
export const LETTER_HOLD = 1500;
export const LETTER_FALL = 950;

export type LetterMask = { pts: { x: number; y: number }[]; w: number; h: number };

/** 글자 → 불꽃이 설 점들 (브라우저 캔버스에 그려서 고른다. 서버·테스트에서는 빈 목록) */
export function letterMask(text: string): LetterMask {
  if (typeof document === "undefined") return { pts: [], w: 1, h: 1 };
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { pts: [], w: 1, h: 1 };
  const font = `bold ${LETTER_PX}px "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
  ctx.font = font;
  const w = Math.max(4, Math.ceil(ctx.measureText(text).width) + 2);
  const h = LETTER_PX + 4;
  c.width = w;
  c.height = h;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 1, h / 2 + 1);
  const data = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { pts: sampleTextMask(alpha, w, h, LETTER_POINTS), w, h };
}

/** 글자 폭죽 불티: 가운데에서 글자 점들로 날아가 서고, 머물다 흘러내린다. f = 글자 1px의 크기 */
export function letterSparks(
  mask: LetterMask,
  f: number,
  size: number,
  count: number,
  rnd: () => number = Math.random,
  pal: readonly (readonly number[])[] = [FW_COLORS.gold, FW_COLORS.pink, FW_COLORS.cyan, FW_COLORS.violet],
): SparkSpec[] {
  const { pts, w } = mask;
  const n = Math.min(pts.length, Math.max(0, Math.floor(count)));
  const stride = n > 0 ? pts.length / n : 1;
  const d = 6;
  const fly = LETTER_FLY / 1000;
  const life = LETTER_FLY + LETTER_HOLD + LETTER_FALL;
  // 공기 저항이 커서 목표 자리에 닿으면 거의 멈춘다
  const k = d / (1 - Math.exp(-d * fly));
  const out: SparkSpec[] = [];
  for (let i = 0; i < n; i++) {
    const pt = pts[Math.floor(i * stride)];
    const col = pal[Math.min(pal.length - 1, Math.floor(((pt.x / w + 0.5) * pal.length) % pal.length))];
    out.push({
      vx: pt.x * f * k,
      vy: pt.y * f * k,
      life: life + rnd() * 200,
      color: col[i % 2],
      size,
      drag: d,
      grav: 0,
      swapAt: LETTER_FLY + LETTER_HOLD + rnd() * 250,
      fadeFrom: (LETTER_FLY + LETTER_HOLD) / life,
    });
  }
  return out;
}

// ── 하늘 이모티콘 ──

/** 픽셀 기호 (#이 불꽃 자리) + 색 */
export const FW_EMOJI: readonly { rows: readonly string[]; pal: readonly (readonly number[])[] }[] = [
  { rows: [".#.......#.", "#.#.....#.#", "...........", "...#...#...", "....###...."], pal: [FW_COLORS.yellow, FW_COLORS.gold] },
  { rows: [".##...##.", "####.####", "#########", "#########", ".#######.", "..#####..", "...###...", "....#...."], pal: [FW_COLORS.pink, FW_COLORS.red] },
  { rows: ["....#....", "...###...", "#########", ".#######.", "..#####..", ".###.###.", "##.....##"], pal: [FW_COLORS.yellow, FW_COLORS.silver] },
];

/** 픽셀 기호 → 불꽃이 설 점들 (가운데 기준) */
export function emojiMask(rows: readonly string[]): LetterMask {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const pts: { x: number; y: number }[] = [];
  // 점이 적은 기호(^^)는 칸마다 네 점으로 촘촘하게
  const sub = rows.join("").split("#").length - 1 < 30 ? [-0.22, 0.22] : [0];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && sub.forEach((dx) => sub.forEach((dy) => pts.push({ x: x + 0.5 + dx - w / 2, y: y + 0.5 + dy - h / 2 })))));
  return { pts, w, h };
}

// ── 불티 움직임 (게임·미리보기 공통) ──

export type SparkState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  drag: number;
  grav: number;
  size: number;
  swapAt: number;
  fadeFrom: number;
  color?: number;
  color2?: number;
  colorAt?: number;
  /** 꼬리 간격(ms, 0이면 없음)·다음 꼬리를 남길 나이 */
  trailEvery?: number;
  trailNext?: number;
  trailLife?: number;
  trailColor?: number;
  trailFall?: number;
  trailStrobe?: number;
  bright?: number;
  strobe?: number;
  strobeOff?: number;
  wig?: number;
  wigHz?: number;
  wigOff?: number;
};

/** 불티 처음 상태: 터진 자리 (bx,by) + spec (게임·미리보기 공통) */
export function sparkState(bx: number, by: number, s: SparkSpec): SparkState {
  return {
    x: bx + (s.ox ?? 0),
    y: by + (s.oy ?? 0),
    vx: s.vx,
    vy: s.vy,
    age: 0,
    life: s.life,
    drag: s.drag,
    grav: s.grav,
    size: s.size,
    swapAt: s.swapAt ?? Infinity,
    fadeFrom: s.fadeFrom ?? 0,
    color: s.color,
    color2: s.color2,
    colorAt: s.color2 === undefined ? Infinity : (s.colorAt ?? Infinity),
    trailEvery: s.trail ?? 0,
    trailNext: s.trail ?? Infinity,
    trailLife: s.trailLife ?? 0,
    trailColor: s.trailColor,
    trailFall: s.trailFall ?? 0,
    trailStrobe: s.trailStrobe,
    bright: s.bright ?? 1,
    strobe: s.strobe ?? 0,
    strobeOff: s.strobeOff ?? 0,
    wig: s.wig ?? 0,
    wigHz: s.wigHz ?? 0,
    wigOff: s.wigOff ?? 0,
  };
}

/** dt(ms)만큼 움직인다. 색이 바뀐 순간이면 true (게임은 그때 물들이기를 바꾼다) */
export function stepSpark(p: SparkState, dt: number, rnd: () => number = Math.random): boolean {
  const s = dt / 1000;
  if (p.age >= p.swapAt) {
    // 글자 모양으로 머물던 불티가 이제 흘러내린다
    p.swapAt = Infinity;
    p.drag = 1.4;
    p.grav = 22;
    p.vy += 4 + rnd() * 6;
  }
  const drag = Math.exp(-s * p.drag);
  p.vx *= drag;
  p.vy = p.vy * drag + p.grav * s;
  p.x += p.vx * s;
  p.y += p.vy * s;
  if (p.wig) {
    // 가는 방향의 옆으로 흔들린다 (느리면 좌우로)
    const v = Math.hypot(p.vx, p.vy);
    const w = p.wig * Math.sin((p.age / 1000) * (p.wigHz ?? 1) * Math.PI * 2 + (p.wigOff ?? 0) * Math.PI * 2) * s;
    if (v > 4) {
      p.x += (-p.vy / v) * w;
      p.y += (p.vx / v) * w;
    } else p.x += w;
  }
  if (p.colorAt !== undefined && p.age >= p.colorAt && p.color2 !== undefined) {
    p.colorAt = Infinity;
    p.color = p.color2;
    return true;
  }
  return false;
}

/**
 * 꼬리를 남길 때가 됐으면 그 꼬리 불티 (불티 지금 자리 기준, 아니면 null). 게임·미리보기가 매 걸음 뒤에 부른다.
 * 꼬리는 거의 제자리에 남아 은은하게 사라진다 (금가루는 깜빡이며 떨어진다). reduced면 절반만
 */
export function sparkTrail(p: SparkState, reduced: boolean): SparkSpec | null {
  const every = p.trailEvery ?? 0;
  if (every <= 0 || p.age < (p.trailNext ?? Infinity)) return null;
  p.trailNext = p.age + every * (reduced ? 2 : 1);
  const u = Math.min(1, p.age / p.life);
  const fall = p.trailFall ?? 0;
  return {
    vx: p.vx * 0.05,
    vy: p.vy * 0.05 + (fall > 0 ? 4 : 1.5),
    life: Math.max(60, (p.trailLife ?? 300) * (1 - 0.45 * u)),
    color: p.trailColor ?? p.color ?? 0xffffff,
    size: p.size * 0.72,
    drag: fall > 0 ? 1.4 : 3,
    grav: fall > 0 ? fall : 5,
    bright: 0.78 * (1 - 0.4 * u),
    strobe: reduced ? undefined : p.trailStrobe,
    strobeOff: (p.age / 97) % 1,
  };
}

/** 지금 나이에서의 밝기·크기 (끝무렵엔 반짝이며 사라진다, 점멸 불티는 처음부터 깜빡인다) */
export function sparkLook(p: SparkState, reduced: boolean): { alpha: number; scale: number } {
  const u = p.age / p.life;
  const strobe = p.strobe ?? 0;
  const twinkle = strobe > 0 && !reduced ? (((p.age / strobe + (p.strobeOff ?? 0)) % 1) < 0.5 ? 1 : 0.12) : u > 0.6 && !reduced ? (Math.floor(p.age / 60 + p.size * 7) % 2 ? 0.5 : 1) : 1;
  const v = p.fadeFrom > 0 ? (u < p.fadeFrom ? 0 : (u - p.fadeFrom) / (1 - p.fadeFrom)) : u;
  return { alpha: (1 - v * v) * twinkle * (p.bright ?? 1), scale: p.size * (1 - 0.4 * u) };
}
