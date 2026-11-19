"use client";

import { markNoticesSeen } from "@/lib/hooks/useNotices";

// 11/20 게임 안 「개발자 노트」(예전 「공지」): 게임 안 공지 창 대신 개발자 노트 사이트를 새 탭으로 연다.
// 새 탭을 여는 순간 지금 가장 최근 공지까지 본 것으로 (새 글 점이 꺼진다)

/** 개발자 노트 목록(또는 글 하나)을 새 탭으로 */
export function openDevNotes(id?: string): void {
  window.open(id ? `/news/${encodeURIComponent(id)}` : "/news", "_blank", "noopener");
  markNoticesSeen();
}
