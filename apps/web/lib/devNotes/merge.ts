import { todayKst } from "@/lib/epitaph";
import type { Notice, NoticeBlock, NoticeDoc } from "@/lib/types";
import type { DevNote, DevNoteSection } from "./types";

// 정적 개발자 노트(지난 공지를 다시 쓴 글) + 게임에서 새로 쓴 공지를 하나의 목록으로.
// 같은 id면: 관리자 편집기로 고친 글(rich)이 정적 글을 이기고, 예전 공지(글만)는 정적 글에 진다.

/**
 * 편집기 블록 → 사이트 꼭지 (정적 글과 같은 모양: 소제목 → 이미지 → 문단).
 * 소제목이 새 꼭지를 연다. 이미 이미지나 글이 있는 꼭지에 이미지가 오면 소제목 없는 꼭지를 새로 연다 (그려지는 순서를 지키려고).
 */
export function blocksToSections(blocks: readonly NoticeBlock[]): DevNoteSection[] {
  const out: DevNoteSection[] = [];
  for (const b of blocks) {
    const cur = out.at(-1);
    if (b.t === "h") out.push({ img: null, heading: b.text, text: "" });
    else if (b.t === "img") {
      if (cur && !cur.img && !cur.text) cur.img = b.src;
      else out.push({ img: b.src, heading: "", text: "" });
    } else if (cur) cur.text = cur.text ? `${cur.text}\n\n${b.text}` : b.text;
    else out.push({ img: null, heading: "", text: b.text });
  }
  return out;
}

/**
 * 공지 하나 → 개발자 노트.
 *  - 편집기로 쓴 글(rich): body가 첫 문단, 요약·대표 이미지는 공지에, 꼭지·맺음말은 doc에 (목록 화면은 doc 없이 부른다)
 *  - 예전 공지: 본문 첫 문단을 머리글로, 나머지를 본문 한 꼭지로
 */
export function noticeToNote(n: Notice, doc?: NoticeDoc | null): DevNote {
  if (n.rich || n.summary || n.hero)
    return {
      id: n.id,
      title: n.title,
      date: todayKst(n.createdAt),
      createdAt: n.createdAt,
      pinned: n.pinned,
      hero: n.hero ?? null,
      ...(n.summary ? { summary: n.summary } : {}),
      intro: n.body.trim(),
      ...(doc?.callout ? { callout: doc.callout } : {}),
      sections: doc ? blocksToSections(doc.blocks) : [],
      outro: doc?.outro ?? "",
      fromStore: true,
    };
  const paras = n.body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const [intro = "", ...rest] = paras;
  return {
    id: n.id,
    title: n.title,
    date: todayKst(n.createdAt),
    createdAt: n.createdAt,
    pinned: n.pinned,
    hero: null,
    intro,
    sections: rest.length ? [{ img: null, heading: "", text: rest.join("\n\n") }] : [],
    outro: "",
    fromStore: true,
  };
}

/** 정적 글 → 편집기 블록 (관리자 「고치기」). 고정 글(편지 모양)은 원래 꼭지 이미지를 그리지 않으니 빼서 모양을 그대로 둔다 */
export function noteToBlocks(n: DevNote): NoticeBlock[] {
  const out: NoticeBlock[] = [];
  for (const s of n.sections) {
    if (s.heading) out.push({ t: "h", text: s.heading });
    if (s.img && !n.pinned) out.push({ t: "img", src: s.img });
    if (s.text.trim()) out.push({ t: "p", text: s.text });
  }
  return out;
}

/** 정적 글 + 저장소 공지 → 최신 순 (고정 여부는 목록 화면이 따로 다룬다) */
export function mergeDevNotes(statics: readonly DevNote[], notices: readonly Notice[]): DevNote[] {
  const edited = new Set(notices.filter((n) => n.rich).map((n) => n.id));
  const known = new Set(statics.map((s) => s.id));
  const extra = notices.filter((n) => n.rich || !known.has(n.id)).map((n) => noticeToNote(n));
  return [...statics.filter((s) => !edited.has(s.id)), ...extra].sort((a, b) => b.createdAt - a.createdAt);
}
