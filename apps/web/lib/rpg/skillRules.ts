// 스킬 트리 규칙 (서버 검증·UI·게임이 같이 쓴다, 순수 함수).
//  - 단(tier) t는 그 갈래의 "아래 단들"(1..t-1)에 쓴 포인트가 TIER_GATES[t-1] 이상이면 열린다
//    (같은 단·위 단 포인트는 세지 않는다 → 배분 전체를 한 번에 검사해도 순서와 상관없이 같은 답)
//  - 선행 스킬은 필요한 랭크 이상
//  - 쓴 포인트 합 ≤ 예산 (보통은 레벨로 받은 포인트 합, 테스트 서버 슈퍼 계정은 모든 스킬 최대치)
// 저장 형식 2(SKILL_TREE_VERSION): 옛 스킬(1)은 모두 지우고 레벨만큼의 포인트를 돌려준다 (character.normalize).
import { MAX_LEVEL, skillPointsAt, START_SKILL_POINTS } from "./formulas";
import { BRANCHES, skillById, SKILLS, TIER_GATES, TIERS, type BranchId, type SkillId } from "./skillTree";

export const SKILL_TREE_VERSION = 2;

export type Alloc = Partial<Record<SkillId, number>>;

/** 그 레벨까지 받은 스킬 포인트 합 (시작 1 + 레벨업마다 1, 10의 배수 레벨엔 2) */
export function skillPointsEarned(level: number): number {
  let n = START_SKILL_POINTS;
  for (let lv = 2; lv <= Math.min(MAX_LEVEL, Math.floor(level)); lv++) n += skillPointsAt(lv);
  return n;
}

/** 모든 스킬을 최대 랭크까지 찍는 데 드는 포인트 (테스트 서버 슈퍼 계정 예산) */
export const ALL_SKILLS_POINTS = SKILLS.reduce((a, s) => a + s.maxLevel, 0);

export const spentPoints = (a: Alloc) => Object.values(a).reduce<number>((x, n) => x + (n ?? 0), 0);

/** 그 갈래에 쓴 포인트 (belowTier가 있으면 그 단보다 아래 단만) */
export function spentIn(a: Alloc, branch: BranchId, belowTier = TIERS + 1): number {
  let n = 0;
  for (const s of SKILLS) if (s.branch === branch && s.tier < belowTier) n += a[s.id] ?? 0;
  return n;
}

export const tierGate = (tier: number) => TIER_GATES[Math.max(0, Math.min(TIERS, tier) - 1)];
export const tierOpen = (a: Alloc, branch: BranchId, tier: number) => spentIn(a, branch, tier) >= tierGate(tier);

export type RuleError = { status: number; code: string; message: string };
const err = (status: number, code: string, message: string): RuleError => ({ status, code, message });

/** 지금 배분(a)에서 id를 1랭크 올릴 수 있나. 남은 포인트는 budget - 쓴 포인트 */
export function checkLearn(a: Alloc, id: string, budget: number): RuleError | null {
  const def = skillById(id);
  if (!def) return err(400, "INVALID_INPUT", "없는 스킬이에요.");
  const cur = a[def.id] ?? 0;
  if (cur >= def.maxLevel) return err(409, "SKILL_MAX", "이미 최고 랭크예요.");
  if (!tierOpen(a, def.branch, def.tier))
    return err(409, "TIER_LOCKED", `${def.tier}단은 이 갈래에 ${tierGate(def.tier)}포인트를 쓰면 열려요.`);
  for (const r of def.requires ?? [])
    if ((a[r.id] ?? 0) < r.level) return err(409, "SKILL_REQUIRED", `${skillById(r.id)!.name} ${r.level}랭크가 먼저 필요해요.`);
  if (spentPoints(a) + 1 > budget) return err(409, "NO_SKILL_POINTS", "스킬 포인트가 모자라요.");
  return null;
}

/** 배분 전체 검사 (모르는 스킬·랭크 범위·단·선행·포인트 합). 맞으면 null */
export function checkAllocation(a: Record<string, unknown>, budget: number): RuleError | null {
  for (const [id, n] of Object.entries(a)) {
    const def = skillById(id);
    if (!def) return err(400, "INVALID_INPUT", `없는 스킬이 있어요: ${id}`);
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > def.maxLevel) return err(400, "INVALID_INPUT", `${def.name} 랭크가 맞지 않아요.`);
  }
  const alloc = a as Alloc;
  for (const def of SKILLS) {
    if (!(alloc[def.id] ?? 0)) continue;
    if (!tierOpen(alloc, def.branch, def.tier)) return err(409, "TIER_LOCKED", `${def.name}: ${def.tier}단이 아직 안 열렸어요.`);
    for (const r of def.requires ?? [])
      if ((alloc[r.id] ?? 0) < r.level) return err(409, "SKILL_REQUIRED", `${def.name}: ${skillById(r.id)!.name} ${r.level}랭크가 먼저 필요해요.`);
  }
  if (spentPoints(alloc) > budget) return err(409, "NO_SKILL_POINTS", "쓴 스킬 포인트가 가진 것보다 많아요.");
  return null;
}

/** 0랭크 항목을 뺀 깨끗한 배분 */
export function cleanAlloc(a: Alloc): Alloc {
  const out: Alloc = {};
  for (const s of SKILLS) if ((a[s.id] ?? 0) > 0) out[s.id] = a[s.id];
  return out;
}

/**
 * 스킬 초기화(재분배) 비용 (지갑 포인트). 첫 1회는 무료, 그 뒤로는 레벨에 따라 조금씩 (최대 120P).
 * I0d 경제 기준(보통 유저 하루 약 200P, economy.ts)에서 반나절 벌이를 넘지 않게.
 */
export const RESPEC_MAX_COST = 120;
export function respecCost(level: number, respecs: number): number {
  if (respecs <= 0) return 0;
  return Math.min(RESPEC_MAX_COST, 30 + 2 * Math.max(1, Math.floor(level)));
}

export const branchOf = (id: SkillId): BranchId => skillById(id)!.branch;
export { BRANCHES };
