"use client";

import { useState } from "react";
import type { Ranked, SeriesPoint } from "@/lib/analyticsReport";
import an from "./Analytics.module.css";

// 47번 대시보드·유입 분석이 같이 쓰는 막대 차트·순위 목록·숫자 도우미 (직접 그린 SVG, 색은 토큰만)

export type MetricKey = Exclude<keyof SeriesPoint, "label">;
export type Metric = { key: MetricKey; title: string; unit: "명" | "번" | "개" | "판" | "sec"; summary: "sum" | "max" | "avg" };

/** 기간별 차트 (작은 차트 여러 개, 차트마다 값 하나) */
export const METRICS: Metric[] = [
  { key: "visitors", title: "방문자 (고유)", unit: "명", summary: "max" },
  { key: "visits", title: "방문 (세션)", unit: "번", summary: "sum" },
  { key: "peak", title: "최고 동시 접속", unit: "명", summary: "max" },
  { key: "signups", title: "신규 가입", unit: "명", summary: "sum" },
  { key: "graves", title: "묘비 작성", unit: "개", summary: "sum" },
  { key: "hunts", title: "사냥 판 수", unit: "판", summary: "sum" },
  { key: "avgStaySec", title: "평균 체류 시간", unit: "sec", summary: "avg" },
];
export const metric = (key: MetricKey) => METRICS.find((m) => m.key === key)!;

export const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "…" : n.toLocaleString("ko-KR"));
export function duration(sec: number): string {
  if (sec <= 0) return "0초";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${s ? `${s}초` : ""}`.trim();
  return `${s}초`;
}
export const valueText = (v: number, unit: Metric["unit"]) => (unit === "sec" ? duration(v) : `${fmt(v)}${unit}`);

const W = 300;
const H = 96;
const PAD_L = 26;
const PAD_B = 14;
const PAD_T = 4;

/** 값 하나짜리 막대 차트. 막대에 마우스를 올리면 그 칸의 값이 머리에 나온다 */
export function BarChart({ metric, series }: { metric: Metric; series: SeriesPoint[] }) {
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

/** 이름 · 횟수 · 비율 막대 목록 (limit개까지) */
export function RankList({
  title,
  rows,
  total,
  empty,
  keepZero,
  limit,
}: {
  title: string;
  rows: Ranked;
  total?: number;
  empty?: string;
  keepZero?: boolean;
  limit?: number;
}) {
  const all = keepZero ? rows : rows.filter((r) => r.count > 0);
  const shown = limit ? all.slice(0, limit) : all;
  const sum = total ?? all.reduce((n, r) => n + r.count, 0);
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
              {fmt(r.count)} <span className={an.itemPct}>{Math.round((r.count / sum) * 100)}%</span>
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
