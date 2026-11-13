"use client";

import { useState } from "react";
import { DEVICE_LABELS, REF_LABELS, type Device } from "@/lib/analytics";
import type { AnalyticsRange, AnalyticsReport, SeriesPoint } from "@/lib/analyticsReport";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import an from "./Analytics.module.css";
import { BarChart, duration, fmt, METRICS, RankList } from "./charts";
import { opsAdminApi } from "./opsAdminApi";
import { LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void; version: number };

export const RANGES: [AnalyticsRange, string][] = [
  ["hour", "시간"],
  ["day", "일"],
  ["week", "주"],
  ["month", "월"],
];
export const RANGE_NOTE: Record<AnalyticsRange, string> = {
  hour: "최근 24시간 (시간대별)",
  day: "최근 30일",
  week: "최근 12주 (월요일 시작)",
  month: "최근 3달 (보관 90일)",
};

const COUNTRY: Record<string, string> = { KR: "한국", US: "미국", JP: "일본", CN: "중국", TW: "대만", HK: "홍콩", VN: "베트남", CA: "캐나다", DE: "독일", GB: "영국", AU: "호주", SG: "싱가포르", "??": "알 수 없음" };

/**
 * 47번 유입 분석: 기간별 차트(시간·일·주·월) + 표 · 유입 경로(분류·도메인·utm·첫 랜딩) · 기기·브라우저·국가.
 * 방문 기록은 원본 IP·개인 식별값 없이 90일만 보관한다
 */
export default function AnalyticsPanel({ toast, onAuthLost, version }: Props) {
  const [range, setRange] = useState<AnalyticsRange>("day");
  const load = usePanelLoad(() => opsAdminApi.analytics(range), [version, range], toast, onAuthLost);
  const report = load.data;
  // 기간을 바꾼 직후에는 이전 기간 차트를 보여 주지 않는다 (유입은 그대로 둔다)
  const seriesReady = report?.range === range;

  return (
    <section className={an.wrap} aria-label="유입 분석">
      <div className={an.section}>
        <div className={styles.toolbar}>
          <div className={styles.segmented} role="group" aria-label="기간">
            {RANGES.map(([value, label]) => (
              <button key={value} type="button" className={ui.button} aria-pressed={range === value} onClick={() => setRange(value)}>
                {label}
              </button>
            ))}
          </div>
          <span className={an.sub}>{RANGE_NOTE[range]} · 동시 접속은 방문·머무르기 신호가 올 때 1분 간격으로 찍은 값 중 최고값</span>
        </div>
        {report && seriesReady ? (
          <>
            <div className={an.charts}>
              {METRICS.map((m) => (
                <BarChart key={m.key} metric={m} series={report.series} />
              ))}
            </div>
            <SeriesTable series={report.series} />
          </>
        ) : (
          <LoadState data={null} error={load.error} retry={load.retry} />
        )}
      </div>

      {report && <Breakdown report={report} />}
    </section>
  );
}

/** 차트와 같은 값을 표로 (색 없이 읽을 수 있게) */
function SeriesTable({ series }: { series: SeriesPoint[] }) {
  return (
    <details className={an.details}>
      <summary>표로 보기</summary>
      <div className={an.tableWrap}>
        <table className={an.table}>
          <thead>
            <tr>
              <th>구간</th>
              {METRICS.map((m) => (
                <th key={m.key}>{m.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((p) => (
              <tr key={p.label}>
                <td>{p.label}</td>
                {METRICS.map((m) => (
                  <td key={m.key}>{m.unit === "sec" ? duration(p[m.key]) : fmt(p[m.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** 유입 경로 · 기기 · 브라우저 · 국가 */
function Breakdown({ report }: { report: AnalyticsReport }) {
  const refTotal = report.referrers.reduce((n, r) => n + r.count, 0);
  return (
    <>
      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>유입 경로</h2>
          <span className={an.sub}>{report.breakdownLabel} 방문(세션) 기준 · 리퍼러는 도메인만 남겨요</span>
        </div>
        <div className={an.lists}>
          <RankList title="어디서 왔나" total={refTotal} rows={report.referrers.map((r) => ({ key: REF_LABELS[r.cat], count: r.count }))} keepZero />
          <RankList title="리퍼러 도메인" rows={report.domains} empty="다른 사이트에서 온 방문이 아직 없어요." />
          <RankList title="utm (출처 / 매체 / 캠페인)" rows={report.utm} empty="utm이 붙은 방문이 아직 없어요." />
          <RankList title="첫 랜딩 경로" rows={report.landings} />
        </div>
      </div>
      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>기기 · 브라우저 · 국가</h2>
          <span className={an.sub}>{report.breakdownLabel} 방문(세션) 기준</span>
        </div>
        <div className={an.lists}>
          <RankList title="기기" rows={report.devices.map((r) => ({ key: DEVICE_LABELS[r.key as Device] ?? r.key, count: r.count }))} />
          <RankList title="브라우저" rows={report.browsers} />
          <RankList title="국가 (Vercel 위치 헤더)" rows={report.countries.map((r) => ({ key: COUNTRY[r.key] ?? r.key, count: r.count }))} />
        </div>
      </div>
    </>
  );
}
