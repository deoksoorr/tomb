// 11/26 PC Esc → 설정 창. Esc는 이미 여러 곳이 쓴다 (창 닫기·큰 지도 닫기·길 안내 끄기·채집 취소·바라보는 장면 나가기·표현 목록 닫기·
// 순위·음악 펼침 닫기·촬영 모드 나가기·집 꾸미기 선택 풀기 …). 그것들이 하나도 해당하지 않을 때만 설정을 연다 (순수 판단 — 시험한다).

export type EscState = {
  /** Esc·조합 키가 아닌 그냥 Esc인지 (반복·Ctrl·Cmd·Alt·Shift·한글 조합 중이면 아님) */
  plainEsc: boolean;
  /** 게임 화면 쪽이 조용한지 — 열린 창·표현 목록·채팅 입력 줄·촬영 모드·버스·바라보는 장면·집 꾸미기가 없고 마을·집 안 */
  shellQuiet: boolean;
  /** 입력칸에 포커스 */
  editable: boolean;
  /** <dialog> 창이 하나라도 열려 있음 */
  dialogOpen: boolean;
  /** 펼친 접이식(음악·순위 등 aria-expanded=true)이 있음 */
  expanded: boolean;
  /** 큰 지도가 떠 있음 */
  bigMap: boolean;
  /** 게임 키를 막은 화면(낚시 등)이 있음 */
  keysBlocked: boolean;
  /** 길 안내 화살표가 켜져 있음 (Esc로 끈다) */
  guiding: boolean;
};

/** 이 Esc로 설정 창을 열어도 되는지 (키를 누른 순간의 상태로 — 다른 처리가 먼저 상태를 바꾸기 전) */
export function escOpensSettings(s: EscState): boolean {
  return s.plainEsc && s.shellQuiet && !s.editable && !s.dialogOpen && !s.expanded && !s.bigMap && !s.keysBlocked && !s.guiding;
}
