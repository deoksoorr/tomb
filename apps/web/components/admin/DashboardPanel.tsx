"use client";

import { useState, type ReactNode } from "react";
import type { LobbyInfo } from "@tomb/protocol";
import { REF_LABELS } from "@/lib/analytics";
import type { AnalyticsRange } from "@/lib/analyticsReport";
import { earnRule } from "@/lib/economy";
import type { CaseType } from "@/lib/store/reportBox";
import { cx } from "../ui/cx";
import { adminApi } from "./adminApi";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import an from "./Analytics.module.css";
import { BarChart, duration, fmt, metric, RankList } from "./charts";
import { moderationApi } from "./moderationApi";
import { opsAdminApi } from "./opsAdminApi";
import { Empty, Loading } from "./PanelState";
import { usePanelData } from "./usePanelData";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  lobby: LobbyInfo | "error" | null;
  graveCount: number;
  reportedCount: number;
  /** 처리 대기 신고 수 (메뉴 배지와 같은 값, 아직 모르면 null) */
  reportsOpen: number | null;
  /** 새로고침 버튼마다 바뀐다 */
  version: number;
};

const RANGES: [AnalyticsRange, string][] = [
  ["hour", "24시간"],
  ["day", "30일"],
];
const TYPE_LABEL: Record<CaseType, string> = { grave: "묘비", guestbook: "방명록", user: "유저", megaphone: "확성기" };
const KIND_LABEL = { account: "계정 정지", ip: "IP 차단", both: "계정+IP" } as const;
const BAN_STATUS = { active: "진행 중", expired: "기간 끝남", lifted: "해제됨" } as const;
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
/** 오늘 획득에서 빼는 항목: 관리자 지급·선물·환불 (활동으로 번 포인트만) / 사용에서 빼는 항목: 관리자 회수 */
const EARN_EXCLUDED = new Set(["admin", "gift", "refund"]);
const SPEND_EXCLUDED = new Set(["admin"]);
const RECENT = 5;

const sumExcept = (r: Record<string, number>, skip: Set<string>) => Object.entries(r).reduce((n, [k, v]) => (skip.has(k) ? n : n + v), 0);

/**
 * 47번 대시보드: 큰 숫자(지금 접속·오늘 방문·신고 대기·오늘 획득/사용 포인트) → 오늘 운영 숫자 →
 * 접속·방문 추이와 유입 경로 → 최근 신고·제재·코드 재발급 요약. 자세한 건 각 메뉴(유입 분석·경제·신고…)에서 본다
 */
export default function DashboardPanel({ toast, onAuthLost, lobby, graveCount, reportedCount, reportsOpen, version }: Props) {
  const [range, setRange] = useState<AnalyticsRange>("day");
  const report = usePanelData(() => opsAdminApi.analytics(range), [version, range], toast, onAuthLost);
  const seriesReady = report?.range === range;
  const econ = usePanelData(() => adminApi.economy(1), [version], toast, onAuthLost);
  const passed = usePanelData(() => adminApi.passed("", 0), [version], toast, onAuthLost);
  const reports = usePanelData(() => moderationApi.reports("open"), [version], toast, onAuthLost);
  const bans = usePanelData(() => moderationApi.bans(), [version], toast, onAuthLost);
  const codes = usePanelData(() => adminApi.codeLog(), [version], toast, onAuthLost);

  const today = econ ? (econ.days[0] ?? { earned: {}, spent: {} }) : null; // 최근 날짜 먼저 = 오늘
  const attended = today ? Math.round((today.earned.attend ?? 0) / earnRule("attend").points) : null;
  const earnedToday = today ? sumExcept(today.earned, EARN_EXCLUDED) : null;
  const spentToday = today ? sumExcept(today.spent, SPEND_EXCLUDED) : null;
  const t = report?.today;
  const live = lobby && lobby !== "error" ? lobby : null;
  const openCount = reportsOpen ?? reports?.openCount ?? null;
  const recentBans = bans ? [...bans.bans].sort((a, b) => b.startAt - a.startAt).slice(0, RECENT) : null;
  const refTotal = report ? report.referrers.reduce((n, r) => n + r.count, 0) : 0;

  return (
    <section className={an.wrap} aria-label="대시보드">
      <div className={styles.kpiRow}>
        <BigKpi
          label="지금 접속"
          value={live ? fmt(live.total) : lobby === "error" ? "?" : "…"}
          note={live ? `전체 정원 ${fmt(live.totalCap)}` : lobby === "error" ? "실시간 서버에 연결할 수 없어요" : undefined}
          className={cx(live && styles.kpiLive)}
        />
        <BigKpi label="오늘 방문자 (고유)" value={fmt(t?.visitors)} note={t ? `방문 ${fmt(t.visits)}번 · 재방문 ${fmt(t.returningVisits)}` : undefined} />
        <BigKpi
          label="신고 대기"
          value={fmt(openCount)}
          note={openCount ? "눌러서 처리하기 →" : "처리할 신고가 없어요"}
          href="#reports"
          className={cx(!!openCount && styles.kpiAlert)}
        />
        <BigKpi label="오늘 획득 포인트" value={fmt(earnedToday)} note="운영자·관리자 지급·선물·환불 제외" href="#economy" />
        <BigKpi label="오늘 사용 포인트" value={fmt(spentToday)} note="운영자·관리자 회수 제외" href="#economy" />
      </div>

      <div className={styles.miniStats} aria-label="오늘 운영 숫자">
        <Mini label="오늘 신규 가입" value={fmt(t?.signups)} />
        <Mini label="오늘 최고 동시 접속" value={fmt(t?.peak)} />
        <Mini label="오늘 평균 체류" value={t ? duration(t.avgStaySec) : "…"} />
        <Mini label="오늘 묘비 작성" value={fmt(t?.graves)} />
        <Mini label="오늘 사냥 판" value={fmt(t?.hunts)} />
        <Mini label="오늘 출석 보상 계정" value={fmt(attended)} />
        <Mini label="묘역의 묘비" value={fmt(graveCount)} />
        <Mini label="성불한 이야기" value={fmt(passed?.total)} />
        <Mini label="신고된 묘비" value={fmt(reportedCount)} />
      </div>

      <div className={styles.dashGrid}>
        <div className={an.section}>
          <div className={an.sectionHead}>
            <h2 className={an.sectionTitle}>접속 · 방문 추이</h2>
            <div className={styles.segmented} role="group" aria-label="기간">
              {RANGES.map(([value, label]) => (
                <button key={value} type="button" className={ui.button} aria-pressed={range === value} onClick={() => setRange(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {report && seriesReady ? (
            <div className={an.charts}>
              <BarChart metric={metric("visitors")} series={report.series} />
              <BarChart metric={metric("peak")} series={report.series} />
            </div>
          ) : (
            <Loading />
          )}
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>채널별 지금 접속</h3>
              {live && (
                <span className={styles.meta}>
                  전체 {live.total} / {live.totalCap}
                </span>
              )}
            </div>
            <div className={styles.channels}>
              {lobby === null && <span className={ui.hint}>불러오는 중…</span>}
              {lobby === "error" && <span className={ui.hint}>실시간 서버 로비에 연결할 수 없어요.</span>}
              {live &&
                live.channels
                  .filter((c) => c.open || c.count > 0)
                  .map((c) => (
                    <span key={c.id} className={styles.chip}>
                      {c.id}채널 {c.count}/{c.cap}
                    </span>
                  ))}
            </div>
          </div>
        </div>

        <div className={an.section}>
          <div className={an.sectionHead}>
            <h2 className={an.sectionTitle}>유입 경로</h2>
            <a className={styles.cardLink} href="#analytics">
              유입 분석 전체 →
            </a>
          </div>
          {report ? (
            <>
              <RankList title={`어디서 왔나 (${report.breakdownLabel})`} total={refTotal} rows={report.referrers.map((r) => ({ key: REF_LABELS[r.cat], count: r.count }))} keepZero />
              <RankList title="리퍼러 도메인 상위 5" rows={report.domains} limit={5} empty="다른 사이트에서 온 방문이 아직 없어요." />
            </>
          ) : (
            <Loading />
          )}
        </div>
      </div>

      <div className={styles.recentGrid}>
        <RecentCard title="최근 신고 (처리 대기)" href="#reports" loading={!reports} empty={reports?.reports.length === 0 && "처리할 신고가 없어요."}>
          {reports?.reports.slice(0, RECENT).map((r) => (
            <li key={r.key} className={styles.recentItem}>
              <span className={styles.recentMain}>
                <span className={cx(styles.badge, styles.badgeWarn)}>{TYPE_LABEL[r.type]}</span> {r.name}
              </span>
              <time className={styles.recentWhen}>{KST.format(r.lastAt)}</time>
              <span className={styles.recentSub}>
                신고 {r.count}회 · 신고자 {r.reporters}명{r.reasonSummary ? ` · ${r.reasonSummary}` : ""}
              </span>
            </li>
          ))}
        </RecentCard>

        <RecentCard title="최근 제재" href="#bans" loading={!recentBans} empty={recentBans?.length === 0 && "정지·차단 기록이 없어요."}>
          {recentBans?.map((b) => (
            <li key={b.id} className={styles.recentItem}>
              <span className={styles.recentMain}>
                <span className={cx(styles.badge, b.status === "active" ? styles.badgeHidden : undefined)}>{BAN_STATUS[b.status]}</span>{" "}
                {b.accountName ?? b.accountId ?? (b.ipHash ? `IP#${b.ipHash.slice(0, 8)}` : "—")}
              </span>
              <time className={styles.recentWhen}>{KST.format(b.startAt)}</time>
              <span className={styles.recentSub}>
                {KIND_LABEL[b.kind]} · {b.until === null ? "영구" : `~${KST.format(b.until)}`} · {b.reason}
              </span>
            </li>
          ))}
        </RecentCard>

        <RecentCard title="최근 코드 재발급" href="#codes" loading={!codes} empty={codes?.log.length === 0 && "아직 재발급한 적이 없어요."}>
          {codes?.log.slice(0, RECENT).map((e) => (
            <li key={`${e.at}-${e.accountId}`} className={styles.recentItem}>
              <span className={styles.recentMain}>{e.name ?? "이름 없음"}</span>
              <time className={styles.recentWhen}>{KST.format(e.at)}</time>
              <span className={styles.recentSub}>
                처리 {e.by} · {e.accountId}
              </span>
            </li>
          ))}
        </RecentCard>
      </div>
    </section>
  );
}

function BigKpi({ label, value, note, href, className }: { label: string; value: string; note?: string; href?: string; className?: string }) {
  const body = (
    <>
      <span className={styles.kpiBigLabel}>{label}</span>
      <span className={styles.kpiBigValue}>{value}</span>
      {note && <span className={styles.kpiBigNote}>{note}</span>}
    </>
  );
  return href ? (
    <a className={cx(styles.kpiBig, className)} href={href}>
      {body}
    </a>
  ) : (
    <div className={cx(styles.kpiBig, className)}>{body}</div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.miniStat}>
      <span className={styles.miniValue}>{value}</span>
      <span className={styles.miniLabel}>{label}</span>
    </div>
  );
}

function RecentCard({ title, href, loading, empty, children }: { title: string; href: string; loading: boolean; empty?: string | false; children: ReactNode }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <a className={styles.cardLink} href={href}>
          모두 보기 →
        </a>
      </div>
      {loading ? <Loading inline /> : empty ? <Empty inline>{empty}</Empty> : <ul className={styles.recentList}>{children}</ul>}
    </div>
  );
}
