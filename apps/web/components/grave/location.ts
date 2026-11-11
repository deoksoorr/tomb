import { plotLabel } from "@tomb/protocol";

/**
 * 묘비가 묻힌 자리. 목록 순서(등록 순) = 격자 순서라 목록 안 위치가 곧 자리 번호다. 목록에 없으면 null.
 * (49번에서 살려주세요 "다시 피어날 자리"가 없어져 순위는 붙이지 않는다)
 */
export function graveLocation(graves: readonly { id: string }[], graveId: string): string | null {
  const index = graves.findIndex((g) => g.id === graveId);
  return index === -1 ? null : plotLabel(index);
}
