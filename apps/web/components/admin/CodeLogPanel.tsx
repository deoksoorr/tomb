"use client";

import { adminApi } from "./adminApi";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { fullTime } from "./memberFormat";
import { Empty, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void; version: number };

/** 코드 재발급 기록: 누가·언제·누구의 접속 코드를 다시 만들었나 (최신 먼저, 코드 원문은 남기지 않는다) */
export default function CodeLogPanel({ toast, onAuthLost, version }: Props) {
  const load = usePanelLoad(() => adminApi.codeLog(), [version], toast, onAuthLost);
  const log = load.data?.log ?? null;

  return (
    <section className={styles.notices} aria-label="코드 재발급 기록">
      <p className={ui.hint}>재발급은 「회원 제재」 목록의 [코드 재발급]으로 해요. 새 코드 원문은 어디에도 남기지 않고, 처리자·대상만 기록해요.</p>
      <LoadState {...load} />
      {log && log.length === 0 && <Empty>아직 재발급한 적이 없어요.</Empty>}
      {log && log.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="코드 재발급 기록">
            <thead>
              <tr>
                <th scope="col">시각</th>
                <th scope="col">처리자</th>
                <th scope="col">대상</th>
                <th scope="col">계정 id</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => (
                <tr key={`${e.at}-${e.accountId}`}>
                  <td className={styles.nowrap}>
                    <time dateTime={new Date(e.at).toISOString()}>{fullTime(e.at)}</time>
                  </td>
                  <td>{e.by}</td>
                  <td>{e.name ?? "이름 없음"}</td>
                  <td>
                    <code className={styles.meta}>{e.accountId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
