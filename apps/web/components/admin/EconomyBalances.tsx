"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminBalancesResponse, BalanceScope, BalanceStatus } from "@/lib/adminBalances";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import { fullTime, relativeTime } from "./memberFormat";
import eb from "./EconomyBalances.module.css";
import mm from "./Members.module.css";
import { Empty, Failed, Loading } from "./PanelState";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const fmt = (n: number) => n.toLocaleString("ko-KR");
const STATUS: Record<BalanceStatus, string> = { normal: "정상", banned: "정지", dormant: "휴면" };
/** 처음 보여 주는 줄 수 (더 보기를 누르면 서버가 준 만큼 다) */
const FIRST_ROWS = 20;
const SCOPES: [BalanceScope, string][] = [
  ["all", "전체"],
  ["active", "활동 중만"],
];

/**
 * 경제 탭의 포인트 잔액: 합계·평균·중앙값, 잔액 구간 막대, 잔액 순 목록(닉네임 검색).
 * 서버가 회원 목록 훑기를 다시 쓰고 몇 분 기억한다 → 범위·검색을 바꿔도 Redis를 다시 읽지 않는다. [새로고침]만 다시 훑는다
 */
export default function EconomyBalances({ toast, onAuthLost }: Props) {
  const [scope, setScope] = useState<BalanceScope>("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<AdminBalancesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [more, setMore] = useState(false);
  /** 늦게 온 옛 응답이 새 응답을 덮지 않게 */
  const seq = useRef(0);

  const load = useCallback(
    async (by: BalanceScope, q: string, fresh = false) => {
      const my = ++seq.current;
      setLoading(true);
      try {
        const r = await adminApi.balances(by, q, fresh);
        if (my !== seq.current) return;
        setData(r);
        setError(null);
        setNow(Date.now());
      } catch (e) {
        if (my !== seq.current) return;
        if (e instanceof ApiRequestError && e.status === 401) return onAuthLost();
        const msg = errorMessage(e);
        setError(msg);
        toast(msg);
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [onAuthLost, toast],
  );

  // 처음 열 때 (서버가 기억해 둔 결과가 있으면 Redis를 읽지 않는다)
  useEffect(() => {
    let alive = true;
    adminApi.balances("all", "").then(
      (r) => {
        // 그사이 범위·검색을 눌렀으면 그 응답을 따른다
        if (!alive || seq.current) return;
        setData(r);
        setNow(Date.now());
      },
      (e: unknown) => {
        if (!alive || seq.current) return;
        if (e instanceof ApiRequestError && e.status === 401) return onAuthLost();
        const msg = errorMessage(e);
        setError(msg);
        toast(msg);
      },
    );
    return () => {
      alive = false;
    };
  }, [onAuthLost, toast]);

  const q = data?.q ?? "";
  const changeScope = (by: BalanceScope) => {
    setScope(by);
    void load(by, q);
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    void load(scope, query.trim());
  };
  const clear = () => {
    setQuery("");
    void load(scope, "");
  };

  const shown = Math.min(data?.rows.length ?? 0, more ? Infinity : FIRST_ROWS);
  const maxBucket = Math.max(1, ...(data?.buckets.map((b) => b.count) ?? []));

  return (
    <div className={styles.notices}>
      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="잔액 범위">
          {SCOPES.map(([id, label]) => (
            <button key={id} type="button" className={ui.button} aria-pressed={scope === id} onClick={() => changeScope(id)} disabled={loading}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className={cx(ui.button, ui.quiet, styles.toolbarEnd)} onClick={() => void load(scope, q, true)} disabled={loading}>
          잔액 새로 훑기
        </button>
      </div>

      {!data ? (
        error ? (
          <Failed onRetry={() => void load(scope, q)}>{`불러오지 못했어요. ${error}`}</Failed>
        ) : (
          <Loading />
        )
      ) : (
        <>
          <p className={styles.meta} aria-live="polite">
            {relativeTime(data.computedAt, now)} 기준이에요. 운영자 계정 {fmt(data.staffExcluded)}개는 빼고 셌어요.
            {scope === "active"
              ? " 휴면과 정지 계정도 뺐어요."
              : data.dormant.accounts
                ? ` 휴면 ${fmt(data.dormant.accounts)}명의 잔액 ${fmt(data.dormant.sum)}P도 들어 있어요.`
                : ""}
            {data.partial ? " 회원이 너무 많아 일부만 훑었어요." : ""}
          </p>
          <div className={cx(styles.summary, eb.stats)}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(data.sum)}P</span>
              <span className={styles.statLabel}>잔액 합계</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(data.avg)}P</span>
              <span className={styles.statLabel}>평균</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(data.median)}P</span>
              <span className={styles.statLabel}>중앙값</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{fmt(data.accounts)}명</span>
              <span className={styles.statLabel}>
                계정 수 (0P {fmt(data.zero)}명{data.managers.accounts ? `, 매니저 ${fmt(data.managers.accounts)}명` : ""})
              </span>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>잔액 구간</h3>
              <span className={styles.meta}>막대는 사람 수예요</span>
            </div>
            {data.buckets.map((b) => (
              <div key={b.label} className={styles.barRow} title={`${b.label} 구간 잔액 합계 ${fmt(b.sum)}P`}>
                <span className={styles.barLabel}>{b.label}</span>
                <span className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                </span>
                <span className={styles.barValue}>{fmt(b.count)}명</span>
              </div>
            ))}
          </div>

          <div className={mm.head}>
            <form className={mm.search} onSubmit={search} role="search" aria-label="잔액 목록에서 찾기">
              <input
                className={ui.input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="닉네임 일부"
                aria-label="닉네임"
                autoComplete="off"
                maxLength={64}
              />
              <button type="submit" className={ui.button} disabled={loading}>
                찾기
              </button>
              {q && (
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={clear} disabled={loading}>
                  전체 보기
                </button>
              )}
            </form>
          </div>
          <p className={styles.meta}>
            {q
              ? `"${q}" 찾은 결과 ${fmt(data.matched)}명이에요.${data.matched > shown ? ` 잔액 많은 ${fmt(shown)}명만 보여요.` : ""}`
              : `잔액 많은 순으로 ${fmt(shown)}명 보여요.`}
          </p>
          {data.rows.length === 0 ? (
            <Empty>{q ? "찾는 회원이 없어요." : "아직 회원이 없어요."}</Empty>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={cx(styles.table, eb.list)} aria-label="잔액 순 목록" aria-busy={loading}>
                  <thead>
                    <tr>
                      <th scope="col">순위</th>
                      <th scope="col">이름</th>
                      <th scope="col" className={styles.num}>
                        잔액
                      </th>
                      <th scope="col">최근 접속</th>
                      <th scope="col">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(0, more ? data.rows.length : FIRST_ROWS).map((r) => (
                      <tr key={r.accountId}>
                        <td className={cx(styles.num, eb.rank)}>{fmt(r.rank)}위</td>
                        <td className={mm.nameCell}>
                          {r.name ?? "이름 없음"}
                          <span className={mm.id}>{r.accountId}</span>
                        </td>
                        <td className={styles.num}>{fmt(r.points)}P</td>
                        <td className={styles.nowrap} title={fullTime(r.lastSeenAt)}>
                          {relativeTime(r.lastSeenAt, now)}
                        </td>
                        <td className={styles.nowrap}>
                          <span className={cx(mm.status, mm[r.status])}>{STATUS[r.status]}</span>
                          {r.manager && <span className={cx(mm.status, mm.manager)}>매니저</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!more && data.rows.length > FIRST_ROWS && (
                <button type="button" className={cx(ui.button, ui.quiet, eb.more)} onClick={() => setMore(true)}>
                  {fmt(data.rows.length)}명까지 더 보기
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
