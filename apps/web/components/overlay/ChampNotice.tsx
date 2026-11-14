"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { CHAMP_POLL_MS, champRecheckDelay } from "@/lib/champClock";
import { CHAMP_TITLE, champHatOf, itemName, type ChampBoard } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { restoreLook, wearStashed } from "../account/actions";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import styles from "./ChampNotice.module.css";

/**
 * 주간 랭킹 1위 알림 창 (본인에게 한 번) + 접속 중 1위 상태 지키기.
 *  - 확인 시점: 처음 마을에 들어올 때 · 월요일 새벽 5시(한국 시간) 마감 직후 0~20초 흩뜨려 · 서버의 "내 정보 새로 받기" 신호(me:stale — 지급 직후 서버가 보낸다)
 *    · 화면이 보이는 동안 몇 분마다 · 다시 화면으로 돌아올 때 (모두 가벼운 /api/champ/me)
 *  - 1위 값이 바뀌면(새로 1위·자격 끝·관리자 다시 지급·시험 지급) 내 정보와 착용 증서를 새로 받아 실시간 서버로 다시 보낸다 →
 *    새로고침 없이 내 화면·다른 사람 화면에 모자(가방)·배지·전용 오라가 붙거나 떨어진다
 *  - 아직 안 본 1위 알림이 있으면 그 자리에서 띄운다. 받은 것(전용 모자 대여·전용 오라·배지·포인트)을 보여 주고 [써 보기]로 모자를 바로 입는다.
 *    닫으면 그 주(시험 지급은 그 지급) 알림은 다시 안 뜬다
 */
export default function ChampNotice() {
  const { me } = useMe();
  const ready = !!me;
  const [notice, setNotice] = useState<{ week: string; boards: ChampBoard[]; points: number; test?: true } | null>(null);
  const [pending, setPending] = useState(false);
  /** 마지막으로 화면에 반영한 1위 값 (처음엔 내 정보의 값) */
  const known = useRef<number | null>(null);
  /** 이 화면에서 이미 닫은 알림 (봤음 저장이 서버에 닿기 전에 다시 확인해도 또 띄우지 않게) */
  const dismissed = useRef(new Set<string>());
  const firstBits = me?.champ ?? 0;

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let busy = false;
    let again = false;
    if (known.current === null) known.current = firstBits;
    const check = async (): Promise<void> => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const r = await api.champMe();
        if (!alive) return;
        if (r.bits !== known.current) {
          known.current = r.bits;
          // 가방(빌려 받은 모자)·포인트, 그리고 배지·전용 오라를 실은 착용 증서 → 내 아바타·같은 채널 사람들
          await Promise.all([meStore.refresh(), restoreLook()]);
        }
        if (r.unseen && !dismissed.current.has(r.unseen.week)) {
          const u = r.unseen;
          setNotice((cur) => cur ?? { ...u, points: r.points });
        }
      } catch {
        // 다음 확인 때 다시
      } finally {
        busy = false;
        if (again && alive) {
          again = false;
          void check();
        }
      }
    };
    void check();
    // 월요일 새벽 5시 마감 직후 (흩뜨려서), 그다음 주도 이어서
    let weekly: ReturnType<typeof setTimeout>;
    const arm = () => {
      weekly = setTimeout(() => {
        void check();
        arm();
      }, champRecheckDelay(Date.now(), Math.random()));
    };
    arm();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, CHAMP_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    const offStale = bridge.on("me:stale", () => void check());
    return () => {
      alive = false;
      clearTimeout(weekly);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      offStale();
    };
    // 처음 값(firstBits)은 시작할 때만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!notice) return null;
  const close = () => {
    dismissed.current.add(notice.week);
    void api.champSeen(notice.week).catch(() => undefined);
    setNotice(null);
  };
  const n = notice.boards.length;
  const title = `${notice.test ? "[시험] " : ""}${n > 1 ? `지난주 ${n}관왕!` : `지난주 ${CHAMP_TITLE[notice.boards[0]]}!`}`;
  // 다관왕은 다관왕 전용 모자 하나
  const hat = champHatOf(notice.boards);
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
          <li>
            <ItemIcon itemId={hat} size={32} />
            <span>
              <b>{itemName(hat)}</b>
              <span className={styles.note}>다음 발표(월요일 새벽 5시)까지 · 가방 [레이스 보상]에 들어 있어요</span>
            </span>
          </li>
          <li>
            <span className={styles.sparkle} aria-hidden="true">
              ✦
            </span>
            <span>
              <b>전용 오라 · 이름표 배지</b>
              <span className={styles.note}>{n > 1 ? `이번 주 ${n}관왕 전용 오라 하나로` : "이번 주 동안 자동으로"} · 가방 [레이스 보상]에서 오라를 끌 수 있어요</span>
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
            써 보기
          </button>
          <button type="button" className={ui.button} onClick={close}>
            확인
          </button>
        </div>
      </div>
    </Dialog>
  );
}
