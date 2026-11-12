"use client";

import { useEffect, useState } from "react";
import type { MegaphoneEntry } from "@/lib/types";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import styles from "./MegaphoneSpotlight.module.css";

/** 내려가기 전 사라지는 연출 시간 */
const LEAVE_MS = 450;

/**
 * 23번 확성기 한마디를 화면 가운데에 크게 (몇 초간). 여러 개가 오면 스토어가 차례로 넘겨준다.
 * 게임 조작을 막지 않게 포인터는 통과시킨다 (신고는 왼쪽 위 기록에서).
 */
export default function MegaphoneSpotlight({ entry, until }: { entry: MegaphoneEntry | null; until: number }) {
  if (!entry) return null;
  return <Spot key={entry.id} entry={entry} until={until} />;
}

function Spot({ entry, until }: { entry: MegaphoneEntry; until: number }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), Math.max(0, until - Date.now() - LEAVE_MS));
    return () => clearTimeout(t);
  }, [until]);

  const all = entry.scope === "all";
  return (
    <div className={styles.layer} aria-hidden={leaving || undefined}>
      <div className={cx(styles.spot, all && styles.all, leaving && styles.leaving)} role="status" aria-live="polite">
        <div className={styles.head}>
          <span className={styles.horn} aria-hidden="true">
            <PixelIcon name="megaphone" size={21} />
          </span>
          <span className={styles.tag}>{all ? "전체 확성기" : `${entry.ch}채널 확성기`}</span>
        </div>
        <p className={styles.name}>{entry.name}</p>
        <p className={styles.text}>{entry.text}</p>
      </div>
    </div>
  );
}
