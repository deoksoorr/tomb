"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { CALENDAR_BACK_MONTHS, shiftMonth } from "@/lib/calendar";
import { meStore } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { socialApi } from "@/lib/socialApi";
import type { CalendarResponse } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./CalendarDialog.module.css";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 이번 달 달력을 받으면 HUD 빨간 점(내 정보의 출석 상태)도 같이 맞춘다 */
function syncAttendance(c: CalendarResponse): void {
  const me = meStore.getSnapshot().me;
  if (!me || c.month !== c.today.slice(0, 6)) return;
  const today = c.days[Number(c.today.slice(6)) - 1]?.state === "stamped";
  meStore.set({ ...me, attendance: { ...me.attendance, today, streak: c.streak, stayMinutes: c.stayMinutes } });
}
const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(4))}월`;

/**
 * 10번 출석 달력: 한 달을 보여 주고 오늘 칸을 눌러 받는다. 받은 날은 도장, 못 받고 지난 날은 회색.
 * 조건은 그날 1시간 머물기 (서버가 머무르기 기록으로 판정). 7일 연속 보너스, 한 달 개근 보상.
 */
export default function CalendarDialog({ onClose }: { onClose: () => void }) {
  const [cal, setCal] = useState<CalendarResponse | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [stampedNow, setStampedNow] = useState(false);

  useEffect(() => {
    let alive = true;
    socialApi.calendar(month ?? undefined).then(
      (c) => {
        if (!alive) return;
        setCal(c);
        setCurrent((cur) => cur ?? c.today.slice(0, 6));
        syncAttendance(c);
        setError(null);
      },
      (e: unknown) => alive && setError(errorMessage(e)),
    );
    return () => {
      alive = false;
    };
  }, [month]);

  async function claim() {
    if (!cal) return;
    if (!cal.claimable) {
      setNotice(`오늘 ${cal.needMinutes}분을 머물면 받을 수 있어요. (지금 ${cal.stayMinutes}분)`);
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const res = await socialApi.claimCalendar();
      meStore.set(res.me);
      setCal(res.calendar);
      setStampedNow(true);
      const { daily, streak, monthly } = res.earned;
      const parts = [daily ? `출석 +${daily}P` : "도장만 찍었어요 (같은 와이파이에서 받은 계정이 많아요)"];
      if (streak) parts.push(`${res.calendar.rewards.streakEvery}일 연속 +${streak}P`);
      if (monthly) parts.push(`한 달 개근 +${monthly}P`);
      const msg = parts.join(" · ");
      setNotice(msg);
      showToast(`출석 도장 꾹! ${msg}`, 5_000);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const viewing = cal?.month ?? month;
  const canPrev = !!(current && viewing && viewing > shiftMonth(current, -CALENDAR_BACK_MONTHS));
  const canNext = !!(current && viewing && viewing < current);
  const stamped = cal?.days.filter((d) => d.state === "stamped").length ?? 0;
  const isCurrent = !!cal && cal.month === cal.today.slice(0, 6);
  const todayCell = isCurrent ? cal.days[Number(cal.today.slice(6)) - 1] : null;
  const stay = cal ? Math.min(cal.stayMinutes, cal.needMinutes) : 0;

  return (
    <Dialog title="출석 달력" onClose={onClose}>
      <div className={styles.wrap}>
        {error && !cal && <p className={ui.error}>{error}</p>}
        {!cal && !error && <p className={ui.hint}>불러오는 중…</p>}
        {cal && (
          <>
            <section className={styles.summary} aria-label="오늘">
              <div className={styles.stay}>
                <span className={styles.stayLabel}>
                  오늘 머문 시간 <b>{stay}</b>/{cal.needMinutes}분
                </span>
                <span className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={cal.needMinutes} aria-valuenow={stay}>
                  <span style={{ width: `${(stay / cal.needMinutes) * 100}%` }} />
                </span>
              </div>
              <p className={styles.status}>
                {todayCell?.state === "stamped"
                  ? "오늘 도장은 받았어요. 내일 또 만나요!"
                  : cal.claimable
                    ? "오늘 칸을 눌러 도장을 받으세요!"
                    : "묘지에 1시간 머물면 오늘 칸을 받을 수 있어요. (다른 일을 해도 괜찮아요)"}
              </p>
              <p className={styles.streak}>
                연속 출석 <b>{cal.streak}</b>일
              </p>
            </section>

            <div className={styles.nav}>
              <button
                type="button"
                className={cx(ui.button, ui.icon)}
                disabled={!canPrev}
                onClick={() => setMonth(shiftMonth(viewing!, -1))}
                aria-label="지난달"
              >
                ◀
              </button>
              <h3 className={styles.month}>{monthLabel(cal.month)}</h3>
              <button
                type="button"
                className={cx(ui.button, ui.icon)}
                disabled={!canNext}
                onClick={() => setMonth(shiftMonth(viewing!, 1))}
                aria-label="다음 달"
              >
                ▶
              </button>
            </div>

            <div className={styles.grid} role="grid" aria-label={`${monthLabel(cal.month)} 출석`}>
              {WEEK.map((w, i) => (
                <span key={w} className={cx(styles.week, i === 0 && styles.sun, i === 6 && styles.sat)} role="columnheader">
                  {w}
                </span>
              ))}
              {Array.from({ length: cal.firstWeekday }, (_, i) => (
                <span key={`b${i}`} aria-hidden="true" />
              ))}
              {cal.days.map((d) => {
                const label = `${d.day}일`;
                if (d.state === "today")
                  return (
                    <button
                      key={d.day}
                      type="button"
                      className={cx(styles.cell, styles.today, cal.claimable && styles.ready)}
                      onClick={() => void claim()}
                      disabled={pending}
                      aria-label={cal.claimable ? `${label} 오늘 — 도장 받기` : `${label} 오늘 — ${cal.stayMinutes}/${cal.needMinutes}분 머묾`}
                    >
                      <span className={styles.num}>{d.day}</span>
                      <span className={styles.cellNote}>{cal.claimable ? "받기!" : `${cal.stayMinutes}분`}</span>
                      {cal.claimable && <span className={styles.redDot} aria-hidden="true" />}
                    </button>
                  );
                return (
                  <span
                    key={d.day}
                    role="gridcell"
                    className={cx(styles.cell, styles[d.state], stampedNow && d === todayCell && styles.fresh)}
                    aria-label={`${label} ${d.state === "stamped" ? "출석" : d.state === "missed" ? "결석" : ""}`}
                  >
                    <span className={styles.num}>{d.day}</span>
                    {d.state === "stamped" && (
                      <span className={styles.stamp} aria-hidden="true">
                        출석
                      </span>
                    )}
                    {d.state === "stamped" && d.points > 0 && <span className={styles.cellNote}>+{d.points}</span>}
                  </span>
                );
              })}
            </div>

            <ul className={styles.rewards} aria-label="보상">
              <li>
                <span>매일 도장</span>
                <b>+{cal.rewards.daily}P</b>
              </li>
              <li>
                <span>{cal.rewards.streakEvery}일 연속마다</span>
                <b>+{cal.rewards.streak}P</b>
              </li>
              <li className={cx(cal.monthBonus !== null && styles.done)}>
                <span>
                  한 달 개근 ({stamped}/{cal.days.length}일)
                </span>
                <b>{cal.monthBonus !== null ? "받았어요" : `+${cal.rewards.monthly}P`}</b>
              </li>
            </ul>
            <p className={ui.hint}>날짜는 한국 시간 자정에 바뀌어요. 머문 시간은 10분마다 쌓여요.</p>
          </>
        )}
        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}
