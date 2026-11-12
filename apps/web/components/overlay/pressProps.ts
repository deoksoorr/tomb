import type { MouseEvent, PointerEvent } from "react";

/**
 * 행동 버튼은 click 대신 누르는 순간(pointerdown)에 반응한다: 조이스틱을 다른 손가락으로 잡고 있으면
 * 모바일 브라우저가 두 번째 터치를 탭으로 보지 않아 click이 안 오기 때문 (멀티터치 — 터치마다 pointerId가 따로다).
 * 키보드(Enter·Space)로 누른 click(detail 0)은 그대로 받는다.
 */
export function pressProps(fn: () => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.currentTarget.disabled) return;
      // 터치 뒤 따라오는 마우스 흉내 이벤트·포커스 이동을 막는다 (다른 터치·조이스틱에는 영향 없음)
      e.preventDefault();
      fn();
    },
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      if (e.detail === 0) fn();
    },
  };
}
