// 개발자 노트 사이트(/news·/guide·/faq·/story) 데이터 모양

export type DevNoteSection = { img: string | null; heading: string; text: string };

export type DevNote = {
  /** 공지 저장소 id와 같다 (게임에서 쓴 공지가 그대로 이어진다) */
  id: string;
  title: string;
  /** KST 날짜 YYYY-MM-DD */
  date: string;
  createdAt: number;
  pinned: boolean;
  /** 대표 이미지 (/devnotes/*.webp). 게임에서 새로 쓴 공지는 없다 */
  hero: string | null;
  summary?: string;
  intro: string;
  callout?: string;
  sections: readonly DevNoteSection[];
  outro: string;
  /** 공지 저장소에서 온 글 (게임에서 쓴 공지·관리자 편집기로 쓰거나 고친 글). 정적 글 원본이면 없다 */
  fromStore?: boolean;
};

export type GuideBlock =
  | { p: readonly string[] }
  | { list: readonly string[] }
  | { table: { head: readonly string[]; rows: readonly (readonly string[])[] } };

export type GuidePart = {
  id: string;
  title: string;
  desc: string;
  images: readonly (readonly [string, string])[];
  sections: readonly { h: string; blocks: readonly GuideBlock[] }[];
};

export type FaqData = { cats: readonly string[]; items: readonly { cat: string; q: string; a: string }[] };

export type StoryData = {
  sub: string;
  lead: string;
  stats: readonly (readonly [string, string, string])[];
  arch: { h: string; before: string; alt: string; items: readonly string[] };
  how: { h: string; text: string };
  cases: { h: string; items: readonly { t: string; rows: readonly (readonly [string, string])[] }[] };
  closing: string;
};
