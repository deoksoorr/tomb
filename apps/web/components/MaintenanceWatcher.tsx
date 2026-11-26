"use client";

import { useEffect, useState } from "react";
import { MAINT_POLL_MS, type MaintState } from "@tomb/protocol";
import { MAINT_EVENT } from "@/lib/maintClient";
import { maintUntilLabel } from "@/lib/maintText";
import styles from "./MaintenanceWatcher.module.css";

// 11/26 점검 모드 화면 (게임 안). 실시간 서버가 4013으로 끊거나 API가 503 MAINTENANCE를 주면 lib/maintClient가 이벤트를 띄운다.
// 그때만 화면을 덮고 /api/maintenance를 30초마다(탭이 다시 보일 때도) 확인해 끝나면 새로고침한다 → 처음 화면부터 저절로 다시 들어온다.
// 평소에는 아무것도 그리지 않고 아무것도 묻지 않는다. 첫 화면·개발자 노트 등은 미들웨어가 같은 모양의 503 화면을 준다.

async function fetchState(): Promise<MaintState | null> {
  try {
    const r = await fetch("/api/maintenance", { cache: "no-store" });
    return r.ok ? ((await r.json()) as MaintState) : null;
  } catch {
    return null;
  }
}

export default function MaintenanceWatcher() {
  const [active, setActive] = useState(false);
  const [state, setState] = useState<MaintState | null>(null);

  useEffect(() => {
    const on = () => setActive(true);
    window.addEventListener(MAINT_EVENT, on);
    return () => window.removeEventListener(MAINT_EVENT, on);
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const check = async () => {
      const s = await fetchState();
      if (!alive || !s) return;
      // 점검이 끝났다 → 새로고침 (미들웨어 기억이 아직 「점검 중」이면 같은 모양의 점검 화면이 30초마다 다시 확인한다)
      if (!s.on) window.location.reload();
      else setState(s);
    };
    void check();
    const timer = setInterval(() => void check(), MAINT_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  if (!active) return null;
  const until = maintUntilLabel(state?.until ?? null);
  return (
    <div className={styles.screen} role="alertdialog" aria-modal="true" aria-labelledby="maint-title">
      <div className={styles.card}>
        <div className={styles.ghost} aria-hidden="true" />
        <h1 id="maint-title" className={styles.title}>
          서버 점검 중이에요
        </h1>
        <p className={styles.msg}>{state?.msg || "더 좋은 마을로 돌아올게요."}</p>
        {until && <p className={styles.until}>{until}쯤 끝나요</p>}
        <p className={styles.note}>이 화면을 열어 두면 점검이 끝날 때 저절로 새로고침돼요.</p>
      </div>
    </div>
  );
}
