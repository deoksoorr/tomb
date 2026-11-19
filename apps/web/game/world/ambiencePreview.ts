import type { AmbienceOverride } from "@/lib/ambience";

// 11/19 촬영 모드 시간대·날씨 필터: 내 화면의 하늘(Atmosphere)만 잠깐 다른 시간대·날씨로 보여 줘요.
// 날씨 계산·마을 생활·서버는 그대로. null = 미리보기 없음 (평소). 바뀔 때마다 판(version)이 올라가 장면이 바로 다시 잡아요.

let preview: AmbienceOverride | null = null;
let version = 0;

export function setAmbiencePreview(next: AmbienceOverride | null): void {
  const same = (preview === null && next === null) || (preview !== null && next !== null && preview.hour === next.hour && preview.weather === next.weather);
  if (same) return;
  preview = next ? { ...next } : null;
  version++;
}

export function ambiencePreview(): AmbienceOverride | null {
  return preview;
}

export function ambiencePreviewVersion(): number {
  return version;
}
