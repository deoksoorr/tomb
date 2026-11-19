// 11/18 둘째 날 다시 오게 (리텐션): 새 이웃 꾸러미(가입 첫 7일) · 첫 걸음 미션 · 오늘의 할 일 3개.
// 11/19 「편하게 노는 게임」 개편: 포인트 보상을 모두 아이템(상점 아이템·영구 꾸미기·사냥 물약·강화 재료)으로 바꿨다.
// 화면·서버 공용 순수 정의. 받기 판정·지급은 서버(lib/retainServer, 계정 저장소 Lua + 사냥 가방 lib/rpgGift)가 한다.
//
// 저장 자리 (새 키 없음 — 내 정보를 읽을 때 이미 읽는 해시에 칸만 더한다 → 읽기 명령이 늘지 않는다)
//  - 계정 해시 acct:{id}: gp(받은 꾸러미 수) · gpDay(마지막으로 받은 게임 날짜) · gpPot(사냥 가방에 아직 못 넣은 꾸러미 번호들, 쉼표) ·
//    gpSeen(꾸러미 창이 저절로 열린 게임 날짜 — 하루 한 번) ·
//    fs(첫 걸음 미션 비트) · fsDone(첫 걸음 큰 선물 받음) · todoStamps(오늘의 할 일 셋 다 한 날 수)
//  - 오늘 적립 해시 acct:{id}:earn:{날짜}: _q:{할 일 종류}(오늘 진행) · _qc(오늘 받은 할 일 비트 1·2·4 + 셋 다 8)

import { daysBetween, gameDay } from "./gameDay";
import type { RpgBundle } from "./rpgGift";

/** 11/19 보상 한 칸: 지갑 포인트 + 사냥 가방 꾸러미 (첫 걸음·오늘의 할 일 — 화면 칩·토스트가 같은 모양으로 보여 준다) */
export type Reward = { points?: number; bundle?: RpgBundle };

// ── 새 이웃 꾸러미 (가입 첫 7일) ──

/** 화면 이름 (11/19 「신입 7일 선물길」에서 바꿈 — 후보: 새 이웃 꾸러미 · 일주일 환영 선물 · 마을 첫 주 선물) */
export const PATH_NAME = "새 이웃 꾸러미";
/** 꾸러미 수 */
export const PATH_GIFTS = 7;

/** 꾸러미 꾸미기 이용 기간 (11/19 사용자 「일주일 기간제로」) */
export const PATH_WEAR_DAYS = 7;
/** 7일째 꾸러미의 한정 칭호 (@tomb/protocol TITLE_IDS) */
export const PATH_TITLE_ID = "t_grad";

/** 화면 그림: 상점 아이템 그림 · 사냥 물약 그림 · 강화 재료 그림 · 칭호 */
export type PathArt = { item: string } | { potion: string } | { mat: string } | { title: true };

export type PathGift = {
  /** 몇 번째 꾸러미 (1..7) */
  n: number;
  /** 화면 이름 (짧게) */
  name: string;
  /** 한 줄 설명 (해요체) */
  desc: string;
  art: PathArt;
  /** 가방에 넣는 상점 아이템 (하루권·폭죽·염색권) */
  items?: readonly { itemId: string; count: number }[];
  /** 11/19 기간제 꾸미기 (PATH_WEAR_DAYS일 — 입고 있으면 그 자리, 아니면 벗어 둔 꾸미기에) */
  wear?: string;
  /** 사냥 가방 (물약·강화 재료 — lib/rpgGift) */
  bundle?: RpgBundle;
  /** 한정 칭호 (받은 꾸러미 수 7 = 칭호 조건 — lib/titlesServer) */
  title?: true;
};

/** 7일 꾸러미 (실제 아이템 id). 포인트는 없다. 모두 되팔 수 없다 */
export const PATH: readonly PathGift[] = [
  { n: 1, name: "빨간 목도리", desc: "7일 동안 두를 수 있는 꾸미기예요. 가방의 벗어 둔 꾸미기에서 둘러요.", art: { item: "neck_scarf" }, wear: "neck_scarf" },
  { n: 2, name: "물약 꾸러미", desc: "커피 3잔과 에너지드링크 2캔이에요. 사냥터에서 써요.", art: { potion: "p_coffee" }, bundle: { potions: { p_coffee: 3, p_energy: 2 } } },
  { n: 3, name: "작은 폭죽", desc: "밤하늘에 한 발 쏘면 채널 모두가 같이 봐요.", art: { item: "fw_small" }, items: [{ itemId: "fw_small", count: 1 }] },
  { n: 4, name: "결재 서류 10장", desc: "장비를 강화할 때 써요. 사냥 가방에 들어가요.", art: { mat: "m_doc" }, bundle: { mats: { m_doc: 10 } } },
  { n: 5, name: "얼룩 염색권", desc: "몸이나 머리 색을 바꿔 봐요.", art: { item: "dye_basic" }, items: [{ itemId: "dye_basic", count: 1 }] },
  { n: 6, name: "도시락 꾸러미", desc: "야근 도시락 2개와 부활 쿠키 1개예요. 야근 빌딩에서 든든해요.", art: { potion: "p_lunchbox" }, bundle: { potions: { p_lunchbox: 2, p_cookie: 1 } } },
  {
    n: 7,
    name: "마을 새내기 졸업",
    desc: "한정 칭호와 7일 동안 꽂는 꽃 머리핀, 보호 문서 1장을 같이 줘요.",
    art: { title: true },
    title: true,
    wear: "hat_flower",
    bundle: { mats: { m_prot: 1 } },
  },
];

export type PathView = {
  /** 받은 꾸러미 수 (0..6 — 7개를 다 받으면 꾸러미 칸이 사라진다) */
  got: number;
  /** 지금 한꺼번에 받을 수 있는 수 (가입한 날부터 지난 게임 날짜 수 + 1까지 — 밀린 날 것도 쌓인다) */
  owed: number;
  /** 지금 받을 수 있는지 */
  canClaim: boolean;
  /** 오늘 꾸러미 창이 이미 저절로 열렸는지 (하루 한 번만 저절로) */
  seen: boolean;
};

/**
 * 11/19 꾸러미 상태: 모든 계정이 받는다 (기존 가입자도 가입한 날부터 소급 — 가입한 날을 모르는 옛 계정은 7개 모두).
 * 받을 수 있는 수 = min(7, 가입한 게임 날짜부터 오늘까지 날 수) − 받은 수. 7개를 다 받으면 null (칩·창·저절로 열기 모두 사라진다)
 */
export function pathView(createdAt: number, got: number, seenDay: string | null, today: string): PathView | null {
  const n = Math.max(0, Math.min(PATH_GIFTS, Math.floor(got) || 0));
  if (n >= PATH_GIFTS) return null;
  const avail = createdAt > 0 ? Math.min(PATH_GIFTS, Math.max(1, daysBetween(gameDay(createdAt), today) + 1)) : PATH_GIFTS;
  const owed = Math.max(0, avail - n);
  return { got: n, owed, canClaim: owed > 0, seen: seenDay === today };
}

/**
 * 꾸러미를 세는 가입 시각: 기록이 있으면 그대로, 없는데 포인트를 모은 적이 있으면 옛 계정(0 = 7개 모두), 아무것도 없는 새 세션은 지금
 * (새로 만든 세션이 들어오기도 전에 7개를 한꺼번에 받지 않게)
 */
export const pathSince = (createdAt: number, lifetimePoints: number, now: number): number => (createdAt > 0 ? createdAt : lifetimePoints > 0 ? 0 : now);

/** 다음에 받을 꾸러미 (다 받았으면 null) */
export const nextPathGift = (v: Pick<PathView, "got">): PathGift | null => PATH[v.got] ?? null;
/** 지금 받을 꾸러미들 (밀린 것까지) */
export const owedPathGifts = (v: Pick<PathView, "got" | "owed">): PathGift[] => PATH.slice(v.got, v.got + v.owed);

// ── 첫 걸음 미션 (새 계정 첫 며칠 — 마을에서 할 수 있는 것을 하나씩 알려 준다) ──

export type FirstStepId = "run" | "jump" | "look" | "sit" | "emote" | "chat" | "bag" | "fish" | "gather" | "stars" | "hunt" | "visit" | "camp" | "sea" | "quest";
/** label = 미션, pc·touch = 조작 안내 (데스크톱·폰 따로), reward = 그 칸을 처음 하면 바로 받는 포인트 (11/19 사용자 「차라리 보상은 포인트를」) */
export type FirstStep = { id: FirstStepId; bit: number; label: string; pc: string; touch: string; reward: Reward };

const EASY: Reward = { points: 100 };
const PLAY: Reward = { points: 200 };
const COFFEE = EASY;
const ENERGY = EASY;
const DOC2 = PLAY;

export const FIRST_STEPS: readonly FirstStep[] = [
  { id: "run", bit: 1, label: "달려 보기", pc: "Shift를 누른 채 움직여요.", touch: "[달리기]를 켜고 움직여요.", reward: COFFEE },
  { id: "jump", bit: 2, label: "점프하기", pc: "Space를 눌러요.", touch: "[점프]를 눌러요.", reward: COFFEE },
  { id: "look", bit: 4, label: "살펴보기", pc: "반짝이는 것이나 사람 앞에서 E를 눌러요.", touch: "가까이 가서 [상호작용]을 눌러요.", reward: ENERGY },
  { id: "sit", bit: 8, label: "벤치에 앉기", pc: "벤치 앞에서 X를 눌러요.", touch: "벤치 앞에서 [앉기]를 눌러요.", reward: COFFEE },
  { id: "emote", bit: 16, label: "표현 하나 쓰기", pc: "T를 눌러 골라요.", touch: "[표현]에서 골라요.", reward: ENERGY },
  { id: "chat", bit: 32, label: "채팅으로 인사하기", pc: "Enter로 채팅을 열고 인사해요.", touch: "[채팅]을 눌러 인사해요.", reward: COFFEE },
  { id: "bag", bit: 64, label: "가방 열어 보기", pc: "I를 눌러 꾸미기를 구경해요.", touch: "아래 [가방]을 눌러요.", reward: ENERGY },
  { id: "fish", bit: 128, label: "물고기 한 마리 낚기", pc: "호수 잔교나 강둑의 낚시 자리에서 E를 눌러 직접 낚아요. 자동 낚시는 세지 않아요.", touch: "낚시 자리에서 [상호작용]을 눌러 직접 낚아요. 자동 낚시는 세지 않아요.", reward: DOC2 },
  { id: "gather", bit: 256, label: "채집 한 번 하기", pc: "숲이나 풀밭에서 반짝이는 풀이나 돌 앞에서 E를 눌러요.", touch: "반짝이는 풀이나 돌 앞에서 [상호작용]을 눌러요.", reward: DOC2 },
  { id: "stars", bit: 512, label: "별자리 한 판 잇기", pc: "마을 곳곳의 망원경 앞에서 E를 눌러요. 지도에 망원경으로 표시돼요.", touch: "망원경 앞에서 [상호작용]을 눌러요.", reward: DOC2 },
  { id: "hunt", bit: 1024, label: "사냥터 한 판", pc: "아래 [사냥]을 누르면 사냥터 입구까지 걸어가요.", touch: "아래 [사냥]을 누르면 사냥터 입구까지 걸어가요.", reward: { points: 300 } },
  { id: "visit", bit: 2048, label: "이웃 집 구경하기", pc: "아래 [집]에서 「주거 구역 보기」를 누르면 집들이 모인 곳이 보여요. 이웃 집 문 앞에서 E를 눌러 들어가요.", touch: "아래 [집]에서 「주거 구역 보기」를 눌러요. 이웃 집 문 앞에서 [상호작용]을 눌러 들어가요.", reward: DOC2 },
  // 11/19 버스 나들이 (도착 = 게임 map:changed camp·sea)
  { id: "camp", bit: 4096, label: "캠핑장 가 보기", pc: "캠핑장행 정류장에서 E를 눌러 버스를 타요.", touch: "캠핑장행 정류장에서 [상호작용]을 눌러 버스를 타요.", reward: PLAY },
  { id: "sea", bit: 8192, label: "바닷가 가 보기", pc: "바닷가행 정류장에서 E를 눌러 버스를 타요.", touch: "바닷가행 정류장에서 [상호작용]을 눌러 버스를 타요.", reward: PLAY },
  // 11/19 마을 의뢰 게시판 (버스 정류장 마당) — 의뢰 하나를 납품하면 (화면이 납품 성공 응답을 엿듣는다 — RetainLayer)
  {
    id: "quest",
    bit: 16384,
    label: "의뢰 하나 해결하기",
    pc: "버스 정류장 마당의 의뢰 게시판에서 E를 눌러 의뢰를 하나 해결해요.",
    touch: "버스 정류장 마당의 의뢰 게시판에서 [상호작용]을 눌러 의뢰를 하나 해결해요.",
    reward: PLAY,
  },
];
export const FIRST_ALL = FIRST_STEPS.reduce((m, s) => m | s.bit, 0);

/**
 * 11/19 첫 걸음 길 안내: 미션을 누르면 게임이 내 캐릭터에서 이 목적지까지 걷는 길에 화살표를 잇는다 (game/world/RouteGuide).
 * 위치가 없는 미션(달리기·점프·표현·채팅·가방)은 없다 → 조작 안내만
 */
const FIRST_GUIDE: Partial<Record<FirstStepId, FirstGuideTarget>> = {
  sit: "bench",
  look: "look",
  fish: "fish",
  gather: "gather",
  stars: "stars",
  hunt: "hunt",
  visit: "visit",
  camp: "busCamp",
  sea: "busSea",
  quest: "questBoard",
};
export const firstGuideTarget = (id: FirstStepId): FirstGuideTarget | null => FIRST_GUIDE[id] ?? null;
/** 미션을 모두 하면 받는 큰 선물: 1,000P + 고양이 귀 하루권(가방) + 결재 서류 10장 + 보호 문서 1장(사냥 가방) */
export const FIRST_REWARD = { points: 1000, itemId: "hat_cat", count: 1, bundle: { mats: { m_doc: 10, m_prot: 1 } } as RpgBundle } as const;

export const firstStepById = (id: string): FirstStep | undefined => FIRST_STEPS.find((s) => s.id === id);

export type FirstView = { mask: number };

/** 첫 걸음 상태: 11/19 모든 계정 (기존 가입자도 안 한 미션이 있으면). 큰 선물까지 받으면 null — 칩·창이 사라지고 다시 안 나온다 */
export function firstView(createdAt: number, mask: number, done: boolean, today: string): FirstView | null {
  void createdAt;
  void today;
  if (done) return null;
  return { mask: (Math.floor(mask) || 0) & FIRST_ALL };
}

// ── 오늘 미션 3개 (11/19 화면 이름 「오늘의 할 일」 → 「오늘 미션」, 코드 이름은 todo 그대로) ──

/**
 * 서버가 이미 아는 행동만 (눈싸움·귓속말처럼 화면·실시간 서버만 아는 건 뺀다).
 * 11/19 놀이 넷(귀신의 집·범퍼카·관람차/열기구·불멍)은 화면에서만 끝나는 놀이라 가벼운 판 기록(lib/retainPlay — 서명한 시작 표 + 최소 시간 + 끝까지)으로 센다
 */
export type TodoKind =
  | "fish"
  | "gather"
  | "stars"
  | "hunt"
  | "flower"
  | "like"
  | "stay"
  | "sell"
  | "wish"
  | "guestbook"
  | "quest"
  | "haunt"
  | "bumper"
  | "sky"
  | "fire"
  | "seaFish"
  | "seaGather"
  | "campGather"
  | "gull"
  | "bbq";
/** 뽑기 묶음: 하루 3개 = 마을 일상 하나 · 놀이 하나 · 나들이(사냥·바닷가·캠핑장) 하나 */
export type TodoCat = "life" | "play" | "trip";
/** 11/19 길 안내 목적지 (첫 걸음·오늘 미션 공용 — game/world/RouteGuide, WorldScene resolveRoute) */
export type FirstGuideTarget =
  | "bench"
  | "look"
  | "fish"
  | "gather"
  | "stars"
  | "hunt"
  | "visit"
  | "busCamp"
  | "busSea"
  | "questBoard"
  | "grave"
  | "seller"
  | "wish"
  | "haunt"
  | "bumper"
  | "sky"
  | "campfire";
/**
 * unit = 진행 단위 글자, scale = 저장된 진행 1칸이 화면 몇 단위인지 (머무르기는 기록 1번 = 10분), hint = 짧은 안내,
 * group = 같은 행동 묶음 (같은 날 둘 다 뽑지 않는다 — 바다 낚시도 「물고기 낚기」에 든다), open = 그 장소가 열린 서버에서만 (lib/camp·lib/sea),
 * guide = [안내] 단추로 화살표를 이을 목적지 (마을 안. 캠핑장·바닷가는 마을 정류장까지)
 */
export type TodoDef = {
  kind: TodoKind;
  cat: TodoCat;
  label: string;
  need: number;
  unit: string;
  hint: string;
  scale?: number;
  group?: "fish" | "gather";
  open?: "camp" | "sea" | "trip";
  guide?: FirstGuideTarget;
};

export const TODO_POOL: readonly TodoDef[] = [
  // ── 마을 일상 ──
  { kind: "flower", cat: "life", label: "묘비에 꽃 한 송이 놓기", need: 1, unit: "송이", hint: "아무 묘비 앞에서 꽃을 놓아요.", guide: "grave" },
  { kind: "like", cat: "life", label: "이웃 집에 좋아요 누르기", need: 1, unit: "번", hint: "이웃 집에 들어가 좋아요를 눌러요.", guide: "visit" },
  // 머무르기 기록(10분마다 1번) 3번 = 30분
  { kind: "stay", cat: "life", label: "마을에 30분 머무르기", need: 3, unit: "분", scale: 10, hint: "마을에 있으면 저절로 쌓여요." },
  // 11/19 가방이 300칸이라 팔러 가는 일이 생겼다
  { kind: "sell", cat: "life", label: "물고기나 채집물 팔기", need: 1, unit: "번", hint: "어부 영감이나 수집가에게 가방 속 것을 팔아요.", guide: "seller" },
  { kind: "wish", cat: "life", label: "소원 분수에 동전 던지기", need: 1, unit: "번", hint: "광장 소원 분수에서 동전을 던져요. 하루 한 번이에요.", guide: "wish" },
  { kind: "guestbook", cat: "life", label: "이웃 집 방명록 남기기", need: 1, unit: "번", hint: "이웃 집에 들어가 방명록에 한 줄 남겨요.", guide: "visit" },
  { kind: "quest", cat: "life", label: "마을 의뢰 하나 납품하기", need: 1, unit: "번", hint: "버스 정류장 마당 의뢰 게시판에서 납품해요.", guide: "questBoard" },
  // ── 놀이 ──
  { kind: "fish", cat: "play", label: "물고기 3마리 낚기", need: 3, unit: "마리", hint: "호수, 강, 바닷가 어디서든 직접 낚으면 세요. 자동 낚시는 세지 않아요.", group: "fish", guide: "fish" },
  { kind: "gather", cat: "play", label: "채집 2번 하기", need: 2, unit: "번", hint: "반짝이는 풀·돌·수풀에서 채집해요.", group: "gather", guide: "gather" },
  { kind: "stars", cat: "play", label: "별자리 잇기 한 판", need: 1, unit: "판", hint: "마을 곳곳의 망원경에서 해요. 지도에 망원경으로 표시돼요.", guide: "stars" },
  {
    kind: "haunt",
    cat: "play",
    label: "귀신의 집 끝까지 돌파하기",
    need: 1,
    unit: "번",
    hint: "귀신의 집을 중간에 나오지 않고 출구까지 돌파해요. 도중에 나오면 세지 않아요.",
    guide: "haunt",
  },
  { kind: "bumper", cat: "play", label: "범퍼카 한 판 타기", need: 1, unit: "판", hint: "범퍼카장에서 1분 넘게 달려요.", guide: "bumper" },
  { kind: "sky", cat: "play", label: "관람차나 열기구 타기", need: 1, unit: "번", hint: "관람차나 열기구에 올라 40초 넘게 하늘 구경해요.", guide: "sky" },
  { kind: "fire", cat: "play", label: "모닥불 앞에서 불멍 2분", need: 1, unit: "번", hint: "모닥불 둘레 자리에 앉아 2분 동안 불을 바라봐요.", guide: "campfire" },
  // ── 나들이 (사냥·바닷가·캠핑장) ──
  { kind: "hunt", cat: "trip", label: "사냥 한 판", need: 1, unit: "판", hint: "사냥터나 야근 빌딩에서 한 판 끝내요.", guide: "hunt" },
  { kind: "seaFish", cat: "trip", label: "바닷가에서 물고기 2마리 낚기", need: 2, unit: "마리", hint: "포구 잔교는 물때와 상관없이 낚여요. 직접 낚은 것만 세고 자동 낚시는 세지 않아요.", group: "fish", open: "sea", guide: "busSea" },
  { kind: "seaGather", cat: "trip", label: "바닷가 갯벌·모래 채집 2번", need: 2, unit: "번", hint: "물이 빠지면 갯벌 구멍, 늘 백사장 모래를 파요.", group: "gather", open: "sea", guide: "busSea" },
  { kind: "campGather", cat: "trip", label: "캠핑장 숲에서 채집 2번", need: 2, unit: "번", hint: "캠핑장 숲·물가의 반짝이는 곳에서 채집해요.", group: "gather", open: "camp", guide: "busCamp" },
  { kind: "gull", cat: "trip", label: "갈매기에게 과자 3번 던지기", need: 3, unit: "번", hint: "포구 매점에서 과자를 사서 갈매기에게 던져요.", open: "sea", guide: "busSea" },
  { kind: "bbq", cat: "trip", label: "캠핑장·바닷가에서 한 끼 사 먹기", need: 1, unit: "번", hint: "캠핑장 그릴·자판기나 포구 매점에서 하나 사 먹어요.", open: "trip", guide: "busCamp" },
];
export const TODO_COUNT = 3;
/** 하나에 (11/19 300P + 결재 서류 2장) */
export const TODO_GIFT: Reward = { points: 300, bundle: { mats: { m_doc: 2 } } };
/** 미션 셋을 다 하면 더 (도장 하나와 1,000P · 결재 서류 5장) */
export const TODO_BONUS_GIFT: Reward = { points: 1000, bundle: { mats: { m_doc: 5 } } };
/** 도장이 이만큼 쌓일 때마다 보호 문서 1장 더 (7일 미션 완료 — 보호 문서가 한 주에 너무 많이 풀리지 않게) */
export const TODO_PROT_EVERY = 7;
export const TODO_PROT_GIFT: Reward = { bundle: { mats: { m_prot: 1 } } };
/** 받은 미션 비트 (_qc): 0·1·2번 칸 = 1·2·4, 셋 다 = 8 */
export const TODO_BONUS_BIT = 8;
/** 화면 이름 */
export const TODO_NAME = "오늘 미션";

/** 11/19 화면에서만 끝나는 놀이 미션 (판 기록 lib/retainPlay — 시작 표 + 서버 시계 최소 시간 + 끝까지) */
export const PLAY_KINDS = ["haunt", "bumper", "sky", "fire"] as const;
export type PlayKind = (typeof PLAY_KINDS)[number];
/** 놀이마다 최소 시간 (서버 시계, 시작 표를 받은 때부터). 귀신의 집은 미로마다 더 길 수 있다 (lib/retainPlay hauntMinMs) */
export const PLAY_MIN_MS: Record<PlayKind, number> = {
  haunt: 12_000,
  // 범퍼카 한 판 = 1분 넘게 타기
  bumper: 60_000,
  // 관람차 한 바퀴 48초 · 열기구 비행 110초 → 40초 넘게
  sky: 40_000,
  // 불멍 2분
  fire: 120_000,
};

export const todoDef = (kind: string): TodoDef | undefined => TODO_POOL.find((d) => d.kind === kind);
/** 오늘 적립 해시의 진행 칸 (머무르기는 원래 있던 _stay를 그대로 본다) */
export const todoField = (kind: TodoKind) => (kind === "stay" ? "_stay" : `_q:${kind}`);
export const TODO_CLAIM_FIELD = "_qc";

/** 열린 장소 (서버 환경값 lib/camp campOpen · lib/sea seaOpen — 서버가 넘긴다. 순수 함수 기본값은 모두 열림) */
export type TodoOpen = { camp: boolean; sea: boolean };
const ALL_OPEN: TodoOpen = { camp: true, sea: true };
const isOpen = (d: TodoDef, o: TodoOpen) => !d.open || (d.open === "trip" ? o.camp || o.sea : o[d.open]);

/** FNV-1a 32비트 (화면·서버가 같은 값을 낸다) */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 그날(게임 날짜, 새벽 5시에 바뀐다) 그 계정의 미션 3개 = 날짜 + 계정 해시로 고정 (저장소를 묻지 않는다 — 계정마다 다르고 날마다 무작위).
 * 11/19 마을 일상 하나 · 놀이 하나 · 나들이 하나. 같은 묶음(group — 낚시·채집)은 하루에 하나만, 닫힌 장소(캠핑장·바닷가)는 뽑지 않는다.
 * 나들이 칸에 고를 것이 둘이 안 되면(캠핑장·바닷가가 모두 닫힌 서버) 놀이·나들이를 합쳐 고른다
 */
export function todoPicks(day: string, accountId: string, open: TodoOpen = ALL_OPEN): TodoKind[] {
  let h = fnv(`${day}|${accountId}`);
  const next = () => {
    // xorshift로 다음 수를 섞는다
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return h;
  };
  const avail = TODO_POOL.filter((d) => isOpen(d, open));
  const trip = avail.filter((d) => d.cat === "trip");
  const cats: TodoCat[][] = trip.length >= 2 ? [["life"], ["play"], ["trip"]] : [["life"], ["play"], ["play", "trip"]];
  const out: TodoDef[] = [];
  for (const cs of cats) {
    const pool = avail.filter((d) => cs.includes(d.cat) && !out.includes(d) && !(d.group && out.some((o) => o.group === d.group)));
    if (pool.length) out.push(pool[next() % pool.length]);
  }
  return out.map((d) => d.kind);
}

export type TodoItem = { kind: TodoKind; label: string; need: number; have: number; claimed: boolean };
/** 진행 글자 「12/30분」 「1/3마리」 (진행 칸 수 → 사람이 읽는 단위) */
export function todoProgressText(it: Pick<TodoItem, "kind" | "need" | "have">): string {
  const d = todoDef(it.kind);
  const k = d?.scale ?? 1;
  return `${Math.min(it.have, it.need) * k}/${it.need * k}${d?.unit ?? ""}`;
}
export type TodoView = { day: string; items: TodoItem[]; bonus: boolean; stamps: number };

/** 오늘 미션 화면 값. progress = 오늘 적립 해시의 진행 칸 값 (todoField → 수), claimed = _qc 비트 */
export function todoView(
  day: string,
  accountId: string,
  progress: Readonly<Record<string, number>>,
  claimed: number,
  stamps: number,
  open: TodoOpen = ALL_OPEN,
): TodoView {
  const mask = Math.floor(claimed) || 0;
  const items = todoPicks(day, accountId, open).map((kind, i): TodoItem => {
    const d = todoDef(kind)!;
    return { kind, label: d.label, need: d.need, have: Math.max(0, Math.floor(progress[todoField(kind)] ?? 0)), claimed: (mask & (1 << i)) !== 0 };
  });
  return { day, items, bonus: (mask & TODO_BONUS_BIT) !== 0, stamps: Math.max(0, Math.floor(stamps) || 0) };
}

/** 행동 응답에 실어 보내는 진행 한 칸 (화면이 내 정보 사본을 바로 맞춘다 — lib/api request) */
export type TodoTick = { kind: TodoKind; have: number; day: string };

/** 계정 기록의 리텐션 칸 (lib/store — 이미 읽는 계정·오늘 적립 해시에서) */
export type RetainRecord = {
  gp: number;
  gpDay: string | null;
  gpPot: string | null;
  /** 꾸러미 창이 저절로 열린 게임 날짜 */
  gpSeen: string | null;
  fs: number;
  fsDone: boolean;
  stamps: number;
  /** 오늘 적립 해시의 _q:* 칸 */
  quest: Record<string, number>;
  /** 오늘 받은 할 일 비트 */
  qc: number;
};
export const EMPTY_RETAIN: RetainRecord = { gp: 0, gpDay: null, gpPot: null, gpSeen: null, fs: 0, fsDone: false, stamps: 0, quest: {}, qc: 0 };

/** 내 정보(me.retain)에 싣는 값 */
export type RetainView = { path: PathView | null; first: FirstView | null; todo: TodoView };

export function retainView(accountId: string, createdAt: number, r: RetainRecord, stayTicks: number, day: string, open: TodoOpen = ALL_OPEN): RetainView {
  return {
    path: pathView(createdAt, r.gp, r.gpSeen, day),
    first: firstView(createdAt, r.fs, r.fsDone, day),
    todo: todoView(day, accountId, { ...r.quest, _stay: stayTicks }, r.qc, r.stamps, open),
  };
}

/** 오늘 적립 해시의 칸들 → _q:* 진행과 _qc (그 밖의 칸은 무시) */
export function questFromEarn(entries: Iterable<readonly [string, unknown]>): Pick<RetainRecord, "quest" | "qc"> {
  const quest: Record<string, number> = {};
  let qc = 0;
  for (const [k, v] of entries) {
    if (k === TODO_CLAIM_FIELD) qc = Math.floor(Number(v)) || 0;
    else if (k.startsWith("_q:")) quest[k] = Math.floor(Number(v)) || 0;
  }
  return { quest, qc };
}
