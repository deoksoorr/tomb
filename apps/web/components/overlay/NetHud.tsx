"use client";

import { useState } from "react";
import type { NetStats } from "@/game/bridge";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import styles from "./NetHud.module.css";

/** ?debug=1 전용 네트워크 지표 */
export default function NetHud() {
  const [stats, setStats] = useState<NetStats | null>(null);
  const status = useBridgeValue("net:status");
  // 11/23 운영자가 자리(붕어빵 수레 후보 등)를 캡처로 알려 줄 때 쓰는 내 위치 (맵 · x,y)
  const dots = useBridgeValue("minimap:dots");
  useBridgeEvent("net:stats", setStats);

  const rows: [string, string][] = [
    ["mode", status?.mode ?? "-"],
    ["RTT", stats?.rttMs != null ? `${Math.round(stats.rttMs)}ms` : "-"],
    ["snap", stats ? `${stats.snapshotHz.toFixed(1)}Hz` : "-"],
    ["peers", stats ? String(stats.peers) : "-"],
    ["fps", stats ? String(Math.round(stats.fps)) : "-"],
    ["in", stats ? `${stats.inKBps.toFixed(2)}KB/s` : "-"],
    ["pos", dots ? `${dots.map ?? "village"} ${Math.round(dots.me.x)},${Math.round(dots.me.y)}` : "-"],
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
