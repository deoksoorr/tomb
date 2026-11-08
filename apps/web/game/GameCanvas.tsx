"use client";

import { useEffect, useRef } from "react";
import { bridge, type GameStartOptions } from "./bridge";

// 화면 전체를 덮는 Phaser 캔버스 (z-index 0). React 오버레이는 이 위에 형제로 올린다.
// UI는 next/dynamic(() => import("@/game/GameCanvas"), { ssr: false }) 로 불러온다.
// 옵션은 마운트 때 한 번만 읽는다 (바꾸려면 key를 바꿔 다시 마운트).

export default function GameCanvas(props: GameStartOptions) {
  const hostRef = useRef<HTMLDivElement>(null);
  const optsRef = useRef(props);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let handle: { destroy(): void } | null = null;
    import("./createGame")
      .then(({ createGame }) => {
        // StrictMode 이중 마운트: 첫 번째 정리가 import보다 먼저 끝났으면 만들지 않는다
        if (disposed) return;
        handle = createGame(host, optsRef.current);
      })
      .catch((err: unknown) => {
        console.error(err);
        bridge.emit("toast", { message: "묘지를 불러오지 못했어요. 새로고침해 주세요." });
      });
    return () => {
      disposed = true;
      handle?.destroy();
      handle = null;
      bridge.resetGameState();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        background: "#141519",
      }}
    />
  );
}
