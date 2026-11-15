"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./CampTalk.module.css";

// 11/15 캠핑장 NPC 대화 창: 화면 아래 가운데. 게임(CampScene)이 camp:talk로 열고, E·Space·버튼으로 다음 말, 마지막 말 다음엔 닫는다.
// 다른 창처럼 게임을 가리지 않는다 (걸어서 멀어지면 게임이 닫는다).

export default function CampTalk() {
  const talk = useBridgeValue("camp:talk");
  const [index, setIndex] = useState(0);

  // 새 대화가 열리면 첫 줄부터
  useEffect(() => setIndex(0), [talk]);

  useEffect(() => {
    if (!talk) return;
    return bridge.on("camp:talkNext", () => setIndex((i) => i + 1));
  }, [talk]);

  const done = !!talk && index >= talk.lines.length;
  useEffect(() => {
    if (!done) return;
    bridge.emit("camp:talkClose");
    bridge.emit("camp:talk", null);
  }, [done]);

  if (!talk || done) return null;
  const last = index === talk.lines.length - 1;
  return (
    <div className={styles.wrap}>
      <div className={styles.box} role="dialog" aria-live="polite" aria-label={`${talk.name}의 말`}>
        <div className={styles.name}>{talk.name}</div>
        <p className={styles.line}>{talk.lines[index]}</p>
        <div className={styles.foot}>
          <span className={styles.hint}>{index + 1}/{talk.lines.length}</span>
          <button type="button" className={cx(ui.button, ui.primary, styles.next)} onClick={() => setIndex((i) => i + 1)}>
            {last ? "닫기" : "다음 ▸"}
          </button>
        </div>
      </div>
    </div>
  );
}
