import type { GameStartOptions } from "../bridge";

/** createGame → 씬으로 넘기는 실행 컨텍스트 */
export type GameContext = {
  opts: GameStartOptions;
  /** 게임을 정리할 때 동기적으로 실행할 것들 (네트워크·DOM 리스너). 숨은 탭에서도 확실히 끊기 위해 */
  disposers: (() => void)[];
  disposed: boolean;
};
