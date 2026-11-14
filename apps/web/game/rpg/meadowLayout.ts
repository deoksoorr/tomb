import type { TimePhase } from "@/lib/ambience";
import type { BugKind } from "@/lib/rpg/plan";
import type { MeadowTone } from "@/lib/rpg/types";
import { hash2 } from "../sprites/pixel";

// 32번 곤충 채집 들판의 순수 계산 (Phaser·캔버스 없이 — 테스트한다):
//  - 덤불 9곳 배치: 3줄, 줄마다 엇갈리고 크기·위치를 조금씩 흐트러뜨린다 (바둑판 느낌 없이). 가로 화면·세로 화면 두 벌
//  - 탭 판정: 가장 가까운 덤불, 둘레를 넉넉히 (손가락 크기)
//  - 들판 꾸미기(웅덩이·돌·꽃·풀) 자리: 덤불과 겹치지 않게
//  - 시간대(한국 시각) → 낮·노을·밤, 곤충 종류 → 그림, 콤보 단계·외침, 날아 들어오는 길
// 좌표는 월드 픽셀 (카메라 줌 전). 덤불 칸 번호는 키 배열(Q W E / A S D / Z X C)과 같은 순서다.

export type Bush = {
  slot: number;
  /** 덤불 가운데 (그림 아래쪽 그림자 위) */
  x: number;
  y: number;
  /** 반지름 (그림 크기) */
  r: number;
  /** 그림 변형 0..8 (덤불마다 다른 모양) */
  variant: number;
};

export type MeadowLayout = {
  portrait: boolean;
  /** 덤불 구역 크기 (카메라가 이만큼은 늘 보이게 맞춘다) */
  w: number;
  h: number;
  bushes: Bush[];
  /** 탭 판정 반지름 (덤불 가운데에서) */
  hit: number;
};

type Frame = { w: number; h: number; rows: readonly number[]; cols: readonly number[]; shift: readonly number[] };

// 가로 화면: 넓게
const LAND: Frame = { w: 300, h: 212, rows: [44, 108, 172], cols: [54, 150, 246], shift: [-12, 12, -4] };
// 세로 화면: 폭을 좁혀(휴대폰 폭에 맞춰 더 크게 보이게) 줄 사이를 벌려 위아래 공간을 쓴다
const PORT: Frame = { w: 244, h: 345, rows: [60, 175, 290], cols: [42, 122, 202], shift: [-8, 8, -2] };

/** 덤불마다 고정 흐트러짐 [dx, dy, 반지름] */
const JITTER: readonly (readonly [number, number, number])[] = [
  [-4, 3, 20],
  [6, -4, 23],
  [-2, 5, 18],
  [5, -2, 21],
  [-6, 4, 19],
  [3, -5, 22],
  [-3, -3, 23],
  [7, 4, 18],
  [-5, -1, 20],
];

/** 탭 판정 반지름 한계 (월드 픽셀) */
export const HIT_MIN = 34;
export const HIT_MAX = 52;

export function meadowLayout(portrait: boolean): MeadowLayout {
  const f = portrait ? PORT : LAND;
  const bushes: Bush[] = [];
  for (let slot = 0; slot < 9; slot++) {
    const row = Math.floor(slot / 3);
    const col = slot % 3;
    const [dx, dy, r] = JITTER[slot];
    bushes.push({ slot, x: f.cols[col] + f.shift[row] + dx, y: f.rows[row] + dy, r, variant: slot });
  }
  // 가장 가까운 두 덤불 거리의 0.8배까지 (덤불 사이 빈틈도 눌린다 — 겹치는 곳은 가까운 쪽이 이긴다), 상한은 빈 들판 탭이 헛치기가 되지 않게
  let near = Infinity;
  for (const a of bushes) for (const b of bushes) if (a !== b) near = Math.min(near, Math.hypot(a.x - b.x, a.y - b.y));
  const hit = Math.max(HIT_MIN, Math.min(HIT_MAX, Math.round(near * 0.8)));
  return { portrait, w: f.w, h: f.h, bushes, hit };
}

/** 곤충이 앉는 자리 (덤불 꼭대기 조금 아래) */
export function perchOf(b: Bush): { x: number; y: number } {
  return { x: b.x, y: b.y - Math.round(b.r * 0.35) };
}

/** 탭한 월드 좌표 → 덤불 칸 (판정 반지름 밖이면 -1). 덤불은 위쪽(곤충 자리)도 눌리게 가운데를 조금 올려 잰다 */
export function pickBush(l: MeadowLayout, x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (const b of l.bushes) {
    const d = Math.hypot(x - b.x, y - (b.y - b.r * 0.2));
    if (d < bestD) {
      bestD = d;
      best = b.slot;
    }
  }
  return bestD <= l.hit ? best : -1;
}

// ── 들판 꾸미기 ──

export type DecorKind = "pond" | "stone" | "flower" | "tuft" | "clover";
export type Decor = { kind: DecorKind; x: number; y: number; v: number };

/** 꾸미기 종류별 개수와 덤불에서 떨어질 거리 */
const DECOR: readonly { kind: DecorKind; n: number; gap: number }[] = [
  { kind: "pond", n: 1, gap: 34 },
  { kind: "stone", n: 6, gap: 12 },
  { kind: "clover", n: 6, gap: 10 },
  { kind: "flower", n: 14, gap: 8 },
  { kind: "tuft", n: 22, gap: 6 },
];
/** 덤불 구역 바깥으로 꾸미는 폭 (넓은 화면에서 보이는 가장자리까지) */
export const DECOR_PAD = { x: 150, y: 110 };

/**
 * 들판 꾸미기 자리 (늘 같은 자리 — seed로 가른다). 덤불·웅덩이와 겹치지 않고, 웅덩이는 덤불 구역 바깥 귀퉁이 근처에 하나.
 * y 순서로 정렬해 돌려준다 (그리는 순서)
 */
export function meadowDecor(l: MeadowLayout, seed = 7): Decor[] {
  const out: Decor[] = [];
  let k = 0;
  const rnd = () => hash2(k++, seed, 911);
  for (const d of DECOR) {
    let placed = 0;
    for (let tries = 0; placed < d.n && tries < d.n * 60; tries++) {
      let x: number;
      let y: number;
      if (d.kind === "pond") {
        // 덤불 구역 바깥 왼쪽 아래 / 오른쪽 위 귀퉁이 중 하나
        const left = rnd() < 0.5;
        x = left ? -40 - rnd() * 30 : l.w + 40 + rnd() * 30;
        y = left ? l.h - 20 + rnd() * 30 : 10 + rnd() * 30;
      } else {
        x = -DECOR_PAD.x + rnd() * (l.w + DECOR_PAD.x * 2);
        y = -DECOR_PAD.y + rnd() * (l.h + DECOR_PAD.y * 2);
      }
      if (l.bushes.some((b) => Math.hypot(x - b.x, y - b.y) < b.r + d.gap)) continue;
      if (out.some((o) => (o.kind === "pond" || o.kind === "stone") && Math.hypot(x - o.x, y - o.y) < (o.kind === "pond" ? 40 : 12))) continue;
      out.push({ kind: d.kind, x: Math.round(x), y: Math.round(y), v: Math.floor(rnd() * 4) });
      placed++;
    }
  }
  return out.sort((a, b) => a.y - b.y);
}

// ── 시간대·곤충 ──

/**
 * 한국 시각 시간대 → 들판 시간대. 새벽은 낮으로 친다.
 * 시간대를 모르는 옛 서버 응답이면 night(밤·해질녘)만으로 낮/밤을 고른다
 */
export function meadowTone(phase: TimePhase | undefined, night: boolean | undefined): MeadowTone {
  if (phase === "dusk") return "dusk";
  if (phase === "night") return "night";
  if (phase === "dawn" || phase === "day") return "day";
  return night ? "night" : "day";
}

export type InsectArt = "butterfly" | "dragonfly" | "firefly" | "golden" | "bee" | "leaf";

/** 출현 종류 + 시간대 → 그림 (보통 곤충만 시간대마다 다르다: 낮 나비 · 노을 잠자리 · 밤 반딧불이) */
export function insectArt(kind: BugKind, tone: MeadowTone): InsectArt {
  if (kind === "golden") return "golden";
  if (kind === "feature") return "bee";
  if (kind === "decoy") return "leaf";
  return tone === "night" ? "firefly" : tone === "dusk" ? "dragonfly" : "butterfly";
}

/** 콤보 단계 0..4 (점수 배수 comboMult가 오르는 5콤보마다 한 단계) — 꽃잎·빛 가루·가장자리 빛 세기 */
export function comboTier(combo: number): number {
  return Math.max(0, Math.min(4, Math.floor(combo / 5)));
}

const SHOUTS = ["좋아요!", "멋져요!", "굉장해요!", "채집 달인!"] as const;

/** 큰 콤보 외침 (5·10·15·20콤보, 그 뒤로는 10콤보마다). 아니면 null */
export function comboShout(combo: number): string | null {
  if (combo < 5 || combo % 5 !== 0) return null;
  if (combo <= 20) return SHOUTS[combo / 5 - 1];
  return combo % 10 === 0 ? `${combo}콤보!` : null;
}

/** 날아 들어오는 시간 (ms). 출현 시각부터 이미 잡을 수 있으므로 머무는 시간의 앞쪽 일부만 쓴다 */
export function flyInMs(lifeMs: number): number {
  return Math.max(120, Math.min(320, Math.round(lifeMs * 0.28)));
}

/**
 * 날아 들어오는 출발점 (앉을 자리 기준). 화면 위쪽 반원에서 들어온다 (낙엽은 바로 위에서 팔랑이며).
 * n: 이 덤불에 몇 번째로 오는지 (매번 다른 쪽에서)
 */
export function flyFrom(art: InsectArt, to: { x: number; y: number }, slot: number, n: number): { x: number; y: number } {
  if (art === "leaf") return { x: to.x + (hash2(slot, n, 5) - 0.5) * 24, y: to.y - 90 };
  const a = Math.PI * (1.1 + hash2(slot, n, 3) * 0.8);
  const dist = 120 + hash2(n, slot, 4) * 40;
  return { x: Math.round(to.x + Math.cos(a) * dist), y: Math.round(to.y + Math.sin(a) * dist) };
}

/** 날아오기 진행 0..1 → 0..1 (끝에 살짝 멈칫하며 내려앉는다) */
export function landEase(k: number): number {
  const t = Math.max(0, Math.min(1, k));
  return 1 - (1 - t) ** 3;
}
