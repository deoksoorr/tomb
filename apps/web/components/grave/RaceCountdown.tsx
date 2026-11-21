"use client";

import { useEffect, useState } from "react";
import { raceClock, raceTickMs } from "@/lib/raceClock";
import { cx } from "../ui/cx";
import s from "./RaceCountdown.module.css";

// 11/20 이번 레이스 남은 시간 · 다음 레이스 시작 (레이스 창 두 탭·등대 입장 창). 1분마다, 1시간 아래는 1초마다
// 11/22 weekOf: 회장님 독대 탭·입장 창은 chairWeek (첫 주가 11/30 05:00까지)

type Props = { className?: string; compact?: boolean; weekOf?: (now: number) => string };

export default function RaceCountdown({ className, compact = false, weekOf }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), raceTickMs(now, weekOf));
    return () => clearTimeout(t);
  }, [now, weekOf]);
  const c = raceClock(now, weekOf);
  return (
    <p className={cx(s.clock, className)} data-compact={compact || undefined} data-testid="race-clock">
      <span className={s.end}>
        <span aria-hidden="true">⏳ </span>이번 레이스는 <b>{c.left}</b> 뒤에 끝나요
      </span>
      <span className={s.next}>{c.nextLine}</span>
    </p>
  );
}
