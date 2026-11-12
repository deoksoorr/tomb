import { hashUnit } from "@tomb/protocol";
import { penById, ZOO_POND, type PenId } from "./zooLayout";

// 동물원 동물 — 결정적 시뮬레이션 (순수, Phaser 없음 → zoo.test.ts).
// 고양이·유령(life/critterSim)과 같은 생각: 채널 번호 = 시드, 서버 시계 = 시각 → 같은 채널의 모두가 같은 자리에서 같은 동물을 본다
// (네트워크 0, 서버 비용 0). 한 마리의 시간은 같은 길이의 구간(leg)이 이어진 것: 구간 k가 시작하면 우리 안의 자리 P(k)에서
// P(k+1)로 걸어가고 도착하면 구간 끝까지 쉰다. P(k)는 (시드, 동물, k) 해시로 고른 우리 안 한 점이라 구간 하나만 계산하면 된다.
// 우리는 울타리로 막힌 빈 땅이라 길찾기 없이 곧게 걷는다 (우리 안 장식은 사람이 닿지 않아 충돌이 없다).

/** 그림 (cosmeticFx FX_ART의 펫 그림을 같이 쓴다 — 동물원에서 본 그 동물을 데려간다) */
export type ZooArt = "mountDeer" | "mountGoose" | "mountHound" | "petFox" | "petCat" | "petDuck" | "petSlime" | "petBird" | "petWisp" | "petDog";
export type ZooAnimal = {
  id: string;
  /** 이름표 (가까이 가면) */
  name: string;
  art: ZooArt;
  pen: PenId;
  /** 그림 폭·높이 (우리 안에 머무는 여유) */
  w: number;
  h: number;
  /** 걷는 속도 (px/s)와 구간 길이 (ms) */
  speed: number;
  legMs: number;
  /** 걸을 때 프레임 속도 */
  fps: number;
  /** 둥실 떠 있는 높이 (참새·도깨비불) */
  hover?: number;
};

const BIG = { w: 24, h: 22 };
const SMALL = { w: 12, h: 10 };
export const ZOO_ANIMALS: readonly ZooAnimal[] = [
  { id: "deer1", name: "달빛 사슴", art: "mountDeer", pen: "deer", ...BIG, speed: 16, legMs: 9_000, fps: 6 },
  { id: "deer2", name: "아기 사슴", art: "mountDeer", pen: "deer", ...BIG, speed: 14, legMs: 11_000, fps: 6 },
  { id: "fox1", name: "달빛 여우", art: "petFox", pen: "fox", ...SMALL, speed: 22, legMs: 6_000, fps: 8 },
  { id: "fox2", name: "꼬마 여우", art: "petFox", pen: "fox", ...SMALL, speed: 20, legMs: 7_500, fps: 8 },
  { id: "cat", name: "사무실 고양이", art: "petCat", pen: "friends", ...SMALL, speed: 16, legMs: 10_000, fps: 7 },
  { id: "duck", name: "고무 오리", art: "petDuck", pen: "friends", w: 10, h: 9, speed: 12, legMs: 8_000, fps: 5 },
  { id: "slime", name: "말랑 슬라임", art: "petSlime", pen: "friends", w: 11, h: 8, speed: 9, legMs: 9_000, fps: 5 },
  { id: "bird", name: "참새", art: "petBird", pen: "friends", w: 9, h: 8, speed: 26, legMs: 5_000, fps: 10, hover: 9 },
  { id: "wisp", name: "도깨비불 친구", art: "petWisp", pen: "friends", w: 8, h: 11, speed: 10, legMs: 7_000, fps: 6, hover: 7 },
  { id: "goose1", name: "왕거위", art: "mountGoose", pen: "geese", ...BIG, speed: 14, legMs: 8_000, fps: 6 },
  { id: "goose2", name: "왕거위", art: "mountGoose", pen: "geese", ...BIG, speed: 13, legMs: 9_500, fps: 6 },
  { id: "goose3", name: "꼬마 거위", art: "mountGoose", pen: "geese", ...BIG, speed: 15, legMs: 7_000, fps: 6 },
  { id: "hound1", name: "듬직한 큰 개", art: "mountHound", pen: "hounds", ...BIG, speed: 24, legMs: 6_500, fps: 7 },
  { id: "hound2", name: "듬직한 큰 개", art: "mountHound", pen: "hounds", ...BIG, speed: 22, legMs: 8_000, fps: 7 },
  { id: "pup", name: "퇴근 강아지", art: "petDog", pen: "hounds", ...SMALL, speed: 26, legMs: 5_000, fps: 8 },
];

export type ZooPose = {
  x: number;
  y: number;
  walking: boolean;
  /** 바라보는 쪽 (-1 왼쪽, 1 오른쪽) */
  face: -1 | 1;
  /** 걷기 프레임 (0·1) */
  frame: 0 | 1;
  /** 거위가 연못 물 위에 떠 있음 */
  swimming: boolean;
};

/** 동물이 설 수 있는 우리 안 사각형 (발 위치 기준 — 그림이 울타리를 넘지 않게) */
export function roamRect(a: ZooAnimal): { x0: number; x1: number; y0: number; y1: number } {
  const r = penById(a.pen).rect;
  const half = Math.ceil(a.w / 2) + 3;
  return { x0: r.x + half, x1: r.x + r.w - half, y0: r.y + 7, y1: r.y + r.h - 4 };
}

function spot(a: ZooAnimal, idx: number, seed: number, k: number): { x: number; y: number } {
  const r = roamRect(a);
  return { x: Math.round(r.x0 + hashUnit(seed, idx, k, 11) * (r.x1 - r.x0)), y: Math.round(r.y0 + hashUnit(seed, idx, k, 23) * (r.y1 - r.y0)) };
}

/** 이 동물의 시각 t(서버 ms) 자리. 같은 (시드, t)이면 모든 클라이언트가 같은 값 */
export function zooPose(a: ZooAnimal, idx: number, seed: number, t: number, out: ZooPose = { x: 0, y: 0, walking: false, face: 1, frame: 0, swimming: false }): ZooPose {
  // 동물마다 구간 시작을 엇갈리게 (모두 한꺼번에 걷기 시작하지 않게)
  const shifted = t + Math.floor(hashUnit(seed, idx, 7) * a.legMs);
  const k = Math.floor(shifted / a.legMs);
  const into = shifted - k * a.legMs;
  const p = spot(a, idx, seed, k);
  const q = spot(a, idx, seed, k + 1);
  const dist = Math.hypot(q.x - p.x, q.y - p.y);
  // 걷는 시간: 거리 / 속도, 구간의 70%를 넘지 않게 (멀면 조금 서두른다)
  const walkMs = Math.min(a.legMs * 0.7, (dist / a.speed) * 1000);
  const prevDx = p.x - spot(a, idx, seed, k - 1).x;
  if (into < walkMs && dist > 0.5) {
    const u = into / walkMs;
    const e = u * u * (3 - 2 * u);
    out.x = p.x + (q.x - p.x) * e;
    out.y = p.y + (q.y - p.y) * e;
    out.walking = true;
    out.face = q.x >= p.x ? 1 : -1;
    out.frame = (Math.floor((into / 1000) * a.fps) % 2) as 0 | 1;
  } else {
    out.x = q.x;
    out.y = q.y;
    out.walking = false;
    out.face = dist > 0.5 ? (q.x >= p.x ? 1 : -1) : prevDx >= 0 ? 1 : -1;
    // 쉬는 동안 가끔 꼬리·고개 (느리게)
    out.frame = (Math.floor(into / 1400) % 2) as 0 | 1;
  }
  const dx = (out.x - ZOO_POND.x) / ZOO_POND.rx;
  const dy = (out.y - ZOO_POND.y) / ZOO_POND.ry;
  out.swimming = a.pen === "geese" && dx * dx + dy * dy <= 1;
  return out;
}
