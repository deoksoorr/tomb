import {
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
import { applyExp, baseStats, START_SKILL_POINTS, START_STAT_POINTS, STAT_MAX } from "./formulas";
import type { CharacterState } from "./types";

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
/** 되팔 때 받는 비율 */
export const SELL_RATE = 0.5;

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
  };
}

/** 저장된 JSON을 지금 형태로 맞춘다 (필드가 늘어도 예전 기록이 깨지지 않게) */
export function normalize(raw: unknown): CharacterState {
  const base = newCharacter();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<CharacterState>;
  const hotbar = Array.isArray(r.hotbar) ? r.hotbar.slice(0, HOTBAR_SIZE) : base.hotbar;
  while (hotbar.length < HOTBAR_SIZE) hotbar.push(null);
  return {
    ...base,
    ...r,
    stats: { ...base.stats, ...r.stats },
    skills: { ...r.skills },
    hotbar,
    inv: { ...(r.inv ?? base.inv) },
    bought: { ...r.bought },
    equip: { ...base.equip, ...(r.equip ?? {}) },
    potions: { ...(r.potions ?? base.potions) },
  };
}

const clone = (s: CharacterState): CharacterState => structuredClone(s);

export function allocStats(s: CharacterState, alloc: Partial<Stats>): CharacterState {
  const next = clone(s);
  let total = 0;
  for (const k of STAT_KEYS) {
    const n = alloc[k] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new RpgError(400, "INVALID_INPUT", "능력치는 0 이상의 정수로 올려 주세요.");
    if (next.stats[k] + n > STAT_MAX) throw new RpgError(409, "STAT_MAX", `능력치는 ${STAT_MAX}까지 올릴 수 있어요.`);
    next.stats[k] += n;
    total += n;
  }
  if (total === 0) throw new RpgError(400, "INVALID_INPUT", "올릴 능력치를 골라 주세요.");
  if (total > s.statPoints) throw new RpgError(409, "NO_STAT_POINTS", "능력치 포인트가 모자라요.");
  next.statPoints -= total;
  return next;
}

/** 스킬 1단계 배우기 */
export function learnSkill(s: CharacterState, id: SkillId): CharacterState {
  const def = skillById(id);
  if (!def) throw new RpgError(400, "INVALID_INPUT", "없는 스킬이에요.");
  const cur = s.skills[id] ?? 0;
  if (cur >= def.maxLevel) throw new RpgError(409, "SKILL_MAX", "이미 최고 단계예요.");
  if (s.level < def.reqLevel) throw new RpgError(409, "LEVEL_LOW", `레벨 ${def.reqLevel}부터 배울 수 있어요.`);
  for (const req of def.requires ?? []) {
    if ((s.skills[req.id] ?? 0) < req.level)
      throw new RpgError(409, "SKILL_REQUIRED", `${skillById(req.id)!.name} ${req.level}단계가 먼저 필요해요.`);
  }
  if (s.skillPoints < 1) throw new RpgError(409, "NO_SKILL_POINTS", "스킬 포인트가 모자라요.");
  const next = clone(s);
  next.skills[id] = cur + 1;
  next.skillPoints -= 1;
  // 처음 배운 스킬은 빈 단축키 칸에 자동으로 놓는다
  if (cur === 0 && !next.hotbar.includes(id)) {
    const empty = next.hotbar.indexOf(null);
    if (empty >= 0) next.hotbar[empty] = id;
  }
  return next;
}

export function setHotbar(s: CharacterState, slots: (SkillId | null)[]): CharacterState {
  if (slots.length !== HOTBAR_SIZE) throw new RpgError(400, "INVALID_INPUT", `단축키는 ${HOTBAR_SIZE}칸이에요.`);
  const seen = new Set<string>();
  for (const id of slots) {
    if (id === null) continue;
    if (!(s.skills[id] ?? 0)) throw new RpgError(409, "SKILL_NOT_LEARNED", "배운 스킬만 단축키에 놓을 수 있어요.");
    if (seen.has(id)) throw new RpgError(400, "INVALID_INPUT", "같은 스킬을 두 칸에 놓을 수 없어요.");
    seen.add(id);
  }
  return { ...clone(s), hotbar: [...slots] };
}

/** 그 장비가 장착된 칸 수 */
export const equippedCount = (s: CharacterState, id: string) => GEAR_SLOTS.filter((k) => s.equip[k] === id).length;
const gearCount = (s: CharacterState) => Object.values(s.inv).reduce((a, b) => a + b, 0);

export function equip(s: CharacterState, slot: GearSlot, id: string | null): CharacterState {
  const next = clone(s);
  if (id === null) {
    next.equip[slot] = null;
    return next;
  }
  const g = gearById(id);
  if (!g) throw new RpgError(400, "INVALID_INPUT", "없는 장비예요.");
  if (g.kind !== slotKind(slot)) throw new RpgError(400, "WRONG_SLOT", "그 칸에는 낄 수 없는 장비예요.");
  if (s.level < g.reqLevel) throw new RpgError(409, "LEVEL_LOW", `레벨 ${g.reqLevel}부터 낄 수 있어요.`);
  const owned = s.inv[id] ?? 0;
  const usedElsewhere = equippedCount(s, id) - (s.equip[slot] === id ? 1 : 0);
  if (owned - usedElsewhere < 1) throw new RpgError(409, "NOT_OWNED", "가방에 그 장비가 없어요.");
  next.equip[slot] = id;
  return next;
}

export function addGear(s: CharacterState, id: string, bought: boolean): CharacterState {
  if (!gearById(id)) throw new RpgError(400, "INVALID_INPUT", "없는 장비예요.");
  if (gearCount(s) >= GEAR_INV_MAX) throw new RpgError(409, "INVENTORY_FULL", `장비는 ${GEAR_INV_MAX}개까지 가질 수 있어요. 안 쓰는 것을 팔아 주세요.`);
  const next = clone(s);
  next.inv[id] = (next.inv[id] ?? 0) + 1;
  if (bought) next.bought[id] = (next.bought[id] ?? 0) + 1;
  return next;
}

/**
 * 되팔기: 장착하지 않은 1개를 뺀다. 산 것부터 판 것으로 친다(산 값의 50% 환불).
 * 드롭으로 얻은 것을 팔면 sellValue를 사냥 포인트(하루 한도 안)로 준다 → 드롭 되팔기로 한도를 넘지 못한다.
 */
export function removeGearForSale(s: CharacterState, id: string): { state: CharacterState; bought: boolean; value: number } {
  const g = gearById(id);
  if (!g) throw new RpgError(400, "INVALID_INPUT", "없는 장비예요.");
  const owned = s.inv[id] ?? 0;
  if (owned - equippedCount(s, id) < 1)
    throw new RpgError(409, "NOT_OWNED", owned ? "장착 중인 장비는 먼저 빼고 팔아 주세요." : "가방에 그 장비가 없어요.");
  const next = clone(s);
  const bought = (s.bought[id] ?? 0) > 0;
  if (owned === 1) delete next.inv[id];
  else next.inv[id] = owned - 1;
  if (bought) {
    if (s.bought[id] === 1) delete next.bought[id];
    else next.bought[id] -= 1;
  }
  return { state: next, bought, value: sellValue(g.price) };
}

export const sellValue = (price: number) => Math.floor(price * SELL_RATE);

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

/** 드롭 장비는 가방이 가득 차면 버린다 (판 결과는 그대로 받는다) */
export function addDrops(
  s: CharacterState,
  drops: { kind: "gear" | "potion"; id: string; qty: number }[],
): { state: CharacterState; lost: number } {
  let cur = s;
  let lost = 0;
  for (const d of drops) {
    try {
      if (d.kind === "gear") cur = addGear(cur, d.id, false);
      else cur = addPotions(cur, d.id, Math.min(d.qty, POTION_MAX_STACK - (cur.potions[d.id] ?? 0)) || 0);
    } catch {
      lost++;
    }
  }
  return { state: cur, lost };
}
