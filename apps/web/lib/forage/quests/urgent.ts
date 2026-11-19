import { dayStartMs } from "../../gameDay";
import { isSeasideSpecies, SPECIES, speciesById, type LifeCat, type Species } from "../catalog";
import { hash01 } from "../rules";

// 11/15: 긴급 의뢰 (순수 함수 — 서버·화면·시험이 같이 쓴다).
//  - 언제: 한국 시각 낮 12시 ~ 밤 12시 사이 무작위 시각에 하루 한두 번, 20분. 시각은 (서버 비밀값, 게임 날짜)로 정해지는 시드라
//    저장할 것이 없고, 비밀값을 모르는 화면은 미리 알 수 없다 (상태는 서버 /api/forage/urgent로만 본다)
//  - 방식: 서버 전체가 같이 채우는 목표. 버스 정류장 마당 의뢰 게시판에 낸 만큼 막대가 찬다. 50%·100%·150% 단계
//  - 제한 시간 안의 납품만 인정 (시각은 서버 기준). 끝나면 막대가 멈추고 그때 단계로 보상을 정한다
//    (11/15 150%(최고 단계)에 닿으면 그 순간 일찍 끝난다 — 더 낼 수 없고 바로 보상을 받는다. urgentEndAt)
//  - 보상 (1개 이상 낸 사람): 50% 도장 2 · 100% 도장 3 더 + 「수집가의 뒷주머니」 · 150% 마을 축제 1시간 (모두에게)
//    가장 많이 낸 사람: 칭호 「긴급 배달왕」 하루 + 사이렌 모자 24시간 · 마지막 1분에 100%를 채운 사람: 칭호 「아슬아슬 마감」 하루
//    (11/18 사용자: 공동 배달왕은 없애고 가장 많이 낸 한 사람만, 그것도 150%를 채운 판에서만 — 나머지는 도장·상자만)
//    11/19 사용자 「배달왕·사이렌 모자가 같은 사람에게 너무 겹쳐 나간다」: 배달왕은 칭호만, 모자 대신 상점 꾸미기 하나를 무작위 기간제로.
//    100%를 넘긴 판에선 낸 사람 중 한 명(배달왕 빼고, 낸 수와 상관없이 똑같은 확률)을 뽑아 「행운의 배달부」로 같은 무작위 꾸미기를 준다.
//    사이렌 모자는 무작위 꾸미기 후보에 아주 드물게 (URGENT_COS_SIREN)
//    (마지막 1분에 100%를 넘긴 사람이 없고 150%로 일찍 끝났으면 「아슬아슬 마감」은 150%를 채워 끝낸 사람 — urgentLastAcct)

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 한 번의 길이 */
export const URGENT_MS = 20 * MIN;
/** 시작할 수 있는 한국 시각 범위 (낮 12시 ~ 밤 12시에 끝나게) */
export const URGENT_FROM_HOUR = 12;
export const URGENT_TO_HOUR = 24;
/** 하루 두 번이면 이만큼 떨어뜨린다 (앞 축제가 끝나고도 조금 쉬게) */
export const URGENT_GAP_MS = 2 * HOUR;
/** 하루 두 번일 확률 */
export const URGENT_TWICE = 0.5;
/** 마지막 1분 */
export const URGENT_LAST_MS = MIN;
/** 150%에 닿으면 마을 축제 */
export const FEST_MS = HOUR;
/** 축제가 열리고 하늘에 폭죽이 저절로 오르는 시간 (위쪽 「불꽃축제」 타이머도 같다). 금빛 모닥불·희귀 보너스는 FEST_MS 내내 */
export const FEST_FIREWORK_MS = 30_000;
/** 100%에 닿은 뒤 이 안에 처음 본 화면만 축하 폭죽을 쏜다 (늦게 들어온 사람은 안 쏜다 — 없을 때 물음 15초 + CDN 10초 + 진행 중 물음 5초 여유) */
export const GOAL_CHEER_MS = 40_000;
/** 끝난 뒤 결과를 위쪽 막대·게시판에 보여 주는 시간 */
export const URGENT_SHOW_MS = HOUR;
/** 끝난 뒤 보상을 받을 수 있는 시간 (저장 키는 하루 더 둔다) */
export const URGENT_CLAIM_MS = 3 * DAY;
export const URGENT_TTL_SEC = Math.ceil((URGENT_MS + URGENT_CLAIM_MS + DAY) / 1000);
/** 11/19 받기 기한 남은 시간 ("2일 5시간", "3시간", "40분") */
export function urgentClaimLeft(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / MIN));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}
/** 칭호·사이렌 모자 기간 (받은 때부터) */
export const URGENT_TITLE_MS = DAY;
export const URGENT_HAT_MS = DAY;
export const URGENT_HAT = "u_hat_siren";
/** 100% 보상 상자 「수집가의 뒷주머니」 (가방에 들어가고 [열기]로 연다) */
export const URGENT_POCKET = "u_box_pocket";
export const URGENT_KING_TITLE = "t_urgKing";
export const URGENT_LAST_TITLE = "t_urgLast";
/** 한 번 납품에 낼 수 있는 수 */
export const URGENT_PICK_MAX = 300;

export type UrgentKind = "fish" | "herb" | "ore" | "dig";
export const URGENT_KINDS: readonly UrgentKind[] = ["fish", "herb", "ore", "dig"];

type KindDef = {
  cat: LifeCat;
  /** 11/16 접속자 한 사람당 목표 (목표 = 이 값 × 시작할 때 접속자 수) */
  per: number;
  /** 사람이 아주 적어도 이만큼은 */
  min: number;
  /** 11/16 사람이 아주 많아도 이만큼까지 */
  max: number;
  unit: "마리" | "개";
  /** 짧은 이름 (위쪽 막대) */
  label: string;
  /** 무엇이 필요한지 ("사장님이 회식에 쓸 생선") */
  what: string;
  /** 종류 이름 ("생선" — 끝 공지 「긴급 의뢰(생선 15마리)」) */
  noun: string;
  /** 아무도 내지 않고 끝났을 때 게시판에 남기는 한 줄 (가볍게 웃기게) */
  nobody: string;
};

// 11/16 목표를 접속자 수에 그대로 비례하게 (예전: 20명 기준 생선 100에 2배 상한 → 한 사람이 모아 둔 걸 한 번에 내서 2초 만에 끝났다)
export const URGENT_DEF: Readonly<Record<UrgentKind, KindDef>> = {
  fish: { cat: "fish", per: 8, min: 40, max: 800, unit: "마리", label: "회식용 생선", what: "사장님이 회식에 쓸 생선", noun: "생선", nobody: "사장님이 회식을 삼겹살집으로 바꿨대요." },
  herb: { cat: "herb", per: 6, min: 30, max: 600, unit: "개", label: "난초 화분용 약초", what: "대표님 난초 화분에 쓸 약초", noun: "약초", nobody: "대표님 난초는 결국 조화로 바꿨대요." },
  ore: { cat: "ore", per: 5, min: 25, max: 500, unit: "개", label: "감사 대비 광석", what: "감사에 대비할 광석", noun: "광석", nobody: "감사는 다음 달로 미뤄졌대요." },
  dig: { cat: "dig", per: 2, min: 10, max: 200, unit: "개", label: "시상식 트로피용 발굴품", what: "연말 시상식 트로피로 쓸 발굴품", noun: "발굴품", nobody: "시상식 트로피는 문구점에서 샀대요." },
};

/** 시작 알림 한 줄 */
export const urgentAnnounce = (kind: UrgentKind, goal: number) => `긴급! ${URGENT_DEF[kind].what} ${goal}${URGENT_DEF[kind].unit}가 당장 필요하대요`;

export type UrgentSlot = { id: string; kind: UrgentKind; start: number; end: number };

const rng = (seed: string) => {
  let i = 0;
  return () => hash01(`${seed}#${i++}`);
};

/**
 * 그 게임 날짜(새벽 5시 시작)의 긴급 의뢰 (시작 순). secret = 서버 비밀값 (화면은 모른다 → 미리 알 수 없다).
 * 같은 (secret, day)면 늘 같다. 시작은 분 단위, 한국 시각 12:00 ~ 23:40 (끝이 밤 12시를 넘지 않게)
 */
export function urgentSchedule(day: string, secret: string): UrgentSlot[] {
  const r = rng(`urgent|${secret}|${day}`);
  // 게임 날짜는 한국 시각 새벽 5시에 시작한다 → 낮 12시 = +7시간
  const from = dayStartMs(day) + (URGENT_FROM_HOUR - 5) * HOUR;
  const to = dayStartMs(day) + (URGENT_TO_HOUR - 5) * HOUR - URGENT_MS;
  const span = Math.floor((to - from) / MIN);
  const at = () => from + Math.floor(r() * (span + 1)) * MIN;
  const count = r() < URGENT_TWICE ? 2 : 1;
  const starts = [at()];
  if (count === 2) {
    // 두 번째는 첫 번째와 충분히 떨어진 시각 (몇 번 굴려도 안 되면 한 번만)
    for (let i = 0; i < 12; i++) {
      const s = at();
      if (Math.abs(s - starts[0]) >= URGENT_GAP_MS) {
        starts.push(s);
        break;
      }
    }
  }
  starts.sort((a, b) => a - b);
  const kinds = [...URGENT_KINDS];
  return starts.map((start, i) => {
    // 두 번이면 서로 다른 종류
    const kind = kinds.splice(Math.floor(r() * kinds.length), 1)[0];
    return { id: `${day}-${i}`, kind, start, end: start + URGENT_MS };
  });
}

/** 11/16 접속자 수를 모를 때(로비 물음 실패) 이만큼으로 친다 */
export const URGENT_REF_ONLINE = 20;

/**
 * 목표 수: 시작할 때 접속자 수 × 한 사람당 목표 (11/16 2배 상한 없이 비례, 종류별 최소·최대 안에서).
 * 5 단위 (발굴품은 1 단위). 20명이면 생선 160 · 약초 120 · 광석 100 · 발굴품 40
 */
export function urgentGoal(kind: UrgentKind, online: number): number {
  const d = URGENT_DEF[kind];
  const o = Number.isFinite(online) ? Math.max(0, online) : URGENT_REF_ONLINE;
  const step = kind === "dig" ? 1 : 5;
  return Math.max(d.min, Math.min(d.max, Math.round((d.per * o) / step) * step));
}

/** 11/16 한 사람이 한 의뢰에 낼 수 있던 몫 (목표에 대한 비율) — 11/19부터 새 의뢰엔 쓰지 않는다 (urgentCap) */
export const URGENT_CAP_SHARE = 0.25;
export const URGENT_CAP_SHARE_FEW = 0.4;
export const URGENT_FEW_ONLINE = 10;

/**
 * 한 사람 상한 (0 = 상한 없음). 11/19 사용자 「긴급 의뢰 납품도 혼자 다 할 수 있게」 — 새 의뢰는 상한 없이 연다.
 * 11/16~11/18에 상한을 정해 연 의뢰(저장 값 cap > 0)는 끝날 때까지 그 값을 그대로 쓴다 (urgentService goalOf)
 */
export function urgentCap(_goal: number, _online: number): number {
  return 0;
}

/** 11/16 한 사람 상한 안내 한 줄 (게시판). left = 앞으로 더 낼 수 있는 수 */
export function urgentCapLine(kind: UrgentKind, cap: number, left: number): string {
  const unit = URGENT_DEF[kind].unit;
  if (left <= 0) return "이번 의뢰엔 낼 만큼 다 냈어요.";
  return `한 사람이 ${cap}${unit}까지 낼 수 있어요. 지금 ${left}${unit} 더 낼 수 있어요.`;
}

/** 11/18 배달왕 안내 한 줄 (게시판 순위 위): 공동 배달왕은 없앴다 — 150%를 채운 판의 1등 한 명만 */
export const URGENT_KING_LINE = "150%를 채우면 가장 많이 낸 1등이 「긴급 배달왕」과 무작위 꾸미기를, 100%를 넘기면 낸 사람 중 한 명이 뽑혀 무작위 꾸미기를 받아요.";

/** 11/16 상한에 걸린 납품 거절 문구 */
export function urgentCapError(kind: UrgentKind, cap: number, left: number): string {
  const unit = URGENT_DEF[kind].unit;
  return left > 0 ? `이번 의뢰는 한 사람이 ${cap}${unit}까지 낼 수 있어요. 앞으로 ${left}${unit} 더 낼 수 있어요.` : `이번 의뢰는 한 사람이 ${cap}${unit}까지 낼 수 있어요. 낼 만큼 다 냈어요.`;
}

export type UrgentStage = 0 | 50 | 100 | 150;
/** 낸 수로 닿은 단계 */
export function urgentStage(n: number, goal: number): UrgentStage {
  if (goal <= 0) return 0;
  if (n * 2 >= goal * 3) return 150;
  if (n >= goal) return 100;
  if (n * 2 >= goal) return 50;
  return 0;
}

/** 단계별 도장 (닿은 단계까지 모두 더한다: 50% = 2, 100% = 2 + 3) */
export const URGENT_STAMPS = { 50: 2, 100: 3 } as const;

// ── 끝난 뒤 문구 (위쪽 막대·게시판·확성기가 같이 쓴다) ──

/** 목표의 몇 % (내림) */
export const urgentPct = (n: number, goal: number) => (goal > 0 ? Math.floor((n * 100) / goal) : 0);

/** "발굴품 5개" (끝 공지의 의뢰 이름) */
export const urgentWhat = (kind: UrgentKind, goal: number) => `${URGENT_DEF[kind].noun} ${goal}${URGENT_DEF[kind].unit}`;

/** 다음엔 내 보라는 한 줄 (끝난 의뢰에 내지 않은 사람) */
export const URGENT_NEXT_HINT = "다음 긴급 의뢰 때 1개라도 내면 보상을 받아요.";

/** 아무도 내지 않고 끝났을 때 위쪽 막대 한 줄 */
export const URGENT_NOBODY_LINE = "긴급 의뢰가 끝났어요. 이번엔 아무도 오지 않았어요.";

/** 모은 양: "목표의 45%를 채웠어요" (1%가 안 되면 "3개를 모았어요" — 0%라고 쓰지 않는다). n > 0일 때만 쓴다 */
export function urgentFilled(kind: UrgentKind, n: number, goal: number, early = false): string {
  const p = urgentPct(n, goal);
  if (early) return `목표의 ${p}%를 채워서 일찍 끝났어요`;
  return p > 0 ? `목표의 ${p}%를 채웠어요` : `${n}${URGENT_DEF[kind].unit}를 모았어요`;
}

/** 실제로 끝나는 시각: 150%에 닿았으면(fest > 0) 그 시각, 아니면 정해진 끝 (11/15 일찍 끝내기) */
export const urgentEndAt = (end: number, fest: number) => (fest > 0 ? Math.min(end, fest) : end);

/**
 * 「아슬아슬 마감」을 받을 계정: 마지막 1분에 100%를 넘긴 사람(last)이 있으면 그 사람 (원래 규칙 그대로),
 * 없고 150%를 채워 일찍 끝났으면 그 마지막 한 방을 낸 사람(festBy — 의뢰를 끝낸 사람). festBy가 없는 예전 기록이면 없음
 */
export const urgentLastAcct = (st: { fest: number; festBy: string | null; last: string | null }) => st.last ?? (st.fest > 0 ? st.festBy : null);

/** 단계 보상 이름: "도장 2개" · "도장 5개와 수집가의 뒷주머니" */
export function urgentPrize(stage: UrgentStage): string {
  if (stage < 50) return "";
  if (stage < 100) return `도장 ${URGENT_STAMPS[50]}개`;
  return `도장 ${URGENT_STAMPS[50] + URGENT_STAMPS[100]}개와 수집가의 뒷주머니`;
}

/**
 * 끝난 의뢰의 보상 한 줄 (n > 0).
 *  - 50%를 못 넘겼으면 모두에게 "50%를 못 넘겨 이번엔 보상이 없어요."
 *  - 낸 사람: "50%를 넘겨 도장 2개를 받아요." (받았으면 "…받았어요.")
 *  - 내지 않은 사람(mine=false): "낸 사람은 도장 2개를 받아요."
 *  - 아직 모르면(mine=null) 빈 문자열
 */
export function urgentRewardLine(o: { n: number; goal: number; mine: boolean | null; claimed?: boolean }): string {
  const stage = urgentStage(o.n, o.goal);
  if (stage < 50) return "50%를 못 넘겨 이번엔 보상이 없어요.";
  if (o.mine === null) return "";
  const prize = urgentPrize(stage);
  if (!o.mine) return `낸 사람은 ${prize}를 받아요.`;
  const reach = `${stage}%를 ${urgentPct(o.n, o.goal) > stage ? "넘겨" : "채워"}`;
  return o.claimed ? `${reach} ${prize}를 받았어요.` : `${reach} ${prize}를 받아요.`;
}

/** 끝 확성기 한 줄 (150% 축제 공지는 따로). early = 150%를 채워 일찍 끝났다 */
export function urgentEndNotice(kind: UrgentKind, goal: number, n: number, early = false): string {
  const name = `긴급 의뢰(${urgentWhat(kind, goal)})`;
  if (n <= 0) return `${name}는 아무도 오지 않은 채 끝났어요.`;
  if (early) return `${name}가 ${urgentFilled(kind, n, goal, true)}! 낸 사람은 게시판에서 보상을 받아요.`;
  const filled = urgentFilled(kind, n, goal);
  return urgentStage(n, goal) >= 50 ? `${name}가 끝났어요. ${filled}! 낸 사람은 게시판에서 보상을 받아요.` : `${name}가 끝났어요. ${filled}.`;
}

// ── 수집가의 뒷주머니 (100% 상자) ──

export type BoxPrize = { kind: "stamps"; n: number } | { kind: "dye_pick" } | { kind: "dye_special" } | { kind: "fish"; id: string };
/** 상자 칸 무게 (합 10,000). 특수색 확정 염색권은 0.3%로 아주 드물게 */
export const BOX_WEIGHTS = { stamps: 7_170, dye_pick: 1_200, fish: 1_600, dye_special: 30 } as const;
const BOX_TOTAL = BOX_WEIGHTS.stamps + BOX_WEIGHTS.dye_pick + BOX_WEIGHTS.fish + BOX_WEIGHTS.dye_special;
/** 도장 1~10 (적을수록 잘 나온다: k개 무게 = 11 − k) */
const STAMP_W = Array.from({ length: 10 }, (_, i) => 10 - i);
/** 상자에서 나오는 물고기: 희귀(★3)만. 아주 희귀·전설은 넣지 않는다 */
// 11/16 바닷물고기는 넣지 않는다 (예전 상자 그대로)
export const BOX_FISH: readonly Species[] = SPECIES.filter((s) => s.cat === "fish" && !s.junk && s.rarity === 3 && !isSeasideSpecies(s));
/** 염색권 아이템 id (도장 교환소와 같은 것) */
export const DYE_PICK = "q_dye_pick";
export const DYE_SPECIAL = "q_dye_special";

/** 상자 열기 (결정적: 같은 의뢰·계정이면 늘 같다 — 다시 시도해도 바뀌지 않는다) */
export function openBox(seed: string): BoxPrize {
  const r = rng(`urgbox|${seed}`);
  let x = r() * BOX_TOTAL;
  if ((x -= BOX_WEIGHTS.dye_special) < 0) return { kind: "dye_special" };
  if ((x -= BOX_WEIGHTS.dye_pick) < 0) return { kind: "dye_pick" };
  if ((x -= BOX_WEIGHTS.fish) < 0 && BOX_FISH.length) return { kind: "fish", id: BOX_FISH[Math.floor(r() * BOX_FISH.length)].id };
  let y = r() * STAMP_W.reduce((a, b) => a + b, 0);
  for (let k = 0; k < STAMP_W.length; k++) if ((y -= STAMP_W[k]) < 0) return { kind: "stamps", n: k + 1 };
  return { kind: "stamps", n: 1 };
}

/** 상자 칸 이름 ("도장 4개" · "색 확정 염색권" · 물고기 이름) */
export function prizeText(p: BoxPrize): string {
  if (p.kind === "stamps") return `의뢰 도장 ${p.n}개`;
  if (p.kind === "dye_pick") return "색 확정 염색권";
  if (p.kind === "dye_special") return "특수색 확정 염색권";
  return speciesById(p.id)?.name ?? p.id;
}

/** 한 사람의 보상 */
export type UrgentReward = {
  stage: UrgentStage;
  /** 단계 도장 (상자 도장은 box에) */
  stamps: number;
  box: BoxPrize | null;
  /** 가장 많이 낸 한 사람 (11/18 150%를 채운 판에서만, 공동 배달왕 없음) → 칭호 「긴급 배달왕」 + 무작위 꾸미기 (11/19) */
  king: boolean;
  /** 11/19 행운의 배달부: 100%를 넘긴 판에서 낸 사람 중 뽑힌 한 명 (배달왕 빼고) → 무작위 꾸미기 */
  lucky: boolean;
  /** 마지막 1분에 100%를 채운 사람 → 칭호 「아슬아슬 마감」 */
  last: boolean;
};

/**
 * 보상 판정 (끝난 뒤, 막대가 멈춘 값으로). mine = 내가 낸 수 (0이면 보상 없음 → null).
 * 11/18 배달왕: 150%를 채운 판에서 가장 많이 낸 한 사람(top — 같은 수면 먼저 닿은 사람이 위)만. 공동 배달왕(상한까지 낸 사람 모두)은 없앴다.
 * cap은 예전 호출과 맞추려고 그대로 받는다 (배달왕 판정엔 쓰지 않는다)
 */
export function urgentReward(o: { id: string; acct: string; n: number; goal: number; cap: number; mine: number; top: string | null; last: string | null; lucky?: string | null }): UrgentReward | null {
  if (o.mine <= 0) return null;
  const stage = urgentStage(o.n, o.goal);
  const stamps = (stage >= 50 ? URGENT_STAMPS[50] : 0) + (stage >= 100 ? URGENT_STAMPS[100] : 0);
  return {
    stage,
    stamps,
    box: stage >= 100 ? openBox(`${o.id}|${o.acct}`) : null,
    king: stage >= 150 && o.top === o.acct,
    lucky: stage >= 100 && !!o.lucky && o.lucky === o.acct,
    last: stage >= 100 && o.last === o.acct,
  };
}

// ── 11/19 무작위 꾸미기 (배달왕·행운의 배달부) ──

/** 사이렌 모자가 나올 확률 (긴급 의뢰 한정 희귀템) */
export const URGENT_COS_SIREN = 0.05;
/** 등급 비율 [일반, 고급, 희귀, 전설] (상점 값 기준 등급 — lib/rpg/setGearRoll cosTierOf) */
export const URGENT_COS_TIERS = [50, 35, 13, 2] as const;
/** 기간: 1일 50% · 3일 35% · 7일 15% */
export const URGENT_COS_DAYS: readonly (readonly [number, number])[] = [
  [1, 50],
  [3, 35],
  [7, 15],
];
export type UrgentCos = { id: string; days: number };

function pickW<T>(r: () => number, rows: readonly (readonly [T, number])[]): T {
  const total = rows.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [v, w] of rows) if ((x -= w) < 0) return v;
  return rows[rows.length - 1][0];
}

/**
 * 무작위 꾸미기 하나 (결정적: 같은 시드·같은 제외 목록이면 늘 같다). tiers = 등급별 후보 id (상점 캐릭터 꾸미기),
 * exclude = 이미 영구로 가진 것 (그 등급 후보가 다 빠지면 다른 등급에서). 사이렌 모자는 1일
 */
export function urgentCosRoll(seed: string, tiers: readonly (readonly string[])[], exclude: ReadonlySet<string>): UrgentCos | null {
  const r = rng(`urgcos|${seed}`);
  if (r() < URGENT_COS_SIREN && !exclude.has(URGENT_HAT)) return { id: URGENT_HAT, days: 1 };
  const tier = pickW(r, URGENT_COS_TIERS.map((w, i) => [i, w] as const));
  const order = [tier, ...[0, 1, 2, 3].filter((t) => t !== tier)];
  for (const t of order) {
    const pool = (tiers[t] ?? []).filter((id) => !exclude.has(id));
    if (pool.length) return { id: pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))], days: pickW(r, URGENT_COS_DAYS) };
  }
  return null;
}

/** 행운의 배달부: 낸 사람(accts) 중 한 명 (결정적 — 의뢰 id 시드, 계정 이름 순으로 줄 세워 뽑는다). 배달왕(king)은 뺀다 */
export function urgentLucky(id: string, accts: readonly string[], king: string | null): string | null {
  const pool = [...new Set(accts)].filter((a) => a !== king).sort();
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rng(`urglucky|${id}`)() * pool.length))];
}

/** 받을 것이 있는지 */
export const hasReward = (r: UrgentReward | null): r is UrgentReward => !!r && (r.stamps > 0 || !!r.box || r.king || r.lucky || r.last);

// ── 축제 ──

/** 축제 동안 낚시·채집에서 희귀(★3) 이상 무게 배율 */
export const FEST_RARE_BOOST = 1.25;
/** 희귀 이상 무게만 올린다 (축제가 아니면 1) */
export const festWeight = (rarity: number, fest: boolean) => (fest && rarity >= 3 ? FEST_RARE_BOOST : 1);

/** 순위 점수: 낸 수 + 먼저 그 수에 닿은 사람이 위 (소수부, 0.5 미만 — 정수부를 넘지 않는다) */
export function rankScore(count: number, now: number, end: number): number {
  const left = Math.max(0, Math.min(URGENT_MS, end - now));
  return count + (left / URGENT_MS) * 0.49;
}
/** 순위 점수 → 낸 수 */
export const countOf = (score: number) => Math.floor(score + 1e-9);

/** "12:34" (남은 ms) */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
