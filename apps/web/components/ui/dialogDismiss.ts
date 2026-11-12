// 창(Dialog) 닫힘 판단 (순수 함수 — 테스트용으로 따로 둔다)

/** 배경 클릭으로 닫을지: 닫을 수 있는 창 + 배경 닫기 허용 + 누르기·떼기가 모두 배경 위 (안에서 끌다 밖에서 놓은 것은 아니다) */
export function backdropCloses(o: { closable: boolean; backdropClose: boolean; pressedBackdrop: boolean; clickedBackdrop: boolean }): boolean {
  return o.closable && o.backdropClose && o.pressedBackdrop && o.clickedBackdrop;
}

/** Esc: 닫을 수 없는 창이면 아무것도 안 함, onEscape가 있으면 그것(확인 등), 없으면 닫기 */
export function escapeAction(closable: boolean, hasOnEscape: boolean): "none" | "escape" | "close" {
  if (!closable) return "none";
  return hasOnEscape ? "escape" : "close";
}
