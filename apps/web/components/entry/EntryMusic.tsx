"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { bgm, INITIAL_BGM_STATE } from "../bgm/engine";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./EntryMusic.module.css";

// 입장 화면 음악: 처음 방문부터 BGM이 나오게.
// 브라우저는 소리 자동 재생을 막으므로 입장 화면에서 처음 누르거나(탭·클릭) 키를 칠 때 튼다.
// 좌상단의 작은 버튼으로 끄고 켤 수 있고, 여기서 끄면 입장할 때도 다시 켜지 않는다.

/** 이 페이지(탭)에서 한 번만: 처음 입력으로 틀었거나 사용자가 버튼으로 정했다 / 입장 화면에서 껐다 */
export const entryMusic = { decided: false, optedOut: false };

/** 사용자 활성화(user activation)를 주는 입력만 듣는다: 터치는 pointerdown이 아니라 손을 뗄 때 인정된다 */
const ACTIVATION_EVENTS = ["pointerup", "touchend", "keydown"] as const;

export default function EntryMusic() {
  const state = useSyncExternalStore(bgm.subscribe, bgm.getSnapshot, () => INITIAL_BGM_STATE);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const on = state.playing && !state.muted;

  useEffect(() => {
    if (entryMusic.decided) return;
    let timer = 0;
    const off = () => {
      for (const e of ACTIVATION_EVENTS) window.removeEventListener(e, onInput, true);
      window.clearTimeout(timer);
    };
    function onInput(e: Event) {
      if (entryMusic.decided) return off();
      // 음악 버튼은 자기가 처리한다
      if (e.target instanceof Node && buttonRef.current?.contains(e.target)) return;
      if (e instanceof KeyboardEvent && e.key === "Escape") return;
      if (bgm.getSnapshot().playing) return;
      bgm.play();
      // 막히면(NotAllowedError) playing이 다시 false가 된다 → 다음 입력에서 다시 시도
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!bgm.getSnapshot().playing) return;
        entryMusic.decided = true;
        off();
      }, 600);
    }
    for (const e of ACTIVATION_EVENTS) window.addEventListener(e, onInput, true);
    return off;
  }, []);

  function toggle() {
    entryMusic.decided = true;
    if (on) {
      entryMusic.optedOut = true;
      bgm.pause();
      return;
    }
    entryMusic.optedOut = false;
    if (state.muted) bgm.toggleMute();
    bgm.play();
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={cx(ui.button, ui.quiet, styles.toggle)}
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "배경 음악 끄기" : "배경 음악 켜기"}
      data-on={on}
    >
      <PixelIcon name={on ? "sound" : "mute"} />
      <span className={styles.label} aria-hidden="true">
        {on ? "음악 켜짐" : "음악 꺼짐"}
      </span>
    </button>
  );
}
