import { GEAR_SLOTS, gearById, type GearDef, type GearKind, type GearSlot } from "@/lib/rpg/catalog";
import { derive, type Derived } from "@/lib/rpg/formulas";
import type { CharacterState } from "@/lib/rpg/types";

// 사냥 장비창 순수 함수: 등급, 낄 칸, 능력치 비교, 되팔기 확인

/** 등급: 요구 레벨로 나눈다 (상점·드롭 모두 같은 표) */
export type Grade = { id: "common" | "fine" | "rare" | "legend"; label: string; color: string };
const GRADES: readonly (Grade & { from: number })[] = [
  { id: "legend", label: "전설", color: "#e0a24a", from: 28 },
  { id: "rare", label: "희귀", color: "#b48ae0", from: 18 },
  { id: "fine", label: "고급", color: "#7fb0e0", from: 8 },
  { id: "common", label: "일반", color: "#d9d4c3", from: 0 },
];
export function gearGrade(g: Pick<GearDef, "reqLevel">): Grade {
  const { id, label, color } = GRADES.find((x) => g.reqLevel >= x.from)!;
  return { id, label, color };
}

/** 그 장비가 장착된 칸 수 */
const wornCount = (c: Pick<CharacterState, "equip">, id: string) => GEAR_SLOTS.filter((s) => c.equip[s] === id).length;

/** 이 장비를 끼면 들어갈 칸: 장신구는 빈 칸 먼저 (둘 다 차 있으면 1번 칸을 바꾼다) */
export function equipTarget(c: Pick<CharacterState, "equip">, kind: GearKind): GearSlot {
  if (kind !== "acc") return kind;
  return !c.equip.acc1 ? "acc1" : !c.equip.acc2 ? "acc2" : "acc1";
}

/** 그 칸에 낄 수 있는 종류 */
export const slotAccepts = (slot: GearSlot, kind: GearKind) => (slot === "acc1" || slot === "acc2" ? kind === "acc" : slot === kind);

/** 비교할 전투 능력 (표시 이름, 소수 자리) */
const DIFF_ROWS: readonly [keyof Omit<Derived, "stats">, string, number][] = [
  ["atk", "ATK", 0],
  ["def", "DEF", 0],
  ["maxHp", "HP", 0],
  ["maxSp", "SP", 0],
  ["aspd", "공속", 2],
  ["crit", "치명", 2],
  ["hit", "명중", 0],
  ["flee", "회피", 0],
  ["move", "이속", 0],
  ["skillPower", "스킬", 2],
];

export type StatDiff = { key: string; label: string; before: number; after: number; delta: number };

/** slot에 itemId(null이면 빼기)를 끼면 바뀌는 전투 능력 (바뀌는 것만) */
export function gearDiff(c: Pick<CharacterState, "level" | "stats" | "equip">, slot: GearSlot, itemId: string | null): StatDiff[] {
  const before = derive(c.level, c.stats, c.equip);
  const after = derive(c.level, c.stats, { ...c.equip, [slot]: itemId });
  return DIFF_ROWS.flatMap(([k, label, digits]) => {
    const b = before[k];
    const a = after[k];
    const p = 10 ** digits;
    const delta = Math.round((a - b) * p) / p;
    return delta === 0 ? [] : [{ key: k, label, before: b, after: a, delta }];
  });
}

/** "+9" · "−0.1" (빼기는 진짜 빼기표) */
export function deltaText(d: number): string {
  const n = Math.abs(d);
  return `${d > 0 ? "+" : "−"}${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")}`;
}

/**
 * 팔기 전에 한 번 더 물어볼 이유 (없으면 null).
 * 장착 중인 것과 같은 장비(남는 것을 판다)거나, 희귀 이상이면 묻는다.
 */
export function sellWarning(c: Pick<CharacterState, "equip" | "inv">, g: GearDef, qty = 1): string | null {
  const eq = wornCount(c, g.id);
  if (eq > 0) return `${g.name} ${eq}개는 장착 중이에요. 남는 것 중 ${qty}개를 팔아요.`;
  const grade = gearGrade(g);
  if (grade.id === "rare" || grade.id === "legend") return `${grade.label} 장비예요. 정말 팔까요?`;
  return null;
}

/** 팔 수 있는 개수 (장착 중인 것은 못 판다) */
export function sellable(c: Pick<CharacterState, "equip" | "inv">, id: string): number {
  return Math.max(0, (c.inv[id] ?? 0) - wornCount(c, id));
}

/** 가방 칸 순서: 장착 중 → 종류(무기·갑옷·머리·장신구) → 높은 레벨 */
const KIND_ORDER: Record<GearKind, number> = { weapon: 0, armor: 1, head: 2, acc: 3 };
export function bagGear(c: Pick<CharacterState, "equip" | "inv">): { gear: GearDef; count: number; equipped: number }[] {
  return Object.entries(c.inv)
    .flatMap(([id, count]) => {
      const gear = gearById(id);
      return gear && count > 0 ? [{ gear, count, equipped: wornCount(c, id) }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.equipped > 0) - Number(a.equipped > 0) ||
        KIND_ORDER[a.gear.kind] - KIND_ORDER[b.gear.kind] ||
        b.gear.reqLevel - a.gear.reqLevel,
    );
}
