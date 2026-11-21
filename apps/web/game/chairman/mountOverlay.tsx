import { createRoot } from "react-dom/client";
import ChairmanOverlay from "./ChairmanOverlay";

/** 회장님 독대 오버레이를 document.body에 띄운다 (돌려준 함수로 내린다) */
export function mountChairOverlay(): () => void {
  const el = document.createElement("div");
  el.dataset.chairman = "overlay";
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<ChairmanOverlay />);
  // 오버레이 버튼(마을로)에서 불릴 수 있다 → React가 그리기를 마친 뒤 내린다
  return () =>
    setTimeout(() => {
      root.unmount();
      el.remove();
    }, 0);
}
