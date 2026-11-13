"use client";

import { useState } from "react";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { BanDialog, BanList } from "./BanPanel";

type Props = { toast: (message: string) => void; onAuthLost: () => void; version: number; onChanged: () => void };

/** 정지·차단 기록: 목록(진행 중 / 전체, 기간 수정·조기 해제·처리 기록) + 계정 없이 IP로 바로 차단 */
export default function BansPanel({ toast, onAuthLost, version, onChanged }: Props) {
  const [own, setOwn] = useState(0);
  const [ipOnly, setIpOnly] = useState(false);
  const changed = () => {
    setOwn((v) => v + 1);
    onChanged();
  };

  return (
    <section className={styles.notices} aria-label="정지·차단 기록">
      <div className={styles.noticesHead}>
        <p className={ui.hint}>계정 정지는 「회원 제재」 목록이나 「신고」의 [정지로 이동]에서 걸어요. 기간이 지나면 자동으로 풀려요.</p>
        <button type="button" className={cx(ui.button, ui.danger)} onClick={() => setIpOnly(true)}>
          IP로 바로 차단
        </button>
      </div>
      <BanList toast={toast} onAuthLost={onAuthLost} version={version + own} onChanged={changed} />
      {ipOnly && (
        <BanDialog
          target={{}}
          toast={toast}
          onAuthLost={onAuthLost}
          onClose={() => setIpOnly(false)}
          onDone={() => {
            setIpOnly(false);
            changed();
          }}
        />
      )}
    </section>
  );
}
