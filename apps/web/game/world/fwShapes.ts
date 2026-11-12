// 폭죽 무늬의 순수 계산: 어떤 불티가 어느 방향·속도로 언제 나오는지 (Phaser 없이).
// 게임(Fireworks.ts)과 상점·폭죽 창의 미리보기(components/shop/FireworkPreview)가 같은 코드로 터뜨린다.

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
  | "smile";

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
      // 금빛 버드나무: 오래 남아 아래로 늘어진다
      const n = o.budget(60);
      const L = 2400 * life;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.1;
        const sp = burstSpeed(R * rand(0.8, 1.05), 1.6, 1.1);
        add({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: L + rnd() * 600, color: colors[i % colors.length], size: size * 0.9, drag: 1.6, grav: g * 1.6 });
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

/** 로켓 한 발: 발밑 기준 가로 dx, 지연 delay(ms), 솟는 높이 h(월드 px) */
export type FwShot = { dx: number; delay: number; h: number; colors: readonly number[]; pattern: FwPattern; ground?: boolean };

/** 특별 연출 (로켓이 아닌 것) */
export type FwSpecial = "meteor" | "letter" | "finale";

export function fireworkSpecial(item: string, plan: FireworkPlan): FwSpecial | null {
  if (item === "fw_meteor") return "meteor";
  if (item === "fw_letter") return "letter";
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
export function letterSparks(mask: LetterMask, f: number, size: number, count: number, rnd: () => number = Math.random): SparkSpec[] {
  const { pts, w } = mask;
  const pal = [FW_COLORS.gold, FW_COLORS.pink, FW_COLORS.cyan, FW_COLORS.violet];
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

// ── 불티 움직임 (게임·미리보기 공통) ──

export type SparkState = { x: number; y: number; vx: number; vy: number; age: number; life: number; drag: number; grav: number; size: number; swapAt: number; fadeFrom: number };

/** dt(ms)만큼 움직인다 */
export function stepSpark(p: SparkState, dt: number, rnd: () => number = Math.random): void {
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
}

/** 지금 나이에서의 밝기·크기 (끝무렵엔 반짝이며 사라진다) */
export function sparkLook(p: SparkState, reduced: boolean): { alpha: number; scale: number } {
  const u = p.age / p.life;
  const twinkle = u > 0.6 && !reduced ? (Math.floor(p.age / 60 + p.size * 7) % 2 ? 0.5 : 1) : 1;
  const v = p.fadeFrom > 0 ? (u < p.fadeFrom ? 0 : (u - p.fadeFrom) / (1 - p.fadeFrom)) : u;
  return { alpha: (1 - v * v) * twinkle, scale: p.size * (1 - 0.4 * u) };
}
