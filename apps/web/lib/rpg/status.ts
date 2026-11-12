import type { Difficulty, IconArt, MonsterId } from "./catalog";
import type { PatternId } from "./patterns";

// 몬스터가 거는 상태 이상 (Phaser 없음 — 게임·안내서·테스트가 같은 표를 쓴다).
// 몇몇 몬스터의 공격·우두머리 기술이 맞으면 확률로 걸린다. 같은 상태는 겹치지 않고 남은 시간·세기만 새로 고친다.
// 상태가 끝나거나 풀리면 같은 상태에 잠깐 면역이다 (빙결·혼란이 연달아 걸려 손을 못 쓰는 일을 막는다).
// 서버 검증과는 상관없다: 서버는 처치 수·웨이브·시간만 보고, 상태 이상은 플레이어를 더 힘들게 할 뿐이다.

export const STATUS_IDS = ["poison", "burn", "bleed", "slow", "freeze", "confuse", "silence"] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export type StatusDef = {
  id: StatusId;
  name: string;
  /** 안내서·HUD 한 줄 설명 */
  desc: string;
  /** 캐릭터 색·입자 색 */
  color: number;
  art: IconArt;
  /** 보통 난이도 기준 지속 ms */
  durMs: number;
  /** 지속 피해: 초당 최대 HP 비율 (보통 기준) */
  dotPct?: number;
  /** 지속 피해 간격 ms */
  tickMs?: number;
  /** 둔화: 이동속도 감소 비율 (보통 기준) */
  slow?: number;
  /** 끝나거나 풀린 뒤 같은 상태에 면역인 ms */
  immuneMs: number;
};

export const STATUSES: Record<StatusId, StatusDef> = {
  poison: {
    id: "poison",
    name: "독",
    desc: "매초 최대 HP의 일부를 잃어요. 오래가요.",
    color: 0x8ad04a,
    art: { shape: "st_poison", main: 0x8ad04a, accent: 0x3a6a1e },
    durMs: 6000,
    dotPct: 0.012,
    tickMs: 1000,
    immuneMs: 1000,
  },
  burn: {
    id: "burn",
    name: "화상",
    desc: "짧지만 독보다 아프게 타들어 가요.",
    color: 0xff8a3c,
    art: { shape: "st_burn", main: 0xff8a3c, accent: 0xffe08a },
    durMs: 3000,
    dotPct: 0.025,
    tickMs: 500,
    immuneMs: 1000,
  },
  bleed: {
    id: "bleed",
    name: "출혈",
    desc: "움직이는 동안 더 많이 잃어요. 멈춰 서면 덜 아파요.",
    color: 0xe04848,
    art: { shape: "st_bleed", main: 0xe04848, accent: 0x7a1a1a },
    durMs: 5000,
    dotPct: 0.006,
    tickMs: 500,
    immuneMs: 1000,
  },
  slow: {
    id: "slow",
    name: "둔화",
    desc: "발이 무거워져 느려져요.",
    color: 0x7aa8e8,
    art: { shape: "st_slow", main: 0x7aa8e8, accent: 0x2a3e6a },
    durMs: 3000,
    slow: 0.35,
    immuneMs: 1000,
  },
  freeze: {
    id: "freeze",
    name: "빙결",
    desc: "아주 잠깐 얼어붙어 움직이지도 때리지도 못해요.",
    color: 0xa8e8ff,
    art: { shape: "st_freeze", main: 0xa8e8ff, accent: 0x3a8ac8 },
    durMs: 800,
    immuneMs: 3000,
  },
  confuse: {
    id: "confuse",
    name: "혼란",
    desc: "잠깐 이동 방향이 거꾸로 돼요.",
    color: 0xd890ff,
    art: { shape: "st_confuse", main: 0xd890ff, accent: 0x6a3a9a },
    durMs: 2200,
    immuneMs: 2500,
  },
  silence: {
    id: "silence",
    name: "침묵",
    desc: "스킬을 쓸 수 없어요. 공격·포션은 돼요.",
    color: 0xb0b0c0,
    art: { shape: "st_silence", main: 0xd8d8e0, accent: 0x5a5a6a },
    durMs: 3500,
    immuneMs: 1500,
  },
};

/** 둔화 상한 (아무리 세도 이만큼까지만 느려진다) */
export const MAX_SLOW = 0.6;
/** 출혈: 움직이는 동안 지속 피해 배율 */
export const BLEED_MOVE_MULT = 2.5;
/** 빙결·혼란 지속 상한 ms (지옥에서도 이보다 길지 않다) */
const HARD_CAP_MS: Partial<Record<StatusId, number>> = { freeze: 1200, confuse: 3000 };

/** 난이도별: 걸릴 확률·지속·세기 배율 (어려울수록 세다) */
export const STATUS_DIFF: Record<Difficulty, { chance: number; dur: number; power: number }> = {
  easy: { chance: 0.7, dur: 0.8, power: 0.75 },
  normal: { chance: 1, dur: 1, power: 1 },
  hard: { chance: 1.2, dur: 1.15, power: 1.3 },
  hell: { chance: 1.45, dur: 1.3, power: 1.6 },
};

/** 몬스터 공격 한 번에 붙는 상태: on이 있으면 그 패턴(사격은 쏜 패턴)으로 맞았을 때만 */
export type StatusRule = { status: StatusId; chance: number; on?: readonly PatternId[] };

/**
 * 몬스터·사냥터 성격에 맞춘 상태 이상 (보통 난이도 확률).
 * 잡몹은 한 가지, 우두머리는 큰 기술(단계 패턴)에 하나씩. 물기만 하는 첫 사냥터 잡몹 몇은 일부러 비워 둔다.
 */
export const MONSTER_STATUS: Partial<Record<MonsterId, readonly StatusRule[]>> = {
  // 회의실·레거시 숲·마감 늪
  endless_meeting: [{ status: "slow", chance: 0.25 }],
  tech_debt_slime: [{ status: "slow", chance: 0.3 }],
  req_change: [{ status: "confuse", chance: 0.18 }],
  merge_conflict: [{ status: "confuse", chance: 0.15 }],
  server_bill: [{ status: "burn", chance: 0.6, on: ["self_destruct"] }],
  opposing_lead: [{ status: "silence", chance: 0.25, on: ["aimed_shot", "fan_volley", "slam", "nova"] }],
  legacy_golem: [
    { status: "bleed", chance: 0.35, on: ["charge", "cross"] },
    { status: "freeze", chance: 0.3, on: ["slam"] },
  ],
  burnout_wraith: [{ status: "freeze", chance: 0.2, on: ["ambush"] }],
  prod_dragon: [
    { status: "burn", chance: 0.5, on: ["fan_volley", "slam", "rain", "nova"] },
    { status: "bleed", chance: 0.3, on: ["charge", "cross"] },
  ],
  // 출근길 지하철
  phone_zombie: [{ status: "slow", chance: 0.22 }],
  backpack_turtle: [{ status: "freeze", chance: 0.25, on: ["charge"] }],
  express_train: [
    { status: "freeze", chance: 0.4, on: ["charge"] },
    { status: "bleed", chance: 0.3, on: ["cross"] },
  ],
  // 헬스장
  dumbbell_imp: [{ status: "bleed", chance: 0.18 }],
  protein_shaker: [{ status: "poison", chance: 0.6, on: ["self_destruct"] }],
  treadmill_ghost: [{ status: "slow", chance: 0.3, on: ["ambush"] }],
  membership_titan: [
    { status: "freeze", chance: 0.35, on: ["slam"] },
    { status: "slow", chance: 0.45, on: ["nova", "rain"] },
  ],
  // 도서관
  flying_book: [{ status: "bleed", chance: 0.22 }],
  night_owl: [{ status: "silence", chance: 0.3 }],
  eraser_crumb: [{ status: "slow", chance: 0.2 }],
  exam_paper: [
    { status: "bleed", chance: 0.35, on: ["cross", "fan_volley"] },
    { status: "silence", chance: 0.35, on: ["nova", "rain"] },
  ],
  // 장바구니 정글
  impulse_vine: [{ status: "poison", chance: 0.3 }],
  runaway_cart: [{ status: "freeze", chance: 0.25, on: ["charge"] }],
  black_friday: [
    { status: "confuse", chance: 0.35, on: ["nova", "cross"] },
    { status: "slow", chance: 0.35, on: ["rain", "slam"] },
  ],
  // 방학 숙제 사막
  diary_mummy: [{ status: "poison", chance: 0.25 }],
  essay_cactus: [{ status: "bleed", chance: 0.3 }],
  sand_worm: [{ status: "slow", chance: 0.3, on: ["ambush"] }],
  homework_sphinx: [
    { status: "confuse", chance: 0.35, on: ["cross", "rain"] },
    { status: "silence", chance: 0.35, on: ["nova", "slam"] },
  ],
  // 밤 축제장
  firecracker_kid: [{ status: "burn", chance: 0.6, on: ["self_destruct"] }],
  resolution_card: [{ status: "confuse", chance: 0.2, on: ["ambush"] }],
  countdown_clock: [{ status: "freeze", chance: 0.3, on: ["charge"] }],
  party_popper: [{ status: "confuse", chance: 0.18 }],
  midnight_bell: [
    { status: "freeze", chance: 0.35, on: ["nova", "slam"] },
    { status: "silence", chance: 0.35, on: ["rain", "cross"] },
  ],
  // 회식 3차
  endless_toast: [
    { status: "poison", chance: 0.4, on: ["fan_volley", "rain", "slam"] },
    { status: "confuse", chance: 0.35, on: ["nova", "cross"] },
  ],
};

/** 한 번 걸리는 상태 (지속·세기는 난이도가 반영된 값) */
export type StatusHit = { id: StatusId; durMs: number; power: number };

/** 상태 하나의 실제 지속·세기 (난이도 반영) */
export function statusFor(id: StatusId, d: Difficulty): StatusHit {
  const k = STATUS_DIFF[d];
  const dur = Math.round(STATUSES[id].durMs * k.dur);
  return { id, durMs: Math.min(dur, HARD_CAP_MS[id] ?? dur), power: k.power };
}

/** 이 몬스터의 이 공격(pat)이 맞았을 때 걸리는 상태들. rand는 0..1 (테스트는 고정값) */
export function rollStatus(id: MonsterId, pat: PatternId | undefined, d: Difficulty, rand: () => number = Math.random): StatusHit[] {
  const rules = MONSTER_STATUS[id];
  if (!rules) return [];
  const out: StatusHit[] = [];
  for (const r of rules) {
    if (r.on && (!pat || !r.on.includes(pat))) continue;
    if (out.some((h) => h.id === r.status)) continue;
    if (rand() < Math.min(0.95, r.chance * STATUS_DIFF[d].chance)) out.push(statusFor(r.status, d));
  }
  return out;
}

/** 포션으로 풀리는 상태 (기존 소모품에 연결) */
export const POTION_CURES: Record<string, readonly StatusId[]> = {
  p_coffee: ["poison", "burn", "bleed"],
  p_energy: ["slow", "freeze", "confuse", "silence"],
  p_lunchbox: STATUS_IDS,
};

type Active = { until: number; power: number; nextTick: number };

/**
 * 플레이어 상태 이상 장부. now는 판 시간(ms, 멈춤 동안 흐르지 않는다).
 * - apply: 새로 걸기 / 이미 걸려 있으면 남은 시간·세기를 큰 쪽으로 갱신 / 면역이면 무시
 * - update: 끝난 상태를 정리(→ 면역 시작)하고 이번 프레임 지속 피해를 돌려준다
 */
export class StatusBook {
  private on = new Map<StatusId, Active>();
  private immune = new Map<StatusId, number>();

  clear(): void {
    this.on.clear();
    this.immune.clear();
  }

  apply(hit: StatusHit, now: number): "new" | "refresh" | "immune" {
    if ((this.immune.get(hit.id) ?? 0) > now) return "immune";
    const cur = this.on.get(hit.id);
    if (cur && cur.until > now) {
      cur.until = Math.max(cur.until, now + hit.durMs);
      cur.power = Math.max(cur.power, hit.power);
      return "refresh";
    }
    this.on.set(hit.id, { until: now + hit.durMs, power: hit.power, nextTick: now + (STATUSES[hit.id].tickMs ?? 0) });
    return "new";
  }

  has(id: StatusId, now: number): boolean {
    return (this.on.get(id)?.until ?? 0) > now;
  }

  /** 걸려 있으면 세기, 아니면 0 */
  power(id: StatusId, now: number): number {
    const a = this.on.get(id);
    return a && a.until > now ? a.power : 0;
  }

  /** 이동속도 배율 (둔화) */
  moveMul(now: number): number {
    const p = this.power("slow", now);
    return p ? 1 - Math.min(MAX_SLOW, (STATUSES.slow.slow ?? 0) * p) : 1;
  }

  /** 지금 걸린 상태 (남은 시간이 긴 것부터 말고, 정의 순서대로) */
  list(now: number): { id: StatusId; leftMs: number }[] {
    return STATUS_IDS.filter((id) => this.has(id, now)).map((id) => ({ id, leftMs: this.on.get(id)!.until - now }));
  }

  /** 풀기 (포션 등). 풀린 상태를 돌려주고 면역을 건다 */
  cure(ids: readonly StatusId[], now: number): StatusId[] {
    const done = ids.filter((id) => this.has(id, now));
    for (const id of done) this.end(id, now);
    return done;
  }

  /** 끝난 상태 정리 + 이번 프레임 지속 피해 (maxHp 기준). moving이면 출혈이 세진다 */
  update(now: number, maxHp: number, moving: boolean): { dmg: { id: StatusId; amount: number }[]; ended: StatusId[] } {
    const dmg: { id: StatusId; amount: number }[] = [];
    const ended: StatusId[] = [];
    for (const [id, a] of this.on) {
      const def = STATUSES[id];
      if (def.dotPct && def.tickMs) {
        // 끝나는 순간까지의 몫은 준다 (끝 시각 이후 눈금은 없다)
        while (a.nextTick <= now && a.nextTick <= a.until) {
          const mult = id === "bleed" && moving ? BLEED_MOVE_MULT : 1;
          dmg.push({ id, amount: maxHp * def.dotPct * a.power * (def.tickMs / 1000) * mult });
          a.nextTick += def.tickMs;
        }
      }
      if (a.until <= now) {
        ended.push(id);
        this.end(id, now);
      }
    }
    return { dmg, ended };
  }

  private end(id: StatusId, now: number): void {
    this.on.delete(id);
    this.immune.set(id, now + STATUSES[id].immuneMs);
  }
}
