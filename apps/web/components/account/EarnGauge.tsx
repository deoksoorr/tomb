"use client";

import { useEffect, useState } from "react";
import { champBoards } from "@tomb/protocol";
import { earnGaugeRows, resetLeftText, type Gauge, type GaugeRow } from "@/lib/earnGauge";
import { DAY_RESET_TEXT, msUntilDayReset } from "@/lib/gameDay";
import { NO_BOOST } from "@/lib/pointEvent";
import type { Me } from "@/lib/types";
import styles from "./EarnGauge.module.css";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 내 정보: 오늘 받은 포인트 게이지 (하루 전체 한도 1개 + 항목별). 한도 값은 lib/economy.ts EARN_RULES */
export default function EarnGauge({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  // 다음 초기화까지 남은 시간 (1분마다 다시 센다. 렌더 중에 시계를 읽지 않는다)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 포인트 배수 이벤트 날은 고른 항목 한도가 늘어난 값으로 (서버가 me.earnBoost로 알려 준다)
  const boost = me.earnBoost ?? NO_BOOST;
  // 11/17 지난주 1위면 혜택 항목 한도 + (서버가 같은 계산으로 막는다 — lib/champPerks)
  const view = earnGaugeRows(me.todayEarned, me.earnedBy, boost, champBoards(me.champ));
  const { total, main, rest } = view;
  // 운영자 계정은 출석 도장·접속 시간 보너스(7일 연속·한 달 개근 포함)를 받지 않는다 → 따로 세는 줄을 뺀다
  const separate = me.staff ? [] : view.separate;
  const hidden = rest.length + separate.length;

  return (
    <section className={styles.box} aria-label="오늘 받은 포인트" data-full={total.full || undefined}>
      <div className={styles.head}>
        <h3 className={styles.title}>오늘 받은 포인트</h3>
        <span className={styles.totalNums}>
          <b>{fmt(total.earned)}</b> / {fmt(total.max)}
        </span>
      </div>
      <Bar g={total} big label="오늘 받은 포인트" />
      {total.extra > 0 && <p className={styles.extra}>이벤트로 {fmt(total.extra)}P 더 받았어요</p>}
      <p className={styles.note}>
        {boost.caps.length > 0 ? `포인트 ${boost.mult}배 이벤트 중에는 표시한 항목의 한도도 ${boost.mult}배예요. ` : ""}
        {total.full ? "오늘 한도를 다 채웠어요. " : ""}한도는 한국 시간 {DAY_RESET_TEXT}에 새로 시작해요. 다음 초기화까지 <span className={styles.nowrap}>{resetLeftText(msUntilDayReset(now))}</span> 남았어요.
      </p>

      <ul className={styles.list}>
        {main.map((r) => (
          <Row key={r.source} r={r} />
        ))}
      </ul>

      {open && (
        <>
          <ul className={styles.list}>
            {rest.map((r) => (
              <Row key={r.source} r={r} />
            ))}
          </ul>
          {separate.length > 0 && (
            <>
              <p className={styles.sepHead}>아래 보상은 하루 한도와 따로 세요.</p>
              <ul className={styles.list}>
                {separate.map((r) => (
                  <Row key={r.source} r={r} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {hidden > 0 && (
        <button type="button" className={styles.more} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "접기" : `나머지 ${hidden}개 보기`}
        </button>
      )}
    </section>
  );
}

/** 항목 한 줄 (운영자 「포인트 현황」도 같은 줄을 쓴다) */
export function Row({ r }: { r: GaugeRow }) {
  return (
    <li className={styles.row} data-full={r.full || undefined}>
      <span className={styles.label}>
        {r.label}
        {r.boosted && <span className={styles.boosted}>{r.boosted}배</span>}
        {r.champ ? <span className={styles.boosted}>1위 +{fmt(r.champ)}P</span> : null}
        {r.full && <span className={styles.done}>다 채웠어요</span>}
      </span>
      <span className={styles.nums}>
        {fmt(r.earned)} / {fmt(r.max)}
      </span>
      <Bar g={r} label={r.label} />
      {r.extra > 0 && <span className={styles.extra}>이벤트로 {fmt(r.extra)}P 더 받았어요</span>}
    </li>
  );
}

export function Bar({ g, big, label }: { g: Gauge; big?: boolean; label: string }) {
  return (
    <span
      className={big ? styles.bigBar : styles.bar}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={g.max}
      aria-valuenow={g.value}
    >
      <span style={{ width: `${(g.ratio * 100).toFixed(1)}%` }} />
    </span>
  );
}
