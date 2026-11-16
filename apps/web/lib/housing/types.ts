import type { CottageStyleId, HouseExteriorMap, HouseSort, PlotTierId } from "./catalog";

// 하우징 API 계약 (서버·클라이언트 공용). 계정 id는 절대 내보내지 않는다: 집 id는 계정 id의 HMAC이다.

/** 놓인 물건 하나. u = 배치 고유 id(같은 물건을 여러 개 놓을 때 구분), i = 카탈로그 id, r = 0..3 (90°씩) */
export type Placed = { u: string; i: string; x: number; y: number; r: number };

export type HouseLayout = { items: Placed[]; floor: string; wall: string };

export type HouseExterior = HouseExteriorMap;

export type PublicHouse = {
  id: string;
  /** 집이 있는 채널 (채널마다 주거 구역이 따로다. 채널이 생기기 전에 분양된 집은 1) */
  ch: number;
  /** 그 채널 분양 마을의 번지 (1부터. 1..WORLD_LOTS는 메인 맵, 그보다 크면 2단지) */
  lot: number;
  /** 11/16 "sea" = 달물결 포구 오두막 (lot = 포구 터 번호 1..6). 없으면 마을 집 */
  zone?: "sea";
  /** 오두막 겉모습 (zone sea만) */
  style?: CottageStyleId;
  exterior: HouseExterior;
  name: string;
  intro: string;
  ownerName: string;
  tier: PlotTierId;
  layout: HouseLayout;
  likes: number;
  /** 놓은 물건 점수 합 (좋아요 제외) */
  placedScore: number;
  /** 꾸밈 점수 = placedScore + likes × LIKE_WEIGHT */
  score: number;
  createdAt: number;
  updatedAt: number;
};

export type HouseSummary = {
  id: string;
  ch: number;
  lot: number;
  zone?: "sea";
  style?: CottageStyleId;
  name: string;
  ownerName: string;
  tier: PlotTierId;
  score: number;
  likes: number;
  items: number;
  createdAt: number;
};

export type GuestEntry = {
  id: string;
  name: string;
  text: string;
  at: number;
};

/** 내가 쓴 글이면 mine=true (지우기 버튼) */
export type GuestEntryView = GuestEntry & { mine: boolean };

export type MyHouseResponse = {
  house: PublicHouse | null;
  /** 가진 물건: id → 개수 (놓은 것 포함) */
  inventory: Record<string, number>;
  points: number;
};

export type HouseDetailResponse = { house: PublicHouse };
export type HouseViewerResponse = { mine: boolean; likedToday: boolean };
export type HouseListResponse = { sort: HouseSort; houses: HouseSummary[]; generatedAt: number };
export type HouseLikeResponse = { likes: number; score: number; earnedOwner: number };
export type GuestbookResponse = { entries: GuestEntryView[] };

/**
 * 관리자 목록. lastSeenAt = 주인의 마지막 접속 (0 = 기록 없음), staff = 운영자 집 (비우지 않는다),
 * reclaimAt = 이때부터 정리 대상 (규칙을 켠 시각 전 접속은 그 시각으로 센다. 0 = 비우지 않음 — 운영자·기록 없음),
 * refund = 오래 비워 정리하면 돌려줄 포인트, refundEstimated = 낸 포인트 기록이 없어 지금 가격표로 센 값
 */
export type AdminHouse = HouseSummary & {
  hidden: boolean;
  ownerTail: string;
  reportedEntries: (GuestEntry & { reports: number; hidden: boolean })[];
  lastSeenAt: number;
  staff: boolean;
  reclaimAt: number;
  refund: number;
  refundEstimated: boolean;
};

/** 마을에 서 있는 집 하나 (외관·문패) */
export type VillageHouse = HouseSummary & { exterior: HouseExterior };

/** 한 채널의 분양 마을: ch = 그 채널, lots = 지금 그리는 필지 수, taken = 숨긴 집 등 정보 없이 자리만 찬 번지 */
export type VillageResponse = { ch: number; zone?: "sea"; lots: number; houses: VillageHouse[]; taken: number[]; generatedAt: number };
