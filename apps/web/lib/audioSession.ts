// 아이폰 사파리(iOS 16.4+)의 오디오 세션 종류 (navigator.audioSession.type). 없는 브라우저(크롬·안드로이드·옛 사파리)는 아무것도 안 한다.
// 기본값 'auto'면 웹킷이 그때그때 울리는 소리(<audio>·WebAudio, 소리/무음)를 보고 세션 종류를 다시 고른다
//  → 효과음·환경음이 났다 멎을 때마다 세션이 바뀌며 다이내믹 아일랜드 '재생 중'이 깜빡이고 소리가 멈칫한다.
// 그래서 종류를 직접 고정한다:
//  - BGM을 트는 동안 'playback': 무음 스위치를 켜도 음악이 나오고(한국은 무음 모드가 흔하다) 잠금 화면 곡 정보·버튼이 유지된다.
//    ('ambient'로 두면 아일랜드 표시는 사라지지만 무음 모드에서 BGM까지 꺼진다 → 쓰지 않는다)
//  - BGM을 끈 동안 'ambient': 효과음만 나므로 사용자의 다른 음악 앱을 끊지 않고 섞인다 ('auto'에서 WebAudio만 울릴 때와 같은 종류).
// 바꾸는 것은 BGM을 켜고 끌 때뿐이다 (같은 값이면 건드리지 않는다).

export type AudioSessionKind = "playback" | "ambient";

type AudioSessionLike = { type: string };

let applied: AudioSessionKind | null = null;

/** 지금 정한 종류 (테스트·QA) */
export function audioSessionKind(): AudioSessionKind | null {
  return applied;
}

export function setAudioSessionType(kind: AudioSessionKind): void {
  if (applied === kind || typeof navigator === "undefined") return;
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  if (!session) return;
  try {
    if (session.type !== kind) session.type = kind;
    applied = kind;
  } catch {
    // 지원하지 않는 값이면 조용히 (자동에 맡긴다)
  }
}
