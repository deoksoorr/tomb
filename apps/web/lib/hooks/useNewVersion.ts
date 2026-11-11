"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { CHECK_HIDDEN_MS, CHECK_VISIBLE_MS, CHECK_WAITING_MS, versionLevel, type UpdateLevel } from "@/lib/update";
import { useBridgeValue } from "./useBridge";

/**
 * 기준 버전과 다른 버전이 보이면 true. 기준은 빌드 때 넣은 값(NEXT_PUBLIC_APP_VERSION)이고,
 * 없으면 처음 받은 /api/version 응답을 기준으로 삼는다.
 */
export function versionTracker(baseline: string | null): (current: string) => boolean {
  let base = baseline;
  return (current) => {
    if (!base) {
      base = current;
      return false;
    }
    return current !== base;
  };
}

export type VersionStatus = {
  level: UpdateLevel;
  /** 새로고침하면 실제로 새 빌드를 받는지 (실시간 서버만 먼저 바뀌었으면 false) */
  deployReady: boolean;
};

/**
 * 배포 버전 확인: 보이는 탭은 2분마다, 숨은 탭은 5분마다, 창으로 돌아올 때 바로.
 * 실시간 서버가 옛 버전이라 거절했는데(app:outdated) 아직 새 배포가 안 보이면 15초마다 다시 본다.
 * 단계는 내려가지 않는다 (한 번 새 버전을 봤으면 새로고침 전까지 안내를 유지).
 */
export function useNewVersion(): VersionStatus {
  const [status, setStatus] = useState<VersionStatus>({ level: "none", deployReady: false });
  const rejected = useBridgeValue("app:outdated") !== undefined;
  const rejectedRef = useRef(rejected);
  const statusRef = useRef(status);
  useEffect(() => {
    rejectedRef.current = rejected;
    statusRef.current = status;
  }, [rejected, status]);

  useEffect(() => {
    let base = process.env.NEXT_PUBLIC_APP_VERSION || null;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const RANK: Record<UpdateLevel, number> = { none: 0, patch: 1, required: 2 };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      const s = statusRef.current;
      const waiting = (rejectedRef.current || s.level === "required") && !s.deployReady;
      const ms = waiting ? CHECK_WAITING_MS : document.hidden ? CHECK_HIDDEN_MS : CHECK_VISIBLE_MS;
      timer = setTimeout(() => void check(), ms);
    };
    const check = async () => {
      try {
        const info = await api.version();
        if (!alive) return;
        if (!base) base = info.version;
        const next = versionLevel(base, info);
        setStatus((prev) => {
          const level = RANK[next.level] > RANK[prev.level] ? next.level : prev.level;
          const deployReady = prev.deployReady || next.deployReady;
          if (level === prev.level && deployReady === prev.deployReady) return prev;
          return { level, deployReady };
        });
      } catch {
        // 확인 실패는 다음 주기에
      }
      if (alive) schedule();
    };
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    void check();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 실시간 서버가 거절했으면 /api/version을 기다리지 않고 바로 큰 패치 단계로. 새 배포가 보이는지 바로 확인한다
  useEffect(() => {
    if (!rejected) return;
    void api.version().then(
      (info) => {
        const base = process.env.NEXT_PUBLIC_APP_VERSION || null;
        if (base && info.version !== base) setStatus((prev) => (prev.deployReady ? prev : { ...prev, deployReady: true }));
      },
      () => {},
    );
  }, [rejected]);

  return rejected ? { level: "required", deployReady: status.deployReady } : status;
}
