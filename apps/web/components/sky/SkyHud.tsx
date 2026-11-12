"use client";

import { useBridgeValue } from "@/lib/hooks/useBridge";
import styles from "./SkyHud.module.css";

/**
 * 놀이기구 2 (관람차·열기구) 안내: 위 가운데에 지나가는 곳 이름, 아래 가운데에 남은 시간·조작 안내.
 * 게임(SkyRides)이 sky:hud로 알려 준다 (null이면 숨김). 탑승 장면이 아니면(출발장에서 기다리는 중) 작게
 */
export default function SkyHud() {
  const hud = useBridgeValue("sky:hud");
  if (!hud) return null;
  const waiting = hud.kind === "balloon" && !hud.sky && hud.hint.startsWith("곧");
  return (
    <>
      {hud.place && (
        <div className={styles.place} key={hud.place} aria-live="polite">
          {hud.place}
        </div>
      )}
      <div className={styles.bar} role="status">
        <span className={styles.title}>{hud.title}</span>
        <span className={styles.left}>{waiting ? `${hud.left}초 뒤 출발` : `${hud.left}초 뒤 내려요`}</span>
        <span className={styles.hint}>{hud.hint}</span>
      </div>
    </>
  );
}
