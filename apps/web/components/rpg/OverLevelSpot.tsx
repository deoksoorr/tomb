"use client";

import { useEffect, useState } from "react";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import styles from "../overlay/MegaphoneSpotlight.module.css";
import own from "./OverLevelSpot.module.css";

/** 내려가기 전 사라지는 연출 시간 (확성기와 같다) */
const LEAVE_MS = 450;
/** 떠 있는 시간 */
export const OVER_LEVEL_SPOT_MS = 6_000;

/**
 * 11/19 적정 레벨을 넘은 사냥터·적정 층보다 낮은 야근 빌딩 층에서 시작하면 판 처음에 확성기처럼 크게 띄우는 경고 (사용자).
 * 확성기 한마디(MegaphoneSpotlight)와 같은 모양, 전체 확성기처럼 붉게. 포인터는 통과한다
 */
export default function OverLevelSpot({ until, title, text }: { until: number; title: string; text: string }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), Math.max(0, until - Date.now() - LEAVE_MS));
    const b = setTimeout(() => setGone(true), Math.max(0, until - Date.now()));
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [until]);
  if (gone) return null;
  return (
    <div className={cx(styles.layer, own.layer)} aria-hidden={leaving || undefined}>
      <div className={cx(styles.spot, styles.all, leaving && styles.leaving)} role="alert">
        <div className={styles.head}>
          <span className={styles.horn} aria-hidden="true">
            <PixelIcon name="megaphone" size={21} />
          </span>
          <span className={styles.tag}>경고</span>
        </div>
        <p className={styles.text}>{title}</p>
        <p className={styles.name}>{text}</p>
      </div>
    </div>
  );
}
