"use client";

import { cx } from "../ui/cx";
import OddsDialog from "./OddsDialog";
import { closeOdds, openOdds, useOddsOpen, type OddsSection } from "./oddsStore";
import styles from "./OddsDialog.module.css";

/** 11/18 확률 안내 창 뿌리 (GameShell이 게임이 뜨면 붙인다). 어느 창에서 열어도 그 위에 겹쳐 뜬다 */
export default function OddsLayer() {
  const open = useOddsOpen();
  return open ? <OddsDialog section={open} onClose={closeOdds} /> : null;
}

/** 다른 창 안의 작은 [확률 보기] 연결 */
/** before: 확률 창을 열기 전에 할 일 (안내 창은 자기를 닫고 확률 창으로 바꾼다 — 끄면 안내 창으로 돌아가지 않는다) */
export function OddsLink({ section, label = "확률 보기", className, before }: { section: OddsSection; label?: string; className?: string; before?: () => void }) {
  return (
    <button
      type="button"
      className={cx(styles.link, className)}
      onClick={() => {
        before?.();
        openOdds(section);
      }}
    >
      {label}
    </button>
  );
}
