import { SPROUT_MINUTES } from "@tomb/protocol";

// 11/22 새싹 표시 (운영자 승인): 총 접속 시간이 3시간이 안 된 새 이웃은 머리 위 이름표·채팅 이름 앞에 작은 새싹.
//  - 총 접속 시간 = 계정 해시 stayMin (관리자 「총 접속 시간」과 같은 값, 머무르기 기록마다 10분씩)
//  - stayMin은 11/16부터 쌓였고 그 전은 이틀치만 채웠다 → 그 전에 온 오래된 이웃이 3시간 미만으로 잡히지 않게
//    처음 입장(createdAt)이 SPROUT_SINCE 이후인 계정만 (createdAt 0 = 기록 전 옛 계정 → 새싹 아님)
//  - 운영자·매니저는 빼고, 랭킹·친구 목록에는 싣지 않는다 (입장 토큰 → 이름표·채팅만)

/** 이 시각 이후 처음 들어온 계정만 새싹이 될 수 있다 (2026-11-14 00:00 KST) */
export const SPROUT_SINCE = Date.UTC(2026, 10, 13, 15, 0, 0);

/**
 * 입장 토큰에 실을 새싹 남은 분 (1~180). 새싹이 아니면 0.
 * 실시간 서버가 들어온 시각 + 남은 분을 끝나는 시각으로 잡아, 접속해 있는 동안 3시간이 차면 화면에서 저절로 사라진다
 */
export function sproutLeftMinutes(a: { stayMin: number; createdAt: number }, who: { staff: boolean; mgr: boolean }): number {
  if (who.staff || who.mgr) return 0;
  if (!(a.createdAt >= SPROUT_SINCE)) return 0;
  const left = SPROUT_MINUTES - Math.max(0, Math.floor(a.stayMin || 0));
  return left > 0 ? Math.min(SPROUT_MINUTES, left) : 0;
}
