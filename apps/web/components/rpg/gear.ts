import { GEAR_SLOTS, gearById, type GearDef, type GearKind, type GearSlot } from "@/lib/rpg/catalog";
import { derive, type Derived } from "@/lib/rpg/formulas";
import type { CharacterState } from "@/lib/rpg/types";
import { decodeSg, isSgCode, SG_GRADE_COLORS, SG_GRADE_NAMES, SG_PIECE_KIND, SG_REQ_LEVEL, SG_SETS, sgDef, sgPieceOf, sgSetOf, sgUid, shopEnhOf, shopPieceOf, enhSplit, type SgItem, type SgSet } from "@/lib/rpg/setGear";

// 사냥 장비창 순수 함수: 등급, 낄 칸, 능력치 비교, 되팔기 확인

/** 전투 능력 판 (장비창 왼쪽·[내 정보] 사냥 칸이 같이 쓴다): 키 · 짧은 이름 · 표기 · 풀어 쓴 이름 */
export const TOTAL_ROWS: readonly (readonly [keyof Omit<Derived, "stats">, string, (v: number) => string, string])[] = [
  ["atk", "ATK", String, "공격력"],
  ["def", "DEF", String, "방어"],
  ["maxHp", "HP", String, "체력"],
  ["maxSp", "SP", String, "SP"],
  ["aspd", "공속", (v) => v.toFixed(2), "공격 속도"],
  ["crit", "치명", (v) => `${v}%`, "치명타"],
  ["hit", "명중", String, "명중"],
  ["flee", "회피", String, "회피"],
  ["move", "이속", String, "이동 속도"],
  ["skillPower", "스킬", (v) => `×${v.toFixed(2)}`, "스킬 위력"],
];

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
const wornCount = (c: Pick<CharacterState, "equip">, id: string) => GEAR_SLOTS.filter((s) => !!c.equip[s] && !shopPieceOf(c.equip[s]) && shopEnhOf(c.equip[s]!)[0] === id).length;

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

// ── 11/15 장비창 가방 (세트 장비 + 상점·주운 장비) ──

/** 가방 거르기 칸: 부위별 · 재료 · 물약 */
export type BagTab = "all" | GearKind | "mats" | "potions";

export type BagSg = { type: "sg"; key: string; code: string; it: SgItem; gear: GearDef; slot: GearSlot | null; low: boolean };
/** piece = 강화해서 묶음에서 떼어 낸 한 개 (번호·코드 — gear는 강화가 반영된 정의) */
export type BagShop = { type: "shop"; key: string; gear: GearDef; count: number; equipped: number; enh: number; low: boolean; piece?: { u: number; code: string; slot: GearSlot | null } };
export type BagEntry = BagSg | BagShop;

const gradeRank: Record<Grade["id"], number> = { common: 0, fine: 1, rare: 2, legend: 3 };

/** 세트 장비 등급 표시 (사원급… · 직급 색) */
export const sgGrade = (it: Pick<SgItem, "g">) => ({ label: SG_GRADE_NAMES[it.g], color: SG_GRADE_COLORS[it.g] });

/** 장착 칸 id → 등급 이름·색 (세트 장비는 직급, 상점 장비는 요구 레벨 등급) */
export function slotGrade(id: string | null | undefined): { label: string; color: string } | null {
  if (!id) return null;
  if (isSgCode(id)) {
    const it = decodeSg(id);
    return it ? sgGrade(it) : null;
  }
  const g = gearById(id);
  return g ? gearGrade(g) : null;
}

/**
 * 가방 목록: 세트 장비 먼저 (세트 순서대로, 그 안에서 직급·강화 높은 순) → 상점·주운 장비 (등급·강화·요구 레벨 높은 순).
 * 낄 수 없는 것(레벨)은 각 묶음 맨 아래. level = 요구 레벨 검사 레벨 (슈퍼 계정은 최대)
 */
export function bagEntries(c: Pick<CharacterState, "equip" | "inv" | "sg" | "si">, level: number, tab: BagTab = "all"): { sets: { set: SgSet; items: BagSg[] }[]; shop: BagShop[] } {
  const want = (k: GearKind) => tab === "all" || tab === k;
  const worn = new Map<number, GearSlot>();
  for (const s of GEAR_SLOTS) {
    const id = c.equip[s];
    const u = isSgCode(id) ? sgUid(id) : null;
    if (u !== null) worn.set(u, s);
  }
  const sgs: BagSg[] = [];
  for (const code of c.sg ?? []) {
    const it = decodeSg(code);
    if (!it || !want(SG_PIECE_KIND[sgPieceOf(it)])) continue;
    sgs.push({ type: "sg", key: `sg${it.u}`, code, it, gear: sgDef(it, code), slot: worn.get(it.u) ?? null, low: level < SG_REQ_LEVEL });
  }
  const sgSort = (a: BagSg, b: BagSg) => Number(a.low) - Number(b.low) || Number(!!b.slot) - Number(!!a.slot) || b.it.g - a.it.g || b.it.e - a.it.e || a.it.p - b.it.p || a.it.u - b.it.u;
  const sets = SG_SETS.map((set) => ({ set, items: sgs.filter((x) => sgSetOf(x.it) === set).sort(sgSort) })).filter((x) => x.items.length > 0);
  const shop: BagShop[] = Object.entries(c.inv)
    .flatMap(([id, count]): BagShop[] => {
      const gear = gearById(id);
      if (!gear || isSgCode(id) || count <= 0 || !want(gear.kind)) return [];
      return [{ type: "shop" as const, key: id, gear, count, equipped: wornCount(c, id), enh: 0, low: level < gear.reqLevel }];
    })
    // 11/15 강화한 한 개씩 (같은 이름 장비도 따로)
    .concat(
      (c.si ?? []).flatMap((code): BagShop[] => {
        const p = shopPieceOf(code);
        const gear = p ? gearById(code) : undefined;
        if (!p || !gear || !want(gear.kind)) return [];
        const slot = GEAR_SLOTS.find((k) => c.equip[k] === code) ?? null;
        return [{ type: "shop" as const, key: `si${p.u}`, gear, count: 1, equipped: slot ? 1 : 0, enh: p.e, low: level < gear.reqLevel, piece: { u: p.u, code, slot } }];
      }),
    )
    .sort(
      (a, b) =>
        Number(a.low) - Number(b.low) ||
        Number(b.equipped > 0) - Number(a.equipped > 0) ||
        gradeRank[gearGrade(b.gear).id] - gradeRank[gearGrade(a.gear).id] ||
        b.enh - a.enh ||
        b.gear.reqLevel - a.gear.reqLevel,
    );
  return { sets, shop };
}

// ── 11/15 강화가 보이게: 능력치를 "강화 전 값 (+강화 몫)"으로 ──

const STAT_KO: Record<string, string> = { atk: "공격력", def: "방어", hp: "체력", sp: "SP", str: "STR", agi: "AGI", vit: "VIT", int: "INT", dex: "DEX", luk: "LUK", aspd: "공속", crit: "치명", hit: "명중", flee: "회피", move: "이속" };
const n2 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** "공격력 136 (+136) · 방어 40 (+16)" — 강화가 없으면 괄호 없이 */
export function statLine(id: string): string {
  return statParts(id)
    .map((p) => `${p.label} ${p.base}${p.plus ? ` (+${p.plus})` : ""}`)
    .join(" · ");
}

/** 능력치 한 줄을 조각으로 (화면이 강화 몫만 다른 색으로 그린다): 이름·강화 전 값·강화 몫(없으면 "") */
export function statParts(id: string): { k: string; label: string; base: string; plus: string; neg: boolean }[] {
  // 깎는 값 (11/21 사직서 봉투 최대 체력 −120 등): 「최대 체력 −120」, 화면은 빨갛게
  return enhSplit(id, gearById).map(([k, base, plus]) => {
    const neg = base < 0;
    return { k, label: neg && k === "hp" ? "최대 체력" : (STAT_KO[k] ?? k), base: neg ? `−${n2(-base)}` : n2(base), plus: plus ? n2(plus) : "", neg };
  });
}
