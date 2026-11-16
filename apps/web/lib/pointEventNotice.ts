import { POINT_EVENT_NOTICE_PREFIX, pointEventChangeNotice, pointEventEndNotice, pointEventStartNotice, type PointEvent } from "./pointEvent";
import { getPointEventStore } from "./store/pointEvent";
import { pushVillageNotice } from "./weeklyChamp";

// 포인트 배수 이벤트 마을 전체 공지 (주간 1위·행운권 공지와 같은 길 — 확성기 기록 + 실시간 서버로 모든 채널에).
// 줄 id는 POINT_EVENT_NOTICE_PREFIX로 시작해서, 게임 화면이 들으면 안내 띠·내 정보를 바로 다시 읽는다 (components/overlay/PointEventBadge).
//  - 시작·바뀜: 관리자 화면에서 켜거나 바꿀 때 (app/api/admin/point-event)
//  - 끝: 관리자가 끌 때, 또는 정해 둔 시각이 지나 처음 저장소를 읽는 요청 (lib/store/pointEvent) — 어느 쪽이든 이벤트마다 한 번

const noticeId = (ev: PointEvent, kind: string, now: number) => `${POINT_EVENT_NOTICE_PREFIX}${ev.startAt}-${kind}${kind === "c" ? now : ""}`;

export async function announceStart(ev: PointEvent, now = Date.now()): Promise<void> {
  await pushVillageNotice(pointEventStartNotice(ev, now), now, { id: noticeId(ev, "s", now) });
}

export async function announceChange(ev: PointEvent, now = Date.now()): Promise<void> {
  await pushVillageNotice(pointEventChangeNotice(ev, now), now, { id: noticeId(ev, "c", now) });
}

/** 끝 공지를 한 번만 (이미 보냈으면 false) */
export async function announceEndOnce(ev: PointEvent, now = Date.now()): Promise<boolean> {
  if (!(await getPointEventStore().claimEndNotice(ev.startAt))) return false;
  await pushVillageNotice(pointEventEndNotice(ev), now, { id: noticeId(ev, "e", now) });
  return true;
}
