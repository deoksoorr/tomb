"use client";

import { useEffect, useRef, useState } from "react";
import { useBlockingLayer } from "@/lib/hooks/useKeyBlock";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { useNewVersion } from "@/lib/hooks/useNewVersion";
import { busyNow } from "@/lib/busy";
import { countdownLeft, decideUpdate } from "@/lib/update";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./UpdateNotice.module.css";

// 새 버전 안내 (lib/update.ts 판정).
//  - 평소 패치: 화면 아래 고정 배너(닫기 없음) + [지금 업데이트]. 3분 무조작이면 자동, 숨겨 둔 탭은 돌아온 순간 자동.
//  - 큰 패치(최소 버전 미달): 게임을 가리는 창 + 10초 카운트다운 자동 새로고침. 사냥 한 판·묘비 작성은 끝날 때까지 기다린다.
// 새로고침은 그냥 location.reload() — 페이지가 내려가는 순간(pagehide) 월드 씬이 채널·자리·자세를 저장하고
// 다시 열리면 입장 화면을 건너뛰어 같은 자리로 돌아온다 (lib/resume.ts).

const TICK_MS = 1_000;

let reloading = false;
function reload(): void {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

export default function UpdateNotice() {
  const { level, deployReady } = useNewVersion();
  const scene = useBridgeValue("scene:changed")?.scene ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [requiredAt, setRequiredAt] = useState<number | null>(null);
  const [hardBusy, setHardBusy] = useState(false);
  const lastInputAt = useRef(0);
  const returnedAt = useRef<number | null>(null);

  // 마지막 입력 시각과 숨김→보임 시각을 기록한다 (렌더 없이)
  useEffect(() => {
    const touch = () => {
      lastInputAt.current = Date.now();
    };
    touch(); // 화면이 뜬 순간부터 센다
    const onVisibility = () => {
      if (!document.hidden) returnedAt.current = Date.now();
    };
    const opts = { capture: true, passive: true } as const;
    const events = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, opts);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      for (const e of events) window.removeEventListener(e, touch, opts);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (level === "none") return;
    const step = () => {
      if (reloading) return;
      const t = Date.now();
      const busy = busyNow(scene);
      setNow(t);
      setHardBusy(busy.hard);
      // 큰 패치 카운트다운은 가릴 수 있을 때(사냥·묘비 작성이 아닐 때)부터 센다
      let reqAt = requiredAt;
      if (level === "required" && deployReady && !busy.hard && reqAt === null) {
        reqAt = t;
        setRequiredAt(t);
      }
      const verdict = decideUpdate({
        level,
        now: t,
        lastInputAt: lastInputAt.current,
        hidden: document.hidden,
        returnedAt: returnedAt.current,
        busy,
        requiredAt: reqAt,
        deployReady,
      });
      if (verdict === "reload") reload();
    };
    step();
    const timer = setInterval(step, TICK_MS);
    // 숨은 탭에서 돌아온 순간은 1초를 기다리지 않고 바로 본다
    const onVisible = () => {
      if (!document.hidden) step();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [level, deployReady, scene, requiredAt]);

  const blocking = level === "required" && !hardBusy;
  useBlockingLayer(blocking);

  if (level === "none") return null;

  if (level === "patch") {
    return (
      <div className={styles.banner} role="status" data-testid="update-banner">
        <span>새 버전이 나왔어요</span>
        <button type="button" className={cx(ui.button, ui.primary)} onClick={reload}>
          지금 업데이트
        </button>
      </div>
    );
  }

  // 큰 패치: 사냥·미니게임·묘비 작성 중이면 가리지 않고 위쪽에 짧게만 알린다
  if (hardBusy) {
    const what = scene === "hunt" ? "사냥이" : scene === "minigame" ? "미니게임이" : "하던 일이";
    return (
      <div className={cx(styles.banner, styles.top)} role="status" data-testid="update-wait">
        <span>{what} 끝나면 새 버전으로 바꿔요</span>
      </div>
    );
  }

  const left = countdownLeft(requiredAt, now);
  return (
    <div className={styles.cover} role="alertdialog" aria-modal="true" aria-labelledby="update-title" data-testid="update-required">
      <div className={styles.card}>
        <p id="update-title" className={styles.title}>
          새 버전으로 바꿔야 계속 놀 수 있어요
        </p>
        <p className={styles.sub}>
          {deployReady ? (
            <>
              {left}초 뒤 자동으로 바뀌어요.
              <br />
              지금 자리는 그대로 이어져요.
            </>
          ) : (
            <>
              새 버전을 준비하고 있어요.
              <br />
              잠시만 기다려 주세요…
            </>
          )}
        </p>
        <button type="button" className={cx(ui.button, ui.primary)} onClick={reload} autoFocus>
          업데이트
        </button>
      </div>
    </div>
  );
}
