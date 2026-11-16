import { bridge } from "@/game/bridge";

/** 채널을 옮기고 그 채널에 붙을 때까지 기다리는 최대 시간 (가득 참 등으로 못 옮기면 그만둔다) */
export const CHANNEL_HOP_WAIT_MS = 20_000;

export type HopOptions = {
  /** 그 채널이 꽉 차 못 갈 때 안내 (없으면 기본 문장). 토스트는 게임이 띄운다 */
  fullMsg?: string;
  waitMs?: number;
};

/**
 * 채널마다 주거 구역이 따로다. 내 집이 다른 채널에 있으면 그 채널로 옮긴 뒤 run (이미 그 채널이면 바로).
 * 창이 닫혀도(컴포넌트가 내려가도) 기다림은 이어진다. 돌려주는 함수로 기다림을 그만둘 수 있다.
 * 못 옮기면 onFail: 꽉 찬 채널이라 옮기지 않았으면(지금 채널 그대로, 안내 토스트는 이미 떴다) full = 그 안내, 시간 초과면 undefined
 */
export function hopChannel(target: number, current: number, run: () => void, onFail?: (full?: string) => void, opts: HopOptions = {}): () => void {
  if (target === current) {
    run();
    return () => undefined;
  }
  let done = false;
  const finish = () => {
    done = true;
    off();
    offRefused();
    clearTimeout(timer);
  };
  const off = bridge.on("net:status", (st) => {
    if (done || st.mode !== "online" || st.channel !== target) return;
    finish();
    run();
  });
  const offRefused = bridge.on("channel:refused", ({ channel, message }) => {
    if (done || channel !== target) return;
    finish();
    onFail?.(message);
  });
  const timer = setTimeout(() => {
    if (done) return;
    finish();
    onFail?.();
  }, opts.waitMs ?? CHANNEL_HOP_WAIT_MS);
  bridge.emit("channel:switch", { channel: target, ...(opts.fullMsg ? { fullMsg: opts.fullMsg } : {}) });
  return finish;
}
