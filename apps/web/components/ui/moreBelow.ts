import { useCallback, type RefObject } from "react";

/**
 * 11/20 아래에 더 있으면 data-more를 붙인다 (맥·폰은 스크롤바가 숨어 있어 더 있는지 모른다 → CSS가 맨 아래를 살짝 흐리게).
 * 창 본문(Dialog)과 창 안에서 따로 스크롤되는 목록(상인 판매 카드 등)이 같이 쓴다.
 * 11/22 창의 바깥 스크롤 칸은 전역 클래스 more-fade(app/globals.css)를 같이 붙이면 흐림이 걸린다.
 * 돌려주는 함수로 정리한다 — React 19 ref 콜백에 그대로 넘겨도 된다 (`ref={watchMoreBelow}`).
 */
export function watchMoreBelow(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return;
  const check = () => {
    raf = 0;
    const more = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
    if (more) el.dataset.more = "";
    else if (el.dataset.more !== undefined) delete el.dataset.more;
  };
  // 11/22 한 프레임에 한 번만 잰다: 창 안 글자가 매 프레임 바뀌면(염색 판 색 이름·남은 시간) 바뀔 때마다 레이아웃을 강제로 읽어 판이 끊겼다
  let raf = 0;
  const later = () => {
    if (!raf) raf = requestAnimationFrame(check);
  };
  check();
  el.addEventListener("scroll", later, { passive: true });
  const ro = new ResizeObserver(later);
  ro.observe(el);
  const mo = new MutationObserver(later);
  mo.observe(el, { childList: true, subtree: true });
  return () => {
    if (raf) cancelAnimationFrame(raf);
    el.removeEventListener("scroll", later);
    ro.disconnect();
    mo.disconnect();
  };
}

/** 11/22 이미 useRef가 걸린 칸(맨 위로 스크롤 등): 그 ref도 채우면서 watchMoreBelow를 거는 ref 콜백 (렌더마다 새로 걸리지 않게 고정) */
export function useMoreBelowRef<T extends HTMLElement>(ref: RefObject<T | null>): (el: T | null) => () => void {
  return useCallback(
    (el: T | null) => {
      ref.current = el;
      const stop = watchMoreBelow(el);
      return () => {
        ref.current = null;
        stop?.();
      };
    },
    [ref],
  );
}
