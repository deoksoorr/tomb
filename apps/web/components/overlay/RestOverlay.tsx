"use client";

import { useSyncExternalStore } from "react";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { bgm, currentTrack, INITIAL_BGM_STATE } from "../bgm/engine";
import styles from "./RestOverlay.module.css";

/**
 * 휴식 중 막: 다른 탭·다른 창으로 넘어가 게임 루프를 재운 동안(game/backgroundLoop → game:rest) 화면을 어둡게 덮고 "휴식 중"을 띄운다.
 * 음악은 계속 흐른다. 돌아오면(포커스·클릭·키·탭 보임 — lib/background) 게임이 바로 깨고 막도 걷힌다.
 * 막을 누르면 그 입력으로 바로 돌아온다 (lib/background가 창의 pointerdown을 듣는다)
 */
export default function RestOverlay() {
  const resting = useBridgeValue("game:rest")?.on ?? false;
  const bgmState = useSyncExternalStore(bgm.subscribe, bgm.getSnapshot, () => INITIAL_BGM_STATE);
  if (!resting) return null;
  const track = bgmState.playing ? currentTrack(bgmState) : null;
  return (
    <div className={styles.cover} role="status" aria-live="polite">
      <div className={styles.card}>
        <p className={styles.title}>휴식 중</p>
        <p className={styles.sub}>음악은 계속 흘러요 · 돌아오면 바로 이어져요</p>
        {track && <p className={styles.track}>♪ {track.title}</p>}
      </div>
    </div>
  );
}
