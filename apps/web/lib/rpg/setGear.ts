import type { Bonus, GearDef, GearKind, GearSlot, IconArt } from "./catalog";
import type { WeaponStyleId } from "./weapons";

// 11/15 끝판 세트 장비 (야근 빌딩 우두머리 상자에서만 나온다). 세트 4종 × 다섯 부위 × 직급 4단계, 강화 +15, 랜덤 옵션, 세트 효과.
// 하나하나가 따로인 물건이라 쌓이지 않는다 — 캐릭터 JSON의 sg 목록에 짧은 글자(코드)로 둔다.
//   코드 = "s{세트}{부위}{직급}.{번호(36진)}.{강화}.{옵션}{!전설}.{굴린 횟수}.{연속 실패}"   예: s032.a1.12.a7c5d18!2.3.0
// 장착 칸(equip)에도 같은 코드를 그대로 둔다 → derive가 장착 칸만 보고 강화·옵션·세트 효과까지 계산한다.
// 서버는 normalize에서 장착 칸을 가방(sg)의 같은 번호 코드로 다시 맞춘다 (화면이 보낸 코드는 믿지 않는다).
// 상점 장비 강화(+1~+5)는 장착 칸에 "w_stamp+3"처럼 붙는다 (원본은 캐릭터 enh).
// 이 파일은 catalog를 타입으로만 본다 (catalog.gearById가 이 파일을 부른다 — 순환 없이).

export const SG_SETS = ["overtime", "approval", "meeting", "trip"] as const;
export type SgSet = (typeof SG_SETS)[number];
export const SG_PIECES = ["weapon", "armor", "head", "acc1", "acc2"] as const;
export type SgPiece = (typeof SG_PIECES)[number];
export type SgGrade = 0 | 1 | 2 | 3;
export const SG_GRADES: readonly SgGrade[] = [0, 1, 2, 3];
export const SG_GRADE_NAMES = ["사원급", "대리급", "과장급", "임원급"] as const;
/** 직급 테 색 (가방 칸·이름표) */
export const SG_GRADE_COLORS = ["#b4ae9c", "#6cb4f0", "#d2dcec", "#f2c444"] as const;
/** 기본 능력치 = 상점 최고 장비 × 직급 배율 */
export const SG_GRADE_MULT = [1.15, 1.3, 1.5, 1.75] as const;
export const SG_REQ_LEVEL = 50;
/** 세트 장비 가방 (장착 중 포함) */
export const SG_INV_MAX = 60;
export const SG_PIECE_KIND: Record<SgPiece, GearKind> = {
  weapon: "weapon",
  armor: "armor",
  head: "head",
  acc1: "acc",
  acc2: "acc",
};
export const SG_PIECE_LABEL: Record<SgPiece, string> = {
  weapon: "무기",
  armor: "갑옷",
  head: "머리",
  acc1: "장신구",
  acc2: "장신구",
};

export type SgSetInfo = {
  name: string;
  /** 짧은 이름 ("야근") — 세트 효과 진행 "야근 2/4" */
  short: string;
  /** 무기 공격 방식 */
  style: WeaponStyleId;
  styles: string;
  color: string;
  pieces: Record<SgPiece, string>;
  desc: Record<SgPiece, string>;
  two: string;
  four: string;
};

export const SG_SET_INFO: Record<SgSet, SgSetInfo> = {
  overtime: {
    name: "야근 세트",
    short: "야근",
    style: "smash",
    styles: "내려찍기·휘두르기",
    color: "#8cf03c",
    pieces: {
      weapon: "막차 놓친 도끼",
      armor: "사흘째 같은 셔츠",
      head: "충혈된 눈 고글",
      acc1: "에너지 드링크 반지",
      acc2: "빈 커피 컵 목걸이",
    },
    desc: {
      weapon: "형광 날끝. 도끼 등에 붙은 시계가 23:59에서 멈춰 있다.",
      armor: "구겨지고 커피 얼룩이 진 셔츠. 넥타이는 풀린 지 오래다.",
      head: "렌즈에 핏발 선 눈이 그려진 고글.",
      acc1: "반지 위에 번개 캔이 얹혀 있다.",
      acc2: "목걸이 끝에 뚜껑 덮인 빈 종이컵.",
    },
    two: "최대 체력 +10%",
    four: "체력이 30% 아래면 공격력 +25%, 받는 피해 −10%",
  },
  approval: {
    name: "결재 세트",
    short: "결재",
    style: "thrust",
    styles: "찌르기·던지기",
    color: "#ee6a70",
    pieces: {
      weapon: "반려 도장 창",
      armor: "결재판 흉갑",
      head: "돋보기 안경",
      acc1: "만년필 브로치",
      acc2: "사장실 출입증",
    },
    desc: {
      weapon: "창날 밑에 X를 새긴 붉은 도장이 달려 있다.",
      armor: "결재 칸 셋. 직급이 오를수록 찍힌 도장이 늘어난다.",
      head: "한쪽 알이 커서 눈이 크게 보인다.",
      acc1: "로제트 위에 펜촉이 꽂힌 브로치.",
      acc2: "붉은 목줄 출입증. 사장실 문이 열린다.",
    },
    two: "치명타 +6%",
    four: "치명타가 터지면 3초 동안 공격 속도 +20%",
  },
  meeting: {
    name: "회의 세트",
    short: "회의",
    style: "magic",
    styles: "범위 마법",
    color: "#4ab8ff",
    pieces: {
      weapon: "끝없는 PPT 마법서",
      armor: "회의실 커튼 로브",
      head: "프로젝터 왕관",
      acc1: "레이저 포인터 귀걸이",
      acc2: "회의록 수첩",
    },
    desc: {
      weapon: "펼치면 막대그래프 슬라이드가 떠오른다.",
      armor: "어깨에 커튼 봉과 고리, 밑단에 빔 빛.",
      head: "띠 가운데에 프로젝터 렌즈가 박혀 있다.",
      acc1: "빨간 점이 반짝이는 귀걸이.",
      acc2: "스프링 수첩. 회의록은 아무도 안 읽는다.",
    },
    two: "SP +20%, 스킬 피해 +8%",
    four: "스킬을 쓰면 다음 스킬 재사용 시간 −15%",
  },
  trip: {
    name: "출장 세트",
    short: "출장",
    style: "shot",
    styles: "쏘기·연타",
    color: "#f08a24",
    pieces: {
      weapon: "기내용 캐리어 대포",
      armor: "경량 패딩",
      head: "목베개 투구",
      acc1: "마일리지 카드",
      acc2: "면세점 영수증",
    },
    desc: {
      weapon: "하드 캐리어에 남색 포신을 달았다.",
      armor: "가로 퀼팅에 흰 띠와 비행기 표시.",
      head: "거꾸로 쓴 목베개에 감은 눈 안대.",
      acc1: "비행기와 칩이 박힌 카드.",
      acc2: "바코드가 찍힌, 끝이 말린 영수증.",
    },
    two: "이동 속도 +8%",
    four: "3초 동안 안 맞으면 다음 공격 피해 +40%",
  },
};

/**
 * 기본 능력치 (직급 배율 전) = 지금 상점 최고 장비 그대로 (lib/rpg/setGear.test.ts가 catalog와 맞는지 본다).
 * 무기는 「최종 결재 도장」(공격력 118)의 공격력에 세트 공격 방식에 맞는 보조 능력치 — 느려지는 값은 뺐다
 */
const BASE_WEAPON: Record<SgSet, Bonus> = {
  overtime: { atk: 118, str: 4, crit: 4 },
  approval: { atk: 118, dex: 4, crit: 4 },
  meeting: { atk: 118, int: 4, sp: 40 },
  trip: { atk: 118, hit: 12, crit: 4 },
};
/** 마감 주간 방호복 · 연차 쓴 날의 후광 · 성과급 봉투 */
export const SG_BASE: Record<Exclude<GearKind, "weapon">, Bonus> = {
  armor: { def: 40, hp: 320, vit: 3 },
  head: { def: 11, int: 4, sp: 50, luk: 3 },
  acc: { str: 4, dex: 4, crit: 4 },
};
export const sgBaseBonus = (set: SgSet, piece: SgPiece): Bonus =>
  piece === "weapon" ? BASE_WEAPON[set] : SG_BASE[SG_PIECE_KIND[piece] as Exclude<GearKind, "weapon">];

/** 능력치에 배율 (깎는 값은 그대로, 공격 속도는 소수 둘째 자리) */
export function scaleBonus(b: Bonus, k: number): Bonus {
  const out: Bonus = {};
  for (const [key, v] of Object.entries(b) as [keyof Bonus, number][]) {
    if (v <= 0) out[key] = v;
    else out[key] = key === "aspd" ? Math.round(v * k * 100) / 100 : Math.round(v * k);
  }
  return out;
}

// ── 강화 ──

/**
 * 강화 배율 (기본 능력치에 곱한다, 옵션 값은 그대로). 11/15: +5%씩은 너무 약해서 단계마다 더 크게 —
 * +1~+5는 한 단계 8%p, +6~+10은 12%p, +11~+15는 20%p → +5 = ×1.40, +10 = ×2.00, +15 = ×3.00
 */
export const ENH_STEPS = [0.08, 0.12, 0.2] as const;
export const SG_ENH_MAX = 15;
export const SHOP_ENH_MAX = 5;
export function enhMul(e: number): number {
  const n = Math.max(0, Math.min(SG_ENH_MAX, Math.floor(e)));
  const k = Math.min(n, 5) * ENH_STEPS[0] + Math.max(0, Math.min(n, 10) - 5) * ENH_STEPS[1] + Math.max(0, n - 10) * ENH_STEPS[2];
  return Math.round((1 + k) * 100) / 100;
}

/**
 * 강화한 능력치: 기본 + 기본 × (배율 − 1)을 올림 → 작은 능력치(치명 4 등)도 한 단계마다 티가 난다 (공격 속도는 소수 둘째 자리).
 * 깎는 값은 그대로
 */
export function enhBonus(b: Bonus, e: number): Bonus {
  if (e <= 0) return b;
  const k = enhMul(e) - 1;
  const out: Bonus = {};
  for (const [key, v] of Object.entries(b) as [keyof Bonus, number][]) {
    if (v <= 0) out[key] = v;
    else out[key] = key === "aspd" ? Math.round(v * (1 + k) * 100) / 100 : v + Math.ceil(v * k - 1e-9);
  }
  return out;
}

// ── 랜덤 옵션 ──

export type SgOpt = "a" | "c" | "d" | "s" | "b" | "h" | "r" | "p" | "m" | "k";
export type SgOptDef = {
  name: string;
  /** 깎는 옵션(받는 피해·재사용 시간)이면 − */
  minus?: true;
  /** 사원급 범위 · 임원급 범위 (대리·과장은 사이를 고르게) */
  lo: readonly [number, number];
  hi: readonly [number, number];
  on: readonly GearKind[];
};
export const SG_OPTS: Record<SgOpt, SgOptDef> = {
  a: { name: "공격력", lo: [3, 5], hi: [6, 8], on: ["weapon", "acc"] },
  c: {
    name: "치명타 확률",
    lo: [2, 3],
    hi: [4, 6],
    on: ["weapon", "head", "acc"],
  },
  d: { name: "치명타 피해", lo: [8, 12], hi: [15, 20], on: ["weapon", "acc"] },
  s: { name: "공격 속도", lo: [3, 5], hi: [6, 8], on: ["weapon", "acc"] },
  b: { name: "우두머리 피해", lo: [5, 8], hi: [11, 15], on: ["weapon"] },
  h: { name: "최대 체력", lo: [4, 6], hi: [8, 10], on: ["armor", "head"] },
  r: { name: "받는 피해", minus: true, lo: [2, 3], hi: [5, 6], on: ["armor"] },
  p: { name: "물약 회복량", lo: [10, 15], hi: [25, 30], on: ["armor", "acc"] },
  m: { name: "이동 속도", lo: [2, 3], hi: [5, 6], on: ["head", "acc"] },
  k: {
    name: "스킬 재사용 시간",
    minus: true,
    lo: [3, 4],
    hi: [7, 8],
    on: ["head", "acc"],
  },
};
export const SG_OPT_IDS = Object.keys(SG_OPTS) as SgOpt[];
/** 직급별 랜덤 옵션 수 */
export const SG_OPT_COUNT = [2, 2, 3, 3] as const;
/** 임원급에만 붙는 전설 옵션 확률 */
export const SG_LEGEND_CHANCE = 0.1;
export const SG_LEGENDS: Record<number, { name: string; desc: string }> = {
  1: { name: "결재 완료", desc: "우두머리 체력이 30% 아래면 주는 피해 +25%" },
  2: { name: "칼퇴", desc: "판 시작 20초 동안 공격 속도 +30%" },
  3: {
    name: "연차",
    desc: "한 판에 한 번, 쓰러질 피해를 받아도 체력 1로 버텨요",
  },
  4: { name: "야근 수당", desc: "몬스터를 잡을 때마다 체력 1% 회복" },
};
export const SG_LEGEND_IDS = [1, 2, 3, 4] as const;

/** 그 직급의 옵션 값 범위 [최소, 최대] (정수) */
export function optRange(o: SgOpt, g: SgGrade): [number, number] {
  const d = SG_OPTS[o];
  const t = g / 3;
  return [Math.round(d.lo[0] + (d.hi[0] - d.lo[0]) * t), Math.round(d.lo[1] + (d.hi[1] - d.lo[1]) * t)];
}
/** 그 부위에 붙을 수 있는 옵션 */
export const optsFor = (piece: SgPiece): SgOpt[] => SG_OPT_IDS.filter((o) => SG_OPTS[o].on.includes(SG_PIECE_KIND[piece]));
/** 옵션 한 줄 ("공격력 +7%", "받는 피해 −5%") */
export const optText = (o: SgOpt, v: number) => `${SG_OPTS[o].name} ${SG_OPTS[o].minus ? "−" : "+"}${v}%`;

// ── 물건 하나 (코드) ──

export type SgItem = {
  /** 세트·부위 번호 (SG_SETS·SG_PIECES 순서) */
  s: number;
  p: number;
  g: SgGrade;
  /** 캐릭터 안에서 하나뿐인 번호 */
  u: number;
  /** 강화 0..15 */
  e: number;
  o: [SgOpt, number][];
  /** 전설 옵션 1..4 (0 = 없음) */
  L: number;
  /** 옵션 다시 굴린 횟수 (비용이 두 배씩) */
  rr: number;
  /** 강화 연속 실패 (실패할 때마다 다음 성공 확률 +5%p, 성공하면 0) */
  f: number;
};

const CODE_RE = /^s([0-3])([0-4])([0-3])\.([0-9a-z]{1,7})\.(\d{1,2})\.((?:[a-z]\d{1,2}){0,4})(?:!([1-4]))?\.(\d{1,3})\.(\d{1,2})$/;
const SPEC_RE = /^s([0-3])([0-4])([0-3])\.((?:[a-z]\d{1,2}){0,4})(?:!([1-4]))?$/;
const OPT_RE = /([a-z])(\d{1,2})/g;

/** 세트 장비 코드처럼 생겼나 (상점 장비 id는 "w_…"처럼 둘째 글자가 _) */
export const isSgCode = (id: string | null | undefined): id is string => !!id && id.charCodeAt(0) === 115 /* s */ && id[1] !== "_";

const optsStr = (o: [SgOpt, number][], L: number) => o.map(([k, v]) => `${k}${v}`).join("") + (L ? `!${L}` : "");

export function encodeSg(it: SgItem): string {
  return `s${it.s}${it.p}${it.g}.${it.u.toString(36)}.${it.e}.${optsStr(it.o, it.L)}.${it.rr}.${it.f}`;
}

function parseOpts(str: string, g: SgGrade, piece: SgPiece): [SgOpt, number][] | null {
  const out: [SgOpt, number][] = [];
  const allowed = optsFor(piece);
  for (const m of str.matchAll(OPT_RE)) {
    const k = m[1] as SgOpt;
    const v = Number(m[2]);
    if (!allowed.includes(k) || out.some(([x]) => x === k)) return null;
    const [lo, hi] = optRange(k, g);
    if (v < lo || v > hi) return null;
    out.push([k, v]);
  }
  return out.length <= SG_OPT_COUNT[g] ? out : null;
}

/** 코드 → 물건 (형식·범위가 하나라도 어긋나면 null) */
export function decodeSg(code: string | null | undefined): SgItem | null {
  if (!isSgCode(code) || code.length > 48) return null;
  const m = CODE_RE.exec(code);
  if (!m) return null;
  const g = Number(m[3]) as SgGrade;
  const p = Number(m[2]);
  const o = parseOpts(m[6], g, SG_PIECES[p]);
  const L = m[7] ? Number(m[7]) : 0;
  const e = Number(m[5]);
  if (!o || e > SG_ENH_MAX || (L && g !== 3)) return null;
  return {
    s: Number(m[1]),
    p,
    g,
    u: parseInt(m[4], 36),
    e,
    o,
    L,
    rr: Number(m[8]),
    f: Number(m[9]),
  };
}

/** 드롭 한 줄의 id (번호·강화 없이 세트·부위·직급·옵션만): "s032.a7c5d18!2" */
export const sgSpec = (it: Pick<SgItem, "s" | "p" | "g" | "o" | "L">) => `s${it.s}${it.p}${it.g}.${optsStr(it.o, it.L)}`;

/** 드롭 id → 새 물건 (번호 u) */
export function itemOfSpec(spec: string, u: number): SgItem | null {
  const m = SPEC_RE.exec(spec);
  if (!m) return null;
  const g = Number(m[3]) as SgGrade;
  const p = Number(m[2]);
  const o = parseOpts(m[4], g, SG_PIECES[p]);
  const L = m[5] ? Number(m[5]) : 0;
  if (!o || (L && g !== 3)) return null;
  return { s: Number(m[1]), p, g, u, e: 0, o, L, rr: 0, f: 0 };
}

export const sgSetOf = (it: Pick<SgItem, "s">): SgSet => SG_SETS[it.s];
export const sgPieceOf = (it: Pick<SgItem, "p">): SgPiece => SG_PIECES[it.p];
/** 코드에서 번호만 */
export const sgUid = (code: string): number | null => {
  const m = /^s\d{3}\.([0-9a-z]{1,7})\./.exec(code);
  return m ? parseInt(m[1], 36) : null;
};

/** 아이콘: game/rpg/icons가 "sg:{세트}{부위}{직급}"을 세트 장비 그림(game/sprites/setGear)으로 그린다 */
export const sgArt = (s: number, p: number, g: number): IconArt => ({
  shape: `sg:${s}${p}${g}`,
  main: 0,
  accent: 0,
});
/** 아이콘 shape → [세트, 부위, 직급] (세트 장비가 아니면 null) */
export function sgArtOf(shape: string): [SgSet, SgPiece, SgGrade] | null {
  const m = /^sg:([0-3])([0-4])([0-3])$/.exec(shape);
  return m ? [SG_SETS[Number(m[1])], SG_PIECES[Number(m[2])], Number(m[3]) as SgGrade] : null;
}

/** 이름 ("막차 놓친 도끼") — 강화 수치는 따로 */
export const sgName = (it: Pick<SgItem, "s" | "p">) => SG_SET_INFO[sgSetOf(it)].pieces[sgPieceOf(it)];

/** 물건 → 장비 정의 (기본 능력치 = 상점 최고 × 직급 배율 × 강화) */
export function sgDef(it: SgItem, id = encodeSg(it)): GearDef {
  const set = sgSetOf(it);
  const piece = sgPieceOf(it);
  const info = SG_SET_INFO[set];
  return {
    id,
    kind: SG_PIECE_KIND[piece],
    name: info.pieces[piece],
    desc: info.desc[piece],
    reqLevel: SG_REQ_LEVEL,
    price: 0,
    bonus: enhBonus(scaleBonus(sgBaseBonus(set, piece), SG_GRADE_MULT[it.g]), it.e),
    art: sgArt(it.s, it.p, it.g),
    ...(piece === "weapon" ? { style: info.style } : {}),
  };
}

// ── 상점 장비 강화 표시 ("w_stamp+3") ──

// 11/15 상점·주운 장비 강화는 한 개씩 따로 (같은 장신구 두 개 중 하나만 강화할 수 있게): 강화한 것은 묶음에서 떼어
// 캐릭터 si 목록에 "w_stamp+3@5k.1" (장비 id + 강화 @ 번호(36진) . 연속 실패) 로 둔다. 번호는 세트 장비와 같은 줄(sgN)에서 받는다.
// 예전 저장값의 "w_stamp+3"(번호 없음 — 같은 이름 장비 모두에 붙던 강화)는 normalize가 한 개에만 옮긴다
const SHOP_ENH_RE = /^([a-z]_[a-z_]{1,30})\+([1-5])(?:@([0-9a-z]{1,7})\.(\d{1,2}))?$/;
/** 장착 칸 id → [상점 장비 id, 강화] (강화 없으면 0) */
export function shopEnhOf(id: string): [string, number] {
  const m = SHOP_ENH_RE.exec(id);
  return m ? [m[1], Number(m[2])] : [id, 0];
}
export type ShopPiece = { id: string; e: number; u: number; f: number };
/** 강화한 상점 장비 한 개 (코드가 아니면 null) */
export function shopPieceOf(code: string | null | undefined): ShopPiece | null {
  const m = code ? SHOP_ENH_RE.exec(code) : null;
  return m && m[3] !== undefined ? { id: m[1], e: Number(m[2]), u: parseInt(m[3], 36), f: Number(m[4]) } : null;
}
export const isShopPiece = (code: string | null | undefined): code is string => !!shopPieceOf(code);
export const encodeShopPiece = (p: ShopPiece) => `${p.id}+${Math.max(1, Math.min(SHOP_ENH_MAX, p.e))}@${p.u.toString(36)}.${Math.min(50, p.f)}`;
/** 장착 칸 id의 번호 (세트 장비·강화한 상점 장비 — 같은 번호 줄). 묶음 장비면 null */
export const pieceUid = (id: string | null | undefined): number | null => (!id ? null : isSgCode(id) ? sgUid(id) : (shopPieceOf(id)?.u ?? null));

const defMemo = new Map<string, GearDef | null>();
/**
 * catalog.gearById가 못 찾은 id: 세트 장비 코드면 그 정의, "상점id+n"이면 강화한 상점 장비 정의. 아니면 undefined.
 * shop = 상점 장비 찾기 (catalog가 넘긴다)
 */
export function extGearById(id: string, shop: (id: string) => GearDef | undefined): GearDef | undefined {
  const hit = defMemo.get(id);
  if (hit !== undefined) return hit ?? undefined;
  let def: GearDef | null = null;
  if (isSgCode(id)) {
    const it = decodeSg(id);
    def = it ? sgDef(it, id) : null;
  } else {
    const [base, e] = shopEnhOf(id);
    const g = e ? shop(base) : undefined;
    def = g ? { ...g, id, bonus: enhBonus(g.bonus, e) } : null;
  }
  if (defMemo.size > 4000) defMemo.clear();
  defMemo.set(id, def);
  return def ?? undefined;
}

/** 장착 칸에서 강화만 뺀 것 (전투 능력의 강화 몫을 보여 줄 때 비교용) */
export function unenhanced<E extends Partial<Record<GearSlot, string | null>>>(equip: E): E {
  const out = { ...equip };
  for (const k of Object.keys(out) as GearSlot[]) {
    const id = out[k];
    if (!id) continue;
    const it = isSgCode(id) ? decodeSg(id) : null;
    out[k] = (it ? encodeSg({ ...it, e: 0 }) : shopEnhOf(id)[0]) as E[GearSlot];
  }
  return out;
}

/** 장착 칸 id의 바탕 (상점 장비 강화 표시를 뗀 id, 세트 장비는 코드 그대로) */
export const baseGearId = (id: string) => (isSgCode(id) ? id : shopEnhOf(id)[0]);
/**
 * 기본 능력치 중 강화로 붙은 몫: [능력치, 강화 전 값, 강화로 더해진 값] — "공격력 136 (+136)".
 * find = catalog.gearById (세트 장비 코드·강화한 상점 장비도 찾는다)
 */
export function enhSplit(id: string, find: (id: string) => GearDef | undefined): [keyof Bonus, number, number][] {
  const now = find(id);
  if (!now) return [];
  const e = enhOfId(id);
  const base = !e ? now : isSgCode(id) ? sgDef({ ...decodeSg(id)!, e: 0 }) : find(shopEnhOf(id)[0]);
  return (Object.entries(now.bonus) as [keyof Bonus, number][]).map(([k, v]) => {
    const b = base?.bonus[k] ?? v;
    return [k, b, Math.round((v - b) * 100) / 100];
  });
}
/** 장착 칸 id의 강화 수치 */
export const enhOfId = (id: string | null | undefined): number => (!id ? 0 : isSgCode(id) ? (decodeSg(id)?.e ?? 0) : shopEnhOf(id)[1]);

// ── 장착한 세트 장비 → 세트 효과·옵션 ──

type Equip = Partial<Record<GearSlot, string | null>>;

export function equippedSg(equip: Equip): SgItem[] {
  const out: SgItem[] = [];
  for (const id of Object.values(equip)) {
    const it = isSgCode(id) ? decodeSg(id) : null;
    if (it) out.push(it);
  }
  return out;
}

/** 세트마다 낀 부위 수 (같은 부위를 두 개 껴도 하나 — 장신구 두 칸은 서로 다른 장신구여야 4세트가 된다) */
export function setCounts(items: readonly SgItem[]): Record<SgSet, number> {
  const out = { overtime: 0, approval: 0, meeting: 0, trip: 0 } as Record<SgSet, number>;
  const seen = new Set<string>();
  for (const it of items) {
    const k = `${it.s}${it.p}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out[sgSetOf(it)]++;
  }
  return out;
}

/** 2세트·4세트가 붙은 세트 */
export function activeSets(equip: Equip): {
  two: SgSet[];
  four: SgSet[];
  counts: Record<SgSet, number>;
} {
  const counts = setCounts(equippedSg(equip));
  return {
    two: SG_SETS.filter((s) => counts[s] >= 2),
    four: SG_SETS.filter((s) => counts[s] >= 4),
    counts,
  };
}

/** 능력치에 바로 붙는 것 (derive가 쓴다): 비율은 0.1 = 10% */
export type SgStatic = {
  atkPct: number;
  aspdPct: number;
  crit: number;
  hpPct: number;
  spPct: number;
  movePct: number;
  skillPct: number;
};
export const SG_STATIC_NONE: SgStatic = {
  atkPct: 0,
  aspdPct: 0,
  crit: 0,
  hpPct: 0,
  spPct: 0,
  movePct: 0,
  skillPct: 0,
};

export function sgStatic(equip: Equip): SgStatic {
  const items = equippedSg(equip);
  if (!items.length) return SG_STATIC_NONE;
  const o = optSum(items);
  const { two } = activeSets(equip);
  return {
    atkPct: o.a / 100,
    aspdPct: o.s / 100,
    crit: o.c + (two.includes("approval") ? 6 : 0),
    hpPct: o.h / 100 + (two.includes("overtime") ? 0.1 : 0),
    spPct: two.includes("meeting") ? 0.2 : 0,
    movePct: o.m / 100 + (two.includes("trip") ? 0.08 : 0),
    skillPct: two.includes("meeting") ? 0.08 : 0,
  };
}

function optSum(items: readonly SgItem[]): Record<SgOpt, number> {
  const sum = Object.fromEntries(SG_OPT_IDS.map((k) => [k, 0])) as Record<SgOpt, number>;
  for (const it of items) for (const [k, v] of it.o) sum[k] += v;
  return sum;
}

/** 싸움 중에 붙는 것 (게임 HuntScene·서버 처치 속도 상한): 비율은 0.1 = 10% */
export type SgCombat = {
  critDmg: number;
  bossDmg: number;
  /** 받는 피해 감소 (최대 40%) */
  guard: number;
  potion: number;
  /** 스킬 재사용 시간 감소 (최대 40%) */
  cdCut: number;
  legends: number[];
  four: SgSet[];
};

export function sgCombat(equip: Equip): SgCombat {
  const items = equippedSg(equip);
  const o = optSum(items);
  return {
    critDmg: o.d / 100,
    bossDmg: o.b / 100,
    guard: Math.min(0.4, o.r / 100),
    potion: o.p / 100,
    cdCut: Math.min(0.4, o.k / 100),
    legends: [...new Set(items.map((it) => it.L).filter((L) => L > 0))],
    four: activeSets(equip).four,
  };
}

/**
 * 처치 속도 상한에 곱할 싸움 배율 (서버 결과 검증): 옵션·세트 효과가 가장 잘 터질 때를 넉넉히 잡는다.
 * 능력치(공격력·공속·치명)는 derive 쪽 비교로 따로 잡는다 (lib/rpg/setGearRoll gearPower)
 */
export function sgCombatPower(equip: Equip): number {
  const c = sgCombat(equip);
  let k = ((1 + c.critDmg) * (1 + c.bossDmg)) / (1 - c.cdCut);
  if (c.four.includes("overtime")) k *= 1.25;
  if (c.four.includes("approval")) k *= 1.2;
  if (c.four.includes("meeting")) k *= 1.15;
  if (c.four.includes("trip")) k *= 1.4;
  if (c.legends.includes(1)) k *= 1.25;
  if (c.legends.includes(2)) k *= 1.3;
  return k;
}

// ── 캐릭터 저장값 맞추기 ──

/**
 * 장착 칸을 저장된 원본에 맞춘다: 세트 장비·강화한 상점 장비는 가방(sg·si)의 같은 번호 코드로 (가방에 없거나 부위가 칸에 안 맞으면 뺀다),
 * 묶음 상점 장비는 강화 표시를 뗀 id로. 바뀐 게 없으면 같은 객체
 */
export function syncEquip<E extends Record<GearSlot, string | null>>(equip: E, sg: readonly string[], si: readonly string[] = []): E {
  let out: E | null = null;
  const set = (slot: GearSlot, v: string | null) => {
    if (equip[slot] === v) return;
    out ??= { ...equip };
    out[slot] = v as E[GearSlot];
  };
  const kindOf = (slot: GearSlot) => (slot === "acc1" || slot === "acc2" ? "acc" : slot);
  for (const slot of Object.keys(equip) as GearSlot[]) {
    const id = equip[slot];
    if (!id) continue;
    if (isSgCode(id)) {
      const u = sgUid(id);
      const code = u === null ? undefined : sg.find((c) => sgUid(c) === u);
      const it = code ? decodeSg(code) : null;
      const kind = it ? SG_PIECE_KIND[sgPieceOf(it)] : null;
      set(slot, it && kind === kindOf(slot) ? code! : null);
    } else if (shopPieceOf(id)) {
      const u = shopPieceOf(id)!.u;
      set(slot, si.find((c) => shopPieceOf(c)?.u === u) ?? null);
    } else set(slot, shopEnhOf(id)[0]);
  }
  return out ?? equip;
}

/** 재료 */
export const MAT_IDS = ["m_doc", "m_seal", "m_prot"] as const;
export type MatId = (typeof MAT_IDS)[number];
export type Mats = { doc: number; seal: number; prot: number };
export const MAT_KEY: Record<MatId, keyof Mats> = {
  m_doc: "doc",
  m_seal: "seal",
  m_prot: "prot",
};
export const MAT_INFO: Record<MatId, { name: string; desc: string; art: IconArt }> = {
  m_doc: {
    name: "결재 서류",
    desc: "우두머리 상자마다 나와요. 강화 +6부터, 옵션 굴리기에 써요.",
    art: { shape: "mat_doc", main: 0xf2ead3, accent: 0xc8323c },
  },
  m_seal: {
    name: "인감 도장",
    desc: "25층 넘는 우두머리 상자에서 나와요. 강화 +11부터, 옵션 고정에 써요.",
    art: { shape: "mat_seal", main: 0xc8323c, accent: 0xe8b830 },
  },
  m_prot: {
    name: "보호 문서",
    desc: "이번 주 최고 층이 10층 단위를 넘으면 받아요. 강화가 실패해도 내려가지 않게 막아요.",
    art: { shape: "mat_prot", main: 0x6cb4f0, accent: 0xf2f2f2 },
  },
};
export const isMatId = (id: string): id is MatId => (MAT_IDS as readonly string[]).includes(id);
/** 재료 칸 최대 (넘치면 버린다) */
export const MAT_MAX = 99_999;

/** 저장된 세트 장비 목록 정리: 형식이 맞는 코드만, 번호가 겹치면 앞의 것만, 최대 SG_INV_MAX. 다음 번호는 가진 번호보다 크게 */
export function normalizeSg(raw: unknown, n: unknown): { sg: string[]; sgN: number } {
  const sg: string[] = [];
  const seen = new Set<number>();
  let max = 0;
  for (const c of Array.isArray(raw) ? raw : []) {
    if (typeof c !== "string" || sg.length >= SG_INV_MAX) continue;
    const it = decodeSg(c);
    if (!it || seen.has(it.u)) continue;
    seen.add(it.u);
    max = Math.max(max, it.u);
    sg.push(c);
  }
  const want = typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 1;
  return { sg, sgN: Math.max(want, max + 1) };
}
