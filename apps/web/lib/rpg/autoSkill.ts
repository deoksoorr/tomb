import { SKILL_FX, skillById, type SkillId } from "./skillTree";
import { autoBlock } from "./hotbar";

// 11/15 자동 스킬: 쿨이 끝났다고 바로 쓰지 않고, 스킬 종류마다 "쓸 만한 때"를 기다린다 (순수 함수 — 게임은 HuntScene이 상황을 모아 넘긴다).
// 손으로 쓰는 것보다 조금 덜 효율적이게 둔다 (사거리를 조금 짧게 보고, 광역은 3마리부터).

/** 자동으로 나가는 때의 종류 */
export type AutoRule = "target" | "area" | "point" | "buff" | "shield" | "heal" | "place";

export const AUTO_RULE: Partial<Record<SkillId, AutoRule>> = {
  // 한 명·부채꼴: 사거리 안에 적
  em_kindle: "target",
  em_fan: "target",
  fr_breath: "target",
  fr_icicle: "target",
  so_wisp: "target",
  // 내 둘레 광역 / 지점 광역 (가장 가까운 적 자리에 떨어진다 — targetPoint)
  em_ring: "area",
  fr_nova: "area",
  em_meteor: "point",
  fr_tomb: "point",
  so_harvest: "point",
  // 강화
  em_stoke: "buff",
  so_swift: "buff",
  // 지키기·회복
  fr_ward: "shield",
  so_lamp: "heal",
  // 놓기·부르기·끌어오기
  em_brazier: "place",
  fr_field: "place",
  so_friend: "place",
  so_lantern: "place",
  so_chain: "place",
};

/** 자동이 보는 사거리를 이만큼 짧게 (손으로 쓰는 쪽이 조금 낫게) */
export const AUTO_REACH = 0.85;
/** 광역·놓기는 이만큼 모였을 때 */
export const AUTO_CROWD = 3;
/** 강화: 최근 이만큼 안에 싸웠을 때 */
export const AUTO_FIGHT_MS = 3000;
/** 자동 시전 사이 최소 간격 */
export const AUTO_GAP_MS = 400;
/** 지키기: 체력 이 비율 아래 / 회복: 이 비율 아래 */
export const AUTO_SHIELD_HP = 0.7;
export const AUTO_HEAL_HP = 0.5;
/** 사거리 정보가 없는 부르기 스킬(길동무)이 보는 "가까이" */
const NEAR = 90;

/** 스킬 모양 (SKILL_FX에서): reach = 닿는 거리(지점 스킬은 떨어뜨릴 수 있는 거리), radius = 광역 반경 */
export function autoShape(id: SkillId, lv: number): { reach: number; radius: number } {
  const fx = (SKILL_FX as Record<string, (lv: number) => Record<string, unknown>>)[id]?.(Math.max(1, lv)) ?? {};
  const num = (k: string) => (typeof fx[k] === "number" ? (fx[k] as number) : 0);
  const reach = num("reach") || num("range");
  const radius = num("radius") || num("blast") || num("range") || NEAR;
  return { reach, radius };
}

/** 적 (게임 좌표, r = 몸 반지름) */
export type AutoFoe = { x: number; y: number; r: number; boss: boolean };

export type AutoCtx = {
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  now: number;
  /** 마지막으로 싸운(치거나 맞은) 시각 */
  lastFightAt: number;
  foes: readonly AutoFoe[];
  /** 켜져 있는 버프 id (em_stoke·so_swift·fr_ward …) */
  buffs: ReadonlySet<string>;
  /** 내 자리에 큰 공격 경고가 깔려 있다 */
  teleOnMe: boolean;
};

const gap = (f: AutoFoe, x: number, y: number) => Math.hypot(f.x - x, f.y - y);

/** (x,y) 둘레 radius 안 적 수와 우두머리가 있는지 (판정은 aoeAt과 같다: 거리 < 반경 + 몸 반지름) */
export function crowdAt(foes: readonly AutoFoe[], x: number, y: number, radius: number): { n: number; boss: boolean } {
  let n = 0;
  let boss = false;
  for (const f of foes) {
    if (gap(f, x, y) >= radius + f.r) continue;
    n++;
    if (f.boss) boss = true;
  }
  return { n, boss };
}

/** 가장 가까운 적 (거리 - 몸 반지름 < reach). HuntScene.nearest와 같은 잣대 */
export function nearestFoe(foes: readonly AutoFoe[], x: number, y: number, reach: number): AutoFoe | null {
  let best: AutoFoe | null = null;
  let bd = Infinity;
  for (const f of foes) {
    const d = gap(f, x, y) - f.r;
    if (d < reach && d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

/** 지금 이 스킬을 자동으로 쓸 만한가 (쿨·SP·침묵은 따로 본다) */
export function wantsCast(id: SkillId, lv: number, c: AutoCtx): boolean {
  if (autoBlock(id)) return false;
  const rule = AUTO_RULE[id];
  if (!rule) return false;
  const { reach, radius } = autoShape(id, lv);
  switch (rule) {
    case "target":
      return !!nearestFoe(c.foes, c.px, c.py, reach * AUTO_REACH);
    case "area": {
      const k = crowdAt(c.foes, c.px, c.py, radius * AUTO_REACH);
      return k.n >= AUTO_CROWD || k.boss;
    }
    case "point": {
      const t = nearestFoe(c.foes, c.px, c.py, reach * AUTO_REACH);
      if (!t) return false;
      const k = crowdAt(c.foes, t.x, t.y, radius * AUTO_REACH);
      return k.n >= AUTO_CROWD || k.boss;
    }
    case "buff":
      return c.now - c.lastFightAt <= AUTO_FIGHT_MS && !c.buffs.has(id);
    case "shield":
      return !c.buffs.has(id) && (c.hp < c.maxHp * AUTO_SHIELD_HP || c.teleOnMe);
    case "heal":
      return c.hp < c.maxHp * AUTO_HEAL_HP && !c.teleOnMe;
    case "place":
      return crowdAt(c.foes, c.px, c.py, radius).n >= AUTO_CROWD;
  }
}

/** 궁극기 SP 남겨 두기: 자동 시전 뒤에도 reserve만큼은 남아야 한다 */
export const autoSpOk = (sp: number, cost: number, reserve: number, keepUlt: boolean): boolean => sp - cost >= (keepUlt ? reserve : 0) && sp >= cost;

/** 궁극기 칸 스킬의 SP 비용 (없으면 0) */
export function ultReserve(ultId: SkillId | null | undefined, skills: Partial<Record<SkillId, number>>): number {
  const d = ultId ? skillById(ultId) : undefined;
  const lv = ultId ? (skills[ultId] ?? 0) : 0;
  return d && lv > 0 ? d.sp(lv) : 0;
}
