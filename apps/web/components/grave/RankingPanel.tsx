"use client";

import { useId, useRef, useState } from "react";
import type { PublicGrave } from "@/lib/types";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import RankingList from "./RankingList";
import styles from "./RankingPanel.module.css";

type Props = {
  graves: readonly PublicGrave[];
  /** 헌화 탭 항목 클릭: 카메라만 그 묘비로 + 상세 모달 */
  onPick: (graveId: string) => void;
};

/** 데스크톱 우측 접이식 랭킹 (터치 화면은 메뉴 시트에서 같은 목록을 연다) */
export default function RankingPanel({ graves, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  return (
    <section className={styles.ranking} aria-label="랭킹">
      <button
        ref={toggleRef}
        type="button"
        className={cx(ui.button, ui.top, styles.toggle)}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <PixelIcon name="list" />
        <span>랭킹</span>
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
          <RankingList graves={graves} onPick={onPick} />
        </div>
      )}
    </section>
  );
}
