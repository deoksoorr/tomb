import { isNameSlot, isShopListed, ITEMS, type ItemDef } from "@tomb/protocol";
import type { GearSlot, Stats } from "./catalog";
import { derive, seeded, type Derived } from "./formulas";
import {
  decodeSg,
  isSgCode,
  optRange,
  optsFor,
  SG_LEGEND_CHANCE,
  SG_LEGEND_IDS,
  SG_OPT_COUNT,
  SG_PIECES,
  SG_SETS,
  sgCombatPower,
  sgPieceOf,
  sgSpec,
  shopEnhOf,
  type SgGrade,
  type SgItem,
  type SgOpt,
  type SgPiece,
} from "./setGear";
import type { Drop } from "./types";

// 11/15 세트 장비·재료·꾸미기 굴림 (야근 빌딩 우두머리 상자). 게임이 상자를 열 때 떨구는 것과 서버가 판 끝에 주는 것이
// 같은 시드 굴림이라 늘 같다 (lib/rpg/tower towerChestDrops가 부른다). 천장(연속으로 못 받은 상자 수)도 양쪽이 같은 값에서 센다.

/** 상자에서 세트 장비가 나올 확률. 11/19 야근 빌딩 개편: 기본 장비로도 높이 오르니 15% → 2%, 천장은 없앴다. 11/20 사용자 「스펙업 재미로」 2% → 8% (천장 없이), 11/21 사용자 8% → 15% */
export const SG_CHEST_CHANCE = 0.15;
/** 부위 비율 (무기는 일부러 귀하게) — 장신구 45%는 두 종류가 반씩 */
export const SG_PIECE_WEIGHTS: Record<SgPiece, number> = {
  weapon: 15,
  armor: 20,
  head: 20,
  acc1: 22.5,
  acc2: 22.5,
};

/**
 * 우두머리 층 → 직급 (11/19 개편, 50층 단위 — 지켜보며 조정): 51~100 사원 · 101~150 대리 · 151~200 과장 · 201~ 임원.
 * 인감 도장·꾸미기 등급도 이 경계를 따른다
 */
export const SG_GRADE_FLOORS = [101, 151, 201] as const;
const [G_DAERI, G_GWAJANG, G_IMWON] = SG_GRADE_FLOORS;
export const sgGradeForFloor = (f: number): SgGrade => (f >= G_IMWON ? 3 : f >= G_GWAJANG ? 2 : f >= G_DAERI ? 1 : 0);

const pickWeighted = <T>(r: () => number, items: readonly T[], w: (t: T) => number): T => {
  const total = items.reduce((a, t) => a + w(t), 0);
  let x = r() * total;
  for (const t of items) if ((x -= w(t)) < 0) return t;
  return items[items.length - 1];
};

/**
 * 랜덤 옵션 굴리기: 직급만큼(2·2·3·3) 겹치지 않게, 값은 직급 범위 안에서 고르게. 임원급은 10%로 전설 옵션 하나 더.
 * keep: 고정한 옵션 (그대로 두고 나머지만 굴린다), keepL: 고정한 전설 옵션
 */
export function rollOptions(r: () => number, piece: SgPiece, g: SgGrade, keep: [SgOpt, number][] = [], keepL = 0): { o: [SgOpt, number][]; L: number } {
  const o: [SgOpt, number][] = [...keep];
  const pool = optsFor(piece).filter((k) => !o.some(([x]) => x === k));
  while (o.length < SG_OPT_COUNT[g] && pool.length) {
    const i = Math.min(pool.length - 1, Math.floor(r() * pool.length));
    const k = pool.splice(i, 1)[0];
    const [lo, hi] = optRange(k, g);
    o.push([k, lo + Math.min(hi - lo, Math.floor(r() * (hi - lo + 1)))]);
  }
  let L = keepL;
  if (!L && g === 3 && r() < SG_LEGEND_CHANCE) L = SG_LEGEND_IDS[Math.min(3, Math.floor(r() * 4))];
  return { o, L };
}

/** 세트·부위를 정해 새로 굴린 물건 (번호·강화 없이) */
export function rollSgFixed(r: () => number, s: number, p: number, g: SgGrade): Pick<SgItem, "s" | "p" | "g" | "o" | "L"> {
  return { s, p, g, ...rollOptions(r, SG_PIECES[p], g) };
}

/** 세트 25%씩 · 부위 비율대로 새로 굴린 물건 */
export function rollSgItem(r: () => number, g: SgGrade): Pick<SgItem, "s" | "p" | "g" | "o" | "L"> {
  const s = Math.min(3, Math.floor(r() * SG_SETS.length));
  const piece = pickWeighted(r, SG_PIECES, (p) => SG_PIECE_WEIGHTS[p]);
  return rollSgFixed(r, s, SG_PIECES.indexOf(piece), g);
}

/** 상자 하나의 세트 장비 굴림: SG_CHEST_CHANCE (11/19 천장 없음). force = 테스트 서버 슈퍼 계정 시험 드롭 (확률 굴림은 늘 한 번 뽑는다 — 난수 순서가 같게) */
export function chestSetGear(r: () => number, f: number, force = false): Drop | null {
  const hit = r() < SG_CHEST_CHANCE;
  if (!hit && !force) return null;
  return { kind: "set", id: sgSpec(rollSgItem(r, sgGradeForFloor(f))), qty: 1 };
}

/** 상자를 하나 연 뒤의 못 받은 수 (세트 장비가 나왔으면 0부터). 11/19 천장은 없앴고 기록만 남는다 */
export const nextPity = (drops: readonly Drop[], pity: number) => (drops.some((d) => d.kind === "set") ? 0 : pity + 1);

/** 상자마다 재료: 결재 서류 2 + 층÷10, 인감 도장 165층(대리급)부터 1개·180층(과장급)부터 2개 (11/19 개편) */
export const chestDocs = (f: number) => 2 + Math.floor(f / 10);
export const chestSeals = (f: number) => (f >= G_GWAJANG ? 2 : f >= G_DAERI ? 1 : 0);
export function chestMats(f: number): Drop[] {
  const out: Drop[] = [{ kind: "mat", id: "m_doc", qty: chestDocs(f) }];
  if (chestSeals(f) > 0) out.push({ kind: "mat", id: "m_seal", qty: chestSeals(f) });
  return out;
}

/** 보호 문서: 이번 주 최고 층이 10층 단위를 새로 넘으면 1장, 한 주 2장까지. 11/19 개편: 150층부터 센다 (갓 Lv50이 막히는 층 바로 위) */
export const PROT_PER_WEEK = 2;
export const PROT_FROM_FLOOR = 150;
export const crossesTen = (prevWeekBest: number, newWeekBest: number) =>
  newWeekBest >= PROT_FROM_FLOOR && Math.floor(newWeekBest / 10) > Math.floor(Math.max(prevWeekBest, PROT_FROM_FLOOR - 1) / 10);

// ── 꾸미기 (상자마다 10%, 깔끔한 클리어와 상관없이) ──

/** 11/19 개편: 10% → 3% */
export const CHEST_COSMETIC_CHANCE = 0.03;
export type CosTier = 0 | 1 | 2 | 3;
export const COS_TIER_NAMES = ["일반", "고급", "희귀", "전설"] as const;
/** 상점 값으로 나눈 등급: 100P까지 일반 · 180P까지 고급 · 300P까지 희귀 · 그 위 전설 */
export const cosTierOf = (price: number): CosTier => (price <= 100 ? 0 : price <= 180 ? 1 : price <= 300 ? 2 : 3);

/** 상자 꾸미기 후보: 상점 캐릭터 꾸미기 (운영자·1위·의뢰 보상·펫·닉네임 꾸미기 제외 — 기존 드롭 규칙과 같다) */
export const CHEST_COSMETICS: readonly ItemDef[] = ITEMS.filter((i) => i.kind === "cosmetic" && isShopListed(i) && !isNameSlot(i.slot) && !!i.slot);
export const cosmeticsOfTier = (t: CosTier): readonly ItemDef[] => CHEST_COSMETICS.filter((i) => cosTierOf(i.price) === t);

/** 층별 등급 비율 [일반, 고급, 희귀, 전설]: 165층 아래는 고급까지, 180층 아래는 희귀까지, 180층부터 전설 3% (11/19 개편 — 직급 경계와 같이) */
export function cosTierWeights(f: number): readonly [number, number, number, number] {
  if (f < G_DAERI) return [60, 40, 0, 0];
  if (f < G_GWAJANG) return [45, 40, 15, 0];
  return [37, 40, 20, 3];
}
/** 기간: 1일 45% · 3일 30% · 7일 20% · 30일 5% (전설은 30일 대신 7일) */
export const COS_DAYS: readonly [number, number][] = [
  [1, 45],
  [3, 30],
  [7, 20],
  [30, 5],
];
export function rollCosDays(r: () => number, tier: CosTier): number {
  const d = pickWeighted(r, COS_DAYS, ([, w]) => w)[0];
  return tier === 3 && d === 30 ? 7 : d;
}

/**
 * 상자 하나의 꾸미기 굴림 (따로 시드 — 다른 굴림 수와 상관없이 같은 시드면 같은 결과).
 * sup = 테스트 서버 슈퍼 계정 시험 드롭: 확률 굴림을 건너뛰고 늘 하나 (등급·일수는 같은 규칙)
 */
export function chestCosmetic(floorSeedValue: number, f: number, sup = false): Drop | null {
  const r = seeded(floorSeedValue ^ 0x434f5354);
  if (r() >= CHEST_COSMETIC_CHANCE && !sup) return null;
  const w = cosTierWeights(f);
  const tier = pickWeighted(r, [0, 1, 2, 3] as CosTier[], (t) => w[t]);
  const pool = cosmeticsOfTier(tier);
  if (!pool.length) return null;
  const it = pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))];
  return { kind: "cosmetic", id: it.id, qty: 1, days: rollCosDays(r, tier) };
}

// ── 서버 결과 검증: 장비로 세진 만큼 처치 속도 상한을 늘린다 ──

/** 세트 장비 자리에 그 부위 상점 최고 장비 (강화 없이) 를 낀 것으로 바꾼 장착 칸 — 비교 기준 */
const TOP_SHOP: Record<SgPiece, string> = {
  weapon: "w_stamp",
  armor: "a_hazmat",
  head: "h_halo",
  acc1: "c_bonus",
  acc2: "c_bonus",
};
export function baselineEquip(equip: Partial<Record<GearSlot, string | null>>): Partial<Record<GearSlot, string | null>> {
  const out: Partial<Record<GearSlot, string | null>> = {};
  for (const [slot, id] of Object.entries(equip) as [GearSlot, string | null][]) {
    if (!id) out[slot] = id;
    else if (isSgCode(id)) {
      const it = decodeSg(id);
      out[slot] = it ? TOP_SHOP[sgPieceOf(it)] : null;
    } else out[slot] = shopEnhOf(id)[0];
  }
  return out;
}

/** 장비 힘 배율 상한 (11/15 강화 +15 = ×3.00으로 세져서 20 → 40) */
export const GEAR_POWER_MAX = 40;

const dps = (d: Derived) => d.atk * d.aspd * (1 + d.crit / 200) * d.skillPower;

/**
 * 장비 힘 배율 (판 시작 때 서버가 저장된 장착 칸으로 재서 티켓에 싣는다 — 화면 말은 안 믿는다):
 * 지금 장비의 초당 피해 ÷ 세트 장비를 상점 최고 장비로, 강화를 뺀 장비의 초당 피해 × 옵션·세트 효과가 가장 잘 터질 때 배율. 1..GEAR_POWER_MAX
 */
export function gearPower(level: number, stats: Stats, equip: Partial<Record<GearSlot, string | null>>): number {
  const now = derive(level, stats, equip);
  const base = derive(level, stats, baselineEquip(equip));
  const k = (dps(now) / Math.max(1e-6, dps(base))) * sgCombatPower(equip);
  return Math.min(GEAR_POWER_MAX, Math.max(1, Math.ceil(k * 100) / 100));
}
