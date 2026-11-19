import { GOBLIN_GAP_MAX_MS, GOBLIN_GAP_MIN_MS, GOBLIN_JACKPOT_CHANCE, GOBLIN_JACKPOT_POINTS, GOBLIN_LIFE_MS, GOBLIN_POINTS_AVG, GOBLIN_POINTS_MAX, GOBLIN_POINTS_MIN, ITEMS, itemById, itemName, type DyeSpecial, DYE_SPECIAL_NAMES } from "@tomb/protocol";
import { DYE_TIERS, type DyeTier } from "@/lib/dye/palette";
import { RARITY_LABEL, RARITY_WEIGHT, type Rarity } from "@/lib/forage/catalog";
import { AUTO_CATCH_CHANCE, AUTO_FISH_EVERY_MS } from "@/lib/forage/auto";
import { SEA_HIGH_TIDE_BIG } from "@/lib/forage/rules";
import { SUNKEN_CHANCE, SUNKEN_CHANCE_AUTO } from "@/lib/forage/sunken";
import { FEST_RARE_BOOST } from "@/lib/forage/quests/urgent";
import { LOTTERY_SPLIT } from "@/lib/lottery";
import { DIFFICULTIES, DIFFS, POTIONS } from "@/lib/rpg/catalog";
import { ENH_DROP_FROM, ENH_FAIL_BONUS, ENHANCE_TABLE, inheritTo } from "@/lib/rpg/enhance";
import { HUNT_DROP_ROLLS, KILLS_PER_DROP_ROLL } from "@/lib/rpg/rewards";
import { SG_GRADE_NAMES, SG_LEGEND_CHANCE, SG_PIECE_LABEL, SG_PIECES, SG_SETS } from "@/lib/rpg/setGear";
import { CHEST_COSMETIC_CHANCE, chestDocs, chestSeals, COS_DAYS, COS_TIER_NAMES, cosTierWeights, SG_CHEST_CHANCE, SG_PIECE_WEIGHTS, sgGradeForFloor } from "@/lib/rpg/setGearRoll";
import { TOWER_BOSS_EVERY, TOWER_CHEST_FROM } from "@/lib/rpg/tower";
import { FEATHER_CHANCE, RED_FEATHER_SHARE } from "@/lib/sea/gull";
import { PERK_VALUES, TITLE_GRADE_NAMES } from "@/lib/titles";
import { WISH_BONUS_JACKPOT, WISH_BONUS_SPARKLE, WISH_LUCK_TABLE } from "@/lib/wish";
import { XMAS_BOX_FALLBACK, XMAS_BOX_TABLE } from "@/lib/xmas/box";

// 11/18 확률 안내 (사용자 「드롭률도 다 보여 주자」). 숫자는 모두 게임 규칙 상수에서 바로 읽는다 → 규칙이 바뀌면 안내도 같이 바뀐다.
// 상수로 빠져 있지 않은 몇 값만 여기 적어 두고, 어디서 왔는지 주석으로 남긴다 (바꿀 때 같이 고친다).

/** 사냥 처치 굴림에서 나온 것이 물약일 몫 (lib/rpg/rewards rollDrops의 0.55) */
export const HUNT_POTION_SHARE = 0.55;
/** 드롭 물약 종류 비율 (lib/rpg/rewards pickDropPotion: 커피 50 · 에너지드링크 35 · 야근 도시락 15) */
export const DROP_POTION_SHARES: readonly [string, number][] = [
  ["p_coffee", 0.5],
  ["p_energy", 0.35],
  ["p_lunchbox", 0.15],
];
/** 야근 빌딩 상자 물약 개수 (lib/rpg/tower towerChestDrops: 반반으로 1개 또는 2개) */
export const CHEST_TWO_POTIONS = 0.5;
/** 채집에서 같은 것이 2개 나올 확률, 갯벌 파기는 빼고 (lib/forage/rules gatherCount의 0.18) */
export const GATHER_DOUBLE = 0.18;
/** 별자리 잇기에서 물약을 굴리는 성적 기준 (lib/rpg/rewards miniReward의 perf ≥ 0.5) */
export const STARS_POTION_PERF = 0.5;

/** 0.1234 → "12.34%", 0.5 → "50%" (소수 둘째 자리까지, 끝 0은 뺀다) */
export function pct(v: number): string {
  const n = Number((v * 100).toFixed(2));
  return `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

export const DIFF_NAMES = DIFFICULTIES.map((d) => DIFFS[d].name);
const potionName = (id: string) => POTIONS.find((p) => p.id === id)?.name ?? id;

// ── 사냥터 ──

/** 다 깬 판(처치 굴림을 다 쓰고 우두머리를 잡은 판)에서 장비를 하나라도 받을 확률 */
export function gearAtLeastOne(d: (typeof DIFFICULTIES)[number]): number {
  const D = DIFFS[d];
  const perRoll = D.dropChance * (1 - HUNT_POTION_SHARE);
  return 1 - (1 - D.bossDropChance) * (1 - perRoll) ** HUNT_DROP_ROLLS;
}

export function huntRows(): string[][] {
  return [
    ["우두머리를 잡으면 장비", ...DIFFICULTIES.map((d) => pct(DIFFS[d].bossDropChance))],
    [`${KILLS_PER_DROP_ROLL}마리마다 장비나 물약`, ...DIFFICULTIES.map((d) => pct(DIFFS[d].dropChance))],
    ["다 깬 판에 장비 1개 이상", ...DIFFICULTIES.map((d) => pct(Math.round(gearAtLeastOne(d) * 1000) / 1000))],
    ["쓰러지지 않고 다 깨면 기간제 꾸미기", ...DIFFICULTIES.map((d) => pct(DIFFS[d].cosmeticChance))],
    ["나오는 장비 레벨", ...DIFFICULTIES.map((d) => `Lv.${Math.max(1, DIFFS[d].dropMaxLevel - 20)}~${DIFFS[d].dropMaxLevel}`)],
  ];
}

export const potionRows = (): string[][] => DROP_POTION_SHARES.map(([id, p]) => [potionName(id), pct(p)]);

/** 별자리 잇기: 성적이 기준을 넘으면 물약 한 번 굴림 (난이도별 처치 굴림 확률 그대로) */
export const starsPotionRow = (): string[] => ["물약 1개", ...DIFFICULTIES.map((d) => pct(DIFFS[d].dropChance))];

// ── 야근 빌딩 우두머리 상자 ──

/** 우두머리 층 구간마다 직급 ("50~99층 사원급" …). 상자가 열리는 우두머리 층만 본다 (11/19 TOWER_CHEST_FROM층부터) */
export function gradeBands(maxFloor = 200): { from: number; to: number | null; name: string }[] {
  const out: { from: number; to: number | null; name: string }[] = [];
  for (let f = TOWER_CHEST_FROM; f <= maxFloor; f += TOWER_BOSS_EVERY) {
    const name = SG_GRADE_NAMES[sgGradeForFloor(f)];
    const last = out[out.length - 1];
    if (last && last.name === name) continue;
    if (last) last.to = f - 1;
    out.push({ from: f, to: null, name });
  }
  return out;
}

const floorText = (b: { from: number; to: number | null }) => (b.to === null ? `${b.from}층부터` : `${b.from}~${b.to}층`);

export function chestRows(): string[][] {
  const sealFrom = [1, 2].map((n) => {
    for (let f = 1; f <= 200; f++) if (chestSeals(f) >= n) return f;
    return null;
  });
  return [
    ["상자", `${TOWER_CHEST_FROM}층부터 우두머리 층마다 열려요.`],
    ["물약", `1개 ${pct(1 - CHEST_TWO_POTIONS)}, 2개 ${pct(CHEST_TWO_POTIONS)}`],
    ["결재 서류", `늘 나와요. ${TOWER_CHEST_FROM}층 상자는 ${chestDocs(TOWER_CHEST_FROM)}장, 10층마다 1장씩 늘어요.`],
    ["인감 도장", sealFrom[0] ? `${sealFrom[0]}층부터 ${chestSeals(sealFrom[0])}개${sealFrom[1] ? `, ${sealFrom[1]}층부터 ${chestSeals(sealFrom[1])}개` : ""}예요.` : "나오지 않아요."],
    ["세트 장비", `${pct(SG_CHEST_CHANCE)}예요. 못 받은 횟수가 쌓여도 확률은 그대로예요.`],
    ["꾸미기", `${pct(CHEST_COSMETIC_CHANCE)}예요.`],
  ];
}

export const gradeRows = (): string[][] => gradeBands().map((b) => [floorText(b), b.name]);

/** 세트 장비 부위 비율 (장신구 두 칸은 합쳐서) */
export function pieceRows(): string[][] {
  const total = SG_PIECES.reduce((n, p) => n + SG_PIECE_WEIGHTS[p], 0);
  const by = new Map<string, number>();
  for (const p of SG_PIECES) by.set(SG_PIECE_LABEL[p], (by.get(SG_PIECE_LABEL[p]) ?? 0) + SG_PIECE_WEIGHTS[p]);
  return [...by].map(([name, w]) => [name, pct(w / total)]);
}
export const setShare = () => pct(1 / SG_SETS.length);
export const legendOption = () => ({ grade: SG_GRADE_NAMES[3], chance: pct(SG_LEGEND_CHANCE) });

/** 꾸미기 등급 비율 (층 구간마다 바뀌는 곳에서 끊는다) */
export function cosTierRows(): { head: string[]; rows: string[][] } {
  const bands: { from: number; w: readonly number[] }[] = [];
  for (let f = TOWER_CHEST_FROM; f <= 200; f += TOWER_BOSS_EVERY) {
    const w = cosTierWeights(f);
    const last = bands[bands.length - 1];
    if (!last || last.w.join() !== w.join()) bands.push({ from: f, w });
  }
  const head = ["층", ...COS_TIER_NAMES];
  const rows = bands.map((b, i) => {
    const next = bands[i + 1];
    const total = b.w.reduce((a, x) => a + x, 0);
    return [next ? `${b.from}~${next.from - TOWER_BOSS_EVERY}층` : `${b.from}층부터`, ...b.w.map((x) => (x > 0 ? pct(x / total) : "없어요"))];
  });
  return { head, rows };
}

export function cosDaysRows(): string[][] {
  const total = COS_DAYS.reduce((a, [, w]) => a + w, 0);
  return COS_DAYS.map(([d, w]) => [`${d}일`, pct(w / total)]);
}

// ── 강화 ──

export function enhanceRows(): string[][] {
  const out: string[][] = [];
  // 11/19 강화 개편: 비용(포인트)도 같이 보여 준다
  for (let t = 1; t < ENHANCE_TABLE.length; t++)
    out.push([`+${t}`, pct(ENHANCE_TABLE[t].rate), t - 1 >= ENH_DROP_FROM ? "한 단계 내려가요" : "그대로예요", `${ENHANCE_TABLE[t].cost.toLocaleString("ko-KR")}P`]);
  return out;
}
export const enhanceFailBonus = () => `${Math.round(ENH_FAIL_BONUS * 100)}%p`;

/**
 * 11/19 강화 승계: 재료(직급·강화) → 받는 직급마다 받는 강화. 받은 뒤 기본 능력치가 재료보다 떨어지지 않는 가장 낮은 단계 (갑옷 기준).
 * head = [재료, 대리급, 과장급, 임원급], 더 높은 직급만 받을 수 있어 아래·같은 직급 칸은 「—」
 */
export function inheritRows(): { head: string[]; rows: string[][] } {
  const grades = [0, 1, 2, 3] as const;
  const head = ["재료", ...grades.slice(1).map((g) => SG_GRADE_NAMES[g])];
  const rows: string[][] = [];
  for (const from of [0, 1, 2] as const)
    for (const e of [5, 10, 15]) {
      const cells = grades.slice(1).map((to) => {
        if (to <= from) return "—";
        const m = inheritTo(from, e, to);
        return m > 0 ? `+${m}` : "옮길 게 없어요";
      });
      rows.push([`${SG_GRADE_NAMES[from]} +${e}`, ...cells]);
    }
  return { head, rows };
}

// ── 낚시·채집 ──

const RARITIES: Rarity[] = [1, 2, 3, 4, 5];
export function rarityRows(): string[][] {
  const total = RARITIES.reduce((n, r) => n + RARITY_WEIGHT[r], 0);
  return RARITIES.map((r) => [RARITY_LABEL[r], String(RARITY_WEIGHT[r]), pct(RARITY_WEIGHT[r] / total)]);
}

const PERK_GRADES = ["silver", "gold", "legend", "mythic"] as const;
/** 낚시·채집 갈래 칭호 등급별 확률 */
export const perkRows = (group: "fish" | "forage"): string[][] => PERK_GRADES.map((g) => [TITLE_GRADE_NAMES[g], pct(PERK_VALUES[group][g])]);

export const forageFacts = () => ({
  sunken: pct(SUNKEN_CHANCE),
  sunkenAuto: pct(SUNKEN_CHANCE_AUTO),
  /** 11/19 자동 낚시: 찌를 올리는 간격과 한 번에 걸릴 확률 (lib/forage/auto) */
  autoEvery: `${Math.round(AUTO_FISH_EVERY_MS / 1000)}초`,
  autoCatch: pct(AUTO_CATCH_CHANCE),
  highTide: pct(SEA_HIGH_TIDE_BIG),
  gatherDouble: pct(GATHER_DOUBLE),
  festBoost: `${FEST_RARE_BOOST}배`,
});

// ── 바닷가 갈매기 ──

export const gullRows = (): string[][] => [
  ["갈매기 과자", `깃털 ${pct(FEATHER_CHANCE)}`],
  ["매운 새우 과자", `깃털 ${pct(FEATHER_CHANCE * (1 - RED_FEATHER_SHARE))}, 붉은 깃털 ${pct(FEATHER_CHANCE * RED_FEATHER_SHARE)}`],
];

// ── 소원 분수 ──

export const wishRows = (): string[][] => WISH_LUCK_TABLE.map((l) => [l.title, pct(l.chance / 100)]);
export const wishBonus = () => ({ jackpot: pct(WISH_BONUS_JACKPOT), sparkle: pct(WISH_BONUS_SPARKLE), none: pct(1 - WISH_BONUS_JACKPOT - WISH_BONUS_SPARKLE) });

// ── 황금 고블린 ──

export const goblinFacts = () => ({
  gap: `${GOBLIN_GAP_MIN_MS / 3_600_000}~${GOBLIN_GAP_MAX_MS / 3_600_000}시간`,
  life: `${GOBLIN_LIFE_MS / 1000}초`,
  // 11/19 보통 300~1,000P(10P 단위로 고르게) + 드물게 대박 2,000P
  points: `${GOBLIN_POINTS_MIN.toLocaleString("en-US")}~${GOBLIN_POINTS_MAX.toLocaleString("en-US")}P`,
  normal: pct(1 - GOBLIN_JACKPOT_CHANCE),
  jackpot: `${GOBLIN_JACKPOT_POINTS.toLocaleString("en-US")}P`,
  jackpotChance: pct(GOBLIN_JACKPOT_CHANCE),
  avg: `${Math.round(GOBLIN_POINTS_AVG).toLocaleString("en-US")}P`,
});

// ── 크리스마스 선물상자 ──

export function xmasRows(): string[][] {
  const live = XMAS_BOX_TABLE.filter((r) => r.weight > 0);
  const total = live.reduce((n, r) => n + r.weight, 0);
  return live.map((r) => [itemById(r.id)?.name ?? r.id, pct(r.weight / total)]);
}
export const xmasFallback = () => `${itemName(XMAS_BOX_FALLBACK.itemId)} ${XMAS_BOX_FALLBACK.count}개`;

// ── 행운권 ──

export const lotteryRows = (): string[][] => LOTTERY_SPLIT.map((p, i) => [`${i + 1}등`, `${p}%`]);
/** 산 사람이 n명일 때 한 사람이 어느 등수든 당첨될 확률 */
export const lotteryAny = (n: number) => (n <= 0 ? 0 : Math.min(1, LOTTERY_SPLIT.length / n));

// ── 무작위 염색권 ──

const DYE_ITEMS = ITEMS.filter((i) => i.kind === "dye" && i.dye?.mode === "random");
export function dyeRows(): string[][] {
  return DYE_ITEMS.flatMap((i) => {
    if (i.dye?.mode !== "random") return [];
    const spec = DYE_TIERS[i.dye.tier as DyeTier];
    if (!spec) return [];
    const total = spec.special.kinds.reduce((n, [, w]) => n + w, 0);
    const kinds = [...spec.special.kinds]
      .sort((a, b) => b[1] - a[1])
      .map(([k, w]) => `${DYE_SPECIAL_NAMES[k as DyeSpecial]} ${pct(Math.round((w / total) * 1000) / 1000)}`)
      .join(", ");
    return [[i.name, pct(spec.special.rate / 10_000), kinds]];
  });
}
