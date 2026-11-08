"use client";

import { useEffect } from "react";
import styles from "./error.module.css";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.page}>
      <p className={styles.title}>잠시 길을 잃었어요.</p>
      <p className={styles.body}>묘지에 바람이 세게 불었나 봐요. 다시 들어가 볼까요?</p>
      <button type="button" className={styles.retry} onClick={() => retry()}>
        다시 시도하기
      </button>
    </main>
  );
}
