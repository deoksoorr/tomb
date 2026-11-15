// 새 버전 안내를 다른 창들 위에 띄우기.
// 게임 창(components/ui/Dialog)은 네이티브 <dialog>.showModal()이라 브라우저의 top layer에 올라간다 →
// z-index가 아무리 높아도 보통 요소는 그 아래에 깔리고, 모달 바깥은 inert라 버튼도 눌리지 않는다.
// (사냥 결과·사냥터 로비·가방 창이 떠 있으면 업데이트 창이 안 보이던 원인)
// 그래서 안내도 top layer에 올리고(모달 창 = showModal, 배너 = popover), 나중에 다른 모달이 열리면 다시 맨 위로 올린다.

export type TopLayerMode = "modal" | "popover";

type DialogLike = HTMLElement & { open?: boolean; showModal?: () => void; close?: () => void };
type PopoverLike = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

type ObserverCtor = new (cb: (records: Pick<MutationRecord, "target">[]) => void) => {
  observe(target: Node, opts: MutationObserverInit): void;
  disconnect(): void;
};

/** 이 브라우저가 popover를 지원하는지 (iOS 16 이하 등은 그냥 고정 위치 요소로 둔다) */
export function supportsPopover(): boolean {
  return typeof HTMLElement !== "undefined" && typeof (HTMLElement.prototype as PopoverLike).showPopover === "function";
}

function isOpenModal(n: unknown, self: HTMLElement): boolean {
  if (n === self || !n || typeof n !== "object") return false;
  const el = n as DialogLike;
  if (el.tagName !== "DIALOG" || !el.open) return false;
  try {
    return el.matches(":modal");
  } catch {
    return true;
  }
}

function show(el: HTMLElement, mode: TopLayerMode): void {
  try {
    if (mode === "modal") {
      const d = el as DialogLike;
      if (!d.open) d.showModal?.();
    } else {
      (el as PopoverLike).showPopover?.();
    }
  } catch {
    // 연결이 끊긴 요소·이미 열린 popover 등: 다음 기회에
  }
}

function hide(el: HTMLElement, mode: TopLayerMode): void {
  try {
    if (mode === "modal") {
      const d = el as DialogLike;
      if (d.open) d.close?.();
    } else {
      (el as PopoverLike).hidePopover?.();
    }
  } catch {
    // 무시
  }
}

/**
 * el을 top layer에 올리고, 다른 모달 <dialog>가 나중에 열리면 다시 맨 위로 올린다. 반환값 = 내리기.
 * modal: <dialog>.showModal() (Esc로 닫혀도 다시 연다), popover: popover="manual" 요소의 showPopover().
 */
export function keepOnTop(
  el: HTMLElement,
  mode: TopLayerMode,
  opts: { root?: Node; Observer?: ObserverCtor } = {},
): () => void {
  let alive = true;
  const raise = () => {
    if (!alive) return;
    hide(el, mode);
    show(el, mode);
  };
  show(el, mode);

  const Observer = opts.Observer ?? (typeof MutationObserver === "undefined" ? undefined : (MutationObserver as unknown as ObserverCtor));
  const root = opts.root ?? (typeof document === "undefined" ? undefined : document.body);
  const observer =
    Observer && root
      ? new Observer((records) => {
          if (records.some((r) => isOpenModal(r.target, el))) raise();
        })
      : null;
  observer?.observe(root as Node, { subtree: true, attributes: true, attributeFilter: ["open"] });

  // 크롬은 Esc를 거듭 누르면 cancel을 막아도 대화상자를 닫는다 → 바로 다시 연다
  const onClose = () => {
    if (alive && mode === "modal") queueMicrotask(() => alive && show(el, mode));
  };
  if (mode === "modal") el.addEventListener("close", onClose);

  return () => {
    alive = false;
    observer?.disconnect();
    if (mode === "modal") el.removeEventListener("close", onClose);
    hide(el, mode);
  };
}
