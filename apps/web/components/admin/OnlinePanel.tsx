"use client";

import { useMemo, useState } from "react";
import type { CountRow, OnlineRow } from "@/lib/onlineNow";
import { stayText } from "@/lib/stayTime";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { fmt } from "./charts";
import { logsAdminApi } from "./logsAdminApi";
import { fullTime, joinDate } from "./memberFormat";
import ops from "./Ops.module.css";
import { Empty, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";
import UserStatsDialog from "./UserStatsDialog";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  version: number;
  onFindMember: (accountId: string) => void;
};

type Sort = "session" | "points" | "stay" | "joined";
const SORTS: [Sort, string][] = [
  ["session", "이번 접속 긴 순"],
  ["points", "포인트 많은 순"],
  ["stay", "총 접속 시간 순"],
  ["joined", "최근 가입 순"],
];
const SORT_FN: Record<Sort, (a: OnlineRow, b: OnlineRow) => number> = {
  session: (a, b) => (a.since ?? Infinity) - (b.since ?? Infinity) || a.ch - b.ch,
  points: (a, b) => b.points - a.points,
  stay: (a, b) => b.stayMinutes - a.stayMinutes,
  joined: (a, b) => b.createdAt - a.createdAt,
};

/** 이번 접속 시간 (분 단위, 모르면 —) */
function sessionText(since: number | null, now: number): string {
  if (!since) return "—";
  const min = Math.max(0, Math.floor((now - since) / 60_000));
  return min < 1 ? "방금" : stayText(min);
}

function Bars({ title, rows, total }: { title: string; rows: CountRow[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className={ops.statCard}>
      <h3 className={ops.statTitle}>{title}</h3>
      {rows.length === 0 || total === 0 ? (
        <p className={ops.muted}>아직 없어요.</p>
      ) : (
        <ul className={ops.bars} aria-label={title}>
          {rows.map((r) => (
            <li key={r.label} className={ops.barItem}>
              <span className={ops.barName} title={r.label}>
                {r.label}
              </span>
              <span className={ops.barTrack}>
                <span className={ops.barFill} style={{ width: `${r.n ? Math.max(3, (r.n / max) * 100) : 0}%`, display: "block" }} />
              </span>
              <span className={ops.barCount}>
                {fmt(r.n)}
                {total ? ` · ${Math.round((r.n / total) * 100)}%` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 11/26 지금 접속자: 접속 중 계정 목록 + 통계. 열 때·[새로고침] 때만 한 번에 읽는다 (자동으로 다시 묻지 않는다 — Redis 절약)
 */
export default function OnlinePanel({ toast, onAuthLost, version, onFindMember }: Props) {
  // 위 [새로고침](version)을 누를 때만 다시 읽는다
  const load = usePanelLoad(() => logsAdminApi.online(), [version], toast, onAuthLost);
  const r = load.data;
  const [sort, setSort] = useState<Sort>("session");
  const [pick, setPick] = useState<{ accountId: string; name: string | null } | null>(null);
  const rows = useMemo(() => (r ? [...r.rows].sort(SORT_FN[sort]) : []), [r, sort]);
  const now = r?.at ?? 0;
  const s = r?.stats;

  return (
    <section aria-label="지금 접속자">
      <div className={ops.toolbar}>
        <label className={ops.muted}>
          줄 세우기{" "}
          <select className={ui.input} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="줄 세우기">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {r && <span className={ops.toolbarEnd}>{fullTime(r.at)} 기준 · 위 [새로고침]을 누를 때만 다시 불러와요</span>}
      </div>

      {!r ? (
        <LoadState data={null} error={load.error} retry={load.retry} />
      ) : !r.reachable ? (
        <Empty>실시간 서버에 연결할 수 없어요. 잠시 뒤 위 [새로고침]을 눌러 주세요.</Empty>
      ) : (
        <>
          <div className={ops.kpis}>
            <Kpi label="접속 중" value={fmt(r.rows.length)} note={r.rows.length !== s!.count ? `운영자 ${r.rows.length - s!.count}명 포함` : undefined} />
            <Kpi label="보유 포인트 평균" value={`${fmt(s!.points.avg)}P`} note="운영자 빼고" />
            <Kpi label="보유 포인트 중앙값" value={`${fmt(s!.points.median)}P`} />
            <Kpi label="새싹 비율" value={s!.sproutRatio === null ? "—" : `${Math.round(s!.sproutRatio * 100)}%`} note={`새싹 ${fmt(s!.sprouts)}명 · 총 접속 3시간 미만`} />
          </div>
          <div className={ops.statGrid}>
            <Bars title="포인트 구간별 인원" rows={s!.points.buckets.map((b) => ({ label: b.label, n: b.n }))} total={s!.count} />
            <Bars title="맵별" rows={s!.byMap} total={s!.count} />
            <Bars title="가입 유입별" rows={s!.bySignup} total={s!.count} />
            <Bars title="이번 접속 유입별" rows={s!.bySession} total={s!.count} />
          </div>

          {rows.length === 0 ? (
            <Empty>지금 접속한 사람이 없어요.</Empty>
          ) : (
            <div className={styles.tableWrap}>
              <table className={cx(styles.table, styles.stackTable)} aria-label="접속 중 계정">
                <thead>
                  <tr>
                    <th scope="col">이름</th>
                    <th scope="col">채널 · 맵</th>
                    <th scope="col" className={styles.num}>
                      이번 접속
                    </th>
                    <th scope="col" className={styles.num}>
                      보유 포인트
                    </th>
                    <th scope="col">가입 유입</th>
                    <th scope="col">이번 접속 유입</th>
                    <th scope="col">가입일</th>
                    <th scope="col" className={styles.num}>
                      총 접속 시간
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.accountId}>
                      <td>
                        <button type="button" className={ops.nameButton} onClick={() => setPick({ accountId: p.accountId, name: p.name || null })}>
                          {p.name || "이름 없음"}
                        </button>{" "}
                        {p.sprout && <span className={cx(ops.tag, ops.tagOk)}>새싹</span>}
                        {p.staff && <span className={cx(ops.tag, ops.tagInfo)}>운영자</span>}
                      </td>
                      <td data-label="채널 · 맵" className={styles.nowrap}>
                        {p.ch}채널 · {p.map}
                        {p.place && <span className={ops.sub}>{p.place}</span>}
                      </td>
                      <td data-label="이번 접속" className={cx(styles.num, styles.nowrap)} title={p.since ? fullTime(p.since) : "그 탭의 첫 입장 기록이 없어요"}>
                        {sessionText(p.since, now)}
                      </td>
                      <td data-label="보유 포인트" className={styles.num}>
                        {p.staff ? "—" : fmt(p.points)}
                      </td>
                      <td data-label="가입 유입" className={ops.detail}>
                        {p.signup}
                      </td>
                      <td data-label="이번 접속 유입" className={ops.detail}>
                        {p.session ?? "—"}
                      </td>
                      <td data-label="가입일" className={styles.nowrap} title={fullTime(p.createdAt)}>
                        {joinDate(p.createdAt)}
                      </td>
                      <td data-label="총 접속 시간" className={cx(styles.num, styles.nowrap)}>
                        {p.stayMinutes ? stayText(p.stayMinutes) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className={ui.hint} style={{ marginTop: 12 }}>
            가입 유입은 11/26 배포 뒤 가입한 계정부터 보여요. 카카오톡·인스타그램 앱 안 브라우저는 리퍼러가 비어 「알 수 없음」이 많아요 — 홍보 글에는 utm 붙은 링크를 써 주세요.
          </p>
        </>
      )}
      {pick && (
        <UserStatsDialog
          key={pick.accountId}
          accountId={pick.accountId}
          name={pick.name}
          toast={toast}
          onAuthLost={onAuthLost}
          onClose={() => setPick(null)}
          onFindMember={(id) => {
            setPick(null);
            onFindMember(id);
          }}
        />
      )}
    </section>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={ops.kpi}>
      <span className={ops.kpiLabel}>{label}</span>
      <span className={ops.kpiValue}>{value}</span>
      {note && <span className={ops.kpiNote}>{note}</span>}
    </div>
  );
}
