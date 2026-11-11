"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewHandle } from "@/game/preview/createPreview";
import styles from "./LiveBackground.module.css";

// 입장 화면 뒤에 진짜 마을(월드 맵)을 천천히 둘러보는 배경 (game/preview).
// 첫 화면이 먼저 뜨도록 브라우저가 한가할 때 Phaser를 불러오고, 첫 장면이 그려지면 서서히 보인다.
// 그 전·실패(WebGL 없음 등)·데이터 절약 모드에서는 아래의 그림 하늘(NightSky)이 그대로 배경이 된다.
// paused: 입장 버튼을 눌러 게임을 불러오는 동안 멈춰서 CPU를 양보한다 (화면은 마지막 장면 그대로).

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

function prefersReduced(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
}

type Props = {
  paused: boolean;
  /** 첫 장면이 보이기 시작했다 (아래 그림 하늘의 애니메이션을 쉬게) */
  onShown?: () => void;
};

export default function LiveBackground({ paused, onShown }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PreviewHandle | null>(null);
  const pausedRef = useRef(paused);
  const onShownRef = useRef(onShown);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    onShownRef.current = onShown;
  }, [onShown]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || saveData()) return;
    let disposed = false;
    const start = () => {
      import("@/game/preview/createPreview")
        .then(({ createPreview }) => {
          if (disposed) return;
          const mobile = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
          handleRef.current = createPreview(host, {
            reduced: prefersReduced(),
            mobile,
            onReady: () => {
              if (disposed) return;
              setShown(true);
              // 서서히 나타나는 동안은 아래 하늘도 보이므로 다 덮은 뒤에 알린다
              window.setTimeout(() => {
                if (!disposed) onShownRef.current?.();
              }, 1800);
            },
          });
          handleRef.current.pause(pausedRef.current);
        })
        .catch(() => {
          // 그림 하늘로 충분하다
        });
    };
    const w = window as IdleWindow;
    const idle = w.requestIdleCallback ? w.requestIdleCallback(start, { timeout: 1500 }) : null;
    const timer = idle === null ? window.setTimeout(start, 300) : null;
    return () => {
      disposed = true;
      if (idle !== null) w.cancelIdleCallback?.(idle);
      if (timer !== null) window.clearTimeout(timer);
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    handleRef.current?.pause(paused);
  }, [paused]);

  return <div ref={hostRef} className={styles.live} data-shown={shown} aria-hidden="true" />;
}
