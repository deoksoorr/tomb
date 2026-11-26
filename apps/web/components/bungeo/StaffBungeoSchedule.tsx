"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { bungeoApi } from "@/lib/bungeo/client";
import type { BungeoSchedule } from "@/lib/bungeo/service";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./StaffBungeoSchedule.module.css";

// 11/22 운영자 전용: 골목 붕어빵 수레 다음 출현 일정 「날짜 - 자리」 (게임 안 「유저」 창 — 운영자 계정만 보는 칸).
// 서버도 운영자 계정이 아니면 403 (GET /api/bungeo/schedule). 일반 계정 화면·응답에는 일정이 실리지 않는다

/** 「11/22 (일) 22:00」 */
const kst = (ms: number) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms).map((x) => [x.type, x.value]),
  );
  return `${p.month}/${p.day} (${p.weekday}) ${p.hour}:${p.minute}`;
};
/** 닫는 시각은 시:분만 (늘 다음날 새벽) */
const kstTime = (ms: number) => kst(ms).split(" ").pop();
/** 운영자 일정에만 보이는 맵 이름 */
const MAP_NAME: Record<string, string> = { village: "마을", sea: "바닷가", camp: "캠핑장" };

export default function StaffBungeoSchedule() {
  const [data, setData] = useState<BungeoSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    bungeoApi
      .schedule()
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className={styles.card} aria-label="붕어빵 수레 일정 (운영자 전용)">
      <p className={styles.head}>
        골목 붕어빵 수레
        {data && <span className={cx(styles.state, data.open && styles.open)}>{data.open ? "지금 열려 있어요" : "지금은 닫혀 있어요"}</span>}
        <span className={styles.state}>· 운영자만 보여요</span>
      </p>
      {error && <p className={ui.error}>{error}</p>}
      {data && (
        <ul className={styles.slots}>
          {data.next.length === 0 && <li>올겨울 장사가 끝났어요. 남은 일정이 없어요.</li>}
          {data.next.map((s) => {
            const now = data.now >= s.opensAt && data.now < s.closesAt;
            return (
              <li key={s.day} className={cx(now && styles.now)}>
                {kst(s.opensAt)} ~ 다음날 {kstTime(s.closesAt)} - [{MAP_NAME[s.map] ?? s.map}] {s.spot}
                {now ? " (지금)" : ""}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
