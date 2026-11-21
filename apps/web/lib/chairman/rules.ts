import { gameWeek } from "../gameDay";
import { defFactor, hitChance, seeded } from "../rpg/formulas";
import { towerMonsterStats } from "../rpg/tower";

// 11/20 주간 끝판 「회장님 독대」 순수 규칙 (클라이언트·서버 공용 — 저장소·환경을 가져오지 않는다).
// 보스 「판교 회장님」은 쓰러지지 않는다. 내가 쓰러질 때까지 때리고, 기록은 넣은 피해 합계.
//  - 두 모드 normal·hell. 자격: 야근 빌딩 최고 층 100 이상
//  - 하루(새벽 5시 기준) 유료 판 모드마다 2판, 다 쓰면 연습 판(포인트·기록 없음)
//  - 11/20 「너무 루즈하다 — 1분마다 단계」: 단계는 1분씩, 0~5분은 천천히 세지고 5분부터 크런치 (1분마다 1.35배). 판은 최대 20분
//  - 지옥: 45초마다 스킬 하나가 봉인된다 (봉인 순서 = 패시브 먼저 70% 몫, 갈래 안에서는 랭크 높은 스킬부터, 동률은 시드 — 서버도 같은 순서를 다시 만든다)

export type ChairMode = "normal" | "hell";
export const CHAIR_MODES: readonly ChairMode[] = ["normal", "hell"];
export const isChairMode = (v: unknown): v is ChairMode => v === "normal" || v === "hell";
export const CHAIR_MODE_LABEL: Record<ChairMode, string> = { normal: "일반", hell: "지옥" };

/** 들어갈 수 있는 야근 빌딩 최고 층 */
export const CHAIR_MIN_FLOOR = 100;
/** 하루 유료 판 (모드마다 따로) */
export const CHAIR_RUNS_PER_DAY = 2;
/** 판 최대 길이 */
export const CHAIR_MAX_MS = 20 * 60_000;
/** 티켓 수명 (최대 판 + 멈춤·늦은 응답 여유) */
export const CHAIR_TICKET_MS = 25 * 60_000;
/** 판 시간이 티켓 나이보다 길어도 봐주는 여유 (시계·전송 지연) */
export const CHAIR_FINISH_SLACK_MS = 5_000;
/** 11/22 시작 전(브리핑)에 나가면 유료 판을 돌려주는 창: 판 시작부터 이 안 (하루 한 번, 두 모드 합쳐) */
export const CHAIR_REFUND_MS = 90_000;

/**
 * 11/22 첫 순위 주 (gameWeek 형식 — 그 주 월요일 YYYYMMDD). 이 주 전 기록도 이 주에 넣고, 그 앞 주 정산은 건너뛴다.
 * 배포 11/22(일) → 첫 순위 = 배포 때부터 11/30(월) 05:00까지, 첫 정산 11/30 05:00, 그 뒤 1주 간격.
 * 배포가 11/23 05:00을 넘기면 이 값만 다음 주 키("20261130")로 바꾼다.
 */
export const CHAIR_FIRST_WEEK = "20261123";
/** 회장님 독대 주 (기록·순위·정산·남은 시간 모두 이것 — 일반 주간 레이스는 gameWeek 그대로) */
export const chairWeek = (now = Date.now()): string => {
  const w = gameWeek(now);
  return w < CHAIR_FIRST_WEEK ? CHAIR_FIRST_WEEK : w;
};

/** 11/22 브리핑 멈춤 창 「나가기」 안내 (연습 · 돌려받기 남음 · 오늘 이미 돌려받음/시간 지남) */
export function chairQuitNote(o: { practice: boolean; refundLeft: number; late?: boolean }): string {
  if (o.practice) return "아직 시작 전이에요. 나가면 마을로 가요.";
  if (o.late) return "아직 시작 전이에요. 시간이 지나서 지금 나가면 판을 쓴 것으로 쳐요.";
  if (o.refundLeft > 0) return "아직 시작 전이에요. 지금 나가면 오늘 판을 돌려드려요. 하루에 한 번만 돼요.";
  return "아직 시작 전이에요. 오늘은 이미 한 번 돌려받아서, 지금 나가면 판을 쓴 것으로 쳐요.";
}

/** 지옥 봉인 간격 */
export const CHAIR_SEAL_EVERY_MS = 45_000;
/** 페이즈 길이 (0..4, 1분씩), 5분부터 크런치 */
export const CHAIR_PHASE_MS = 60_000;
export const CHAIR_CRUNCH_MS = 5 * 60_000;
/** 피해 상한 여유 (다른 모드와 같은 ×3 — lib/rpg/dealCap MARGIN) */
export const CHAIR_DEAL_MARGIN = 3;
/** 포인트를 받는 평균 초당 피해 (캐릭터 최대 초당 피해의 몫) */
export const CHAIR_FAIR_RATIO = 0.3;
/**
 * 30% 검사의 「최대 초당 피해」 = dealCap 값 ÷ 이것. dealCap(maxDealPerSec)은 상한 검사용이라 스킬 여유 SKILL_K(6)·약화 VULN_K(1.5)를
 * 넉넉하게 곱해 둔 값 — 그대로 30%를 요구하면 정상 판도 넘기 어렵다. 그 둘을 뺀 값(늘 치명타 기본 공격 + 패시브)을 기준으로 한다
 * 11/20 실측(로컬, 무적·쉬지 않고 평타+스킬): dealCap ÷ 9 × chairEff 의 약 100%가 실제 최대였다 (마공·물공을 둘 다 더한 값이라 두 배쯤 크다)
 *  → 30으로: 기준 ≈ 실제 최대의 30%
 */
export const CHAIR_FAIR_DIV = 30;
/** 1분당 포인트 (크런치 전). 크런치(5분)부터는 두 배. 11/21 판이 짧아져(크런치 2분 안에 끝) 두 배로: 노멀 20 → 40 · 헬 35 → 70 */
export const CHAIR_POINTS_PER_MIN: Record<ChairMode, number> = { normal: 40, hell: 70 };
/** 한 판 포인트 상한 */
export const CHAIR_POINTS_CAP: Record<ChairMode, number> = { normal: 400, hell: 700 };

/** 세기 곡선 (화면이 보스를 그릴 때·서버 검증이 같은 값을 쓴다). t = 분 */
export type ChairCurve = {
  /** 0~rampMin분: base + slope × t */
  rampMin: number;
  base: number;
  slope: number;
  /** rampMin분부터: crunchBase × growth^(t − rampMin) */
  crunchBase: number;
  growth: number;
  phaseMs: number;
  crunchAtMs: number;
  maxMs: number;
  sealEveryMs: number | null;
};

export const CHAIR_CURVE: Record<ChairMode, ChairCurve> = {
  normal: { rampMin: 5, base: 1, slope: 0.2, crunchBase: 2, growth: 1.35, phaseMs: CHAIR_PHASE_MS, crunchAtMs: CHAIR_CRUNCH_MS, maxMs: CHAIR_MAX_MS, sealEveryMs: null },
  hell: { rampMin: 5, base: 0.7, slope: 0.14, crunchBase: 1.4, growth: 1.35, phaseMs: CHAIR_PHASE_MS, crunchAtMs: CHAIR_CRUNCH_MS, maxMs: CHAIR_MAX_MS, sealEveryMs: CHAIR_SEAL_EVERY_MS },
};

/** 보스 세기 배율 (ms 경과) */
export function chairThreat(mode: ChairMode, ms: number): number {
  const c = CHAIR_CURVE[mode];
  const t = Math.max(0, ms) / 60_000;
  return t <= c.rampMin ? c.base + c.slope * t : c.crunchBase * c.growth ** (t - c.rampMin);
}

/** 페이즈 0..4 (1분씩), 5분부터 5 = 크런치 */
export const chairPhase = (ms: number): number => (ms >= CHAIR_CRUNCH_MS ? 5 : Math.max(0, Math.floor(ms / CHAIR_PHASE_MS)));

/** 판 시간 안에 봉인된 스킬 수 (45초마다 하나, 풀을 넘지 않는다) */
export const chairSealedCount = (ms: number, poolSize: number): number => Math.min(poolSize, Math.max(0, Math.floor(ms / CHAIR_SEAL_EVERY_MS)));

/** 봉인 순서 기준: 스킬 랭크 · 단(tier) · 패시브인지 */
export type ChairSealRank = (id: string) => { lv: number; tier: number; passive?: boolean };

/** 11/21 두 갈래가 다 남았을 때 패시브를 먼저 반려할 확률 */
export const CHAIR_SEAL_PASSIVE_P = 0.7;

/**
 * 지옥 봉인 순서 (11/21 사용자 「액티브가 너무 먼저 반려되니 재미없다 — 패시브 70%, 높은 레벨부터」):
 * 패시브·액티브를 따로 줄 세운다 (랭크 높은 순 → 단 높은 순 → 시드로 섞은 순). 한 칸씩 뽑을 때
 * 둘 다 남았으면 몫으로 70% 패시브 (i번째까지 액티브는 floor(0.3i + 시드 흔들림 0~0.09)개까지 — 앞 셋은 늘 패시브), 하나만 남았으면 그쪽. 1랭크 채우기는 갈래 안에서 늘 맨 뒤.
 * 같은 시드·같은 풀·같은 랭크면 늘 같은 순서 (서버가 다시 만들 수 있다)
 */
export function chairSealOrder(seed: number, pool: readonly string[], rank: ChairSealRank): string[] {
  const ids = [...new Set(pool)].sort();
  const r = seeded(seed);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const k = new Map(ids.map((id) => [id, rank(id)]));
  ids.sort((a, b) => k.get(b)!.lv - k.get(a)!.lv || k.get(b)!.tier - k.get(a)!.tier);
  const pas = ids.filter((id) => k.get(id)!.passive);
  const act = ids.filter((id) => !k.get(id)!.passive);
  const out: string[] = [];
  // 11/22 사용자 「액티브가 먼저 반려된다」: 한 칸씩 동전을 던지면 일곱 판에 한 판꼴로 앞 7개 중 액티브가 넷이 된다 →
  // 몫으로 맞춘다: i번째까지 액티브는 floor(i × 30% + 흔들림 0~0.09)개까지만 → 앞 셋은 늘 패시브, 열 개 중 일곱은 패시브 (앞 7개 중 다섯 이상)
  let nAct = 0;
  while (pas.length || act.length) {
    const i = out.length + 1;
    const room = nAct < Math.floor(i * (1 - CHAIR_SEAL_PASSIVE_P) + r() * 0.09);
    const takePas = pas.length > 0 && (act.length === 0 || !room);
    if (!takePas) nAct++;
    out.push((takePas ? pas : act).shift()!);
  }
  return out;
}

/**
 * 봉인 풀: 단축키에 놓은 스킬(궁극기 칸 포함) + 배운 패시브. isPassive = 그 스킬이 패시브인지 (lib/rpg/skillTree)
 */
export function chairSealPool(hotbar: readonly (string | null)[], skills: Partial<Record<string, number>>, isPassive: (id: string) => boolean): string[] {
  const pool = new Set<string>();
  for (const id of hotbar) if (id) pool.add(id);
  for (const [id, lv] of Object.entries(skills)) if ((lv ?? 0) > 0 && isPassive(id)) pool.add(id);
  return [...pool];
}

/** 한 판 피해 상한: 최대 초당 피해 × 여유 × 판 시간 */
export const chairDamageCap = (maxDps: number, durationMs: number): number => maxDps * CHAIR_DEAL_MARGIN * (Math.max(0, durationMs) / 1000);

export type ChairVerdict = { ok: true } | { ok: false; why: string };

/** 판 끝 검사: 판 시간(최대 20분·티켓 나이 + 여유 안) · 피해 상한 */
export function checkChairFinish(f: { damage: number; durationMs: number; ageMs: number; maxDps: number }): ChairVerdict {
  if (!Number.isFinite(f.damage) || f.damage < 0) return { ok: false, why: "damage:bad" };
  if (!Number.isFinite(f.durationMs) || f.durationMs <= 0) return { ok: false, why: "duration:bad" };
  if (f.durationMs > CHAIR_MAX_MS) return { ok: false, why: `duration:${Math.round(f.durationMs / 1000)}s>max` };
  if (f.durationMs > f.ageMs + CHAIR_FINISH_SLACK_MS) return { ok: false, why: `duration:${Math.round(f.durationMs / 1000)}s>age:${Math.round(f.ageMs / 1000)}s` };
  const cap = chairDamageCap(f.maxDps, f.durationMs);
  if (f.damage > cap) return { ok: false, why: `deal:${Math.round(f.damage)}>${Math.round(cap)}` };
  return { ok: true };
}

/** 버틴 시간으로 받는 포인트 (크런치 전 분당 기본, 크런치(5분)부터 두 배, 판 상한). 평균 초당 피해 검사는 chairPoints가 한다 */
export function chairTimePoints(mode: ChairMode, durationMs: number): number {
  const m = Math.max(0, Math.min(durationMs, CHAIR_MAX_MS)) / 60_000;
  const rate = CHAIR_POINTS_PER_MIN[mode];
  const ramp = CHAIR_CRUNCH_MS / 60_000;
  const raw = Math.min(m, ramp) * rate + Math.max(0, m - ramp) * rate * 2;
  return Math.min(CHAIR_POINTS_CAP[mode], Math.floor(raw + 1e-9));
}

export const CHAIR_UNFAIR_TEXT = "제대로 싸워야 포인트를 받아요";

/** 회장님 자리 능력치 (HuntScene이 이걸로 맞는다 — 야근 빌딩 100층 우두머리 세기의 방어·회피) */
export const chairBossStats = () => towerMonsterStats("midnight_bell", 100);

/** 실제로 들어가는 몫: 회장님 방어 × 내 명중 (dealCap은 방어·빗나감을 안 본다 — 그대로 쓰면 100층 캐릭터도 30%를 못 넘는다) */
export function chairEff(hit: number): number {
  const b = chairBossStats();
  return defFactor(b.def) * hitChance(hit, b.flee);
}

/** 포인트를 받는 평균 초당 피해 (maxDps = dealCap 값, eff = chairEff) */
export const chairFairDps = (maxDps: number, eff = 1) => ((CHAIR_FAIR_RATIO * maxDps) / CHAIR_FAIR_DIV) * eff;

/** 한 판 포인트 (연습 판은 0). 평균 초당 피해가 캐릭터 최대의 30% 아래면 0 + 사유 (maxDps = dealCap 값, eff = chairEff — 없으면 1) */
export function chairPoints(f: { mode: ChairMode; practice: boolean; damage: number; durationMs: number; maxDps: number; eff?: number }): { points: number; reason?: string } {
  if (f.practice) return { points: 0 };
  const sec = Math.max(0.001, f.durationMs / 1000);
  if (f.damage / sec < chairFairDps(f.maxDps, f.eff)) return { points: 0, reason: CHAIR_UNFAIR_TEXT };
  return { points: chairTimePoints(f.mode, f.durationMs) };
}

/** 자격 없음 문구 */
/** 자격 모자람 (403·입장 창). 입장 창은 문장마다 줄을 나눠 보인다 */
export const chairFloorText = (floor: number) => `잼민이는 회장실에 못 들어가요. 주니어는 주니어답게, 야근 빌딩 ${CHAIR_MIN_FLOOR}층부터 찍고 오세요. 지금 ${floor}층이에요.`;
