"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { VersionPoller, type VersionStatus } from "@/lib/versionPoller";
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

export type { VersionStatus } from "@/lib/versionPoller";

/**
 * 새 버전 확인 (일정은 lib/versionPoller.ts): 보이는 탭은 90초마다, 숨은 탭은 묻지 않고 다시 보일 때 한 번.
 * 실시간 서버가 옛 버전이라 거절했으면(app:outdated) 바로 큰 패치 단계 + 새 배포가 보일 때까지 15초마다.
 */
export function useNewVersion(): VersionStatus {
  const [status, setStatus] = useState<VersionStatus>({ level: "none", deployReady: false });
  const rejected = useBridgeValue("app:outdated") !== undefined;
  const poller = useRef<VersionPoller | null>(null);

  useEffect(() => {
    const p = new VersionPoller({
      fetchVersion: () => api.version(),
      isHidden: () => document.hidden,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
      baseline: process.env.NEXT_PUBLIC_APP_VERSION || null,
      onChange: setStatus,
    });
    poller.current = p;
    p.start();
    const onVisibility = () => (document.hidden ? p.onHidden() : p.onVisible());
    const onShow = () => p.onVisible();
    window.addEventListener("focus", onShow);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      p.stop();
      poller.current = null;
      window.removeEventListener("focus", onShow);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // 실시간 서버가 거절했으면 /api/version을 기다리지 않고 바로 큰 패치 단계로. 새 배포가 보이는지 바로·자주 확인한다
  useEffect(() => {
    if (rejected) poller.current?.markRejected();
  }, [rejected]);

  return rejected ? { level: "required", deployReady: status.deployReady } : status;
}
