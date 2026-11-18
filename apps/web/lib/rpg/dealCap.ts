import { derive } from "./formulas";
import { sgCombatPower } from "./setGear";
import { SKILL_FX, skillMods, type SkillId } from "./skillTree";
import type { GearSlot, MonsterId, Stats } from "./catalog";
import type { HuntWave } from "./plan";

// 11/18 「그 속도로 때릴 수 있나」 검사 (보안 검토): 피하기·버티기는 실력이라 보지 않고, 넣을 수 있는 피해의 상한만 본다.
// 판 시작 때 서버가 저장된 캐릭터(능력치·장비·스킬 트리)로 한 마리에게 넣을 수 있는 초당 최대 피해(dm)를 넉넉하게 재서 티켓에 싣고,
// 판 끝에 그 판에서 쓰러뜨린 몬스터 체력 합 ÷ (dm × 카드 배율 × 여러 마리 타격 × 여유) = 가장 빠른 시간보다 빨리 깼다고 하면 의심 판이다.
// 넉넉하게 잡는 것들 (실제로는 이만큼 못 낸다):
//  - 매번 맞힘, 매번 치명타(1.5배, 방어 무시)
//  - 스킬 트리 공격력(화롯가 온기)과 불씨 지피기 버프가 늘 켜져 있음
//  - 세트 장비 옵션·2·4세트 효과·전설 옵션이 가장 잘 터짐 (sgCombatPower — 야근 4세트 저체력 공격력·결재 공속 포함)
//  - 스킬(불씨·메테오·얼음 무덤·화면 전체 궁극기 …)·소환(길동무 넋·초롱·화로)·발동 효과를 합쳐 기본 공격의 SKILL_K배
//  - 약화(넋 사슬·얼음 무덤·서리밭·살얼음)로 VULN_K배 더 받음
//  - 한 번에 AOE_K마리를 함께 때림 (야근 빌딩 웨이브는 9~12마리 — 화면 전체 궁극기는 웨이브 전부)
//  - 그 위에 다시 MARGIN배. 카드(능력 카드 — 피해·공속·치명·연쇄·폭발·원샷 …)는 판 끝에 cardPower로 따로 곱한다
// 11/18 사용자 「유저의 컨트롤도 중요하게」: 정상 상위권이 걸리지 않게 넉넉하게 (SKILL_K 3→6, AOE_K 6→12, MARGIN 2→3)
// 의심 판은 버리지 않고 관리자 확인(「확인 필요」)으로 보낸다 → 계산이 틀려도 억울하게 잃는 사람은 없다

export const SKILL_K = 6;
export const VULN_K = 1.5;
export const AOE_K = 12;
export const MARGIN = 3;
/** 치명타 피해 (lib/rpg/formulas damage — 1.5배, 방어 무시) */
const CRIT = 1.5;
/** 티켓에 싣는 값의 상한 (형식 검사) */
export const DEAL_MAX = 1e12;

/**
 * 한 마리에게 넣을 수 있는 초당 최대 피해 (카드·여러 마리 타격 빼고). 저장된 캐릭터로만 잰다 (화면 말은 안 믿는다).
 * 공격력 × 공격 속도 × 치명타 × 스킬 힘 × 세트 장비 전투 배율(옵션·세트 효과가 가장 잘 터질 때) × 스킬 트리 공격력 × 스킬·약화 여유
 */
export function maxDealPerSec(level: number, stats: Stats, equip: Partial<Record<GearSlot, string | null>>, skills: Partial<Record<SkillId, number>>): number {
  const d = derive(level, stats, equip);
  const m = skillMods(skills);
  const stoke = skills.em_stoke ? SKILL_FX.em_stoke(skills.em_stoke).atk : 0;
  const atk = d.atk * (1 + Math.max(0, m.atkPct)) * (1 + stoke);
  const v = atk * d.aspd * CRIT * d.skillPower * sgCombatPower(equip) * SKILL_K * VULN_K;
  return Math.min(DEAL_MAX, Math.max(1, Math.ceil(v)));
}

/** 계획 몬스터 체력 합 (hpOf = 그 판·층 몬스터 최대 체력) */
export function planHp(plan: readonly HuntWave[], hpOf: (id: MonsterId) => number): number {
  let hp = 0;
  for (const w of plan) for (const m of w.monsters) hp += hpOf(m);
  return hp;
}

/** 체력 hp를 초당 최대 피해 dm(카드 배율 cards)으로 쓰러뜨리는 가장 빠른 시간 (초) */
export function minDealSec(hp: number, dm: number, cards = 1): number {
  const rate = dm * Math.max(1, cards) * AOE_K * MARGIN;
  return rate > 0 ? hp / rate : Infinity;
}

/** 형식 검사 (티켓 dm) */
export const isDeal = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= DEAL_MAX;
