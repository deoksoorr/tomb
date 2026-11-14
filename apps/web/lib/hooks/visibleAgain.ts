import { isBackground, onBackgroundChange } from "@/lib/background";

// 뒤로 가면(탭을 숨기거나 다른 창을 띄워 5초 — lib/background) Redis를 쓰는 주기 호출은 멈추고(소리만 나온다),
// 다시 앞으로 오면 필요한 것만 한 번 새로 읽는다. 돌아온 순간 여러 기능이 한꺼번에 서버로 몰리지 않게 0~spreadMs 사이로 흩는다.

/** 지금 뒤로 간 상태인지 (숨긴 탭 또는 다른 창을 보는 중. 서버 렌더·시험 환경은 앞으로) */
export const tabHidden = () => isBackground();

/** 돌아왔을 때 다시 읽기를 흩는 기본 폭 */
export const VISIBLE_SPREAD_MS = 4_000;

/**
 * 앞으로 돌아오면 cb를 한 번 (0~spreadMs 흩어서). 그사이 다시 뒤로 가면 취소한다. 해제 함수를 돌려준다.
 * cb 안에서 "마지막으로 읽은 지 얼마나 됐는지"를 보고 오래됐을 때만 읽는 것은 쓰는 쪽이 정한다
 */
export function onVisibleAgain(cb: () => void, spreadMs = VISIBLE_SPREAD_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const off = onBackgroundChange((bg) => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (bg) return;
    timer = setTimeout(
      () => {
        timer = null;
        if (!tabHidden()) cb();
      },
      Math.floor(Math.random() * spreadMs),
    );
  });
  return () => {
    if (timer) clearTimeout(timer);
    off();
  };
}
