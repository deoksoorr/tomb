import { cx } from "../ui/cx";
import styles from "./site.module.css";

/** 진입 화면 타이틀 글자(Galmuri11 Bold)를 그대로 옮긴 로고. 밝은 바탕용·어두운 바탕용 두 벌 */
export function Logo({ height }: { height: number }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 로고 */}
      <img className={cx(styles.word, styles.onLight)} src="/devnotes/brand/logo-on-light.svg" alt="At one time..." height={height} />
      {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 로고 */}
      <img className={cx(styles.word, styles.onDark)} src="/devnotes/brand/logo-on-dark.svg" alt="" aria-hidden="true" height={height} />
    </>
  );
}
