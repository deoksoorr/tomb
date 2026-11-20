/**
 * 11/20 아래에 더 있으면 data-more를 붙인다 (맥·폰은 스크롤바가 숨어 있어 더 있는지 모른다 → CSS가 맨 아래를 살짝 흐리게).
 * 창 본문(Dialog)과 창 안에서 따로 스크롤되는 목록(상인 판매 카드 등)이 같이 쓴다.
 * 돌려주는 함수로 정리한다 — React 19 ref 콜백에 그대로 넘겨도 된다 (`ref={watchMoreBelow}`).
 */
export function watchMoreBelow(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return;
  const check = () => {
    const more = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
    if (more) el.dataset.more = "";
    else delete el.dataset.more;
  };
  check();
  el.addEventListener("scroll", check, { passive: true });
  const ro = new ResizeObserver(check);
  ro.observe(el);
  const mo = new MutationObserver(check);
  mo.observe(el, { childList: true, subtree: true });
  return () => {
    el.removeEventListener("scroll", check);
    ro.disconnect();
    mo.disconnect();
  };
}
