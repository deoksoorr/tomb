// 11/17 마을 맵 컨셉 (겉모습만 바꾸는 판): 기본 · 겨울 · 크리스마스.
// 길·건물·충돌·상호작용 자리·맵 버전은 그대로이고, 바닥 타일·나무·지붕·장식 그림만 컨셉에 따라 달리 굽는다.
// 크리스마스는 겨울 위에 장식을 더 얹은 판이라 눈 덮인 그림은 겨울과 같이 쓴다 (snowy).
// 시험: 로컬·테스트서버에서 주소 `?concept=winter|christmas|default` (실서버는 lib/qaUrl이 막는다).
// 운영: 관리자 화면에서 고르면 서버에 저장되고, 접속자는 다음 물음(또는 실시간 알림)에 바뀐다.

import { qaSearch } from "./qaUrl";

export type MapConcept = "default" | "winter" | "christmas";
export const MAP_CONCEPTS: readonly MapConcept[] = ["default", "winter", "christmas"];

/** 관리자 화면 이름 */
export const MAP_CONCEPT_LABELS: Record<MapConcept, string> = { default: "기본", winter: "겨울", christmas: "크리스마스" };

export function isMapConcept(v: unknown): v is MapConcept {
  return typeof v === "string" && (MAP_CONCEPTS as readonly string[]).includes(v);
}

/** 눈 덮인 그림을 쓰는 판 (겨울·크리스마스) */
export function isSnowy(c: MapConcept): boolean {
  return c !== "default";
}

/** 주소 시험 값 `?concept=` (실서버면 늘 null) */
export function parseConceptOverride(search: string, qaFlag?: string): MapConcept | null {
  const v = new URLSearchParams(qaSearch(search, qaFlag)).get("concept");
  return isMapConcept(v) ? v : null;
}

/** 저장된 값 그대로 믿지 않는다 (모르는 값이면 기본) */
export function normalizeConcept(v: unknown): MapConcept {
  return isMapConcept(v) ? v : "default";
}

/** GET /api/map-concept · /api/admin/map-concept 응답 */
export type MapConceptResponse = { concept: MapConcept };

/** 관리자가 바꿀 때 마을 전체 공지 줄 id 앞붙임 — 게임 화면이 들으면 캐시를 건너뛰고 바로 다시 읽는다 (lib/mapConceptClient) */
export const MAP_CONCEPT_NOTICE_PREFIX = "mcn-";

/** 바뀐 판을 알리는 마을 공지 한 줄 */
export function mapConceptNotice(c: MapConcept): string {
  switch (c) {
    case "winter":
      return "마을에 눈이 소복이 쌓였어요. 입김이 나요!";
    case "christmas":
      return "마을에 크리스마스가 찾아왔어요. 광장 트리를 보러 가요!";
    default:
      return "마을이 원래 모습으로 돌아왔어요.";
  }
}
