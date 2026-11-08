import type { Grave, ReviveResponse } from "../types";

/** 저장소 원본 + 카운트. ownerTokenHash·hidden이 들어 있으므로 그대로 내보내지 않는다 (toPublicGrave 사용) */
export type GraveRecord = Grave & { flowers: number; revives: number };

export type ViewerState = { myRevive: boolean; myFlowerToday: boolean };

/** 헌화 하루 1회 판정 기간 (spec: `SET NX EX 86400`) */
export const FLOWER_TTL_SEC = 86_400;
/** 서로 다른 IP의 신고가 이만큼 모이면 숨긴다 */
export const REPORT_HIDE_THRESHOLD = 5;

/**
 * 반응 연산은 모두 묘비 존재 확인과 한 덩어리로 원자적이다 (삭제와 경합해 고아 키가 생기지 않는다).
 * 숨김 여부는 메타와 따로 저장한다 → 주인의 수정(put)이 신고·관리자의 숨김을 덮어쓰지 못한다.
 */
export interface GraveStore {
  /** 숨김 포함 전체. 순서는 보장하지 않는다 */
  list(): Promise<GraveRecord[]>;
  get(id: string): Promise<GraveRecord | null>;
  /** 생성과 수정 공용 (id 기준 덮어쓰기). grave.hidden은 무시하고 기존 숨김 상태를 유지한다 */
  put(grave: Grave): Promise<void>;
  /** 메타·카운트·집합을 모두 지우고 지운 묘비를 돌려준다 (이미지는 호출자가 정리) */
  remove(id: string): Promise<Grave | null>;
  /** 숨김 해제 시 신고 기록도 비운다 (다음 신고 한 번에 바로 다시 숨지 않게). 묘비가 없으면 false */
  setHidden(id: string, hidden: boolean): Promise<boolean>;
  viewer(id: string, visitorId: string): Promise<ViewerState>;
  /** 새 헌화 수. 24시간 안에 이미 헌화했으면 "already", 묘비가 없으면 null */
  flower(id: string, visitorId: string): Promise<number | "already" | null>;
  /** 원자적 토글. 묘비가 없으면 null */
  toggleRevive(id: string, visitorId: string): Promise<ReviveResponse | null>;
  /**
   * 신고는 IP 해시 단위로 센다 (쿠키를 새로 받아도 같은 IP는 1건). 같은 방문자나 같은 IP의 재신고는 "duplicate".
   * 서로 다른 IP가 REPORT_HIDE_THRESHOLD개 모이면 숨긴다. 묘비가 없으면 null
   */
  report(id: string, visitorId: string, ipHash: string): Promise<"added" | "duplicate" | null>;
}
