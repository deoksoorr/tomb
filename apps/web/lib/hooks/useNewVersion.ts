"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const CHECK_MS = 5 * 60_000;

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

/** 5분마다·창으로 돌아올 때 배포 버전을 확인한다 */
export function useNewVersion(): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    const isNew = versionTracker(process.env.NEXT_PUBLIC_APP_VERSION || null);
    let alive = true;
    const check = async () => {
      try {
        const { version } = await api.version();
        if (alive && isNew(version)) setOutdated(true);
      } catch {
        // 확인 실패는 다음 주기에
      }
    };
    void check();
    const timer = setInterval(check, CHECK_MS);
    window.addEventListener("focus", check);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);
  return outdated;
}
