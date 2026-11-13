"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { stayBonusState } from "@/lib/stayBonus";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./StayBonus.module.css";

const TICK_MS = 10 * 60_000; // 머무르기 기록 1번 = 10분

/**
 * 접속 시간 보너스 작은 창 (오른쪽 아래, 마을에서만). 30분 머물 때마다 생긴 보너스를 [받기]로 받는다.
 * 판정·지급은 서버(/api/me/stay-bonus)가 머무르기 기록으로 한다. 여기서는 내 정보(me)의 머문 시간·받은 구간으로 보여 주기만.
 * 다음 구간까지 남은 시간은 마지막 기록이 쌓인 때부터 이 화면 시계로 어림한다 (표시용).
 */
export default function StayBonus() {
  const { me } = useMe();
  const ticks = me ? Math.floor(me.attendance.stayMinutes / 10) : 0;
  const claimed = me?.attendance.bonusClaimed ?? 0;
  const state = stayBonusState(ticks, claimed);
  const [pending, setPending] = useState(false);
  const [pop, setPop] = useState<string | null>(null);
  // 받은 뒤 잠깐 보여 줄 안내 (done: 오늘 하루치를 다 받음). 시간이 지나면 지우고 창을 숨긴다
  const [notice, setNotice] = useState<{ text: string; done: boolean } | null>(null);
  // 머문 기록이 바뀐 시각부터 흐른 시간 (남은 시간 어림용)
  const [clock, setClock] = useState<{ ticks: number; at: number; now: number } | null>(null);

  useEffect(() => {
    const at = Date.now();
    const update = () => setClock({ ticks, at, now: Date.now() });
    const first = setTimeout(update, 0);
    const timer = setInterval(update, 20_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [ticks]);

  if (!me || (state.count === 0 && !notice && !pop)) return null;

  const elapsed = clock && clock.ticks === ticks ? clock.now - clock.at : 0;
  const nextMin = state.ticksToNext === null ? null : Math.max(1, Math.ceil((state.ticksToNext * TICK_MS - elapsed) / 60_000));

  async function claim() {
    setPending(true);
    try {
      const res = await api.stayBonus();
      meStore.set(res.me);
      if (res.earned > 0) {
        setPop(`+${res.earned}P`);
        setTimeout(() => setPop(null), 1_400);
      }
      // 보너스는 하루 전체 한도(800P)와 별개라 0P는 지갑이 가득 찼을 때뿐 (운영자 계정은 지갑이 늘 가득 차 있다)
      const text =
        res.earned > 0
          ? `+${res.earned}P 받았어요 (보너스 ${res.count}개)`
          : res.me.staff
            ? `운영자 계정은 포인트가 늘 가득이라 0P (보너스 ${res.count}개)`
            : `지갑이 가득 차서 0P (보너스 ${res.count}개)`;
      const done = stayBonusState(Math.floor(res.me.attendance.stayMinutes / 10), res.me.attendance.bonusClaimed).done;
      setNotice({ text, done });
      setTimeout(() => setNotice(null), done ? 4_000 : 2_500);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className={cx(styles.box, ui.panel)} aria-live="polite" aria-label="접속 시간 보너스">
      {pop && (
        <span className={styles.pop} aria-hidden="true">
          {pop}
        </span>
      )}
      {state.count > 0 ? (
        <>
          <div className={styles.row}>
            <span className={styles.label}>
              접속 보너스 <b className={styles.points}>+{state.points}P</b>
            </span>
            <button type="button" className={cx(ui.button, ui.primary, styles.claim)} disabled={pending} onClick={claim}>
              받기
            </button>
          </div>
          <small className={styles.hint}>{nextMin === null ? "오늘 마지막 보너스예요" : `다음 보너스까지 약 ${nextMin}분`}</small>
        </>
      ) : (
        <>
          <span className={styles.label}>{notice?.text ?? "보너스 받았어요"}</span>
          {notice?.done && <small className={styles.hint}>오늘 보너스 끝! 내일 또 만나요</small>}
        </>
      )}
    </aside>
  );
}
