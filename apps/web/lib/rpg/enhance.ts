import { gearById, type Bonus, type GearSlot } from "./catalog";
import { isShopGear, RpgError } from "./character";
import {
  activeSets,
  decodeSg,
  encodeSg,
  isMatId,
  isSgCode,
  itemOfSpec,
  MAT_KEY,
  MAT_MAX,
  enhBonus,
  enhMul,
  scaleBonus,
  sgBaseBonus,
  sgDef,
  SG_ENH_MAX,
  SG_GRADE_MULT,
  SG_INV_MAX,
  SG_PIECE_KIND,
  SG_PIECES,
  SG_REQ_LEVEL,
  SG_SETS,
  sgName,
  sgPieceOf,
  sgUid,
  SHOP_ENH_MAX,
  encodeShopPiece,
  pieceUid,
  shopPieceOf,
  syncEquip,
  type ShopPiece,
  type Mats,
  type SgGrade,
  type SgItem,
  type SgOpt,
} from "./setGear";
import { rollOptions, rollSgFixed, TOP_SHOP } from "./setGearRoll";
import type { CharacterState, Drop } from "./types";
import { discountedPrice } from "../titles";

// 11/15 강화·옵션 굴리기·바꾸기·분해·세트 장비 끼기 (순수 함수 — 서비스가 저장소 원자 갱신 안에서 부른다).
// 포인트는 서버가 같은 저장 명령(lib/rpg/store updatePaid) 안에서 지갑에서만 뺀다 (모은 포인트·랭킹은 그대로).
// 규칙을 어기면 RpgError (한국어 메시지).

/**
 * 목표 강화 → 성공 확률·포인트·결재 서류·인감 도장 (index 0은 비움).
 * 11/19 사용자 「포인트 무제한이니까 강화 확률 다 낮춰버려 일반 mmorpg처럼, 가격도 올리고」: +1~+3은 쉽게, +4부터 확 떨어지고 +13부터 한 자릿수.
 * 같은 날 「강화 비용 너무 비싸긴 하다 확률이 낮아져서 더 체감됨」: 확률은 그대로 두고 값을 약 1/3로.
 * 모의 실험: +5 평균 약 1,700P, +7 약 4,300P, +10 약 11만P (하루 1시간 약 5천P → 상점 장비 +7은 하루, 세트 +10은 3주 남짓)
 */
export const ENHANCE_TABLE: readonly {
  rate: number;
  cost: number;
  doc: number;
  seal: number;
}[] = [
  { rate: 1, cost: 0, doc: 0, seal: 0 },
  { rate: 1, cost: 100, doc: 0, seal: 0 },
  { rate: 0.9, cost: 150, doc: 0, seal: 0 },
  { rate: 0.8, cost: 200, doc: 0, seal: 0 },
  { rate: 0.65, cost: 300, doc: 0, seal: 0 },
  { rate: 0.55, cost: 400, doc: 0, seal: 0 },
  { rate: 0.45, cost: 500, doc: 2, seal: 0 },
  { rate: 0.38, cost: 650, doc: 3, seal: 0 },
  { rate: 0.32, cost: 800, doc: 3, seal: 0 },
  { rate: 0.26, cost: 1000, doc: 4, seal: 0 },
  { rate: 0.2, cost: 1300, doc: 5, seal: 0 },
  { rate: 0.15, cost: 1700, doc: 6, seal: 1 },
  { rate: 0.12, cost: 2100, doc: 7, seal: 1 },
  { rate: 0.09, cost: 2600, doc: 8, seal: 1 },
  { rate: 0.06, cost: 3200, doc: 9, seal: 2 },
  { rate: 0.04, cost: 4000, doc: 10, seal: 2 },
];
/**
 * 11/20 사용자 「보호 문서를 성능 증폭권처럼 — 체크하면 성공률 2배」 「실패해도 단계는 그대로」 「같은 단계에서 정해진 횟수만큼 실패하면 다음은 반드시 성공」.
 * 실패하면 재료·포인트만 쓰고 단계는 그대로. 실패마다 오르던 +3%p는 아래 천장으로 바꿨다 (성공 확률은 표 그대로 · 증폭하면 2배).
 */
/** 강화 증폭권(옛 보호 문서, 재료 id m_prot 그대로) 성공 확률 배수 (100% 넘으면 100%) */
export const ENH_AMP_MUL = 2;
/**
 * 목표 강화별 증폭권 장수 (0 = 못 씀 — +1~+3은 이미 80% 넘게 붙는다).
 * 한 장 값이 단계마다 비슷하게(포인트로 약 300~1,000P 아끼는 꼴) 높을수록 많이: +4~+6 1장 · +7~+9 2장 · +10~+12 3장 · +13~+15 4장
 */
export const ENH_AMP_TABLE: readonly number[] = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
/**
 * 천장: 목표 강화에서 이만큼 연속으로 실패하면 다음 강화는 반드시 성공 (증폭권을 쓴 실패도 한 번으로 센다).
 * 처음엔 운이 나쁜 열에 두 명쯤(약 12~20%)만 닿게 맞췄다가, 같은 날 사용자 「천장 횟수를 지금의 약 2배로」 → 단계마다 2배
 * (천장까지 갈 확률 약 1~4% — 정말 운이 나쁠 때만의 안전망). 장비마다 저장(세트 장비·강화한 상점 장비 코드의 f, 두 자리), 성공하면 0
 */
export const ENH_PITY: readonly number[] = [0, 0, 2, 2, 4, 4, 6, 8, 10, 12, 16, 20, 26, 36, 56, 84];
/** 연속 실패 저장 상한 (세트 장비 코드 두 자리 — 가장 큰 천장 84보다 크게) */
export const ENH_FAIL_MAX = 99;

/** 목표 강화에 드는 증폭권 장수 (0 = 못 씀) */
export const ampNeed = (target: number) => ENH_AMP_TABLE[target] ?? 0;
/** 목표 강화의 천장 (연속 실패 횟수) */
export const pityOf = (target: number) => ENH_PITY[target] ?? 0;
/** 천장까지 남은 실패 횟수 (0이면 이번 강화는 반드시 성공) */
export const pityLeft = (target: number, fails: number) => Math.max(0, pityOf(target) - Math.max(0, fails));
/** 표 확률 (증폭하면 2배, 최대 100%). 천장은 따로 (enhanceChance) */
export const enhanceRate = (target: number, amp = false) => Math.min(1, (ENHANCE_TABLE[target]?.rate ?? 0) * (amp && ampNeed(target) > 0 ? ENH_AMP_MUL : 1));
/** 이번 시도의 실제 성공 확률: 천장이면 100%, 아니면 표 확률(증폭 반영) */
export function enhanceChance(target: number, fails: number, amp = false): { rate: number; sure: boolean } {
  const sure = pityLeft(target, fails) === 0;
  return { rate: sure ? 1 : enhanceRate(target, amp), sure };
}

/** sg = 세트 장비 번호 · shop = 묶음 상점 장비 (한 개를 떼어 강화한다) · piece = 이미 강화한 상점 장비 한 개 */
export type EnhTarget = { sg: number } | { shop: string } | { piece: number };

export type EnhanceResult = {
  ok: boolean;
  name: string;
  from: number;
  to: number;
  /** 이번 시도의 성공 확률 (천장이면 1) */
  rate: number;
  /** 11/20 쓴 강화 증폭권 장수 (안 썼으면 0) */
  amp: number;
  /** 11/20 천장이라 반드시 성공했다 */
  sure: boolean;
  /** 11/20 이 시도 뒤 연속 실패 수 (성공하면 0) · 다음 강화의 천장까지 남은 실패 (0 = 다음은 반드시 성공, 끝까지 올렸으면 0) */
  fails: number;
  pityLeft: number;
  /** 처음으로 +15에 닿았다 (칭호) */
  reached15: boolean;
  /** 이 장비가 처음 +15가 됐다 (확성기 알림 — 장비마다 한 번) */
  announce: boolean;
  /** 상점 장비: 강화한 한 개의 번호 (묶음에서 떼어 냈으면 새 번호 — 창이 이 번호로 이어서 강화한다) */
  piece?: number;
};

const mats = (s: CharacterState): Mats => ({
  doc: 0,
  seal: 0,
  prot: 0,
  ...s.mats,
});
const clone = (s: CharacterState): CharacterState => structuredClone(s);

function findSg(s: CharacterState, uid: number): { i: number; it: SgItem } {
  const list = s.sg ?? [];
  const i = list.findIndex((c) => sgUid(c) === uid);
  const it = i >= 0 ? decodeSg(list[i]) : null;
  if (!it) throw new RpgError(404, "NOT_OWNED", "가방에 그 장비가 없어요.");
  return { i, it };
}

const equippedUids = (s: CharacterState) => new Set(Object.values(s.equip).flatMap((id) => (isSgCode(id) ? [sgUid(id)] : [])));

/** 장착 칸·4세트 기록을 원본에 맞춘다 */
function settle(next: CharacterState): CharacterState {
  next.equip = syncEquip(next.equip, next.sg ?? [], next.si ?? []);
  let bits = next.sgDone ?? 0;
  for (const set of activeSets(next.equip).four) bits |= 1 << SG_SETS.indexOf(set);
  next.sgDone = bits;
  return next;
}

/**
 * 다음 강화 비용 (상점 장비는 +SHOP_ENH_MAX까지, 세트 장비는 +15까지 — 끝이면 null).
 * discount = 11/24 회장님 독대 노멀 1위·2관왕 강화 포인트 할인 (lib/chairPerks chairEnhanceDiscount — 포인트만, 재료는 그대로. 1P 단위 내림 discountedPrice)
 */
export function enhanceNeed(t: EnhTarget, e: number, discount = 0): { target: number; cost: number; doc: number; seal: number } | null {
  const max = "sg" in t ? SG_ENH_MAX : SHOP_ENH_MAX;
  if (e >= max) return null;
  const row = ENHANCE_TABLE[e + 1];
  return { target: e + 1, cost: discountedPrice(row.cost, discount), doc: row.doc, seal: row.seal };
}

/** 강화 대상의 지금 강화·연속 실패·이름 */
export function enhanceState(s: CharacterState, t: EnhTarget): { e: number; f: number; name: string } {
  if ("sg" in t) {
    const { it } = findSg(s, t.sg);
    return { e: it.e, f: it.f, name: sgName(it) };
  }
  if ("piece" in t) {
    const p = findPiece(s, t.piece).p;
    return { e: p.e, f: p.f, name: gearById(p.id)!.name };
  }
  if (!isShopGear(t.shop) || !(s.inv[t.shop] ?? 0)) throw new RpgError(404, "NOT_OWNED", "가방에 그 장비가 없어요.");
  return { e: 0, f: 0, name: gearById(t.shop)!.name };
}

function findPiece(s: CharacterState, uid: number): { i: number; p: ShopPiece } {
  const list = s.si ?? [];
  const i = list.findIndex((c) => shopPieceOf(c)?.u === uid);
  const p = i >= 0 ? shopPieceOf(list[i]) : null;
  if (!p) throw new RpgError(404, "NOT_OWNED", "가방에 그 장비가 없어요.");
  return { i, p };
}

/**
 * 강화 한 번 (11/20 개편). amp = 강화 증폭권 쓰기 (목표 단계 장수만큼, 성공 확률 2배·최대 100%).
 * 천장(같은 단계 연속 실패 ENH_PITY번)이면 반드시 성공. 실패하면 단계는 그대로, 연속 실패 +1. 깨지거나 내려가는 일은 없다.
 * 확률·장수는 모두 서버 표에서만 (요청에는 쓸지 말지만 온다). 포인트(cost)는 돌려주는 값으로 서비스가 같은 저장 명령에서 뺀다
 */
export function enhance(s: CharacterState, t: EnhTarget, amp: boolean, rnd: () => number, discount = 0): { state: CharacterState; cost: number; result: EnhanceResult } {
  const cur = enhanceState(s, t);
  const need = enhanceNeed(t, cur.e, discount);
  if (!need) throw new RpgError(409, "ENH_MAX", "sg" in t ? "이미 +15예요. 더는 못 올려요." : `상점 장비는 +${SHOP_ENH_MAX}까지만 올릴 수 있어요.`);
  const m = mats(s);
  if (m.doc < need.doc) throw new RpgError(409, "NO_MATS", `결재 서류가 ${need.doc - m.doc}장 모자라요.`);
  if (m.seal < need.seal) throw new RpgError(409, "NO_MATS", `인감 도장이 ${need.seal - m.seal}개 모자라요.`);
  if (amp && !ampNeed(need.target)) throw new RpgError(409, "NO_AMP", `+${need.target} 강화에는 증폭권을 쓸 수 없어요.`);
  // 천장이라 반드시 성공이면 증폭권은 쓰지 않는다 (체크해도 그대로 남는다)
  const sureNow = pityLeft(need.target, cur.f) === 0;
  const ampN = amp && !sureNow ? ampNeed(need.target) : 0;
  if (m.prot < ampN) throw new RpgError(409, "NO_MATS", `강화 증폭권이 ${ampN - m.prot}장 모자라요.`);
  const { rate, sure } = enhanceChance(need.target, cur.f, ampN > 0);
  const ok = sure || rnd() < rate;
  const e = ok ? need.target : cur.e;
  const f = ok ? 0 : Math.min(ENH_FAIL_MAX, cur.f + 1);
  const next = clone(s);
  next.mats = {
    doc: m.doc - need.doc,
    seal: m.seal - need.seal,
    prot: m.prot - ampN,
  };
  let piece: number | undefined;
  if ("sg" in t) {
    const { i, it } = findSg(s, t.sg);
    next.sg![i] = encodeSg({ ...it, e, f });
  } else if ("piece" in t) {
    const { i, p } = findPiece(s, t.piece);
    const code = encodeShopPiece({ ...p, e, f });
    const old = next.si![i];
    next.si![i] = code;
    for (const k of Object.keys(next.equip) as GearSlot[]) if (next.equip[k] === old) next.equip[k] = code;
    piece = p.u;
  } else {
    // 묶음에서 한 개를 떼어 낸다 (같은 장비를 낀 칸이 있으면 그 칸의 것을 — 첫 칸 하나만)
    piece = next.sgN ?? 1;
    next.sgN = piece + 1;
    const code = encodeShopPiece({ id: t.shop, e: Math.max(1, e), u: piece, f });
    next.si = [...(next.si ?? []), code];
    if (next.inv[t.shop] <= 1) delete next.inv[t.shop];
    else next.inv[t.shop] -= 1;
    const slot = (Object.keys(next.equip) as GearSlot[]).find((k) => next.equip[k] === t.shop);
    if (slot) next.equip[slot] = code;
  }
  const reached15 = e >= SG_ENH_MAX && (s.enhMax ?? 0) < SG_ENH_MAX;
  next.enhMax = Math.max(s.enhMax ?? 0, e);
  const announce = "sg" in t && e >= SG_ENH_MAX && !(s.sg15 ?? []).includes(t.sg);
  if (announce) next.sg15 = [...(s.sg15 ?? []), (t as { sg: number }).sg].slice(-SG_INV_MAX);
  return {
    state: settle(next),
    cost: need.cost,
    result: {
      ok,
      name: cur.name,
      from: cur.e,
      to: e,
      rate,
      amp: ampN,
      sure,
      fails: f,
      pityLeft: enhanceNeed(t, e) ? pityLeft(e + 1, f) : 0,
      reached15,
      announce,
      ...(piece !== undefined ? { piece } : {}),
    },
  };
}

// ── 강화 승계 ──
// 11/19 사용자 「강화 승계도 넣자, 대신 위로 갈수록 수치가 존나 줄어들게」 → 「같은 부위 아이템만, 높은 직급으로만」:
// 강화한 장비(재료)를 없애고 같은 부위의 더 높은 직급 세트 장비에 강화를 옮긴다. 상점 장비는 사원급보다 아래 직급으로 친다.
// 받는 단계 = 받은 뒤 기본 능력치(직급 배율 × 강화 배율)가 재료의 기본 능력치 이상이 되는 가장 낮은 단계 → 승계 결과는 늘 재료보다 세고,
// 직급 차이가 클수록 단계는 크게 준다 (사원 +15 = 3.0 → 대리 +10 · 과장 +6 · 임원 +3). 연속 실패 수는 0부터.

/** 상점 장비를 승계에서 볼 때의 직급 배율 (사원급 1.0보다 아래 — 직급 비교에서 -1) */
export const SHOP_INHERIT_MULT = 0.8;
/** 승계 직급 (-1 = 상점 장비, 0~3 = 사원~임원) */
export type InheritGrade = -1 | SgGrade;

/** 세트 장비 기본 능력치 (직급 배율 × 강화, 랜덤 옵션 빼고) */
const sgBaseAt = (it: Pick<SgItem, "s" | "p" | "g">, e: number): Bonus => enhBonus(scaleBonus(sgBaseBonus(SG_SETS[it.s], SG_PIECES[it.p]), SG_GRADE_MULT[it.g]), e);
/** 승계에서 비교하는 기본 능력치 (늘리는 값만 — 깎는 값·없는 값은 빼고) */
const ups = (b: Bonus): [keyof Bonus, number][] => (Object.entries(b) as [keyof Bonus, number][]).filter(([, v]) => v > 0);

/**
 * 11/19 사용자 「직급 차이의 아이템 능력치는 최소한 유지는 시켜줘야 함」: 받는 장비(tgt)를 몇 강까지 올려야 재료의 기본 능력치(src)를
 * 하나도 빠짐없이 넘는지 — 둘 다 가진 능력치마다 받은 뒤 값 ≥ 재료 값인 가장 낮은 단계 (반올림으로 한 칸이라도 떨어지면 한 단계 더).
 * 겹치는 능력치가 없으면 직급 배율 × 강화 배율로 비교한다. +15로도 못 넘으면 null
 */
export function inheritStep(src: Bonus, srcMul: number, tgt: Pick<SgItem, "s" | "p" | "g">): number | null {
  const base = sgBaseAt(tgt, 0);
  const keys = ups(src).filter(([k]) => (base[k] ?? 0) > 0);
  for (let m = 0; m <= SG_ENH_MAX; m++) {
    const b = sgBaseAt(tgt, m);
    if (keys.length ? keys.every(([k, v]) => (b[k] ?? 0) >= v) : SG_GRADE_MULT[tgt.g] * enhMul(m) >= srcMul - 1e-9) return m;
  }
  return null;
}
/** 표·안내용: 같은 부위(갑옷 기준) 세트 장비 직급 from +e → 직급 to에서 받는 단계 (못 옮기면 0) */
export function inheritTo(from: SgGrade, e: number, to: SgGrade, piece = 1): number {
  if (to <= from) return 0;
  const src = { s: 0, p: piece, g: from };
  return inheritStep(sgBaseAt(src, e), SG_GRADE_MULT[from] * enhMul(e), { s: 0, p: piece, g: to }) ?? 0;
}
/** 승계 비용: 받는 강화 m까지 한 번에 성공했을 때의 포인트 합 · 결재 서류 m장 */
export function inheritNeed(m: number): { cost: number; doc: number } {
  let cost = 0;
  for (let i = 1; i <= m; i++) cost += ENHANCE_TABLE[i].cost;
  return { cost, doc: m };
}
/** 재료로 쓸 수 있는 장비 (상점 묶음 장비는 강화가 없어 안 된다) */
export type InheritFrom = { sg: number } | { piece: number };

export type InheritResult = {
  /** 받은 장비 이름 · 재료 이름 */
  name: string;
  srcName: string;
  /** 재료 강화 · 받는 장비의 원래 강화 · 받은 뒤 강화 */
  src: number;
  from: number;
  to: number;
  /** 상점 장비: 받은 한 개의 번호 (묶음에서 떼어 냈으면 새 번호) */
  piece?: number;
};

/** 장비의 부위 (무기·갑옷·머리·장신구) */
function kindOf(s: CharacterState, t: EnhTarget): string {
  if ("sg" in t) return SG_PIECE_KIND[sgPieceOf(findSg(s, t.sg).it)];
  if ("piece" in t) return gearById(findPiece(s, t.piece).p.id)!.kind;
  return gearById(t.shop)?.kind ?? "";
}
const sameItem = (a: EnhTarget, b: EnhTarget) => ("sg" in a && "sg" in b && a.sg === b.sg) || ("piece" in a && "piece" in b && a.piece === b.piece);
const gradeOf = (s: CharacterState, t: EnhTarget): InheritGrade => ("sg" in t ? findSg(s, t.sg).it.g : -1);
/** 재료의 기본 능력치와 비교 배율 */
function srcBase(s: CharacterState, t: InheritFrom): { bonus: Bonus; mul: number } {
  if ("sg" in t) {
    const it = findSg(s, t.sg).it;
    return { bonus: sgDef(it).bonus, mul: SG_GRADE_MULT[it.g] * enhMul(it.e) };
  }
  const p = findPiece(s, t.piece).p;
  return { bonus: enhBonus(gearById(p.id)?.bonus ?? {}, p.e), mul: SHOP_INHERIT_MULT * enhMul(p.e) };
}
/** 미리보기 비교 줄: [능력치, 재료 값, 승계 뒤 값] (늘리는 기본 능력치만, 둘 중 하나라도 가진 것) */
export type InheritLine = [keyof Bonus, number, number];

/** 승계 미리보기 (못 하면 이유) — 화면과 서버가 같이 쓴다. 받는 장비는 같은 부위의 더 높은 직급 세트 장비만 */
export function inheritPlan(
  s: CharacterState,
  from: InheritFrom,
  to: EnhTarget,
): { ok: true; src: number; cur: number; m: number; cost: number; doc: number; srcName: string; name: string; lines: InheritLine[] } | { ok: false; why: string } {
  if (sameItem(from, to)) return { ok: false, why: "같은 장비끼리는 옮길 수 없어요." };
  const a = enhanceState(s, from);
  const b = enhanceState(s, to);
  if (kindOf(s, from) !== kindOf(s, to)) return { ok: false, why: "같은 부위끼리만 옮길 수 있어요." };
  if (!("sg" in to)) return { ok: false, why: "더 높은 직급의 세트 장비로만 옮길 수 있어요." };
  const tgt = findSg(s, to.sg).it;
  if (tgt.g <= gradeOf(s, from)) return { ok: false, why: "더 높은 직급의 장비로만 옮길 수 있어요." };
  const sb = srcBase(s, from);
  const m = inheritStep(sb.bonus, sb.mul, tgt);
  if (m === null) return { ok: false, why: "옮기면 능력치가 떨어져서 옮길 수 없어요." };
  if (m < 1) return { ok: false, why: "옮길 강화가 없어요." };
  if (b.e >= m) return { ok: false, why: `받을 장비가 이미 +${b.e}라 옮길 게 없어요.` };
  const after = sgBaseAt(tgt, m);
  const keys = [...new Set([...ups(sb.bonus), ...ups(after)].map(([k]) => k))];
  const lines: InheritLine[] = keys.map((k) => [k, Math.max(0, sb.bonus[k] ?? 0), Math.max(0, after[k] ?? 0)]);
  return { ok: true, src: a.e, cur: b.e, m, ...inheritNeed(m), srcName: a.name, name: b.name, lines };
}

/**
 * 승계 한 번: 재료 장비를 없애고 받는 장비를 +m으로. 재료를 끼고 있었으면 그 칸에 받은 장비를 대신 낀다 (못 끼면 칸을 비운다).
 * 포인트(cost)는 돌려주는 값으로 서비스가 같은 저장 명령에서 뺀다
 */
export function inherit(s: CharacterState, from: InheritFrom, to: EnhTarget): { state: CharacterState; cost: number; result: InheritResult } {
  const plan = inheritPlan(s, from, to);
  if (!plan.ok) throw new RpgError(409, "CANT_INHERIT", plan.why);
  const m = mats(s);
  if (m.doc < plan.doc) throw new RpgError(409, "NO_MATS", `결재 서류가 ${plan.doc - m.doc}장 모자라요.`);
  const next = clone(s);
  next.mats = { ...m, doc: m.doc - plan.doc };
  // 재료 빼기 (끼고 있던 칸은 기억해 둔다)
  const srcCode = "sg" in from ? (s.sg ?? [])[findSg(s, from.sg).i] : (s.si ?? [])[findPiece(s, from.piece).i];
  const srcSlots = (Object.keys(next.equip) as GearSlot[]).filter((k) => next.equip[k] === srcCode);
  for (const k of srcSlots) next.equip[k] = null;
  if ("sg" in from) next.sg = (next.sg ?? []).filter((c) => sgUid(c) !== from.sg);
  else next.si = (next.si ?? []).filter((c) => shopPieceOf(c)?.u !== from.piece);
  // 받는 장비 올리기
  let uid: number;
  let piece: number | undefined;
  if ("sg" in to) {
    const i = (next.sg ?? []).findIndex((c) => sgUid(c) === to.sg);
    const it = decodeSg(next.sg![i])!;
    const old = next.sg![i];
    const code = encodeSg({ ...it, e: plan.m, f: 0 });
    next.sg![i] = code;
    for (const k of Object.keys(next.equip) as GearSlot[]) if (next.equip[k] === old) next.equip[k] = code;
    uid = to.sg;
  } else if ("piece" in to) {
    const i = (next.si ?? []).findIndex((c) => shopPieceOf(c)?.u === to.piece);
    const p = shopPieceOf(next.si![i])!;
    const old = next.si![i];
    const code = encodeShopPiece({ ...p, e: plan.m, f: 0 });
    next.si![i] = code;
    for (const k of Object.keys(next.equip) as GearSlot[]) if (next.equip[k] === old) next.equip[k] = code;
    uid = piece = to.piece;
  } else {
    // 묶음에서 한 개를 떼어 낸다 (강화와 같다)
    uid = piece = next.sgN ?? 1;
    next.sgN = piece + 1;
    const code = encodeShopPiece({ id: to.shop, e: plan.m, u: piece, f: 0 });
    next.si = [...(next.si ?? []), code];
    if (next.inv[to.shop] <= 1) delete next.inv[to.shop];
    else next.inv[to.shop] -= 1;
    const slot = (Object.keys(next.equip) as GearSlot[]).find((k) => next.equip[k] === to.shop);
    if (slot) next.equip[slot] = code;
  }
  next.enhMax = Math.max(s.enhMax ?? 0, plan.m);
  let out = settle(next);
  // 재료를 끼고 있던 칸에 받은 장비를 대신 낀다 (이미 다른 칸에 끼고 있거나 레벨이 모자라면 비워 둔다)
  const worn = Object.values(out.equip).some((id) => pieceUid(id) === uid);
  if (srcSlots[0] && !worn) {
    try {
      out = equipSg(out, srcSlots[0], uid);
    } catch {
      // 칸은 비운 채로
    }
  }
  return {
    state: out,
    cost: plan.cost,
    result: { name: plan.name, srcName: plan.srcName, src: plan.src, from: plan.cur, to: plan.m, ...(piece !== undefined ? { piece } : {}) },
  };
}

// ── 옵션 다시 굴리기 ──

export const REROLL_BASE = 150;
export const REROLL_MAX = 2400;
export const REROLL_DOCS = 3;
export const REROLL_LOCK_SEALS = 2;
/** n번째 굴리기 비용 (0부터): 150 → 300 → 600 → 1,200 → 2,400 (상한, 다시 내려가지 않는다) */
export const rerollCost = (rr: number) => Math.min(REROLL_MAX, REROLL_BASE * 2 ** Math.min(10, rr));

/** lock: 그대로 둘 옵션 하나 (옵션 id, 전설 옵션은 "L"). 고정하면 인감 도장 2개 더 */
export function reroll(
  s: CharacterState,
  uid: number,
  lock: SgOpt | "L" | null,
  rnd: () => number,
): { state: CharacterState; cost: number; result: { code: string } } {
  const { i, it } = findSg(s, uid);
  const m = mats(s);
  const seals = lock ? REROLL_LOCK_SEALS : 0;
  if (m.doc < REROLL_DOCS) throw new RpgError(409, "NO_MATS", `결재 서류가 ${REROLL_DOCS - m.doc}장 모자라요.`);
  if (m.seal < seals) throw new RpgError(409, "NO_MATS", `인감 도장이 ${seals - m.seal}개 모자라요.`);
  if (lock === "L" && !it.L) throw new RpgError(400, "INVALID_INPUT", "고정할 전설 옵션이 없어요.");
  const keep = lock && lock !== "L" ? it.o.filter(([k]) => k === lock) : [];
  if (lock && lock !== "L" && !keep.length) throw new RpgError(400, "INVALID_INPUT", "그 옵션은 이 장비에 없어요.");
  const rolled = rollOptions(rnd, sgPieceOf(it), it.g, keep, lock === "L" ? it.L : 0);
  const next = clone(s);
  const code = encodeSg({
    ...it,
    o: rolled.o,
    L: rolled.L,
    rr: Math.min(999, it.rr + 1),
  });
  next.sg![i] = code;
  next.mats = { ...m, doc: m.doc - REROLL_DOCS, seal: m.seal - seals };
  return { state: settle(next), cost: rerollCost(it.rr), result: { code } };
}

// ── 바꾸기·분해 ──

/** 같은 직급 몇 개를 내면 원하는 세트·부위 하나로 바꿔 주나 (무기는 5개) */
export const exchangeNeed = (piece: number) => (SG_PIECES[piece] === "weapon" ? 5 : 3);
/** 분해하면 받는 재료 (직급별) */
export const DISASSEMBLE: readonly { doc: number; seal: number }[] = [
  { doc: 10, seal: 0 },
  { doc: 20, seal: 0 },
  { doc: 30, seal: 1 },
  { doc: 40, seal: 3 },
];

function takeItems(s: CharacterState, uids: readonly number[]): { rest: string[]; items: SgItem[] } {
  if (new Set(uids).size !== uids.length) throw new RpgError(400, "INVALID_INPUT", "같은 장비를 두 번 골랐어요.");
  const worn = equippedUids(s);
  const items: SgItem[] = [];
  for (const u of uids) {
    if (worn.has(u)) throw new RpgError(409, "EQUIPPED", "장착 중인 장비는 먼저 빼 주세요.");
    items.push(findSg(s, u).it);
  }
  const take = new Set(uids);
  return { rest: (s.sg ?? []).filter((c) => !take.has(sgUid(c) ?? -1)), items };
}

export function exchange(
  s: CharacterState,
  uids: readonly number[],
  set: number,
  piece: number,
  rnd: () => number,
): { state: CharacterState; result: { code: string } } {
  if (!SG_SETS[set] || !SG_PIECES[piece]) throw new RpgError(400, "INVALID_INPUT", "받을 세트와 부위를 골라 주세요.");
  const need = exchangeNeed(piece);
  if (uids.length !== need) throw new RpgError(400, "INVALID_INPUT", `${SG_PIECES[piece] === "weapon" ? "무기는" : "이 부위는"} 같은 직급 ${need}개로 바꿔요.`);
  const { rest, items } = takeItems(s, uids);
  const g = items[0].g as SgGrade;
  if (items.some((it) => it.g !== g)) throw new RpgError(400, "INVALID_INPUT", "같은 직급끼리만 바꿀 수 있어요.");
  const next = clone(s);
  const u = next.sgN ?? 1;
  const code = encodeSg({
    ...rollSgFixed(rnd, set, piece, g),
    u,
    e: 0,
    rr: 0,
    f: 0,
  });
  next.sg = [...rest, code];
  next.sgN = u + 1;
  return { state: settle(next), result: { code } };
}

export function disassemble(s: CharacterState, uids: readonly number[]): { state: CharacterState; result: { doc: number; seal: number } } {
  if (!uids.length) throw new RpgError(400, "INVALID_INPUT", "분해할 장비를 골라 주세요.");
  const { rest, items } = takeItems(s, uids);
  const got = items.reduce(
    (a, it) => ({
      doc: a.doc + DISASSEMBLE[it.g].doc,
      seal: a.seal + DISASSEMBLE[it.g].seal,
    }),
    { doc: 0, seal: 0 },
  );
  const next = clone(s);
  const m = mats(s);
  next.sg = rest;
  next.mats = {
    ...m,
    doc: Math.min(MAT_MAX, m.doc + got.doc),
    seal: Math.min(MAT_MAX, m.seal + got.seal),
  };
  return { state: settle(next), result: got };
}

// ── 판매 (11/27 운영자 「야근 빌딩 드롭템 팔 수 있게」) ──

/**
 * 세트 장비 판매 비율: 그 부위 상점 최고 장비 값(setGearRoll TOP_SHOP) × 이 비율 × 직급 배율(SG_GRADE_MULT).
 * 주운 상점 장비 비율(character DROP_SELL_RATE)과 따로 둔다 — 이 값 하나만 바꿔 따로 조정한다. 11/27 운영자 7% (무기 140·210·280·350P, 갑옷·장신구 119·178·238·297P, 머리 91·136·182·227P)
 */
export const SG_SELL_RATE = 0.07;
/** 세트 장비 하나 판매 값 (포인트). 강화·옵션·전설 옵션은 값에 들어가지 않는다 — 서버가 저장된 물건으로 계산한다 */
export function sgSellValue(it: Pick<SgItem, "p" | "g">): number {
  const base = gearById(TOP_SHOP[SG_PIECES[it.p]])?.price ?? 0;
  // 비율·배율 곱이 119.00000000000001 같은 부동소수로 떨어져도 한 칸 내려가지 않게
  return Math.floor(base * SG_SELL_RATE * SG_GRADE_MULT[it.g as SgGrade] + 1e-6);
}

/**
 * 세트 장비 여러 개 판매: 가방에서 한 번에 뺀다 (분해와 같은 검사 — 장착 중·없는 번호·같은 번호 두 번이면 하나도 안 뺀다).
 * 돌려주는 sold = 뺀 물건마다 [코드, 값] (고른 순서 그대로 — 포인트가 모자라 못 받은 만큼 되돌릴 때 쓴다)
 */
export function sellSg(s: CharacterState, uids: readonly number[]): { state: CharacterState; result: { sold: [string, number][]; value: number } } {
  if (!uids.length) throw new RpgError(400, "INVALID_INPUT", "팔 장비를 골라 주세요.");
  const { rest, items } = takeItems(s, uids);
  const sold = items.map((it): [string, number] => [encodeSg(it), sgSellValue(it)]);
  const next = clone(s);
  next.sg = rest;
  return { state: settle(next), result: { sold, value: sold.reduce((a, [, v]) => a + v, 0) } };
}

/**
 * 판매 값을 다 못 받았을 때 (지갑 상한): 고른 순서대로 받은 값(paid)으로 덮은 만큼은 판 것, 한 푼도 못 받은 물건은 가방에 되돌릴 코드.
 * 일부만 받은 한 개는 판 것으로 친다 (상점 되팔기 returnUnsold와 같은 규칙)
 */
export function sgUnsold(sold: readonly [string, number][], paid: number): string[] {
  const back: string[] = [];
  let acc = 0;
  for (const [code, v] of sold) {
    if (acc >= paid && v > 0) back.push(code);
    acc += v;
  }
  return back;
}
/** 되돌릴 세트 장비 코드를 가방에 다시 넣는다 (번호는 그대로 — 방금 뺀 것이라 겹치지 않는다) */
export function returnSg(s: CharacterState, codes: readonly string[]): CharacterState {
  if (!codes.length) return s;
  const have = new Set((s.sg ?? []).map((c) => sgUid(c)));
  const next = clone(s);
  next.sg = [...(next.sg ?? []), ...codes.filter((c) => !have.has(sgUid(c)))];
  return settle(next);
}

// ── 끼기 ──

/** 세트 장비 끼기 (uid null이면 그 칸 비우기). 다른 칸에 낀 같은 장비는 옮긴다. level = 요구 레벨 검사 레벨 */
export function equipSg(s: CharacterState, slot: GearSlot, uid: number | null, level = s.level): CharacterState {
  const next = clone(s);
  if (uid === null) {
    next.equip[slot] = null;
    return settle(next);
  }
  // 11/15 강화한 상점 장비 한 개 (번호는 세트 장비와 같은 줄)
  const pc = (s.si ?? []).find((c) => shopPieceOf(c)?.u === uid);
  if (pc) {
    const g = gearById(pc)!;
    if (g.kind !== (slot === "acc1" || slot === "acc2" ? "acc" : slot)) throw new RpgError(400, "WRONG_SLOT", "그 칸에는 낄 수 없는 장비예요.");
    if (level < g.reqLevel) throw new RpgError(409, "LEVEL_LOW", `레벨 ${g.reqLevel}부터 낄 수 있어요.`);
    for (const k of Object.keys(next.equip) as GearSlot[]) if (k !== slot && next.equip[k] === pc) next.equip[k] = null;
    next.equip[slot] = pc;
    return settle(next);
  }
  const { i, it } = findSg(s, uid);
  const kind = SG_PIECE_KIND[sgPieceOf(it)];
  if (kind !== (slot === "acc1" || slot === "acc2" ? "acc" : slot)) throw new RpgError(400, "WRONG_SLOT", "그 칸에는 낄 수 없는 장비예요.");
  if (level < SG_REQ_LEVEL) throw new RpgError(409, "LEVEL_LOW", `레벨 ${SG_REQ_LEVEL}부터 낄 수 있어요.`);
  for (const k of Object.keys(next.equip) as GearSlot[]) if (k !== slot && isSgCode(next.equip[k]) && sgUid(next.equip[k]!) === uid) next.equip[k] = null;
  next.equip[slot] = (s.sg ?? [])[i];
  return settle(next);
}

// ── 상자 드롭 넣기 ──

/**
 * 판 끝: 세트 장비(새 번호)·재료를 캐릭터에 넣는다. 세트 장비 가방이 가득 차면 그 자리에서 분해해 재료로 준다 (버리지 않는다).
 * 돌려주는 drops = 실제로 받은 것 (분해한 것은 재료 줄로 바뀐다)
 */
export function grantSgDrops(s: CharacterState, drops: readonly Drop[]): { state: CharacterState; drops: Drop[] } {
  if (!drops.some((d) => d.kind === "set" || d.kind === "mat")) return { state: s, drops: [...drops] };
  const next = clone(s);
  const m = mats(next);
  next.sg = [...(next.sg ?? [])];
  let u = next.sgN ?? 1;
  const out: Drop[] = [];
  const addMat = (k: keyof Mats, n: number) => (m[k] = Math.min(MAT_MAX, m[k] + n));
  for (const d of drops) {
    if (d.kind === "mat") {
      if (isMatId(d.id) && d.qty > 0) {
        addMat(MAT_KEY[d.id], d.qty);
        out.push(d);
      }
      continue;
    }
    if (d.kind !== "set") {
      out.push(d);
      continue;
    }
    const it = itemOfSpec(d.id, u);
    if (!it) continue;
    if (next.sg.length >= SG_INV_MAX) {
      const got = DISASSEMBLE[it.g];
      addMat("doc", got.doc);
      out.push({ kind: "mat", id: "m_doc", qty: got.doc });
      if (got.seal) {
        addMat("seal", got.seal);
        out.push({ kind: "mat", id: "m_seal", qty: got.seal });
      }
      continue;
    }
    next.sg.push(encodeSg(it));
    u++;
    out.push(d);
  }
  next.sgN = u;
  next.mats = m;
  return { state: next, drops: out };
}
