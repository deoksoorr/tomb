"use client";

import { useState } from "react";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const pad = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 오류 탭: 같은 오류는 묶어서 횟수·마지막 시각, 펼치면 URL·스택 */
export default function ErrorsPanel({ toast, onAuthLost }: Props) {
  const [days, setDays] = useState(7);
  const [version, setVersion] = useState(0);
  const data = usePanelData(() => adminApi.errors(days), [days, version], toast, onAuthLost);

  return (
    <section className={styles.notices} aria-label="오류">
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="기간">
          {[1, 7, 14].map((d) => (
            <button key={d} type="button" className={ui.button} aria-pressed={days === d} onClick={() => setDays(d)}>
              {d === 1 ? "오늘" : `${d}일`}
            </button>
          ))}
        </div>
        <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setVersion((v) => v + 1)}>
          새로고침
        </button>
      </div>
      {!data && <p className={styles.empty}>불러오는 중…</p>}
      {data && !data.errors.length && <p className={styles.empty}>이 기간에 모인 오류가 없어요.</p>}
      <ul className={styles.list}>
        {data?.errors.map((e) => (
          <li key={e.hash} className={styles.notice}>
            <div className={styles.noticeTitle}>
              <span className={cx(styles.badge, e.source === "server" ? styles.badgeHidden : styles.badgeOpen)}>
                {e.source === "server" ? "서버" : e.kind}
              </span>
              <strong className={styles.alert}>{e.count}회</strong>
              <span className={styles.meta}>
                마지막 {when(e.lastAt)}
                {e.days > 1 && ` · ${e.days}일에 걸쳐`}
              </span>
            </div>
            <p className={styles.noticeBody}>{e.message}</p>
            <details>
              <summary className={styles.meta}>자세히</summary>
              <p className={styles.meta}>URL: {e.url}</p>
              {e.ua && <p className={styles.meta}>UA: {e.ua}</p>}
              {e.stack && <pre className={styles.stack}>{e.stack}</pre>}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
