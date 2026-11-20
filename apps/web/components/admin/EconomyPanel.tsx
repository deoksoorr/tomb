"use client";

import { useState } from "react";
import { EARN_RULES, ECON_STAFF_EXCLUDED_FROM } from "@/lib/economy";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import EconomyBalances from "./EconomyBalances";
import { LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const EARN_LABELS: Record<string, string> = {
  ...Object.fromEntries(EARN_RULES.map((r) => [r.source, r.label])),
  champ: "주간 1위 보상",
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
  lottery: "행운권",
  other: "기타",
};
/** 관리자 지급과 회수 카드 (out = 관리자 회수, 합계에서는 뺀다) */
const ADMIN_LABELS: Record<string, string> = {
  admin: "포인트 지급",
  gift: "선물로 보낸 포인트",
  out: "회수 (합계에서 빼요)",
};

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
/** 관리자가 넣은 포인트 (관리자 지급·관리자 선물)와 뺀 포인트 (관리자 회수). 유저 경제 숫자에서 빼고 따로 보여 준다 */
const ADMIN_EARN = new Set(["admin", "gift"]);
const ADMIN_SPEND = new Set(["admin"]);
/** 기록을 유저 몫과 관리자 몫으로 나눈다 */
function splitAdmin(r: Record<string, number>, admin: Set<string>): [Record<string, number>, Record<string, number>] {
  const user: Record<string, number> = {};
  const adm: Record<string, number> = {};
  for (const [k, v] of Object.entries(r)) (admin.has(k) ? adm : user)[k] = v;
  return [user, adm];
}
const fmt = (n: number) => n.toLocaleString("ko-KR");
const dateLabel = (d: string) => `${Number(d.slice(4, 6))}.${d.slice(6)}`;
/** 운영자 제외 적용일 안내 ("11월 13일") */
const STAFF_FROM_LABEL = `${Number(ECON_STAFF_EXCLUDED_FROM.slice(4, 6))}월 ${Number(ECON_STAFF_EXCLUDED_FROM.slice(6))}일`;

function Bars({ title, totals, labels, total }: { title: string; totals: Record<string, number>; labels: Record<string, string>; total?: number }) {
  const rows = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        <span className={styles.meta}>합계 {fmt(total ?? sum(totals))}</span>
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

/** 경제 탭: 유저 포인트 잔액, 날짜별 적립과 사용(유저 몫), 항목별 막대, 관리자 지급과 회수(따로) */
export default function EconomyPanel({ toast, onAuthLost }: Props) {
  const [days, setDays] = useState(14);
  const load = usePanelLoad(() => adminApi.economy(days), [days], toast, onAuthLost);
  const data = load.data;
  const earnedTotal: Record<string, number> = {};
  const spentTotal: Record<string, number> = {};
  const rows = (data?.days ?? []).map((d) => {
    const [earned, adminIn] = splitAdmin(d.earned, ADMIN_EARN);
    const [spent, adminOut] = splitAdmin(d.spent, ADMIN_SPEND);
    for (const [k, v] of Object.entries(d.earned)) earnedTotal[k] = (earnedTotal[k] ?? 0) + v;
    for (const [k, v] of Object.entries(d.spent)) spentTotal[k] = (spentTotal[k] ?? 0) + v;
    return { date: d.date, earned: sum(earned), spent: sum(spent), admin: sum(adminIn) - sum(adminOut) };
  });
  const [userEarned, adminEarned] = splitAdmin(earnedTotal, ADMIN_EARN);
  const [userSpent, adminSpent] = splitAdmin(spentTotal, ADMIN_SPEND);
  const adminBars: Record<string, number> = { ...adminEarned, ...(adminSpent.admin ? { out: adminSpent.admin } : {}) };
  const adminNet = sum(adminEarned) - sum(adminSpent);

  return (
    <section className={styles.notices} aria-label="경제">
      <h2 className={styles.subTitle}>포인트 잔액</h2>
      <EconomyBalances toast={toast} onAuthLost={onAuthLost} />

      <h2 className={styles.subTitle}>적립과 사용</h2>
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
              <span className={styles.statValue}>{fmt(sum(userEarned))}</span>
              <span className={styles.statLabel}>유저 적립</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(sum(userSpent))}</span>
              <span className={styles.statLabel}>유저 사용</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(sum(userEarned) - sum(userSpent))}</span>
              <span className={styles.statLabel}>유저 순증가 (적립 − 사용)</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(adminNet)}</span>
              <span className={styles.statLabel}>관리자 지급 (회수를 뺀 값)</span>
            </div>
          </div>
          {/* 11/16 적용일 이전 날짜는 서버가 보내지 않는다 (운영자 활동이 섞여 있어서) */}
          <p className={ui.hint}>
            운영자 계정이 쓰고 모은 포인트는 빼고 세요. 관리자가 주거나 거둔 포인트도 유저 숫자에서 빼고 아래에 따로 보여요. 기록은 {STAFF_FROM_LABEL}부터 보여요.
          </p>
          <div className={styles.split}>
            <Bars title="유저 적립 (항목별)" totals={userEarned} labels={EARN_LABELS} />
            <Bars title="유저 사용 (분류별)" totals={userSpent} labels={SPEND_LABELS} />
          </div>
          <Bars title="관리자 지급과 회수" totals={adminBars} labels={ADMIN_LABELS} total={adminNet} />
          <h2 className={styles.subTitle}>날짜별</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label="날짜별 적립과 사용">
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  <th scope="col" className={styles.num}>
                    유저 적립
                  </th>
                  <th scope="col" className={styles.num}>
                    유저 사용
                  </th>
                  <th scope="col" className={styles.num}>
                    순증가
                  </th>
                  <th scope="col" className={styles.num}>
                    관리자 지급
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.date}>
                    <td>{dateLabel(d.date)}</td>
                    <td className={styles.num}>{fmt(d.earned)}</td>
                    <td className={styles.num}>{fmt(d.spent)}</td>
                    <td className={styles.num}>{fmt(d.earned - d.spent)}</td>
                    <td className={styles.num}>{d.admin ? fmt(d.admin) : "—"}</td>
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
