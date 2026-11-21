"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, request } from "@/lib/api";
import type { StaffPeopleResponse } from "@/lib/staffPeople";
import { tabHidden } from "./visibleAgain";

// 11/20 운영자 「접속 중인 사람」 (친구 창 순간이동 목록·채널 창 다른 맵 명단). 운영자가 아니면 부르지 않는다

export const staffPeopleApi = {
  list: () => request<StaffPeopleResponse>("/api/staff/people", { cache: "no-store" }),
};

/** on일 때만 열자마자 한 번, 그 뒤 pollMs마다 (숨긴 탭은 건너뛴다) */
export function useStaffPeople(on: boolean, pollMs: number): { data: StaffPeopleResponse | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<StaffPeopleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    staffPeopleApi.list().then(
      (r) => {
        setData(r);
        setError(null);
      },
      (e: unknown) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(() => {
    if (!on) return;
    reload();
    const t = setInterval(() => !tabHidden() && reload(), pollMs);
    return () => clearInterval(t);
  }, [on, pollMs, reload]);
  return { data, error, reload };
}
