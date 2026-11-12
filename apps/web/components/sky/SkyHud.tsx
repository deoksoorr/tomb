"use client";

import { useEffect } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import styles from "./SkyHud.module.css";

/** 입력칸에서 친 V는 무시한다 */
function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

/**
 * 놀이기구 2 (관람차·열기구) 안내: 위 가운데에 지나가는 곳 이름, 아래 가운데에 남은 시간·조작 안내.
 * 게임(SkyRides)이 sky:hud로 알려 준다 (null이면 숨김). 탑승 장면이 아니면(출발장에서 기다리는 중) 작게
 * 탑승 장면 중에는 [시점 변경하기] 버튼(키보드 V)으로 2D 장면 ↔ 맵 위 보기를 바꾼다 (sky:view)
 */
export default function SkyHud() {
  const hud = useBridgeValue("sky:hud");
  const sky = !!hud?.sky;

  useEffect(() => {
    if (!sky) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyV" || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (bridge.last("ui:blockKeys")?.blocked || isEditable(e.target) || isEditable(document.activeElement)) return;
      bridge.emit("sky:view");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sky]);

  if (!hud) return null;
  const waiting = hud.kind === "balloon" && !hud.sky && hud.hint.startsWith("곧");
  return (
    <>
      {hud.place && (
        <div className={styles.place} key={hud.place} aria-live="polite">
          {hud.place}
        </div>
      )}
      <div className={styles.dock}>
        {hud.sky && (
          <button
            type="button"
            className={styles.view}
            onClick={() => bridge.emit("sky:view")}
            aria-label={hud.view === "scene" ? "시점 변경하기: 마을 위에서 보기 (V)" : "시점 변경하기: 옆에서 보기 (V)"}
            title="V"
          >
            시점 변경하기
          </button>
        )}
        <div className={styles.bar} role="status">
          <span className={styles.title}>{hud.title}</span>
          <span className={styles.left}>{waiting ? `${hud.left}초 뒤 출발` : `${hud.left}초 뒤 내려요`}</span>
          <span className={styles.hint}>{hud.hint}</span>
        </div>
      </div>
    </>
  );
}
