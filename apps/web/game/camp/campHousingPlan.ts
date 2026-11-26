import {
  CAMP_OFFICE,
  CAMP_OFFICE_H,
  CAMP_OFFICE_W,
  CAMP_FISHING_SPOTS,
  CARAVAN_GRADE_NAME,
  DIR,
  campLotByNo,
  campLotShort,
  CARAVAN_MODELS,
  caravanDesignKey,
  caravanDesignOf,
  caravanModelOfLot,
  type CampLot,
  type CampYard,
  type CaravanDesign,
  type CaravanModel,
  type DirId,
  campHammockById,
} from "@tomb/protocol";
import { CAMP_GATHER_NODES } from "@/lib/forage/catalog";
import { Grid } from "../sprites/pixel";
import { snowCap, snowRoof } from "../sprites/winterArt";
import * as Art from "./campArt";
import { LAMPS } from "./campLayout";
import * as A from "./campHomeArt";
import { doorMatArt } from "./campHomeArtMisc";
import { campHammockColliders, campHammockGrid } from "./campHammock";
import * as P4 from "./campHomeArtPension";
import * as R5 from "./campHomeArtRural";
import * as Y6 from "./campHomeArtYard";
import { stepStoneArt } from "./valleyExtraArt";

// 11/26 캠핑장 집 한 채를 어떻게 세우는지 (Phaser 없이 — 그리기는 campHousing.ts, 시트는 app/dev/camp-homes).
// 6차 시안 CampMockScene(addSite·drawPension·drawRural)의 배치를 그대로 옮겼다. 터 좌표는 protocol CAMP_LOTS.
//  - 카라반 12: 자리 위쪽 절반에 카라반(앞마당 1·2·3단계마다 몸통이 길어지고 확장 칸·차양·바퀴 2쌍·줄전구), 아래 절반이 앞마당
//    (접이식 탁자·캠핑 의자·화롯대·통나무 의자). 자리 등급마다 카라반 종류: 폭포 앞 = 에어스트림, 강가 = 티어드롭, 숲 쪽 = 버스 개조
//  - 펜션 13 솔바람채(스파·테라스형) · 14 달빛채(바비큐·화로·해먹형): 집채 + 높인 테라스 + 앞마당 단계 소품. 넓히면 지붕창 2층 방
//  - 촌캉스 15 싸리울집(싸리 울타리) · 16 감나무집(돌담·대문) — 11/26 자리 맞바꿈: 마당·집채·감나무·아궁이·평상 → 단계 소품. 넓히면 곁채(작은 방) 하나
// 앉을 자리는 단계와 상관없이 늘 같은 자리(id "qH{터}_{i}")에 두고 minYard~maxYard 단계에서만 연다 (protocol CAMP_HOME_SEATS와 같아야 한다 — 테스트가 본다)

export type HomeState = {
  /** 분양된 집 (창 불빛·연기·앞마당). 빈 펜션·촌캉스는 불 꺼진 집 + 1단계 마당, 빈 카라반 자리는 줄과 팻말만 */
  owned: boolean;
  yard: CampYard;
  /** 넓힌 집 (펜션·촌캉스) */
  wide: boolean;
  snowy: boolean;
  xmas: boolean;
  night: boolean;
  /** 11/26 카라반 디자인 (분양 때 고름 — 없으면 그 자리 기본 모습 defaultCaravanDesign) */
  design?: CaravanDesign;
  /** 11/26 촌캉스 아궁이 불 (E로 켜고 끈다 — 없으면 켜짐) */
  fire?: boolean;
};

/** 그림 하나: key가 없으면 make로 굽는다. camp = 캠핑장 맵 텍스처(Art.CAMP_TEX — 겨울판이면 campSkin). 원점 기본 (0.5, 1) */
export type PlanProp = {
  key: string;
  make?: () => HTMLCanvasElement;
  camp?: boolean;
  x: number;
  y: number;
  depth: number;
  ox?: number;
  oy?: number;
  flip?: boolean;
  frame?: number;
  /** 11/26 그림 일부만 (x, y, w, h — 그림 픽셀). 앉는 가구를 층으로 나눠 그릴 때 (뒤 의자는 앉은 사람 뒤, 탁자·앞 등받이는 앞) */
  crop?: readonly [number, number, number, number];
};
export type PlanFx =
  | {
      k: "smoke";
      x: number;
      y: number;
      depth: number;
      freq?: number;
      alpha?: number;
      scale?: number;
    }
  | {
      k: "flame";
      tex: "flames" | "brazier";
      x: number;
      y: number;
      depth: number;
      sx: number;
      sy: number;
      frame: number;
    }
  | { k: "steam"; x: number; y: number; depth: number; small?: boolean }
  | {
      k: "string";
      a: readonly [number, number, number];
      b: readonly [number, number, number];
      i: number;
    }
  | {
      k: "text";
      text: string;
      x: number;
      y: number;
      depth: number;
      tint: number;
      maxW: number;
      maxScale: number;
    };
/** 밤 빛 (ADD 빛 + 어둠 구멍). night = 밤에만 (창문), 아니면 불 켜진 소품(화롯대·등)이라 어두울수록 */
export type PlanLight = {
  x: number;
  y: number;
  scale: number;
  tint: number;
  base: number;
};
export type PlanRect = { x: number; y: number; w: number; h: number };
/** furnitureId = id (의자 하나가 가구 하나 — 좌석 체계 Seat와 같은 모양) */
export type HomeSeat = {
  id: string;
  furnitureId: string;
  lot: number;
  x: number;
  y: number;
  facing: DirId;
  minYard: CampYard;
  maxYard?: CampYard;
  /** 11/26 일어서는 자리 (좌석에서 — 없으면 아래로 9px). 평상·정자처럼 막는 상자 안에 앉는 자리는 상자 밖으로 */
  standDx?: number;
  standDy?: number;
  /** 11/26 카라반 앞마당 자리는 모델마다 (문 자리가 모델·단계마다 달라 문 앞 길을 비우려고 소품·자리를 모델마다 옮긴다) */
  model?: CaravanModel;
};

export type HomePlan = {
  props: PlanProp[];
  fx: PlanFx[];
  /** 창 불빛 (밤에만 — 분양된 집) */
  windows: PlanLight[];
  /** 불 켜진 소품 빛 (화롯대·아궁이·등 — 어두울수록) */
  lights: PlanLight[];
  /** 건물 몸통·담 (점프로도 못 넘는다) */
  solid: PlanRect[];
  /** 탁자·화롯대 (점프 중엔 넘는다) */
  furniture: PlanRect[];
  /** 들어가는 자리 (발 위치 — E) */
  door: { x: number; y: number };
  /**
   * 11/26 길에서 들어오는 자리 (대문·터 앞 끝). entry → door 곧은 길(폭 HOME_PATH_HALF × 2 = 28px, 두 사람)에는 소품·자리·불·막는 상자를 두지 않는다
   * (운영자 「입구를 모닥불로 가리는 게 맞냐」 — campHousing.test가 그림 칠한 칸까지 검사)
   */
  entry: { x: number; y: number };
  /** 11/26 촌캉스 아궁이 (분양된 집만 — E로 불 켜고 끄기, on = 지금 불) */
  fire?: { x: number; y: number; on: boolean };
  /** 11/26 누울 수 있는 마당 해먹 (달빛채 3단계 — protocol CAMP_HAMMOCKS) */
  hammock?: { id: string; x: number; y: number };
  /** 문패 세 줄 자리 (가운데·맨 아랫줄 바닥·폭) */
  plate: { cx: number; bottom: number; w: number };
};

export const FLAT_TAG = -100_000;
/** 11/26 펜션·촌캉스 집채가 커지는 때 (지붕창 2층 방·곁채): 앞마당 3단계 (방 14×10). 옛 넓힌 기록(wide)도 */
const homeGrown = (st: HomeState): boolean => st.owned && (st.yard >= 3 || st.wide);
/** 11/26 집 문 앞 곧은 길 반폭 (길 → 문 28px = 두 사람 — 소품·자리·막는 상자를 두지 않는다. HomePlan.entry) */
export const HOME_PATH_HALF = 14;
const TP = "chome-";

const SITE_W = 80;
const SITE_H = 76;
/** 자리 등급마다 처음 정해져 있던 카라반 종류 (폭포 앞 = 은색 에어스트림, 강가 = 색 티어드롭, 숲 쪽 = 버스 개조). 11/26부터는 사는 사람이 고른다 (HomeState.design) */
export function caravanTypeOf(l: CampLot): CaravanModel {
  return caravanModelOfLot(l.lot);
}
/** 왼쪽 둑(1~3·7~9)은 -1 (계곡이 오른쪽), 오른쪽 둑은 1 */
const sideOf = (l: CampLot): -1 | 1 => ([1, 2, 3, 7, 8, 9].includes(l.lot) ? -1 : 1);

/** 이 터 그림 묶음의 키 (같으면 다시 그리지 않는다) */
export function planKey(l: CampLot, st: HomeState): string {
  const d = l.kind === "caravan" ? caravanDesignKey(caravanDesignOf(l.lot, st.design)) : "";
  return `${l.lot}|${st.owned ? 1 : 0}|${st.yard}|${st.wide ? 1 : 0}|${st.snowy ? 1 : 0}|${st.xmas ? 1 : 0}|${st.night ? 1 : 0}|${d}|${l.kind === "rural" && st.fire === false ? 0 : 1}`;
}

const cap = (st: HomeState, c: HTMLCanvasElement, maxY: number) => (st.snowy ? snowCap(c, { depth: 1, maxY }) : c);
const sb = (st: HomeState) => `${st.snowy ? "s" : "n"}${st.xmas ? "x" : ""}`;

export function campHomePlan(l: CampLot, st: HomeState): HomePlan {
  if (l.kind === "caravan") return caravanPlan(l, st);
  if (l.kind === "pension") return pensionPlan(l, st);
  return ruralPlan(l, st);
}

/** 이 터의 앉을 자리 전부 (단계와 상관없이 같은 자리 — minYard·maxYard로 연다) */
export function campHomeSeatsOf(l: CampLot): HomeSeat[] {
  if (l.kind === "caravan") return caravanSeats(l);
  if (l.kind === "pension") return pensionSeats(l);
  return ruralSeats(l);
}

const seatMaker = (l: CampLot) => {
  let i = 0;
  return (x: number, y: number, facing: DirId, minYard: CampYard, maxYard?: CampYard, stand?: { dx?: number; dy?: number }, model?: CaravanModel): HomeSeat => {
    const id = `qH${l.lot}_${++i}`;
    return {
      id,
      furnitureId: id,
      lot: l.lot,
      x: Math.round(x),
      y: Math.round(y),
      facing,
      minYard,
      ...(maxYard ? { maxYard } : {}),
      ...(stand?.dx ? { standDx: stand.dx } : {}),
      ...(stand?.dy ? { standDy: stand.dy } : {}),
      ...(model ? { model } : {}),
    };
  };
};

// ════════════════════ 카라반 ════════════════════

/** 카라반 자리 기준 (자리 가운데 s, 계곡 쪽 toward, 카라반 바닥 cy) */
function siteGeo(l: CampLot) {
  const s = { x: l.x + SITE_W / 2, y: l.y + SITE_H / 2 };
  const side = sideOf(l);
  const toward = -side as -1 | 1;
  const cy = s.y - 4;
  /** 계곡 쪽 u · 아래 v (자리 가운데 기준) → 월드 */
  const at = (u: number, v: number) => ({ x: s.x + toward * u, y: s.y + v });
  /** +u를 보는 방향 */
  const faceU = (sign: 1 | -1): DirId => (toward * sign > 0 ? DIR.right : DIR.left);
  return { s, side, toward, cy, at, faceU };
}

/**
 * 11/26 카라반 앞마당 (운영자 「입구를 모닥불로 가리는 게 맞냐」 — 모든 집은 길 → 문 곧은 길 28px를 비운다).
 * 문 자리가 모델·단계마다 다르다 (u −14..54) → 앞마당 소품·자리를 모델·단계마다 문 앞 길 양옆 빈 칸에 놓는다 (cvYard).
 * 11/26 운영자 「업그레이드할수록 배치를 틀어 줘야지, 의자만 추가야?」 — 단계마다 무리 모양·자리가 바뀐다:
 *  - 1단계: 화롯대 무리 F (화롯대 + 그 앞 통나무 둘 — 불을 보고 위로 앉는다)
 *  - 2단계: F + 길 건너 접이식 탁자 무리 T2 (탁자 뒤 캠핑 의자 둘 — 앞을 보고 앉는다)
 *  - 3단계: 탁자가 길 반대쪽(2단계와 다른 쪽 — 차양·러그 쪽)으로 옮겨 4인 탁자 T3 (뒤 캠핑 의자 둘 + 앞 통나무 둘), 화롯대는 또 그 반대쪽
 *  - 무리 사이·무리와 길은 6px 넘게 띄우고, 한쪽에 둘 다 들어가지 않으면 카라반을 가장 적게 옆으로 민다 (관리소 비키기는 그다음)
 * 앉을 자리는 모델·단계마다 따로 (protocol CAMP_HOME_SEATS의 model · minYard~maxYard — 그 집이 고른 모델 자리만 연다)
 */
/**
 * 화롯대 받침 v (3단계에 탁자와 한쪽에 나란히 놓이면 3 위로 — 탁자 앞 통나무와 한 줄로 늘어서 보이지 않게.
 * 길 건너 따로 놓이면 그대로 — 위로 올리면 차양 아래 러그에 닿는다) · 통나무 줄 (불 앞) · 통나무 양옆
 */
const CV_FIRE_V = 17;
const CV_FIRE_V_BESIDE_TABLE = 13;
const cvFireV = (y: CvYard, stage: CampYard): number =>
  stage === 3 && y.table !== null && Math.sign(y.table - y.du) === Math.sign(y.fire - y.du) && !(y.rug && y.fire + 9 > y.rug[0] && y.fire - 9 < y.rug[1]) ? CV_FIRE_V_BESIDE_TABLE : CV_FIRE_V;
const CV_LOG_DV = 15;
const CV_LOG_DU = 8;
/**
 * 11/26 운영자 「의자가 탁자에 붙어 한 덩어리로 보인다 · 3단계는 같은 덩어리를 러그로 옮겼을 뿐」:
 *  - 2단계 접이식 탁자: 받침 v 34 · 뒤 캠핑 의자 둘(아래를 봄)은 탁자 윗면과 3px 넘게 띄운다 (의자 줄 = 받침 − 18)
 *  - 3단계 세로 피크닉 탁자(긴 쪽이 위아래 — 차양 아래 네모 러그 위): 받침 v 34 · 양옆 긴 의자에 둘씩 탁자를 보고 앉는다 (의자와 탁자 사이 3px)
 */
const CV_TABLE_V = { 2: 34, 3: 34 } as const;
const CV_CHAIR_DV = 18;
const CV_CHAIR_DU = 8;
/** 탁자 뒤 의자에서 일어서는 자리 (의자 뒤 — 카라반 바닥 막는 상자 아래) */
const CV_CHAIR_STAND_DV = -9;
/** 세로 피크닉 탁자: 긴 의자 가운데 (탁자 가운데에서 옆으로) · 앉는 줄 둘 (받침에서 위로) · 일어서면 탁자 아래 끝 바로 앞 (받침 + 4, 안쪽 5 — 옆은 관리소 담·옆 자리 틈) */
const CV_BENCH_DU = 11;
const CV_BENCH_ROWS = [22, 10] as const;
const CV_BENCH_STAND = 4;
/** 무리 반폭 (화롯대 무리 = 통나무 바깥 · 탁자 무리 = 탁자 그림 28 · 뒤 의자) · 무리 사이 (6 — 4면 화롯대 통나무와 탁자 의자가 한 줄로 붙어 보였다) · 길과 · 자리 밖으로 나가도 되는 폭 */
const CV_HALF = 14;
const CV_GAP = 6;
const CV_PATH_GAP = 2;
const CV_SITE = 44;
const CV_MAX_SHIFT = 40;
/** 앞마당 배치를 위해 카라반을 미는 건 12px까지 (더 밀면 옆 자리 사이 틈으로 넘어간다) */
const CV_PREFER_SHIFT = 12;
/** rug = 3단계 차양 아래 러그 u 범위 (화롯대가 그 아래면 위로 올리지 않는다 — 불이 러그에 닿는다) */
type CvYard = { cx: number; du: number; fire: number; table: number | null; rug?: readonly [number, number] };
/** 앞마당 자리가 비켜야 할 곳 (채집 지점 · 낚시 자리) */
const KEEP_AWAY: readonly { x: number; y: number }[] = [...CAMP_GATHER_NODES, ...CAMP_FISHING_SPOTS];
const cvCache = new Map<string, CvYard>();
/** 배치 모양 (탁자가 길 어느 쪽 · 화롯대 어느 쪽) — 3단계는 2단계와 다른 모양으로 */
const cvPattern = (y: CvYard): string => (y.table === null ? "" : `${Math.sign(y.table - y.du)}|${Math.sign(y.table - y.fire)}`);

/** 그 터·모델·단계 카라반 자리 + 앞마당 배치 (그림 색·차양과 상관없다 — 문·몸통 칸은 모델·단계로만 정해진다) */
function cvYard(l: CampLot, model: CaravanModel, stage: CampYard): CvYard {
  const key = `${l.lot}|${model}|${stage}`;
  const hit = cvCache.get(key);
  if (hit) return hit;
  const g = siteGeo(l);
  const art = A.caravanDesignArt({ model, color: 0, awning: 0 }, stage);
  const grid = art.grid;
  const W = grid.w;
  const flip = g.side === 1;
  // 2단계 배치 모양 (3단계는 탁자를 다른 쪽·다른 순서로 옮긴다)
  const prev = stage === 3 ? cvPattern(cvYard(l, model, 2)) : "";
  type Opt = { fire: number; table: number | null; pen: number };
  const place = (shift: number): (CvYard & { cost: number }) | null => {
    const base = g.s.x - g.toward * 4 + g.toward * shift;
    const cx = base + officeNudge(base, g.cy, grid, flip);
    const sx = (x: number) => cx + (flip ? -1 : 1) * (x - W / 2);
    const u = (x: number) => (x - g.s.x) * g.toward;
    const du = u(Math.round(sx(art.door.x)));
    // 러그 (caravanPlan과 같은 폭 — 차양 양끝 2px 안 · 자리 ±38)
    const rug: readonly [number, number] | undefined =
      stage >= 3 && art.awning ? [Math.max(Math.min(u(sx(art.awning.x0)), u(sx(art.awning.x1))) + 2, -38), Math.min(Math.max(u(sx(art.awning.x0)), u(sx(art.awning.x1))) - 2, 38)] : undefined;
    // 11/26 앞마당 소품은 자리(±44 — 옆 자리 사이 틈 4px까지) 안에만 (몸통이 자리 밖으로 나와도 그 앞은 쓰지 않는다)
    const lo = -CV_SITE;
    const hi = CV_SITE;
    // 길 양옆 칸에서 무리 가운데가 갈 수 있는 범위 (길 쪽 끝 near · 바깥 끝 far)
    const L = { near: du - HOME_PATH_HALF - CV_PATH_GAP - CV_HALF, far: lo + CV_HALF };
    const R = { near: du + HOME_PATH_HALF + CV_PATH_GAP + CV_HALF, far: hi - CV_HALF };
    const okL = L.far <= L.near;
    const okR = R.near <= R.far;
    const step = 2 * CV_HALF + CV_GAP;
    const opts: Opt[] = [];
    if (stage === 1) {
      if (okL) opts.push({ fire: L.near, table: null, pen: 0 });
      if (okR) opts.push({ fire: R.near, table: null, pen: 0 });
    } else {
      // 길 건너 양쪽 (가장 좋다)
      if (okL && okR) opts.push({ fire: L.near, table: R.near, pen: 0 }, { fire: R.near, table: L.near, pen: 0 });
      // 한쪽에 둘: 화롯대가 길 쪽 · 탁자가 바깥 (2단계) / 탁자가 길 쪽(차양·러그 아래) · 화롯대가 바깥 (3단계)
      if (L.near - step >= L.far) opts.push({ fire: L.near, table: L.near - step, pen: stage === 2 ? 4 : 8 }, { table: L.near, fire: L.near - step, pen: stage === 2 ? 8 : 4 });
      if (R.near + step <= R.far) opts.push({ fire: R.near, table: R.near + step, pen: stage === 2 ? 4 : 8 }, { table: R.near, fire: R.near + step, pen: stage === 2 ? 8 : 4 });
    }
    if (!opts.length) return null;
    const cost = (o: Opt) => {
      const y = { cx, du, rug, ...o };
      // 채집 지점·낚시 자리와 22px 안이면 피한다 (E가 엉뚱한 것을 집지 않게 — campForage.test는 20px)
      const near = cvSeats(y, stage).some((q) => {
        const p = g.at(q.u, q.v);
        return KEEP_AWAY.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < 22);
      });
      // 맵 길가 등 기둥(그림 8×22)과 무리 그림이 3px 안이면 피한다
      const boxes = cvBoxes(y, stage).map((b) => {
        const a = g.at(b.u0, b.v0);
        const c = g.at(b.u1, b.v1);
        return { x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), y0: b.v0 + g.s.y, y1: b.v1 + g.s.y };
      });
      const lamp = LAMPS.some((p) => boxes.some((b) => p.x + 4 + 3 > b.x0 && p.x - 4 - 3 < b.x1 && p.y + 3 > b.y0 && p.y - 22 - 3 < b.y1));
      return o.pen + (prev && cvPattern(y) === prev ? 20 : 0) + (near ? 50 : 0) + (lamp ? 50 : 0);
    };
    const best = opts.reduce((p, o) => (cost(o) < cost(p) ? o : p));
    return { cx, du, rug, fire: best.fire, table: best.table, cost: cost(best) + Math.abs(shift) };
  };
  let out: (CvYard & { cost: number }) | null = null;
  // 12px까지 밀어 보며 가장 좋은 배치 (덜 미는 것 · 숲 쪽(−u)으로 미는 것을 먼저 — 계곡 쪽 물가 길·채집 자리를 비운다)
  for (let k = 0; k <= CV_PREFER_SHIFT; k++)
    for (const c of [place(-k), k ? place(k) : null]) if (c && (!out || c.cost < out.cost)) out = c;
  // 그래도 없으면 더 민다 (그림이 크게 바뀐 경우)
  for (let k = CV_PREFER_SHIFT + 1; k <= CV_MAX_SHIFT && !out; k++) out = place(-k) ?? place(k);
  // 못 찾으면 옛 자리 — 테스트가 길 막힘으로 알려 준다
  const res: CvYard = out ? { cx: out.cx, du: out.du, fire: out.fire, table: out.table, ...(out.rug ? { rug: out.rug } : {}) } : { cx: g.s.x - g.toward * 4, du: 0, fire: -25, table: stage >= 2 ? 25 : null };
  cvCache.set(key, res);
  return res;
}

/** 무리 그림이 차지하는 칸 (u·v — 화롯대 무리 · 탁자 무리) */
function cvBoxes(yd: CvYard, stage: CampYard): { u0: number; u1: number; v0: number; v1: number }[] {
  const fv = cvFireV(yd, stage);
  const out = [{ u0: yd.fire - CV_HALF, u1: yd.fire + CV_HALF, v0: fv - 14, v1: fv + CV_LOG_DV + 2 }];
  if (yd.table !== null) {
    const tv = CV_TABLE_V[stage === 3 ? 3 : 2];
    out.push({ u0: yd.table - CV_HALF, u1: yd.table + CV_HALF, v0: stage >= 3 ? tv - 31 : tv - CV_CHAIR_DV - 16, v1: tv + 1 });
  }
  return out;
}

/**
 * 카라반 앞마당 자리 (무리별): 화롯대 통나무 둘 (위를 봄) · 2단계 탁자 뒤 캠핑 의자 둘 (아래를 봄) · 3단계 피크닉 탁자 양옆 긴 의자 넷 (탁자를 봄 — u+ / u−).
 * stand = 일어서는 자리 (u·v 만큼)
 */
type CvSeat = { u: number; v: number; facing: "up" | "down" | "u+" | "u-"; kind: "log" | "chair" | "bench"; stand?: { du?: number; dv?: number } };
function cvSeats(yd: CvYard, stage: CampYard): CvSeat[] {
  const out: CvSeat[] = [-1, 1].map((s) => ({ u: yd.fire + s * CV_LOG_DU, v: cvFireV(yd, stage) + CV_LOG_DV, facing: "up", kind: "log" }));
  if (yd.table === null) return out;
  const tv = CV_TABLE_V[stage === 3 ? 3 : 2];
  if (stage < 3) {
    // 뒤 의자에서 일어서면 의자 바로 뒤 (카라반 쪽 — 옆으로 서면 옆 자리 틈·관리소 담에 걸렸다)
    for (const s of [-1, 1]) out.push({ u: yd.table + s * CV_CHAIR_DU, v: tv - CV_CHAIR_DV, facing: "down", kind: "chair", stand: { dv: CV_CHAIR_STAND_DV } });
    return out;
  }
  for (const s of [-1, 1] as const)
    for (const r of CV_BENCH_ROWS) out.push({ u: yd.table + s * CV_BENCH_DU, v: tv - r, facing: s < 0 ? "u+" : "u-", kind: "bench", stand: { du: -s * 6, dv: r + CV_BENCH_STAND } });
  return out;
}

function caravanSeats(l: CampLot): HomeSeat[] {
  const g = siteGeo(l);
  const seat = seatMaker(l);
  const out: HomeSeat[] = [];
  for (const model of CARAVAN_MODELS) {
    // 단계마다 자리 → 같은 자리(위치·방향·일어서는 쪽)가 이어지는 단계는 한 자리로 (minYard~maxYard)
    const at = new Map<string, { q: CvSeat; st: CampYard[] }>();
    for (const stage of [1, 2, 3] as CampYard[])
      for (const q of cvSeats(cvYard(l, model, stage), stage)) {
        const k = `${q.u}|${q.v}|${q.facing}|${q.stand?.du ?? 0}|${q.stand?.dv ?? 0}`;
        const e = at.get(k) ?? { q, st: [] };
        e.st.push(stage);
        at.set(k, e);
      }
    const runs: { q: CvSeat; a: CampYard; b: CampYard }[] = [];
    for (const { q, st } of at.values())
      for (const s of st) {
        const last = runs.find((r) => r.q === q && r.b === s - 1);
        if (last) last.b = s;
        else runs.push({ q, a: s, b: s });
      }
    runs.sort((p, q) => p.a - q.a || p.q.u - q.q.u || p.q.v - q.q.v);
    for (const r of runs) {
      const p = g.at(r.q.u, r.q.v);
      const stand = r.q.stand ? { dx: g.toward * (r.q.stand.du ?? 0), dy: r.q.stand.dv ?? 0 } : undefined;
      const facing = r.q.facing === "up" ? DIR.up : r.q.facing === "down" ? DIR.down : g.faceU(r.q.facing === "u+" ? 1 : -1);
      out.push(seat(p.x, p.y, facing, r.a, r.b < 3 ? r.b : undefined, stand, model));
    }
  }
  return out;
}

/** 카라반 문패 최소 폭 (집 이름 20자 + 「12번 · 」이 대개 들어간다) */
const CV_PLATE_W = 150;
/** 관리소 지붕과 띄울 거리 */
const OFFICE_GAP = 6;
/**
 * 11/26 3번 자리는 숲 쪽(왼쪽)에 관리소 지붕이 붙어 있어 3단계 카라반 연결 고리가 지붕에 닿았다 — 그림 칠한 칸이 관리소 사각형(+6px)과 겹치면
 * 계곡 쪽으로 겹친 만큼 민다 (다른 자리는 0)
 */
function officeNudge(cx: number, cy: number, grid: Grid, flip: boolean): number {
  const ox0 = CAMP_OFFICE.x - CAMP_OFFICE_W / 2 - OFFICE_GAP;
  const ox1 = CAMP_OFFICE.x + CAMP_OFFICE_W / 2 + OFFICE_GAP;
  const oy0 = CAMP_OFFICE.y - CAMP_OFFICE_H - OFFICE_GAP;
  if (cy - grid.h > CAMP_OFFICE.y || cy < oy0) return 0;
  let lo = grid.w;
  let hi = -1;
  for (let x = 0; x < grid.w; x++)
    for (let y = 0; y < grid.h; y++)
      if ((grid.get(x, y) & 255) > 100) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
        break;
      }
  if (hi < 0) return 0;
  const left = flip ? cx + grid.w / 2 - 1 - hi : cx - grid.w / 2 + lo;
  const right = flip ? cx + grid.w / 2 - 1 - lo : cx - grid.w / 2 + hi;
  if (right < ox0 || left > ox1) return 0;
  // 관리소 오른쪽에 있으면 오른쪽으로, 왼쪽이면 왼쪽으로
  return cx >= CAMP_OFFICE.x ? ox1 - left + 1 : ox0 - right - 1;
}

function caravanPlan(l: CampLot, st: HomeState): HomePlan {
  const T = Art.CAMP_TEX;
  const g = siteGeo(l);
  const { s, toward, cy } = g;
  const top = s.y - SITE_H / 2;
  const flip = g.side === 1;
  const out: HomePlan = {
    props: [],
    fx: [],
    windows: [],
    lights: [],
    solid: [],
    furniture: [],
    door: { x: s.x, y: s.y + SITE_H / 2 + 6 },
    entry: { x: s.x, y: s.y + SITE_H / 2 },
    plate: { cx: s.x, bottom: top - 2, w: SITE_W },
  };
  const prop = (key: string, x: number, y: number, depth = y, lift = 2, extra: Partial<PlanProp> = {}) => out.props.push({ key, x, y: y + lift, depth, ...extra });
  const camp = (key: string, x: number, y: number, depth = y, lift = 2, extra: Partial<PlanProp> = {}) => prop(key, x, y, depth, lift, { camp: true, ...extra });
  // 자리 테두리: 뒤쪽 통나무 하나 + 모서리 자갈 + 전기·물 연결 기둥
  const logLen = l.lot % 2 ? 18 : 12;
  prop(`${TP}edgeLog${logLen}-${sb(st)}`, s.x + toward * 14, top + 6, FLAT_TAG + top, 2, { make: () => cap(st, A.edgeLogArt(logLen).toCanvas(), 5) });
  if (!st.owned) camp(T.pebbles(l.lot % 3), s.x - toward * (SITE_W / 2 - 6), s.y + SITE_H / 2 - 8, FLAT_TAG + s.y, 1);
  camp(T.pebbles((l.lot + 1) % 3), s.x + toward * (SITE_W / 2 - 4), top + 22, FLAT_TAG + s.y, 1);
  prop(`${TP}hookup-${sb(st)}`, s.x - toward * (SITE_W / 2 - 9), top + 18, top + 18, 2, { make: () => cap(st, A.hookupArt().toCanvas(), 12) });
  if (!st.owned) {
    // 분양 전: 둘레 줄만. 11/26 가운데 「분양」 번호 팻말은 뺐다 (운영자 「카라반, 촌캉스도 NPC만으로 통일」 — 분양은 언젠가 씨에게 말을 걸어서만).
    // door = 터 가운데 E 「분양 안내」 자리 (옛 팻말 자리), 「분양 중」 글씨는 그 위 plate
    prop(`${TP}plotRope-${SITE_W}`, s.x, s.y + SITE_H / 2 - 4, s.y + SITE_H / 2 - 6, 0, { make: () => A.plotRopeArt(SITE_W - 12, SITE_H - 12).toCanvas() });
    out.door = { x: s.x, y: s.y + 14 };
    out.plate = { cx: s.x, bottom: s.y - 22, w: SITE_W };
    return out;
  }
  const stage = st.yard;
  // 카라반
  // 11/26 모델·몸통 색·차양 색은 주인이 고른 디자인 (고르기 전 옛 카라반은 자리 번호대로 — defaultCaravanDesign). 차양은 지붕선 옆 차양, 크리스마스판은 문에 리스
  const design = caravanDesignOf(l.lot, st.design);
  const { model: type, color, awning: awn } = design;
  const art = A.caravanDesignArt(design, stage, { xmas: st.xmas });
  const W = art.grid.w;
  // 11/26 카라반 자리·앞마당은 모델·단계마다 (cvYard — 문 앞 곧은 길 비우기)
  const yd = cvYard(l, type, stage);
  const cx = yd.cx;
  // 문 앞 길 입구 자갈. 11/26 분양된 자리의 번호·우편함 말뚝은 뺐다 (앞마당이 빼곡해서 — 자리 번호는 문패 「N번 · 이름」에 있다)
  const gravel = g.at(yd.du, 35);
  camp(T.pebbles((l.lot + 2) % 3), gravel.x, gravel.y, FLAT_TAG + s.y, 1);
  prop(`${TP}cv-${type}${color}-${stage}-a${awn}-${sb(st)}`, cx, cy, cy, 0, {
    flip,
    // 고드름은 달지 않는다 (차양 천 위로 흰 줄이 늘어져 차양 색을 가렸다)
    make: () => (st.snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 149 + color, icicles: false }) : art.grid.toCanvas()),
  });
  const sx = (x: number) => cx + (flip ? -1 : 1) * (x - W / 2);
  const doorX = Math.round(sx(art.door.x));
  out.door = { x: doorX, y: cy + 4 };
  out.entry = { x: doorX, y: s.y + SITE_H / 2 };
  // 11/26 문패는 지붕 위에 살짝 얹는다 (지붕 위로 띄우면 위 줄 자리 앞마당 탁자·의자에 겹쳤다).
  // 폭은 넉넉히 (「7번 · 에어스트림 1…」처럼 잘렸다 — 옆 자리 카라반과 102px 떨어져 있고 문패 높이가 달라 겹치지 않는다)
  out.plate = { cx, bottom: cy - art.grid.h + 10, w: Math.max(CV_PLATE_W, W) };
  // 몸통 (바닥 띠만 막는다 — 카라반 뒤로 돌아갈 수 있게)
  out.solid.push({ x: cx - W / 2 + 6 + A.CARAVAN_PAD, y: cy - 12, w: W - 10 - 2 * A.CARAVAN_PAD, h: 10 });
  for (const w of art.windows)
    out.windows.push({
      x: sx(w.x),
      y: cy - (art.grid.h - w.y),
      scale: 0.5,
      tint: 0xffb060,
      base: 0.7,
    });
  // 3단계: 차양 아래 땅에 야외 러그 (차양 색 — 문 앞 띠, 밟고 지나간다)
  if (stage >= 3 && art.awning) {
    const a0 = sx(art.awning.x0);
    const a1 = sx(art.awning.x1);
    const rx0 = Math.max(Math.min(a0, a1) + 2, s.x - SITE_W / 2 + 2);
    const rx1 = Math.min(Math.max(a0, a1) - 2, s.x + SITE_W / 2 - 2);
    const rw = Math.round(rx1 - rx0);
    // 카라반 바퀴 그림자 바로 밑부터 (카라반·계단·기둥이 러그 위에 선다)
    if (rw > 12) prop(`${TP}rug${rw}-${awn}`, Math.round((rx0 + rx1) / 2), cy - 2, FLAT_TAG + cy, 0, { oy: 0, make: () => A.outdoorRugArt(rw, awn).toCanvas() });
  }
  // 3단계: 차양 아래 꼬마전구 줄 (그림에 그렸다). 밤에는 몇 개만 은은하게
  art.bulbs
    .filter((_, k) => k % 2 === 0)
    .forEach((b) => out.lights.push({ x: sx(b.x), y: cy - art.grid.h + b.y, scale: 0.22, tint: st.xmas ? 0xffd0a0 : 0xffe0a0, base: 0.8 }));
  // 앞마당 (cvYard — 문 앞 길 양옆에 화롯대 무리 · 탁자 무리, 단계마다 자리·모양이 바뀐다)
  const seats = caravanSeats(l).filter((q) => homeSeatOpen(q, { yard: stage, design }, false));
  // 11/26 통나무는 앉은 사람 뒤(깊이 좌석 y − 0.5)·발밑 2px 아래 — 마을·캠핑장 모닥불 통나무와 같은 자리.
  // 캠핑 의자(탁자 뒤 — 아래를 본다)는 앞모습, 앉은 사람 뒤 (CampMap 옛 캠핑카 의자와 같은 자리: 좌석 + 1, 깊이 좌석 − 1)
  // 3단계 긴 의자 자리(옆을 봄)는 의자 그림을 따로 (탁자 무리에서 긴 의자 둘로)
  const chairCloth = l.lot % 3;
  for (const q of seats) {
    if (q.facing === DIR.down) camp(T.campChairFront(chairCloth), q.x, q.y + 1, q.y - 1, 0);
    else if (q.facing === DIR.up) camp(T.logChair, q.x, q.y, q.y - 0.5);
  }
  const fire = g.at(yd.fire, cvFireV(yd, stage));
  camp(T.brazier, fire.x, fire.y);
  out.fx.push({
    k: "flame",
    tex: "brazier",
    x: fire.x,
    y: fire.y - 1,
    depth: fire.y + 0.5,
    sx: 1,
    sy: 1,
    frame: l.lot % 3,
  });
  out.lights.push({
    x: fire.x,
    y: fire.y - 6,
    scale: 1.1,
    tint: 0xff9a48,
    base: 0.95,
  });
  out.furniture.push({ x: fire.x - 7, y: fire.y - 6, w: 14, h: 6 });
  if (yd.table !== null && stage < 3) {
    const t = g.at(yd.table, CV_TABLE_V[2]);
    camp(T.foldTable, t.x, t.y);
    // 랜턴은 탁자 앞 끝 가운데 (뒤 의자 둘 사이 — 앉은 사람 얼굴을 가리지 않게)
    camp(T.lantern, t.x, t.y - 2, t.y + 1, 0);
    // 11/26 운영자 「평상 뒤로 돌아가면 평상 위에 서 있는 것처럼 보인다」: 막는 상자가 그린 윗면 전부(+ 위 2px)를 덮는다 — 바로 뒤에 선 사람 발이 윗면보다 2px 위 (campHomeLayout.test 9)
    out.furniture.push({ x: t.x - 14, y: t.y - 16, w: 28, h: 16 });
    out.lights.push({ x: t.x, y: t.y - 8, scale: 0.55, tint: 0xffd890, base: 0.88 });
  } else if (yd.table !== null) {
    // 3단계 세로 피크닉 탁자 (차양 색 네모 러그 위 · 양옆 긴 의자 — 긴 의자는 앉은 사람 뒤, 탁자는 앉은 사람 무릎 앞)
    const tv = CV_TABLE_V[3];
    const t = g.at(yd.table, tv);
    const rw = 34;
    const rh = 38;
    prop(`${TP}patioRug${rw}x${rh}-${awn}`, t.x, t.y - rh + 4, FLAT_TAG + t.y, 0, { oy: 0, make: () => A.patioRugArt(rw, rh, awn).toCanvas() });
    for (const s of [-1, 1]) {
      const b = g.at(yd.table + s * CV_BENCH_DU, tv - 1);
      camp(T.benchV, b.x, b.y, t.y - CV_BENCH_ROWS[0] - 1.5, 0);
      out.furniture.push({ x: b.x - 2, y: b.y - 4, w: 4, h: 3 });
    }
    camp(T.picnicV, t.x, t.y, t.y, 0);
    camp(T.lantern, t.x, t.y - 13, t.y + 1, 0);
    out.furniture.push({ x: t.x - 5, y: t.y - 34, w: 10, h: 32 });
    out.lights.push({ x: t.x, y: t.y - 19, scale: 0.6, tint: 0xffd890, base: 0.88 });
  }
  return out;
}

// ════════════════════ 펜션 ════════════════════

/** 시안 PENSION_PLAN (솔바람채 = wide 판 · 달빛채 = small 판 — 땅 크기는 같은 값, 그림 개성만) */
const PENSION_PLAN = {
  // 11/26 두 펜션 모두 이 판 (터 130×124 — 집을 3 왼쪽으로, 오른쪽 줄 소품을 6 안쪽으로)
  wide: {
    px: 51,
    deckFront: 110,
    grill: { x: 113, y: 62 },
    // 11/26 스파는 아래 단 데크 앞쪽으로 13 (오른쪽 등 기둥·통유리 난간과 겹쳤다)
    spa: { x: 113, y: 135 },
    pole: { x: 126, y: 98 },
    // 11/26 문 앞 곧은 길(문 ± 14px)을 비우려고 식탁은 3 왼쪽 · 파라솔은 10 오른쪽으로
    // 11/26 식탁을 2 오른쪽으로 (테라스 왼쪽 뒤 화분과 겹쳤다 — 길 왼쪽 끝 = 문 − 14에 닿는 데까지)
    dine: -27,
    parasol: 32,
  },
  small: {
    px: 42,
    deckFront: 104,
    grill: { x: 98, y: 56 },
    spa: { x: 100, y: 116 },
    pole: { x: 114, y: 92 },
    dine: -18,
    parasol: 20,
  },
} as const;
/**
 * 11/26 펜션 두 채는 같은 땅·같은 집 크기 (운영자 「펜션 터를 같게 — 차이가 너무 난다」): 둘 다 넓은 판(wide) 배치를 쓰고,
 * 다른 건 소품 개성뿐 (솔바람채 = 그네·스파·선베드 · 달빛채 = 바비큐·해먹·화로대). 터도 130×124로 같다 (protocol CAMP_LOTS)
 */
const pensionSize = (): "wide" | "small" => "wide";
/** 솔바람채 3단계 선베드 (계단 양옆 — 왼쪽은 우체통, 오른쪽은 스파와 닿지 않게) */
const PEN_LOUNGER_DX = [-38, 32] as const;
/** 선베드 줄 (등 기둥 밑과 2px 띄운다) */
const PEN_LOUNGER_DY = 14;
/** 3단계 아래 단 데크: 터 폭 가득 (왼쪽 끝 = 터 + 2 · 폭 126) — 2단계(테라스 + 6)보다 넓고 오른쪽 마당(스파·화로대)까지 덮는다 */
const PEN_DECK3 = { left: 2, w: 126, d: 20 } as const;
/** 달빛채 3단계 화로대 · 해먹 (넓은 판 오른쪽 줄 — 터 기준) */
// 11/26 화로대는 아래 단 데크 오른쪽 가운데 (2단계 파라솔 탁자 자리 — 3단계엔 탁자를 치운다). 등 기둥 밑동 아래 · 통나무는 양옆 22 (틈 5px)
// 11/26 운영자 「업그레이드에서 빠지는 건 없게」: 달빛채 3단계는 파라솔 탁자를 아래 단 데크 왼쪽으로 옮겨 남기고,
// 화로대는 집 오른쪽 띠 바비큐 아래 (통나무 둘 — 위 하나는 아래를 보고 · 아래 하나는 위를 보고 불을 본다), 해먹은 아래 단 데크 오른쪽 (protocol qM4)
const PEN_FIRE = { x: 118, y: 85 } as const;
/** 화로대 위·아래 통나무 자리 (화로대 받침에서) */
const PEN_FIRE_LOG_UP = -16;
const PEN_FIRE_LOG_DOWN = 17;
const PEN_HAMMOCK = { x: 105, y: 138 } as const;

function pensionGeo(l: CampLot) {
  const size = pensionSize();
  const PL = PENSION_PLAN[size];
  const px = l.x + PL.px;
  const py = l.y + PL.deckFront;
  const td = P4.TERRACE[size];
  const deckTop = py - td.d;
  return {
    size,
    PL,
    px,
    py,
    td,
    deckTop,
    half: td.w / 2,
    // 솔바람채(1) = 스파 판 · 달빛채(2) = 화로대 판 (크기는 같다)
    spa: l.n === 1,
  };
}

/**
 * 2단계 파라솔 탁자 자리. 11/26 달빛채(작은 테라스)는 문이 오른쪽이라 테라스 위 파라솔이 문을 가렸다 → 아래 단 데크 왼쪽으로 (우체통은 오른쪽)
 * (계단 가운데 길과 문 앞을 비운다 — 운영자 「입구가 어디인지 모르겠다」)
 */
function parasolAt(g: ReturnType<typeof pensionGeo>): { x: number; y: number } {
  // 11/26 달빛채도 넓은 판이라 아래 단 데크 오른쪽 (왼쪽은 식탁 앞 의자 바로 아래였다)
  // 11/26 달빛채 탁자는 4 아래로 (오른쪽 등 기둥 밑동에 닿았다)
  return g.spa ? { x: g.px + g.PL.parasol, y: g.deckTop + 29 } : { x: g.px + 30, y: g.py + 13 };
}
/** 11/26 달빛채 3단계 탁자 (아래 단 데크 왼쪽 — 오른쪽엔 해먹) */
function parasolAt3(g: ReturnType<typeof pensionGeo>): { x: number; y: number } {
  // 식탁 앞 의자에서 일어서는 자리(식탁 앞 9px)를 비우려고 데크 앞쪽으로 (받침 py + 17)
  return g.spa ? parasolAt(g) : { x: g.px - 31, y: g.py + 17 };
}

/** 펜션 자리: 1단계 4인 식탁 · 2단계 파라솔 탁자 2 · 3단계 선베드 2(솔바람채) / 화로대 통나무 2(달빛채) */
function pensionSeats(l: CampLot): HomeSeat[] {
  const g = pensionGeo(l);
  const seat = seatMaker(l);
  const dx = g.px + g.PL.dine;
  const dy = g.deckTop + 28;
  const { x: tx, y: ty } = parasolAt(g);
  const out = [
    // 11/26 뒤 의자: 다리가 식탁 밑에 들어가게 (전에는 등받이 위에 떠 있었다 — 운영자 「배치 구도」)
    // 11/26 뒤 의자에서 일어서면 식탁 뒤로 (아래로 9px면 식탁 막는 상자 안이었다)
    seat(dx - 7, dy - 12, DIR.down, 1, undefined, { dy: -8 }),
    seat(dx + 7, dy - 12, DIR.down, 1, undefined, { dy: -8 }),
    // 11/26 앞 의자에서 일어서면 바깥 비스듬히 (바로 앞은 달빛채 3단계 아래 단 데크 탁자)
    seat(dx - 7, dy + 3, DIR.up, 1, undefined, { dx: -8 }),
    seat(dx + 7, dy + 3, DIR.up, 1, undefined, { dx: 8 }),
    // 11/26 달빛채 탁자는 2단계엔 데크 오른쪽, 3단계엔 데크 왼쪽 (오른쪽엔 해먹)
    seat(tx - 11, ty + 1, DIR.right, 2, g.spa ? undefined : 2),
    seat(tx + 11, ty + 1, DIR.left, 2, g.spa ? undefined : 2),
  ];
  if (!g.spa) {
    const t3 = parasolAt3(g);
    out.push(seat(t3.x - 11, t3.y + 1, DIR.right, 3), seat(t3.x + 11, t3.y + 1, DIR.left, 3));
  }
  if (g.spa) out.push(...PEN_LOUNGER_DX.map((d) => seat(g.px + d, g.py + PEN_LOUNGER_DY, DIR.down, 3)));
  else {
    const fx = l.x + PEN_FIRE.x;
    const fy = l.y + PEN_FIRE.y;
    // 위 통나무는 일어서면 뒤(바비큐 아래 틈)로 · 아래 통나무는 바로 앞
    out.push(seat(fx, fy + PEN_FIRE_LOG_UP, DIR.down, 3, undefined, { dy: -9 }), seat(fx, fy + PEN_FIRE_LOG_DOWN, DIR.up, 3));
  }
  return out;
}

function pensionPlan(l: CampLot, st: HomeState): HomePlan {
  const T = Art.CAMP_TEX;
  const G = pensionGeo(l);
  const { size, PL, px, py, td, deckTop, half } = G;
  const lit = st.owned;
  const lv = st.owned ? st.yard : 1;
  const roofI = l.n === 1 ? 0 : 2;
  const v = l.n === 1 ? 0 : 1;
  const out: HomePlan = {
    props: [],
    fx: [],
    windows: [],
    lights: [],
    solid: [],
    furniture: [],
    door: { x: px, y: py },
    entry: { x: px, y: l.y + l.h },
    plate: { cx: px, bottom: l.y, w: l.w },
  };
  const prop = (key: string, x: number, y: number, depth = y, lift = 2, extra: Partial<PlanProp> = {}) => out.props.push({ key, x, y: y + lift, depth, ...extra });
  const furn = (key: string, make: () => HTMLCanvasElement, x: number, y: number, depth = y) =>
    prop(`${TP}${key}-${sb(st)}`, x, y, depth, 2, {
      make: () => cap(st, make(), 999),
    });
  // 11/26 화분: 그림 밑동만큼 막는다 (전에는 지나다녔다)
  const pot = (v: number, x: number, y: number) => {
    furn(`pot${v % 3}`, () => P4.potArt(v).toCanvas(), x, y);
    out.furniture.push({ x: x - 4, y: y - 4, w: 8, h: 4 });
  };
  // 집채 (넓히면 지붕창 2층 방)
  // 11/26 집채는 앞마당 3단계에 지붕창 2층 방이 생긴다 (넓히기를 앞마당에 합쳤다 — 방 14×10과 같은 때. 옛 넓힌 기록도)
  const grown = homeGrown(st);
  const art = P4.houseArt(size, roofI, lit, st.xmas, v, grown);
  prop(`${TP}house-${size}-${roofI}-${v}-${lit ? 1 : 0}-${grown ? 1 : 0}-${sb(st)}`, px, deckTop + 6, deckTop + 2, 0, {
    make: () => (st.snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 171 + roofI }) : art.grid.toCanvas()),
  });
  const ox = px - art.grid.w / 2;
  const oy = deckTop + 6 - art.grid.h;
  out.fx.push({
    k: "text",
    text: l.name ?? "",
    x: ox + art.board.x,
    y: oy + art.board.y,
    depth: deckTop + 3,
    tint: 0xfff0c8,
    maxW: 16,
    maxScale: 0.5,
  });
  out.door = { x: Math.round(ox + art.door.x), y: deckTop + 9 };
  out.entry = { x: out.door.x, y: l.y + l.h };
  out.plate = { cx: px, bottom: oy - 4, w: Math.max(l.w, art.grid.w) };
  out.solid.push({
    x: ox + 4,
    y: l.y + 2,
    w: art.grid.w - 8,
    h: deckTop + 2 - (l.y + 2),
  });
  // 테라스
  prop(`${TP}terrace-${size}-${sb(st)}`, px, deckTop - 2, deckTop + 4, 0, {
    ox: 0.5,
    oy: 0,
    make: () => (st.snowy ? A.snowDust(P4.terraceArt(size), 0.3, 7) : P4.terraceArt(size)).toCanvas(),
  });
  // 2단계: 아래 단 데크 · 솔바람채는 통유리 난간
  if (lv >= 2) {
    // 11/26 3단계엔 아래 단 데크가 터 폭 가득 + 앞으로 더 (2단계 110×12 → 3단계 126×20 — 오른쪽 마당 스파·화로대까지 데크 위).
    // 계단(32px)은 늘 문 바로 아래 (문 앞 곧은 길)
    const big = lv >= 3;
    const lw = big ? PEN_DECK3.w : td.w + 6;
    const ld = big ? PEN_DECK3.d : 12;
    const left = big ? l.x + PEN_DECK3.left : px - lw / 2;
    const stairX = out.door.x - left;
    prop(`${TP}lowDeck-${lw}-${ld}-${stairX}-${sb(st)}`, left, py - 1, FLAT_TAG + 14, 0, {
      ox: 0,
      oy: 0,
      make: () => (st.snowy ? A.snowDust(Y6.lowerDeckArt(lw, ld, stairX), 0.3, 11) : Y6.lowerDeckArt(lw, ld, stairX)).toCanvas(),
    });
    if (G.spa) {
      // 11/26 난간 사이(계단 앞)를 32px로 (문 앞 곧은 길 28px)
      const gap = P4.TERRACE_STAIR_W / 2;
      const rl = Math.round(half - 2 - gap);
      prop(`${TP}glassRail-${rl}`, px - half + 2, py - 10, py + 1, 0, {
        ox: 0,
        oy: 0,
        make: () => Y6.glassRailArt(rl).toCanvas(),
      });
      prop(`${TP}glassRail-${rl}`, px + gap + 1, py - 10, py + 1, 0, {
        ox: 0,
        oy: 0,
        make: () => Y6.glassRailArt(rl).toCanvas(),
      });
    }
    // 11/26 솔바람채 3단계는 왼쪽 끝에 선베드 (화분이 선베드에 닿았다)
    if (!(big && G.spa)) pot(l.n + 2, px - half - 1, py + 10);
    // 오른쪽 화분은 2단계만 (3단계 오른쪽은 스파·화로대)
    // 11/26 솔바람채는 오른쪽 등 기둥을 바깥으로 뺐다 (파라솔 의자와 겹쳤다) → 오른쪽 화분은 달빛채만
    if (!big && !G.spa) pot(l.n, px + half + 1, py + 10);
  }
  // 1단계: 4인 식탁
  const dx = px + PL.dine;
  const dy = deckTop + 28;
  // 11/26 마을 의자·벤치와 같은 규칙으로 층을 나눈다: 뒤 의자(등받이·방석)는 뒤에 앉은 사람 뒤, 식탁·앞 방석은 그 사람 앞(다리를 가린다)이고
  // 앞에 앉은 사람(위를 봄) 뒤, 앞 의자 등받이는 앞에 앉은 사람 앞 (마을 위 보는 벤치의 등받이처럼). 그림 32×26, 위 끝 = dy − 24
  for (const [crop, depth] of [
    [[0, 0, 32, 8], dy - 13],
    [[0, 8, 32, 13], dy - 10],
    [[0, 21, 32, 5], dy + 5],
  ] as const)
    prop(`${TP}dine-${roofI % 4}-${sb(st)}`, dx, dy, depth, 2, { make: () => cap(st, R5.diningSetArt(roofI).toCanvas(), 999), crop });
  // 11/26 운영자 「평상 뒤로 돌아가면 평상 위에 서 있는 것처럼 보인다」: 막는 상자가 그린 윗면 전부(+ 위 2px)를 덮는다 — 바로 뒤에 선 사람 발이 윗면보다 2px 위 (campHomeLayout.test 9)
  out.furniture.push({ x: dx - 14, y: dy - 19, w: 28, h: 13 });
  // 11/26 테라스 왼쪽 뒤 화분은 3 바깥으로 (식탁 뒤 의자와 겹쳤다)
  pot(l.n, px - half + 3, deckTop + 9);
  // 2단계: 파라솔 탁자 + 옆마당 (솔바람채 그네 의자 · 달빛채 바비큐 스테이션 연기)
  if (lv >= 2) {
    // 11/26 달빛채는 파라솔 없는 탁자 (파라솔 천이 바로 뒤 식탁에 앉은 사람 머리를 덮었다). 2단계 아래 단 데크 오른쪽 → 3단계 왼쪽 (오른쪽엔 해먹)
    const { x: tx, y: ty } = lv >= 3 ? parasolAt3(G) : parasolAt(G);
    furn(`tset-${roofI % 3}-${G.spa ? 1 : 0}`, () => P4.tableSetArt(roofI, G.spa).toCanvas(), tx, ty);
    out.furniture.push({ x: tx - 7, y: ty - 13, w: 14, h: 10 });
    const gx = l.x + PL.grill.x;
    // 11/26 달빛채 바비큐는 10 위로 (3단계 해먹 기둥과 겹쳤다 — 해먹도 2 위로, protocol CAMP_HAMMOCKS qM4)
    const gy = l.y + PL.grill.y - (G.spa ? 0 : 10);
    if (G.spa) {
      // 11/26 그네는 3 오른쪽 (파라솔 끝에 닿았다)
      furn("swing", () => P4.swingBenchArt().toCanvas(), gx + 3, gy + 4);
      out.furniture.push({ x: gx - 11, y: gy - 15, w: 29, h: 19 });
    } else {
      furn("bbqStation", () => Y6.bbqStationArt().toCanvas(), gx - 6, gy + 2);
      out.furniture.push({ x: gx - 24, y: gy - 23, w: 36, h: 25 });
      if (lit) {
        out.fx.push({
          k: "smoke",
          x: gx + 4,
          y: gy - 16,
          depth: gy + 2,
          freq: 480,
          alpha: 0.5,
          scale: 0.8,
        });
        out.lights.push({
          x: gx,
          y: gy - 10,
          scale: 0.6,
          tint: 0xff8a40,
          base: 0.8,
        });
      }
    }
  } else pot(l.n + 1, px + 30, py - 6);
  // 데크 앞 모서리 등 기둥 둘
  const lpL = px - half + 3;
  // 11/26 솔바람채 2단계부터 오른쪽 등 기둥은 테라스 밖으로 7 (파라솔 탁자 오른쪽 의자를 뚫고 서 있었다)
  const lpR = px + half - 3 + (G.spa && lv >= 2 ? 7 : 0);
  for (const lx of [lpL, lpR]) {
    prop(`${TP}lamp-${sb(st)}`, lx, py - 2, py - 2, 2, {
      make: () => cap(st, A.lampPostArt().toCanvas(), 20),
    });
    // 11/26 등 기둥 밑동
    out.furniture.push({ x: lx - 2, y: py - 4, w: 4, h: 3 });
    if (lit)
      out.lights.push({
        x: lx,
        y: py - 22,
        scale: 0.6,
        tint: 0xffd28a,
        base: 0.85,
      });
  }
  if (lv >= 3 && !G.spa) {
    // 달빛채 3단계: 화로대 불멍(통나무 의자 2) + 해먹 + 데크 앞 줄조명
    const fx = l.x + PEN_FIRE.x;
    const fy = l.y + PEN_FIRE.y;
    furn("firepit-1", () => R5.firePitArt(true).toCanvas(), fx, fy, fy - 1);
    out.fx.push({
      k: "flame",
      tex: "flames",
      x: fx,
      y: fy - 4,
      depth: fy,
      sx: 0.4,
      sy: 0.4,
      frame: 1,
    });
    out.lights.push({ x: fx, y: fy - 8, scale: 1.2, tint: 0xffa048, base: 1 });
    out.furniture.push({ x: fx - 9, y: fy - 8, w: 18, h: 8 });
    // 통나무는 앉은 사람 뒤 (카라반 통나무와 같은 깊이)
    for (const d of [PEN_FIRE_LOG_UP, PEN_FIRE_LOG_DOWN]) prop(T.logChair, fx, fy + d, fy + d - 0.5, 2, { camp: true });
    // 11/26 누울 수 있는 해먹 (protocol CAMP_HAMMOCKS qM4 — 서버 좌석). 기둥 둘만 막고, 누가 누우면 기둥만 (campHousing setHammockBusy)
    const hm = campHammockById("qM4") ?? { id: "qM4", x: l.x + PEN_HAMMOCK.x, y: l.y + PEN_HAMMOCK.y, skin: "campMint" as const };
    prop(`${TP}campHammock-mint-${sb(st)}`, hm.x, hm.y, hm.y - 2, 1, {
      make: () => cap(st, campHammockGrid("campMint").toCanvas(), 12),
    });
    out.furniture.push(...campHammockColliders(hm));
    out.hammock = { id: hm.id, x: hm.x, y: hm.y };
    out.fx.push({
      k: "string",
      // 11/26 데크 앞 줄조명은 테라스에 앉은 사람 뒤로 (앞으로 그리면 줄이 식탁에 앉은 사람 몸을 가로질렀다)
      a: [lpL, py - 24, deckTop + 12],
      b: [lpR, py - 24, deckTop + 12],
      i: l.lot,
    });
  }
  if (lv >= 3 && G.spa) {
    // 솔바람채 3단계: 선베드 둘 (아래 단 데크) + 온수 스파(김) + 줄조명 (데크 앞 + 스파 위 장대)
    furn("lounger0", () => Y6.loungerArt(0x5a9ad0).toCanvas(), px + PEN_LOUNGER_DX[0], py + PEN_LOUNGER_DY);
    furn("lounger1", () => Y6.loungerArt(0xe8a03a).toCanvas(), px + PEN_LOUNGER_DX[1], py + PEN_LOUNGER_DY);
    // 11/26 선베드 몸통 (그림 24×14 — 앉는 줄 아래로는 비워 일어서는 자리를 둔다)
    for (const d of PEN_LOUNGER_DX) out.furniture.push({ x: px + d - 11, y: py + PEN_LOUNGER_DY - 8, w: 22, h: 8 });
    const sx = l.x + PL.spa.x;
    const sy = l.y + PL.spa.y;
    const spaNight = lit && st.night;
    furn(`spa-${spaNight ? 1 : 0}`, () => R5.spaArt(spaNight).toCanvas(), sx, sy);
    out.furniture.push({ x: sx - 15, y: sy - 23, w: 31, h: 21 });
    const wy = sy - R5.SPA.h + R5.SPA.water.y + 2;
    out.fx.push({ k: "steam", x: sx, y: wy, depth: sy + 4, small: true });
    out.lights.push({ x: sx, y: wy, scale: 0.55, tint: 0x8ae8f0, base: 0.7 });
    const pole = { x: l.x + PL.pole.x, y: l.y + PL.pole.y };
    prop(T.pole, pole.x, pole.y, pole.y, 2, { camp: true });
    out.fx.push(
      { k: "string", a: [lpL, py - 24, deckTop + 12], b: [lpR, py - 24, deckTop + 12], i: l.lot },
      {
        k: "string",
        a: [lpR, py - 24, deckTop + 12],
        b: [pole.x, pole.y - 32, pole.y],
        i: l.lot + 1,
      },
    );
  }
  // 11/26 우체통은 두 채 모두 계단 왼쪽 (문 앞 곧은 길 밖 · 식탁 앞 의자 아래)
  // 11/26 솔바람채 3단계 선베드와 2px 띄우려고 1 오른쪽 (길 왼쪽 끝 = 문 − 14)
  // 11/26 3 아래로 (식탁 앞 의자 그림에 닿았다)
  // 11/26 달빛채 3단계는 계단 오른쪽 (왼쪽엔 탁자)
  const mbp = !G.spa && lv >= 3 ? { x: px + 22, y: py + 19 } : { x: px - (G.spa && lv >= 3 ? 19 : 20), y: py + 19 };
  furn("mailbox", () => P4.mailboxArt().toCanvas(), mbp.x, mbp.y);
  out.furniture.push({ x: mbp.x - 2, y: mbp.y - 3, w: 4, h: 3 });
  // 11/26 들어가는 곳: 문 앞 발매트 + 문등 (어두울수록). 문 위 화살표는 뺐다 (운영자 「왜 그것만 뜨게 해 놨냐」 — 다른 곳처럼 「E 들어가기」 안내로)
  prop(`${TP}doormat`, out.door.x, deckTop + 11, deckTop + 5, 0, { make: () => doorMatArt().toCanvas() });
  out.lights.push({ x: out.door.x, y: deckTop - 6, scale: 0.5, tint: 0xffd890, base: 0.7 });
  if (lit) {
    out.fx.push({
      k: "smoke",
      x: ox + art.chimney.x,
      y: oy + art.chimney.y,
      depth: deckTop + 3,
    });
    for (const w of art.windows)
      out.windows.push({
        x: ox + w.x,
        y: oy + w.y,
        scale: 0.55,
        tint: 0xffb060,
        base: 0.8,
      });
  }
  // 11/26 빈 펜션 분양 팻말은 뺐다 (운영자 「헷갈려한다」 — 펜션 분양은 소슬댁에게 말을 걸어서만. 「분양 중」 글씨는 문패 자리에)
  return out;
}

// ════════════════════ 촌캉스 ════════════════════

/**
 * 11/26 촌캉스 배치 (감나무집 = 돌담·기와집 · 싸리울집 = 싸리 울타리·슬레이트집 — 땅 크기·담 단계·앉을 자리 수는 둘이 같다).
 * 운영자 「입구를 모닥불로 가리는 게 맞냐」: 대문 → 집 문까지 곧은 길(폭 28px, 두 사람)을 비우고 소품은 모두 양옆으로.
 * 대문(기둥 사이 40px · 안쪽 30px)은 집 문 바로 아래.
 *  - 1단계: 담 앞줄 y 118 (집 앞 작은 마당) — 아궁이 · 평상
 *  - 2단계: 담을 y 144로 내어 쌓는다 — 장독대 · 밥상(소반)
 *  - 3단계: 터 끝(y 160)까지 — 정자(감나무집)·원두막(싸리울집) + 화톳불, 곁채
 * 11/26 운영자 「아궁이·항아리 배치가 옆집이랑 비슷한데 좀 섞어 봐」: 싸리울집은 좌우를 뒤집었다 —
 *  감나무집 = 집 왼쪽(문 x 66) · 왼쪽 칸 아궁이·장독대 · 오른쪽 칸 평상·정자 · 감나무·곁채 오른쪽 뒤, 소반은 옆 의자
 *  싸리울집 = 집 오른쪽(문 x 84) · 오른쪽 칸 아궁이·장독대(작은 독 많이) · 왼쪽 칸 평상·원두막(뒤로 — 앞 사다리로만 오른다) · 감나무·곁채 왼쪽 뒤,
 *  2단계 소반은 뒤 의자(앞을 보고 앉는다)
 * 11/26 운영자 「원두막 아래 화로랑 너무 가까워서 키가 안 먹혀」·「울타리랑 화로 옆 의자 원근감이 이상하다」 (배치 다시 — 캠핑장_배치규칙.md):
 *  - 정자·원두막은 넓은 칸에 혼자 (집·곁채 바로 앞 — 더 뒤는 집 벽을 가린다). 오르는 자리(앞 계단·사다리 밑) 앞은 비운다
 *  - 11/26 운영자 「업그레이드에서 빠지는 건 없게」: 3단계는 좁은 칸 = 아궁이 + 4인 밥상(소반의 큰 판 — 원두막 사다리와 55px 넘게),
 *    장독대는 작은 장독대(큰 독 하나 + 항아리 둘)로 정자·원두막 앞 기둥 옆. 화톳불은 없다 (1·2·3단계 4 · 6 · 8자리)
 *  - 담·울타리 앞줄은 1단계 128 · 2단계 156 · 3단계 160 (담 그림이 소품 아래를 가리지 않게 — 통나무·의자는 담 그림 위 끝보다 위, 담 밑줄에서 12px 넘게)
 */
type RuralTable = { x: number; y: number };
const RURAL_PLAN = {
  wide: {
    door: 66,
    house: { x: 66, y: 72 },
    tree: { x: 126, y: 52 },
    jangdok: { x: 31, y: 137, big: 3, small: 3 },
    pyeong: { x: 108, y: 106 },
    // 11/26 정자는 2 왼쪽 (오른쪽 앞 기둥 옆에 작은 장독대 — 오른쪽 돌담과 2px 띄운다)
    pavilion: { x: 109, y: 130 },
    // 11/26 왼쪽 돌담에 붙어 있어서 (틈 0.5px) 1 오른쪽으로 (크리스마스판이 1px 넓어 길 쪽은 더 못 간다)
    agungi: { x: 32, y: 106 },
    table2: { x: 108, y: 134 } as RuralTable,
    // 3단계 4인 밥상 (아궁이 아래) · 작은 장독대 (정자 오른쪽 앞 기둥 옆 — 왼쪽 앞은 대문 돌기둥)
    // 11/26 밥상은 4 오른쪽 (왼쪽 뒤 의자에서 일어설 자리 — 돌담과 상 사이에 발 하나)
    table3: { x: 35, y: 139 } as RuralTable,
    jangdok3: { x: 128, y: 146 },
    annex: { x: 128, y: 72 },
  },
  small: {
    door: 84,
    // 슬레이트집 문은 그림 가운데보다 1px 왼쪽
    house: { x: 85, y: 72 },
    tree: { x: 24, y: 52 },
    jangdok: { x: 120, y: 136, big: 1, small: 4 },
    pyeong: { x: 42, y: 106 },
    pavilion: { x: 42, y: 118 },
    agungi: { x: 121, y: 106 },
    table2: { x: 42, y: 134 } as RuralTable,
    // 3단계 4인 밥상 (아궁이 아래) · 작은 장독대 (원두막 오른쪽 앞 기둥 옆 — 사다리 오른쪽)
    // 11/26 밥상은 4 왼쪽 (오른쪽 뒤 의자에서 일어설 자리 — 울타리 기둥과 안 닿게)
    table3: { x: 116, y: 139 } as RuralTable,
    jangdok3: { x: 58, y: 138 },
    annex: { x: 22, y: 72 },
  },
} as const;
/** 원두막 사다리 (그림 50×52의 x 18~23 — 가운데 x 20.5) · 사다리 밑 서는 줄 (원두막 막는 상자 pp.y + 2 아래) */
const WONDUMAK_LADDER_DX = -4.5;
const WONDUMAK_FOOT_DY = 9;
/**
 * 11/26 원두막은 앞 사다리로만 오른다 (운영자): 사다리 밑(foot)에서 E(폰 [상호작용])를 누르면 마루 방석에 앉고 (위로 걷기만 해서는 안 오른다), 일어서면 사다리 밑으로 내려온다.
 * 다른 쪽에서 다가가면 아무 일도 없다 (CampScene — campLadderSeatAt). 3단계 싸리울집만
 */
export type CampLadder = { lot: number; x: number; y: number; seats: readonly string[] };
export function campLadders(lots: readonly CampLot[]): CampLadder[] {
  const out: CampLadder[] = [];
  for (const l of lots) {
    if (l.kind !== "rural" || ruralSize(l) !== "small") continue;
    const pp = { x: l.x + RURAL_PLAN.small.pavilion.x, y: l.y + RURAL_PLAN.small.pavilion.y };
    const seats = ruralSeats(l).filter((q) => q.minYard === 3 && Math.abs(q.x + (q.standDx ?? 0) - Math.round(pp.x + WONDUMAK_LADDER_DX)) < 1);
    out.push({ lot: l.lot, x: Math.round(pp.x + WONDUMAK_LADDER_DX), y: pp.y + WONDUMAK_FOOT_DY, seats: seats.map((q) => q.id) });
  }
  return out;
}
/** 집 문 x (터 기준) · 대문 반폭 (돌기둥 사이 40px — 기둥 안쪽 30px가 비어 길 28px가 지난다) */
const RURAL_GATE_HALF = 20;
/** 단계별 담 앞줄 (터 위 기준 — 1단계 집 앞 작은 마당 → 2단계 내어 쌓기 → 3단계 터 끝) */
export const RURAL_FRONT = [128, 156, 160] as const;
/** 싸리울집 울타리 (터 왼쪽 위 기준 · 150×160 · 앞줄 front · 대문 gA~gB 비움 — 마지막 점 → 첫 점 사이가 대문) */
function brushFence(front: number, gA: number, gB: number): { x: number; y: number }[] {
  const k = (front - 62) / 98;
  return [
    { x: gB, y: front - 3 },
    { x: 143, y: front - 5 },
    { x: 147, y: Math.round(62 + 46 * k) },
    { x: 145, y: 42 },
    { x: 139, y: 13 },
    { x: 78, y: 9 },
    { x: 12, y: 13 },
    { x: 4, y: 62 },
    { x: 5, y: Math.round(62 + 56 * k) },
    { x: 8, y: front - 6 },
    { x: gA, y: front - 3 },
  ];
}
/** 촌캉스 모양 (감나무집 = 돌담·기와집 · 싸리울집 = 싸리 울타리·슬레이트집). 11/26 땅·배치는 둘이 같다 */
// 11/26 두 집 자리를 맞바꿔서(왼쪽 15 싸리울집 · 오른쪽 16 감나무집) 번호가 아니라 이름으로 고른다
const ruralSize = (l: CampLot): "wide" | "small" => (l.name === "감나무집" ? "wide" : "small");

/** 11/26 평상 마루 막는 상자 (그림 52×32 — 마루 5~24줄 + 다리, 바닥 = pp.y + 2) */
// 11/26 그린 윗면 전부 (그림 3줄 = pp.y − 27) 위 2px부터 — 뒤로 돌아가도 평상 위에 선 것처럼 보이지 않게
const PYEONG_BOX = { dx: -26, dy: -29, w: 52, h: 27 } as const;
/**
 * 11/26 평상은 다가간 쪽 방석에 앉는다 (운영자 「윗쪽에서 앉기 하면 윗방석에 앉게」): 위(집 쪽) = 윗방석 둘 · 앞 = 아랫방석(양옆) 둘 · 옆 = 그쪽 방석.
 * 막는 상자 둘레 오르는 자리 넷 (campSeatZones). 윗방석은 일어서면 평상 뒤(pp.y − 30 — 집 막는 상자와 평상 막는 상자 사이 7px 틈),
 * 아랫방석은 평상 앞 (pp.y + 7)
 */
const PYEONG_FRONT = 7;
const PYEONG_BACK = -30;
/**
 * 11/26 운영자 「방석 위에 정확하게 앉지를 않네」: 앉는 점이 방석 가운데(그림 s.y − 2)보다 2px 아래라 앉은 몸(점 − 3 위)이 방석 위 끝에 걸쳐
 * 방석 밖 위에 떠 보였다. 정자·원두막 방석처럼 앉는 점 = 방석 아래 테 + 1 (몸이 방석을 덮고 아래 테만 보인다)
 */
const PYEONG_SIT_DY = 2;
/** 정자 마루 막는 상자 (그림 58×58 — 기둥 바깥까지, 바닥 = pp.y + 2) · 일어서는 줄 (마루 앞 끝 아래) */
// 11/26 마루·기단 전부 (그림 32줄 = pp.y − 24) 위 2px부터 (지붕은 막지 않는다 — 뒤에 선 사람을 지붕이 가린다)
const PAVILION_BOX = { dx: -25, dy: -26, w: 50, h: 23 } as const;
const PAVILION_FRONT = 3;
/** 정자 앞 가운데 계단 반폭 (오르는 자리 — 오른쪽 앞 기둥 옆엔 작은 장독대) */
const PAVILION_STEP_HALF = 6;
/** 오르는 자리 (앉을 자리를 고를 수 있는 곳) 깊이 — 마루 앞 끝·옆 끝에서 */
const ACCESS_DEPTH = 12;

/**
 * 11/26 높은·큰 자리는 정해진 쪽에서만 앉는다 (원두막 = 앞 사다리 밑 · 평상 = 다가간 쪽 방석(위 = 윗방석 · 앞 = 아랫방석 · 옆 = 그쪽) · 정자 = 앞 계단 쪽).
 * 플레이어가 rects 안에 있을 때만 seats를 고르고 (가까운 다른 자리보다 먼저), 밖에서는 아예 안 고른다 (campSit campZoneSeat).
 * 일어서는 자리도 rects 안이다 (테스트)
 */
export type CampSeatZone = { lot: number; kind: "ladder" | "pyeong" | "pavilion"; seats: readonly string[]; rects: readonly PlanRect[] };
export function campSeatZones(lots: readonly CampLot[]): CampSeatZone[] {
  const out: CampSeatZone[] = [];
  for (const l of lots) {
    if (l.kind !== "rural") continue;
    const R = RURAL_PLAN[ruralSize(l)];
    const wide = ruralSize(l) === "wide";
    const seats = ruralSeats(l);
    const ids = (min: CampYard, max: CampYard, near: { x: number; y: number }, r: number) =>
      seats.filter((q) => q.minYard === min && (q.maxYard ?? 3) === max && Math.hypot(q.x - near.x, q.y - near.y) < r).map((q) => q.id);
    // 평상 (1·2단계): 다가간 쪽 방석 (11/26 운영자 「윗쪽에서 앉기 하면 윗방석에 앉게」)
    //  위(평상 뒤 — 집과 평상 사이) = 윗방석 둘 · 앞(아래 모서리까지) = 아랫방석 둘 · 왼쪽·오른쪽 = 그쪽 아랫방석·윗방석 (가까운 것)
    const pp = { x: l.x + R.pyeong.x, y: l.y + R.pyeong.y };
    const pb = pyeongBox(pp);
    const py = ids(1, 2, { x: pp.x, y: pp.y - 16 }, 30);
    // ruralSeats 순서: [왼쪽 아랫방석, 오른쪽 아랫방석, 왼쪽 윗방석, 오른쪽 윗방석]
    const [lo, ro, lu, ru] = py;
    const side = (seats: string[], r: PlanRect) => out.push({ lot: l.lot, kind: "pyeong", seats, rects: [r] });
    side([lu, ru], { x: pb.x, y: pb.y - ACCESS_DEPTH, w: pb.w, h: ACCESS_DEPTH });
    side([lo, ro], { x: pb.x - ACCESS_DEPTH, y: pb.y + pb.h, w: pb.w + ACCESS_DEPTH * 2, h: ACCESS_DEPTH });
    side([lo, lu], { x: pb.x - ACCESS_DEPTH, y: pb.y + 4, w: ACCESS_DEPTH, h: pb.h - 4 });
    side([ro, ru], { x: pb.x + pb.w, y: pb.y + 4, w: ACCESS_DEPTH, h: pb.h - 4 });
    const vp = { x: l.x + R.pavilion.x, y: l.y + R.pavilion.y };
    if (wide) {
      // 정자 (3단계): 앞 가운데 계단 쪽 (마루 앞 끝 아래 12px — 오른쪽 앞 기둥 옆은 작은 장독대)
      const vb = pavilionBox(vp);
      out.push({ lot: l.lot, kind: "pavilion", seats: ids(3, 3, { x: vp.x, y: vp.y - 14 }, 30), rects: [{ x: vp.x - PAVILION_STEP_HALF, y: vb.y + vb.h, w: PAVILION_STEP_HALF * 2, h: ACCESS_DEPTH }] });
    } else {
      // 원두막 (3단계): 앞 사다리 밑만 (x ±7 · 사다리 밑 줄 −4 ~ +8)
      const fx = Math.round(vp.x + WONDUMAK_LADDER_DX);
      const fy = vp.y + WONDUMAK_FOOT_DY;
      out.push({ lot: l.lot, kind: "ladder", seats: ids(3, 3, { x: vp.x, y: vp.y - 16 }, 30), rects: [{ x: fx - 7, y: fy - 4, w: 14, h: 12 }] });
    }
  }
  return out;
}
export function pyeongBox(pp: { x: number; y: number }): PlanRect {
  return { x: pp.x + PYEONG_BOX.dx, y: pp.y + PYEONG_BOX.dy, w: PYEONG_BOX.w, h: PYEONG_BOX.h };
}
export function pavilionBox(pp: { x: number; y: number }): PlanRect {
  return { x: pp.x + PAVILION_BOX.dx, y: pp.y + PAVILION_BOX.dy, w: PAVILION_BOX.w, h: PAVILION_BOX.h };
}

/** 촌캉스 자리: 1~2단계 평상 4 · 2단계 밥상 2 (평상 앞) · 3단계 정자·원두막 4 + 4인 밥상 4 (길 건너 아궁이 아래) — 4 · 6 · 8자리 */
function ruralSeats(l: CampLot): HomeSeat[] {
  const R = RURAL_PLAN[ruralSize(l)];
  const wide = ruralSize(l) === "wide";
  const seat = seatMaker(l);
  const at = (p: { x: number; y: number }) => ({ x: l.x + p.x, y: l.y + p.y });
  const out: HomeSeat[] = [];
  // 평상 (방석 4 — 그림 원점 바닥 가운데, 2px 들어 올림). 평상 마루를 통째로 막고(PYEONG_BOX), 앉는 점은 방석 아래 테 + 1 (PYEONG_SIT_DY)
  const pp = at(R.pyeong);
  const P = R5.PYEONG;
  // 양옆 아랫방석은 일어서면 평상 앞, 윗방석은 평상 뒤 (다가간 쪽 — campSeatZones)
  const pfaces = [DIR.right, DIR.left, DIR.down, DIR.down] as const;
  P.seats.forEach((q, i) => {
    const y = pp.y + 2 - P.h + q.y + PYEONG_SIT_DY;
    out.push(seat(pp.x - P.w / 2 + q.x, y, pfaces[i], 1, 2, { dy: pp.y + (i < 2 ? PYEONG_FRONT : PYEONG_BACK) - y }));
  });
  // 2단계 밥상 (평상 앞 — 양옆 작은 의자 둘, 일어서면 밥상 옆 바깥으로)
  const LT = R5.LOWTABLE;
  const tb = at(R.table2);
  out.push(
    seat(tb.x - LT.w / 2 + LT.seats[0].x, tb.y + 2 - LT.h + LT.seats[0].y, DIR.right, 2, 2, { dx: -6 }),
    seat(tb.x - LT.w / 2 + LT.seats[1].x, tb.y + 2 - LT.h + LT.seats[1].y, DIR.left, 2, 2, { dx: 6 }),
  );
  // 3단계: 정자(감나무집)·원두막(싸리울집) 방석 4 — 일어서면 마루 앞 마당으로
  const vp = at(R.pavilion);
  if (wide) {
    const V = R5.PAVILION;
    V.seats.forEach((q) => {
      const y = vp.y + 2 - V.h + q.y;
      const x = vp.x - V.w / 2 + q.x;
      // 일어서면 앞 가운데 계단 아래 (오르는 자리 — 양 끝 방석은 계단 쪽으로 비켜 선다)
      const d = x - vp.x;
      const step = Math.max(-PAVILION_STEP_HALF + 1, Math.min(PAVILION_STEP_HALF - 1, d));
      out.push(seat(x, y, DIR.down, 3, undefined, { dx: Math.round(step - d), dy: vp.y + PAVILION_FRONT - y }));
    });
  } else {
    // 원두막 마루 (그림 50×52, 마루 30~36 · 방석 x 10·20·30·40) — 넷이 나란히 앞을 본다.
    // 11/26 앞 사다리로만 오르내린다: 일어서면 사다리 밑으로 (campLadders)
    const wy = vp.y + 4 + 2 - 52 + 33;
    const foot = { x: vp.x + WONDUMAK_LADDER_DX, y: vp.y + WONDUMAK_FOOT_DY };
    for (const x of [10, 20, 30, 40]) {
      const sx = Math.round(vp.x - 25 + x);
      out.push(seat(sx, wy, DIR.down, 3, undefined, { dx: Math.round(foot.x) - sx, dy: foot.y - wy }));
    }
  }
  // 3단계: 4인 밥상 (뒤 의자 둘은 앞을 보고 · 앞 의자 둘은 상을 보고). 뒤 의자는 일어서면 제 쪽 바깥 옆, 앞 의자는 바로 앞
  const B = R5.BAPSANG4;
  const t3 = at(R.table3);
  B.seats.forEach((q, i) => {
    const x = t3.x - B.w / 2 + q.x;
    const back = i < 2;
    // 11/26 뒤 의자는 일어서면 제 쪽 옆으로 (왼쪽 의자는 상 왼쪽, 오른쪽 의자는 상 오른쪽 — 전에는 둘 다 길 쪽 한 자리라 먼 쪽 의자가 상 너머에서 닿았다)
    const side = q.x < B.w / 2 ? -1 : 1;
    out.push(seat(x, t3.y + 2 - B.h + q.y, back ? DIR.down : DIR.up, 3, undefined, back ? { dx: Math.round(t3.x + side * 21 - x) } : undefined));
  });
  return out;
}

function ruralPlan(l: CampLot, st: HomeState): HomePlan {
  const size = ruralSize(l);
  const R = RURAL_PLAN[size];
  const wide = size === "wide";
  const x0 = l.x;
  const y0 = l.y;
  const fpw = l.w;
  const lit = st.owned;
  const lv = st.owned ? st.yard : 1;
  const S = sb(st);
  // 이 단계 담 앞줄 (터 위 기준) · 대문 (집 문 바로 아래)
  const F = RURAL_FRONT[lv - 1];
  const gA = R.door - RURAL_GATE_HALF;
  const gB = R.door + RURAL_GATE_HALF;
  const out: HomePlan = {
    props: [],
    fx: [],
    windows: [],
    lights: [],
    solid: [],
    furniture: [],
    door: { x: x0, y: y0 },
    entry: { x: x0 + R.door, y: y0 + l.h },
    plate: { cx: x0 + fpw / 2, bottom: y0, w: fpw },
  };
  const prop = (key: string, x: number, y: number, depth = y, lift = 2, extra: Partial<PlanProp> = {}) => out.props.push({ key, x, y: y + lift, depth, ...extra });
  const furn = (key: string, make: () => HTMLCanvasElement, x: number, y: number, depth = y, maxY = 999) =>
    prop(`${TP}${key}-${S}`, x, y, depth, 2, {
      make: () => cap(st, make(), maxY),
    });
  const at = (p: { x: number; y: number }) => ({ x: x0 + p.x, y: y0 + p.y });
  const fence = brushFence(F, gA, gB);
  // 흙마당 (담 안, 겨울엔 눈 마당 + 쓸어 둔 길). 단계마다 담과 함께 앞으로 넓어진다
  const yx = 6;
  const yy = R.house.y - 14;
  const yw = fpw - 12;
  const yh = F - 4 - yy;
  const swept = [0, 1, 2, 3].map((k) => ({ x: R.door - yx, y: R.house.y + 3 + ((F - R.house.y - 3) * k) / 3 - yy, rx: k ? 10 : 14, ry: k ? 9 : 6 }));
  swept.push({ x: R.agungi.x - yx, y: R.agungi.y - yy + 3, rx: 20, ry: 7 });
  const melt = lit ? { x: R.agungi.x - yx, y: R.agungi.y - yy + 3 } : null;
  prop(`${TP}yard-${size}-${S}-${lit ? 1 : 0}-${lv}`, x0 + yx, y0 + yy, FLAT_TAG + 10, 0, {
    ox: 0,
    oy: 0,
    make: () => {
      const c = R5.yardArt(yw, yh, st.snowy, wide ? 1 : 2, swept, melt).toCanvas();
      if (wide) return c;
      // 싸리울집: 울타리 모양대로 마당을 자른다 (네모가 아니게)
      const ctx = c.getContext("2d")!;
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      fence.forEach((p, i) => (i ? ctx.lineTo(p.x - yx, p.y - yy) : ctx.moveTo(p.x - yx, p.y - yy)));
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      return c;
    },
  });
  // 담: 감나무집 돌담 + 돌기둥 대문 · 싸리울집 싸리 울타리 + 싸리문
  const mossy = !st.snowy;
  const backY = y0 + 10;
  const frontY = y0 + F;
  const lx = x0 + 4;
  const rx = x0 + fpw - 4;
  const hWall = (xa: number, xb: number, y: number, seed: number) => {
    const len = Math.round(xb - xa);
    if (len < 4) return;
    prop(`${TP}dolH-${len}-${seed}-${S}`, xa, y, y, 1, {
      ox: 0,
      make: () => cap(st, R5.stoneWallHArt(len, seed, mossy).toCanvas(), 10),
    });
    out.solid.push({ x: xa, y: y - 6, w: len, h: 6 });
  };
  const vWall = (x: number, ya: number, yb: number, seed: number) => {
    const len = Math.round(yb - ya);
    if (len < 4) return;
    prop(`${TP}dolV-${len}-${seed}-${S}`, x, ya, yb, 0, {
      oy: 0,
      make: () => cap(st, R5.stoneWallVArt(len, seed, mossy).toCanvas(), len + 4),
    });
    out.solid.push({ x: x - 3, y: ya, w: 6, h: len });
  };
  const post = (x: number, y: number) =>
    prop(`${TP}gpost-${S}`, x, y, y, 2, {
      make: () => cap(st, R5.gatePostArt().toCanvas(), 16),
    });
  if (!wide) {
    // 울타리 구간 (선 · 막기)
    for (let i = 1; i < fence.length; i++) {
      const a = fence[i - 1];
      const b = fence[i];
      const seg = Y6.brushFenceSeg(x0 + a.x, y0 + a.y, x0 + b.x, y0 + b.y, i, st.snowy);
      prop(`${TP}brushF-${l.lot}-${lv}-${i}-${S}`, seg.ox, seg.oy, y0 + Math.max(a.y, b.y) + 1, 0, { ox: 0, oy: 0, make: () => seg.grid.toCanvas() });
      // 막기: 구간을 따라 작은 상자
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        out.solid.push({
          x: x0 + a.x + (b.x - a.x) * t - 3,
          y: y0 + a.y + (b.y - a.y) * t - 4,
          w: 6,
          h: 6,
        });
      }
    }
    // 싸리문은 대문 밖 오른쪽 울타리에 젖혀 두고 (안쪽은 소품 칸), 길에서 대문까지 디딤돌
    prop(`${TP}brushGate-${S}`, x0 + gB + 9, frontY + 10, frontY + 10, 2, { flip: true, make: () => cap(st, R5.brushGateArt().toCanvas(), 14) });
    const dx = x0 + R.door;
    const stones = [
      { x: dx - 1, y: frontY + 12 },
      { x: dx + 1, y: frontY + 2 },
      { x: dx - 1, y: frontY - 8 },
    ];
    for (const [i, p] of stones.entries()) prop(`${TP}step${i % 2}`, Math.round(p.x), Math.round(p.y), FLAT_TAG + 30, 3, { make: () => stepStoneArt(i % 2).toCanvas() });
  } else {
    hWall(lx - 4, rx + 5, backY, 1);
    hWall(lx - 4, x0 + gA, frontY, 2);
    hWall(x0 + gB, rx + 5, frontY, 3);
    vWall(lx, backY - 2, frontY - 8, 4);
    vWall(rx, backY - 2, frontY - 8, 5);
    // 돌기둥 대문 (문짝 없이 열어 둔다 — 대문 칸이 비어 보이게)
    post(x0 + gA, frontY + 2);
    post(x0 + gB, frontY + 2);
  }
  // 집채 (넓히면 곁채 — 작은 방 하나)
  const art = wide ? R5.giwaHouseArt(lit, st.xmas) : R5.slateHouseArt(lit, st.xmas);
  const hp = at(R.house);
  prop(`${TP}rh-${size}-${lit ? 1 : 0}-${S}`, hp.x, hp.y, hp.y, 0, {
    make: () => (st.snowy ? snowRoof(art.grid.toCanvas(), (x, y) => art.roof[y * art.grid.w + x] === 1, { seed: 191 + l.n }) : art.grid.toCanvas()),
  });
  const ox = hp.x - art.grid.w / 2;
  const oy = hp.y - art.grid.h;
  if (wide)
    out.fx.push({
      k: "text",
      text: l.name ?? "",
      x: ox + art.board.x,
      y: oy + art.board.y,
      depth: hp.y + 1,
      tint: 0xf2dca0,
      maxW: 15,
      maxScale: 0.42,
    });
  if (st.xmas)
    out.fx.push({
      k: "string",
      a: [ox + art.eaveL.x, oy + art.eaveL.y, hp.y],
      b: [ox + art.eaveR.x, oy + art.eaveR.y, hp.y],
      i: l.n + 3,
    });
  out.door = { x: Math.round(ox + art.door.x), y: hp.y + 6 };
  out.plate = { cx: hp.x, bottom: Math.max(oy - 2, 0), w: fpw };
  // 11/26 들어가는 곳: 문등 (어두울수록 — 문 위 화살표는 뺐다. 「E 들어가기」 안내로)
  out.lights.push({ x: out.door.x, y: hp.y - 10, scale: 0.5, tint: 0xffd890, base: 0.7 });
  out.solid.push({
    x: ox + 3,
    y: y0 + 8,
    w: art.grid.w - 6,
    h: hp.y - 2 - (y0 + 8),
  });
  if (lit) {
    out.fx.push({
      k: "smoke",
      x: ox + art.chimney.x,
      y: oy + art.chimney.y,
      depth: hp.y + 1,
      freq: 640,
    });
    for (const w of art.windows)
      out.windows.push({
        x: ox + w.x,
        y: oy + w.y,
        scale: 0.5,
        tint: 0xffb060,
        base: 0.8,
      });
  }
  if (homeGrown(st)) {
    // 곁채: 작은 흙벽 방 (11/26 앞마당 3단계 — 방 14×10과 같은 때) — 집 오른쪽 감나무 밑
    const an = at(R.annex);
    furn(`annex-${wide ? "giwa" : "straw"}-${lit ? 1 : 0}`, () => annexArt(lit, wide), an.x, an.y, an.y, 9);
    out.solid.push({ x: an.x - 11, y: an.y - 10, w: 22, h: 9 });
    if (lit)
      out.windows.push({
        x: an.x,
        y: an.y - 9,
        scale: 0.4,
        tint: 0xffb060,
        base: 0.75,
      });
  }
  // 감나무 (집 오른쪽 뒤 — 가을: 감 주렁주렁 · 겨울: 까치밥)
  const tp = at(R.tree);
  const tart = R5.persimmonTreeArt(st.snowy, wide, wide ? 3 : 5);
  prop(`${TP}pers-${size}-${S}`, tp.x, tp.y, tp.y, 0, {
    make: () => (st.snowy ? snowCap(tart.toCanvas(), { depth: 1, maxY: tart.h - 6 }) : tart.toCanvas()),
  });
  out.solid.push({ x: tp.x - 3, y: tp.y - 4, w: 6, h: 4 });
  // 아궁이 + 가마솥 (왼쪽 칸 위 — 불빛 · 솥 김 · 2단계부터 굴뚝 연기)
  const ap = at(R.agungi);
  const ag = R5.AGUNGI;
  // 11/26 아궁이 불은 E로 켜고 끈다 (campHousing — 같은 채널 모두에게 같게). 꺼지면 불빛·솥 김·굴뚝 연기도 없다
  const fireOn = lit && st.fire !== false;
  furn(`agungi-${fireOn ? 1 : 0}-${st.xmas ? 1 : 0}`, () => R5.agungiArt(fireOn, st.xmas).toCanvas(), ap.x, ap.y, ap.y, ag.h - 8);
  // 11/26 운영자 「평상 뒤로 돌아가면 평상 위에 서 있는 것처럼 보인다」: 막는 상자가 그린 윗면 전부(+ 위 2px)를 덮는다 — 바로 뒤에 선 사람 발이 윗면보다 2px 위 (campHomeLayout.test 9)
  out.furniture.push({ x: ap.x - 22, y: ap.y - 26, w: 41, h: 26 });
  // 11/26 E 자리는 아궁이 길 쪽 옆 (3단계엔 아궁이 바로 아래에 4인 밥상 뒤 의자가 있어 앞에 서면 의자로 갔다 — 의자에서 22px 넘게)
  if (lit) out.fire = { x: ap.x + Math.sign(R.door - R.agungi.x) * (ag.w / 2 + 4), y: ap.y - 8, on: fireOn };
  const aox = ap.x - ag.w / 2;
  const aoy = ap.y + 2 - ag.h;
  if (fireOn) {
    out.fx.push({
      k: "flame",
      tex: "brazier",
      x: aox + ag.mouth.x,
      y: aoy + ag.mouth.y + 1,
      depth: ap.y + 1,
      sx: 0.8,
      sy: 0.7,
      frame: l.n % 3,
    });
    out.lights.push({
      x: aox + ag.mouth.x,
      y: aoy + ag.mouth.y - 4,
      scale: 1.55,
      tint: 0xff9a48,
      base: 1,
    });
    out.fx.push({
      k: "steam",
      x: aox + ag.pot.x,
      y: aoy + ag.pot.y - 4,
      depth: ap.y + 2,
    });
    if (lv >= 2)
      out.fx.push({
        k: "smoke",
        x: aox + ag.chimney.x,
        y: aoy + ag.chimney.y,
        depth: ap.y + 2,
        freq: 560,
        alpha: 0.5,
      });
  }
  // 밥상 (작은 의자 둘) — 2단계 오른쪽 평상 아래 · 3단계 왼쪽 아래 (오른쪽은 정자 자리)
  const lowTable = (p: RuralTable) => {
    const tb = at(p);
    // 11/26 양옆 의자에 앉은 사람이 밥상 그림 위에 (의자 줄 = 위 끝 + 19). 11/26 두 집 모두 2단계 평상 앞 양옆 의자 (뒤 의자 소반은 평상 앞 오르는 자리를 막았다)
    furn("lowTable2", () => R5.lowTableArt(2).toCanvas(), tb.x, tb.y, tb.y - 6, 20);
    out.furniture.push({ x: tb.x - 14, y: tb.y - 18, w: 28, h: 16 });
  };
  if (lv <= 2) {
    // 평상 (1·2단계 오른쪽 칸 위). 평상은 앉은 사람 밑, 소반만 윗방석에 앉은 사람 앞 (다리를 가린다 — 마을 식탁 의자와 같은 규칙)
    // 11/26 앉는 점을 방석 아래 테로 내려서(PYEONG_SIT_DY) 소반 층도 윗방석(pp.y − 18)과 양옆 방석(pp.y − 11) 사이로. 자르는 칸은 소반만 (평상 바닥이 앉은 몸을 덮지 않게)
    const pp = at(R.pyeong);
    furn("pyeongMeal", () => R5.pyeongsangMealArt().toCanvas(), pp.x, pp.y, pp.y - 26, 22);
    prop(`${TP}pyeongMeal-${S}`, pp.x, pp.y, pp.y - 14.5, 2, { make: () => cap(st, R5.pyeongsangMealArt().toCanvas(), 22), crop: [18, 10, 20, 12] });
    out.furniture.push(pyeongBox(pp));
    if (lv === 2) lowTable(R.table2);
  } else {
    const pp = at(R.pavilion);
    if (!wide) {
      // 원두막 (오른쪽 칸). 마루에 앉은 사람이 원두막 그림 위에 오게 — 짚 지붕(0~19줄)만 앉은 사람 앞에 한 번 더
      furn(`wondumak-${st.xmas ? 1 : 0}`, () => Y6.wondumakArt(st.snowy, st.xmas).toCanvas(), pp.x, pp.y + 4, pp.y - 16);
      prop(`${TP}wondumak-${st.xmas ? 1 : 0}-${S}`, pp.x, pp.y + 4, pp.y + 4 + 2 - 52 + 33 + 2, 2, {
        make: () => cap(st, Y6.wondumakArt(st.snowy, st.xmas).toCanvas(), 999),
        crop: [0, 0, 50, 20],
      });
      // 원두막 막는 상자: 짚 지붕 아래 끝(그림 18줄) 위 2px부터 기둥 발치까지 — 뒤에 선 사람이 기둥 사이 빈칸(마루 위)에 서 있는 것처럼 보이지 않게
      out.furniture.push({ x: pp.x - 24, y: pp.y - 30, w: 48, h: 33 });
    } else {
      // 정자 (오른쪽 칸). 방석에 앉은 사람이 정자 위에 — 기와 지붕(0~26줄)과 가운데 차상만 앉은 사람 앞
      const pn = lit && st.night;
      const pavKey = `pavilion-${st.xmas ? 1 : 0}-${pn ? 1 : 0}`;
      const pavMake = () => R5.pavilionArt(pn, st.xmas).toCanvas();
      furn(pavKey, pavMake, pp.x, pp.y, pp.y - 20, R5.PAVILION.h - 6);
      prop(`${TP}${pavKey}-${S}`, pp.x, pp.y, pp.y - 5, 2, { make: () => cap(st, pavMake(), R5.PAVILION.h - 6), crop: [0, 0, R5.PAVILION.w, 27] });
      prop(`${TP}${pavKey}-${S}`, pp.x, pp.y, pp.y - 56 + 41.5, 2, { make: () => cap(st, pavMake(), R5.PAVILION.h - 6), crop: [24, 37, 11, 7] });
      out.furniture.push(pavilionBox(pp));
      if (lit)
        out.lights.push({
          x: pp.x - R5.PAVILION.w / 2 + R5.PAVILION.lantern.x,
          y: pp.y + 2 - R5.PAVILION.h + R5.PAVILION.lantern.y,
          scale: 0.6,
          tint: 0xffb0a0,
          base: 0.9,
        });
    }
  }
  // 장독대 (2단계 좁은 칸 아궁이 아래 — 3단계엔 작은 장독대로 정자·원두막 앞 기둥 옆)
  if (lv === 2) {
    const jp = at(R.jangdok);
    furn(`jangdok-${R.jangdok.big}-${R.jangdok.small}`, () => R5.jangdokArt(R.jangdok.big, R.jangdok.small).toCanvas(), jp.x, jp.y, jp.y, 26);
    out.solid.push({ x: jp.x - 21, y: jp.y - 15, w: 42, h: 14 });
  }
  // 3단계: 4인 밥상 (좁은 칸 아궁이 아래 — 2단계 소반의 큰 판) · 작은 장독대 (정자·원두막 앞 기둥 옆 — 2단계 장독대) + 감나무 줄조명
  if (lv >= 3) {
    const B = R5.BAPSANG4;
    const t3 = at(R.table3);
    // 층: 통째로는 뒤에 앉은 사람 뒤(뒤 의자가 엉덩이 밑) · 상과 앞 의자(그림 11줄 아래)는 뒤 사람 앞이고 앞에 앉은 사람 뒤
    const backY = t3.y + 2 - B.h + B.seats[0].y;
    const frontY = t3.y + 2 - B.h + B.seats[2].y;
    const make = () => cap(st, R5.bapsang4Art().toCanvas(), 20);
    prop(`${TP}bapsang4-${S}`, t3.x, t3.y, backY - 0.5, 2, { make });
    prop(`${TP}bapsang4-${S}`, t3.x, t3.y, frontY - 0.5, 2, { make, crop: [0, 11, B.w, B.h - 11] });
    out.furniture.push({ x: t3.x - 16, y: t3.y - 23, w: 32, h: 14 });
    const jp = at(R.jangdok3);
    furn("jangdokC", () => R5.jangdokCompactArt().toCanvas(), jp.x, jp.y, jp.y, 20);
    out.solid.push({ x: jp.x - 11, y: jp.y - 12, w: 23, h: 12 });
    const w = wide ? 18 : 14;
    out.fx.push(
      {
        k: "string",
        a: [tp.x - w, tp.y - (wide ? 44 : 36), tp.y],
        b: [tp.x + w - 2, tp.y - (wide ? 38 : 30), tp.y],
        i: l.n,
      },
      {
        k: "string",
        a: [tp.x - w + 4, tp.y - (wide ? 26 : 22), tp.y],
        b: [tp.x + w, tp.y - (wide ? 22 : 18), tp.y],
        i: l.n + 1,
      },
    );
  }
  // 우체통 (대문 밖). 11/26 빈 집 대문 밖 분양 팻말은 뺐다 (운영자 「카라반, 촌캉스도 NPC만으로 통일」 — 촌캉스 분양은 순이 할머니에게 말을 걸어서만)
  const mb = { x: x0 + gA - 8, y: frontY + 12 };
  furn("mailbox", () => P4.mailboxArt().toCanvas(), mb.x, mb.y);
  out.furniture.push({ x: mb.x - 2, y: mb.y - 3, w: 4, h: 3 });
  return out;
}

/**
 * 촌캉스 곁채 (넓힌 집): 흙벽 + 나무 기둥 작은 방 하나, 창호지 창. 지붕은 감나무집 = 기와 · 싸리울집 = 초가 (lit = 분양된 집 — 창이 따뜻하다).
 * 11/26 운영자 「곁채 지붕이 잘린다」: 지붕이 납작한 사다리꼴이라 위가 잘린 듯 보였고 처마 끝이 캔버스 끝 열에 닿았다 →
 * 기와는 용마루(끝을 살짝 치켜 올림)·기왓골·처마 끝 들림, 초가는 둥근 지붕마루·새끼줄·처마 짚 술. 둘레에 빈 칸(좌우 3·위 3 — 바닥 가운데 원점이라 자리는 그대로)
 */
export function annexArt(lit: boolean, giwa: boolean): HTMLCanvasElement {
  const X = 3;
  const Y = 3;
  const W = 26 + 2 * X;
  const H = 24 + Y;
  const g = new Grid(W, H);
  g.rect(X + 4, Y + 11, 18, 10, 0xe8dfca);
  g.hline(X + 4, X + 21, Y + 20, 0xc2b294);
  g.rect(X + 4, Y + 11, 2, 10, 0x8a5a34);
  g.rect(X + 20, Y + 11, 2, 10, 0x8a5a34);
  g.rect(X + 9, Y + 13, 8, 6, 0x6a4228);
  g.rect(X + 10, Y + 14, 6, 4, lit ? 0xffe2a0 : 0xf3ecd6);
  g.vline(X + 12, Y + 14, Y + 17, 0x6a4228);
  g.hline(X + 10, X + 15, Y + 15, 0x6a4228);
  if (giwa) {
    const [hi, mid, lo] = [0x9aa4b0, 0x737d8a, 0x56606c];
    for (let r = 0; r < 9; r++) {
      const inset = Math.max(0, 6 - r);
      g.hline(X + inset, X + 25 - inset, Y + 3 + r, r < 2 ? hi : r < 7 ? mid : lo);
      // 기왓골 (세로 줄)
      if (r >= 2 && r < 7) for (let x = X + inset + 1; x < X + 25 - inset; x += 3) g.set(x, Y + 3 + r, lo);
    }
    // 용마루 (양 끝을 살짝 치켜 올린다)
    g.hline(X + 5, X + 20, Y + 2, lo);
    g.hline(X + 6, X + 19, Y + 1, mid);
    g.set(X + 4, Y + 1, lo);
    g.set(X + 21, Y + 1, lo);
    // 처마 끝 들림
    g.set(X - 1, Y + 10, lo);
    g.set(X + 26, Y + 10, lo);
  } else {
    const [hi, mid, lo] = [0xe2c27a, 0xc8a458, 0x9a7a3a];
    const insets = [5, 3, 2, 1, 1, 0, 0, 0, 0];
    for (let r = 0; r < 9; r++) g.hline(X + insets[r], X + 25 - insets[r], Y + 3 + r, r < 2 ? hi : r < 7 ? mid : lo);
    // 둥근 지붕마루
    g.hline(X + 8, X + 17, Y + 2, hi);
    g.hline(X + 10, X + 15, Y + 1, mid);
    // 새끼줄 두 줄 · 처마 짚 술
    for (const ry of [Y + 6, Y + 9]) for (let x = X + 1; x < X + 25; x += 2) if (g.filled(x, ry)) g.set(x, ry, lo);
    for (let x = X + 1; x < X + 25; x += 2) g.set(x, Y + 12, lo);
  }
  g.outline(0x2c2018);
  for (let x = X + 3; x < W - X - 3; x++) if (!g.filled(x, H - 2)) g.set(x, H - 2, 0x1a1006, 60);
  return g.toCanvas();
}

/** 모든 터의 앉을 자리 (protocol CAMP_HOME_SEATS 만들 때·테스트) */
export function allCampHomeSeats(lots: readonly CampLot[]): HomeSeat[] {
  return lots.flatMap((l) => campHomeSeatsOf(l));
}

/** 빈 터 팻말 글씨: 「분양 중 · 폭포 앞 자리」·「분양 중 · 솔바람채」 */
export function saleLabel(l: CampLot): string {
  if (l.kind === "caravan") return `분양 중 · ${CARAVAN_GRADE_NAME[l.grade ?? "forest"]} 자리`;
  return `분양 중 · ${l.name ?? campLotShort(l.lot)}`;
}

/** 문패 첫 줄 머리 (카라반 「3번 · 」, 펜션·촌캉스는 집 이름이 터 이름과 다르면 「솔바람채 · 」) */
export function plateHead(l: CampLot, houseName: string): string {
  if (l.kind === "caravan") return `${l.n}번 · `;
  return l.name && l.name !== houseName ? `${l.name} · ` : "";
}

/** 이 터 이 단계에서 열린 자리인지 (집 없는 카라반 자리 = 없음, 집 없는 펜션·촌캉스 = 1단계 식탁·평상) */
export function homeSeatOpen(seat: Pick<HomeSeat, "lot" | "minYard" | "maxYard" | "model">, house: { yard: CampYard; design?: CaravanDesign } | null, hidden: boolean): boolean {
  const l = campLotByNo(seat.lot);
  if (!l) return false;
  let yard: CampYard;
  // 11/26 카라반 앞마당 자리는 그 집이 고른 모델 자리만 (모르면 자리 번호대로 처음 모델)
  if (house && seat.model && seat.model !== (house.design?.model ?? caravanModelOfLot(seat.lot))) return false;
  if (house) yard = house.yard;
  else if (l.kind === "caravan" || hidden) return false;
  else yard = 1;
  return yard >= seat.minYard && yard <= (seat.maxYard ?? 3);
}
