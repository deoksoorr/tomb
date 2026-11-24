import type { GearSlot, IconArt } from "@/lib/rpg/catalog";
import type { SgProcKind } from "@/lib/rpg/procs";
import { equippedSg, SG_SETS, sgCombat, type SgCombat, type SgItem } from "@/lib/rpg/setGear";

// 11/15 세트 장비 싸움 효과 (판 하나 동안): 옵션(치명타 피해·우두머리 피해·받는 피해·물약·재사용 시간)·4세트 효과·전설 옵션.
// 능력치에 바로 붙는 것(공격력·공속·치명·체력·SP·이속·스킬 피해 %, 2세트 효과)은 derive가 이미 넣었다 (판 시작 derived).
// HuntScene이 시각(now, 판 ms)·체력을 넘겨 부른다 — Phaser 없이 테스트한다 (game/rpg/setGearRun.test.ts).

/** 4세트·전설 옵션 숫자 */
export const SG_FX = {
  overtimeLowHp: 0.3,
  overtimeAtk: 0.25,
  overtimeGuard: 0.15,
  /** 11/19 야근 4세트: 늘 받는 피해 − (근접 생존) */
  overtimeAlways: 0.08,
  approvalAspd: 0.2,
  approvalMs: 3000,
  meetingCd: 0.15,
  tripIdleMs: 3000,
  tripHit: 0.4,
  /** 결재 완료: 우두머리 체력 30% 아래 */
  bossLow: 0.3,
  bossLowDmg: 0.25,
  /** 칼퇴: 판 시작 20초 공속 +30% */
  rushMs: 20_000,
  rushAspd: 0.3,
  /** 야근 수당: 처치마다 최대 체력 1% */
  killHeal: 0.01,
} as const;

export class SetGearRun {
  readonly c: SgCombat;
  private readonly four: Set<string>;
  private critUntil = -1;
  private lastHurt = 0;
  /** 출장 4세트: 이 시각에 친 공격은 모두 +40% (한 번 휘두름에 여러 마리) */
  private boostAt = -1;
  private nextSkillCut = false;
  private vacationUsed = false;
  private readonly items: SgItem[];
  /** 11/17 발동 표시를 띄울 효과 (HuntScene이 매 프레임 takeProcs로 가져가 showProc) */
  private procs: SgProcKind[] = [];
  /** 야근 4세트: 지난번에 본 체력이 30% 이상이었나 (위에서 아래로 떨어지는 순간만 알린다) */
  private lowAbove = true;
  /** 결재 완료: 30% 아래로 떨어진 걸 이미 알린 우두머리 */
  private bossLowSeen = new WeakSet<object>();

  constructor(equip: Partial<Record<GearSlot, string | null>>) {
    this.c = sgCombat(equip);
    this.four = new Set(this.c.four);
    this.items = equippedSg(equip);
  }

  get active(): boolean {
    return this.c.four.length > 0 || this.c.legends.length > 0 || this.c.critDmg + this.c.bossDmg + this.c.guard + this.c.potion + this.c.cdCut > 0;
  }

  /** 공격력 배율 (야근 4세트: 체력 30% 아래 +25%) */
  atkMul(hp: number, maxHp: number): number {
    return this.four.has("overtime") && hp < maxHp * SG_FX.overtimeLowHp ? 1 + SG_FX.overtimeAtk : 1;
  }

  /** 공격 속도 배율 (결재 4세트 치명타 뒤 3초 +20% · 칼퇴 판 시작 20초 +30%) */
  aspdMul(now: number): number {
    let k = 1;
    if (this.four.has("approval") && now < this.critUntil) k *= 1 + SG_FX.approvalAspd;
    if (this.c.legends.includes(2) && now < SG_FX.rushMs) k *= 1 + SG_FX.rushAspd;
    return k;
  }

  /**
   * 주는 피해 배율 (몬스터가 맞을 때마다): 치명타 피해·우두머리 피해·결재 완료(우두머리 30% 아래)·출장 4세트(3초 안 맞으면 다음 기본 공격 +40%).
   * crit이면 결재 4세트 공속 버프를 켠다
   */
  hitMul(now: number, o: { crit: boolean; boss: boolean; hpRatio: number; basic: boolean; magic?: boolean; who?: object }): number {
    // 11/19 물리 피해·마법 피해 옵션
    let k = 1 + (o.magic ? this.c.magicDmg : this.c.physDmg);
    if (o.crit) {
      // 치명타는 1.5배 → 옵션만큼 더 (1.5 + 0.15 = 1.65배)
      k *= (1.5 + this.c.critDmg) / 1.5;
      if (this.four.has("approval")) this.critUntil = now + SG_FX.approvalMs;
    }
    if (o.boss) {
      k *= 1 + this.c.bossDmg;
      if (this.c.legends.includes(1) && o.hpRatio < SG_FX.bossLow) {
        k *= 1 + SG_FX.bossLowDmg;
        if (o.who && !this.bossLowSeen.has(o.who)) {
          this.bossLowSeen.add(o.who);
          this.procs.push("bossLow");
        }
      }
    }
    if (o.basic && this.four.has("trip") && (now - this.lastHurt >= SG_FX.tripIdleMs || now === this.boostAt)) {
      this.boostAt = now;
      this.lastHurt = now;
      k *= 1 + SG_FX.tripHit;
    }
    return k;
  }

  /** 출장 4세트 버프가 차 있나 (화면 표시용) */
  tripReady(now: number): boolean {
    return this.four.has("trip") && now - this.lastHurt >= SG_FX.tripIdleMs;
  }

  /** 받는 피해 배율 (옵션 받는 피해 − · 야근 4세트 늘 −8% · 체력 30% 아래 −15% 더). 맞은 시각을 적는다 (출장 4세트) */
  takenMul(now: number, hp: number, maxHp: number): number {
    this.lastHurt = now;
    let k = 1 - this.c.guard;
    if (this.four.has("overtime")) k *= 1 - SG_FX.overtimeAlways;
    if (this.four.has("overtime") && hp < maxHp * SG_FX.overtimeLowHp) k *= 1 - SG_FX.overtimeGuard;
    return k;
  }

  /** 연차: 한 판에 한 번, 쓰러질 피해를 받아도 체력 1로 */
  saveFromDeath(): boolean {
    if (!this.c.legends.includes(3) || this.vacationUsed) return false;
    this.vacationUsed = true;
    this.procs.push("vacation");
    return true;
  }

  /** 11/17 매 프레임 체력을 본다: 야근 4세트는 30% 위에서 아래로 떨어지는 순간 알린다 (아래에 머무는 동안은 한 번만) */
  watch(hp: number, maxHp: number): void {
    const low = hp > 0 && hp < maxHp * SG_FX.overtimeLowHp;
    if (this.four.has("overtime") && low && this.lowAbove) this.procs.push("overtimeFour");
    this.lowAbove = !low;
  }

  /** 11/17 쌓인 발동 효과를 꺼낸다 (꺼내면 비운다) */
  takeProcs(): SgProcKind[] {
    if (!this.procs.length) return [];
    const out = this.procs;
    this.procs = [];
    return out;
  }

  /** 11/17 발동 표시에 쓸 장비 그림과 직급: 그 전설 옵션이 붙은 장비, 세트 효과면 그 세트 장비 (무기 먼저) */
  procIcon(kind: SgProcKind): { icon: IconArt; grade: number } | null {
    const pick =
      kind === "overtimeFour"
        ? this.items.filter((it) => SG_SETS[it.s] === "overtime").sort((a, b) => a.p - b.p)[0]
        : this.items.find((it) => it.L === (kind === "vacation" ? 3 : 1));
    return pick ? { icon: { shape: `sg:${pick.s}${pick.p}${pick.g}`, main: 0, accent: 0 }, grade: pick.g } : null;
  }

  /** 물약 회복 배율 */
  potionMul(): number {
    return 1 + this.c.potion;
  }

  /** 스킬 재사용 시간 배율 (옵션 · 회의 4세트: 스킬을 쓴 뒤 다음 스킬 −15%). 스킬을 쓸 때 한 번 부른다 */
  cdMul(): number {
    let k = 1 - this.c.cdCut;
    if (this.nextSkillCut) k *= 1 - SG_FX.meetingCd;
    this.nextSkillCut = this.four.has("meeting");
    return k;
  }

  /** 야근 수당: 처치마다 회복할 체력 */
  killHeal(maxHp: number): number {
    return this.c.legends.includes(4) ? Math.max(1, Math.round(maxHp * SG_FX.killHeal)) : 0;
  }
}

/** 강화 무기 빛: +10 푸른 빛 · +13 보랏빛 · +15 금빛 (없으면 null) */
export function weaponGlow(e: number): { color: number; light: number; spark: boolean } | null {
  if (e >= 15) return { color: 0xffc83c, light: 0xfff2a8, spark: true };
  if (e >= 13) return { color: 0xb070ff, light: 0xe6d0ff, spark: false };
  if (e >= 10) return { color: 0x4aa8ff, light: 0xc8e8ff, spark: false };
  return null;
}
