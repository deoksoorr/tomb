import { bridge } from "@/game/bridge";

// 11/16 r19 사용자: 바라보는 장면(바닷가 바다 보기·등대 꼭대기·동전 망원경, 캠핑장 전망대 망원경)이 켜져 있거나
// 켜지고 꺼지는 동안에는 게임 단축키를 모두 막아요 (폭죽 G·상호작용 E·표현·창 P/L/U/M/B/O/N·Space 등).
// 되는 것: 채팅(Enter, 입력칸에 치는 글), 장면 켜기·끄기(V), 나가기(Esc), 움직이는 키(지금처럼 움직이면 장면에서 나와요).
// 키마다 막지 않고, 창(window) 맨 앞(capture)에서 한 번에 거릅니다 — 게임(Phaser)과 오버레이의 모든 keydown보다 먼저 받아요.
// 장면은 bridge "view:busy"로 켜짐을 알려요 (켜지고 꺼지는 사이 검은 막·카메라 이동 동안 포함).

/** 바라보는 장면 중에도 그대로 가는 키 */
export const VIEW_ALLOWED_CODES: ReadonlySet<string> = new Set([
  // 장면 켜기·끄기 · 나가기 · 채팅
  "KeyV",
  "Escape",
  "Enter",
  "NumpadEnter",
  // 움직이는 키 (움직이면 장면에서 나와요 — 캠핑장 전망대 망원경은 둘러보기)
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
  // 키보드로 버튼 옮겨 다니기 (「돌아가기」 버튼)
  "Tab",
]);

export type ViewKeyEvent = Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "stopImmediatePropagation" | "preventDefault">;

/** 이 키가 바라보는 장면 중에도 가는지 (editable = 입력칸에 치는 중) */
export function viewKeyAllowed(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey">, editable: boolean): boolean {
  // 채팅 입력칸에 치는 글 · 브라우저 단축키(새로 고침·복사 등)는 그대로
  if (editable || e.ctrlKey || e.metaKey || e.altKey) return true;
  return VIEW_ALLOWED_CODES.has(e.code);
}

/**
 * keydown 거르개를 만들어요 (시험할 수 있게 순수하게 — install은 아래).
 * viewing = 지금 바라보는 장면 중인지, editable = 입력칸에 포커스가 있는지, onEscape = 장면에서 나가기
 */
export function viewKeyFilter(deps: { viewing: () => boolean; editable: () => boolean; onEscape: () => void }): (e: ViewKeyEvent) => void {
  return (e) => {
    if (!deps.viewing()) return;
    const editable = deps.editable();
    if (viewKeyAllowed(e, editable)) {
      if (e.code === "Escape" && !editable) deps.onEscape();
      return;
    }
    e.stopImmediatePropagation();
    e.preventDefault();
  };
}

function editableFocus(): boolean {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  return el instanceof HTMLElement && (el.isContentEditable || el.matches("input, textarea, select"));
}

/** 지금 바라보는 장면 중인지 (장면이 알린 값) */
export function viewing(): boolean {
  return bridge.last("view:busy")?.on === true;
}

/** 게임 화면에 한 번 걸어요 (GameShell). 떼는 함수를 돌려줘요 */
export function installViewKeyGuard(): () => void {
  const onKey = viewKeyFilter({ viewing, editable: editableFocus, onEscape: () => bridge.emit("view:exit") });
  window.addEventListener("keydown", onKey, { capture: true });
  return () => window.removeEventListener("keydown", onKey, { capture: true });
}
