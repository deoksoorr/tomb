import type { CosmeticSlot } from "@tomb/protocol";

// 11/15: 수집 의뢰 (next-plans 기획 2) 숫자·교환소 표. 화면·서버가 같이 쓰는 순수 데이터.
//  - 오늘의 의뢰: 계정마다 하루 7개 (새벽 5시에 새로). 앞 5개는 쉬운 것(도장 1), 뒤 2개는 어려운 것(도장 2) → 하루 9개
//  - 이번 주 큰 의뢰: 계정마다 주 1개 (월요일 새벽 5시에 새로), 도장 8
//  - 의뢰 도장은 포인트로 바꿀 수 없고 남에게 줄 수 없다. 도장 교환소(버스 정류장 마당 의뢰 게시판)에서만 쓴다 — 상점에 없는 것들
//  - 11/15 이달의 교환소: 염색권 2종은 늘, 나머지는 달마다 바뀌는 칸에서만 (QUEST_MONTHS — 달은 1일 새벽 5시에 바뀐다). 도장은 사라지지 않는다

/** 오늘의 의뢰 수 */
export const QUEST_DAILY = 7;
/** 그중 어려운 의뢰 수 (맨 뒤 칸들) */
export const QUEST_HARD = 2;
export const QUEST_STAMPS = { easy: 1, hard: 2, weekly: 8 } as const;
/** 하루에 바꿀 수 있는 의뢰 수 (무료) */
export const QUEST_REROLLS = 1;
/** 도장 상한 (계정 해시 숫자가 끝없이 늘지 않게. 하루 9 + 주 8로는 몇 년 걸린다) */
export const STAMP_CAP = 9_999;

export const isHardSlot = (slot: number) => slot >= QUEST_DAILY - QUEST_HARD;
export const slotStamps = (slot: number) => (isHardSlot(slot) ? QUEST_STAMPS.hard : QUEST_STAMPS.easy);

/** 의뢰 끝낸 수 칭호 구간 (lib/titles.ts) */
export const QUEST_TITLE_STEPS = [50, 300, 1000, 2500] as const;

/**
 * 교환소 물건 종류
 *  - flag: 가방에 표시 1개 (쓰면 사라지지 않는다 — 수집가 이모티콘처럼 "가졌는지"만 본다), 한 번만
 *  - ticket: 가방에 1장씩 더한다 (염색권처럼 쓰면 사라진다), 몇 번이든
 *  - cosmetic: 그 부위 꾸미기 영구 소장 (입기·벗기는 다른 영구 꾸미기와 같다), 한 번만
 *  - body: 외형 영구 해금 + 칭호 「수집왕」, 한 번만
 */
export type QuestRewardKind = "flag" | "ticket" | "cosmetic" | "body";

export type QuestReward = {
  /** 아이템 id (protocol items.ts에 같은 id로 등록된다 — 지급 방식은 protocol questGrantKind와 같아야 한다, 테스트가 본다) */
  id: string;
  name: string;
  price: number;
  kind: QuestRewardKind;
  /** cosmetic의 부위 (적어 두면 등록된 아이템의 부위와 같아야 한다 — 테스트가 본다. 없으면 등록된 부위를 그대로 쓴다) */
  slot?: CosmeticSlot;
  /** 타는 펫 */
  ride?: true;
  /** 희귀·전설 표시 (전설은 수집가 유령 외형 하나뿐) */
  tier?: "rare" | "legend";
  desc: string;
};

/** 수집가 유령 외형: 교환소 id (protocol items의 unlock 아이템 — 여는 몸 id는 그 아이템의 body = constants QUEST_BODIES) */
export const QUEST_BODY_REWARD = "q_body_collector";

/** 도장 교환소 (싼 것부터). id는 고정 — 그림·아이템 등록은 이 id로 한다 */
export const QUEST_REWARDS: readonly QuestReward[] = [
  { id: "qe_pack", name: "수집가 이모티콘 8종", price: 20, kind: "flag", desc: "월척 자랑·빈 바구니·금빛 곤충·광맥 발견 … 의뢰 전용 이모티콘" },
  { id: "q_dye_pick", name: "색 확정 염색권", price: 25, kind: "ticket", desc: "색상표에서 원하는 색을 정확히 골라 염색 (몇 장이든)" },
  { id: "q_hat_angler", name: "낚시꾼 모자", price: 25, kind: "cosmetic", slot: "head", desc: "챙 넓은 낚시 모자" },
  { id: "q_hand_net", name: "채집망", price: 25, kind: "cosmetic", slot: "hand", desc: "곤충 잡는 긴 채집망" },
  { id: "q_hat_miner", name: "광부 헬멧", price: 25, kind: "cosmetic", slot: "head", desc: "이마 등불이 켜지는 헬멧" },
  { id: "q_hand_brush", name: "발굴 붓", price: 25, kind: "cosmetic", slot: "hand", desc: "흙을 살살 터는 발굴 붓" },
  { id: "q_name_wave", name: "물결 이름표", price: 30, kind: "cosmetic", slot: "namePlate", desc: "이름표 바탕에 물결이 일렁여요" },
  { id: "q_name_leaf", name: "나뭇잎 이름 글자", price: 30, kind: "cosmetic", slot: "nameColor", desc: "이름 글자가 나뭇잎 빛으로" },
  { id: "q_aura_firefly", name: "반딧불 수집가 오라", price: 45, kind: "cosmetic", slot: "aura", desc: "반딧불이가 둘레를 돌아요" },
  { id: "q_dye_special", name: "특수색 확정 염색권", price: 60, kind: "ticket", desc: "금빛 광택·반짝이·무지개·야광 중 하나를 골라 염색 (몇 장이든)" },
  { id: "q_pet_goldfish", name: "금붕어 펫", price: 80, kind: "cosmetic", slot: "pet", desc: "머리 위를 따라다니는 작은 금붕어" },
  { id: "q_aura_nightfish", name: "밤낚시 오라", price: 100, kind: "cosmetic", slot: "aura", tier: "rare", desc: "발밑에 밤 물결과 물고기 그림자" },
  { id: "q_back_cape", name: "채집왕 망토", price: 120, kind: "cosmetic", slot: "back", tier: "rare", desc: "의뢰를 끝낸 자의 망토" },
  { id: "q_ride_carp", name: "월척 잉어", price: 150, kind: "cosmetic", slot: "pet", ride: true, desc: "타고 다니는 커다란 잉어" },
  { id: QUEST_BODY_REWARD, name: "수집가 유령 외형", price: 200, kind: "body", tier: "legend", desc: "수집가 유령의 모습 + 칭호 「수집왕」" },
  // 11/15 이달의 교환소 추가분 (화면은 protocol items.ts에 등록된 이름·설명을 먼저 쓴다)
  { id: "q_hat_snow", name: "눈 털모자", price: 25, kind: "cosmetic", slot: "head", desc: "눈꽃 무늬 털모자" },
  { id: "q_hand_wishlamp", name: "새해 소원 등불", price: 40, kind: "cosmetic", slot: "hand", desc: "소원을 적은 한지 풍등" },
  { id: "q_back_kite", name: "연 날리는 등", price: 45, kind: "cosmetic", slot: "back", desc: "등 뒤에서 펄럭이는 방패연" },
  { id: "q_name_newyear", name: "새해 복 이름표", price: 50, kind: "cosmetic", slot: "namePlate", desc: "금테 두른 다홍 이름표" },
  { id: "q_aura_snowglobe", name: "스노볼 오라", price: 70, kind: "cosmetic", slot: "aura", desc: "유리 돔 안에 눈이 소용돌이쳐요" },
  { id: "q_pet_penguin", name: "꼬마 펭귄 펫", price: 90, kind: "cosmetic", slot: "pet", desc: "뒤뚱뒤뚱 따라오는 펭귄" },
];

const BY_ID = new Map(QUEST_REWARDS.map((r) => [r.id, r]));
export const questRewardById = (id: string): QuestReward | undefined => BY_ID.get(id);
/** 한 번만 받는 것 (염색권 말고 전부) */
export const isOneTime = (r: Pick<QuestReward, "kind">) => r.kind !== "ticket";

// ── 이달의 교환소 ──

/** 늘 있는 것 (염색권 2종) */
export const QUEST_ALWAYS: readonly string[] = ["q_dye_pick", "q_dye_special"];

/**
 * 달마다 바뀌는 칸 (게임 날짜 기준 YYYYMM — 1일 새벽 5시에 바뀐다). 달을 더하려면 줄만 넣으면 된다.
 * 표의 마지막 달 뒤로는 QUEST_CYCLE_FROM부터 마지막 달까지를 차례로 돌려 쓴다 (달마다 늘 목록이 있다)
 */
export const QUEST_MONTHS: Readonly<Record<string, readonly string[]>> = {
  // 11월은 보름뿐이지만 열심히 하는 사람의 큰 목표로 채집왕 망토(120)를 하나 둔다 (11/15 사용자 요청)
  "202611": ["qe_pack", "q_hat_angler", "q_hand_net", "q_name_wave", "q_aura_firefly", "q_back_cape"],
  "202612": ["q_hat_snow", "q_hat_miner", "q_hand_brush", "q_name_leaf", "q_aura_snowglobe", "q_pet_goldfish"],
  "202701": [QUEST_BODY_REWARD, "q_hand_wishlamp", "q_name_newyear"],
  "202702": ["q_ride_carp", "q_back_cape", "qe_pack"],
  "202703": ["q_aura_nightfish", "q_pet_penguin", "q_back_kite", "q_hat_angler", "q_hand_net"],
  "202704": [QUEST_BODY_REWARD, "q_aura_firefly", "q_name_wave"],
};
/** 표가 끝난 뒤 돌려 쓰는 첫 달 */
export const QUEST_CYCLE_FROM = "202612";

const MONTH_KEYS = Object.keys(QUEST_MONTHS).sort();
const monthNo = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(4, 6)) - 1;
const monthOfNo = (n: number) => `${Math.floor(n / 12)}${String((n % 12) + 1).padStart(2, "0")}`;
/** 다음 달 YYYYMM */
export const nextMonth = (m: string) => monthOfNo(monthNo(m) + 1);

/** 그달(YYYYMM)의 이달의 칸 (값이 싼 것부터). 표 앞의 달은 첫 달, 표 뒤의 달은 돌려 쓴다 */
export function monthRewards(month: string): QuestReward[] {
  const first = MONTH_KEYS[0];
  const last = MONTH_KEYS[MONTH_KEYS.length - 1];
  let key = month;
  if (month < first) key = first;
  else if (month > last) {
    const cycle = MONTH_KEYS.filter((k) => k >= QUEST_CYCLE_FROM);
    key = cycle[(monthNo(month) - monthNo(last) - 1) % cycle.length];
  } else if (!QUEST_MONTHS[month]) key = MONTH_KEYS.filter((k) => k <= month).pop() ?? first;
  return QUEST_MONTHS[key]
    .map((id) => BY_ID.get(id))
    .filter((r): r is QuestReward => !!r)
    .sort((a, b) => a.price - b.price);
}

/** 그달 교환소에서 받을 수 있는지 (늘 있는 것 + 이달의 칸) */
export const inMonthShop = (month: string, id: string) => QUEST_ALWAYS.includes(id) || monthRewards(month).some((r) => r.id === id);

/** 다음 달 미리 보기: 다음 달 칸에서 가장 비싼 것 하나 */
/** 다음 달 미리 보기: 다음 달 칸에서 비싼 것부터 셋 (11/15: 하나 → 셋, 더 잘 보이게) */
export const monthPreview = (month: string): QuestReward[] => monthRewards(nextMonth(month)).slice(-3).reverse();
