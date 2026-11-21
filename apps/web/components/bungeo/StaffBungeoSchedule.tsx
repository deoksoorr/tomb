"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { bungeoApi } from "@/lib/bungeo/client";
import type { BungeoSchedule } from "@/lib/bungeo/service";
import ui from "../ui/ui.module.css";

// 11/22 운영자 전용: 골목 붕어빵 수레 다음 출현 일정 (게임 안 「유저」 창 — 운영자 계정만 보는 칸).
// 서버도 운영자 계정이 아니면 403 (GET /api/bungeo/schedule). 일반 계정 화면·응답에는 일정이 실리지 않는다

const kst = (ms: number) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(ms);

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
    <section aria-label="붕어빵 수레 일정 (운영자 전용)" style={{ marginTop: 12 }}>
      <p className={ui.hint} style={{ fontWeight: 700 }}>
        골목 붕어빵 수레 (운영자만 보여요){data ? (data.open ? " · 지금 열려 있어요" : " · 지금은 닫혀 있어요") : ""}
      </p>
      {error && <p className={ui.error}>{error}</p>}
      {data && (
        <ol style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          {data.next.length === 0 && <li>남은 일정이 없어요 (2/28까지).</li>}
          {data.next.map((s) => (
            <li key={s.day}>
              {kst(s.opensAt)} ~ {kst(s.closesAt)}
              {data.now >= s.opensAt && data.now < s.closesAt ? " (지금)" : ""}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
