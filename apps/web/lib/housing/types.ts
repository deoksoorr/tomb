import type { TodoTick } from "../retain";
import type { CampHomeKind, CampInfo, CampYard, CaravanGrade, CottageStyleId, HouseExteriorMap, HouseSort, PlotTierId } from "./catalog";

// 하우징 API 계약 (서버·클라이언트 공용). 계정 id는 절대 내보내지 않는다: 집 id는 계정 id의 HMAC이다.

/** 놓인 물건 하나. u = 배치 고유 id(같은 물건을 여러 개 놓을 때 구분), i = 카탈로그 id, r = 0..3 (90°씩) */
export type Placed = { u: string; i: string; x: number; y: number; r: number };

/**
 * window = 11/24 안쪽 벽 창문 모양 (없으면 기본 창문 DEFAULT_WINDOW, "frost_window" = 눈꽃 창가).
 * 바닥·벽지처럼 그 물건 1개를 쓴다. 예전 저장·예전 화면은 이 칸이 없다
 */
export type HouseLayout = { items: Placed[]; floor: string; wall: string; window?: string };

export type HouseExterior = HouseExteriorMap;

export type PublicHouse = {
  id: string;
  /** 집이 있는 채널 (채널마다 주거 구역이 따로다. 채널이 생기기 전에 분양된 집은 1) */
  ch: number;
  /** 그 채널 분양 마을의 번지 (1부터. 1..WORLD_LOTS는 메인 맵, 그보다 크면 2단지) */
  lot: number;
  /** 11/16 "sea" = 달물결 포구 오두막 (lot = 포구 터 번호 1..11). 11/26 "camp" = 언젠가 캠핑장 집 (lot = 캠핑장 터 1..16). 없으면 마을 집 */
  zone?: "sea" | "camp";
  /** 오두막 겉모습 (zone sea만) */
  style?: CottageStyleId;
  /** 11/26 캠핑장 집 종류(터로 정해짐)·앞마당 단계 (zone camp만) */
  camp?: CampInfo;
  /** 11/26 별장 (살 때 이미 다른 집이 있었다 — 분양·넓히기 값 × 4/3). 첫 집이면 없다 */
  villa?: true;
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
  zone?: "sea" | "camp";
  style?: CottageStyleId;
  camp?: CampInfo;
  villa?: true;
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
  /** 이 집에 쓸 수 있는 물건: id → 개수 (이 집에 놓은 것 포함). 11/16 가구는 두 집 공용 가방에서 다른 집에 놓인 것을 뺀 수 */
  inventory: Record<string, number>;
  /** 11/16 공용 가방 가구 중 다른 집에 놓여 있어 여기서 못 쓰는 개수 (치우면 여기 놓을 수 있다). 가진 수 = inventory + away */
  away?: Record<string, number>;
  points: number;
  /** 11/26 이 사람 기준 값표 (분양·넓히기·앞마당 — 화면은 값을 따로 계산하지 않고 이것을 보여 준다) */
  prices?: HousePrices;
  /**
   * @deprecated 11/26 별장 규칙 변경(두 번째로 산 집부터 별장)으로 차액 제도를 없앴다 — 서버가 더는 보내지 않는다. prices를 쓴다
   */
  villaFee?: number;
};

/** 캠핑장 터 하나의 값 (이 사람 기준: 분양·앞마당 모두 별장이면 × 4/3). 11/26 넓히기(wide)는 앞마당에 합쳐 없앴다 */
export type CampLotPrice = {
  lot: number;
  kind: CampHomeKind;
  grade?: CaravanGrade;
  /** 분양가 */
  buy: number;
  /** 앞마당 1→2단계 · 2→3단계 값 */
  yard2: number;
  yard3: number;
};

/**
 * 11/26 값표 (GET·POST /api/housing/me 응답 prices). villa[구역] = 그 구역 집이 별장인지
 * (가진 집이면 그 집의 기록, 아직 없으면 지금 사면 별장인지 — 다른 구역에 집이 있으면 true).
 * village·sea = 터 크기별 바로 사기 값, camp = 터마다, upgrade·yard = 지금 연 구역(zone) 내 집의 다음 넓히기(마을·포구)·앞마당(캠핑장) 값 (없으면 null)
 */
export type HousePrices = {
  villa: { village: boolean; sea: boolean; camp: boolean };
  village: Record<PlotTierId, number>;
  sea: Record<PlotTierId, number>;
  camp: CampLotPrice[];
  upgrade: { to: PlotTierId; price: number } | null;
  yard: { to: CampYard; price: number } | null;
};

export type HouseDetailResponse = { house: PublicHouse };
export type HouseViewerResponse = { mine: boolean; likedToday: boolean };
export type HouseListResponse = { sort: HouseSort; houses: HouseSummary[]; generatedAt: number };
export type HouseLikeResponse = { likes: number; score: number; earnedOwner: number; todo?: TodoTick };
export type GuestbookResponse = { entries: GuestEntryView[]; todo?: TodoTick };

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
export type VillageResponse = { ch: number; zone?: "sea" | "camp"; lots: number; houses: VillageHouse[]; taken: number[]; generatedAt: number };
