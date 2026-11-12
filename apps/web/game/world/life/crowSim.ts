import { PONDS, hashUnit } from "@tomb/protocol";
import { allProps, type PropDef } from "../layout";

// 까마귀 연못의 까마귀 — 결정적 시뮬레이션 (순수, Phaser 없음 → life.test.ts). 고양이·유령(critterSim)과 같은 방식:
// 채널 번호 = 시드, 서버 시계(welcome.now로 맞춤) = 시각 → 모든 사람 화면에서 같은 자리, 네트워크·서버 비용 0.
//
// 한 마리의 하루 = 같은 길이의 구간(leg)이 이어진 것. 구간 k: 앉을 자리 P(k)에 앉아 쉬다가(고개 갸웃·가끔 "까악")
// 날아올라 연못 위를 원을 그리며 돌고 다음 자리 P(k+1)에 내려앉는다(구간 끝 = 도착). P(k)는 (시드, 까마귀, k) 해시.
// 사람이 뛰어오면 푸드덕 날아오르는 반응은 화면 연출(내 화면에서만 잠깐)이라 공유 자리는 그대로다.

export const CROW_COUNT = 3;
/** 까마귀 연못 (PONDS "pondNE") */
export const CROW_POND = PONDS.find((p) => p.id === "pondNE") ?? PONDS[0];

/** 앉는 자리: (x,y) = 그림의 받침(소품의 발 위치), lift = 받침에서 앉은 발까지 높이 */
export type CrowPerch = { x: number; y: number; lift: number; kind: "tree" | "grave" };

/** 마른 나무 가지 끝(변형별 [dx, lift])·오래된 비석 꼭대기 (sprites/props.deadTree · graveyardProps.oldGrave 그림 기준) */
const TREE_BRANCHES: Record<number, readonly (readonly [number, number])[]> = {
  0: [
    [6, 28],
    [-6, 25],
  ],
  1: [
    [6, 25],
    [-7, 23],
  ],
};
const GRAVE_TOP: Record<number, number> = { 0: 20, 1: 23 };
/** 연못에서 이 거리(타원을 넓혀 본다) 안의 나무·비석에 앉는다 */
const PERCH_REACH = 80;

/** 까마귀가 앉는 자리 목록 (결정적: 같은 맵이면 모든 클라이언트가 같은 목록) */
export function crowPerches(props: readonly PropDef[] = allProps()): CrowPerch[] {
  const pond = CROW_POND;
  const near = (x: number, y: number) => {
    const dx = (x - pond.x) / (pond.rx + PERCH_REACH);
    const dy = (y - pond.y) / (pond.ry + PERCH_REACH);
    return dx * dx + dy * dy <= 1;
  };
  const out: CrowPerch[] = [];
  for (const p of props) {
    if (!near(p.x, p.y)) continue;
    if (p.kind === "deadTree") for (const [dx, lift] of TREE_BRANCHES[p.variant % 2]) out.push({ x: p.x + dx, y: p.y, lift, kind: "tree" });
    else if (p.kind === "oldGrave" && p.variant % 5 in GRAVE_TOP) out.push({ x: p.x, y: p.y, lift: GRAVE_TOP[p.variant % 5], kind: "grave" });
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
}

export type CrowPose = {
  /** 땅 위 자리 (그림자) */
  x: number;
  y: number;
  /** 땅에서 떠 있는 높이 (그림은 y - lift) */
  lift: number;
  flying: boolean;
  /** 바라보는 쪽 (-1 왼쪽, 1 오른쪽) */
  face: -1 | 1;
  /** 앉아 있을 때 고개를 갸웃하는 중 */
  tilt: boolean;
  /** 날갯짓 단계 0..2 (날 때), 미끄러지듯 날 때는 1 고정 */
  wing: number;
  /** 앉은 자리 (날고 있으면 null) — 그림 깊이 */
  perch: CrowPerch | null;
  /** 구간 번호 */
  leg: number;
  /** 이번 구간에 "까악" 하는 시각 (서버 ms, 없으면 -1) */
  cawAt: number;
};

const ease = (u: number) => u * u * (3 - 2 * u);

/** 한 마리의 시뮬레이터. at(t)는 t의 구간만 계산한다 (과거를 다시 돌리지 않는다) */
export class CrowSim {
  readonly legMs: number;
  private readonly phase: number;

  constructor(
    readonly index: number,
    readonly seed: number,
    readonly perches: readonly CrowPerch[] = crowPerches(),
  ) {
    this.legMs = 17_000 + index * 2_300;
    this.phase = Math.floor(hashUnit(seed, index, 71) * this.legMs);
  }

  /** 구간 k에 앉아 있는 자리 (가까운 구간끼리 같은 자리가 이어지지 않게 한 칸 비킨다) */
  perchAt(k: number): CrowPerch {
    const n = this.perches.length;
    const a = Math.floor(hashUnit(this.seed, this.index, k, 3) * n) % n;
    const b = Math.floor(hashUnit(this.seed, this.index, k - 1, 3) * n) % n;
    return this.perches[a === b ? (a + 1) % n : a];
  }

  at(t: number, out: CrowPose = { x: 0, y: 0, lift: 0, flying: false, face: 1, tilt: false, wing: 0, perch: null, leg: 0, cawAt: -1 }): CrowPose {
    const L = this.legMs;
    const k = Math.floor((t + this.phase) / L);
    const start = k * L - this.phase;
    const u = t - start;
    const from = this.perchAt(k);
    const to = this.perchAt(k + 1);
    // 쉬는 시간 (구간의 45~65%) → 나머지는 비행
    const restMs = Math.round(L * (0.45 + hashUnit(this.seed, this.index, k, 5) * 0.2));
    const flyMs = L - restMs;
    const sx = this.index === 0 ? 0 : this.index === 1 ? 2 : -2; // 같은 자리에 둘이 앉아도 살짝 비켜 앉는다
    out.leg = k;
    out.cawAt = hashUnit(this.seed, this.index, k, 9) < 0.55 ? start + Math.round(restMs * (0.25 + hashUnit(this.seed, this.index, k, 10) * 0.5)) : -1;
    if (u < restMs) {
      out.x = from.x + sx;
      out.y = from.y;
      out.lift = from.lift;
      out.flying = false;
      out.perch = from;
      out.face = hashUnit(this.seed, this.index, k, 7) < 0.5 ? -1 : 1;
      // 고개 갸웃: 몇 초마다 잠깐
      const beat = Math.floor((t + this.index * 977) / 650);
      out.tilt = hashUnit(this.seed, this.index, beat, 13) < 0.28;
      out.wing = 0;
      return out;
    }
    // 비행: 연못 위 원 (중심·반지름·방향·바퀴 수는 구간 해시)
    const f = (u - restMs) / flyMs;
    const pond = CROW_POND;
    const cx = pond.x + (hashUnit(this.seed, this.index, k, 21) - 0.5) * 40;
    const cy = pond.y - 6;
    const rx = pond.rx * (0.55 + hashUnit(this.seed, this.index, k, 22) * 0.35);
    const ry = pond.ry * (0.7 + hashUnit(this.seed, this.index, k, 23) * 0.4);
    const dir = hashUnit(this.seed, this.index, k, 24) < 0.5 ? -1 : 1;
    const a0 = Math.atan2((from.y - cy) / ry, (from.x - cx) / rx);
    const a1raw = Math.atan2((to.y - cy) / ry, (to.x - cx) / rx);
    // 출발 각에서 dir 쪽으로 돌아 도착 각까지 + 한 바퀴 (짧은 비행이면 바퀴 없이)
    let sweep = dir * (a1raw - a0);
    while (sweep < 0) sweep += Math.PI * 2;
    // 여유가 있으면 한 바퀴 더 (원 위 속도가 너무 빨라지지 않을 때만, 초속 ~90px)
    const R = (rx + ry) / 2;
    const cruiseS = (flyMs / 1000) * 0.68;
    if (((sweep + Math.PI * 2) * R) / cruiseS < 90) sweep += Math.PI * 2;
    const ang = (v: number) => a0 + dir * sweep * v;
    const ring = (v: number) => ({ x: cx + Math.cos(ang(v)) * rx, y: cy + Math.sin(ang(v)) * ry });
    const T = 0.16;
    const H = 34 + hashUnit(this.seed, this.index, k, 25) * 14;
    /** 비행 진행도 v의 자리와 높이 (뜰 때는 앉은 자리에서 원으로, 내릴 때는 원에서 다음 자리로 부드럽게) */
    const pos = (v: number): { x: number; y: number; lift: number } => {
      const r = ring(v);
      if (v < T) {
        const e = ease(v / T);
        return { x: from.x + sx + (r.x - from.x - sx) * e, y: from.y + (r.y - from.y) * e, lift: from.lift + (H - from.lift) * e };
      }
      if (v > 1 - T) {
        const e = ease((v - (1 - T)) / T);
        return { x: r.x + (to.x + sx - r.x) * e, y: r.y + (to.y - r.y) * e, lift: H + (to.lift - H) * e };
      }
      return { x: r.x, y: r.y, lift: H + Math.sin(v * Math.PI * 6 + this.index) * 3 };
    };
    const p = pos(f);
    const q = pos(Math.min(1, f + 0.01));
    out.face = q.x > p.x + 0.01 ? 1 : q.x < p.x - 0.01 ? -1 : to.x >= from.x ? 1 : -1;
    out.x = p.x;
    out.y = p.y;
    out.lift = p.lift;
    out.flying = true;
    out.perch = null;
    out.tilt = false;
    // 날갯짓: 뜰 때·내릴 때는 빠르게, 원을 돌 때는 가끔 미끄러진다
    const glide = f > T && f < 1 - T && Math.sin(f * Math.PI * 4 + this.index) > 0.55;
    out.wing = glide ? 1 : Math.floor(t / 110) % 3;
    return out;
  }
}
