"use client";

import { useState } from "react";
import type { LobbyInfo } from "@tomb/protocol";
import { DEVICE_LABELS, REF_LABELS, type Device } from "@/lib/analytics";
import type { AnalyticsRange, AnalyticsReport, Ranked, SeriesPoint } from "@/lib/analyticsReport";
import { earnRule } from "@/lib/economy";
import ui from "../ui/ui.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import an from "./Analytics.module.css";
import { opsAdminApi } from "./opsAdminApi";
import { usePanelData } from "./usePanelData";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  lobby: LobbyInfo | "error" | null;
  graveCount: number;
  reportedCount: number;
  /** 새로고침 버튼마다 바뀐다 */
  version: number;
};

const RANGES: [AnalyticsRange, string][] = [
  ["hour", "시간"],
  ["day", "일"],
  ["week", "주"],
  ["month", "월"],
];

type MetricKey = Exclude<keyof SeriesPoint, "label">;
/** 기간별 차트 (작은 차트 여러 개, 차트마다 값 하나) */
const METRICS: { key: MetricKey; title: string; unit: "명" | "번" | "개" | "판" | "sec"; summary: "sum" | "max" | "avg" }[] = [
  { key: "visitors", title: "방문자 (고유)", unit: "명", summary: "max" },
  { key: "visits", title: "방문 (세션)", unit: "번", summary: "sum" },
  { key: "peak", title: "최고 동시 접속", unit: "명", summary: "max" },
  { key: "signups", title: "신규 가입", unit: "명", summary: "sum" },
  { key: "graves", title: "묘비 작성", unit: "개", summary: "sum" },
  { key: "hunts", title: "사냥 판 수", unit: "판", summary: "sum" },
  { key: "avgStaySec", title: "평균 체류 시간", unit: "sec", summary: "avg" },
];

const COUNTRY: Record<string, string> = { KR: "한국", US: "미국", JP: "일본", CN: "중국", TW: "대만", HK: "홍콩", VN: "베트남", CA: "캐나다", DE: "독일", GB: "영국", AU: "호주", SG: "싱가포르", "??": "알 수 없음" };

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "…" : n.toLocaleString("ko-KR"));
function duration(sec: number): string {
  if (sec <= 0) return "0초";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${s ? `${s}초` : ""}`.trim();
  return `${s}초`;
}
const valueText = (v: number, unit: (typeof METRICS)[number]["unit"]) => (unit === "sec" ? duration(v) : `${fmt(v)}${unit}`);

/**
 * 47번 대시보드: 지금 접속(실시간 로비, 채널별) · 오늘 방문 요약 · 기간별 차트(시간·일·주·월) · 유입 경로(분류·도메인·utm·첫 랜딩) ·
 * 기기·브라우저·국가 · 운영 현황(출석·포인트·묘비). 방문 기록은 원본 IP·개인 식별값 없이 90일만 보관한다
 */
export default function DashboardPanel({ toast, onAuthLost, lobby, graveCount, reportedCount, version }: Props) {
  const [range, setRange] = useState<AnalyticsRange>("day");
  const loaded = usePanelData(() => opsAdminApi.analytics(range), [version, range], toast, onAuthLost);
  // 기간을 바꾼 직후에는 이전 기간 차트를 보여 주지 않는다 (요약·유입은 그대로 둔다)
  const report = loaded;
  const seriesReady = loaded?.range === range;
  const econ = usePanelData(() => adminApi.economy(1), [version], toast, onAuthLost);
  const passed = usePanelData(() => adminApi.passed("", 0), [version], toast, onAuthLost);
  const today = econ?.days[0]; // 최근 날짜 먼저 = 오늘
  const attendPts = earnRule("attend").points;
  const attended = today ? Math.round((today.earned.attend ?? 0) / attendPts) : null;
  const earnedToday = today
    ? Object.entries(today.earned).reduce((n, [k, v]) => (k === "refund" || k === "admin" ? n : n + v), 0)
    : null;
  const t = report?.today;
  const live = lobby && lobby !== "error" ? lobby : null;

  return (
    <section className={an.wrap} aria-label="대시보드">
      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>지금 · 오늘</h2>
          <span className={an.sub}>오늘 = 한국 시간 0시부터</span>
        </div>
        <div className={an.kpis}>
          <Kpi label="지금 접속" value={live ? fmt(live.total) : lobby === "error" ? "?" : "…"} note={live ? `전체 정원 ${fmt(live.totalCap)}` : undefined} />
          <Kpi label="오늘 방문자 (고유)" value={fmt(t?.visitors)} />
          <Kpi label="오늘 방문 (세션)" value={fmt(t?.visits)} note={t ? `신규 ${fmt(t.newVisits)} · 재방문 ${fmt(t.returningVisits)}` : undefined} />
          <Kpi label="오늘 최고 동시 접속" value={fmt(t?.peak)} />
          <Kpi label="오늘 신규 가입" value={fmt(t?.signups)} />
          <Kpi label="오늘 묘비 작성 · 사냥 판" value={t ? `${fmt(t.graves)} · ${fmt(t.hunts)}` : "…"} />
          <Kpi label="오늘 평균 체류" value={t ? duration(t.avgStaySec) : "…"} />
        </div>
        <div className={styles.channels}>
          <span className={styles.statLabel}>채널별 지금 접속</span>
          {lobby === null && <span className={ui.hint}>불러오는 중…</span>}
          {lobby === "error" && <span className={ui.hint}>실시간 서버 로비에 연결할 수 없어요.</span>}
          {live && (
            <>
              <span className={styles.chip}>
                전체 {live.total}/{live.totalCap}
              </span>
              {live.channels
                .filter((c) => c.open || c.count > 0)
                .map((c) => (
                  <span key={c.id} className={styles.chip}>
                    {c.id}채널 {c.count}/{c.cap}
                  </span>
                ))}
            </>
          )}
        </div>
      </div>

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>기간별</h2>
          <div className={styles.segmented} role="group" aria-label="기간">
            {RANGES.map(([value, label]) => (
              <button key={value} type="button" className={ui.button} aria-pressed={range === value} onClick={() => setRange(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <span className={an.sub}>
          {range === "hour" ? "최근 24시간 (시간대별)" : range === "day" ? "최근 30일" : range === "week" ? "최근 12주 (월요일 시작)" : "최근 3달 (보관 90일)"} · 동시 접속은 방문·머무르기
          신호가 올 때 1분 간격으로 찍은 값 중 최고값
        </span>
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
          <p className={ui.hint}>불러오는 중…</p>
        )}
      </div>

      {report && <Breakdown report={report} />}

      <div className={an.section}>
        <h2 className={an.sectionTitle}>운영 현황</h2>
        <div className={an.kpis}>
          <Kpi label="오늘 출석 보상 받은 계정" value={fmt(attended)} />
          <Kpi label="오늘 쌓인 포인트" value={fmt(earnedToday)} />
          <Kpi label="묘역의 묘비" value={fmt(graveCount)} />
          <Kpi label="성불한 이야기" value={fmt(passed?.total)} />
          <Kpi label="신고된 묘비" value={fmt(reportedCount)} />
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={an.kpi}>
      <span className={an.kpiValue}>{value}</span>
      <span className={an.kpiLabel}>{label}</span>
      {note && <span className={an.kpiNote}>{note}</span>}
    </div>
  );
}

const W = 300;
const H = 96;
const PAD_L = 26;
const PAD_B = 14;
const PAD_T = 4;

/** 값 하나짜리 막대 차트 (직접 그린 SVG). 막대에 마우스를 올리면 그 칸의 값이 머리에 나온다 */
function BarChart({ metric, series }: { metric: (typeof METRICS)[number]; series: SeriesPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const values = series.map((p) => p[metric.key]);
  const max = Math.max(1, ...values);
  const nice = niceMax(max);
  const plotW = W - PAD_L;
  const plotH = H - PAD_B - PAD_T;
  const step = plotW / Math.max(1, values.length);
  const barW = Math.max(1, step - 2);
  const summary =
    metric.summary === "sum"
      ? values.reduce((a, b) => a + b, 0)
      : metric.summary === "max"
        ? Math.max(0, ...values)
        : // 평균 체류는 방문 수로 가중 평균 (구간마다 평균을 그냥 평균 내면 방문이 적은 구간이 너무 크게 친다)
          Math.round(series.reduce((a, p) => a + p.avgStaySec * p.visits, 0) / Math.max(1, series.reduce((a, p) => a + p.visits, 0)));
  const head =
    active !== null
      ? `${series[active].label} · ${valueText(values[active], metric.unit)}`
      : `${metric.summary === "sum" ? "합계" : metric.summary === "max" ? "최고" : "평균"} ${valueText(summary, metric.unit)}`;
  const ticks = labelTicks(series.length);

  return (
    <figure className={an.chart} style={{ margin: 0 }}>
      <figcaption className={an.chartHead}>
        <span className={an.chartTitle}>{metric.title}</span>
        <span className={an.chartValue} aria-live="polite">
          {head}
        </span>
      </figcaption>
      <svg className={an.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric.title} 막대 차트`} onMouseLeave={() => setActive(null)}>
        <line className={an.grid} x1={PAD_L} x2={W} y1={PAD_T + 0.5} y2={PAD_T + 0.5} />
        <line className={an.grid} x1={PAD_L} x2={W} y1={PAD_T + plotH / 2 + 0.5} y2={PAD_T + plotH / 2 + 0.5} />
        <line className={an.grid} x1={PAD_L} x2={W} y1={PAD_T + plotH + 0.5} y2={PAD_T + plotH + 0.5} />
        <text className={an.axisText} x={PAD_L - 4} y={PAD_T + 4} textAnchor="end">
          {metric.unit === "sec" ? shortDur(nice) : fmt(nice)}
        </text>
        <text className={an.axisText} x={PAD_L - 4} y={PAD_T + plotH + 3} textAnchor="end">
          0
        </text>
        {values.map((v, i) => {
          const h = v > 0 ? Math.max(2, (v / nice) * plotH) : 0;
          const x = PAD_L + i * step + 1;
          return (
            <g key={i}>
              {h > 0 && (
                <rect className={i === active ? an.barActive : an.bar} x={x} y={PAD_T + plotH - h} width={barW} height={h} rx={Math.min(2, barW / 2)}>
                  <title>{`${series[i].label}: ${valueText(v, metric.unit)}`}</title>
                </rect>
              )}
              <rect className={an.hit} x={PAD_L + i * step} y={0} width={step} height={H - PAD_B} onMouseEnter={() => setActive(i)} />
            </g>
          );
        })}
        {ticks.map((i) => (
          <text key={i} className={an.axisText} x={PAD_L + i * step + step / 2} y={H - 2} textAnchor="middle">
            {series[i]?.label}
          </text>
        ))}
      </svg>
    </figure>
  );
}

/** 눈금 꼭대기: 1·2·5 × 10^n 중 max 이상인 가장 작은 값 */
function niceMax(max: number): number {
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}
function shortDur(sec: number): string {
  return sec >= 3600 ? `${Math.round(sec / 360) / 10}시간` : sec >= 60 ? `${Math.round(sec / 60)}분` : `${sec}초`;
}
/** x축 이름은 처음·가운데·끝 정도만 (겹치지 않게) */
function labelTicks(n: number): number[] {
  if (n <= 4) return Array.from({ length: n }, (_, i) => i);
  return [...new Set([0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1])];
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
          <RankList
            title="어디서 왔나"
            total={refTotal}
            rows={report.referrers.map((r) => ({ key: REF_LABELS[r.cat], count: r.count }))}
            keepZero
          />
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

function RankList({ title, rows, total, empty, keepZero }: { title: string; rows: Ranked; total?: number; empty?: string; keepZero?: boolean }) {
  const shown = keepZero ? rows : rows.filter((r) => r.count > 0);
  const sum = total ?? shown.reduce((n, r) => n + r.count, 0);
  const max = Math.max(1, ...shown.map((r) => r.count));
  return (
    <ul className={an.list} aria-label={title}>
      <li className={an.listTitle}>{title}</li>
      {shown.length === 0 || sum === 0 ? (
        <li className={an.empty}>{empty ?? "아직 기록이 없어요."}</li>
      ) : (
        shown.map((r) => (
          <li key={r.key} className={an.item}>
            <span className={an.itemName} title={r.key}>
              {r.key}
            </span>
            <span className={an.itemCount}>
              {fmt(r.count)} · {Math.round((r.count / sum) * 100)}%
            </span>
            <span className={an.track} aria-hidden>
              <span className={an.fill} style={{ display: "block", width: `${(r.count / max) * 100}%` }} />
            </span>
          </li>
        ))
      )}
    </ul>
  );
}
