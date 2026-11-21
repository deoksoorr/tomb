"use client";

import { useState } from "react";
import type { AdminUserStats, StatSection } from "@/lib/adminUserStats";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import us from "./UserStats.module.css";
import { opsAdminApi } from "./opsAdminApi";
import { LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = {
  accountId: string;
  /** 목록에서 보이던 이름 (불러오기 전 제목) */
  name: string | null;
  toast: (message: string) => void;
  onAuthLost: () => void;
  onClose: () => void;
  /** 회원 목록 탭에서 이 계정 찾기 */
  onFindMember: (accountId: string) => void;
};

/** 11/20 유저 활동 → 유저 상세: 지금까지의 수치를 묶음별로 (서버가 30초 기억, [다시 읽기]로 바로) */
export default function UserStatsDialog({ accountId, name, toast, onAuthLost, onClose, onFindMember }: Props) {
  const [fresh, setFresh] = useState(0);
  const load = usePanelLoad(() => opsAdminApi.userStats(accountId, fresh > 0), [accountId, fresh], toast, onAuthLost);
  const d = load.data;
  return (
    <Dialog title={`${d?.name ?? name ?? "이름 없음"} 상세`} onClose={onClose} className={us.dialog}>
      <div className={us.top}>
        <span className={styles.meta}>{accountId}</span>
        <div className={us.actions}>
          <button type="button" className={cx(ui.button, ui.small)} onClick={() => setFresh((n) => n + 1)}>
            다시 읽기
          </button>
          <button type="button" className={cx(ui.button, ui.small)} onClick={() => onFindMember(accountId)}>
            회원 목록에서 찾기
          </button>
        </div>
      </div>
      {d ? <Body d={d} /> : <LoadState data={null} error={load.error} retry={load.retry} />}
    </Dialog>
  );
}

function Body({ d }: { d: AdminUserStats }) {
  return (
    <div className={us.body}>
      {d.sections.map((s) => (
        <Section key={s.id} s={s} />
      ))}
    </div>
  );
}

function Section({ s }: { s: StatSection }) {
  return (
    <section className={us.section} aria-label={s.title}>
      <h3 className={us.title}>{s.title}</h3>
      {s.note && <p className={us.note}>{s.note}</p>}
      <dl className={us.grid}>
        {s.rows.map((r) => (
          <div key={r.label} className={us.cell}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
            {r.note && <dd className={us.cellNote}>{r.note}</dd>}
          </div>
        ))}
      </dl>
      {s.table && s.table.rows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {s.table.head.map((h, i) => (
                  <th key={h} scope="col" className={s.table!.num.includes(i) ? styles.num : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((v, i) => (
                    <td key={i} className={cx(s.table!.num.includes(i) && styles.num, styles.nowrap)}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
