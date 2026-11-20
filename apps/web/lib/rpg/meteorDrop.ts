// 11/20 「유성우 오라」(st_meteor — 별자리 잇기 전용 전설 오라) 얻는 규칙 (순수 함수 — 서버 finishRun과 망원경 창이 함께 쓴다).
//  - 굴리는 판: 맑은 밤(판 시작 시각 — lib/stargaze starryNight)에 시작해서, 서버가 검증한 완성 별자리가 하나 이상 있는 별자리 잇기 판
//  - 판당 METEOR_P(0.2%), 그 판에 전설 별자리(희귀도 5)를 완성했으면 METEOR_LEGEND_P(0.8%)
//  - 하루(게임 날짜, 새벽 5시 기준)에 앞 METEOR_DAY_ROLLS(15)판까지만 굴린다 — 밤새 몰아서 해도 빨라지지 않게
//  - 굴린 판이 METEOR_PITY(400)번째가 되면 확정 (천장). 하나만 — 받았으면(got) 더 굴리지 않는다
//  - 굴림은 판 끝 서버 비밀 드롭 시드(service dropSeedOf)로 → 판 시작 응답만으로는 미리 알 수 없다
// 진행(하루 굴림 수·천장 진행·받은 시각)은 캐릭터 저장(rpg:{계정}:char)의 mt 칸에 판 끝 저장과 같이 싣는다 (Redis 명령이 늘지 않는다).

/** 유성우 오라 아이템 id (@tomb/protocol ITEMS — stargaze) */
export const METEOR_ITEM_ID = "st_meteor";
export const METEOR_ITEM_NAME = "유성우 오라";
/** 판당 기본 확률 */
export const METEOR_P = 0.002;
/** 그 판에 전설 별자리를 완성했을 때 확률 (기본 대신) */
export const METEOR_LEGEND_P = 0.008;
/** 하루에 굴리는 판 수 상한 */
export const METEOR_DAY_ROLLS = 15;
/** 굴린 판이 이만큼이 되면 확정 */
export const METEOR_PITY = 400;

/** 캐릭터 저장 칸: d = 게임 날짜(YYYYMMDD), n = 그날 굴린 판 수, p = 지금까지 굴린 판 수(천장 진행), got = 받은 시각 */
export type MeteorState = { d?: string; n: number; p: number; got?: number };

const nat = (v: unknown, max = Number.MAX_SAFE_INTEGER) => (Number.isInteger(v) && (v as number) > 0 ? Math.min(v as number, max) : 0);

/** 저장값 정리 (옛 저장값·이상한 값이면 0부터) */
export function meteorOf(raw: unknown): MeteorState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<MeteorState>;
  const d = typeof r.d === "string" && /^\d{8}$/.test(r.d) ? r.d : undefined;
  const got = typeof r.got === "number" && Number.isFinite(r.got) && r.got > 0 ? r.got : undefined;
  return { ...(d ? { d } : {}), n: d ? nat(r.n, METEOR_DAY_ROLLS) : 0, p: nat(r.p, METEOR_PITY), ...(got ? { got } : {}) };
}

/** 그 판의 확률 (전설 별자리를 완성했는지) */
export const meteorChance = (legend: boolean) => (legend ? METEOR_LEGEND_P : METEOR_P);

/** 드롭 시드 → 0..1 (다른 드롭과 겹치지 않게 소금을 섞는다) */
export function meteorUnit(seed: number): number {
  let h = Math.imul((seed ^ 0x6d657465) >>> 0, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  h = Math.imul(h ^ 0x6f72, 668265263);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export type MeteorRun = {
  /** 판 시작 시각이 맑은 밤인지 (lib/stargaze starryNight) */
  starry: boolean;
  /** 서버가 검증한 완성 별자리 수 */
  done: number;
  /** 그중 전설 별자리가 있는지 */
  legend: boolean;
  /** 판 끝 게임 날짜 (kstDay) */
  day: string;
  /** 판 끝 서버 비밀 드롭 시드 */
  seed: number;
  /** 개발 전용 (운영에서는 늘 false — app/api/dev/meteor): 맑은 밤이 아니어도 굴리고 확률 1 */
  force?: boolean;
};

export type MeteorRoll = {
  /** 저장할 새 칸 (안 굴렸으면 그대로) */
  mt: MeteorState;
  /** 이번 판을 굴렸는지 (하루 수·천장 진행이 올랐는지) */
  rolled: boolean;
  /** 떨어졌는지 (got이 이번 판 시각으로) */
  win: boolean;
};

/** 판 하나 굴리기 (저장 갱신 안에서 부른다). now = 받은 시각으로 남길 값 */
export function rollMeteor(raw: unknown, run: MeteorRun, now: number): MeteorRoll {
  const cur = meteorOf(raw);
  if (cur.got || run.done < 1 || (!run.starry && !run.force)) return { mt: cur, rolled: false, win: false };
  const today = cur.d === run.day ? cur.n : 0;
  if (today >= METEOR_DAY_ROLLS && !run.force) return { mt: cur, rolled: false, win: false };
  const p = cur.p + 1;
  const win = !!run.force || p >= METEOR_PITY || meteorUnit(run.seed) < meteorChance(run.legend);
  const mt: MeteorState = { d: run.day, n: Math.min(METEOR_DAY_ROLLS, today + 1), p: Math.min(METEOR_PITY, p), ...(win ? { got: now } : {}) };
  return { mt, rolled: true, win };
}

/** 망원경 창 표시: 가졌는지 · 천장까지 남은 판(최대) · 오늘 더 굴릴 수 있는 판 */
export function meteorProgress(raw: unknown, day: string): { got: boolean; left: number; todayLeft: number } {
  const m = meteorOf(raw);
  return { got: !!m.got, left: Math.max(1, METEOR_PITY - m.p), todayLeft: METEOR_DAY_ROLLS - (m.d === day ? m.n : 0) };
}
