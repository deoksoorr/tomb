"use client";

import { useSyncExternalStore } from "react";
import { request } from "./api";
import type { UserReportReason } from "./reports";

// 47번 게임 안 신고 (유저·확성기): 신고 창을 여는 작은 저장소와 API 호출. 사유 목록·라벨은 lib/reports.ts (서버와 공용)

export type ReportTarget =
  | { type: "user"; name: string; sid: number; ch?: number; room?: string }
  | { type: "megaphone"; name: string; id: string; text: string };

let target: ReportTarget | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const reportStore = {
  open(t: ReportTarget) {
    target = t;
    emit();
  },
  close() {
    target = null;
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  get: () => target,
};

export const useReportTarget = () => useSyncExternalStore(reportStore.subscribe, reportStore.get, () => null);

export function submitReport(t: ReportTarget, reason: UserReportReason, memo: string): Promise<{ ok: true }> {
  const body =
    t.type === "user"
      ? { type: "user", sid: t.sid, ...(t.room ? { room: t.room } : { ch: t.ch }), reason, memo }
      : { type: "megaphone", id: t.id, reason, memo };
  return request<{ ok: true }>("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
