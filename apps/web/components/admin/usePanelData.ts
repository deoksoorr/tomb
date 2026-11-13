"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";

export type PanelLoad<T> = {
  data: T | null;
  /** 마지막으로 불러오기에 실패한 이유 (성공하면 null) */
  error: string | null;
  /** 같은 조건으로 다시 받기 */
  retry: () => void;
};

/** 관리자 패널 공용: deps가 바뀔 때마다 load()로 다시 받는다. 401이면 로그인 화면으로, 그 밖의 실패는 알림 + error */
export function usePanelLoad<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  toast: (message: string) => void,
  onAuthLost: () => void,
): PanelLoad<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    load().then(
      (d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiRequestError && e.status === 401) return onAuthLost();
        const msg = errorMessage(e);
        setError(msg);
        toast(msg);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, toast, onAuthLost]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, retry };
}

/** 데이터만 필요할 때 (예전 호출 그대로) */
export function usePanelData<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  toast: (message: string) => void,
  onAuthLost: () => void,
): T | null {
  return usePanelLoad(load, deps, toast, onAuthLost).data;
}
