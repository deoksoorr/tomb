import type { GearSlot, IconArt } from "@/lib/rpg/catalog";
import { activeSets, eggKnown, equippedSg, SG_EGG_BIT, SG_EGG_FX, SG_SETS, type SgItem, type SgSet } from "@/lib/rpg/setGear";

// 11/19 숨겨진 5세트 효과 (판 하나 동안 — 숫자·설명은 lib/rpg/setGear SG_EGG). 같은 세트 다섯 부위를 다 끼면 켜진다.
// 대부분 연출이고 성능은 아주 작다: 칼퇴 본능(남은 10초 이동 +20%) · 도장 쾅(치명타에 가끔 0.3초 멈춤) · 회의(스킬에 가끔 둘레 1초 느려짐) ·
// 마일리지 적립(걸은 거리가 차면 다음 기본 공격 한 번 +30% — 서버 처치 속도 상한 sgCombatPower에 넣었다).
// HuntScene이 시각(now, 판 ms)·남은 시간·걸은 거리를 넘겨 부르고, 그림(말풍선·도장·졸음·발밑 표시)은 HuntScene이 그린다.
// 처음 켜진 세트는 takeFound로 꺼내 「발견!」 알림 + 서버 저장 (이미 발견한 세트는 다시 알리지 않는다). Phaser 없이 테스트한다 (setEggRun.test.ts).

export class SetEggRun {
  readonly five: ReadonlySet<SgSet>;
  private known: number;
  private found: SgSet[] = [];
  private readonly items: SgItem[];
  private readonly rnd: () => number;
  private leaving = false;
  private stampReady = 0;
  private talkReady = 0;
  private mile = 0;
  /** 마일리지가 가득 찬 뒤 처음 친 시각 (한 번 휘두름에 여러 마리면 모두 +30%) */
  private boostAt = -1;

  /** known = 이미 발견한 비트 (캐릭터 sgEgg) */
  constructor(equip: Partial<Record<GearSlot, string | null>>, known = 0, rnd: () => number = Math.random) {
    this.five = new Set(activeSets(equip).five);
    this.known = known;
    this.items = equippedSg(equip);
    this.rnd = rnd;
  }

  get any(): boolean {
    return this.five.size > 0;
  }

  has(set: SgSet): boolean {
    return this.five.has(set);
  }

  private fire(set: SgSet): void {
    if (eggKnown(this.known, set) || this.found.includes(set)) return;
    this.found.push(set);
  }

  /** 처음 켜진 (아직 발견 못 한) 세트를 꺼낸다 (꺼내면 비운다) */
  takeFound(): SgSet[] {
    if (!this.found.length) return [];
    const out = this.found;
    this.found = [];
    for (const s of out) this.known |= SG_EGG_BIT[s];
    return out;
  }

  /**
   * 칼퇴 본능 (야근): 남은 시간 leftMs → 이동 속도 배율. start = 이번에 막 켜졌다 (「퇴근!」 말풍선 — 층마다 한 번).
   * 남은 시간이 다시 늘면(다음 층) 꺼진다. paused = 엘리베이터·층 정리 중 (재지 않는다)
   */
  leave(leftMs: number, paused = false): { mul: number; start: boolean } {
    if (!this.five.has("overtime") || paused) return { mul: this.leaving ? 1 + SG_EGG_FX.leaveMove : 1, start: false };
    const on = leftMs > 0 && leftMs <= SG_EGG_FX.leaveMs;
    const start = on && !this.leaving;
    this.leaving = on;
    if (start) this.fire("overtime");
    return { mul: on ? 1 + SG_EGG_FX.leaveMove : 1, start };
  }

  /** 도장 쾅 (결재): 치명타가 터졌을 때 부른다 → 이번에 찍나 (쉬는 시간 안이면 굴리지 않는다) */
  stamp(now: number): boolean {
    if (!this.five.has("approval") || now < this.stampReady) return false;
    if (this.rnd() >= SG_EGG_FX.stampChance) return false;
    this.stampReady = now + SG_EGG_FX.stampCdMs;
    this.fire("approval");
    return true;
  }

  /** 회의가 길어진다 (회의): 스킬을 쓸 때 부른다 → 이번에 둘레 적이 조나 */
  talk(now: number): boolean {
    if (!this.five.has("meeting") || now < this.talkReady) return false;
    if (this.rnd() >= SG_EGG_FX.talkChance) return false;
    this.talkReady = now + SG_EGG_FX.talkCdMs;
    this.fire("meeting");
    return true;
  }

  /** 마일리지 적립 (출장): 걸은 거리(px)를 더한다 → 이번에 막 가득 찼나 */
  walk(dist: number): boolean {
    if (!this.five.has("trip") || dist <= 0 || this.mile >= SG_EGG_FX.mileFull) return false;
    this.mile = Math.min(SG_EGG_FX.mileFull, this.mile + dist);
    if (this.mile < SG_EGG_FX.mileFull) return false;
    this.fire("trip");
    return true;
  }

  /** 발밑 마일리지 (0..1) */
  mileRatio(): number {
    return this.five.has("trip") ? this.mile / SG_EGG_FX.mileFull : 0;
  }

  /** 주는 피해 배율 (몬스터가 맞을 때마다): 마일리지가 가득이면 기본 공격 한 번(같은 시각에 맞은 몬스터 모두) +30%, 그리고 비운다 */
  hitMul(now: number, basic: boolean): number {
    if (!this.five.has("trip")) return 1;
    if (now === this.boostAt) return 1 + SG_EGG_FX.tripHit;
    if (!basic || this.mile < SG_EGG_FX.mileFull) return 1;
    this.mile = 0;
    this.boostAt = now;
    return 1 + SG_EGG_FX.tripHit;
  }

  /** 알림에 쓸 그림: 그 세트 무기 (없으면 가장 앞 부위) */
  icon(set: SgSet): { icon: IconArt; grade: number } | null {
    const pick = this.items.filter((it) => SG_SETS[it.s] === set).sort((a, b) => a.p - b.p)[0];
    return pick ? { icon: { shape: `sg:${pick.s}${pick.p}${pick.g}`, main: 0, accent: 0 }, grade: pick.g } : null;
  }
}
