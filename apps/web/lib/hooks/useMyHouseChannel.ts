"use client";

import { useEffect, useState } from "react";
import { housingApi } from "@/lib/housing/client";

/**
 * 내 집이 있는 채널 (없으면 null, 아직 모르면 undefined). 채널마다 주거 구역이 따로라,
 * 평소 닫혀 있는 채널에 집이 있어도 채널 목록에 그 채널을 보여 주는 데 쓴다. enabled=false면 묻지 않는다(새 계정)
 */
export function useMyHouseChannel(enabled = true): number | null | undefined {
  const [ch, setCh] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    housingApi
      .mine()
      .then((r) => alive && setCh(r.house?.ch ?? null))
      .catch(() => alive && setCh(null));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? ch : null;
}
