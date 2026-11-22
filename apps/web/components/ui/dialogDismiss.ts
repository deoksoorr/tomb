// 창(Dialog) 닫힘 판단 (순수 함수 — 테스트용으로 따로 둔다)

/** 배경 클릭으로 닫을지: 닫을 수 있는 창 + 배경 닫기 허용 + 누르기·떼기가 모두 배경 위 (안에서 끌다 밖에서 놓은 것은 아니다) */
export function backdropCloses(o: { closable: boolean; backdropClose: boolean; pressedBackdrop: boolean; clickedBackdrop: boolean }): boolean {
  return o.closable && o.backdropClose && o.pressedBackdrop && o.clickedBackdrop;
}

/**
 * Esc: 닫을 수 없는 창이면 아무것도 안 함, onEscape가 있으면 그것(확인 등), 없으면 닫기.
 * own = Esc가 이 창에 온 것인지 (11/22 운영자 보고: 가방 안에서 연 아이템 페이지에서 Esc 한 번에 가방까지 닫혔다 —
 * React는 cancel 이벤트를 화면 트리의 바깥 창에도 흘려 보내므로, 맨 위 창(이벤트 대상)만 처리한다)
 */
export function escapeAction(closable: boolean, hasOnEscape: boolean, own = true): "none" | "escape" | "close" {
  if (!closable || !own) return "none";
  return hasOnEscape ? "escape" : "close";
}
