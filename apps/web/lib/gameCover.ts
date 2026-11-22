// 11/22 화면 대부분을 덮는 창이 열린 동안 뒤 마을(Phaser) 그리기를 줄이는 공용 장치.
// 창이 coverGame()을 부르면(여럿이면 하나라도 남아 있는 동안) game/backgroundLoop가 갱신(네트워크·위치 동기화·시간)은 매 프레임 그대로,
// 그리기만 초당 COVERED_FPS번으로 줄인다. 돌려받은 함수를 부르면(창 닫힘) 바로 원래대로.
// 지금은 염색 판(60초)에서만 켠다 — 가방 등 다른 창도 같은 함수로 켤 수 있다.

type Listener = (covered: boolean) => void;

const holders = new Set<symbol>();
const listeners = new Set<Listener>();

function emit(): void {
  const on = holders.size > 0;
  for (const fn of listeners) fn(on);
}

/** 마을을 덮는다. 해제 함수를 돌려준다 (여러 번 불러도 한 번만 풀린다) */
export function coverGame(): () => void {
  const id = Symbol("cover");
  const was = holders.size > 0;
  holders.add(id);
  if (!was) emit();
  return () => {
    if (!holders.delete(id)) return;
    if (holders.size === 0) emit();
  };
}

/** 지금 덮여 있는지 */
export function isGameCovered(): boolean {
  return holders.size > 0;
}

/** 덮임이 바뀔 때마다. 해제 함수를 돌려준다 */
export function onGameCoverChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
