"use client";

import type { LobbyInfo } from "@tomb/protocol";
import { earnRule } from "@/lib/economy";
import ui from "../ui/ui.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
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

/**
 * 48번 대시보드 (간단판): 지금 접속(실시간 로비), 오늘 출석·적립(경제 통계), 묘역·성불·신고 수.
 * 오늘 방문자 수·유입 경로는 47번(방문 분석)에서 따로 모은다 — 그 전까지는 출석 보상 받은 계정 수로 어림한다
 */
export default function DashboardPanel({ toast, onAuthLost, lobby, graveCount, reportedCount, version }: Props) {
  const econ = usePanelData(() => adminApi.economy(1), [version], toast, onAuthLost);
  const passed = usePanelData(() => adminApi.passed("", 0), [version], toast, onAuthLost);
  const today = econ?.days[0]; // 최근 날짜 먼저 = 오늘
  const attendPts = earnRule("attend").points;
  const attended = today ? Math.round((today.earned.attend ?? 0) / attendPts) : null;
  const earnedToday = today
    ? Object.entries(today.earned).reduce((n, [k, v]) => (k === "refund" || k === "admin" ? n : n + v), 0)
    : null;
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "…" : n.toLocaleString("ko-KR"));

  return (
    <section className={styles.notices} aria-label="대시보드">
      <div className={styles.summary}>
        <Stat label="지금 접속" value={lobby && lobby !== "error" ? fmt(lobby.total) : lobby === "error" ? "?" : "…"} />
        <Stat label="오늘 출석 보상 받은 계정 (방문자 어림)" value={fmt(attended)} />
        <Stat label="오늘 쌓인 포인트" value={fmt(earnedToday)} />
        <Stat label="묘역의 묘비" value={fmt(graveCount)} />
        <Stat label="성불한 이야기" value={fmt(passed?.total)} />
        <Stat label="신고된 묘비" value={fmt(reportedCount)} />
        <div className={styles.channels}>
          <span className={styles.statLabel}>채널 현황</span>
          {lobby === null && <span className={ui.hint}>불러오는 중…</span>}
          {lobby === "error" && <span className={ui.hint}>실시간 서버 로비에 연결할 수 없어요.</span>}
          {lobby && lobby !== "error" && (
            <>
              <span className={styles.chip}>
                접속 {lobby.total}/{lobby.totalCap}
              </span>
              {lobby.channels
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
      <p className={ui.hint}>오늘 방문자 수(중복 제외)·유입 경로는 방문 분석(47번)을 붙이면 여기에 나와요.</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
