// 개발자 노트 편집기 한도 (관리자 화면·서버 검증 공용 — 서버 전용 모듈을 부르지 않는다)
// 글자 수는 코드포인트로 센다. 꼭지·맺음말을 다 채워도 본문(NoticeDoc) JSON이 100KB 안쪽이 되게 잡았다.

export const DEV_NOTE_LIMITS = {
  title: 60,
  summary: 80,
  /** 첫 문단 (공지 목록에도 실리는 body) */
  intro: 1500,
  /** 블록 수 (소제목·글·이미지 합계) */
  blocks: 40,
  /** 이미지 블록 수 (대표 이미지 빼고) */
  images: 20,
  heading: 60,
  /** 「글」 블록 하나 */
  text: 4000,
  outro: 1000,
  /** 「먼저 알려 드릴 것」 상자 */
  callout: 500,
  /** 첫 문단·먼저 알려 드릴 것·소제목·글·맺음말 합계 */
  total: 24000,
} as const;

/** 코드포인트 글자 수 */
export const charCount = (s: string): number => [...s].length;

/** 줄 끝 정리: CRLF → LF, 앞뒤 공백 제거, 빈 줄 여러 개는 하나로 (문단 나누기 규칙은 빈 줄 하나) */
export const tidyText = (s: string): string =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** 한 줄 칸: 줄바꿈·연속 공백을 한 칸으로 */
export const oneLineText = (s: string): string => s.replace(/\s+/g, " ").trim();
