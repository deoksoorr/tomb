import {
  GEAR,
  gearById,
  GEAR_SLOTS,
  HOTBAR_SIZE,
  POTION_MAX_STACK,
  potionById,
  skillById,
  slotKind,
  STAT_KEYS,
  type GearSlot,
  type SkillId,
  type Stats,
} from "./catalog";
import { applyExp, baseStats, MAX_LEVEL, START_SKILL_POINTS, START_STAT_POINTS, STAT_MAX, statPointsAt } from "./formulas";
import { applyTranscend, TBANK_MAX, TRANSCEND_MAX, transcendStatPoints } from "./endgame";
import { TOWER_FLOORS_PER_RUN } from "./tower";
import { checkAllocation, checkLearn, cleanAlloc, FREE_RESET_GRANT, SKILL_TREE_VERSION, skillPointsEarned, spentPoints, type Alloc } from "./skillRules";
import { arrangeHotbar, cleanAuto, emptySlotFor, type HotAuto } from "./hotbar";
import { checkTAllocation, checkTLearn, cleanTAlloc, type TAlloc, type TNodeId } from "./transcendTree";
import type { CharacterState } from "./types";
import { encodeShopPiece, MAT_MAX, normalizeSg, SG_EGG_ALL, SG_INV_MAX, sgUid, shopEnhOf, SHOP_ENH_MAX, shopPieceOf, syncEquip } from "./setGear";

// 캐릭터 상태를 바꾸는 순수 함수들. 저장소(메모리·Redis)는 이 함수를 원자적 갱신(CAS) 안에서 부른다.
// 규칙을 어기면 RpgError를 던지고, 라우트가 그대로 한국어 에러로 돌려준다.

export class RpgError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 가방에 둘 수 있는 장비 수 (장착 중 포함) */
export const GEAR_INV_MAX = 40;
/** 되팔 때 받는 비율 (상점에서 산 장비 환불 · 물약) */
export const SELL_RATE = 0.5;
/** 11/20 사용자: 사냥 포인트가 너무 풀려서 사냥에서 주운 장비 되팔기는 상점 값의 25% (산 장비 환불·물약은 50% 그대로) */
export const DROP_SELL_RATE = 0.25;

export function newCharacter(): CharacterState {
  return {
    level: 1,
    exp: 0,
    statPoints: START_STAT_POINTS,
    skillPoints: START_SKILL_POINTS,
    stats: baseStats(),
    skills: {},
    hotbar: new Array(HOTBAR_SIZE).fill(null),
    inv: { w_ruler: 1, a_hoodie: 1 },
    bought: {},
    equip: { weapon: "w_ruler", armor: "a_hoodie", head: null, acc1: null, acc2: null },
    potions: { p_coffee: 3 },
    runs: 0,
    treeVer: SKILL_TREE_VERSION,
    respecs: 0,
    statResets: 0,
    // 11/21 무료 초기화: 패치 뒤에 만든 캐릭터는 받지 않는다 (이미 받은 것으로 시작)
    freeRespec: 0,
    freeStatReset: 0,
    freeGrant: FREE_RESET_GRANT,
    tLevel: 0,
    tExp: 0,
    tRuns: 0,
    tBank: 0,
    tFl: 0,
    tChest: 0,
    fBest: 0,
    fBestMs: 0,
    fWkBest: 0,
    fWkMs: 0,
  };
}

/** 0 이상 정수 (상한까지). 아니면 0 — 11/15 끝판 칸을 옛 저장값·깨진 값에서 읽을 때 */
const nat = (v: unknown, max = Number.MAX_SAFE_INTEGER) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? Math.min(v, max) : 0);

/** 남은 스킬 포인트 = 레벨로 받은 포인트 - 쓴 포인트 (저장된 값은 믿지 않고 늘 다시 센다 → 포인트 합이 어긋날 수 없다) */
const freePoints = (level: number, skills: Alloc, tLevel = 0) => Math.max(0, skillPointsEarned(level, tLevel) - spentPoints(skills));

/** 단축키: 배운 액티브만, 겹치지 않게. 11/15 궁극기는 궁극기 칸(F)으로, 나머지는 1~5 (옛 6칸 저장값도 여기서 옮긴다) */
function cleanHotbar(hotbar: unknown, skills: Alloc): (SkillId | null)[] {
  return arrangeHotbar(Array.isArray(hotbar) ? hotbar : [], (id) => !!(skills[id] ?? 0));
}

/** 11/19 초월 수련 배분 읽기 (없거나 규칙에 안 맞으면 빈 배분) */
function normTSkills(raw: unknown, t: number): TAlloc {
  if (!raw || typeof raw !== "object") return {};
  return checkTAllocation(raw as Record<string, unknown>, t) ? {} : cleanTAlloc(raw as TAlloc);
}

/** 저장된 JSON을 지금 형태로 맞춘다 (필드가 늘어도 예전 기록이 깨지지 않게) */
export function normalize(raw: unknown): CharacterState {
  const base = newCharacter();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<CharacterState>;
  const level = Number.isInteger(r.level) && r.level! >= 1 ? r.level! : base.level;
  // 스킬 저장 형식이 옛것(1: 스킬 18종)이면 모두 비우고 레벨만큼의 포인트를 돌려준다 + 안내 1회.
  // 지금 형식이라도 모르는 스킬·단·선행이 어긋난 배분이면 같은 방식으로 돌려준다 (포인트 합은 서비스가 예산으로 본다)
  const old = r.treeVer !== SKILL_TREE_VERSION;
  let skills: Alloc = old ? {} : cleanAlloc(Object.fromEntries(Object.entries(r.skills ?? {}).filter(([id]) => skillById(id))) as Alloc);
  let notice = old ? r.level !== undefined : !!r.treeNotice;
  if (!old && checkAllocation(skills, Infinity)) {
    skills = {};
    notice = true;
  }
  // 11/15 테스트 서버에만 있던 번아웃 단계 칸(bTries·bBest)은 버린다
  const { treeNotice: _drop, bTries: _bt, bBest: _bb, ...rest } = r as Partial<CharacterState> & { bTries?: unknown; bBest?: unknown };
  void _drop;
  void _bt;
  void _bb;
  return {
    ...base,
    ...rest,
    level,
    stats: { ...base.stats, ...r.stats },
    skills,
    skillPoints: freePoints(level, skills, nat(r.tLevel, TRANSCEND_MAX)),
    // 11/19 초월 능력치가 5레벨마다 1 → 레벨마다 1: 이미 초월한 사람은 모자란 만큼 한 번 채운다 (줄이지는 않는다)
    statPoints: Math.max(
      Number.isInteger(r.statPoints) && r.statPoints! > 0 ? r.statPoints! : 0,
      statPointsEarned(level, nat(r.tLevel, TRANSCEND_MAX)) - STAT_KEYS.reduce((a, k) => a + Math.max(0, ({ ...base.stats, ...r.stats })[k] - base.stats[k]), 0),
    ),
    hotbar: old ? base.hotbar : cleanHotbar(r.hotbar, skills),
    // 11/15 자동 스킬 설정 (옛 저장값에는 없다 → 없음 = 모두 끔·궁극기 SP 남김)
    hotAuto: r.hotAuto ? cleanAuto(r.hotAuto, old ? base.hotbar : cleanHotbar(r.hotbar, skills)) : undefined,
    treeVer: SKILL_TREE_VERSION,
    respecs: Number.isInteger(r.respecs) && r.respecs! > 0 ? r.respecs! : 0,
    // 능력치 초기화 횟수: 옛 저장값에는 없다 → 0
    statResets: Number.isInteger(r.statResets) && r.statResets! > 0 ? r.statResets! : 0,
    // 11/21 무료 초기화: 아직 받지 않은 나눔 차례만큼 스킬·능력치 한 번씩 더한다 (저장될 때 freeGrant가 같이 적혀 두 번 받지 않는다)
    ...freeResets(r),
    ...(notice ? { treeNotice: true } : {}),
    bought: { ...r.bought },
    potions: { ...(r.potions ?? base.potions) },
    // 11/15 끝판: 옛 저장값에는 없다 → 0 (초월 능력치 포인트는 초월 레벨이 오를 때 한 번만 더한다 — gainTranscend)
    tLevel: nat(r.tLevel, TRANSCEND_MAX),
    // 11/19 초월 수련: 규칙에 안 맞는 배분(모르는 칸·줄·포인트 초과)은 비운다
    tSkills: normTSkills(r.tSkills, nat(r.tLevel, TRANSCEND_MAX)),
    tExp: nat(r.tExp),
    tRuns: nat(r.tRuns),
    tBank: nat(r.tBank, TBANK_MAX),
    // 11/15 야근 빌딩 (테스트 서버에만 있던 번아웃 단계 칸 bTries·bBest는 읽지 않는다)
    tFl: nat(r.tFl, TOWER_FLOORS_PER_RUN - 1),
    tChest: nat(r.tChest),
    fBest: nat(r.fBest),
    fBestMs: nat(r.fBestMs),
    fWkBest: nat(r.fWkBest),
    fWkMs: nat(r.fWkMs),
    ...(nat(r.fSus) > 0 ? { fSus: nat(r.fSus) } : { fSus: undefined }),
    ...(typeof r.fWk === "string" && /^\d{8}$/.test(r.fWk) ? { fWk: r.fWk } : { fWk: undefined }),
    ...(typeof r.tDay === "string" && /^\d{8}$/.test(r.tDay) ? { tDay: r.tDay } : { tDay: undefined }),
    ...(r.pioneer && nat(r.pioneer.n) > 0 && Number.isFinite(r.pioneer.at) ? { pioneer: { n: r.pioneer.n, at: r.pioneer.at } } : { pioneer: undefined }),
    // 11/15 세트 장비·재료·강화 (옛 저장값에는 없다 → 빈 가방·0). 장착 칸은 가방·강화 원본에 다시 맞춘다
    ...normSg(r, { ...base.equip, ...(r.equip ?? {}) }, r.inv ?? base.inv),
  };
}

/** 11/15 세트 장비 칸 정리 + 장착 칸 맞추기 (lib/rpg/setGear syncEquip) */
function normSg(r: Partial<CharacterState>, equip0: CharacterState["equip"], inv0: Record<string, number>) {
  const norm = normalizeSg(r.sg, r.sgN);
  const sg = norm.sg;
  let sgN = norm.sgN;
  // 11/15 강화한 상점 장비 한 개씩 (si). 번호가 세트 장비와 겹치거나 형식이 틀리면 버린다
  const used = new Set(sg.map((c) => sgUid(c)));
  const si: string[] = [];
  for (const c of Array.isArray(r.si) ? r.si : []) {
    const p = typeof c === "string" ? shopPieceOf(c) : null;
    if (!p || !isShopGear(p.id) || used.has(p.u)) continue;
    used.add(p.u);
    sgN = Math.max(sgN, p.u + 1);
    si.push(encodeShopPiece(p));
  }
  // 예전 저장값: 장비 id마다 붙던 강화(enh)를 그 장비 한 개에만 옮긴다 (낀 것이 있으면 그것, 없으면 가방의 한 개)
  const inv = { ...inv0 };
  let equip = { ...equip0 };
  for (const [id, e0] of Object.entries(r.enh ?? {})) {
    const e = nat(e0, SHOP_ENH_MAX);
    if (!e || !isShopGear(id) || (inv[id] ?? 0) < 1) continue;
    const code = encodeShopPiece({ id, e, u: sgN++, f: nat(r.enhF?.[id], 50) });
    si.push(code);
    if (inv[id] === 1) delete inv[id];
    else inv[id] -= 1;
    const slot = GEAR_SLOTS.find((k) => !!equip[k] && !shopPieceOf(equip[k]) && shopEnhOf(equip[k]!)[0] === id);
    if (slot) equip = { ...equip, [slot]: code };
  }
  const m = r.mats;
  return {
    inv,
    sg,
    si,
    sgN,
    sgPity: nat(r.sgPity, 1000),
    mats: { doc: nat(m?.doc, MAT_MAX), seal: nat(m?.seal, MAT_MAX), prot: nat(m?.prot, MAT_MAX) },
    ...(typeof r.protWk === "string" && /^[\w-]{4,12}$/.test(r.protWk) ? { protWk: r.protWk, protN: nat(r.protN, 99) } : { protWk: undefined, protN: 0 }),
    enh: undefined,
    enhF: undefined,
    sgDone: nat(r.sgDone, 15),
    // 11/19 숨겨진 5세트 효과 발견 비트 (옛 저장값에는 없다 → 0, 모르는 비트는 버린다)
    sgEgg: nat(r.sgEgg) & SG_EGG_ALL,
    sg15: Array.isArray(r.sg15) ? r.sg15.filter((u) => nat(u) > 0).slice(-SG_INV_MAX) : [],
    enhMax: nat(r.enhMax, 15),
    equip: syncEquip(equip, sg, si),
  };
}

/** 상점 장비 id인가 (세트 장비 코드·강화 표시 붙은 id는 아니다) */
export const isShopGear = (id: string) => GEAR.some((g) => g.id === id);

const clone = (s: CharacterState): CharacterState => structuredClone(s);

/** 그 레벨까지 받은 능력치 포인트 합 (시작 5 + 레벨업마다 3, 5의 배수 레벨엔 5) + 11/19 초월 레벨마다 1 */
export function statPointsEarned(level: number, tLevel = 0): number {
  let n = START_STAT_POINTS;
  for (let lv = 2; lv <= Math.min(MAX_LEVEL, Math.floor(level)); lv++) n += statPointsAt(lv);
  return n + transcendStatPoints(tLevel);
}

/** 직접 올린 능력치 합 (기본값 1을 뺀 만큼) */
export const spentStats = (s: CharacterState) => STAT_KEYS.reduce((a, k) => a + Math.max(0, s.stats[k] - baseStats()[k]), 0);

/**
 * 능력치 올리기. budget을 주면(테스트 서버 슈퍼 계정) 남은 포인트를 "budget - 올린 합"으로 보고, 저장하는 남은 포인트는
 * 실제 레벨 기준으로 다시 센다 (슈퍼 계정의 넉넉한 포인트가 저장값에 남지 않게)
 */
export function allocStats(s: CharacterState, alloc: Partial<Stats>, budget?: number): CharacterState {
  const next = clone(s);
  let total = 0;
  for (const k of STAT_KEYS) {
    const n = alloc[k] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new RpgError(400, "INVALID_INPUT", "올릴 능력치 숫자가 맞지 않아요.");
    if (next.stats[k] + n > STAT_MAX) throw new RpgError(409, "STAT_MAX", `능력치는 ${STAT_MAX}까지 올릴 수 있어요.`);
    next.stats[k] += n;
    total += n;
  }
  if (total === 0) throw new RpgError(400, "INVALID_INPUT", "올릴 능력치를 골라 주세요.");
  const free = budget === undefined ? s.statPoints : budget - spentStats(s);
  if (total > free) throw new RpgError(409, "NO_STAT_POINTS", "능력치 포인트가 모자라요.");
  next.statPoints = budget === undefined ? s.statPoints - total : Math.max(0, statPointsEarned(s.level, s.tLevel) - spentStats(next));
  return next;
}

/**
 * 능력치 초기화: 직접 올린 기본 능력치만 기본값으로 되돌리고 레벨만큼의 포인트를 돌려준다.
 * 장비로 붙는 능력치는 stats에 없어서(derive가 장착 장비에서 더한다) 그대로이고, 장비·레벨·경험치·스킬도 건드리지 않는다.
 * count=false면 초기화 횟수를 세지 않는다 (테스트 서버 슈퍼 계정·레벨에 맞춰 되돌릴 때). 비용은 서비스가 받는다
 */
export function resetStats(s: CharacterState, count = true): CharacterState {
  const next = clone(s);
  next.stats = baseStats();
  next.statPoints = statPointsEarned(next.level, next.tLevel);
  if (count) next.statResets = (next.statResets ?? 0) + 1;
  return next;
}

/**
 * 실제 레벨 기준으로 맞춘다 (슈퍼 계정으로 바꾼 상태를 운영자 지정이 풀린 뒤·운영 서버에서 읽을 때):
 * 레벨로 받을 수 있는 것보다 많이 올린 능력치는 되돌리고 포인트를 돌려주며, 요구 레벨이 넘는 장착 장비는 뺀다(가방에는 남는다).
 * 바꿀 게 없으면 같은 객체
 */
export function fitToLevel(s: CharacterState): CharacterState {
  const overStats = spentStats(s) > statPointsEarned(s.level, s.tLevel);
  const overGear = GEAR_SLOTS.filter((k) => {
    const id = s.equip[k];
    return id && (gearById(id)?.reqLevel ?? 0) > s.level;
  });
  if (!overStats && overGear.length === 0) return s;
  let next = overStats ? resetStats(s, false) : clone(s);
  if (overGear.length) {
    next = clone(next);
    for (const k of overGear) next.equip[k] = null;
  }
  return next;
}

/**
 * 스킬 1랭크 올리기. 단(아래 단에 쓴 포인트)·선행 스킬·남은 포인트를 서버가 검사한다 (skillRules.checkLearn).
 * budget: 쓸 수 있는 포인트 합 (없으면 레벨로 받은 만큼. 테스트 서버 슈퍼 계정은 서비스가 크게 넘긴다)
 */
export function learnSkill(s: CharacterState, id: SkillId, budget = skillPointsEarned(s.level, s.tLevel)): CharacterState {
  const e = checkLearn(s.skills, id, budget);
  if (e) throw new RpgError(e.status, e.code, e.message);
  const def = skillById(id)!;
  const cur = s.skills[id] ?? 0;
  const next = clone(s);
  next.skills[id] = cur + 1;
  next.skillPoints = freePoints(next.level, next.skills, next.tLevel);
  delete next.treeNotice;
  // 처음 배운 액티브는 빈 단축키 칸에 자동으로 놓는다
  if (cur === 0 && def.kind === "active" && !next.hotbar.includes(id)) {
    const empty = emptySlotFor(next.hotbar, id);
    if (empty >= 0) next.hotbar[empty] = id;
  }
  return next;
}

/** 11/19 초월 수련 1랭크 올리기 (줄·남은 포인트를 서버가 검사한다 — transcendTree.checkTLearn). budget: 슈퍼 계정은 모두 채울 만큼 */
export function learnTranscend(s: CharacterState, id: TNodeId, budget?: number): CharacterState {
  const cur = s.tSkills ?? {};
  const e = checkTLearn(cur, id, s.tLevel, budget);
  if (e) throw new RpgError(e.status, e.code, e.message);
  const next = clone(s);
  next.tSkills = { ...cur, [id]: (cur[id] ?? 0) + 1 };
  return next;
}

/** 무료 초기화 남은 횟수와 받은 나눔 차례 (normalize) */
function freeResets(r: Partial<CharacterState>): Pick<CharacterState, "freeRespec" | "freeStatReset" | "freeGrant"> {
  const got = Number.isInteger(r.freeGrant) && r.freeGrant! > 0 ? Math.min(r.freeGrant!, FREE_RESET_GRANT) : 0;
  const add = FREE_RESET_GRANT - got;
  const n = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : 0);
  return { freeRespec: n(r.freeRespec) + add, freeStatReset: n(r.freeStatReset) + add, freeGrant: FREE_RESET_GRANT };
}

/** 11/19 초월 수련 되돌리기 (무료 — 초월 포인트는 레벨로만 받는다) */
export function resetTranscend(s: CharacterState): CharacterState {
  const next = clone(s);
  next.tSkills = {};
  return next;
}

/**
 * 단축키 저장. 11/15 궁극기는 궁극기 칸으로 옮겨 저장한다 (예전 화면이 아무 칸에 놓아도 거절하지 않는다).
 * auto: 자동 스킬 설정 (칸에 있는 스킬만 남긴다). slots 없이 auto만 보내면 칸은 그대로 (사냥 중 Shift+숫자·X)
 */
export function setHotbar(s: CharacterState, slots?: (SkillId | null)[], auto?: HotAuto): CharacterState {
  if (!slots) {
    const next = clone(s);
    next.hotAuto = cleanAuto(auto ?? next.hotAuto, next.hotbar);
    return next;
  }
  if (slots.length !== HOTBAR_SIZE) throw new RpgError(400, "INVALID_INPUT", `단축키는 ${HOTBAR_SIZE}칸이에요.`);
  const seen = new Set<string>();
  for (const id of slots) {
    if (id === null) continue;
    if (!(s.skills[id] ?? 0)) throw new RpgError(409, "SKILL_NOT_LEARNED", "배운 스킬만 단축 칸에 등록할 수 있어요.");
    if (skillById(id)?.kind !== "active") throw new RpgError(409, "SKILL_PASSIVE", "패시브는 항상 적용돼서 단축 칸에 등록할 수 없어요.");
    if (seen.has(id)) throw new RpgError(400, "INVALID_INPUT", "같은 스킬을 두 칸에 등록할 수 없어요.");
    seen.add(id);
  }
  const hotbar = arrangeHotbar(slots, () => true);
  const a = auto ?? s.hotAuto;
  return { ...clone(s), hotbar, ...(a ? { hotAuto: cleanAuto(a, hotbar) } : {}) };
}

/**
 * 스킬 초기화(재분배): 배운 스킬을 모두 비우고 레벨만큼의 포인트를 돌려준다. 단축키도 비운다.
 * count=false면 초기화 횟수를 세지 않는다 (테스트 서버 슈퍼 계정 — 운영 데이터에 흔적을 남기지 않게). 비용은 서비스가 받는다
 */
export function resetSkills(s: CharacterState, count = true): CharacterState {
  const next = clone(s);
  next.skills = {};
  next.skillPoints = freePoints(next.level, next.skills, next.tLevel);
  next.hotbar = new Array(HOTBAR_SIZE).fill(null);
  if (next.hotAuto) next.hotAuto = cleanAuto(next.hotAuto, next.hotbar);
  if (count) next.respecs = (next.respecs ?? 0) + 1;
  delete next.treeNotice;
  return next;
}

/** 스킬 트리 바뀜 안내를 봤다 */
export function ackTreeNotice(s: CharacterState): CharacterState {
  const next = clone(s);
  delete next.treeNotice;
  return next;
}

/** 예산(쓸 수 있는 포인트)을 넘는 배분이면 비우고 돌려준다 (슈퍼 계정이 찍은 배분이 다른 환경에서 읽힐 때 등). 그대로면 같은 객체 */
export function fitSkillBudget(s: CharacterState, budget: number): CharacterState {
  if (spentPoints(s.skills) <= budget) return s;
  return { ...resetSkills(s, false), treeNotice: true };
}

/** 그 장비가 장착된 칸 수 */
/** 그 장비가 장착된 칸 수 (묶음에서 낀 것만 — 강화해서 떼어 낸 한 개는 따로) */
export const equippedCount = (s: CharacterState, id: string) => GEAR_SLOTS.filter((k) => !!s.equip[k] && !shopPieceOf(s.equip[k]) && shopEnhOf(s.equip[k]!)[0] === id).length;
/** 상점·주운 장비 수 (묶음 + 강화해서 떼어 낸 것) */
export const gearCount = (s: CharacterState) => Object.values(s.inv).reduce((a, b) => a + b, 0) + (s.si?.length ?? 0);

/** level: 요구 레벨 검사에 쓰는 레벨 (테스트 서버 슈퍼 계정은 서비스가 최대 레벨을 넘긴다) */
export function equip(s: CharacterState, slot: GearSlot, id: string | null, level = s.level): CharacterState {
  const next = clone(s);
  if (id === null) {
    next.equip[slot] = null;
    return next;
  }
  // 11/15 세트 장비는 따로 (lib/rpg/enhance equipSg — 가방의 번호로만 낀다)
  const g = isShopGear(id) ? gearById(id) : undefined;
  if (!g) throw new RpgError(400, "INVALID_INPUT", "없는 장비예요.");
  if (g.kind !== slotKind(slot)) throw new RpgError(400, "WRONG_SLOT", "그 칸에는 낄 수 없는 장비예요.");
  if (level < g.reqLevel) throw new RpgError(409, "LEVEL_LOW", `레벨 ${g.reqLevel}부터 낄 수 있어요.`);
  const owned = s.inv[id] ?? 0;
  const cur = s.equip[slot];
  const usedElsewhere = equippedCount(s, id) - (cur && !shopPieceOf(cur) && shopEnhOf(cur)[0] === id ? 1 : 0);
  if (owned - usedElsewhere < 1) throw new RpgError(409, "NOT_OWNED", "가방에 그 장비가 없어요.");
  next.equip[slot] = id;
  return next;
}

export function addGear(s: CharacterState, id: string, bought: boolean): CharacterState {
  if (!isShopGear(id)) throw new RpgError(400, "INVALID_INPUT", "없는 장비예요.");
  if (gearCount(s) >= GEAR_INV_MAX) throw new RpgError(409, "INVENTORY_FULL", `장비는 ${GEAR_INV_MAX}개까지 가질 수 있어요. 안 쓰는 것을 팔아 주세요.`);
  const next = clone(s);
  next.inv[id] = (next.inv[id] ?? 0) + 1;
  if (bought) next.bought[id] = (next.bought[id] ?? 0) + 1;
  return next;
}

/**
 * 되팔기: 장착하지 않은 1개를 뺀다. 산 것부터 판 것으로 친다(산 값의 50% 환불).
 * 드롭으로 얻은 것을 팔면 dropSellValue(11/20 상점 값의 25%)를 사냥 포인트로 준다.
 */
export function removeGearForSale(s: CharacterState, id: string): { state: CharacterState; bought: boolean; value: number } {
  if (!isShopGear(id)) throw new RpgError(400, "INVALID_INPUT", "없는 장비예요.");
  const r = removeForSale(s, id, 1);
  return { state: r.state, bought: r.bought > 0, value: r.bought > 0 ? r.unit : r.dropUnit };
}

/** 한 번에 팔 수 있는 최대 개수 (포션 한 칸 최대치. 장비 가방은 이보다 작다) */
export const SELL_MAX = POTION_MAX_STACK;

/**
 * 여러 개 되팔기 (장비·포션): count개를 한 번에 뺀다. 모자라면 하나도 빼지 않고 409.
 * 장비는 장착하지 않은 것만, 산 것부터 판 것으로 친다(bought = 환불할 개수, drop = 사냥 수입으로 칠 개수).
 * 포션은 산 기록이 없으니 모두 drop(사냥 포인트 하루 한도 안)으로 친다 → 사서 되팔아도 남는 장사가 없다.
 * unit = 산 것 하나 값(환불), dropUnit = 주운 것 하나 값 (11/20 사용자: 장비는 25%, 물약은 산 것과 구분이 없어 50% 그대로)
 */
export function removeForSale(
  s: CharacterState,
  id: string,
  count: number,
): { state: CharacterState; kind: "gear" | "potion"; bought: number; drop: number; unit: number; dropUnit: number } {
  if (!Number.isInteger(count) || count < 1 || count > SELL_MAX) throw new RpgError(400, "INVALID_INPUT", "팔 개수가 맞지 않아요.");
  const g = isShopGear(id) ? gearById(id) : undefined;
  const p = g ? undefined : potionById(id);
  if (!g && !p) throw new RpgError(400, "INVALID_INPUT", "없는 물건이에요.");
  const next = clone(s);
  if (p) {
    const owned = s.potions[id] ?? 0;
    if (owned < count) throw new RpgError(409, "NOT_OWNED", owned ? `포션이 ${owned}개뿐이에요.` : "가방에 그 포션이 없어요.");
    if (owned === count) delete next.potions[id];
    else next.potions[id] = owned - count;
    return { state: next, kind: "potion", bought: 0, drop: count, unit: sellValue(p.price), dropUnit: sellValue(p.price) };
  }
  const owned = s.inv[id] ?? 0;
  const free = owned - equippedCount(s, id);
  if (free < count) {
    if (free < 1) throw new RpgError(409, "NOT_OWNED", owned ? "장착 중인 장비는 먼저 빼고 팔아 주세요." : "가방에 그 장비가 없어요.");
    throw new RpgError(409, "NOT_OWNED", `팔 수 있는 건 ${free}개뿐이에요.`);
  }
  if (owned === count) delete next.inv[id];
  else next.inv[id] = owned - count;
  const had = s.bought[id] ?? 0;
  const { bought, drop } = gearSaleSplit(s, id, count);
  if (bought) {
    if (had === bought) delete next.bought[id];
    else next.bought[id] = had - bought;
  }
  return { state: next, kind: "gear", bought, drop, unit: sellValue(g!.price), dropUnit: dropSellValue(g!.price) };
}

/** 한도에 막혀 값을 못 받은 (드롭) 물건을 가방에 되돌린다. 방금 뺀 것이라 칸 한도는 보지 않는다 (포션은 한 칸 최대치까지) */
export function returnUnsold(s: CharacterState, id: string, n: number): CharacterState {
  if (n <= 0) return s;
  const next = clone(s);
  // 11/15 강화한 한 개(코드)는 그 코드 그대로 되돌린다
  if (shopPieceOf(id)) next.si = [...(next.si ?? []), id];
  else if (isShopGear(id)) next.inv[id] = (next.inv[id] ?? 0) + n;
  else if (potionById(id)) next.potions[id] = Math.min(POTION_MAX_STACK, (next.potions[id] ?? 0) + n);
  return next;
}

export const sellValue = (price: number) => Math.floor(price * SELL_RATE);

/** 11/27 물약 묶음(id별 개수)을 가방에서 되팔 때와 같은 값 (상점가의 50%) — 야근 빌딩 60층부터 상자 물약을 바로 파는 값 */
export function potionSaleValue(sold: Readonly<Record<string, number>>): number {
  let v = 0;
  for (const [id, n] of Object.entries(sold)) {
    const p = potionById(id);
    if (p && Number.isInteger(n) && n > 0) v += n * sellValue(p.price);
  }
  return v;
}

/**
 * 11/27 판 물약 값을 지갑 한도에 막혀 paid(판 값 기준)만큼만 받았을 때 가방에 되돌릴 물약 (id별 개수).
 * 되팔기(사냥 상점)와 같이, 한 푼이라도 받은 것은 판 것으로 친다. 비싼 물약부터 되돌린다
 */
export function unpaidPotions(sold: Readonly<Record<string, number>>, paid: number): Record<string, number> {
  let left = potionSaleValue(sold) - Math.max(0, paid);
  const back: Record<string, number> = {};
  if (left <= 0) return back;
  const ids = Object.keys(sold)
    .filter((id) => potionById(id) && (sold[id] ?? 0) > 0)
    .sort((a, b) => potionById(b)!.price - potionById(a)!.price);
  for (const id of ids) {
    const unit = sellValue(potionById(id)!.price);
    if (unit <= 0) continue;
    const k = Math.min(sold[id], Math.floor(left / unit));
    if (k > 0) {
      back[id] = k;
      left -= k * unit;
    }
  }
  return back;
}
/** 11/20 사용자: 주운 장비 하나 되팔기 값 (상점 값의 25%) */
export const dropSellValue = (price: number) => Math.floor(price * DROP_SELL_RATE);

/** 11/20 묶음에서 장비 count개를 팔 때 산 것(환불)·주운 것 나누기: 산 것부터 판 것으로 친다. 서버(removeForSale)와 장비창 미리보기가 같이 쓴다 */
export function gearSaleSplit(s: Pick<CharacterState, "bought">, id: string, count: number): { bought: number; drop: number } {
  const bought = Math.min(s.bought[id] ?? 0, count);
  return { bought, drop: count - bought };
}

/** 11/20 강화한 한 개(코드)가 산 것인지: 산 기록이 묶음 개수보다 많으면 산 것 (removePieceForSale·장비창이 같이 쓴다) */
export const pieceSaleBought = (s: Pick<CharacterState, "bought" | "inv">, id: string): 0 | 1 => ((s.bought[id] ?? 0) > (s.inv[id] ?? 0) ? 1 : 0);

/** 11/20 장비 되팔기 값: 산 것은 50%(환불), 주운 것은 25% (서버가 실제로 주는 값과 같은 계산) */
export const gearSaleValue = (price: number, split: { bought: number; drop: number }) => split.bought * sellValue(price) + split.drop * dropSellValue(price);

/**
 * 11/15 강화한 상점 장비 한 개 되팔기 (번호로). 장착 중이면 못 판다. 산 기록이 묶음보다 많으면 산 것으로 쳐서 환불,
 * 아니면 주운 것 (사냥 포인트 한도 안). 강화 값은 쳐 주지 않는다 (값은 장비 값의 50%, 11/20 주운 것은 25%). code = 되돌릴 때 쓰는 코드
 */
export function removePieceForSale(s: CharacterState, uid: number): { state: CharacterState; kind: "gear"; bought: number; drop: number; unit: number; dropUnit: number; code: string; id: string } {
  const code = (s.si ?? []).find((c) => shopPieceOf(c)?.u === uid);
  const p = code ? shopPieceOf(code) : null;
  const g = p ? gearById(p.id) : undefined;
  if (!code || !p || !g) throw new RpgError(404, "NOT_OWNED", "가방에 그 장비가 없어요.");
  if (GEAR_SLOTS.some((k) => s.equip[k] === code)) throw new RpgError(409, "NOT_OWNED", "장착 중인 장비는 먼저 빼고 팔아 주세요.");
  const next = clone(s);
  next.si = (next.si ?? []).filter((c) => c !== code);
  const had = s.bought[p.id] ?? 0;
  const bought = pieceSaleBought(s, p.id);
  if (bought) {
    if (had === 1) delete next.bought[p.id];
    else next.bought[p.id] = had - 1;
  }
  return { state: next, kind: "gear", bought, drop: 1 - bought, unit: sellValue(g.price), dropUnit: dropSellValue(g.price), code, id: p.id };
}

export function addPotions(s: CharacterState, id: string, qty: number): CharacterState {
  if (!potionById(id)) throw new RpgError(400, "INVALID_INPUT", "없는 포션이에요.");
  const cur = s.potions[id] ?? 0;
  if (cur + qty > POTION_MAX_STACK) throw new RpgError(409, "STACK_FULL", `포션은 종류마다 ${POTION_MAX_STACK}개까지 가질 수 있어요.`);
  return { ...clone(s), potions: { ...s.potions, [id]: cur + qty } };
}

/** 판에서 쓴 포션을 뺀다. 가진 것보다 많이 썼다고 하면 가진 만큼만 뺀다 (UI가 보유 수만큼만 쓰게 한다) */
export function consumePotions(s: CharacterState, used: Record<string, number>): { state: CharacterState; consumed: Record<string, number> } {
  const next = clone(s);
  const consumed: Record<string, number> = {};
  for (const [id, n] of Object.entries(used)) {
    if (!potionById(id) || !Number.isInteger(n) || n <= 0) continue;
    const take = Math.min(n, next.potions[id] ?? 0);
    if (!take) continue;
    consumed[id] = take;
    next.potions[id] -= take;
    if (next.potions[id] <= 0) delete next.potions[id];
  }
  return { state: next, consumed };
}

export function gainExp(s: CharacterState, exp: number): { state: CharacterState; levelsGained: number } {
  const r = applyExp(s.level, s.exp, exp);
  const next = clone(s);
  next.level = r.level;
  next.exp = r.exp;
  next.statPoints += r.statPoints;
  next.skillPoints += r.skillPoints;
  return { state: next, levelsGained: r.levelsGained };
}

/**
 * 11/15 초월 EXP를 더한다 (레벨 50 지옥 판·야근 빌딩 층). 11/19 초월 레벨마다 능력치 포인트 1·스킬 포인트 1 — 레벨이 오른 이 갱신 안에서만 더하므로
 * 같은 판으로 두 번 받을 수 없다 (판 기록은 claim으로 한 번만, 저장은 CAS)
 */
export function gainTranscend(s: CharacterState, exp: number): { state: CharacterState; levelsGained: number } {
  const r = applyTranscend(s.tLevel, s.tExp, exp);
  const next = clone(s);
  next.tLevel = r.tLevel;
  next.tExp = r.tExp;
  next.statPoints += r.statPoints;
  // 11/19 초월 레벨마다 스킬 포인트 +1
  next.skillPoints = freePoints(next.level, next.skills, next.tLevel);
  return { state: next, levelsGained: r.levelsGained };
}

/** 드롭 장비는 가방이 가득 차면 버린다 (판 결과는 그대로 받는다) */
export function addDrops(
  s: CharacterState,
  drops: { kind: "gear" | "potion" | "cosmetic" | "set" | "mat"; id: string; qty: number }[],
): { state: CharacterState; lost: number } {
  let cur = s;
  let lost = 0;
  for (const d of drops) {
    // 기간제 코디는 계정 가방으로 (service.finishRun). 11/15 세트 장비·재료는 lib/rpg/enhance grantSgDrops가 먼저 넣는다
    if (d.kind === "cosmetic" || d.kind === "set" || d.kind === "mat") continue;
    try {
      if (d.kind === "gear") cur = addGear(cur, d.id, false);
      else cur = addPotions(cur, d.id, Math.min(d.qty, POTION_MAX_STACK - (cur.potions[d.id] ?? 0)) || 0);
    } catch {
      lost++;
    }
  }
  return { state: cur, lost };
}
