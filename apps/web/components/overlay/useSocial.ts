"use client";

import { useEffect, useRef } from "react";
import { bridge } from "@/game/bridge";
import { ATTEND_STAY_MINUTES, ATTEND_STAY_TEXT } from "@/lib/attendStay";
import { giftsStore, useGifts } from "@/lib/hooks/useGifts";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";

/** 선물함을 다시 확인하는 간격 */
const GIFT_POLL_MS = 5 * 60_000;

/**
 * 10·11번 알림: 출석 도장을 받을 수 있게 됐는지(그날 정해진 시간 머묾, 머무르기 응답의 me로 갱신)와 안 받은 선물 수.
 * HUD·메뉴의 빨간 점에 쓰고, 처음 받을 수 있게 된 순간·새 선물이 왔을 때 한 번 알린다
 */
export function useSocial(ready: boolean): { calendarReady: boolean; giftCount: number } {
  const { me } = useMe();
  const { unclaimed, gifts } = useGifts();
  const calendarReady = !!me && !me.attendance.today && me.attendance.stayMinutes >= ATTEND_STAY_MINUTES;

  useEffect(() => {
    if (!ready) return;
    void giftsStore.refresh();
    const t = setInterval(() => void giftsStore.refresh(), GIFT_POLL_MS);
    return () => clearInterval(t);
  }, [ready]);

  // 관리자 포인트 지급·선물 등 서버에서 내 계정이 바뀌면 실시간 서버가 알려 준다 → 바로 다시 받는다
  useEffect(
    () =>
      bridge.on("me:stale", () => {
        void meStore.refresh();
        void giftsStore.refresh();
      }),
    [],
  );

  const wasReady = useRef(false);
  useEffect(() => {
    if (ready && calendarReady && !wasReady.current) showToast(`마을에 ${ATTEND_STAY_TEXT} 머물렀어요! 출석 달력에서 오늘 출석 도장을 찍어 주세요.`, 6_000);
    wasReady.current = calendarReady;
  }, [ready, calendarReady]);

  const seenGifts = useRef<number | null>(null);
  useEffect(() => {
    if (gifts === null) return;
    if (seenGifts.current !== null && unclaimed > seenGifts.current) showToast("선물이 도착했어요! 선물함을 열어 보세요.", 6_000);
    seenGifts.current = unclaimed;
  }, [gifts, unclaimed]);

  return { calendarReady, giftCount: unclaimed };
}
