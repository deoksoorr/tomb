// 11/20 회장님 독대 — 화면 쪽 순수 규칙 (Phaser 없음): 기술 이름·대사·피하는 법, 단계별 기술 묶음과 고르기,
// 즉사 기술 일정, 지옥 봉인 적용, 숨을 곳(구조물) 충돌 기하. 세기 곡선·단계·봉인 수는 서버 규칙(lib/chairman/rules) 그대로.
import { chairPhase, chairSealedCount, chairThreat, CHAIR_MAX_MS, type ChairMode } from "@/lib/chairman/rules";

export { chairPhase, chairSealedCount, chairThreat, CHAIR_MAX_MS, type ChairMode };

/**
 * 판 640×400 · 걸을 수 있는 바닥 = ARENA 전체 (방 가장자리는 벽·책상으로 막혀 있다).
 * 11/20 사용자 「야근 빌딩에 비해 긴장감이 없다 — 캐릭터가 너무 작다」 → 카메라는 사냥·야근 빌딩과 같은 배율로 나를 따라가고,
 * 판은 PC 한 화면의 1.3배쯤 (예전 960×540을 한 화면에 다 담던 것을 좁혔다)
 */
export const WW = 640;
export const WH = 400;
/** 벽 아래 끝 (바닥이 시작하는 y) */
export const FL = 56;
export const ARENA = { x0: 84, x1: WW - 84, y0: 128, y1: WH - 28 } as const;
/** 판 가운데 */
export const ACX = (ARENA.x0 + ARENA.x1) / 2;
export const ACY = (ARENA.y0 + ARENA.y1) / 2;
export const AW = ARENA.x1 - ARENA.x0;
export const AH = ARENA.y1 - ARENA.y0;
/** 회장님 그림 배율 */
export const BK = 2;

export const PHASES = ["기획 회의", "프로토타입", "알파 빌드", "QA 지옥", "서버 오픈", "크런치 모드"] as const;
export const phaseName = (ph: number) => (ph >= 5 ? "크런치 모드" : `${ph + 1}단계 ${PHASES[ph]}`);
/** 단계 전환 화면 부제 (11/20 「페이즈가 바뀔 때 화면을 띄워 주면 좋겠다」) */
export const PHASE_SUB = ["오늘도 야근이죠?", "기획이 또 바뀌었어요", "빌드가 매일 깨져요", "버그가 쏟아져요", "트래픽 폭주", "오늘 다 같이 집에 못 가!"] as const;
/** 단계 전환 화면 길이 (실제 초 — 그동안 게임은 0.3배, 새 공격은 없다) */
export const PHASE_CARD_SEC = 1.4;
export const MODE_NAME: Record<ChairMode, string> = { normal: "노멀", hell: "헬" };

export type PatId = "dot" | "projBoom" | "teamBoom" | "planChange" | "quick" | "launch" | "bug" | "maint" | "hotfix" | "gacha" | "truck" | "stars" | "buildFail" | "deadline" | "mail" | "okr" | "move" | "gather";
export type KillId = "flip" | "drop" | "quit";

export const PAT_INFO: Record<PatId, { name: string; line: string; how: string; dur: number }> = {
  dot: { name: "도트 좀 찍어 주세요", line: "이거 도트 좀 찍어 주세요. 내일까지!", how: "바닥 칸이 깜빡이면 아직 안 칠해진 칸으로 피해요", dur: 4.2 },
  projBoom: { name: "프로젝트가 터졌다", line: "프로젝트가... 터졌다!", how: "폴더 여러 개가 떨어지고 둘레에 작은 연쇄 폭발이 이어져요. 빨간 원이 없는 빈 칸으로 피해요", dur: 4.8 },
  teamBoom: { name: "팀이 터졌다", line: "팀이... 터졌다?!", how: "튀어나오는 명찰 사이 틈으로 들어가요", dur: 4.6 },
  planChange: { name: "기획 변경입니다", line: "아, 기획 변경입니다~", how: "빨간 칸이 마지막에 뒤바뀌어요. 바뀐 걸 보고 움직여요", dur: 4.2 },
  quick: { name: "그거 금방 되죠?", line: "그거 금방 되죠? 5분이면 되잖아?", how: "회장님이 서너 번 돌진해요. 내가 갈 쪽을 앞질러 오니 줄이 그어지면 바로 옆으로 비켜요", dur: 4.4 },
  launch: { name: "출시일은 정해져 있습니다", line: "출시일은 정해져 있습니다.", how: "D-3, D-2, D-1 칸이 차례로 터져요. 방금 터진 칸으로 들어가요", dur: 4.6 },
  bug: { name: "버그가 아니라 기능입니다", line: "그건 버그가 아니라 기능입니다!", how: "벌레 떼가 쫓아와요. 몰아서 한 번에 때려요", dur: 4.8 },
  maint: { name: "긴급 점검", line: "긴급 점검 들어갑니다. 점검 연장!", how: "불이 꺼지고 번개가 내 자리를 따라와요. 계속 움직여요", dur: 5.0 },
  hotfix: { name: "핫픽스 배포", line: "핫픽스 바로 배포해!", how: "반창고 모양 십자 레이저가 깔려요. 십자 사이 칸으로 피해요", dur: 3.8 },
  gacha: { name: "확률 공개", line: "확률은... 투명하게 공개합니다. 0.7%!", how: "캡슐이 쏟아져요. 빛나는 캡슐만 물약, 나머지는 폭탄이에요", dur: 4.6 },
  truck: { name: "트럭 시위", line: "...밖에 트럭 왔다며?", how: "전광판 트럭이 줄마다 돌진해요. 빈 줄로 피하고, 두 번째 줄은 빈 줄이 옮겨 가요", dur: 4.4 },
  stars: { name: "별점 테러", line: "리뷰창이... 불타고 있습니다!", how: "★1 별이 운석처럼 떨어져요. 바닥 그림자를 피해요", dur: 4.4 },
  buildFail: { name: "빌드 실패", line: "빌드가 또 깨졌어?!", how: "발밑에 빨간 X가 따라붙어요. 멈추지 말고 계속 움직여요", dur: 4.0 },
  deadline: { name: "그거 내일까지 되죠?", line: "그거 내일까지 되죠?", how: "마감 도장이 비처럼 쏟아져요. 도장 그림자를 피해요", dur: 4.0 },
  mail: { name: "전사 공지 메일", line: "전 직원 필독! 회신 필수!", how: "벽이 빨갛게 깜빡이면 메일 파도가 그 벽에서 하나씩 밀려와요. 함께 깔리는 초록 길로 들어가 기다려요", dur: 7.0 },
  okr: { name: "OKR 레이저", line: "이번 분기 OKR은... 전 방향입니다!", how: "회장님 몸에서 레이저가 나와 판 전체를 돌며 쓸어요. 사이 빈 쪽을 따라 돌고, 거꾸로 돌 때는 멈칫해요", dur: 5.0 },
  move: { name: "사무실 이전합니다", line: "다음 주부터 사무실 이전합니다~", how: "판 바깥부터 빨간 띠가 좁혀 와요. 마지막에 남은 초록 사무실 안에 들어가 있어요", dur: 5.2 },
  gather: { name: "야근은 집합의 힘이다!", line: "야근은! 집합의! 힘이다!!", how: "직원 유령이 모여 큰 덩어리가 굴러와요. 굴러올 줄 밖으로 비켜요", dur: 5.6 },
};

export const KILL_INFO: Record<KillId, { name: string; line: string; how: string }> = {
  flip: { name: "판 엎자!", line: "에잇, 판 엎자!!", how: "회장님이 책상을 뒤집어 방 절반을 쓸어요. 반대쪽으로 건너가요" },
  drop: { name: "프로젝트 드랍", line: "이 프로젝트... 드랍합니다.", how: "초록 「내 자리」 두 곳만 살아남아요. 바로 달려가 앉아요" },
  quit: { name: "권고사직", line: "자네... 권고사직이야.", how: "금빛 고리가 몸에 닿는 순간 구르기(낙법)! 구르는 동안은 무적이에요" },
};

export const ALL_PATS = Object.keys(PAT_INFO) as PatId[];

/** 단계별 기술 묶음 (11/21부터 고르기는 판 전체 주머니 — 이 표는 처음 나오던 단계로 등급만 정한다 PAT_GRADE) */
export const POOL: readonly (readonly PatId[])[] = [
  ["dot", "quick", "deadline", "projBoom", "mail"],
  ["dot", "projBoom", "planChange", "hotfix", "bug", "quick", "mail"],
  ["teamBoom", "launch", "buildFail", "gacha", "gather", "planChange", "okr", "move"],
  ["bug", "stars", "truck", "buildFail", "teamBoom", "gacha", "okr", "mail"],
  ["maint", "gather", "truck", "stars", "launch", "move", "okr"],
  ALL_PATS,
];
export const poolOf = (ph: number) => POOL[Math.max(0, Math.min(POOL.length - 1, ph))];

/** 등급 0 쉬움 · 1 보통 · 2 어려움 (POOL에 처음 든 단계: 1~2단계 쉬움, 3단계 보통, 4~5단계 어려움) */
export type PatGrade = 0 | 1 | 2;
export const PAT_GRADE: Record<PatId, PatGrade> = (() => {
  const out = {} as Record<PatId, PatGrade>;
  POOL.slice(0, -1).forEach((pool, ph) => pool.forEach((id) => (out[id] ??= ph <= 1 ? 0 : ph === 2 ? 1 : 2)));
  for (const id of ALL_PATS) out[id] ??= 2;
  return out;
})();
export const PAT_GRADE_NAME = ["쉬움", "보통", "어려움"] as const;
/** 재섞기 때 앞 몇 개를 직전 몇 개와 겹치지 않게 */
export const PAT_FRESH_N = 6;

/**
 * 11/21 사용자 「중복된 건 나오지 않게」: 판 전체 기술 주머니.
 * 첫 주머니 = 18개를 등급별로 섞어 쉬움 → 보통 → 어려움. 18개를 다 쓰기 전에는 다시 안 나온다.
 * 다 쓰면 전부 다시 섞되 앞 6개는 직전에 쓴 6개가 아닌 것. 지금 돌고 있는 기술은 건너뛴다 (단계는 세기·겹침만 바꾼다)
 */
export type PatBag = { left: PatId[]; used: PatId[]; round: number };
export const newPatBag = (): PatBag => ({ left: [], used: [], round: 0 });

function shuffled<T>(a: readonly T[], rnd: () => number): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function refillBag(bag: PatBag, rnd: () => number): void {
  if (bag.round === 0) {
    bag.left = ([0, 1, 2] as const).flatMap((g) => shuffled(ALL_PATS.filter((k) => PAT_GRADE[k] === g), rnd));
  } else {
    const recent = bag.used.slice(-PAT_FRESH_N);
    const all = shuffled(ALL_PATS, rnd);
    const front = all.filter((k) => !recent.includes(k)).slice(0, PAT_FRESH_N);
    bag.left = [...front, ...all.filter((k) => !front.includes(k))];
  }
  bag.used = [];
  bag.round++;
}

/** 다음에 나올 기술 미리 보기 (주머니가 비었으면 채운다 — 브리핑) */
export function peekPatterns(bag: PatBag, rnd: () => number, n: number): PatId[] {
  if (!bag.left.length) refillBag(bag, rnd);
  return bag.left.slice(0, n);
}

/** 다음 기술 (주머니에서 하나). 남은 게 다 지금 쓰는 중이면 null (다음 프레임에 다시) */
export function drawPattern(bag: PatBag, rnd: () => number, running: readonly PatId[] = []): PatId | null {
  if (!bag.left.length) refillBag(bag, rnd);
  const i = bag.left.findIndex((k) => !running.includes(k));
  if (i < 0) return null;
  const [k] = bag.left.splice(i, 1);
  bag.used.push(k);
  return k;
}

/** 동시에 쓰는 기술 수: 11/21 1~2단계 하나 · 3단계(알파 빌드)부터 둘 · 크런치 셋 */
export const overlapOf = (ph: number) => (ph >= 5 ? 3 : ph >= 2 ? 2 : 1);

/** 기술 사이 쉬는 틈 (초): 단계가 오를수록 · 세기만큼 짧게. 11/21 1단계 3.0 · 2단계 2.6 (넉넉히) · 3단계 2.2 · 4~5단계 1.6 · 크런치 0.9 */
export const PAT_GAP = [3.0, 2.6, 2.2, 1.6, 1.6, 0.9] as const;
export function patternGap(ph: number, threat: number): number {
  return PAT_GAP[Math.max(0, Math.min(5, ph))] / speedOf(threat);
}

/**
 * 기술 변형 (같은 기술이 늘 똑같이 나오지 않게): 좌우 뒤집기 · 방향 거꾸로 · 나를 노림(앞질러) · 0..3 회전
 * 단계가 오를수록 「노림」이 자주 (11/21 1단계 0% · 2단계 15% · 3단계 35% · 4단계 50% · 5단계 65% · 크런치 80%)
 */
export const AIM_RATE = [0, 0.15, 0.35, 0.5, 0.65, 0.8] as const;
export type PatVar = { mirror: boolean; reverse: boolean; aimed: boolean; rot: number; ph: number };
export function patVariant(rnd: () => number, ph: number): PatVar {
  return { mirror: rnd() < 0.5, reverse: rnd() < 0.5, aimed: rnd() < AIM_RATE[Math.max(0, Math.min(5, ph))], rot: Math.floor(rnd() * 4), ph };
}

/** 나를 앞질러 노리는 자리: 지금 자리 + 속도 × lead초 (판 안) */
export function leadAim(p: { x: number; y: number }, v: { x: number; y: number }, lead: number): { x: number; y: number } {
  return clampArena({ x: p.x + v.x * lead, y: p.y + v.y * lead });
}

/** 세기 → 빠르기 (예고·탄·돌진). 1에서 시작해 1.6까지 */
export const speedOf = (threat: number) => Math.max(1, Math.min(1.6, 1 + (threat - 1) * 0.25));

/** 달리기 배수 (회장님 독대만 — 마을 RUN_MULTIPLIER와 같은 1.8) */
export const CHAIR_RUN = 1.8;

/**
 * 메일 파도 (11/22 사용자 「갑자기 중간에서 나오는 경우가 있다」): 파도는 늘 판 위·아래 벽에서 들어와 바닥 전체를 쓸고 지나간다.
 * 11/22 사용자 「메일이 올라오면서 범위가 새로 바뀌며 이어진다」 → 파도 하나하나가 따로: 벽 예고(빨간 띠·편지·띵) → 쓸고 → 맞은편 벽 밖으로 다 빠진 뒤
 * pause초 쉬고 다음 파도가 반대쪽 벽에서 새 예고. 초록 틈은 예고 순간 한 번 정해지고 그 파도가 끝날 때까지 안 움직인다.
 * v = 1단계 빠르기(px/s, 파도가 차례로 나오니 72 → 96) · minWarn = 벽 예고 · edge = 벽 밖 몇 px에서 나오나 · out = 맞은편 벽 밖으로 더 가서 사라지는 거리 ·
 * run = 틈까지 달려서 걸리는 초 (벽에 붙어 있어 시간이 빠듯할 때) · far = 틈까지 가장 먼 거리(px, 폰 화면 반 폭 안) · hit = 몸에 닿는 줄 거리(px) ·
 * react = 1단계 알아채는 틈 (크런치까지 reactMin으로 준다) · pause = 앞 파도가 다 빠지고 다음 예고까지
 */
export const MAIL = { v: 96, minWarn: 0.7, gw: 56, edge: 14, out: 20, run: [0.3, 0.5], far: 80, hit: 9, react: 0.45, reactMin: 0.3, pause: 0.4 } as const;
/** 메일 파도 수: 4단계 전 둘, 4단계(PHASE 4)부터 셋 */
export const mailWaves = (ph: number) => (ph >= 3 ? 3 : 2);

const ph5 = (ph: number) => Math.max(0, Math.min(5, Math.floor(ph)));
/** 11/22 단계가 오를수록 조금씩 빨라진다: 1~5단계·크런치 1.00 / 1.06 / 1.12 / 1.18 / 1.24 / 1.30 */
export const mailSpeedMul = (ph: number) => 1 + 0.06 * ph5(ph);
/** 파도 빠르기 (px/s) */
export const mailVy = (ph: number) => MAIL.v * mailSpeedMul(ph);
/** 알아채는 틈: 1단계 0.45초 → 크런치 0.30초 (그 밑으로는 안 내려간다) */
export const mailReact = (ph: number) => Math.max(MAIL.reactMin, MAIL.react - 0.03 * ph5(ph));

/** 파도가 나오는 줄: down = 위 벽에서 내려온다 (아니면 아래 벽에서 올라온다) */
export const mailEdgeY = (down: boolean) => (down ? ARENA.y0 - MAIL.edge : ARENA.y1 + MAIL.edge);

/** 메일 파도 여유: 세기 1에서 12% → 세기가 오르면 8%까지 (그 밑으로는 안 내려간다) */
export const mailMargin = (threat: number) => 1.12 - ((speedOf(threat) - 1) / 0.6) * 0.04;

/** 틈까지 sec초(최대 달리기) 거리일 때, 파도가 내 줄에 닿기 몇 초 전에 틈을 알려야 하나 (여유 + 알아채는 틈) */
export const mailOpenLead = (sec: number, ph: number, threat: number) => Math.max(0, sec) * mailMargin(threat) + mailReact(ph);

/**
 * 파도가 내 줄까지 rem초 남았을 때 틈까지 거리 (px): 최대 달리기(vmax)로 여유 8~12% + 알아채는 틈을 남기고 「겨우」 닿는 거리.
 * 이보다 가까우면 쉽고, 멀면 못 닿는다
 */
export const mailGapReach = (rem: number, vmax: number, ph: number, threat: number) => (Math.max(0, rem - mailReact(ph)) / mailMargin(threat)) * Math.max(1, vmax);

/**
 * 메일 파도 한 줄 계획 (예고 시작 = 틈이 정해지는 때 기준): 벽 줄 y · 빠르기 vy(부호 = 나아가는 쪽) · 예고 warn · 내 줄에 닿는 때 arrive · 맞은편 벽 밖으로 다 빠지는 때 life.
 * 벽에 붙어 있어 빨리 닿으면 예고를 늘린다 (예고 시작부터 내 줄까지 늘 mailOpenLead(sec)초 이상)
 */
export function mailPlan(o: { py: number; down: boolean; ph: number; threat: number; sec: number }): { y: number; vy: number; warn: number; arrive: number; life: number } {
  const y = mailEdgeY(o.down);
  const v = mailVy(o.ph);
  const fly = Math.max(0, Math.abs(o.py - y) - MAIL.hit) / v;
  const lead = mailOpenLead(o.sec, o.ph, o.threat);
  const warn = Math.max(MAIL.minWarn, lead - fly);
  return { y, vy: o.down ? v : -v, warn, arrive: warn + fly, life: warn + (AH + MAIL.edge * 2 + MAIL.out) / v };
}

/** 예고 순간 정하는 틈 거리 (px): 내 줄까지 남은 시간으로 겨우 닿는 거리, 단 far 밖으로는 안 (멀면 화면 밖) */
export const mailWaveReach = (arrive: number, vmax: number, ph: number, threat: number) => Math.min(mailGapReach(arrive, vmax, ph, threat), MAIL.far);

/**
 * 메일 틈 자리: 내 x에서 reach(px) 떨어진 곳 — 틈 가장자리(안쪽 6px)까지가 reach (좌우 중 들어가는 쪽, 둘 다면 무작위).
 * 판에 안 들어가면 더 가까운 쪽 끝 (그러면 더 쉬워진다)
 */
export function mailGapX(rnd: () => number, px: number, reach: number): number {
  const lo = ARENA.x0 + 30;
  const hi = ARENA.x1 - 30 - MAIL.gw;
  const r = Math.max(0, reach);
  const right = px + r - 6;
  const left = px - r - MAIL.gw + 6;
  const fitsR = right <= hi;
  const fitsL = left >= lo;
  if (r <= 0) return Math.max(lo, Math.min(hi, px - MAIL.gw / 2));
  if (fitsR && fitsL) return rnd() < 0.5 ? right : left;
  if (fitsR) return Math.max(lo, right);
  if (fitsL) return Math.min(hi, left);
  return px - lo > hi - px ? lo : hi;
}

/** 메일 틈까지 가로 거리 (틈 안 4px 안쪽 + 몸 여유) */
export const gapDist = (px: number, gx: number, gw: number) => Math.max(0, gx + 6 - px, px - (gx + gw - 6));

/** 메일 파도 한 줄 (y0 = 벽 줄 · t = 예고 시작부터 · gaps = 예고 때 정한 틈 x — 파도가 끝날 때까지 그대로) */
export type MailWave = { k: number; y0: number; y: number; vy: number; t: number; warn: number; arrive: number; life: number; gaps: number[] };
/** 내 상태 (예고 순간 틈을 정할 때만 본다) */
export type MailMe = { x: number; y: number; vmax: number; ph: number; threat: number };

/**
 * 메일 파도 차례 (순수 — fight.ts가 프레임마다 step): 한 번에 한 줄만. 앞 파도가 맞은편 벽 밖으로 다 빠지고 pause초 뒤에 다음 파도가 반대쪽 벽에서 예고.
 * log = 파도마다 예고 시작 · 출발 · 다 빠진 때 (시험용)
 */
export class MailSeq {
  cur: MailWave | null = null;
  log: { k: number; start: number; move: number; end: number }[] = [];
  private k = 0;
  private clock = 0;
  private wait: number;
  constructor(
    readonly total: number,
    private readonly rev: boolean,
    private readonly rnd: () => number,
    delay = 0,
  ) {
    this.wait = delay;
  }
  get done(): boolean {
    return !this.cur && this.k >= this.total;
  }
  /** dt초 흘리기. stop이면 새 파도는 안 낸다 (쓰러짐). 새 파도가 예고를 시작하면 그 파도를 돌려준다 */
  step(dt: number, me: MailMe, stop = false): MailWave | null {
    this.clock += dt;
    const w = this.cur;
    if (w) {
      w.t += dt;
      w.y = w.y0 + w.vy * Math.max(0, w.t - w.warn);
      if (w.t >= w.life) {
        this.log[this.log.length - 1].end = this.clock;
        this.cur = null;
        this.wait = MAIL.pause;
      }
      return null;
    }
    if (this.k >= this.total || stop) return null;
    this.wait -= dt;
    if (this.wait > 0) return null;
    const k = this.k++;
    const sec = MAIL.run[0] + this.rnd() * (MAIL.run[1] - MAIL.run[0]);
    const pl = mailPlan({ py: me.y, down: (k % 2 === 0) !== this.rev, ph: me.ph, threat: me.threat, sec });
    const gaps = [mailGapX(this.rnd, me.x, mailWaveReach(pl.arrive, me.vmax, me.ph, me.threat))];
    // 마지막 파도는 틈이 하나 더 (아무 데나)
    if (k === this.total - 1) gaps.push(ARENA.x0 + 30 + this.rnd() * (AW - 60 - MAIL.gw));
    this.cur = { k, y0: pl.y, y: pl.y, vy: pl.vy, t: 0, warn: pl.warn, arrive: pl.arrive, life: pl.life, gaps };
    this.log.push({ k, start: this.clock, move: this.clock + pl.warn, end: Infinity });
    return this.cur;
  }
}

/**
 * 11/22 트럭 시위: 바닥을 가로 6줄로 나눠 한 줄만 비우고 나머지 줄에 트럭이 달린다 (2단계부터 둘째 줄 — 빈 줄이 2~3칸 옮겨 간다).
 * sp = 트럭 빠르기(px/초, ×spd) · hx = 맞는 x 거리(몸 반 너비) · life = 트럭 수명(초) · from = 판 밖 출발 거리 ·
 * at = 첫 줄 예고가 깔리는 때 · gap = 둘째 줄 예고까지 · w1·w2 = 줄 예고(초, spd=1 기준) · ord = 줄마다 예고가 늘어나는 간격 ·
 * pad = 초록 길이 트럭 꽁무니에서 띄우는 여유 · min = 이보다 짧은 초록 조각은 안 그린다
 */
export const TRUCK = { lanes: 6, sp: 420, hx: 26, life: 3, from: 80, at: 0.3, gap: 1.5, w1: 1.25, w2: 1.1, ord: 0.1, pad: 14, min: 24 } as const;
export const TRUCK_LH = AH / TRUCK.lanes;
export const truckLaneTop = (i: number) => ARENA.y0 + (i * AH) / TRUCK.lanes;
/** 발(y)이 든 줄 */
export const truckLaneOf = (y: number) => Math.max(0, Math.min(TRUCK.lanes - 1, Math.floor(((y - ARENA.y0) * TRUCK.lanes) / AH + 1e-9)));
/** 트럭에 치인다: 같은 줄(빨간 띠 그대로) + x가 몸 반 너비 안 */
export const truckHits = (tr: { lane: number; x: number }, p: Pt) => truckLaneOf(p.y) === tr.lane && Math.abs(tr.x - p.x) < TRUCK.hx;
/** 둘째 줄의 빈 줄: step(2~3)칸 옮긴다 (판 밖이면 반대쪽) */
export function truckShift(free: number, step: number): number {
  const n = TRUCK.lanes;
  return free + step < n ? free + step : free - step >= 0 ? free - step : (free + n - step) % n;
}
export type TruckEv = { wave: number; free: number; lane: number; dir: number; at: number; warn: number };
/** 트럭 줄 일정: at = 빨간 예고가 깔리는 때(기술 시작부터 초) · warn = 예고 길이(spd=1 기준 — 실제는 ÷spd) → 끝나면 트럭 출발 */
export function truckPlan(o: { free: number; f2: number | null; mirror: boolean; reverse: boolean }): TruckEv[] {
  const waves: [number, number, number][] = [[o.free, TRUCK.at, TRUCK.w1]];
  if (o.f2 !== null) waves.push([o.f2, TRUCK.at + TRUCK.gap, TRUCK.w2]);
  const out: TruckEv[] = [];
  waves.forEach(([free, at, w], wave) => {
    for (let lane = 0; lane < TRUCK.lanes; lane++) {
      if (lane === free) continue;
      const ord = o.reverse ? TRUCK.lanes - 1 - lane : lane;
      out.push({ wave, free, lane, dir: (lane % 2 ? -1 : 1) * (o.mirror ? -1 : 1), at, warn: w + ord * TRUCK.ord });
    }
  });
  return out;
}
export const truckStartX = (dir: number) => (dir > 0 ? ARENA.x0 - TRUCK.from : ARENA.x1 + TRUCK.from);
export type TruckGreen = { lane: number; x0: number; x1: number; y0: number; y1: number };
/**
 * 초록 길 (밟아도 되는 자리): free 줄에서 — 빨간 예고가 걸려 있으면 없음 (곧 트럭이 온다),
 * 그 줄에 아직 달리는 트럭이 있으면 꽁무니 뒤(이미 지나간 쪽)만. 줄 높이 전체 (판 왼쪽~오른쪽 끝까지)
 */
export function truckGreen(free: number, pending: readonly number[], trucks: readonly { lane: number; x: number; dir: number }[]): TruckGreen | null {
  if (free < 0 || free >= TRUCK.lanes || pending.includes(free)) return null;
  let a: number = ARENA.x0;
  let b: number = ARENA.x1;
  for (const tr of trucks) {
    if (tr.lane !== free) continue;
    if (tr.dir > 0) b = Math.min(b, tr.x - TRUCK.hx - TRUCK.pad);
    else a = Math.max(a, tr.x + TRUCK.hx + TRUCK.pad);
  }
  if (b - a < TRUCK.min) return null;
  const y0 = truckLaneTop(free);
  return { lane: free, x0: a, x1: b, y0, y1: truckLaneTop(free + 1) };
}

/**
 * 프로젝트가 터졌다 (11/22 사용자 「폭발을 늘려 화려하게」): 폴더 수 1~5단계·크런치 3 / 4 / 4 / 5 / 5 / 6,
 * 폴더가 터진 뒤 둘레에 작은 연쇄 폭발 2~3개 (0.15~0.3초 뒤). 폴더가 많을수록 원이 작다 (r = 가로 반지름, 세로는 0.6배 — fight inTele 원과 같다).
 * safe = 처음에 정해 두는 빈 칸 — 어떤 원도 이 자리(몸 여유 safeR)를 덮지 않는다 · near = 빈 칸이 내게서 떨어진 거리(px) · sep = 폴더끼리 최소 간격(반지름 배수)
 */
export const BOOM = { n: [3, 4, 4, 5, 5, 6], r: [72, 66, 66, 60, 60, 56], rc: 26, sep: 1.3, safeR: 14, near: [60, 170], inset: 16 } as const;
export const boomCount = (ph: number) => BOOM.n[ph5(ph)];
export type BoomSpot = { x: number; y: number; r: number };
export type BoomFolder = BoomSpot & { chain: (BoomSpot & { dt: number })[] };
/** 원 안 (세로 0.6배 타원, pad = 몸 여유) */
export const inBoom = (p: { x: number; y: number }, c: BoomSpot, pad = 0) => Math.hypot((p.x - c.x) / (c.r + pad), (p.y - c.y) / (c.r * 0.6 + pad)) < 1;

/**
 * 폴더·연쇄 폭발 자리 (순수): first = 첫 폴더 자리 (나를 노림). 빈 칸을 먼저 정하고 다른 원은 거기를 비켜 놓는다 → 판 전체를 덮는 일이 없다
 */
export function boomLayout(rnd: () => number, o: { ph: number; px: number; py: number; first: { x: number; y: number } }): { safe: { x: number; y: number }; folders: BoomFolder[] } {
  const n = boomCount(o.ph);
  const r = BOOM.r[ph5(o.ph)];
  const I = BOOM.inset;
  const clampIn = (x: number, y: number) => ({ x: Math.max(ARENA.x0 + I, Math.min(ARENA.x1 - I, x)), y: Math.max(ARENA.y0 + I, Math.min(ARENA.y1 - I, y)) });
  const f0 = clampIn(o.first.x, o.first.y);
  const folders: BoomFolder[] = [{ ...f0, r, chain: [] }];
  // 빈 칸: 첫 폴더 밖, 내게서 near 거리 (못 찾으면 첫 폴더에서 가장 먼 모서리 쪽)
  let safe: { x: number; y: number } | null = null;
  for (let i = 0; i < 60 && !safe; i++) {
    const a = rnd() * Math.PI * 2;
    const d = BOOM.near[0] + rnd() * (BOOM.near[1] - BOOM.near[0]);
    const c = clampIn(o.px + Math.cos(a) * d, o.py + Math.sin(a) * d * 0.7);
    if (!inBoom(c, folders[0], BOOM.safeR + 4)) safe = c;
  }
  if (!safe) {
    const cs = [clampIn(ARENA.x0, ARENA.y0), clampIn(ARENA.x1, ARENA.y0), clampIn(ARENA.x0, ARENA.y1), clampIn(ARENA.x1, ARENA.y1)];
    safe = cs.sort((a, b) => Math.hypot(b.x - f0.x, b.y - f0.y) - Math.hypot(a.x - f0.x, a.y - f0.y))[0];
  }
  const S = safe;
  const sepOk = (x: number, y: number, k: number) => folders.every((f) => Math.hypot((x - f.x) / r, (y - f.y) / (r * 0.6)) >= k);
  for (let i = 1; i < n; i++) {
    let put: { x: number; y: number } | null = null;
    for (let t = 0; t < 80 && !put; t++) {
      // 둘째는 내 근처 (도망 길을 막는다), 나머지는 판 아무 데나 · 못 찾으면 간격을 조금씩 줄인다
      const c = i === 1 && t < 30 ? clampIn(o.px + (rnd() - 0.5) * 300, o.py + (rnd() - 0.5) * 160) : clampIn(ARENA.x0 + rnd() * AW, ARENA.y0 + rnd() * AH);
      if (inBoom(S, { ...c, r }, BOOM.safeR)) continue;
      if (sepOk(c.x, c.y, t < 50 ? BOOM.sep : 1.0)) put = c;
    }
    if (put) folders.push({ ...put, r, chain: [] });
  }
  // 연쇄: 폴더 둘레(반지름 0.85~1.15배)에 작은 원 2~3개, 빈 칸은 비킨다
  for (const f of folders) {
    const m = rnd() < (o.ph >= 3 ? 0.65 : 0.35) ? 3 : 2;
    const a0 = rnd() * Math.PI * 2;
    for (let j = 0; j < m; j++)
      for (let t = 0; t < 8; t++) {
        const a = a0 + (j / m) * Math.PI * 2 + (rnd() - 0.5) * 0.9;
        const d = 0.85 + rnd() * 0.3;
        const c = { ...clampIn(f.x + Math.cos(a) * r * d, f.y + Math.sin(a) * r * 0.6 * d), r: BOOM.rc };
        if (inBoom(S, c, BOOM.safeR)) continue;
        f.chain.push({ ...c, dt: 0.15 + j * 0.06 + rnd() * 0.03 });
        break;
      }
  }
  return { safe: S, folders };
}

/**
 * 판 엎자! 예고 (11/22 사용자 「준비 시간이 너무 길다」): 예전 3.0초 → 40% 줄여 1.8초 (크런치 ×0.9 = 1.62초).
 * 단 판 끝에서 반대쪽 절반까지 최대 달리기(기본 걸음 78 × 1.8)로 건너는 시간 + 반응 0.35초 밑으로는 안 내려간다:
 *  좌우로 나뉨 (AW/2 + 몸 6px = 242px) 1.72 + 0.35 = 2.07초 · 위아래로 나뉨 (AH/2 + 6 = 128px) 0.91 + 0.35 = 1.26초
 */
export const FLIP = { old: 3.0, cut: 0.6, crunch: 0.9, react: 0.35, vmax: 78 * CHAIR_RUN, body: 6 } as const;
export function flipWarn(ph: number, axis: "x" | "y"): number {
  const floor = ((axis === "x" ? AW : AH) / 2 + FLIP.body) / FLIP.vmax + FLIP.react;
  return Math.max(floor, FLIP.old * FLIP.cut * (ph >= 5 ? FLIP.crunch : 1));
}

/**
 * 프로젝트 드랍 (11/22 사용자 「화려하고 스피디하게」): 회장님이 책상을 쾅 · 기획서를 찢고 → 붉은 경보 · 「내 자리」 둘만 초록 →
 * 서류철이 바닥 전체에 쏟아지고 → warn초에 회장님 쪽부터 폭발이 바닥을 휩쓴다 (sweep초에 걸쳐). 내 칸에 폭발이 닿는 순간 자리에 없으면 즉사.
 * 예고 warn = 2.1초 (크런치 1.9) — 단 판 어디서든 가까운 자리까지 최대 달리기로 가는 시간(구조물 돌아가는 몫 ×detour) + 반응 0.35초 밑으로는 안 내려간다.
 * 자리 판정 = 자리 가운데에서 가로 18 · 세로 14 안 (닿는 거리는 가로 hx · 세로 hy 안쪽 상자까지 — 2px 여유). rain = 폭발 전 서류철이 쏟아지는 초
 */
export const DROP = { warn: 2.1, crunch: 1.9, react: 0.35, vmax: FLIP.vmax, detour: 1.1, sx: 18, sy: 14, hx: 16, hy: 12, sweep: 0.45, rain: 0.9 } as const;
type Pt = { x: number; y: number };
/** 자리 판정 상자 안 */
export const dropSafe = (p: Pt, safes: readonly Pt[]) => safes.some((s) => Math.abs(p.x - s.x) < DROP.sx && Math.abs(p.y - s.y) < DROP.sy);
/** p에서 가장 가까운 자리 상자(hx·hy)까지 거리 */
export const dropDist = (p: Pt, safes: readonly Pt[]) =>
  Math.min(...safes.map((s) => Math.hypot(Math.max(0, Math.abs(p.x - s.x) - DROP.hx), Math.max(0, Math.abs(p.y - s.y) - DROP.hy))));
/** 판 어디서든 가까운 자리까지 가장 먼 거리 (4px 격자) */
export function dropReach(safes: readonly Pt[]): number {
  let far = 0;
  for (let x = ARENA.x0; x <= ARENA.x1; x += 4) for (let y = ARENA.y0; y <= ARENA.y1; y += 4) far = Math.max(far, dropDist({ x, y }, safes));
  return far;
}
/** 바닥 = 가장 먼 거리 × 돌아가는 몫 ÷ 최대 달리기 + 반응 */
export const dropFloor = (safes: readonly Pt[]) => (dropReach(safes) * DROP.detour) / DROP.vmax + DROP.react;
export const dropWarn = (ph: number, safes: readonly Pt[]) => Math.max(dropFloor(safes), ph >= 5 ? DROP.crunch : DROP.warn);
/** 폭발이 x 칸에 닿는 때 (warn 뒤 몇 초): 회장님 x(ox)에서 양옆으로 sweep초에 판 끝까지 */
export const dropSweepAt = (x: number, ox: number) => (Math.abs(x - ox) / Math.max(1, ox - ARENA.x0, ARENA.x1 - ox)) * DROP.sweep;
/** 「내 자리」 둘: 왼쪽·오른쪽 끝 쪽 (구조물 위는 피한다) */
export function dropSeats(rnd: () => number, covers: readonly Cover[] = []): Pt[] {
  const free = (p: Pt) => !covers.some((c) => !c.dead && inRect(p, coverRect(c), 14));
  const pick = (x: () => number): Pt => {
    let p = { x: x(), y: ARENA.y0 + 40 + rnd() * (AH - 80) };
    for (let i = 0; i < 12 && !free(p); i++) p = { x: x(), y: ARENA.y0 + 40 + rnd() * (AH - 80) };
    return p;
  };
  return [pick(() => ARENA.x0 + 40 + rnd() * 70), pick(() => ARENA.x1 - 40 - rnd() * 70)];
}

/**
 * 11/22 탕비실 믹스커피 (회복 아이템): 1~5단계마다 한 잔, 단계 시작 뒤 20~40초(판 seed로 정해짐)에 바닥에 놓인다.
 * 밟으면 최대 체력 20%를 바로 (회장님 회복 감소·초당 상한 없이 — 물약 길). 내 자리에서 120px 넘게 · 예고가 없는 바닥 · 구조물 위는 안 된다.
 * 15초 안에 안 마시면 김이 빠지며 사라진다 (마지막 3초 깜빡). 크런치엔 없다. 즉사 예고 중이면 끝난 뒤로 미룬다
 */
export const COFFEE = { from: 20, to: 40, life: 15, blink: 3, heal: 0.2, far: 120, pick: 13, pad: 18 } as const;
/** 이 단계에 커피가 놓일 때 (단계 시작부터 초) — 크런치는 null */
export const coffeeAt = (rnd: () => number, ph: number): number | null => (ph >= 0 && ph < 5 ? COFFEE.from + rnd() * (COFFEE.to - COFFEE.from) : null);
/** 지금 놓아도 되나: 때가 됐고 · 아직 안 놓았고 · 즉사 예고 중이 아니다 */
export const coffeeReady = (at: number | null, phT: number, placed: boolean, killOn: boolean) => at !== null && !placed && phT >= at && !killOn;
/** 마시면 차는 체력 (고정량 — 회복 감소를 받지 않는다) */
export const coffeeHeal = (maxHp: number) => Math.max(1, Math.round(maxHp * COFFEE.heal));
/** 놓을 자리: 판 안(가장자리 pad) · 나에게서 far 넘게 · 구조물 위가 아니고 · bad(예고)가 아닌 곳. 못 찾으면 null (다음 프레임에 다시) */
export function coffeeSpot(rnd: () => number, me: Pt, covers: readonly Cover[], bad: (p: Pt) => boolean = () => false): Pt | null {
  for (let i = 0; i < 40; i++) {
    const p = { x: ARENA.x0 + COFFEE.pad + rnd() * (AW - COFFEE.pad * 2), y: ARENA.y0 + COFFEE.pad + rnd() * (AH - COFFEE.pad * 2) };
    if (Math.hypot(p.x - me.x, p.y - me.y) <= COFFEE.far) continue;
    // 구조물 그림은 바닥 자리보다 위로 솟아 있다 → 위로 26px 더 비운다
    if (covers.some((c) => !c.dead && inRect(p, ((r) => ({ ...r, y: r.y - 26, h: r.h + 26 }))(coverRect(c)), 12))) continue;
    if (bad(p)) continue;
    return p;
  }
  return null;
}

/**
 * 야근은 집합의 힘이다 (11/22 사용자 「두 번째 덩어리가 갑자기 튀어나온다」): 덩어리마다 따로 모이기 → 들어 올림(굴러갈 줄 예고) → 구르기 → 사라짐.
 * 두 번째 덩어리는 첫 덩어리가 굴러가기 시작할 때 다른 자리에서 처음부터 모인다. 시간은 초 (lift·roll은 판 빠르기로 나눈다)
 */
export const GATHER = { start: 0.3, gather: 1.7, lift: 0.8, roll: 2.8, fade: 0.3 } as const;
export type GatherPh = "gather" | "lift" | "roll" | "gone";
export type GatherBall = { k: number; cx: number; cy: number; t: number; lift: number; roll: number; ph: GatherPh };
/** 덩어리 k의 시작 시각(기술 시작부터)·모이는 자리 (둘째는 첫째 반대쪽 옆) */
export function gatherPlan(n: number, spd: number, side: number): { at: number; cx: number; cy: number }[] {
  // 셋째(크런치)는 둘째 반대쪽 옆 · 조금 위
  return Array.from({ length: n }, (_, k) => ({
    at: GATHER.start + k * (GATHER.gather + GATHER.lift / spd),
    cx: k === 0 ? ACX : ACX + (k === 1 ? side : -side) * 110,
    cy: ACY - 10 + (k === 0 ? 0 : k === 1 ? 24 : -30),
  }));
}
/** 11/22 덩어리 수: 1~3단계 하나 · 4~5단계(QA 지옥·서버 오픈) 둘 · 크런치 셋 (앞 덩어리가 굴러갈 때 다음이 모인다) */
export const gatherCount = (ph: number) => (ph >= 5 ? 3 : ph >= 2 ? 2 : 1);
export const gatherBall = (k: number, cx: number, cy: number, spd: number): GatherBall => ({ k, cx, cy, t: 0, lift: GATHER.lift / spd, roll: GATHER.roll, ph: "gather" });
/** 덩어리 하나만 dt초 흘린다 (다른 덩어리와 상관없다). 단계가 바뀐 순간이면 새 단계를 돌려준다 */
export function stepGather(b: GatherBall, dt: number): GatherPh | null {
  b.t += dt;
  const ph: GatherPh = b.t < GATHER.gather ? "gather" : b.t < GATHER.gather + b.lift ? "lift" : b.t < GATHER.gather + b.lift + b.roll + GATHER.fade ? "roll" : "gone";
  if (ph === b.ph) return null;
  b.ph = ph;
  return ph;
}

/**
 * 피해 세기 (판 시간 → 피해 배율). 11/21 사용자 「최종 장비로도 2페이즈가 힘들다」 → 초반을 크게 낮추고, 크런치부터 가파르게 짧게 끝나는 판:
 *  1~3단계(0~3분) 0.55 · 4~5단계(3~5분) 0.55 → 1.0 (크런치 직전 = 예전 1단계 수준) · 크런치(5분~) 1분마다 ×2.5 (크런치 2분 안에 누구나 끝난다)
 *  지옥은 ×0.85 (봉인이 따로 어렵다 — 예전 세기 0.7의 피해 배율 그대로)
 */
export const DMG_EARLY = 0.55;
export const DMG_CRUNCH_GROWTH = 2.5;
export function chairDmgMul(mode: ChairMode, ms: number): number {
  const m = Math.max(0, ms) / 60_000;
  const f = m < 3 ? DMG_EARLY : m < 5 ? DMG_EARLY + (1 - DMG_EARLY) * ((m - 3) / 2) : DMG_CRUNCH_GROWTH ** (m - 5);
  return f * (mode === "hell" ? 0.85 : 1);
}

/**
 * 피해 등급 (최대 HP 기준 체력 1000일 때). 배율 1(크런치 직전)에 기준 체력이면 가벼움 16% · 보통 22% · 무거움 40% (감소 전)
 */
export const DMG = { light: 160, normal: 220, heavy: 400 } as const;

/**
 * 11/21 기준 체력: 상위 랭커 (초월 ★67 · 임원급 몇 부위 +5~6 · 나머지 대리·과장급) 최대 HP 약 6천.
 * 맞는 피해는 √(내 최대 HP × 기준 체력) 비례 → 기준 스펙은 최대 HP의 등급 %, 체력이 높을수록 % 로는 덜 아프다 (장비 차이가 버티는 시간으로 보이게):
 *  100층 막 넘긴 약한 스펙(약 2.5천) ×1.55 · 임원급 +15 풀세트(약 1.2만) ×0.71
 */
export const CHAIR_REF_HP = 6000;

/** 맞는 피해: 등급 값 × √(최대 HP × 기준 체력) × 피해 세기 (k = chairDmgMul) */
export const hitDamage = (base: number, maxHp: number, k: number) => Math.max(1, Math.round((base / 1000) * Math.sqrt(Math.max(1, maxHp) * CHAIR_REF_HP) * k));

/** 회장님 앞에서 받는 피해 감소는 이만큼만 (방어 패시브·세트 옵션이 회장님 공격을 반만 막는다) */
export const CHAIR_GUARD_KEEP = 0.5;
/** 회장님 앞에서 회복 (흡혈·재생·스킬 회복 · 물약은 그대로): 11/21 50%만 (예전 30%), 초당 최대 HP의 3%까지 (예전 2%) */
export const CHAIR_HEAL_MUL = 0.5;
export const CHAIR_HEAL_CAP_PER_SEC = 0.03;
export const CHAIR_HEAL_TEXT = "회장님 앞에서는 회복이 50% 줄어요";

/**
 * 즉사 기술 일정 (11/20 단계 1분): 단계 시작(전환 화면·변신 뒤)부터 몇 초에 무엇을.
 * 11/21 즉사는 3단계부터: 3단계 드랍, 4단계 엎기, 5단계 권고사직(11/22 드랍 대신)·엎기, 크런치는 45초마다(11/21 30 → 45 — 운으로 일찍 끝나는 판을 줄인다) 권고사직·엎기·드랍 중 하나 (권고사직이 먼저). 2단계 권고사직은 뺐다
 */
/** 크런치 즉사 간격 (초) */
export const CRUNCH_KILL_SEC = 45;
export function phaseKills(rnd: () => number, ph: number): { at: number; kind: KillId }[] {
  const j = () => Math.round(rnd() * 10);
  if (ph === 2) return [{ at: 28 + j(), kind: "drop" }];
  if (ph === 3) return [{ at: 24 + j(), kind: "flip" }];
  // 11/22 사용자 「권고사직 패턴은 안 나오는 거야?」 → 5단계 앞 즉사를 드랍 대신 권고사직으로 (크런치 전에 한 번은 본다)
  if (ph === 4) return [{ at: 18 + j(), kind: "quit" }, { at: 42 + j() * 0.5, kind: "flip" }];
  if (ph >= 5) {
    // 크런치: 45초마다 (권고사직이 먼저)
    const out: { at: number; kind: KillId }[] = [];
    for (let k = 0; k < 30; k++) out.push({ at: 12 + k * CRUNCH_KILL_SEC + j() * 0.6, kind: k === 0 ? "quit" : (["quit", "flip", "drop"] as const)[Math.floor(rnd() * 3)] });
    return out;
  }
  return [];
}

// ── 지옥 봉인 ──

/** ms에 봉인돼 있는 스킬 (서버가 준 순서 앞에서부터) */
export const sealedAt = (pool: readonly string[], ms: number): string[] => pool.slice(0, chairSealedCount(ms, pool.length));

/** 3초 안에 봉인될 스킬 (빨간 깜빡임) */
export function sealSoon(pool: readonly string[], ms: number, everyMs = 45_000, warnMs = 3_000): string | null {
  const n = chairSealedCount(ms, pool.length);
  if (n >= pool.length) return null;
  const next = (n + 1) * everyMs;
  return next - ms <= warnMs ? pool[n] : null;
}

/** 11/21 다음 반려 예고: 반려된 것(순서대로) · 다음 것 · 남은 ms · 3초 안이면 reveal (다 반려되면 next null) */
export type SealClock = { sealed: string[]; next: string | null; leftMs: number; reveal: boolean };
export function sealClock(pool: readonly string[], ms: number, everyMs = 45_000, warnMs = 3_000): SealClock {
  const sealed = sealedAt(pool, ms);
  const n = sealed.length;
  if (n >= pool.length) return { sealed, next: null, leftMs: 0, reveal: false };
  const leftMs = Math.max(0, (n + 1) * everyMs - Math.max(0, ms));
  return { sealed, next: pool[n], leftMs, reveal: leftMs <= warnMs };
}

/** 반려할 때 회장님 한마디 (돌아가며 — 말풍선은 prewarm에서 미리 굽는다) */
export const SEAL_LINES = ["이건 반려야!", "다시 해 와!", "이런 걸 결재하라고?", "반려! 처음부터 다시.", "내 책상에서 치워.", "누가 이런 걸 올렸어?"] as const;

/** 단축키 칸 번호 (봉인된 스킬 id → 칸) */
export const slotsOf = (hotbar: readonly (string | null)[], ids: readonly string[]): number[] => hotbar.flatMap((id, i) => (id && ids.includes(id) ? [i] : []));

/** 봉인된 스킬을 뺀 스킬 표 (패시브 효과·연계 보너스를 다시 계산할 때) */
export function liveSkills<T extends string>(skills: Partial<Record<T, number>>, sealed: ReadonlySet<string>): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  for (const [id, lv] of Object.entries(skills) as [T, number][]) if (!sealed.has(id)) out[id] = lv;
  return out;
}

// ── 숨을 곳 (구조물) ──

export type CoverKind = "partition" | "copier" | "cooler" | "table" | "pile";
/** 바닥에 닿는 크기 (가로·세로) · 버티는 횟수 */
export const COVER_FP: Record<CoverKind, [number, number, number]> = { partition: [34, 8, 3], copier: [18, 10, 4], cooler: [14, 8, 3], table: [32, 12, 4], pile: [16, 8, 1] };
export const COVER_KINDS: readonly CoverKind[] = ["partition", "copier", "table", "pile", "partition", "cooler"];
export const COVER_SLOTS: readonly [number, number][] = [
  [196, 214],
  [444, 214],
  [320, 318],
  [160, 340],
  [480, 340],
  [256, 268],
  [384, 268],
  [320, 200],
];

export type Cover = { kind: CoverKind; x: number; y: number; hp: number; max: number; hitT: number; dead: boolean };
export type Rect = { x: number; y: number; w: number; h: number };

/** 여섯 개 깔기 (자리 여덟 중 여섯을 섞어 고르고 조금씩 흔든다) */
export function layCovers(rnd: () => number): Cover[] {
  const sl = COVER_SLOTS.map((s) => ({ s, k: rnd() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 6)
    .map((o) => o.s);
  return sl.map(([x, y], i) => {
    const kind = COVER_KINDS[i];
    const max = COVER_FP[kind][2];
    return { kind, x: Math.round(x + (rnd() - 0.5) * 24), y: Math.round(y + (rnd() - 0.5) * 16), hp: max, max, hitT: -9, dead: false };
  });
}

export const coverRect = (c: Pick<Cover, "kind" | "x" | "y">): Rect => {
  const [w, h] = COVER_FP[c.kind];
  return { x: c.x - w / 2, y: c.y - h, w, h };
};
/** 탄·레이저·파도를 막는 구조물 (서류 산더미는 위에서 떨어지는 것만) */
export const blocks = (c: Cover) => !c.dead && c.kind !== "pile";
export const inRect = (p: { x: number; y: number }, r: Rect, pad = 0) => p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad;

/** 선분이 사각형에 닿나 (Liang–Barsky) */
export function segRect(x0: number, y0: number, x1: number, y1: number, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const cl: [number, number][] = [
    [-dx, x0 - r.x],
    [dx, r.x + r.w - x0],
    [-dy, y0 - r.y],
    [dy, r.y + r.h - y0],
  ];
  for (const [p, q] of cl) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return true;
}

/** (x,y)에서 각 a로 쏜 길이 L의 레이저가 구조물에 막히는 길이 */
export function rayLen(covers: readonly Cover[], x: number, y: number, a: number, L: number): number {
  let best = L;
  const ex = x + Math.cos(a) * L;
  const ey = y + Math.sin(a) * L;
  for (const c of covers) {
    if (!blocks(c)) continue;
    const r = coverRect(c);
    if (!segRect(x, y, ex, ey, r)) continue;
    let lo = 0;
    let hi = best;
    for (let k = 0; k < 14; k++) {
      const m = (lo + hi) / 2;
      if (segRect(x, y, x + Math.cos(a) * m, y + Math.sin(a) * m, r)) hi = m;
      else lo = m;
    }
    if (hi < best) best = hi;
  }
  return best;
}

/** 원(반지름 r)을 구조물 밖으로 밀어낸다 (걸어서 지나갈 수 없다) */
export function pushOutCovers(p: { x: number; y: number }, covers: readonly Cover[], r: number): void {
  for (const c of covers) {
    if (c.dead) continue;
    const q = coverRect(c);
    if (!inRect(p, q, r)) continue;
    const l = p.x - (q.x - r);
    const rr = q.x + q.w + r - p.x;
    const t = p.y - (q.y - r);
    const b = q.y + q.h + r - p.y;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = q.x - r;
    else if (m === rr) p.x = q.x + q.w + r;
    else if (m === t) p.y = q.y - r;
    else p.y = q.y + q.h + r;
  }
}

/** 걸을 수 있는 바닥 안으로 */
export const clampArena = (p: { x: number; y: number }, pad = 0) => ({ x: Math.max(ARENA.x0 + pad, Math.min(ARENA.x1 - pad, p.x)), y: Math.max(ARENA.y0 + pad, Math.min(ARENA.y1 - pad, p.y)) });


/**
 * 11/22 판 도중 그만두기 (rpg:quit): 브리핑(시작 전)이면 기록 없이 바로 닫고, 싸우는 중이면 그 자리에서 쓰러진 것으로 (회색 연출 → 기록),
 * 결과 창이 떴으면(끝난 판) 닫는다. 이미 쓰러져 연출 중이면 아무것도 안 한다
 */
export function chairQuit(s: { started: boolean; done: boolean; died: boolean }): "close" | "giveUp" | "wait" {
  if (s.done || !s.started) return "close";
  return s.died ? "wait" : "giveUp";
}
