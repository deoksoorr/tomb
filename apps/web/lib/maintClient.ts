// 11/26 점검 모드 (브라우저). 실시간 서버가 4013으로 끊거나 API가 503 MAINTENANCE를 돌려주면 이 이벤트를 띄운다 →
// components/MaintenanceWatcher가 「서버 점검 중이에요」 화면을 덮고 30초마다 확인해 끝나면 새로고침한다.

export const MAINT_EVENT = "tomb:maintenance";

/** 점검 화면 띄우기 (여러 번 불러도 화면은 하나) */
export function signalMaintenance(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MAINT_EVENT));
}
