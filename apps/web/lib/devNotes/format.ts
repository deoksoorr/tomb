// 개발자 노트 날짜·글 조각 (서버·화면 공용)

/** "2026-11-19" → "2026. 11. 19" */
export const bigDate = (d: string): string => d.split("-").join(". ");

/** "2026-11-19" → ["2026", "11", "19"] */
export const dateParts = (d: string): [string, string, string] => {
  const [y = "", m = "", dd = ""] = d.split("-");
  return [y, m, dd];
};

/** 문단 나누기 (빈 줄 기준) */
export const paragraphs = (t: string): string[] =>
  t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** 첫 문장 */
export const firstSentence = (t: string): string => t.split(/(?<=[.?!])\s/)[0] ?? t;

/** 목록·카드에 쓰는 한 줄 소개 */
export const noteExcerpt = (n: { summary?: string; intro: string }): string =>
  n.summary ? `${n.summary}. ${firstSentence(n.intro)}` : firstSentence(n.intro);

/** 대표 이미지가 없는 글(게임에서 새로 쓴 공지)에 쓰는 그림: 마을 전경 */
export const DEFAULT_HERO = "/devnotes/hero-1112.webp";

/** 최근 이틀 안 글이면 「새 글」 */
export const isFresh = (createdAt: number, newest: number): boolean => newest - createdAt < 2 * 86_400_000;
