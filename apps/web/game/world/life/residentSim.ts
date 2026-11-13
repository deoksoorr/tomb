import { DIR, hashUnit, SEATS, type DirId, type Seat } from "@tomb/protocol";
import { faceToward } from "../../logic/movement";
import type { WalkGrid } from "../../logic/pathfind";
import type { EmoteIcon } from "../../sprites/emotes";
import { CritterSim, critterGrid, restSpots, seatFront, type CritterDef, type CritterPose, type RestSpot } from "./critterSim";
import type { ResidentDef } from "./residentData";

// 돌아다니는 마을 주민 — 결정적 시뮬레이션 (순수, Phaser 없음 → residents.test.ts).
// 고양이·유령(critterSim)과 똑같은 방식: 채널 번호 = 시드, 서버 시계 = 시각 → 같은 채널의 모두가 같은 자리에서 같은 주민을 본다.
// 서버는 아무것도 모른다 (접속자 수·채널 인원·순위·신고·주변 사람 목록에 들어가지 않는다).
// 걷는 길은 critterGrid(담·절벽·소품·가구·집·물을 피하는 격자)를 그대로 쓰고, 쉼 자리는 사는 동네의 벤치·그루터기 앞과 길가 빈 땅.
// 벤치·그루터기에는 "보기에만" 앉는다 (서버 좌석을 잡지 않는다) — 사람이 그 자리에 앉아 있으면 옆으로 비켜 선다.

/** 고양이 시뮬레이터 번호와 겹치지 않게 (시드 = 채널 + 주민 번호 + 시간) */
export const RESIDENT_INDEX_BASE = 100;
/** 좌석 앞에 도착해 자리로 옮겨 앉는 데 걸리는 시간 */
export const SIT_DELAY_MS = 500;
/** 사람이 앉은 자리 앞에서 비켜 서는 거리 */
const SIDESTEP = 13;

export type ResidentState = "idle" | "walk" | "sitChair" | "sitGround";

export type ResidentPose = {
  x: number;
  y: number;
  state: ResidentState;
  dir: DirId;
  /** 앉아 있는 좌석 (보기에만) */
  seat: Seat | null;
  /** 구간 번호 */
  leg: number;
  /** 쉬기 시작한 뒤 경과 ms (걷는 중이면 0) */
  restMs: number;
};

export function blankResidentPose(): ResidentPose {
  return {
    x: 0,
    y: 0,
    state: "idle",
    dir: DIR.down,
    seat: null,
    leg: 0,
    restMs: 0,
  };
}

/** 주민 정의 → 고양이 시뮬레이터가 쓰는 정의 (쉼 자리·구간·속도는 같은 규칙) */
export function residentCritterDef(r: ResidentDef): CritterDef {
  return {
    id: r.id,
    kind: "cat",
    name: r.name,
    variant: 0,
    home: r.home,
    perches: r.perches,
    grass: r.grass,
    legMs: r.legMs,
    speed: r.speed,
  };
}

/**
 * 주민의 쉼 자리: 앉는 좌석마다 "그 앞에 서는 자리"를 바라보는 쪽(없으면 아래쪽)으로 10~24px 안에서 찾고,
 * 길가·풀밭 자리는 고양이와 같은 규칙(restSpots). 결정적이라 모든 클라이언트가 같은 목록을 얻는다
 */
export function residentSpots(def: ResidentDef, g: WalkGrid = critterGrid()): RestSpot[] {
  const out: RestSpot[] = [];
  for (const fid of def.perches) {
    for (const s of SEATS) {
      if (s.furnitureId !== fid) continue;
      const hit = seatFront(g, s);
      if (hit) out.push({ x: hit.x, y: hit.y, perch: s });
    }
  }
  for (const sp of restSpots(residentCritterDef({ ...def, perches: [] }), g)) if (!out.some((o) => Math.hypot(o.x - sp.x, o.y - sp.y) < 20)) out.push(sp);
  return out;
}

export class ResidentSim {
  readonly crit: CritterSim;
  private readonly cur: CritterPose = {
    x: 0,
    y: 0,
    walking: false,
    face: 1,
    pose: "sit",
    perch: null,
    restMs: 0,
    leg: 0,
  };
  private readonly ahead: CritterPose = {
    x: 0,
    y: 0,
    walking: false,
    face: 1,
    pose: "sit",
    perch: null,
    restMs: 0,
    leg: 0,
  };

  constructor(
    readonly def: ResidentDef,
    readonly index: number,
    readonly seed: number,
    grid: WalkGrid = critterGrid(),
  ) {
    this.crit = new CritterSim(residentCritterDef(def), RESIDENT_INDEX_BASE + index, seed, grid, residentSpots(def, grid));
  }

  /**
   * 시각 t(서버 ms)의 모습. seatTaken(좌석 id) = 사람이 그 자리에 앉아 있는지 (앉아 있으면 주민은 옆에 비켜 선다).
   * 같은 seed·t·좌석 상황이면 어느 클라이언트든 같은 결과
   */
  at(t: number, seatTaken: (id: string) => boolean = () => false, out: ResidentPose = blankResidentPose()): ResidentPose {
    const p = this.crit.at(t, this.cur);
    out.leg = p.leg;
    out.seat = null;
    if (p.walking) {
      // 걷는 방향 (4방향): 조금 뒤 자리를 보고 정한다. 걷기는 구간의 60% 안에 끝나므로 같은 구간 안이다
      const q = this.crit.at(t + 250, this.ahead);
      out.x = p.x;
      out.y = p.y;
      out.state = "walk";
      out.dir = faceToward(p.x, p.y, q.x, q.y, p.face < 0 ? DIR.left : DIR.right);
      out.restMs = 0;
      return out;
    }
    out.restMs = p.restMs;
    out.x = p.x;
    out.y = p.y;
    if (p.perch) {
      const seat = p.perch;
      if (!seatTaken(seat.id)) {
        if (p.restMs >= SIT_DELAY_MS) {
          out.x = seat.x;
          out.y = seat.y;
          out.state = "sitChair";
          out.dir = seat.facing;
          out.seat = seat;
          return out;
        }
        // 좌석 앞에서 자리로 몇 걸음
        const f = p.restMs / SIT_DELAY_MS;
        out.x = p.x + (seat.x - p.x) * f;
        out.y = p.y + (seat.y - p.y) * f;
        out.state = "walk";
        out.dir = faceToward(p.x, p.y, seat.x, seat.y, DIR.up);
        return out;
      }
      // 사람이 앉아 있으면 그 앞을 가리지 않게 옆으로 비켜 선다 (어느 쪽인지는 구간 해시 → 모두 같은 쪽)
      out.x = p.x + (hashUnit(this.seed, this.index, p.leg, 31) < 0.5 ? -SIDESTEP : SIDESTEP);
      out.state = "idle";
      out.dir = out.x < seat.x ? DIR.right : DIR.left;
      return out;
    }
    // 길가·풀밭: 가끔 땅에 앉아 쉬고, 아니면 서서 두리번
    out.state = p.pose === "sit" ? "sitGround" : "idle";
    out.dir = p.pose === "groom" ? (p.face < 0 ? DIR.left : DIR.right) : DIR.down;
    return out;
  }
}

/** 쉬는 동안 한 번 하는 몸짓: 손 흔들기·이모티콘 (없으면 null) */
export type RestAct = { atMs: number; icon: EmoteIcon } | null;

const IDLE_ICONS: readonly EmoteIcon[] = ["tune", "idea", "sweat", "zzz", "laugh", "clap"];

/** 구간 leg의 쉼 동안 할 몸짓 (결정적: 같은 구간이면 모두 같은 몸짓·같은 때). 절반쯤은 아무것도 안 한다 */
export function restActOf(seed: number, index: number, leg: number): RestAct {
  const u = hashUnit(seed, RESIDENT_INDEX_BASE + index, leg, 77);
  if (u < 0.5) return null;
  const atMs = 1500 + Math.floor(hashUnit(seed, index, leg, 78) * 9000);
  if (u < 0.68) return { atMs, icon: "wave" };
  return {
    atMs,
    icon: IDLE_ICONS[Math.floor(hashUnit(seed, index, leg, 79) * IDLE_ICONS.length) % IDLE_ICONS.length],
  };
}

/** 벤치에 앉아 있는 동안 띄울 상태 (구간마다 주민의 moods 중 하나, 가끔 없음) */
export function seatMoodOf(def: ResidentDef, seed: number, index: number, leg: number): string | null {
  if (!def.moods.length) return null;
  const u = hashUnit(seed, RESIDENT_INDEX_BASE + index, leg, 55);
  if (u < 0.3) return null;
  return def.moods[Math.floor(u * 1000) % def.moods.length];
}
