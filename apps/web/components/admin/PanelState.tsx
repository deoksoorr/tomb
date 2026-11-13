import type { ReactNode } from "react";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";

// 관리자 패널 공용 상태 문구: 불러오는 중 · 비어 있음 · 불러오지 못함 (모양을 한곳에서 맞춘다)

type Common = { inline?: boolean };

export function Loading({ inline, children = "불러오는 중…" }: Common & { children?: ReactNode }) {
  return (
    <div className={cx(styles.state, inline && styles.stateInline)} role="status" aria-live="polite">
      {!inline && <span className={styles.spinner} aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}

export function Empty({ inline, children }: Common & { children: ReactNode }) {
  return <div className={cx(styles.state, inline && styles.stateInline)}>{children}</div>;
}

export function Failed({ inline, children = "불러오지 못했어요.", onRetry }: Common & { children?: ReactNode; onRetry?: () => void }) {
  return (
    <div className={cx(styles.state, styles.stateError, inline && styles.stateInline)} role="alert">
      <span>{children}</span>
      {onRetry && (
        <button type="button" className={cx(ui.button, ui.small)} onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}

/** usePanelLoad 결과로 불러오는 중 / 실패를 보여 준다 (데이터가 있으면 아무것도 그리지 않는다) */
export function LoadState({ data, error, retry, inline }: Common & { data: unknown; error: string | null; retry: () => void }) {
  if (data !== null) return null;
  if (error) return <Failed inline={inline} onRetry={retry}>{`불러오지 못했어요. ${error}`}</Failed>;
  return <Loading inline={inline} />;
}
