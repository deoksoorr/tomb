import type { HouseSort, PlotTierId } from "./catalog";

// 하우징 API 계약 (서버·클라이언트 공용). 계정 id는 절대 내보내지 않는다: 집 id는 계정 id의 HMAC이다.

/** 놓인 물건 하나. u = 배치 고유 id(같은 물건을 여러 개 놓을 때 구분), i = 카탈로그 id, r = 0..3 (90°씩) */
export type Placed = { u: string; i: string; x: number; y: number; r: number };

export type HouseLayout = { items: Placed[]; floor: string; wall: string };

export type PublicHouse = {
  id: string;
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

/** 관리자 목록 */
export type AdminHouse = HouseSummary & { hidden: boolean; ownerTail: string; reportedEntries: (GuestEntry & { reports: number; hidden: boolean })[] };
