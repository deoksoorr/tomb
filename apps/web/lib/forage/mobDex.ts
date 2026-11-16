import { DIFFICULTIES, HUNT_ZONES, MONSTERS, MONSTER_IDS, TOWER_ZONE_IDS, ZONE_IDS, type Difficulty, type MonsterId, type ZoneId } from "../rpg/catalog";
import type { Rarity } from "./catalog";

// 도감의 「몬스터」 칸 (11/16): 사냥터·야근 빌딩에서 처음 쓰러뜨린 몬스터를 등록한다.
// 기록은 낚시·채집 도감과 같은 해시(forage:{a}:dex)의 n:{몬스터 id}·first:{몬스터 id} (처치 수·처음 잡은 날).
// 서버가 받아들인 판(거절·의심 판 제외)의 검증된 처치 수만 더한다 (lib/rpg/service recordMobKills). 배포 전 처치는 남아 있지 않아 배포 뒤부터 센다.
// 여기는 화면·서버 공용 순수 정의: 사는 곳(묶음)·역할·희귀도(처음 등록 보상)·처치 표시.

/** 몬스터가 맡는 자리 (우두머리·정예·중간 우두머리·졸개·보통) */
export type MobRole = "boss" | "mid" | "elite" | "minion" | "normal";
export const MOB_ROLE_LABEL: Record<Exclude<MobRole, "normal">, string> = { boss: "우두머리", mid: "중간 우두머리", elite: "정예", minion: "졸개" };

/** 화면 묶음 하나 = 사냥터 하나 또는 야근 빌딩 테마 하나 (처음 나오는 곳 기준) */
export type MobGroup = { zone: ZoneId; name: string; tower: boolean; difficulty: Difficulty; ids: MonsterId[] };

const ZONE_ORDER: readonly ZoneId[] = [...ZONE_IDS, ...TOWER_ZONE_IDS];
const isTower = (z: ZoneId) => (TOWER_ZONE_IDS as readonly string[]).includes(z);
/** 야근 빌딩 테마 몬스터 id 앞자리 (sv_·mt_ …) → 테마 (우두머리 id로 정한다 — 계획 밖에서 불려 나오는 졸개도 제자리를 찾게) */
const prefixOf = (id: string) => `${id.split("_")[0]}_`;
const TOWER_BY_PREFIX = new Map(TOWER_ZONE_IDS.map((z) => [prefixOf(HUNT_ZONES[z].boss), z as ZoneId]));

/** 그 사냥터에 나오는 몬스터 (웨이브·우두머리·정예·중간 우두머리·졸개 부르기, 갈라진 조각까지) */
function zoneMobs(z: ZoneId): MonsterId[] {
  const d = HUNT_ZONES[z];
  const out = new Set<MonsterId>([...d.pool, d.boss, ...(d.elite ? [d.elite] : []), ...(d.mid ? [d.mid] : []), d.summon.id]);
  for (const id of out) {
    const sp = MONSTERS[id].split;
    if (sp) out.add(sp.id);
  }
  return [...out];
}

const WHERE = new Map<MonsterId, ZoneId[]>();
for (const z of ZONE_ORDER) for (const id of zoneMobs(z)) WHERE.set(id, [...(WHERE.get(id) ?? []), z]);
for (const id of MONSTER_IDS) {
  if (WHERE.has(id)) continue;
  const t = TOWER_BY_PREFIX.get(prefixOf(id));
  if (t) WHERE.set(id, [t]);
}

/** 그 몬스터가 나오는 곳 (사냥터 순서 → 야근 빌딩 테마 순서). 모르면 빈 목록 */
export const mobWhere = (id: MonsterId): ZoneId[] => WHERE.get(id) ?? [];
/** 나오는 곳 이름 (야근 빌딩 테마는 앞에 「야근 빌딩」) */
export const mobZoneName = (z: ZoneId): string => (isTower(z) ? `야근 빌딩 ${HUNT_ZONES[z].name}` : HUNT_ZONES[z].name);

/** 몬스터의 자리: 우두머리 > 중간 우두머리 > 정예 > 졸개 > 보통 (우두머리 동작이거나 어느 사냥터의 마지막 우두머리면 우두머리) */
export function mobRole(id: MonsterId): MobRole {
  const m = MONSTERS[id];
  const zones = mobWhere(id).map((z) => HUNT_ZONES[z]);
  if (m.behavior === "boss" || zones.some((z) => z.boss === id)) return "boss";
  if (zones.some((z) => z.mid === id)) return "mid";
  if (zones.some((z) => z.elite === id)) return "elite";
  return m.minion ? "minion" : "normal";
}

/** 나오는 곳 중 가장 쉬운 난이도 (야근 빌딩은 지옥) */
function easiest(id: MonsterId): Difficulty {
  const ds = mobWhere(id).map((z) => DIFFICULTIES.indexOf(HUNT_ZONES[z].difficulty));
  return DIFFICULTIES[ds.length ? Math.min(...ds) : DIFFICULTIES.length - 1];
}

/**
 * 처음 등록 보상용 희귀도 (도감 공통 DEX_NEW_REWARD). 칸 수가 다른 칸의 네다섯 배라 보통 몬스터와 졸개는 ★1(3P),
 * 야근 빌딩 정예와 중간 우두머리는 ★2(6P), 우두머리는 쉬움·보통 사냥터 ★3(12P), 어려움 이상과 야근 빌딩 ★4(25P).
 * 칸 전체 합이 다른 도감 칸 두세 개 몫이라 ★5는 쓰지 않는다 (도감 보상 총합 상한 — lib/forage/forage.test)
 */
export function mobRarity(id: MonsterId): Rarity {
  const role = mobRole(id);
  if (role === "boss") {
    const d = easiest(id);
    return d === "easy" || d === "normal" ? 3 : 4;
  }
  return role === "mid" || role === "elite" ? 2 : 1;
}

/** 화면 묶음: 처음 나오는 곳마다 (사냥터 열리는 순서 → 야근 빌딩 테마), 묶음 안은 보통 → 졸개 → 정예 → 우두머리 순 */
const ROLE_ORDER: Record<MobRole, number> = { normal: 0, minion: 1, elite: 2, mid: 3, boss: 4 };
export const MOB_GROUPS: readonly MobGroup[] = ZONE_ORDER.map((zone) => {
  const ids = MONSTER_IDS.filter((id) => mobWhere(id)[0] === zone).sort((a, b) => ROLE_ORDER[mobRole(a)] - ROLE_ORDER[mobRole(b)]);
  const z = HUNT_ZONES[zone];
  return { zone, name: mobZoneName(zone), tower: isTower(zone), difficulty: z.difficulty, ids };
}).filter((g) => g.ids.length > 0);

/** 도감 칸 순서 (묶음 순서대로 — 어느 묶음에도 없는 몬스터는 맨 뒤) */
export const MOB_DEX_IDS: readonly MonsterId[] = (() => {
  const grouped = MOB_GROUPS.flatMap((g) => g.ids);
  const seen = new Set(grouped);
  return [...grouped, ...MONSTER_IDS.filter((id) => !seen.has(id))];
})();

const MOB_SET = new Set<string>(MONSTER_IDS);
export const isMobId = (id: string): id is MonsterId => MOB_SET.has(id);

/** 처치 표시 (보상 없이 칸에 도장만): 100·1,000·10,000마리 */
export const MOB_MARKS = [100, 1_000, 10_000] as const;
/** 닿은 처치 표시와 다음 표시 (다 닿았으면 next = null) */
export function mobMarks(n: number): { reached: number[]; next: number | null } {
  return { reached: MOB_MARKS.filter((m) => n >= m), next: MOB_MARKS.find((m) => n < m) ?? null };
}

/** 한 판에서 도감에 더하는 몬스터당 처치 수 상한 (검증을 통과한 수라 실제로 닿지 않는 안전 여유) */
export const MOB_KILLS_PER_RUN_MAX = 5_000;

/**
 * 판 결과의 처치 기록 → 도감에 더할 목록: 아는 몬스터 id만, 양의 정수만, 몬스터당 상한까지 (도감 칸 순서와 무관하게 입력 순서)
 */
export function mobKillItems(kills: Partial<Record<string, number>>): { id: MonsterId; n: number }[] {
  const out: { id: MonsterId; n: number }[] = [];
  for (const [id, raw] of Object.entries(kills)) {
    const n = Math.floor(Number(raw));
    if (!isMobId(id) || !Number.isFinite(n) || n <= 0) continue;
    out.push({ id, n: Math.min(n, MOB_KILLS_PER_RUN_MAX) });
  }
  return out;
}
