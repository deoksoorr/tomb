// 11/20 집 없는 손님이 가구를 사러 오면 장난스럽게 거절하는 대사 (가구 보따리상 목수 유령 · 분양사 보리).
// 서버는 원래부터 집이 없으면 가구를 안 판다 (409 NO_HOUSE). 화면은 판매 창 대신 거절 대사를 먼저 보여 주고, 구경만은 열어 둔다.
// 짧은 NPC 말투 (해요체·반말 섞임), 비하 없이 장난스럽게. 「라벨: 설명」 콜론 나열·「A · B · C」 나열 없이 — 순수 함수라 테스트한다

/** stall = 가구 보따리상(목수 유령) · bori = 분양사 보리 · clerk = 11/20 총무팀 문대리 (사무실 가구 카트) */
export type NoHouseWho = "stall" | "bori" | "clerk";

/** 가구 보따리상(목수 유령). 맨 앞 줄이 대표 대사 (처음 말을 걸면 늘 이 줄) */
export const STALL_NO_HOUSE_LINES = [
  "어딜 무주택자가! 떼잇!",
  "집도 없는데 소파부터 사시게? 분양 사무소부터 다녀와요!",
  "가구는 집 있는 분만! 떼잇!",
  "어허, 장롱을 어디다 두려고? 길바닥에? 안 돼요!",
  "묘지에 침대를 놓으면 진짜 영면이에요. 집부터 장만해요!",
  "출근할 회사는 있어도 퇴근할 집이 없잖아요! 떼잇!",
  "이 망치로 집까지 지어 드릴 순 없어요. 분양 사무소로 가요!",
  "의자 하나라도 놓을 방이 있어야죠. 손님, 다음에 와요!",
] as const;

/** 분양사 보리 (집 가구 탭). 맨 앞 줄이 대표 대사 */
export const BORI_NO_HOUSE_LINES = [
  "멍! 집 없는 분한테 방석은 못 드려요. 집부터 장만해요!",
  "냥! 숨숨집은 진짜 집이 있어야 놓을 수 있어요!",
  "멍멍! 우리 아이들 가구는 집 있는 분만 데려가요!",
  "강아지 방석을 길바닥에 깔 순 없잖아요. 분양 사무소부터 들러요!",
] as const;

/** 11/20 총무팀 문대리 (사무실 가구 카트). 회사원 말투, 맨 앞 줄이 대표 대사 */
export const CLERK_NO_HOUSE_LINES = [
  "사원증도 없는 분… 아니, 집도 없는 분은 비품 지급이 안 돼요!",
  "비품 신청서에 배송지 칸이 비어 있어요. 집 주소부터 적어 오세요!",
  "이 결재는 반려예요. 사유는… 무주택이요!",
  "책상을 길바닥에 깔고 일하시게요? 재택근무도 집이 있어야 해요!",
  "규정상 비품은 사무실, 아니 집으로만 보내 드려요. 분양 사무소부터요!",
  "파티션을 세울 방이 없잖아요. 집부터 장만하고 다시 오세요!",
] as const;

/** 대사 고르기: 처음(prev = null)이면 대표 대사, 다음부터는 방금 한 말과 다른 줄을 무작위로 (rnd = 0 이상 1 미만) */
export function pickNoHouseLine(who: NoHouseWho, prev: string | null, rnd: number): string {
  const lines: readonly string[] = who === "stall" ? STALL_NO_HOUSE_LINES : who === "clerk" ? CLERK_NO_HOUSE_LINES : BORI_NO_HOUSE_LINES;
  if (prev === null) return lines[0];
  const rest = lines.filter((l) => l !== prev);
  return rest[Math.min(rest.length - 1, Math.floor(Math.max(0, rnd) * rest.length))];
}

/** 대사 아래 길 안내 한 줄 */
export const NO_HOUSE_GUIDE = "분양 사무소에서 집부터 장만해요. 포구 부동산 오두막도 집이에요.";
/** 분양 사무소까지 걸어가기 단추 */
export const NO_HOUSE_WALK = "분양 사무소로 가기";
/** 그래도 구경만 (사기 단추는 흐리게) */
export const NO_HOUSE_BROWSE = "그래도 구경만 할게요";
/** 닫기 단추 */
export const NO_HOUSE_OK = "알겠어요";
/** 구경 모드 창 위 안내 */
export const NO_HOUSE_BROWSING = "구경만 하는 중이에요. 집이 생기면 바로 살 수 있어요.";
/** 거절 창 제목 (NPC 이름) */
export function noHouseTitle(who: NoHouseWho): string {
  return who === "stall" ? "가구 보따리상" : who === "clerk" ? "총무팀 문대리" : "분양사 보리";
}
/** 고개 젓는 모습 설명 (화면 읽기용) */
export function noHouseShakeLabel(who: NoHouseWho): string {
  return who === "stall" ? "목수 유령이 고개를 절레절레 저어요" : who === "clerk" ? "문대리가 결재판을 들고 고개를 저어요" : "보리가 손사래를 쳐요";
}

/** 분양 사무소까지 걷는 중 안내 (터치는 방향키 대신 조이스틱 — lib/huntWalk·shopWalk와 같은 꼴) */
export function housingWalkHint(touch: boolean): string {
  return `분양 사무소로 가는 중… (${touch ? "조이스틱" : "방향키"}로 멈춰요)`;
}
export const HOUSING_NO_PATH_TOAST = "분양 사무소로 가는 길을 찾지 못했어요. 조금 움직인 뒤 다시 눌러 주세요.";
