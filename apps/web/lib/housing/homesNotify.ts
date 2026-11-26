import type { HomesZone } from "@tomb/protocol";
import { runAfter } from "@/lib/analyticsService";
import { homesNotify } from "@/lib/ban";
import type { MyHouseResponse } from "./types";

// 11/26 집 목록 바뀜 알림: 분양·외관·카라반 디자인·앞마당·넓히기·문패(이름) 저장이 끝나면 그 집 채널에 한 번 알린다
// (실시간 서버 /internal/homes → 그 채널 화면들이 같은 v로 다시 받는다). Redis 0, 응답을 보낸 뒤에 보낸다 — 실패해도 저장은 그대로(5분 주기에 보인다)

/** 알릴 채널·구역 (집이 없으면 null) */
export function homesTarget(res: Pick<MyHouseResponse, "house">): { ch: number; zone: HomesZone } | null {
  const h = res.house;
  if (!h || !Number.isInteger(h.ch) || h.ch < 1) return null;
  return { ch: h.ch, zone: h.zone ?? "village" };
}

/** 저장 응답을 받은 뒤 부른다 (응답은 그대로 돌려준다) */
export function notifyHomes<T extends Pick<MyHouseResponse, "house">>(res: T, now = Date.now()): T {
  const t = homesTarget(res);
  if (t) runAfter(() => homesNotify(t.ch, t.zone, now));
  return res;
}
