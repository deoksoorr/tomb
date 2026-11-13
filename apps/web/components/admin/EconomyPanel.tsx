"use client";

import { useState } from "react";
import { EARN_RULES, ECON_STAFF_EXCLUDED_FROM } from "@/lib/economy";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import { LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const EARN_LABELS: Record<string, string> = {
  ...Object.fromEntries(EARN_RULES.map((r) => [r.source, r.label])),
  admin: "관리자 지급",
  gift: "관리자 선물",
  refund: "환불·되팔기",
  // 49번에서 없어진 항목 (지난 기록에만 남아 있다)
  revive: "살려주세요 (종료)",
  gotRevive: "살려주세요 받음 (종료)",
};
const SPEND_LABELS: Record<string, string> = {
  shop: "상점",
  rpg: "사냥터",
  housing: "하우징",
  name: "닉네임 변경",
  admin: "관리자 회수",
  other: "기타",
};

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const fmt = (n: number) => n.toLocaleString("ko-KR");
const dateLabel = (d: string) => `${Number(d.slice(4, 6))}.${d.slice(6)}`;
/** 운영자 제외 적용일 안내 ("11월 13일") */
const STAFF_FROM_LABEL = `${Number(ECON_STAFF_EXCLUDED_FROM.slice(4, 6))}월 ${Number(ECON_STAFF_EXCLUDED_FROM.slice(6))}일`;

function Bars({ title, totals, labels }: { title: string; totals: Record<string, number>; labels: Record<string, string> }) {
  const rows = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <span className={styles.meta}>합계 {fmt(sum(totals))}</span>
      </div>
      {!rows.length && <span className={ui.hint}>기록이 없어요.</span>}
      {rows.map(([k, v]) => (
        <div key={k} className={styles.barRow}>
          <span className={styles.barLabel}>{labels[k] ?? k}</span>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className={styles.barValue}>{fmt(v)}</span>
        </div>
      ))}
    </div>
  );
}

/** 경제 탭: 날짜별 적립·사용 합계, 항목별 막대, 지갑 잔액 합계·계정 수 */
export default function EconomyPanel({ toast, onAuthLost }: Props) {
  const [days, setDays] = useState(14);
  const load = usePanelLoad(() => adminApi.economy(days), [days], toast, onAuthLost);
  const data = load.data;
  const earnedTotal: Record<string, number> = {};
  const spentTotal: Record<string, number> = {};
  for (const d of data?.days ?? []) {
    for (const [k, v] of Object.entries(d.earned)) earnedTotal[k] = (earnedTotal[k] ?? 0) + v;
    for (const [k, v] of Object.entries(d.spent)) spentTotal[k] = (spentTotal[k] ?? 0) + v;
  }

  return (
    <section className={styles.notices} aria-label="경제">
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="기간">
          {[7, 14, 30].map((d) => (
            <button key={d} type="button" className={ui.button} aria-pressed={days === d} onClick={() => setDays(d)}>
              {d}일
            </button>
          ))}
        </div>
      </div>
      <LoadState {...load} />
      {data && (
        <>
          <div className={styles.summary}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(data.totals.wallets)}</span>
              <span className={styles.statLabel}>지갑 잔액 합계</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(data.totals.accounts)}</span>
              <span className={styles.statLabel}>포인트를 모은 계정</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(sum(earnedTotal) - sum(spentTotal))}</span>
              <span className={styles.statLabel}>기간 순증가 (적립 − 사용)</span>
            </div>
          </div>
          {/* 고른 기간에 적용일 이전 날짜가 있을 때만 안내한다 */}
          {data.days.some((d) => d.date < ECON_STAFF_EXCLUDED_FROM) && (
            <p className={ui.hint}>운영자 제외는 {STAFF_FROM_LABEL}부터 적용, 이전 날짜에는 운영자 활동이 섞여 있어요.</p>
          )}
          <div className={styles.split}>
            <Bars title="적립 (항목별)" totals={earnedTotal} labels={EARN_LABELS} />
            <Bars title="사용 (분류별)" totals={spentTotal} labels={SPEND_LABELS} />
          </div>
          <h2 className={styles.subTitle}>날짜별</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label="날짜별 적립·사용">
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  <th scope="col" className={styles.num}>
                    적립
                  </th>
                  <th scope="col" className={styles.num}>
                    사용
                  </th>
                  <th scope="col" className={styles.num}>
                    순증가
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date}>
                    <td>{dateLabel(d.date)}</td>
                    <td className={styles.num}>{fmt(sum(d.earned))}</td>
                    <td className={styles.num}>{fmt(sum(d.spent))}</td>
                    <td className={styles.num}>{fmt(sum(d.earned) - sum(d.spent))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
