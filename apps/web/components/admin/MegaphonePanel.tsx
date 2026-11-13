"use client";

import { useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import social from "./SocialPanels.module.css";
import { socialAdminApi } from "./socialAdminApi";
import { Empty, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const pad = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 23번 확성기 탭: 최근 기록(최신 먼저 100개)과 숨기기·다시 보이기. 숨기면 유저 확성기 창에서 다음 갱신 때 빠진다 */
export default function MegaphonePanel({ toast, onAuthLost }: Props) {
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const load = usePanelLoad(() => socialAdminApi.megaphones(), [version], toast, onAuthLost);
  const data = load.data;

  async function setHidden(id: string, hidden: boolean) {
    setBusy(true);
    try {
      await socialAdminApi.hideMegaphone(id, hidden);
      toast(hidden ? "숨겼어요." : "다시 보이게 했어요.");
      setVersion((v) => v + 1);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      else toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={social.panel} aria-label="확성기 기록">
      <p className={ui.hint}>최근 확성기 100개. 문장은 금칙어·링크를 서버에서 거르고, 계정마다 30초에 한 번·하루 20번까지예요.</p>
      <LoadState {...load} />
      {data?.entries.length === 0 && <Empty>아직 확성기 기록이 없어요.</Empty>}
      {data && data.entries.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="확성기 기록">
            <thead>
              <tr>
                <th scope="col">때</th>
                <th scope="col">범위</th>
                <th scope="col">닉네임</th>
                <th scope="col">문장</th>
                <th scope="col">계정</th>
                <th scope="col" className={styles.num}>
                  처리
                </th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id} className={cx(e.hidden && social.hiddenRow)}>
                  <td className={styles.nowrap}>{when(e.at)}</td>
                  <td className={styles.nowrap}>{e.scope === "all" ? `전체 (${e.ch}채널에서)` : `${e.ch}채널`}</td>
                  <td>{e.name}</td>
                  <td className={social.noteCell}>{e.text}</td>
                  <td title={e.accountId}>{e.accountId.slice(0, 8)}…</td>
                  <td className={styles.num}>
                    <button type="button" className={cx(ui.button, ui.small, e.hidden ? undefined : ui.danger)} disabled={busy} onClick={() => void setHidden(e.id, !e.hidden)}>
                      {e.hidden ? "다시 보이기" : "숨기기"}
                    </button>
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
