import { plotLabel } from "@tomb/protocol";

/**
 * 묘비가 묻힌 자리. 목록 순서(등록 순) = 격자 순서라 목록 안 위치가 곧 자리 번호다.
 * 부활 대기석(살려주세요 상위)에 올라 있으면 순위를 덧붙인다. 목록에 없으면 null
 */
export function graveLocation(
  graves: readonly { id: string }[],
  reviveTop: readonly string[],
  graveId: string,
): string | null {
  const index = graves.findIndex((g) => g.id === graveId);
  if (index === -1) return null;
  const rank = reviveTop.indexOf(graveId);
  return rank === -1 ? plotLabel(index) : `${plotLabel(index)} · 부활 대기석 ${rank + 1}위`;
}
