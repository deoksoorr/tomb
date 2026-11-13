import { bodyLookScore, itemLookScore } from "@/lib/lookScore";
import { cx } from "./cx";
import styles from "./LookScoreBadge.module.css";

/**
 * "꾸미기 +N점" 배지. 숫자는 lib/lookScore에서 계산한다 (itemId = 코디·펫, body = 프리미엄 외형).
 * 0점(운영자 전용·처음 6종 몸·꾸미기가 아닌 것)이면 그리지 않는다. short면 "+N점"만 (좁은 칸)
 */
export default function LookScoreBadge({ itemId, body, short = false, className }: { itemId?: string; body?: string; short?: boolean; className?: string }) {
  const score = itemId ? itemLookScore(itemId) : body ? bodyLookScore(body) : 0;
  if (score <= 0) return null;
  return (
    <span className={cx(styles.badge, className)} title={`입고 있으면 꾸미기 점수 +${score}점 (꾸미기 랭킹)`}>
      {short ? `+${score}점` : `꾸미기 +${score}점`}
    </span>
  );
}
