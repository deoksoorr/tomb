import { HOTBAR_SIZE } from "./catalog";
import { skillById, TIERS, type SkillId } from "./skillTree";

// 11/15 단축 칸 배치: 스킬 5칸(1~5 키) + 궁극기 1칸(F 키). 저장은 예전처럼 6칸 배열 — 마지막 칸(ULT_SLOT)이 궁극기 자리.
// 칸마다 자동 켜기(자동 스킬)·전체 스위치·궁극기 SP 남겨 두기도 여기서 정리한다 (서버 normalize·저장, 화면이 같이 쓴다).

/** 일반 스킬 칸 수 (숫자 키 1~5) */
export const SKILL_SLOTS = 5;
/** 궁극기 칸 (배열 자리). F 키 */
export const ULT_SLOT = HOTBAR_SIZE - 1;

export type Slots = (SkillId | null)[];

/** 자동 스킬 설정: ids = 자동으로 정한 스킬(1~5 칸에 있는 것만), on = 전체 스위치(X), keepUlt = 궁극기 SP 남겨 두기 */
export type HotAuto = { ids: SkillId[]; on: boolean; keepUlt: boolean };
export const DEFAULT_AUTO: HotAuto = { ids: [], on: false, keepUlt: true };

/** 궁극기 = 5단 액티브 */
export const isUltimate = (id: string | null | undefined): boolean => {
  const d = id ? skillById(id) : undefined;
  return !!d && d.kind === "active" && d.tier === TIERS;
};

/** 몸 옮기기 스킬 (어디로 갈지는 사람이 정한다) */
export const MOVE_SKILLS: readonly SkillId[] = ["fr_mist", "so_veil", "wk_charge", "wk_leap"];
/** 11/19 켜고 끄는 스킬 (삽날 회오리): 자동으로 두지 않는다 */
export const TOGGLE_SKILLS: readonly SkillId[] = ["wk_whirl"];

/** 자동으로 둘 수 없는 이유 (없으면 null) */
export function autoBlock(id: SkillId): string | null {
  if (isUltimate(id)) return "궁극기는 직접 써요";
  if (MOVE_SKILLS.includes(id)) return "몸 옮기기 스킬은 직접 써요";
  if (TOGGLE_SKILLS.includes(id)) return "켜고 끄는 스킬은 직접 써요";
  if (skillById(id)?.kind !== "active") return "액티브 스킬만 자동으로 둘 수 있어요";
  return null;
}

/** 이 칸에 이 스킬을 놓을 수 있나: 궁극기는 궁극기 칸에만, 나머지는 1~5에만 */
export const fitsSlot = (id: SkillId, slot: number): boolean => (slot === ULT_SLOT ? isUltimate(id) : slot >= 0 && slot < SKILL_SLOTS && !isUltimate(id));

/**
 * 단축 칸을 지금 규칙에 맞춘다 (옛 6칸 저장값 옮기기 포함). ok: 놓을 수 있는 스킬인지 (배운 액티브).
 * 궁극기는 궁극기 칸으로 (이미 궁극기가 있으면 그것을 둔다), 나머지는 제자리. 6번 칸에 있던 일반 스킬은 1~5의 빈 칸으로,
 * 빈 칸이 없으면 칸에서만 빠진다 (배운 스킬은 그대로). 같은 스킬이 두 번이면 앞의 것만
 */
export function arrangeHotbar(raw: readonly unknown[] | null | undefined, ok: (id: SkillId) => boolean): Slots {
  const out: Slots = new Array(HOTBAR_SIZE).fill(null);
  const src = Array.isArray(raw) ? raw.slice(0, HOTBAR_SIZE) : [];
  const seen = new Set<string>();
  const items = src.map((v) => {
    const d = typeof v === "string" ? skillById(v) : undefined;
    if (!d || d.kind !== "active" || seen.has(d.id) || !ok(d.id)) return null;
    seen.add(d.id);
    return d.id;
  });
  // 궁극기: 궁극기 칸에 있던 것을 먼저, 없으면 앞에서부터 첫 궁극기
  const ult = [ULT_SLOT, ...Array.from({ length: SKILL_SLOTS }, (_, i) => i)].map((i) => items[i]).find((id) => id && isUltimate(id));
  if (ult) out[ULT_SLOT] = ult;
  const rest: SkillId[] = [];
  items.forEach((id, i) => {
    if (!id || isUltimate(id)) return;
    if (i < SKILL_SLOTS) out[i] = id;
    else rest.push(id);
  });
  for (const id of rest) {
    const at = out.findIndex((x, i) => i < SKILL_SLOTS && x === null);
    if (at >= 0) out[at] = id;
  }
  return out;
}

/** 새로 배운 액티브를 놓을 빈 칸 (없으면 -1) */
export function emptySlotFor(hotbar: Slots, id: SkillId): number {
  if (isUltimate(id)) return hotbar[ULT_SLOT] ? -1 : ULT_SLOT;
  return hotbar.findIndex((x, i) => i < SKILL_SLOTS && x === null);
}

/** 자동 설정 정리: 1~5 칸에 있고 자동이 되는 스킬만. 옛 저장값(없음)은 기본값 */
export function cleanAuto(raw: unknown, hotbar: Slots): HotAuto {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<HotAuto>;
  const inBar = new Set(hotbar.slice(0, SKILL_SLOTS).filter((x): x is SkillId => !!x));
  const ids = Array.isArray(r.ids) ? [...new Set(r.ids.filter((id): id is SkillId => typeof id === "string" && inBar.has(id as SkillId) && !autoBlock(id as SkillId)))] : [];
  return { ids, on: r.on === true, keepUlt: r.keepUlt !== false };
}

/** 11/21 회장님 독대 시작 자동: 1~5 칸의 자동 되는 스킬 전부 + 전체 스위치 켬 (궁극기·몸 옮기기·켜고 끄기는 autoBlock 그대로 빠진다) */
export function chairAuto(hotbar: Slots, prev: HotAuto): HotAuto {
  const ids = [...new Set(hotbar.slice(0, SKILL_SLOTS).filter((x): x is SkillId => !!x && !autoBlock(x)))];
  return { ids, on: ids.length > 0, keepUlt: prev.keepUlt };
}

/** 이 칸이 자동으로 돌고 있나 (전체 스위치까지) */
export const slotAuto = (a: HotAuto, hotbar: Slots, slot: number): boolean => slot < SKILL_SLOTS && !!hotbar[slot] && a.ids.includes(hotbar[slot]!);
