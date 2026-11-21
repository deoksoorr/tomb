import { HUNT_ZONES, MONSTERS, type MonsterId } from "./catalog";
import { seeded, type Derived } from "./formulas";

// 11/15 야근 빌딩 능력 카드 (판 안에서만 쌓이고 판이 끝나면 사라진다).
// 몬스터를 잡으면 판 레벨 막대가 차고, 오를 때마다 세 장 중 하나를 고른다. 10층 우두머리 뒤엔 상사의 제안, 체크포인트 시작이면 카드부터.
// 순수 함수만 — 게임(game/rpg/cards)·화면(CardPick·RunCards)·서버(tower evalTower)가 같은 표와 같은 시드 굴림을 쓴다.
// 제안은 판 시드 + 몇 번째 제안인지 + 다시 뽑기 횟수로 정해진다 → 서버가 똑같이 다시 굴려서 고른 카드가 제안된 것인지 본다.
//
// 무기마다 어떻게 붙나 (근접 = 휘두르기·내려찍기·찌르기·연타, 원거리 = 쏘기·던지기, 마법 = 범위 마법)
//  - 참조 추가: 공격 한 번이 한 번 더 (원거리 한 발 더, 근접 한 번 더 휘두름, 마법 한 번 더 터짐). 한 번 피해 −10%씩
//  - 방향 카드(회람·옆자리·뒷담화): 원거리는 그쪽으로 한 발, 근접은 그쪽으로도 같이 휘두름, 마법은 그쪽 적 발밑에 한 번 더
//  - 병렬 처리(앞): 원거리는 나란히 한 발 더, 근접은 앞으로 서류 바람(뚫고 가는 짧은 투사체), 마법은 앞쪽 다른 적에게 한 번 더
//  - 직보: 원거리는 관통(던지기는 원래 뚫으니 피해 +20%), 근접은 닿는 거리 +35%, 마법은 터지는 범위 +35%
//  - 업무 토스: 원거리는 맞힌 뒤 근처 적에게 튕겨 감, 근접·마법은 맞은 적에게서 서류가 근처 적으로 튕겨 나감 (공격마다 한 번)
//  - 반려 후 재상신: 원거리는 벽에 맞으면 튕김, 근접·마법은 밀려나 벽에 부딪힌 적이 한 번 더 아픔
//  - 나머지(속성·결재판·방패·인턴·회복·능력치·전설)는 무기와 상관없이 같다

/** 11/15 다섯 등급: 일반(회색) · 매직(파랑) · 레어(금색) · 유니크(주황) · 전설(보라, 빛이 흐른다) */
export type CardRarity = "common" | "magic" | "rare" | "unique" | "legend";
export const RARITIES: readonly CardRarity[] = ["common", "magic", "rare", "unique", "legend"];
export type CardKindStyle = "melee" | "ranged" | "magic";

export const CARD_IDS = [
  // 일반 10
  "raise",
  "quick",
  "health",
  "commute",
  "coffee",
  "offwork",
  "sharp",
  "mix",
  "memo",
  "walk",
  // 매직 10
  "circular",
  "side",
  "backbite",
  "resubmit",
  "toss",
  "papers",
  "snack",
  "badge",
  "halfday",
  "minutes",
  // 레어 9
  "cc",
  "parallel",
  "direct",
  "passion",
  "chill",
  "solo",
  "urgent",
  "boards",
  "intern",
  // 유니크 6
  "afterparty",
  "resign",
  "chainline",
  "wfh",
  "politics",
  "bonus",
  // 전설 5
  "oneshot",
  "overtime",
  "promote",
  "corpcard",
  "leave",
  // 11/19 갈래 카드 (방향·복제 카드 다섯 장 자리 — 제안에는 이쪽만 나온다)
  "brEmber",
  "brFrost",
  "brSoul",
  "brWorker",
  "handover",
  // 11/19 마공 전용 카드 (일반·매직·레어·유니크 한 장씩 — 등급 비율 11·11·10·7·5)
  "chant",
  "brief",
  "refill",
  "refund",
  // 11/19 넋 갈래 카드 (부른 넋·흡수 — 넋 트리만 쓸모 있다. 사용자 「넋 카드가 하나도 없다」)
  "soulQuick",
  "soulDrain",
  "soulChain",
  "soulLamp",
  "soulParade",
] as const;
export type CardId = (typeof CARD_IDS)[number];

/**
 * 11/19 카드가 누구에게 좋은가: 공통(모두) · 물공(기본 공격·일꾼 스킬 — 공격 속도·치명타·무기 공격 모양) · 마공(모닥불·서리·넋 스킬).
 * 카드 그림·이름 옆 작은 꼬리표로 보여 준다 (고를 때 내 빌드에 맞는지 바로 보이게)
 */
export type CardType = "all" | "phys" | "magic";
export const CARD_TYPE_NAME: Record<CardType, string> = { all: "공통", phys: "물공", magic: "마공" };

export type CardDef = {
  id: CardId;
  name: string;
  rarity: CardRarity;
  /** 11/19 공통·물공·마공 */
  type: CardType;
  /** 겹쳐 가질 수 있는 수 (Infinity = 제한 없음) */
  max: number;
  /** 카드에 적는 말 (무기와 상관없이 같을 때) */
  desc: string;
  /** 무기마다 다르게 붙는 카드: 근접·원거리·마법 각각 */
  by?: Record<CardKindStyle, string>;
  /** 그림 (game/rpg/cards/cardArt 그림 이름) · 바탕색 */
  art: { main: number; accent: number };
};

/** 11/19 물공·마공 카드 (나머지는 공통) */
const PHYS_CARDS: readonly string[] = ["quick", "sharp", "memo", "circular", "side", "backbite", "resubmit", "toss", "cc", "parallel", "direct", "brWorker", "handover"];
const MAGIC_CARDS: readonly string[] = ["mix", "brEmber", "brFrost", "brSoul", "chant", "brief", "refill", "refund", "soulQuick", "soulDrain", "soulChain", "soulLamp", "soulParade"];
const c = (id: CardId, name: string, rarity: CardRarity, max: number, desc: string, main: number, accent: number, by?: CardDef["by"]): CardDef => ({
  id,
  name,
  rarity,
  type: PHYS_CARDS.includes(id) ? "phys" : MAGIC_CARDS.includes(id) ? "magic" : "all",
  max,
  desc,
  ...(by ? { by } : {}),
  art: { main, accent },
});

export const CARDS: Record<CardId, CardDef> = {
  // ── 일반 ──
  raise: c("raise", "연봉 협상", "common", 5, "공격력이 10% 올라요. 기본 공격과 모든 스킬(물공·마공)이 같이 세져요.", 0xffc84a, 0x5a3a1a),
  quick: c("quick", "손이 빨라짐", "common", 5, "공격 속도가 8% 빨라져요.", 0x6ae0d0, 0x1e3a3a),
  health: c("health", "체력 관리", "common", 5, "최대 체력이 10% 늘어요.", 0xe86a8a, 0xffe0e8),
  commute: c("commute", "빠른 퇴근길", "common", 3, "이동 속도가 10% 빨라져요.", 0x7ac8f0, 0x2a3a5a),
  coffee: c("coffee", "커피 수혈", "common", Infinity, "지금 바로 내 체력이 40% 차요.", 0x8a5a3a, 0xf2ead3),
  offwork: c("offwork", "칼퇴 의지", "common", 2, "내가 적을 잡을 때마다 내 체력이 1% 차요.", 0x5ad08a, 0xf2ead3),
  sharp: c("sharp", "예리한 지적", "common", 4, "치명타 확률이 6%, 치명타 피해가 15% 올라요.", 0xe84a6a, 0xf2ead3),
  mix: c("mix", "믹스커피", "common", 3, "SP가 1초에 2씩 더 차요.", 0xe8b84a, 0xc83a3a),
  memo: c("memo", "메모 습관", "common", 3, "치명타 피해가 18% 올라요.", 0xf0e08a, 0x3a6ac8),
  walk: c("walk", "점심 산책", "common", 3, "최대 체력이 6%, 이동 속도가 4% 올라요.", 0x7ad07a, 0x8a6a40),
  // ── 매직 ──
  circular: c("circular", "회람", "magic", 2, "내 공격이 양쪽 대각선으로도 나가요.", 0xe8c86a, 0x5a4a2a, {
    melee: "양쪽 대각선으로도 같이 휘둘러요.",
    ranged: "양쪽 대각선으로도 한 발씩 쏴요.",
    magic: "양쪽 대각선 쪽 적에게도 잉크가 터져요.",
  }),
  side: c("side", "옆자리 협업", "magic", 2, "내 공격이 양옆으로도 나가요.", 0xe89a6a, 0x4a2a1e, {
    melee: "양옆으로도 같이 휘둘러요.",
    ranged: "양옆으로도 한 발씩 쏴요.",
    magic: "양옆 적에게도 잉크가 터져요.",
  }),
  backbite: c("backbite", "뒷담화", "magic", 2, "내 공격이 뒤로도 나가요.", 0xa88ad8, 0x2a1e4a, {
    melee: "뒤쪽으로도 같이 휘둘러요.",
    ranged: "뒤로도 한 발 쏴요.",
    magic: "뒤쪽 적에게도 잉크가 터져요.",
  }),
  resubmit: c("resubmit", "반려 후 재상신", "magic", 1, "벽에 부딪혀도 공격이 끝나지 않아요.", 0x8a9aa8, 0xe84a4a, {
    melee: "내가 밀쳐 낸 적이 벽에 부딪히면 피해를 한 번 더 받아요.",
    ranged: "벽에 맞으면 튕겨서 다시 날아가요.",
    magic: "내가 밀쳐 낸 적이 벽에 부딪히면 피해를 한 번 더 받아요.",
  }),
  toss: c("toss", "업무 토스", "magic", 2, "내 공격이 맞힌 적 옆의 다른 적에게도 튕겨 가요.", 0xf0a040, 0x3a2a1a, {
    melee: "때린 적에게서 서류가 근처 적에게 튕겨 가요.",
    ranged: "쏜 공격이 맞힌 뒤 근처 적에게 튕겨 가요.",
    magic: "터진 자리에서 서류가 근처 적에게 튕겨 가요.",
  }),
  papers: c("papers", "서류 방패", "magic", 2, "서류가 내 둘레를 돌며 날아오는 공격을 막아요.", 0xf2ead3, 0x7ab8e8),
  snack: c("snack", "탕비실 간식", "magic", 2, "층을 깰 때마다 내 체력이 8% 차요.", 0xe8a86a, 0xe84a6a),
  badge: c("badge", "사원증 목걸이", "magic", 3, "받는 피해가 6% 줄어요.", 0x4a8ad8, 0xf2ead3),
  halfday: c("halfday", "반차", "magic", 1, "층마다 내가 처음 맞는 공격 한 번은 안 아파요.", 0xf0d070, 0x5a8ad8),
  minutes: c("minutes", "회의록 정리", "magic", 2, "이번 판 경험치를 15% 더 받아요.", 0x9ad0a0, 0x3a4a6a),
  // ── 레어 ──
  cc: c("cc", "참조 추가", "rare", 3, "공격이 한 번 더 나가요. 대신 한 번 피해가 10% 줄어요.", 0x7ab8e8, 0xf2ead3, {
    melee: "한 번 더 휘둘러요. 대신 한 번 피해가 10% 줄어요.",
    ranged: "한 발 더 쏴요. 대신 한 발 피해가 10% 줄어요.",
    magic: "잉크가 한 번 더 터져요. 대신 한 번 피해가 10% 줄어요.",
  }),
  parallel: c("parallel", "병렬 처리", "rare", 2, "내 공격이 앞으로 한 줄 더 나가요.", 0x5ad0a0, 0x1e3a4a, {
    melee: "휘두르면 앞으로 서류 바람이 날아가요. 적을 뚫고 가요.",
    ranged: "앞으로 나란히 한 발 더 쏴요.",
    magic: "앞쪽 다른 적 발밑에서도 잉크가 터져요.",
  }),
  direct: c("direct", "직보", "rare", 1, "내 공격이 더 멀리 닿아요.", 0xe85a5a, 0xffe08a, {
    melee: "공격이 35% 더 멀리 닿아요.",
    ranged: "쏜 공격이 적을 뚫고 지나가요. 원래 뚫는 무기면 피해가 20% 올라요.",
    magic: "잉크가 35% 더 넓게 터져요.",
  }),
  passion: c("passion", "야근 열정", "rare", 1, "내가 때린 적이 한동안 불타요.", 0xff7a3a, 0xffe08a),
  chill: c("chill", "냉랭한 분위기", "rare", 1, "내가 때린 적이 느려지고, 가끔 꽁꽁 얼어요.", 0x8ad8f0, 0xe8f8ff),
  solo: c("solo", "독박 업무", "rare", 1, "내가 때린 적에게 독이 쌓여요. 많이 쌓일수록 독 피해가 커져요.", 0x8ac83a, 0x2a3a1a),
  urgent: c("urgent", "급한 호출", "rare", 1, "내가 공격할 때마다 번개가 근처 적 셋에게 옮겨 가요.", 0xf0e05a, 0x3a3aa8),
  boards: c("boards", "도는 결재판", "rare", 3, "결재판이 내 둘레를 돌며 닿는 적을 쳐요.", 0xc8884a, 0xf2ead3),
  intern: c("intern", "인턴 소환", "rare", 2, "인턴이 따라다니며 서류를 던져요.", 0x6ab0e8, 0xf0c8a0),
  // ── 유니크 ──
  afterparty: c("afterparty", "회식 2차", "unique", 1, "내가 잡은 적이 펑 터져서 둘레 적도 피해를 받아요.", 0xff8a3a, 0xffe08a),
  resign: c("resign", "퇴사 각", "unique", 1, "내 체력이 적을수록 세게 쳐요. 내 체력이 거의 바닥이면 피해가 60% 올라요.", 0xd84a4a, 0xf2ead3),
  chainline: c("chainline", "결재 라인", "unique", 1, "번개가 다섯 번 옮겨 가고 더 세져요. 급한 호출이 없어도 번개가 나가요.", 0x6a6ae8, 0xfff06a),
  wfh: c("wfh", "재택근무", "unique", 2, "가만히 서 있으면 받는 피해가 15% 줄어요.", 0x7ac8a8, 0xe8d8b0),
  politics: c("politics", "사내 정치", "unique", 1, "내가 때린 적이 15% 확률로 옆에 있는 적을 대신 때려요.", 0xb86ad8, 0xffd84a),
  bonus: c("bonus", "성과급", "unique", 2, "우두머리와 정예에게 주는 피해가 30% 올라요.", 0x5ad08a, 0xffd84a),
  // ── 전설 ──
  oneshot: c("oneshot", "원샷 결재", "legend", 1, "내 공격이 5% 확률로 일반 몬스터를 한 번에 잡아요.", 0xffd84a, 0xa83c3c),
  overtime: c("overtime", "무한 야근", "legend", 1, "내가 쓰러져도 한 번은 체력 30%로 다시 일어나요.", 0xe8dcff, 0xffd84a),
  promote: c("promote", "팀장 승진", "legend", 1, "다른 카드의 수치가 모두 50% 더 세져요. 넋 전용 카드는 빼고요.", 0x3a3a5a, 0xffd84a),
  corpcard: c("corpcard", "법인카드", "legend", 1, "내가 적을 잡으면 가끔 5초 동안 공격력, 공격 속도, 이동 속도 중 하나가 올라요.", 0x2a2a3a, 0xd8b84a),
  leave: c("leave", "연차 몰아 쓰기", "legend", 1, "내 체력이 30% 아래로 떨어지면 3초 동안 무적이 되고, 5초 동안 공격 속도가 50% 올라요. 층마다 한 번이에요.", 0x7ad0f0, 0xf2ead3),
  // ── 11/19 갈래 카드 (스킬 트리 갈래를 키운다) ──
  brEmber: c("brEmber", "불씨 단속", "magic", 2, "모닥불 스킬 피해가 15% 올라요.", 0xff7a2e, 0xffd27a),
  brFrost: c("brFrost", "서리 낀 창문", "magic", 2, "서리 스킬 피해가 15% 올라요.", 0x8fd8ff, 0xf2fbff),
  brSoul: c("brSoul", "등불 하나 더", "magic", 2, "넋 스킬과 부른 넋의 피해가 15% 올라요.", 0xb98aff, 0x9ff0dc),
  brWorker: c("brWorker", "손에 익은 연장", "rare", 2, "일꾼 스킬 피해가 15% 오르고, 쿨타임이 10% 줄어요.", 0xb07a46, 0xe8d2a8),
  handover: c("handover", "업무 인수인계", "rare", 1, "스킬을 쓰면 다음 기본 공격 세 번의 피해가 40% 올라요.", 0x7ab8e8, 0xffe08a),
  // ── 11/19 마공 전용 ──
  chant: c("chant", "기획서 다듬기", "common", 4, "마공 스킬(모닥불·서리·넋)과 부른 넋의 피해가 8% 올라요.", 0xb98aff, 0xf2ecff),
  brief: c("brief", "회의 줄이기", "magic", 3, "마공 스킬 쿨타임이 6% 줄어요.", 0x8fd8ff, 0x2a3a6a),
  refill: c("refill", "텀블러 리필", "rare", 2, "최대 SP가 25% 늘고, SP가 1초에 1씩 더 차요.", 0x9ff0dc, 0x2a5a5a),
  refund: c("refund", "경비 환급", "unique", 1, "마공 스킬을 쓰면 쓴 SP의 30%를 돌려받아요.", 0xffd84a, 0x4a2a8a),
  // ── 11/19 넋 갈래 카드 ──
  soulQuick: c("soulQuick", "손 빠른 동기", "magic", 2, "부른 넋(길동무 넋·망자의 초롱)의 공격 간격이 13% 짧아져요.", 0xb98aff, 0x9ff0dc),
  soulDrain: c("soulDrain", "넋 수당", "magic", 2, "넋 스킬과 부른 넋이 준 피해의 2%만큼 HP가 차요. 한 번에 최대 HP의 1%까지예요.", 0x9ff0dc, 0x4a2a8a),
  soulChain: c("soulChain", "끌려가는 결재", "rare", 1, "넋 사슬 범위가 25% 넓어지고, 넋 사슬 약화가 5%p 더 붙어요.", 0x8a5ad8, 0xe8d8ff),
  soulLamp: c("soulLamp", "퇴근길 등불", "unique", 1, "넋 스킬이나 부른 넋으로 적을 쓰러뜨리면 넋불이 튀어 근처 적 둘을 쳐요.", 0x9ff0dc, 0xb98aff),
  soulParade: c("soulParade", "백귀야행", "legend", 1, "별빛 행렬을 쓰면 8초 동안 부른 넋 피해가 25% 오르고, 넋 스킬 쿨타임이 30% 줄어요.", 0x2a1448, 0x9ff0dc),
};

/** 11/19 카드마다 키우는 갈래 (주력 갈래 카드는 제안에 더 자주 — cardOffer) */
export type MainBranch = "ember" | "frost" | "soul" | "worker";
export const CARD_BRANCH: Partial<Record<CardId, MainBranch>> = {
  brEmber: "ember",
  passion: "ember",
  afterparty: "ember",
  brFrost: "frost",
  chill: "frost",
  brSoul: "soul",
  soulQuick: "soul",
  soulDrain: "soul",
  soulChain: "soul",
  soulLamp: "soul",
  soulParade: "soul",
  brWorker: "worker",
  handover: "worker",
};
/** 넋 갈래 카드 (제안 묶음 3부터) */
export const SOUL_PACK: ReadonlySet<CardId> = new Set<CardId>(["soulQuick", "soulDrain", "soulChain", "soulLamp", "soulParade"]);

export const CARD_LIST: readonly CardDef[] = CARD_IDS.map((id) => CARDS[id]);
export const isCardId = (v: unknown): v is CardId => typeof v === "string" && Object.hasOwn(CARDS, v);

export const RARITY_NAME: Record<CardRarity, string> = { common: "일반", magic: "매직", rare: "레어", unique: "유니크", legend: "전설" };
/** 등급 색 (게임 글자·고리, HUD 테두리) */
export const RARITY_COLOR: Record<CardRarity, number> = { common: 0xb8b4a8, magic: 0x6aa8ff, rare: 0xffd84a, unique: 0xff9a3a, legend: 0xc88aff };

/** 무기 방식 → 카드가 붙는 갈래 */
export function cardStyleKind(style: string): CardKindStyle {
  return style === "shot" || style === "card" ? "ranged" : style === "magic" ? "magic" : "melee";
}
/** 카드에 적는 말 (내 무기에 맞게) */
export const cardText = (id: CardId, kind: CardKindStyle) => CARDS[id].by?.[kind] ?? CARDS[id].desc;

/** 11/15 팀장 승진: 다른 카드의 수치 효과 ×1.5 */
export const PROMOTE_MUL = 1.5;
export const promoteMul = (o: CardCounts | undefined) => ((o?.promote ?? 0) > 0 ? PROMOTE_MUL : 1);
const fmt = (v: number) => String(Math.round(v * 10) / 10);

/**
 * 11/15 겹치는 카드를 또 고를 때 보여 줄 숫자: "공격력 +15% → +30% (+15%)". 가진 장 수(have) 기준, owned가 있으면 팀장 승진까지.
 * 카드 효과는 장마다 똑같이 쌓인다 (cardStats와 같은 숫자). 숫자로 말하기 어려운 카드는 null
 */
export function cardStackLine(id: CardId, have: number, owned?: CardCounts): string | null {
  const k = id === "promote" ? 1 : promoteMul(owned);
  const step = (label: string, per0: number, unit = "%") => {
    const per = per0 * k;
    return `${label} +${fmt(per * have)}${unit} → +${fmt(per * (have + 1))}${unit} (+${fmt(per)}${unit})`;
  };
  const down = (label: string, per0: number) => {
    const per = per0 * k;
    return `${label} −${fmt(per * have)}% → −${fmt(per * (have + 1))}% (−${fmt(per)}%)`;
  };
  const count = (label: string, from: number, to: number, unit: string) => `${label} ${from}${unit} → ${to}${unit} (+${to - from}${unit})`;
  switch (id) {
    case "raise":
      return step("공격력", 10);
    case "quick":
      return step("공격 속도", 8);
    case "sharp":
      return `${step("치명타", 6)}, ${step("치명타 피해", 15)}`;
    case "health":
      return step("최대 체력", 10);
    case "commute":
      return step("이동 속도", 10);
    case "offwork":
      return step("처치할 때 체력", 1);
    case "mix":
      return step("SP 회복", 2, "/초");
    case "memo":
      return step("치명타 피해", 18);
    case "walk":
      return `${step("최대 체력", 6)}, ${step("이동 속도", 4)}`;
    case "brEmber":
      return step("모닥불 스킬 피해", 15);
    case "brFrost":
      return step("서리 스킬 피해", 15);
    case "brSoul":
      return step("넋 스킬 피해", 15);
    case "soulQuick":
      return down("부른 넋 공격 간격", 15);
    case "soulDrain":
      return step("넋 피해 흡수", 2);
    case "brWorker":
      return `${step("일꾼 스킬 피해", 15)}, ${down("일꾼 스킬 쿨타임", 10)}`;
    case "chant":
      return step("마공 스킬 피해", 8);
    case "brief":
      return down("마공 스킬 쿨타임", 6);
    case "refill":
      return `${step("최대 SP", 25)}, ${step("SP 회복", 1, "/초")}`;
    case "snack":
      return step("층을 깰 때 체력", 8);
    case "badge":
      return down("받는 피해", 6);
    case "minutes":
      return step("판 경험치", 15);
    case "wfh":
      return down("서 있을 때 받는 피해", 15);
    case "bonus":
      return step("우두머리·정예 피해", 30);
    case "cc":
      return `공격 횟수 +${have} → +${have + 1} (+1), 한 번 피해 −${10 * have}% → −${10 * (have + 1)}%`;
    case "parallel":
    case "circular":
    case "side":
    case "backbite":
      return count("갈래", have, have + 1, "개");
    case "toss":
      return count("튕기는 횟수", have, have + 1, "번");
    case "boards":
      return count("결재판", have + 1, have + 2, "장");
    case "papers":
      return count("서류", 2 * have, 2 * (have + 1), "장");
    case "intern":
      return count("인턴", have, have + 1, "명");
    default:
      return null;
  }
}

/** 11/21 팀장 승진을 받지 않는 넋 전용 카드 */
const SOUL_ONLY: ReadonlySet<CardId> = new Set<CardId>(["soulQuick", "soulDrain", "soulChain", "soulLamp", "soulParade"]);

/**
 * 11/17 팀장 승진을 가졌을 때 카드에 적힌 숫자 대신 실제로 받는 숫자 ("팀장 승진으로 공격력 +22.5%").
 * n = 이 카드를 몇 장 가진 셈으로 (새로 고르는 카드면 1). 승진이 없거나 숫자로 말할 수 없는 카드면 null — cardStats와 같은 숫자
 */
export function cardPromoLine(id: CardId, n: number, owned: CardCounts | undefined, kind: CardKindStyle = "melee"): string | null {
  // 11/21 넋 전용 카드는 팀장 승진을 받지 않는다 (cardStats와 같게)
  if (id === "promote" || promoteMul(owned) === 1 || SOUL_ONLY.has(id)) return null;
  const k = PROMOTE_MUL;
  const up = (label: string, per: number, unit = "%") => `${label} +${fmt(per * k * n)}${unit}`;
  const down = (label: string, per: number) => `${label} −${fmt(per * k * n)}%`;
  const line = (() => {
    switch (id) {
      case "raise":
        return up("공격력", 10);
      case "quick":
        return up("공격 속도", 8);
      case "health":
        return up("최대 체력", 10);
      case "commute":
        return up("이동 속도", 10);
      case "coffee":
        return `바로 체력 +${fmt(40 * k)}%`;
      case "offwork":
        return up("처치할 때 체력", 1);
      case "sharp":
        return `${up("치명타", 6)}, ${up("치명타 피해", 15)}`;
      case "mix":
        return up("SP 회복", 2, "/초");
      case "memo":
        return up("치명타 피해", 18);
      case "walk":
        return `${up("최대 체력", 6)}, ${up("이동 속도", 4)}`;
      case "brEmber":
        return up("모닥불 스킬 피해", 15);
      case "brFrost":
        return up("서리 스킬 피해", 15);
      case "brSoul":
        return up("넋 스킬 피해", 15);
      case "soulQuick":
        return down("부른 넋 공격 간격", 13);
      case "soulDrain":
        return up("넋 피해 흡수", 2);
      case "soulChain":
        return up("넋 사슬 범위", 25);
      case "soulLamp":
        return up("넋불 피해", 60);
      case "soulParade":
        return up("행렬 뒤 부른 넋 피해", 25);
      case "brWorker":
        return `${up("일꾼 스킬 피해", 15)}, ${down("일꾼 스킬 쿨타임", 10)}`;
      case "handover":
        return up("스킬 뒤 기본 공격 피해", 40);
      case "chant":
        return up("마공 스킬 피해", 8);
      case "brief":
        return down("마공 스킬 쿨타임", 6);
      case "refill":
        return `${up("최대 SP", 25)}, ${up("SP 회복", 1, "/초")}`;
      case "refund":
        return `쓴 SP ${fmt(Math.min(REFUND_MAX, 0.3 * k) * 100)}% 환급`;
      case "snack":
        return up("층을 깰 때 체력", 8);
      case "badge":
        return down("받는 피해", 6);
      case "minutes":
        return up("판 경험치", 15);
      case "direct":
        return kind === "melee" ? up("닿는 거리", 35) : kind === "magic" ? up("터지는 범위", 35) : `원래 뚫는 무기면 피해 +${fmt(20 * k)}%`;
      case "resign":
        return `체력이 바닥일 때 피해 +${fmt(60 * k)}%`;
      case "wfh":
        return down("서 있을 때 받는 피해", 15);
      case "bonus":
        return up("우두머리·정예 피해", 30);
      case "politics":
        return "대신 때리는 피해 +50% (확률은 15% 그대로)";
      case "oneshot":
        return `원샷 확률 ${fmt(5 * k)}%`;
      case "overtime":
        return `다시 일어날 때 체력 ${fmt(30 * k)}%`;
      case "leave":
        return `5초 동안 공격 속도 +${fmt(50 * k)}%`;
      default:
        return null;
    }
  })();
  return line ? `팀장 승진으로 ${line}` : null;
}

// ── 판 레벨 ──

/** 처치 하나의 판 경험치 (몬스터 id만으로 정한다 — 서버가 처치 기록으로 똑같이 센다) */
let eliteIds: Set<MonsterId> | null = null;
export function runXpOf(id: MonsterId): number {
  const def = MONSTERS[id];
  if (!def) return 0;
  if (def.behavior === "boss") return 20;
  if (!eliteIds) eliteIds = new Set(Object.values(HUNT_ZONES).flatMap((z) => (z.elite ? [z.elite] : [])));
  if (eliteIds.has(id)) return 6;
  return def.minion ? 1 : 2;
}
export function runXp(kills: Partial<Record<MonsterId, number>>): number {
  let xp = 0;
  for (const [id, n] of Object.entries(kills) as [MonsterId, number][]) xp += runXpOf(id) * Math.max(0, Math.floor(n));
  return xp;
}
/** 판 레벨 L → L+1에 필요한 경험치 (1층부터 15층쯤 오르면 열두어 번 오른다) */
export const RUN_XP_BASE = 20;
export const RUN_XP_STEP = 7;
export const runXpNeed = (lv: number) => RUN_XP_BASE + RUN_XP_STEP * Math.max(0, lv);
/** 경험치 → 판 레벨(오른 횟수)·이번 레벨에 쌓인 양·필요한 양 */
export function runLevel(xp: number): { level: number; into: number; need: number } {
  let level = 0;
  let left = Math.max(0, xp);
  while (left >= runXpNeed(level) && level < 10_000) {
    left -= runXpNeed(level);
    level++;
  }
  return { level, into: left, need: runXpNeed(level) };
}

// ── 다시 뽑기·상사의 제안·체크포인트 ──

/** 다시 뽑기: 판마다 1번 + 이번 판에 깬 10층마다 1번 */
export const rerollsAllowed = (floorsCleared: number) => 1 + Math.floor(Math.max(0, floorsCleared) / 10);
/** 상사의 제안: 10층마다 우두머리를 잡으면 */
export const BOSS_DEAL_EVERY = 10;
export const isBossDealFloor = (f: number) => Number.isInteger(f) && f > 0 && f % BOSS_DEAL_EVERY === 0;
/** 상사의 제안을 받으면 최대 체력이 이만큼 줄어든다 (판 안에서만) */
export const BOSS_DEAL_HP_COST = 0.15;
/** 체크포인트에서 시작하면 건너뛴 10층마다 카드 3장 */
export const START_PICKS_PER_10 = 3;
export const startPicks = (start: number) => START_PICKS_PER_10 * Math.max(0, Math.floor((start - 1) / 10));

// ── 제안 굴림 ──

/** 제안 종류: l = 판 레벨 업, s = 체크포인트 시작, b = 상사의 제안 (i = 층) */
export type OfferKind = "l" | "s" | "b";
/**
 * 고른 기록 하나 (결과에 실어 보낸다). r = 이 제안에서 다시 뽑은 횟수,
 * f = 판 레벨이 오른 층 (레벨 업만 — 높은 층일수록 좋은 등급이 잘 나온다. 없으면 시작 층)
 */
export type CardPick = { k: OfferKind; i: number; r: number; c: CardId; f?: number };
export type CardCounts = Partial<Record<CardId, number>>;

const OFFER_SIZE = 3;
/** 레벨 업·시작 카드 한 장마다 등급 확률 (1층 기준) */
export const TIER_ODDS: Record<CardRarity, number> = { common: 0.5, magic: 0.28, rare: 0.15, unique: 0.06, legend: 0.01 };
/** 10층마다 유니크 +1%p · 전설 +0.5%p (그만큼 일반이 준다), 한도 */
export const TIER_FLOOR_STEP = { unique: 0.01, legend: 0.005 } as const;
export const TIER_FLOOR_CAP = { unique: 0.08, legend: 0.04 } as const;
/** 다시 뽑으면 조금 더 좋게 */
export const TIER_REROLL = { rare: 0.02, unique: 0.01, legend: 0.005 } as const;
/** 상사의 제안: 레어 이상 한 장 (전설 약 12%) */
export const BOSS_ODDS: Record<CardRarity, number> = { common: 0, magic: 0, rare: 0.6, unique: 0.28, legend: 0.12 };

/** 제안 한 장의 등급 확률. f = 층 (레벨이 오른 층·시작 층) */
export function tierOdds(k: OfferKind, f: number, r: number): Record<CardRarity, number> {
  if (k === "b") return { ...BOSS_ODDS };
  const t = Math.max(0, Math.floor((Math.max(1, f) - 1) / 10));
  const o = { ...TIER_ODDS };
  o.unique += Math.min(TIER_FLOOR_CAP.unique, TIER_FLOOR_STEP.unique * t);
  o.legend += Math.min(TIER_FLOOR_CAP.legend, TIER_FLOOR_STEP.legend * t);
  if (r > 0) {
    o.rare += TIER_REROLL.rare;
    o.unique += TIER_REROLL.unique;
    o.legend += TIER_REROLL.legend;
  }
  o.common = Math.max(0, 1 - o.magic - o.rare - o.unique - o.legend);
  return o;
}

const KIND_SALT: Record<OfferKind, number> = { l: 0x4c56, s: 0x5354, b: 0x4253 };
function offerSeed(seed: number, k: OfferKind, i: number, r: number): number {
  let h = (seed ^ 0x43415244) >>> 0;
  for (const x of [KIND_SALT[k], i, r]) {
    h = Math.imul(h ^ (x >>> 0), 0x01000193) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  }
  return h >>> 0;
}

const canTake = (owned: CardCounts, id: CardId) => (owned[id] ?? 0) < CARDS[id].max;
/**
 * 11/19 더는 제안하지 않는 카드: 방향·복제 카드(회람·옆자리 협업·뒷담화·병렬 처리·참조 추가)는 새 물공 갈래(회오리·돌진·도약)와 겹쳐서
 * 갈래 카드로 바꿨다. id는 지난 기록 검사(replayPicks 이전 판)·효과 계산을 위해 남긴다
 */
export const RETIRED_CARDS: ReadonlySet<CardId> = new Set<CardId>(["circular", "side", "backbite", "parallel", "cc"]);
/** 11/19 마공 전용 카드가 들어오기 전 제안 묶음 (그 전에 시작한 판의 고른 기록을 서버가 다시 굴릴 때 — evalTower가 둘 다 본다) */
export const MAGIC_PACK: ReadonlySet<CardId> = new Set<CardId>(["chant", "brief", "refill", "refund"]);
/** 제안 묶음 판: 2 = 마공 카드 포함 (지금), 1 = 그 전 */
/** 11/19 3 = 넋 갈래 카드 + 주력 갈래 카드 더 자주 (지금), 2 = 마공 카드까지, 1 = 그 전 */
export const CARD_POOL_VER = 3;
export type CardPoolVer = 1 | 2 | 3;
const POOLS: Record<CardPoolVer, Record<CardRarity, CardId[]>> = {
  1: { common: [], magic: [], rare: [], unique: [], legend: [] },
  2: { common: [], magic: [], rare: [], unique: [], legend: [] },
  3: { common: [], magic: [], rare: [], unique: [], legend: [] },
};
for (const id of CARD_IDS) {
  if (RETIRED_CARDS.has(id)) continue;
  POOLS[3][CARDS[id].rarity].push(id);
  if (SOUL_PACK.has(id)) continue;
  POOLS[2][CARDS[id].rarity].push(id);
  if (!MAGIC_PACK.has(id)) POOLS[1][CARDS[id].rarity].push(id);
}

/**
 * 제안 카드. 레벨 업·시작은 세 장, 상사의 제안은 레어 이상 한 장. 장마다 등급을 굴리고 그 등급에서 아직 덜 쌓인 카드를 고른다
 * (그 등급에 고를 게 없으면 한 단계 아래부터, 그래도 없으면 위로). owned = 지금 가진 카드, f = 층 (등급 확률이 오른다)
 */
/**
 * 11/19 주력 갈래(스킬 포인트를 가장 많이 쓴 갈래) 카드는 제안에 더 자주: 같은 피해 갈래(마공·물공) 카드 ×2, 그 갈래 카드 ×3.
 * 넋 트리가 넋 카드를 거의 못 보던 것 (사용자 「넋 트리 타는 애들이 소외당할 듯」). 묶음 3부터
 */
export function cardWeight(id: CardId, main: MainBranch | null | undefined): number {
  if (!main) return 1;
  const sideOk = main === "worker" ? CARDS[id].type === "phys" : CARDS[id].type === "magic";
  return 1 + (sideOk ? 1 : 0) + (CARD_BRANCH[id] === main ? 1 : 0);
}
/** 스킬 배분의 주력 갈래 (포인트가 가장 많은 갈래 — 같으면 앞 갈래, 하나도 없으면 null). 게임과 서버가 같은 값을 쓴다 */
export function mainBranchOf(skills: Partial<Record<string, number>> | undefined, branchOf: (id: string) => MainBranch | undefined): MainBranch | null {
  const sum: Record<MainBranch, number> = { ember: 0, frost: 0, soul: 0, worker: 0 };
  for (const [id, lv] of Object.entries(skills ?? {})) {
    const b = branchOf(id);
    if (b && lv && lv > 0) sum[b] += lv;
  }
  let best: MainBranch | null = null;
  for (const b of ["ember", "frost", "soul", "worker"] as const) if (sum[b] > 0 && (!best || sum[b] > sum[best])) best = b;
  return best;
}

export function cardOffer(seed: number, k: OfferKind, i: number, r: number, owned: CardCounts, f = 1, ver: CardPoolVer = CARD_POOL_VER, main: MainBranch | null = null): CardId[] {
  const BY_TIER = POOLS[ver];
  const rnd = seeded(offerSeed(seed, k, i, r));
  const odds = tierOdds(k, k === "b" ? i : f, r);
  const n = k === "b" ? 1 : OFFER_SIZE;
  const out: CardId[] = [];
  for (let slot = 0; slot < n; slot++) {
    let x = rnd();
    let tier: CardRarity = "common";
    for (const t of RARITIES) {
      tier = t;
      x -= odds[t];
      if (x < 0) break;
    }
    const at = RARITIES.indexOf(tier);
    const order = [...RARITIES.slice(0, at + 1).reverse(), ...RARITIES.slice(at + 1)].filter((t) => k !== "b" || odds[t] > 0 || RARITIES.indexOf(t) > at);
    const pick = rnd();
    for (const t of order) {
      const pool = BY_TIER[t].filter((id) => canTake(owned, id) && !out.includes(id));
      if (!pool.length) continue;
      if (ver >= 3 && main) {
        // 주력 갈래 가중치 (같은 난수 하나로 무게 비례)
        const w = pool.map((id) => cardWeight(id, main));
        let x2 = pick * w.reduce((a, b) => a + b, 0);
        let j = 0;
        while (j < pool.length - 1 && (x2 -= w[j]) >= 0) j++;
        out.push(pool[j]);
      } else out.push(pool[Math.floor(pick * pool.length)]);
      break;
    }
  }
  if (!out.length) out.push("coffee");
  return out;
}

/**
 * 서버 검사에 쓰는 한도: 판 레벨 업 수 (가진 카드로 정해지면 함수 — 회의록 정리가 경험치를 늘린다), 시작 카드 수,
 * 상사의 제안을 받을 수 있던 층, 다시 뽑기 수. start·top = 시작 층·마지막에 있던 층 (레벨 업이 일어난 층의 범위),
 * levelFloorMax(i) = i번째 레벨 업이 늦어도 이 층에서는 일어났어야 한다 (깬 층의 몬스터만으로도 경험치가 넘는 층)
 */
export type PickLimits = {
  levels: number | ((owned: CardCounts) => number);
  starts: number;
  bossFloors: readonly number[];
  rerolls: number;
  start?: number;
  top?: number;
  levelFloorMax?: (i: number) => number;
  /** 11/19 제안 묶음 판 (없으면 지금 것) */
  ver?: CardPoolVer;
  /** 11/19 주력 갈래 (묶음 3 가중치) */
  main?: MainBranch | null;
};
export type PickVerdict = { ok: true; owned: CardCounts } | { ok: false; why: string };

/** 판 하나에 실을 수 있는 고른 기록 수 (형식 검사) */
export const MAX_PICKS = 600;

/**
 * 고른 기록을 처음부터 다시 굴려 본다 (서버·테스트·게임 모두): 순서대로, 레벨 업·시작 카드는 번호가 0부터 이어지고,
 * 상사의 제안은 받을 수 있던 층에서 한 번씩, 다시 뽑기는 한도 안, 레벨 업 층은 범위 안에서 줄지 않고,
 * 고른 카드는 그때 제안된 카드여야 한다
 */
export function replayPicks(seed: number, picks: readonly CardPick[], lim: PickLimits): PickVerdict {
  if (picks.length > MAX_PICKS) return { ok: false, why: "too many" };
  const owned: CardCounts = {};
  const start = lim.start ?? 1;
  const top = lim.top ?? Infinity;
  let nl = 0;
  let ns = 0;
  let rr = 0;
  let lastF = start;
  const boss = new Set<number>();
  const bossOk = new Set(lim.bossFloors);
  for (const p of picks) {
    if (!p || !isCardId(p.c) || !Number.isInteger(p.i) || p.i < 0 || !Number.isInteger(p.r) || p.r < 0) return { ok: false, why: "format" };
    if (p.f !== undefined && (!Number.isInteger(p.f) || p.k !== "l")) return { ok: false, why: "format" };
    let f = start;
    if (p.k === "l") {
      if (p.i !== nl) return { ok: false, why: "level" };
      nl++;
      f = p.f ?? start;
      if (f < lastF || f > top || (lim.levelFloorMax && f > lim.levelFloorMax(p.i))) return { ok: false, why: "floor" };
      lastF = f;
    } else if (p.k === "s") {
      if (p.i !== ns || ns >= lim.starts || nl > 0) return { ok: false, why: "start" };
      ns++;
    } else if (p.k === "b") {
      if (!bossOk.has(p.i) || boss.has(p.i) || p.r !== 0) return { ok: false, why: "boss" };
      boss.add(p.i);
    } else return { ok: false, why: "format" };
    rr += p.r;
    if (rr > lim.rerolls) return { ok: false, why: "reroll" };
    if (!cardOffer(seed, p.k, p.i, p.r, owned, f, lim.ver ?? CARD_POOL_VER, lim.main ?? null).includes(p.c)) return { ok: false, why: "offer" };
    owned[p.c] = (owned[p.c] ?? 0) + 1;
  }
  const levels = typeof lim.levels === "function" ? lim.levels(owned) : lim.levels;
  if (nl > levels) return { ok: false, why: "level" };
  return { ok: true, owned };
}

// ── 카드 수치 (게임이 쓴다) ──

export const FOCUS_ASPD = 0.4;

export type CardStats = {
  atkMul: number;
  aspdMul: number;
  crit: number;
  /** 치명타 피해 배율에 더하는 값 (기본 치명타 ×1.5) */
  critDmg: number;
  hpMul: number;
  moveMul: number;
  /** 참조 추가 수 · 그만큼 한 번 피해 배율 */
  extra: number;
  hitMul: number;
  front: number;
  /** 기본 방향 말고 더 나가는 방향 (라디안, 0 = 앞) */
  dirs: number[];
  pierce: boolean;
  toss: number;
  wall: boolean;
  burn: boolean;
  chill: boolean;
  poison: boolean;
  chain: boolean;
  /** 번개가 넘어가는 수 · 한 번 피해 배율 (결재 라인이면 늘어난다) */
  chainJumps: number;
  chainMult: number;
  boards: number;
  papers: number;
  interns: number;
  killHeal: number;
  oneshot: boolean;
  /** 원샷 결재 확률 */
  oneshotP: number;
  revive: boolean;
  /** 11/17 무한 야근으로 다시 일어날 때 체력 비율 (팀장 승진이면 더) */
  reviveHp: number;
  /** 11/17 직보: 근접 닿는 거리·마법 터지는 범위 + · 원래 뚫는 원거리 무기 피해 + (팀장 승진이면 더) */
  reach: number;
  pierceDmg: number;
  /** 11/17 연차 몰아 쓰기 공격 속도 + (팀장 승진이면 더) */
  leaveAspd: number;
  /** 11/15 등급 개편으로 새로 붙은 것 */
  /** 초당 SP (믹스커피) */
  spRegen: number;
  /** 층을 깰 때 체력 비율 (탕비실 간식) */
  floorHeal: number;
  /** 받는 피해 줄어드는 비율 (사원증 목걸이) · 서 있을 때 더 (재택근무) */
  taken: number;
  stillTaken: number;
  /** 층마다 첫 공격 막기 (반차) */
  halfday: boolean;
  /** 판 경험치 배율 (회의록 정리) */
  xpMul: number;
  /** 잡은 적이 터진다 (회식 2차) · 폭발 피해 배율 */
  explode: number;
  /** 체력이 바닥일 때 피해 + (퇴사 각) */
  resign: number;
  /** 맞은 적이 옆 적과 싸울 확률 (사내 정치) */
  politics: number;
  /** 우두머리·정예 피해 + (성과급) */
  bossDmg: number;
  /** 카드가 내는 피해(불·독·번개·결재판·인턴·폭발) 배율 (팀장 승진) */
  effMul: number;
  /** 커피 수혈 회복 비율 */
  coffeeHeal: number;
  /** 처치마다 혜택 확률 (법인카드) · 연차 몰아 쓰기 */
  corpcard: number;
  leave: boolean;
  promote: boolean;
  /** 11/15 스킬 피해 + (가진 카드마다 등급만큼 — 카드가 평타만 키워 스킬이 묻히지 않게) */
  skillDmg: number;
  /** 11/19 갈래 카드: 갈래 스킬 피해 + · 일꾼 스킬 쿨타임 − · 업무 인수인계(스킬 뒤 기본 공격 세 번 피해 +) */
  br: Record<"ember" | "frost" | "soul" | "worker", number>;
  wkCd: number;
  handover: number;
  /** 11/19 마공 카드: 마공 스킬 피해 + · 마공 쿨타임 − · 최대 SP 배율 · 쓴 SP 환급 비율 */
  magicDmg: number;
  magicCd: number;
  spMul: number;
  refund: number;
  /** 11/19 넋 갈래 카드: 부른 넋 공격 간격 배율 · 넋 피해 흡수(비율·한 번 상한) · 사슬 범위 배율(11/21 소용돌이 뺌)·사슬 약화 + · 넋불 세기 · 백귀야행 */
  soulEvery: number;
  soulSteal: number;
  soulStealCap: number;
  soulRange: number;
  soulVuln: number;
  soulBurst: number;
  soulParade: boolean;
};

/** 카드 한 장이 스킬 피해에 더하는 몫 (등급이 높을수록 크게, 커피 수혈은 빼고) */
/** 11/19 경비 환급 상한 (팀장 승진이 있어도 쓴 SP의 절반까지) */
export const REFUND_MAX = 0.5;
export const SKILL_DMG_PER_CARD: Record<CardRarity, number> = { common: 0.03, magic: 0.04, rare: 0.06, unique: 0.09, legend: 0.12 };

const D = Math.PI / 180;
/** 방향 카드가 겹칠 때마다 더해지는 각도 (도) */
const DIR_STEPS: Record<"circular" | "side" | "backbite", number[][]> = {
  circular: [
    [45, -45],
    [28, -28],
  ],
  side: [
    [90, -90],
    [72, -72],
  ],
  backbite: [[180], [162, 198]],
};

export function cardStats(o: CardCounts): CardStats {
  const n = (id: CardId) => Math.max(0, Math.min(o[id] ?? 0, CARDS[id].max));
  const k = promoteMul(o);
  const dirs: number[] = [];
  for (const id of ["circular", "side", "backbite"] as const) for (let j = 0; j < n(id); j++) dirs.push(...DIR_STEPS[id][j].map((d) => d * D));
  const chainline = n("chainline") > 0;
  return {
    // 11/19 몬스터가 약해진 만큼 능력치 카드를 약 1/3 낮췄다
    atkMul: 1 + 0.1 * k * n("raise"),
    aspdMul: 1 + 0.08 * k * n("quick"),
    crit: 6 * k * n("sharp"),
    critDmg: k * (0.15 * n("sharp") + 0.18 * n("memo")),
    hpMul: 1 + k * (0.1 * n("health") + 0.06 * n("walk")),
    moveMul: 1 + k * (0.1 * n("commute") + 0.04 * n("walk")),
    extra: n("cc"),
    hitMul: 1 - 0.1 * n("cc"),
    front: n("parallel"),
    dirs,
    pierce: n("direct") > 0,
    reach: n("direct") > 0 ? 0.35 * k : 0,
    pierceDmg: n("direct") > 0 ? 0.2 * k : 0,
    toss: n("toss"),
    wall: n("resubmit") > 0,
    burn: n("passion") > 0,
    chill: n("chill") > 0,
    poison: n("solo") > 0,
    chain: n("urgent") > 0 || chainline,
    chainJumps: chainline ? 5 : 3,
    chainMult: (chainline ? 0.7 : 0.45) * k,
    boards: n("boards") ? n("boards") + 1 : 0,
    papers: 2 * n("papers"),
    interns: n("intern"),
    killHeal: 0.01 * k * n("offwork"),
    oneshot: n("oneshot") > 0,
    oneshotP: 0.05 * k,
    revive: n("overtime") > 0,
    reviveHp: 0.3 * k,
    spRegen: k * (2 * n("mix") + n("refill")),
    floorHeal: 0.08 * k * n("snack"),
    taken: Math.min(0.6, 0.06 * k * n("badge")),
    stillTaken: Math.min(0.6, 0.15 * k * n("wfh")),
    halfday: n("halfday") > 0,
    xpMul: 1 + 0.15 * k * n("minutes"),
    explode: n("afterparty") > 0 ? 0.6 * k : 0,
    resign: n("resign") > 0 ? 0.6 * k : 0,
    // 11/17 확률은 15% 그대로 — 팀장 승진은 대신 때리는 피해(CardRun quarrel 0.6 × effMul)에만
    politics: n("politics") > 0 ? 0.15 : 0,
    bossDmg: 0.3 * k * n("bonus"),
    effMul: k,
    coffeeHeal: 0.4 * k,
    corpcard: n("corpcard") > 0 ? 0.08 : 0,
    leave: n("leave") > 0,
    leaveAspd: 0.5 * k,
    promote: k > 1,
    skillDmg: CARD_IDS.reduce((a, id) => a + (id === "coffee" ? 0 : n(id) * SKILL_DMG_PER_CARD[CARDS[id].rarity]), 0),
    br: { ember: 0.15 * k * n("brEmber"), frost: 0.15 * k * n("brFrost"), soul: 0.15 * k * n("brSoul"), worker: 0.15 * k * n("brWorker") },
    wkCd: 0.1 * k * n("brWorker"),
    handover: n("handover") > 0 ? 0.4 * k : 0,
    magicDmg: 0.08 * k * n("chant"),
    magicCd: Math.min(0.4, 0.06 * k * n("brief")),
    spMul: 1 + 0.25 * k * n("refill"),
    refund: n("refund") > 0 ? Math.min(REFUND_MAX, 0.3 * k) : 0,
    // 11/21 넋 균형: 손 빠른 동기 장당 −15% → −13%. 넋 전용 카드 5장은 팀장 승진으로 키우지 않는다 (손 빠른 동기 2장 × 팀장 승진이면 소환 피해 1.8배 — 행렬 인도자 보스가 다른 갈래의 1.7배)
    soulEvery: Math.max(0.5, 1 - 0.13 * n("soulQuick")),
    soulSteal: 0.02 * n("soulDrain"),
    soulStealCap: 0.01,
    soulRange: 1 + (n("soulChain") > 0 ? 0.25 : 0),
    soulVuln: n("soulChain") > 0 ? 0.05 : 0,
    soulBurst: n("soulLamp") > 0 ? 0.6 : 0,
    soulParade: n("soulParade") > 0,
  };
}

/** 판 경험치 배율 (서버가 레벨 업 수 상한에 쓴다 — 판 끝 카드 기준이라 늘 넉넉하다) */
export const cardXpMul = (o: CardCounts) => cardStats(o).xpMul;

/**
 * 서버 처치 속도 상한에 곱하는 배율 (넉넉하게): 멈추면 집중 + 카드가 늘리는 초당 피해·여러 마리 타격.
 * 판 끝의 카드로 판 전체를 본다 (일찍 고른 카드만큼 늘 여유가 있다)
 */
export const CARD_POWER_MAX = 60;
export function cardPower(o: CardCounts): number {
  const s = cardStats(o);
  let p = 1 + FOCUS_ASPD;
  p *= s.atkMul * s.aspdMul * (1 + (s.crit / 100) * (0.5 + s.critDmg) + 0.1 * s.critDmg);
  p *= (1 + s.extra) * Math.max(0.5, s.hitMul);
  p *= 1 + 0.25 * (s.front + s.dirs.length);
  if (s.pierce) p *= 1 + s.reach;
  p *= 1 + 0.3 * s.toss;
  if (s.wall) p *= 1.15;
  if (s.burn) p *= 1 + 0.3 * s.effMul;
  if (s.chill) p *= 1.15;
  if (s.poison) p *= 1 + 0.35 * s.effMul;
  if (s.chain) p *= 1 + 0.15 * s.chainJumps * s.chainMult * 2;
  p *= 1 + (0.25 * s.boards + 0.05 * s.papers + 0.35 * s.interns) * s.effMul;
  if (s.oneshot) p *= 1 + 3 * s.oneshotP;
  p *= 1 + s.explode;
  p *= 1 + s.resign;
  p *= 1 + s.politics * 1.5 * s.effMul;
  p *= 1 + s.bossDmg * 0.5;
  if (s.corpcard) p *= 1 + 0.25 * s.effMul;
  if (s.leave) p *= 1 + 0.1 * s.leaveAspd;
  // 11/17 믹스커피: SP가 빨리 차면 스킬을 더 자주 쓴다 (기본 SP 회복이 초당 3쯤 — 넉넉하게 SP 1/초마다 +5%)
  p *= 1 + 0.05 * s.spRegen;
  // 11/15 스킬 피해 + (스킬 몫이 전체의 절반쯤이라 넉넉히 절반을 곱한다)
  p *= 1 + 0.5 * s.skillDmg;
  // 11/19 갈래 카드 (가장 큰 갈래 몫을 통째로 — 넉넉하게) · 업무 인수인계
  p *= 1 + Math.max(s.br.ember, s.br.frost, s.br.soul, s.br.worker);
  p *= 1 + 0.5 * s.handover;
  // 11/19 마공 카드 (마공 몫을 통째로 — 넉넉하게): 피해 + · 쿨타임 − (그만큼 더 자주) · 환급(SP가 덜 막힘)
  p *= (1 + s.magicDmg) / (1 - s.magicCd) * (1 + 0.5 * s.refund);
  // 11/19 넋 갈래 카드 (넉넉하게): 부른 넋이 더 자주 · 범위·약화 · 넋불 · 백귀야행(늘 켜졌다고)
  p *= (1 / s.soulEvery) * s.soulRange * (1 + s.soulVuln) * (1 + s.soulBurst);
  if (s.soulParade) p *= 1.5 / 0.7;
  return Math.min(CARD_POWER_MAX, p);
}

// ── 화면에 보내는 제안 (game → CardPick) ──

/** 카드 고르기 창 하나. seq = 제안이 바뀔 때마다 (다시 뽑기도) 올라간다 → 카드가 다시 뒤집혀 들어온다 */
export type CardOfferView = {
  kind: OfferKind;
  seq: number;
  cards: CardId[];
  /** 지금 가진 카드 (카드에 "2/3" 같은 겹친 수) */
  owned: CardCounts;
  style: CardKindStyle;
  /** 남은 다시 뽑기 (상사의 제안은 다시 뽑기 없음) */
  rerolls: number;
  /** 판 레벨 (레벨 업) · 시작 카드 몇 번째/몇 장 · 상사의 제안 층 */
  lv?: number;
  step?: [number, number];
  floor?: number;
  /** 이 뒤에 줄 서 있는 레벨 업 카드 수 */
  more?: number;
};
/** 화면 → 게임: 몇 번째 카드를 골랐다 / 다시 뽑기 / 상사의 제안 받기·거절 */
export type CardChoice = { slot: number } | { reroll: true } | { accept: boolean };

// ── 11/15 HUD 능력치 판 (기본 = 캐릭터·장비, (+N) = 카드가 더한 만큼) ──

export type StatRow = { label: string; v: string; plus?: string };
export type StatPanel = { rows: StatRow[]; chips: string[] };

const signed = (d: number, digits = 0, unit = "") => {
  const r = digits ? Math.round(d * 10 ** digits) / 10 ** digits : Math.round(d);
  if (!r) return undefined;
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString("ko-KR", { maximumFractionDigits: digits })}${unit}`;
};

/**
 * 판 안 능력치 판. base = 카드를 얹기 전 능력치 (캐릭터·장비·스킬 패시브), cur = 전투가 쓰는 지금 능력치 (CardRun.derive 결과),
 * cdMul = 무기 공격 간격 배율 (초당 공격 = aspd ÷ cdMul, attackCooldownMs와 같다). s가 없으면 (보통 사냥) 카드 몫 없이
 */
export function statPanel(
  base: Pick<Derived, "atk" | "aspd" | "crit" | "maxHp" | "move"> & { skillPower?: number },
  cur: Pick<Derived, "atk" | "aspd" | "crit" | "maxHp" | "move"> & { skillPower?: number },
  cdMul: number,
  s: CardStats | null,
  spare?: { revive: boolean; halfday: boolean; leave: boolean },
): StatPanel {
  const cd = Math.max(0.1, cdMul);
  const critDmg = 150 + (s ? s.critDmg * 100 : 0);
  const rows: StatRow[] = [
    { label: "공격력", v: Math.round(cur.atk).toLocaleString("ko-KR"), plus: signed(cur.atk - base.atk) },
    { label: "공격 속도", v: `${(cur.aspd / cd).toFixed(1)}/초`, plus: signed((cur.aspd - base.aspd) / cd, 1) },
    { label: "치명타", v: `${Math.round(cur.crit)}%`, plus: signed(cur.crit - base.crit, 0, "%") },
    { label: "치명 피해", v: `${Math.round(critDmg)}%`, plus: signed(critDmg - 150, 0, "%") },
    { label: "최대 체력", v: Math.round(cur.maxHp).toLocaleString("ko-KR"), plus: signed(cur.maxHp - base.maxHp) },
    { label: "이동 속도", v: String(Math.round(cur.move)), plus: signed(cur.move - base.move) },
  ];
  // 11/15 스킬 위력 (INT·장비) × 카드가 더한 스킬 피해 — 전투의 스킬 피해 배율과 같다
  if (cur.skillPower !== undefined) {
    const sp0 = base.skillPower ?? cur.skillPower;
    const sk = cur.skillPower * (1 + (s?.skillDmg ?? 0));
    rows.push({ label: "스킬 위력", v: `×${(Math.round(sk * 100) / 100).toFixed(2)}`, plus: signed((sk - sp0) * 100, 0, "%") });
  }
  if (s && s.taken > 0) rows.push({ label: "받는 피해", v: `−${Math.round(s.taken * 100)}%` });
  const chips: string[] = [];
  if (!s) return { rows, chips };
  const pct = (v: number) => Math.round(v * 100);
  if (s.front) chips.push(`갈래 ${1 + s.front}`);
  if (s.dirs.length) chips.push(`방향 +${s.dirs.length}`);
  if (s.extra) chips.push(`참조 +${s.extra}`);
  if (s.pierce) chips.push("관통");
  if (s.toss) chips.push(`튕김 ${s.toss}`);
  if (s.wall) chips.push("벽 튕김");
  if (s.burn) chips.push("화상");
  if (s.chill) chips.push("빙결");
  if (s.poison) chips.push("독");
  if (s.chain) chips.push(`번개 ${s.chainJumps}`);
  if (s.boards) chips.push(`결재판 ${s.boards}장`);
  if (s.papers) chips.push(`서류 ${s.papers}장`);
  if (s.interns) chips.push(`인턴 ${s.interns}명`);
  if (s.stillTaken) chips.push(`서 있으면 피해 −${pct(s.stillTaken)}%`);
  if (s.killHeal) chips.push(`처치 회복 ${Math.round(s.killHeal * 1000) / 10}%`);
  if (s.floorHeal) chips.push(`층 회복 ${pct(s.floorHeal)}%`);
  if (s.spRegen) chips.push(`SP +${Math.round(s.spRegen * 10) / 10}/초`);
  if (s.xpMul > 1) chips.push(`경험치 +${pct(s.xpMul - 1)}%`);
  if (s.explode) chips.push("회식 2차");
  if (s.resign) chips.push(`퇴사 각 최대 +${pct(s.resign)}%`);
  if (s.politics) chips.push("사내 정치");
  if (s.bossDmg) chips.push(`우두머리 +${pct(s.bossDmg)}%`);
  if (s.oneshot) chips.push(`원샷 ${Math.round(s.oneshotP * 1000) / 10}%`);
  if (s.corpcard) chips.push("법인카드");
  if (s.magicDmg) chips.push(`마공 +${pct(s.magicDmg)}%`);
  if (s.magicCd) chips.push(`마공 쿨 −${pct(s.magicCd)}%`);
  if (s.refund) chips.push(`SP 환급 ${pct(s.refund)}%`);
  if (spare?.halfday) chips.push("반차 남음");
  if (spare?.revive) chips.push("부활 1번");
  if (spare?.leave) chips.push("연차 남음");
  if (s.promote) chips.push("팀장 ×1.5");
  return { rows, chips };
}
