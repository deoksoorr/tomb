import { CAMPFIRES, hashUnit, SEATS } from "@tomb/protocol";
import type { WalkGrid } from "../../logic/pathfind";
import { CritterSim, critterGrid, restable, restSpots, type CritterDef, type CritterPose, type RestSpot } from "./critterSim";

// 마을 강아지 — 결정적 시뮬레이션 (순수, Phaser 없음 → dogs.test.ts).
// 고양이(critterSim)와 같은 방식: 채널 번호 = 시드, 서버 시계 = 시각 → 같은 채널의 모두가 같은 자리에서 같은 강아지를 본다.
// 서버는 아무것도 모른다. 관리자 마을 주민 설정과 별개로 늘 나와 있다 (끄려면 DOGS_ENABLED = false).
// 고양이보다 구간이 짧고 빨리 걷는다(산책). 걷다가 가끔 멈춰 냄새를 맡고(구간 해시로 정한 때·길이 → 모두 같다),
// 쉼 자리는 사는 동네의 풀밭·길가와 모닥불 앞(불을 보고 엎드려 쉰다).
// 사람 따라오기·"멍!"·꼬리 흔들기는 내 화면에서만 하는 연출이라 여기(공유 위치)에는 없다 (Dogs.ts).

/** 강아지를 끄려면 false (관리자 마을 주민 설정과 무관) */
export const DOGS_ENABLED = true;
/** 고양이(0~)·주민(100~) 시뮬레이터 번호와 겹치지 않게 */
export const DOG_INDEX_BASE = 200;
/** 걷다 멈춰 냄새 맡는 시간 */
export const SNIFF_MS = 1600;
/** 쉼 자리에 도착해 냄새 맡는 시간 (모닥불 앞은 바로 앉는다) */
const ARRIVE_SNIFF_MS = 1800;
/** 모닥불 앞 쉼 자리 판정 거리 */
const FIRE_NEAR = 64;

export type DogDef = {
  id: string;
  /** 이름표 (가까이 가면) */
  name: string;
  /** 털 색 (sprites DOG_COLORS) */
  variant: number;
  /** 사는 동네 (풀밭 쉼 자리는 이 원 안에서) */
  home: { x: number; y: number; r: number };
  /** 앞에 엎드려 쉬는 모닥불 (CAMPFIRES id) */
  fires: readonly string[];
  /** 풀밭 쉼 자리 수 */
  grass: number;
  /** 구간 길이(ms)와 걷는 속도(px/s) */
  legMs: number;
  speed: number;
  /** 우유(비숑) 전용: 통통 튀는 걸음·제자리 빙글·늘 보이는 이름표·전용 말풍선·높은 짖음 */
  special?: {
    /** 이름표 색 (늘 보인다) */
    labelTint: number;
    /** E로 쓰다듬으면 고르는 말풍선 */
    petLines: readonly string[];
  };
};

export const DOGS: readonly DogDef[] = [
  { id: "baekgu", name: "백구", variant: 0, home: { x: 720, y: 420, r: 170 }, fires: ["fireP"], grass: 6, legMs: 22_000, speed: 42 },
  { id: "nureong", name: "누렁이", variant: 1, home: { x: 900, y: 860, r: 150 }, fires: ["fireS"], grass: 6, legMs: 24_000, speed: 40 },
  { id: "jeombak", name: "점박이", variant: 2, home: { x: 250, y: 560, r: 160 }, fires: ["fireW"], grass: 6, legMs: 20_000, speed: 44 },
  // 우유: 사용자가 실제로 키우는 비숑. 광장 모닥불 둘레에 살고, 모닥불 앞에서 잘 잔다
  {
    id: "uyu",
    name: "우유",
    variant: 3,
    home: { x: 700, y: 520, r: 150 },
    fires: ["fireP"],
    grass: 6,
    legMs: 21_000,
    speed: 38,
    special: { labelTint: 0xffd6e0, petLines: ["왈!", "간식 주세요…", "산책 가요!", "♡"] },
  },
];

export type DogAct = "walk" | "sniff" | "sit" | "lie" | "sleep" | "spin";
/** 우유가 쉬다가 제자리에서 빙글 도는 때·길이 (구간 해시로 정한다 → 모두 같은 때) */
const SPIN_AT_MS = 2400;
const SPIN_MS = 1100;

export type DogPose = {
  x: number;
  y: number;
  /** 길 위를 걷는 중 (냄새 맡느라 멈췄으면 false) */
  walking: boolean;
  /** 바라보는 쪽 (-1 왼쪽, 1 오른쪽) */
  face: -1 | 1;
  act: DogAct;
  /** 모닥불 앞에서 쉬는 중 */
  fire: boolean;
  /** 쉬기 시작한 뒤 경과 ms (걷는 중이면 0) */
  restMs: number;
  /** 구간 번호 */
  leg: number;
};

export function blankDogPose(): DogPose {
  return { x: 0, y: 0, walking: false, face: 1, act: "sit", fire: false, restMs: 0, leg: 0 };
}

/** 강아지 정의 → 고양이 시뮬레이터가 쓰는 정의 (좌석에는 오르지 않는다) */
export function dogCritterDef(d: DogDef): CritterDef {
  return { id: d.id, kind: "cat", name: d.name, variant: d.variant, home: d.home, perches: [], grass: d.grass, legMs: d.legMs, speed: d.speed };
}

/**
 * 강아지 쉼 자리: 모닥불마다 불 둘레 34~50px의 걷기 가능한 점 두 곳(통나무·그루터기 앞 사람 자리는 피한다) + 풀밭·길가.
 * 결정적이라 모든 클라이언트가 같은 목록을 얻는다
 */
export function dogSpots(def: DogDef, g: WalkGrid = critterGrid()): RestSpot[] {
  const out: RestSpot[] = [];
  for (const fid of def.fires) {
    const f = CAMPFIRES.find((c) => c.id === fid);
    if (!f) continue;
    let n = 0;
    for (let a = 0; a < 16 && n < 2; a++) {
      const ang = ((a * 5) % 16) * (Math.PI / 8);
      for (let r = 34; r <= 50; r += 4) {
        const x = Math.round(f.x + Math.cos(ang) * r);
        const y = Math.round(f.y + Math.sin(ang) * r * 0.8);
        if (!restable(g, x, y)) continue;
        if (SEATS.some((s) => Math.hypot(s.x - x, s.y - y) < 16)) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 24)) continue;
        out.push({ x, y, perch: null });
        n++;
        break;
      }
    }
  }
  for (const sp of restSpots(dogCritterDef(def), g)) if (!out.some((o) => Math.hypot(o.x - sp.x, o.y - sp.y) < 20)) out.push(sp);
  return out;
}

/** 이 점에서 가장 가까운 모닥불 (FIRE_NEAR 안, 없으면 null) */
export function fireNear(x: number, y: number): { x: number; y: number } | null {
  for (const f of CAMPFIRES) if (Math.hypot(f.x - x, f.y - y) < FIRE_NEAR) return f;
  return null;
}

export class DogSim {
  readonly crit: CritterSim;
  private readonly cur: CritterPose = { x: 0, y: 0, walking: false, face: 1, pose: "sit", perch: null, restMs: 0, leg: 0 };

  constructor(
    readonly def: DogDef,
    readonly index: number,
    readonly seed: number,
    grid: WalkGrid = critterGrid(),
  ) {
    this.crit = new CritterSim(dogCritterDef(def), DOG_INDEX_BASE + index, seed, grid, dogSpots(def, grid));
  }

  get spots(): readonly RestSpot[] {
    return this.crit.spots;
  }

  /** 시각 t(서버 ms)의 모습. 같은 seed·t면 어느 클라이언트든 같은 결과 */
  at(t: number, out: DogPose = blankDogPose()): DogPose {
    const { k, start, walkMs } = this.crit.legTiming(t);
    const u = t - start;
    // 걷다 멈춰 냄새 맡기: 길이 충분하면 구간 해시로 정한 때에 SNIFF_MS 동안 멈춘다 (그만큼 쉬는 시간이 준다)
    let q = t;
    let sniffing = false;
    if (walkMs > 3000 && hashUnit(this.seed, DOG_INDEX_BASE + this.index, k, 41) < 0.7) {
      const a = walkMs * (0.3 + 0.35 * hashUnit(this.seed, DOG_INDEX_BASE + this.index, k, 42));
      if (u >= a && u < a + SNIFF_MS) {
        q = start + a;
        sniffing = true;
      } else if (u >= a + SNIFF_MS) q = t - SNIFF_MS;
    }
    const p = this.crit.at(q, this.cur);
    out.x = p.x;
    out.y = p.y;
    out.face = p.face;
    out.leg = p.leg;
    out.fire = false;
    if (sniffing || p.walking) {
      out.walking = !sniffing;
      out.act = sniffing ? "sniff" : "walk";
      out.restMs = 0;
      return out;
    }
    out.walking = false;
    out.restMs = p.restMs;
    const f = fireNear(p.x, p.y);
    if (f) {
      // 모닥불 앞: 불을 보고 잠깐 앉았다가 엎드린다 (낮잠 구간이면 잠든다)
      out.fire = true;
      out.face = f.x >= p.x ? 1 : -1;
      // 우유는 모닥불 앞에서 늘 잠든다
      out.act = p.restMs < 1200 ? "sit" : this.def.special || p.pose === "sleep" || p.pose === "loaf" ? "sleep" : "lie";
      return out;
    }
    if (this.def.special && p.restMs >= SPIN_AT_MS && p.restMs < SPIN_AT_MS + SPIN_MS && hashUnit(this.seed, DOG_INDEX_BASE + this.index, p.leg, 43) < 0.6) {
      out.act = "spin";
      return out;
    }
    if (p.restMs < ARRIVE_SNIFF_MS) {
      out.act = "sniff";
      return out;
    }
    out.act = p.pose === "sit" ? "sit" : p.pose === "loaf" ? "lie" : p.pose === "groom" ? "sniff" : "sleep";
    return out;
  }
}
