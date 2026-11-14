"use client";

import { useEffect, useState } from "react";
import { CHAMP_HAT, CHAMP_TITLE, itemName, type ChampBoard } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { wearStashed } from "../account/actions";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import styles from "./ChampNotice.module.css";

/**
 * 주간 랭킹 1위 알림 창 (본인에게 한 번): 마을에 들어와 지난주 1위 보상을 받았으면 띄운다.
 * 받은 것(전용 모자 대여·1위 오라·배지·포인트)을 보여 주고 [써 보기]로 모자를 바로 입는다. 닫으면 그 주 알림은 다시 안 뜬다
 */
export default function ChampNotice() {
  const { me } = useMe();
  const ready = !!me;
  const [notice, setNotice] = useState<{ week: string; boards: ChampBoard[]; points: number } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    api
      .champ()
      .then((r) => alive && r.mine?.unseen && setNotice({ ...r.mine.unseen, points: r.points }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ready]);

  if (!notice) return null;
  const close = () => {
    void api.champSeen(notice.week).catch(() => undefined);
    setNotice(null);
  };
  const n = notice.boards.length;
  const title = n > 1 ? `지난주 ${n}관왕!` : `지난주 ${CHAMP_TITLE[notice.boards[0]]}!`;
  const hat = CHAMP_HAT[notice.boards[0]];
  const tryOn = async () => {
    setPending(true);
    try {
      await wearStashed(hat);
      showToast(`${itemName(hat)}을(를) 썼어요!`);
      close();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog kind="confirm" title={title} onClose={close}>
      <div className={styles.body}>
        <p className={styles.lead}>
          <span className={styles.crown} aria-hidden="true">
            👑
          </span>
          {n > 1 ? `${notice.boards.map((b) => CHAMP_TITLE[b]).join("·")} — 축하해요!` : "축하해요! 이번 주 동안 1위 보상을 누려요."}
        </p>
        <ul className={styles.list}>
          {notice.boards.map((b) => (
            <li key={b}>
              <ItemIcon itemId={CHAMP_HAT[b]} size={32} />
              <span>
                <b>{itemName(CHAMP_HAT[b])}</b>
                <span className={styles.note}>다음 1위가 정해질 때까지 · 가방 코디에 들어 있어요</span>
              </span>
            </li>
          ))}
          <li>
            <span className={styles.sparkle} aria-hidden="true">
              ✦
            </span>
            <span>
              <b>1위 오라 · 이름표 배지</b>
              <span className={styles.note}>{n > 1 ? `이번 주 ${n}관왕 오라 하나로` : "이번 주 동안 자동으로"} · 코디 창에서 오라를 끌 수 있어요</span>
            </span>
          </li>
          <li>
            <span className={styles.sparkle} aria-hidden="true">
              P
            </span>
            <span>
              <b>+{(notice.points * n).toLocaleString("ko-KR")}P</b>
              <span className={styles.note}>지갑에 들어왔어요</span>
            </span>
          </li>
        </ul>
        <div className={styles.buttons}>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void tryOn()} disabled={pending}>
            {n > 1 ? `${itemName(hat)} 써 보기` : "써 보기"}
          </button>
          <button type="button" className={ui.button} onClick={close}>
            확인
          </button>
        </div>
      </div>
    </Dialog>
  );
}
