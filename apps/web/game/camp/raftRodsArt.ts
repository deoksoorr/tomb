import { Grid, lighten, type Color } from "../sprites/pixel";
import { ICE, SNOW } from "../sprites/winterArt";

// 11/27 좌대 입장권 「낚싯대 4대」 그림 (시안 scratchpad jwadaemock/art/rods.ts · ~/Desktop/목요일작업/좌대시안 03·04번 그대로).
// 주인이 자기 좌대 의자에 앉아 있으면 마루 앞 끝 받침틀에 낚싯대 넷을 부채꼴로 펼치고, 끝마다 방울, 줄은 물속 찌로 (game/camp/CampRafts).
// 좌표 기준: 앉는 자리 x(SX = 좌대 x + campRaftSeatDx)와 받침틀 줄(front = 좌대 받침 y − 9 = 앉는 자리 + 3 — 마루 앞 끝 바로 안).
// 받침틀은 빈 채로 좌대 그림에도 있다 (valleyExtraArt raft4Art — 같은 drawRaftHolder).
// 4~6번(사다리가 앞 가운데 — 의자는 오른쪽 +11)은 받침틀을 사다리 양옆 둘로 나눠 낚싯대·줄이 사다리를 가로지르지 않게 (RAFT_LADDER_DX — 아래 시험이 지킨다).
// 11/27 운영자 「찌가 한쪽으로 쏠려 있다, 좌대 앞 물가를 넷이 다 채워야」: 찌 넷을 좌대 앞 물 전체 폭에 고르게 (좌대 가운데 기준 −30·−10·10·30 — RAFT_FLOAT_DX).
// 좌대 옆 물은 이웃 좌대·둑까지 5~12칸뿐이라 앞 물만 쓴다.

export type RaftRod = {
  /** 받침 x (SX 기준) */ bx: number;
  /** 끝 (SX·front 기준) */ tdx: number;
  tdy: number;
  /** 찌가 끝에서 기운 쪽 (없으면 tdx 부호 — 곧게 앞으로 뻗은 대만 정한다) */ d?: -1 | 1;
};
export type RaftRig = { /** 받침틀 가로대 (SX 기준, 양끝 포함) — 4~6번은 사다리 양옆 둘 */ holders: readonly (readonly [number, number])[]; rods: readonly RaftRod[] };

const rod = (bx: number, tdx: number, tdy: number, d?: -1 | 1): RaftRod => ({ bx, tdx, tdy, ...(d ? { d } : {}) });
/** 찌가 기운 쪽 */
export const rodDir = (r: RaftRod): -1 | 1 => r.d ?? (r.tdx < 0 ? -1 : 1);
/** 찌 넷 자리 (좌대 가운데 기준 x — 앞 물 폭 66에 고르게) */
export const RAFT_FLOAT_DX: readonly number[] = [-30, -10, 10, 30];
/** 잔교에 붙은 좌대 1~3: 의자 앞 받침틀 하나에서 부채꼴 (바깥 둘은 옆으로 길게, 안쪽 둘은 앞으로) */
export const RIG_WIDE: RaftRig = { holders: [[-10, 10]], rods: [rod(-7, -28, 13), rod(-2, -8, 18), rod(2, 8, 18), rod(7, 28, 13)] };
/** 물 건너 좌대 4~6 (SX = 좌대 가운데 + 11): 사다리(SX −16 ~ −6) 양옆 받침틀 둘에 둘씩 — 사다리 가운데(SX −11)를 두고 좌우 대칭 */
export const RIG_NARROW: RaftRig = {
  holders: [
    [-31, -19],
    [-3, 9],
  ],
  rods: [rod(-28, -39, 13), rod(-24, -23, 18, 1), rod(2, 1, 18, -1), rod(6, 17, 13)],
};
export const raftRig = (link: boolean): RaftRig => (link ? RIG_WIDE : RIG_NARROW);
/** 4~6번 앞 사다리 (그림 외곽선 포함 x 범위 — SX 기준, 받침 y −14 ~ 0) */
export const RAFT_LADDER_DX: readonly [number, number] = [-16, -6];
/** 받침틀 줄이 좌대 받침(r.y)보다 이만큼 위 */
export const RAFT_HOLDER_UP = 9;

const ROD = 0x6a4224;
const ROD_HI = 0xc89a5a;
const TIP = 0xf4ecdc;
const GRIP = 0x8a5a30;
const HOLDER = 0x3e5a3a;
const HOLDER_HI = 0x6a8a5a;
const BELL = 0xf6d24a;
const BELL_LO = 0xb88a1a;
const LINE = 0xe8eef2;

/** 직선 점들 (끝 포함) */
export function rodPoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) out.push([Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n)]);
  return out;
}

/** 빈 받침틀 (가로대 + 위 밝은 줄 + 양끝 다리 + 받침마다 Y 홈) — cx = SX, fy = front */
export function drawRaftHolder(g: Grid, cx: number, fy: number, rig: RaftRig): void {
  for (const [h0, h1] of rig.holders) {
    for (let x = cx + h0; x <= cx + h1; x++) g.set(x, fy, x === cx + h0 ? HOLDER_HI : HOLDER);
    g.hline(cx + h0 + 1, cx + h1 - 1, fy - 1, HOLDER_HI);
    g.set(cx + h0, fy + 1, HOLDER);
    g.set(cx + h1, fy + 1, HOLDER);
  }
  for (const r of rig.rods) {
    g.set(cx + r.bx - 1, fy - 1, HOLDER_HI);
    g.set(cx + r.bx + 1, fy - 1, HOLDER_HI);
  }
}

/** 받침 그림 원점: SX = 그림 x RIG_OX, front = 그림 y RIG_OY */
export const RIG_OX = 42;
export const RIG_OY = 2;
export const RIG_W = 72;
export const RIG_H = 24;

/** 받침틀 + 낚싯대 넷 (손잡이·대·초릿대 끝) — 방울·줄·찌는 raftRodTipArt */
export function raftRigBaseArt(rig: RaftRig): Grid {
  const g = new Grid(RIG_W, RIG_H);
  const cx = RIG_OX;
  const fy = RIG_OY;
  drawRaftHolder(g, cx, fy, rig);
  for (const r of rig.rods) {
    const bx = cx + r.bx;
    g.set(bx - rodDir(r), fy - 2, GRIP);
    g.set(bx, fy - 1, GRIP);
    const pts = rodPoints(bx, fy, cx + r.tdx, fy + r.tdy);
    pts.forEach(([x, y], k) => g.set(x, y, k > pts.length - 5 ? TIP : k % 4 === 1 ? ROD_HI : ROD));
  }
  return g;
}

/** 끝 그림 원점: 초릿대 끝 = 그림 (TIP_OX, TIP_OY) */
export const TIP_OX = 3;
export const TIP_OY = 2;
export const TIP_W = 8;
export const TIP_H = 11;

/**
 * 낚싯대 하나 끝: 방울 · 줄 · 물속 찌 (빨강·노랑 머리, 밤엔 전자찌 불빛) · 찌 둘레 물결.
 * dir = 끝이 기운 쪽(−1 왼쪽 · 1 오른쪽), odd = 찌 색 (짝수 빨강 · 홀수 노랑/초록), bob = 찌가 1칸 내려간 프레임, bite = 입질 (방울이 흔들리고 반짝, 찌가 1칸 잠긴다)
 */
export function raftRodTipArt(dir: number, odd: boolean, lit: boolean, bob: boolean, bite: boolean): Grid {
  const g = new Grid(TIP_W, TIP_H);
  const tx = TIP_OX;
  const ty = TIP_OY;
  const shake = bite ? 1 : 0;
  g.set(tx + shake, ty - 1, BELL);
  g.set(tx + shake, ty, BELL_LO);
  if (bite) g.set(tx + 2, ty - 2, 0xffffff);
  const fx = tx + Math.sign(dir || 1) * 2;
  const fy = ty + 6 + (bob || bite ? 1 : 0);
  for (const [x, y] of rodPoints(tx, ty + 1, fx, fy - 1)) g.set(x, y, LINE, 150);
  const top: Color = lit ? (odd ? 0x7affa0 : 0xff6a5a) : odd ? 0xf0c040 : 0xe84a3a;
  g.set(fx, fy - 2, top);
  g.set(fx, fy - 1, lit ? lighten(top, 0.5) : top);
  if (!bite) g.set(fx, fy, lit ? 0xffffff : 0xfaf2de);
  g.set(fx + 1, fy - 1, 0x1a1620, 90);
  g.set(fx - 1, fy + 1, 0xd8eef6, 140);
  g.set(fx + 1, fy + 1, 0xd8eef6, 140);
  return g;
}

/** 찌 머리 자리 (SX·front 기준) — 밤 전자찌 불빛 */
export function raftFloatAt(r: RaftRod): { x: number; y: number } {
  return { x: r.tdx + rodDir(r) * 2, y: r.tdy + 4 };
}

/** 11/27 겨울 판: 찌가 저수지 가장자리 얼음 위에 떨어지면 그 자리에 작은 얼음낚시 구멍 (캠핑장 얼음낚시 구멍 iceHoleArt와 같은 색 — 눈 테 + 짙은 물) */
export const HOLE_W = 9;
export const HOLE_H = 5;
/** 구멍 가운데 = 찌 머리 바로 아래 물 줄 (그림 원점 기준) */
export const HOLE_OX = 4;
export const HOLE_OY = 2;
export function raftIceHoleArt(): Grid {
  const g = new Grid(HOLE_W, HOLE_H);
  g.ellipse(HOLE_W / 2, HOLE_H / 2, HOLE_W / 2, HOLE_H / 2, SNOW.hi);
  g.ellipse(HOLE_W / 2, HOLE_H / 2, 3, 1.4, 0x1a3442);
  g.set(HOLE_OX - 2, HOLE_OY, 0x4a7a8e);
  for (let x = 2; x <= HOLE_W - 3; x++) g.set(x, HOLE_H - 1, ICE.lo);
  return g;
}
