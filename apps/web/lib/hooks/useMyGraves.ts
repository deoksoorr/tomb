"use client";

import { useEffect, useState } from "react";
import { myGraveEntries, type MyGraveEntry } from "@/components/account/items";
import { api } from "@/lib/api";
import type { PublicGrave } from "@/lib/types";
import type { GravesSnapshot } from "./useGraves";

// 다른 채널에 세운 내 묘비는 지금 목록에 없으니 상세를 한 번 받아 둔다 (자주 바뀌지 않아 탭 동안 기억).
// 찾지 못한 묘비(이장·숨김)는 다시 묻지 않는다.
const otherChannelGraves = new Map<string, PublicGrave>();
const notFound = new Set<string>();

/** 내 묘비 전부 (지금 채널 + 다른 채널). pending: 아직 찾는 중인 묘비 수 */
export function useMyGraves(
  ids: readonly string[],
  current: GravesSnapshot,
): { entries: MyGraveEntry[]; pending: number } {
  const [others, setOthers] = useState<ReadonlyMap<string, PublicGrave>>(() => new Map(otherChannelGraves));
  const [, setMisses] = useState(0);
  const unresolved = ids.filter((id) => !current.byId.has(id) && !others.has(id) && !notFound.has(id));
  const missingKey = current.loaded ? unresolved.join(",") : "";

  useEffect(() => {
    if (!missingKey) return;
    let alive = true;
    const wanted = missingKey.split(",");
    void Promise.all(
      wanted.map((id) =>
        api
          .graveDetail(id)
          .then((d) => d.grave)
          .catch(() => null),
      ),
    ).then((found) => {
      found.forEach((g, i) => {
        if (g) otherChannelGraves.set(g.id, g);
        else notFound.add(wanted[i]);
      });
      if (!alive) return;
      setOthers(new Map(otherChannelGraves));
      setMisses(notFound.size);
    });
    return () => {
      alive = false;
    };
  }, [missingKey]);

  return { entries: myGraveEntries(ids, current.graves, others), pending: unresolved.length };
}
