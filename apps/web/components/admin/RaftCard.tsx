"use client";

import { useEffect, useState } from "react";
import type { AdminRaftsResponse } from "@/app/api/admin/rafts/route";
import { errorMessage, request } from "@/lib/api";
import { fullTime } from "./memberFormat";
import ops from "./Ops.module.css";

/** 11/27 「지금 접속자」 아래 작은 칸: 채널마다 지금 좌대 입장권 주인 (부모가 새로고침할 때 key를 바꿔 다시 부른다) */
export default function RaftCard() {
  const [r, setR] = useState<AdminRaftsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    request<AdminRaftsResponse>("/api/admin/rafts", { cache: "no-store" }).then(
      (x) => live && setR(x),
      (e) => live && setError(errorMessage(e)),
    );
    return () => {
      live = false;
    };
  }, []);
  const left = (until: number) => Math.max(0, Math.round((until - (r?.at ?? Date.now())) / 60_000));
  return (
    <div className={ops.statCard}>
      <h3 className={ops.statTitle}>좌대 사용 현황</h3>
      {error ? (
        <p className={ops.muted}>{error}</p>
      ) : !r ? (
        <p className={ops.muted}>불러오는 중…</p>
      ) : r.rows.length === 0 ? (
        <p className={ops.muted}>지금 쓰는 좌대가 없어요.</p>
      ) : (
        <ul className={ops.bars} aria-label="좌대 사용 현황">
          {r.rows.map((h) => (
            <li key={`${h.ch}:${h.n}`} className={ops.barItem} title={`${fullTime(h.start)}에 삼 · 연장 ${h.renews}번 · ${h.acct}`}>
              <span className={ops.barName}>
                {h.ch}채널 {h.n}번
              </span>
              <span className={ops.sub}>{h.name || "이름 없음"}</span>
              <span className={ops.barCount}>{left(h.until)}분 남음</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
