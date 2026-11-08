"use client";

import { useState } from "react";
import type { NetStats } from "@/game/bridge";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import styles from "./NetHud.module.css";

/** ?debug=1 전용 네트워크 지표 */
export default function NetHud() {
  const [stats, setStats] = useState<NetStats | null>(null);
  const status = useBridgeValue("net:status");
  useBridgeEvent("net:stats", setStats);

  const rows: [string, string][] = [
    ["mode", status?.mode ?? "-"],
    ["RTT", stats?.rttMs != null ? `${Math.round(stats.rttMs)}ms` : "-"],
    ["snap", stats ? `${stats.snapshotHz.toFixed(1)}Hz` : "-"],
    ["peers", stats ? String(stats.peers) : "-"],
    ["fps", stats ? String(Math.round(stats.fps)) : "-"],
    ["in", stats ? `${stats.inKBps.toFixed(2)}KB/s` : "-"],
  ];

  return (
    <dl className={styles.netHud} aria-label="네트워크 디버그 정보">
      {rows.map(([k, v]) => (
        <div key={k} className={styles.row}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
