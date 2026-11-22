import type * as Phaser from "phaser";

// 11/22 폰을 가로 → 세로로 돌리면 캔버스가 가로 크기(844×390)에 멈춰 캐릭터가 한쪽으로 밀리고 화면이 확대돼 보였다 (새로고침 전까지).
// 원인: Phaser ScaleManager의 화면 방향 리스너(screen.orientation change · orientationchange)는 부모 크기를 다시 재지 않고 바로 refresh()한다.
//  refresh()는 예전 parentSize로 캔버스를 맞춘 뒤 맨 끝(updateScale 끝의 getParentBounds)에서 새 부모 크기를 parentSize에 적어 버린다.
//  그다음 resize 이벤트·500ms 점검은 「parentSize == 지금 부모 크기」라 바뀐 게 없다고 보고 다시는 맞추지 않는다.
// → 게임 크기(gameSize)를 실제 부모 크기와 직접 비교해 어긋나 있으면 다시 맞춘다.
//  - 방향·창 크기·visualViewport 이벤트가 오면 다음 프레임 + 조금 뒤 두 번 더 (iOS는 회전 뒤 크기가 늦게 자리 잡는다)
//  - 놓친 경우를 위해 게임 루프에서 0.5초마다 한 번 (getBoundingClientRect 한 번뿐)
// 루프가 잠든 동안(뒤로 간 탭·정지 미리보기)은 맞추지 않는다 — 캔버스 크기를 바꾸면 그림이 지워지는데 다시 그려 줄 프레임이 없다. 깨면 0.5초 점검이 맞춘다.
// 크기만 맞추면 장면들이 RESIZE에서 카메라 크기·경계·줌을 다시 계산한다 (마을·캠핑장·바닷가·사냥터·집 모두 같은 게임 크기를 쓴다).

/** 부모 크기와 게임 크기가 어긋났는지 (반올림 차이는 무시, 부모가 접혀 0이면 맞추지 않는다) */
export function sizeOutOfSync(parentW: number, parentH: number, gameW: number, gameH: number): boolean {
  if (!(parentW >= 1 && parentH >= 1)) return false;
  return Math.abs(parentW - gameW) >= 1 || Math.abs(parentH - gameH) >= 1;
}

/** 이벤트 뒤 다시 확인하는 때 (ms). 회전 직후엔 중간 크기가 먼저 오기도 한다 */
export const RESYNC_DELAYS_MS = [150, 450] as const;
/** 게임 루프 안 상시 점검 간격 (ms) */
export const RESYNC_POLL_MS = 500;

export function installViewportSync(game: Phaser.Game): () => void {
  let disposed = false;
  let raf = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const resync = () => {
    if (disposed) return;
    const sm = game.scale;
    const parent = sm?.parent as HTMLElement | undefined;
    if (!sm || !parent || !sm.canvas || !game.isRunning || !game.loop.running) return;
    const r = parent.getBoundingClientRect();
    if (!sizeOutOfSync(r.width, r.height, sm.width, sm.height)) return;
    sm.getParentBounds();
    sm.refresh();
  };

  const schedule = () => {
    if (disposed) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(resync);
    for (const t of timers.splice(0)) clearTimeout(t);
    for (const ms of RESYNC_DELAYS_MS) timers.push(setTimeout(resync, ms));
  };

  let acc = 0;
  const poll = (_time: number, delta: number) => {
    acc += delta;
    if (acc < RESYNC_POLL_MS) return;
    acc = 0;
    resync();
  };

  const so = typeof screen !== "undefined" ? screen.orientation : undefined;
  so?.addEventListener?.("change", schedule);
  window.addEventListener("orientationchange", schedule);
  window.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  game.events.on("prestep", poll);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    for (const t of timers.splice(0)) clearTimeout(t);
    so?.removeEventListener?.("change", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    game.events.off("prestep", poll);
  };
}
