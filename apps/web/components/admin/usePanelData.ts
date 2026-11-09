"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";

/** 관리자 탭 공용: deps가 바뀔 때마다 load()로 다시 받는다. 401이면 로그인 화면으로 */
export function usePanelData<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  toast: (message: string) => void,
  onAuthLost: () => void,
): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    load().then(
      (d) => alive && setData(d),
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
        else toast(errorMessage(e));
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, toast, onAuthLost]);
  return data;
}
