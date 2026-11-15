import type { CosmeticSlot } from "@tomb/protocol";

// 11/15: 수집 의뢰 (next-plans 기획 2) 숫자·교환소 표. 화면·서버가 같이 쓰는 순수 데이터.
//  - 오늘의 의뢰: 계정마다 하루 7개 (새벽 5시에 새로). 앞 5개는 쉬운 것(도장 1), 뒤 2개는 어려운 것(도장 2) → 하루 9개
//  - 이번 주 큰 의뢰: 계정마다 주 1개 (월요일 새벽 5시에 새로), 도장 8
//  - 의뢰 도장은 포인트로 바꿀 수 없고 남에게 줄 수 없다. 도장 교환소(수집가 유령)에서만 쓴다 — 상점에 없는 것들

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
  /** cosmetic의 부위 (등록된 아이템의 부위와 같아야 한다 — 테스트가 본다) */
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
];

const BY_ID = new Map(QUEST_REWARDS.map((r) => [r.id, r]));
export const questRewardById = (id: string): QuestReward | undefined => BY_ID.get(id);
/** 한 번만 받는 것 (염색권 말고 전부) */
export const isOneTime = (r: Pick<QuestReward, "kind">) => r.kind !== "ticket";
