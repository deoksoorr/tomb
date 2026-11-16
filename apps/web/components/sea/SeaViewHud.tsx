"use client";

import { useEffect } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import styles from "./SeaViewHud.module.css";

/** 입력칸에서 친 V는 무시해요 */
function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

/**
 * 11/16 바닷가 바다 보기 버튼: 바다를 볼 수 있는 자리(백사장 벤치·선베드·돗자리·선착장 끝·방파제 끝)에 앉아 있으면
 * 아래 가운데에 「바다 보기」(장면 중이면 「돌아가기」). 키보드 V (관람차 시점 바꾸기와 같은 키). 일어나거나 움직이면 게임이 장면을 끄고 버튼도 숨겨요
 */
export default function SeaViewHud() {
  const hud = useBridgeValue("sea:hud");
  const shown = !!hud;

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyV" || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (bridge.last("ui:blockKeys")?.blocked || isEditable(e.target) || isEditable(document.activeElement)) return;
      bridge.emit("sea:view");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown]);

  if (!hud) return null;
  const label = hud.on ? "돌아가기" : "바다 보기";
  return (
    <div className={styles.dock}>
      <button type="button" className={styles.view} onClick={() => bridge.emit("sea:view")} aria-label={`${label} (V)`} title="V">
        {label}
        <span className={styles.key} aria-hidden="true">
          V
        </span>
      </button>
    </div>
  );
}
