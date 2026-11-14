import type { ActivityItem } from "@/lib/types";

/** "방금" · "5분 전" · "3시간 전" · "2일 전" */
export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86_400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86_400)}일 전`;
}

/** 소식 한 줄 */
export function activityText(item: ActivityItem): string {
  const target = `'${item.targetName}'`;
  switch (item.kind) {
    case "flower":
      return `${item.who}님이 ${target}에 헌화했어요`;
    case "revive":
      // 49번에서 없어진 소식 (API가 걸러 낸다)
      return `${target}에 마음이 닿았어요`;
    case "passed":
      return `${target}이(가) 성불했어요. 성불한 이야기들에서 다시 볼 수 있어요`;
    case "houseLike":
      return `${item.who}님이 내 집 ${target}에 좋아요를 눌렀어요`;
    case "guestbook":
      return `${item.who}님이 ${target} 방명록에 글을 남겼어요`;
    case "restore":
      return `${target}이(가) 성황당에서 다시 모셔졌어요`;
    case "champ":
      return `지난주 ${item.targetName}에 올랐어요! 1위 전용 꾸미기·오라·배지와 포인트를 받았어요`;
  }
}

/** 집 관련 소식은 분양 사무소로, 성불은 성불한 이야기들로, 나머지는 그 묘비로 */
export const isHouseActivity = (item: ActivityItem) => item.kind === "houseLike" || item.kind === "guestbook";
