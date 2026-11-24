"use client";

import { useId, useRef } from "react";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import RankingList from "./RankingList";
import styles from "./RankingPanel.module.css";

type Props = {
  /** 11/16 펼침 상태는 GameShell이 쥔다 (L 단축키) */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** 데스크톱 우측 접이식 랭킹 (터치 화면은 메뉴 시트에서 같은 목록을 연다) */
export default function RankingPanel({ open, onOpenChange: setOpen }: Props) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  return (
    <section className={styles.ranking} aria-label="랭킹">
      <button
        ref={toggleRef}
        type="button"
        className={cx(ui.button, ui.top, styles.toggle)}
        onClick={() => setOpen(!open)}
        title="랭킹 (L)"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <PixelIcon name="list" />
        <span>랭킹</span>
        <span className={styles.key} aria-hidden="true">L</span>
      </button>

      {open && (
        <div
          id={panelId}
          className={cx(ui.panel, styles.panel)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            setOpen(false);
            toggleRef.current?.focus();
          }}
        >
          <RankingList />
        </div>
      )}
    </section>
  );
}
