"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/hooks/errorReporting";
import styles from "./error.module.css";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reportClientError("react", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <p className={styles.title}>잠시 길을 잃었어요.</p>
      <p className={styles.body}>문제가 생겨 화면을 그리지 못했어요. 다시 들어가 볼까요?</p>
      <button type="button" className={styles.retry} onClick={() => retry()}>
        다시 시도하기
      </button>
    </main>
  );
}
