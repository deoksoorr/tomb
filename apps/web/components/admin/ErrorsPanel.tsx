"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import { Empty, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  /** 11/27 확인을 마쳤다 (메뉴 배지·대시보드 「오늘 새 오류」를 0으로) */
  onSeen?: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * 오류 탭: 같은 오류는 묶어서 횟수·마지막 시각, 펼치면 URL·스택.
 * 11/27 이 탭을 열면 보이는 오류를 확인한 것으로 남긴다 (메뉴 배지가 0이 된다). 지난 확인 뒤에 또 난 묶음은 이번 화면에서 「새」로 보인다
 */
export default function ErrorsPanel({ toast, onAuthLost, onSeen }: Props) {
  const [days, setDays] = useState(7);
  const [version, setVersion] = useState(0);
  const load = usePanelLoad(() => adminApi.errors(days), [days, version], toast, onAuthLost);
  const data = load.data;

  // 받은 목록의 가장 늦은 시각까지 확인 (그 사이 새로 난 오류는 다음에 또 센다)
  const upTo = data?.errors.reduce((m, e) => Math.max(m, e.lastAt), 0) ?? 0;
  const needMark = !!data && upTo > data.seenAt;
  useEffect(() => {
    if (!data) return;
    if (!needMark) {
      onSeen?.();
      return;
    }
    let alive = true;
    adminApi.errorsSeen(upTo).then(
      () => alive && onSeen?.(),
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
        else toast(errorMessage(e));
      },
    );
    return () => {
      alive = false;
    };
    // 목록을 새로 받을 때마다 한 번 (콜백이 바뀌어도 다시 보내지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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
        {data && data.seenAt > 0 && <span className={styles.meta}>지난 확인 {when(data.seenAt)}</span>}
        <button type="button" className={cx(ui.button, ui.quiet, styles.toolbarEnd)} onClick={() => setVersion((v) => v + 1)}>
          새로고침
        </button>
      </div>
      <LoadState {...load} />
      {data && !data.errors.length && <Empty>이 기간에 모인 오류가 없어요.</Empty>}
      <ul className={styles.list}>
        {data?.errors.map((e) => (
          <li key={e.hash} className={styles.notice}>
            <div className={styles.noticeTitle}>
              {e.lastAt > (data?.seenAt ?? 0) && <span className={cx(styles.badge, styles.badgeWarn)}>새</span>}
              <span className={cx(styles.badge, e.source === "server" ? styles.badgeHidden : styles.badgeOpen)}>
                {e.source === "server" ? "서버" : e.kind}
              </span>
              <strong className={styles.alert}>{e.count.toLocaleString("ko-KR")}회</strong>
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
